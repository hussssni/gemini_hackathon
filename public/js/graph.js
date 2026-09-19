import { MEMORY, SENSORS } from "./config.js";

// The map is built by exploring, not recorded beforehand. Every survey adds a
// node; every option seen there is a lead, marked taken once it is walked.
// Everything here returns new objects rather than mutating.

export const emptyMap = () =>
  Object.freeze({ nodes: Object.freeze([]), currentNodeId: null, heading: 0, steps: 0 });

/** Rebuilds a map saved on a previous visit. Position and links come back with
 *  it; the live step count does not, since the walk that produced it is over. */
export const fromSaved = (saved) =>
  Object.freeze({
    nodes: Object.freeze(saved.nodes.map((node) =>
      Object.freeze({ ...node, options: Object.freeze(node.options.map(Object.freeze)) }))),
    currentNodeId: saved.currentNodeId,
    heading: 0,
    steps: 0,
  });

const nodeId = (index) => `n${index + 1}`;

export const findNode = (map, id) => map.nodes.find((node) => node.id === id) ?? null;

export const currentNode = (map) => findNode(map, map.currentNodeId);

/** Options already carry an absolute bearing, measured when the pan was shot. */
export const optionHeading = (_node, option) => option.bearing;

const toPoint = (from, heading, distanceMeters) => {
  const radians = (heading * Math.PI) / 180;
  return {
    x: from.x + Math.sin(radians) * distanceMeters,
    y: from.y - Math.cos(radians) * distanceMeters,
  };
};

/**
 * Places a new node by dead reckoning from the node just left: the steps walked
 * since, along the heading of the option that was followed.
 */
const placeNode = (map, stepsWalked) => {
  const previous = currentNode(map);
  if (!previous) return { x: 0, y: 0 };

  const taken = previous.options.find((option) => option.status === "taken-pending");
  const heading = taken ? taken.bearing : previous.heading;

  // Step detection fails on plenty of phones, and without a fallback every node
  // would land on the last one and the map would look like a single dot.
  const distance = stepsWalked > 0
    ? stepsWalked * SENSORS.STRIDE_METERS
    : SENSORS.NOMINAL_LEG_METERS;

  return toPoint(previous, heading, distance);
};

const buildOptions = (options = []) =>
  Object.freeze(options.map((option, index) =>
    Object.freeze({
      id: `o${index + 1}`,
      bearing: ((option.bearing % 360) + 360) % 360,
      description: option.description,
      promise: option.promise ?? 0,
      status: "unexplored",
    })));

/** Marks the option the explorer was told to take, so the next node links to it. */
export const commitRecommendation = (map, optionIndex) => {
  const node = currentNode(map);
  if (!node || !Number.isInteger(optionIndex)) return map;

  const options = node.options.map((option, index) =>
    index === optionIndex - 1 && option.status === "unexplored"
      ? Object.freeze({ ...option, status: "taken-pending" })
      : option);

  return Object.freeze({
    ...map,
    nodes: Object.freeze(map.nodes.map((entry) =>
      entry.id === node.id ? Object.freeze({ ...entry, options: Object.freeze(options) }) : entry)),
  });
};

/**
 * Records what came of the branch just walked. An option that led nowhere, or
 * looped back to somewhere already known, is not a lead any more — and saying
 * so is what stops an explorer trying the same wrong turn twice.
 */
const settleTaken = (nodes, fromId, toId, outcome) =>
  nodes.map((node) => {
    if (node.id !== fromId) return node;
    return Object.freeze({
      ...node,
      options: Object.freeze(node.options.map((option) =>
        option.status === "taken-pending"
          ? Object.freeze({ ...option, status: "taken", leadsTo: toId, outcome })
          : option)),
    });
  });

/** Records a survey as a new node, or folds it into one already on the map. */
export const addSurvey = (map, survey, { heading, steps, reference = null }) => {
  const previousId = map.currentNodeId;
  const stepsWalked = Math.max(0, steps - map.steps);
  const known = survey.same_as_node_id ? findNode(map, survey.same_as_node_id) : null;
  const isDeadEnd = (survey.options ?? []).length === 0;

  if (known) {
    // Loop closure: link back instead of adding a duplicate place, and record
    // that the branch merely came back to somewhere already mapped.
    return Object.freeze({
      ...map,
      nodes: Object.freeze(
        settleTaken(map.nodes, previousId, known.id, "loops-back")
          .map((node) => node.id === known.id
            ? Object.freeze({ ...node, visits: (node.visits ?? 1) + 1 })
            : node)),
      currentNodeId: known.id,
      heading,
      steps,
    });
  }

  const position = placeNode(map, stepsWalked);
  const node = Object.freeze({
    id: nodeId(map.nodes.length),
    description: survey.here.description,
    features: Object.freeze(survey.here.features ?? []),
    distinctiveness: survey.here.distinctiveness ?? 0,
    options: buildOptions(survey.options),
    reference,
    visits: 1,
    isDeadEnd,
    heading,
    steps,
    ...position,
  });

  return Object.freeze({
    ...map,
    nodes: Object.freeze([
      ...settleTaken(map.nodes, previousId, node.id, isDeadEnd ? "dead-end" : "open"),
      node,
    ]),
    currentNodeId: node.id,
    heading,
    steps,
  });
};

export const trackMotion = (map, { steps, heading }) =>
  steps === map.steps && heading === map.heading
    ? map
    : Object.freeze({ ...map, steps, heading });

/** Leads worth trying: never walked, and not already known to fail. */
export const unexploredCount = (map) =>
  map.nodes.reduce(
    (total, node) => total + node.options.filter((option) => option.status === "unexplored").length,
    0,
  );

/**
 * Picks which remembered places to send reference photos of. Everywhere would
 * be too much payload, so this favours the recently seen and the often visited:
 * the places an explorer is most likely to stumble back into.
 */
export const selectReferences = (map, limit = MEMORY.MAX_REFERENCES) =>
  map.nodes
    .filter((node) => typeof node.reference === "string" && node.reference.length > 0)
    .map((node, index) => ({ node, index }))
    .sort((a, b) => {
      const visits = (b.node.visits ?? 1) - (a.node.visits ?? 1);
      return visits !== 0 ? visits : b.index - a.index;
    })
    .slice(0, limit)
    .map(({ node }) => ({ id: node.id, image: node.reference }));

/** Trims the map to what the model needs, keeping the payload small and honest. */
export const toServerNodes = (map) =>
  map.nodes.map((node) => ({
    id: node.id,
    description: node.description,
    features: node.features,
    steps: node.steps,
    is_current: node.id === map.currentNodeId,
    times_visited: node.visits ?? 1,
    options: node.options.map((option) => ({
      bearing: Number.isFinite(option.bearing) ? Math.round(option.bearing) : 0,
      description: option.description,
      status: option.status === "taken-pending" ? "taken" : option.status,
      leads_to: option.leadsTo ?? null,
      outcome: option.outcome ?? null,
    })),
  }));
