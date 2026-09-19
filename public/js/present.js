import { currentNode } from "./graph.js";
import { forkCount, isFork, optionState, placeLabel, untriedCount } from "./explore.js";
import { bearingDelta, relativeSide } from "./guidance.js";

// Turns the map and the latest decision into what the screen shows. Pure, so
// the words on screen and the words spoken come from the same facts.

export const stats = (map) => ({
  places: map.nodes.length,
  forks: forkCount(map),
  untried: untriedCount(map),
});

const isPicked = (decision, entry) => decision?.optionId
  ? decision.optionId === entry.id
  : Number.isFinite(decision?.bearing) && Math.abs(bearingDelta(entry.bearing, decision.bearing)) < 1;

/** The panel for the place just surveyed: its branches, left to right. */
export function surveyView({ map, survey, decision, spoken }) {
  const node = currentNode(map);
  if (!node) return null;
  const reference = map.lastEvent?.arrivalBearing ?? node.arrivalBearing ?? map.heading;

  const rows = node.options
    .map((entry) => ({ entry, delta: bearingDelta(entry.bearing, reference) }))
    .sort((a, b) => a.delta - b.delta)
    .map(({ entry }) => ({
      id: entry.id,
      side: relativeSide(entry.bearing, reference),
      state: optionState(map, node, entry),
      description: entry.description,
      promise: entry.promise,
      isPick: isPicked(decision, entry),
    }));

  const where = isFork(node) || map.lastEvent?.type !== "new"
    ? placeLabel(map, node.id)
    : `${map.nodes.length} mapped`;
  const sure = `${Math.round((survey.confidence ?? 0) * 100)}% sure`;
  const badge = survey.arrived ? "Arrived" : `${where[0].toUpperCase()}${where.slice(1)} · ${sure}`;
  const tone = survey.arrived ? "good" : (survey.confidence ?? 0) < 0.4 ? "warn" : "neutral";

  return { badge, tone, spoken, here: survey.here?.description ?? "", rows };
}

/** Short text on the camera marker for where it is sending you. */
export function markerLabel(map, decision) {
  if (decision.kind === "backtrack") return `Back to ${placeLabel(map, decision.targetId)}`;
  const node = currentNode(map);
  if (node && isFork(node)) {
    const reference = map.lastEvent?.arrivalBearing ?? node.arrivalBearing ?? map.heading;
    return `${relativeSide(decision.bearing, reference)} path`;
  }
  return "Go this way";
}

const plural = (count, word) => `${count} ${word}${count === 1 ? "" : "s"}`;

/** The map in words, for anyone who cannot make out the drawing. */
export function mapSummary(map) {
  if (map.nodes.length === 0) return "Map: nothing mapped yet.";
  const { places, forks, untried } = stats(map);
  const here = map.currentNodeId ? ` You are at ${placeLabel(map, map.currentNodeId)}.` : "";
  return `Map: ${plural(places, "place")}, ${plural(forks, "fork")}, ${plural(untried, "untried path")}.${here}`;
}
