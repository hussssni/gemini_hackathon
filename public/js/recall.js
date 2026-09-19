import { MEMORY } from "./config.js";
import { estimatePosition } from "./graph.js";
import { isFork, optionState } from "./explore.js";
import { relativeSide } from "./guidance.js";

// What the model is told about the past: which remembered places to compare
// the pan against, and the map in the terms it needs to reason with.

const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

/**
 * Picks which remembered places to send photos of. Sending everywhere would be
 * too much payload, so the place being deliberately walked back to goes first,
 * then the places nearest to where dead reckoning says the explorer is now.
 * Those are the ones they are most likely to be standing in.
 */
export function selectReferences(map, { limit = MEMORY.MAX_PLACES } = {}) {
  const here = estimatePosition(map, { nominal: true }) ?? { x: 0, y: 0 };
  const expected = map.pending?.expectedId ?? null;

  return map.nodes
    .map((node, index) => ({ node, index }))
    .filter(({ node }) => (node.references ?? []).length > 0)
    .sort((a, b) =>
      Number(b.node.id === expected) - Number(a.node.id === expected)
      || distance(a.node, here) - distance(b.node, here)
      || b.index - a.index)
    .slice(0, limit)
    .map(({ node }) => ({ id: node.id, images: node.references.slice(0, MEMORY.VIEWS_PER_PLACE) }));
}

/** How the explorer came to be here, which tells the model which way is back. */
export const serverArrival = (map) => (map.pending
  ? { from_node_id: map.pending.fromId, bearing: Math.round(map.pending.bearing) }
  : null);

/** The map trimmed to what the model needs, with every branch's fate spelled out. */
export const toServerNodes = (map) =>
  map.nodes.map((node) => ({
    id: node.id,
    description: node.description,
    features: node.features,
    is_current: node.id === map.currentNodeId,
    is_fork: isFork(node),
    times_visited: node.visits ?? 1,
    options: node.options.map((entry) => ({
      bearing: Math.round(entry.bearing),
      side: relativeSide(entry.bearing, node.arrivalBearing ?? 0),
      description: entry.description,
      state: optionState(map, node, entry),
      leads_to: entry.leadsTo ?? null,
    })),
  }));
