import { GRAPH, MEMORY, SENSORS } from "./config.js";
import { angleBetween, normalizeDegrees } from "./heading.js";

// The map is built by exploring, not recorded beforehand. Every new place is a
// node; every way out seen there is an option. An option is either an "exit"
// (a lead worth exploring) or the single "back" option, the way the explorer
// arrived. Walking an option links it to the node it led to. Everything here
// returns new frozen objects rather than mutating.

const freeze = Object.freeze;
const freezeNode = (node) => freeze({
  ...node,
  options: freeze(node.options.map((entry) => freeze({ ...entry }))),
  references: freeze([...(node.references ?? [])]),
});

export const emptyMap = () => freeze({
  nodes: freeze([]),
  currentNodeId: null,
  heading: 0,
  steps: 0,
  // Live step count at the last stop. Null until one is recorded this session,
  // so a restored map does not measure a walk against a stale counter.
  stepsAtStop: null,
  // The option the explorer was sent down and has not yet arrived from.
  pending: null,
  lastEvent: null,
});

/** Rebuilds a saved map. Position and links come back; the live walk does not. */
export const fromSaved = (saved) => freeze({
  ...emptyMap(),
  nodes: freeze(saved.nodes.map(freezeNode)),
  currentNodeId: saved.currentNodeId ?? null,
});

export const findNode = (map, id) => map.nodes.find((node) => node.id === id) ?? null;
export const currentNode = (map) => findNode(map, map.currentNodeId);

const nodeId = (index) => `n${index + 1}`;
const gap = (a, b) => Math.abs(angleBetween(a, b));

export const stepsSinceStop = (map) =>
  map.stepsAtStop === null ? 0 : Math.max(0, map.steps - map.stepsAtStop);

const toPoint = (from, heading, meters) => {
  const radians = (heading * Math.PI) / 180;
  return { x: from.x + Math.sin(radians) * meters, y: from.y - Math.cos(radians) * meters };
};

/**
 * Where the explorer probably is now, by dead reckoning from the last stop
 * along the way they were sent. With `nominal`, a walk the step counter missed
 * still counts as one typical leg, which is what node placement needs.
 */
export function estimatePosition(map, { nominal = false } = {}) {
  const from = currentNode(map);
  if (!from) return null;
  const walked = stepsSinceStop(map);
  const meters = walked > 0
    ? walked * SENSORS.STRIDE_METERS
    : nominal ? SENSORS.NOMINAL_LEG_METERS : 0;
  return toPoint(from, map.pending?.bearing ?? map.heading, meters);
}

const withNodes = (map, nodes) => freeze({ ...map, nodes: freeze(nodes.map(freezeNode)) });

const updateNode = (nodes, id, change) =>
  nodes.map((node) => (node.id === id ? { ...node, ...change(node) } : node));

/** Picks which pan option is the way the explorer came, if any. */
function findWayBack(options, backBearing) {
  if (backBearing === null) return -1;
  const scored = options
    .map((entry, index) => ({ index, flagged: entry.is_way_back, off: gap(entry.bearing, backBearing) }))
    .filter(({ flagged, off }) => flagged || off <= GRAPH.SAME_DIRECTION_DEGREES)
    // Gemini's own "that is where you came from" beats compass proximity:
    // drift moves bearings, it does not move the path.
    .sort((a, b) => Number(b.flagged) - Number(a.flagged) || a.off - b.off);
  return scored[0]?.index ?? -1;
}

/** Collapses exits the pan saw twice from neighbouring photos. */
function dedupe(options) {
  const ranked = [...options].sort((a, b) => (b.promise ?? 0) - (a.promise ?? 0));
  return ranked
    .reduce((kept, entry) =>
      kept.some((other) => gap(other.bearing, entry.bearing) <= GRAPH.DUPLICATE_EXIT_DEGREES)
        ? kept
        : [...kept, entry], [])
    .slice(0, GRAPH.MAX_OPTIONS);
}

const exitFrom = (entry, id) => ({
  id,
  kind: "exit",
  bearing: normalizeDegrees(Math.round(entry.bearing)),
  description: entry.description,
  promise: entry.promise ?? 0,
  status: "unexplored",
  leadsTo: null,
  loopsBack: false,
});

function buildOptions(surveyOptions, arrival) {
  const backBearing = arrival ? normalizeDegrees(arrival.bearing + 180) : null;
  const backIndex = findWayBack(surveyOptions, backBearing);
  const exits = dedupe(surveyOptions.filter((_, index) => index !== backIndex))
    .map((entry, index) => exitFrom(entry, `o${index + 1}`));

  if (!arrival) return exits;
  const seen = surveyOptions[backIndex];
  return [...exits, {
    id: "back",
    kind: "back",
    bearing: normalizeDegrees(Math.round(seen?.bearing ?? backBearing)),
    description: seen?.description ?? "The way you came",
    promise: 0,
    status: "taken",
    leadsTo: arrival.fromId,
    loopsBack: false,
  }];
}

/** Records where the option just walked actually went. */
const settlePending = (nodes, pending, toId, loopsBack) => {
  if (!pending) return nodes;
  return updateNode(nodes, pending.fromId, (node) => ({
    options: node.options.map((entry) => {
      if (entry.id !== pending.optionId) return entry;
      // Retracing a known link teaches nothing new about it.
      if (entry.leadsTo === toId) return entry;
      return { ...entry, status: "taken", leadsTo: toId, loopsBack };
    }),
  }));
};

/** Folds a fresh pan into a place already on the map: new exits are added,
 *  and ones already known get the new promise score. */
function mergeOptions(existing, surveyOptions) {
  const fresh = dedupe(surveyOptions.filter((entry) => !entry.is_way_back));
  return fresh.reduce((options, entry) => {
    const match = options
      .map((known, index) => ({ index, off: gap(known.bearing, entry.bearing) }))
      .filter(({ off }) => off <= GRAPH.MERGE_DEGREES)
      .sort((a, b) => a.off - b.off)[0];
    if (match) {
      return options.map((known, index) =>
        index === match.index ? { ...known, promise: entry.promise ?? known.promise } : known);
    }
    if (options.length >= GRAPH.MAX_OPTIONS) return options;
    return [...options, exitFrom(entry, `o${options.length + 1}`)];
  }, existing);
}

/**
 * Walking from A into known place K proves a path from K back to A. Mark the
 * matching untried exit at K as that path, so the far end of a loop is not
 * left looking like a fresh lead.
 */
function linkReturn(options, arrival) {
  if (!arrival || options.some((entry) => entry.leadsTo === arrival.fromId)) return options;
  const backBearing = normalizeDegrees(arrival.bearing + 180);
  const match = options
    .map((entry, index) => ({ entry, index, off: gap(entry.bearing, backBearing) }))
    .filter(({ entry, off }) => entry.status === "unexplored" && off <= GRAPH.SAME_DIRECTION_DEGREES)
    .sort((a, b) => a.off - b.off)[0];
  if (match) {
    return options.map((entry, index) => index === match.index
      ? { ...entry, status: "taken", leadsTo: arrival.fromId, loopsBack: true }
      : entry);
  }
  return [...options, {
    ...exitFrom({ bearing: backBearing, description: "Path back the way you came", promise: 0 }, `o${options.length + 1}`),
    status: "taken",
    leadsTo: arrival.fromId,
    loopsBack: true,
  }];
}

/** Keeps a couple of old views and adds the newest, so a place stays
 *  recognisable from more than the one angle it was first seen at. */
const mergeReferences = (old, fresh) =>
  [...fresh.slice(0, 1), ...old].slice(0, MEMORY.VIEWS_PER_PLACE);

/** The node Gemini says this is, if it is sure enough and the node is real. */
function recognise(map, survey) {
  const id = survey.same_as_node_id;
  if (!id || !findNode(map, id)) return null;
  const threshold = id === map.pending?.expectedId
    ? GRAPH.EXPECTED_MATCH_CONFIDENCE
    : GRAPH.MATCH_CONFIDENCE;
  return (survey.match_confidence ?? 0) >= threshold ? id : null;
}

const arrivalOf = (map) => (map.pending
  ? { fromId: map.pending.fromId, bearing: map.pending.bearing }
  : null);

const settled = (map, nodes, currentNodeId, { heading, steps }, type, arrival = null) => freeze({
  ...withNodes(map, nodes),
  currentNodeId,
  heading,
  steps,
  stepsAtStop: steps,
  pending: null,
  // The way they walked in, so this visit's left and right can be named.
  lastEvent: freeze({ type, nodeId: currentNodeId, arrivalBearing: arrival?.bearing ?? null }),
});

/** Records a survey as a new node, or folds it into one already on the map. */
export function addSurvey(map, survey, motion) {
  const { references = [] } = motion;
  const surveyOptions = survey.options ?? [];
  const knownId = recognise(map, survey);

  if (knownId && knownId === map.currentNodeId) {
    // Looked again without going anywhere: refresh, and forget the walk.
    const nodes = updateNode(map.nodes, knownId, (node) => ({
      options: mergeOptions(node.options, surveyOptions),
      references: mergeReferences(node.references, references),
      isGoal: node.isGoal || survey.arrived === true,
    }));
    return settled(map, nodes, knownId, motion, "resurvey");
  }

  const arrival = arrivalOf(map);

  if (knownId) {
    const linked = settlePending(map.nodes, map.pending, knownId, true);
    const nodes = updateNode(linked, knownId, (node) => ({
      options: mergeOptions(linkReturn(node.options, arrival), surveyOptions),
      references: mergeReferences(node.references, references),
      visits: (node.visits ?? 1) + 1,
      isGoal: node.isGoal || survey.arrived === true,
    }));
    return settled(map, nodes, knownId, motion, "revisit", arrival);
  }

  const id = nodeId(map.nodes.length);
  const node = {
    id,
    description: survey.here?.description ?? "",
    features: survey.here?.features ?? [],
    distinctiveness: survey.here?.distinctiveness ?? 0,
    options: buildOptions(surveyOptions, arrival),
    references: references.slice(0, MEMORY.VIEWS_PER_PLACE),
    visits: 1,
    arrivedFrom: arrival?.fromId ?? null,
    // Left and right at this place are named relative to the way in. At the
    // very first stop there is no way in, so use the way the explorer faced
    // when the pan began, not wherever the phone ended up afterwards.
    arrivalBearing: arrival?.bearing ?? motion.facing ?? motion.heading,
    isGoal: survey.arrived === true,
    steps: motion.steps,
    ...(map.nodes.length === 0 ? { x: 0, y: 0 } : estimatePosition(map, { nominal: true })),
  };

  const nodes = [...settlePending(map.nodes, map.pending, id, false), node];
  return settled(map, nodes, id, motion, "new", arrival);
}

/** Sends the explorer down one way out. It is settled at the next stop. */
export const commitChoice = (map, { bearing, optionId = null, expectedId = null }) =>
  map.currentNodeId === null
    ? map
    : freeze({
      ...map,
      pending: freeze({ fromId: map.currentNodeId, optionId, bearing, expectedId }),
    });

export const clearPending = (map) => (map.pending ? freeze({ ...map, pending: null }) : map);

export const trackMotion = (map, { steps, heading }) =>
  steps === map.steps && heading === map.heading
    ? map
    : freeze({ ...map, steps, heading });
