import { SENSORS } from "./config.js";

// The map is built by exploring, not recorded beforehand. Every survey adds a
// node; every option seen there is a lead, marked taken once it is walked.
// Everything here returns new objects rather than mutating.

export const DIRECTION_OFFSETS = Object.freeze({
  ahead: 0,
  right: 90,
  back: 180,
  left: -90,
});

export const emptyMap = () =>
  Object.freeze({ nodes: Object.freeze([]), currentNodeId: null, heading: 0, steps: 0 });

const nodeId = (index) => `n${index + 1}`;

export const findNode = (map, id) => map.nodes.find((node) => node.id === id) ?? null;

export const currentNode = (map) => findNode(map, map.currentNodeId);

/** Where a node's unexplored option points, as an absolute compass heading. */
export const optionHeading = (node, option) =>
  (node.heading + DIRECTION_OFFSETS[option.direction] + 360) % 360;

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
  const heading = taken ? optionHeading(previous, taken) : previous.heading;
  return toPoint(previous, heading, stepsWalked * SENSORS.STRIDE_METERS);
};

const buildOptions = (options = []) =>
  Object.freeze(options.map((option, index) =>
    Object.freeze({
      id: `o${index + 1}`,
      direction: option.direction,
      description: option.description,
      promise: option.promise ?? 0,
      status: "unexplored",
    })));

/** Marks the option the explorer was told to take, so the next node links to it. */
export const commitRecommendation = (map, direction) => {
  const node = currentNode(map);
  if (!node || !direction) return map;

  let marked = false;
  const options = node.options.map((option) => {
    if (marked || option.direction !== direction || option.status !== "unexplored") return option;
    marked = true;
    return Object.freeze({ ...option, status: "taken-pending" });
  });

  return Object.freeze({
    ...map,
    nodes: Object.freeze(map.nodes.map((entry) =>
      entry.id === node.id ? Object.freeze({ ...entry, options: Object.freeze(options) }) : entry)),
  });
};

const settleTaken = (nodes, fromId, toId) =>
  nodes.map((node) => {
    if (node.id !== fromId) return node;
    return Object.freeze({
      ...node,
      options: Object.freeze(node.options.map((option) =>
        option.status === "taken-pending"
          ? Object.freeze({ ...option, status: "taken", leadsTo: toId })
          : option)),
    });
  });

/** Records a survey as a new node, or folds it into one already on the map. */
export const addSurvey = (map, survey, { heading, steps }) => {
  const previousId = map.currentNodeId;
  const stepsWalked = Math.max(0, steps - map.steps);
  const known = survey.same_as_node_id ? findNode(map, survey.same_as_node_id) : null;

  if (known) {
    // Loop closure: link back instead of adding a duplicate place.
    return Object.freeze({
      ...map,
      nodes: Object.freeze(settleTaken(map.nodes, previousId, known.id)),
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
    heading,
    steps,
    ...position,
  });

  return Object.freeze({
    ...map,
    nodes: Object.freeze([...settleTaken(map.nodes, previousId, node.id), node]),
    currentNodeId: node.id,
    heading,
    steps,
  });
};

export const trackMotion = (map, { steps, heading }) =>
  steps === map.steps && heading === map.heading
    ? map
    : Object.freeze({ ...map, steps, heading });

export const unexploredCount = (map) =>
  map.nodes.reduce(
    (total, node) => total + node.options.filter((option) => option.status === "unexplored").length,
    0,
  );

/** Trims the map to what the model needs, keeping the payload small and honest. */
export const toServerNodes = (map) =>
  map.nodes.map((node) => ({
    id: node.id,
    description: node.description,
    features: node.features,
    steps: node.steps,
    is_current: node.id === map.currentNodeId,
    options: node.options.map((option) => ({
      direction: option.direction,
      description: option.description,
      status: option.status === "taken-pending" ? "taken" : option.status,
      leads_to: option.leadsTo ?? null,
    })),
  }));
