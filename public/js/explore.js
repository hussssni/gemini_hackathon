import { findNode } from "./graph.js";
import { normalizeDegrees } from "./heading.js";

// Facts derived from the map rather than stored in it, so they can never drift
// out of step with it: which places are forks, what became of each branch, and
// how to get back to somewhere that still has something left to try.

export const exitsOf = (node) => node.options.filter((entry) => entry.kind === "exit");

/** A fork is anywhere with a real choice: two or more ways on, not counting back. */
export const isFork = (node) => exitsOf(node).length >= 2;

export const isDeadEnd = (node) => exitsOf(node).length === 0 && !node.isGoal;

export const hasUntried = (node) =>
  exitsOf(node).some((entry) => entry.status === "unexplored");

export const forkNumber = (map, id) => {
  const forks = map.nodes.filter(isFork);
  const index = forks.findIndex((node) => node.id === id);
  return index >= 0 ? index + 1 : null;
};

/** How a place is named aloud and on the map. */
export const placeLabel = (map, id) => {
  const fork = forkNumber(map, id);
  if (fork !== null) return `fork ${fork}`;
  return `place ${map.nodes.findIndex((node) => node.id === id) + 1}`;
};

/**
 * A place is exhausted when nothing reachable through its exits is untried.
 * `seen` stops the walk going round a loop forever; a branch that only leads
 * back into ground already being checked adds nothing new.
 */
export function isExhausted(map, id, seen = new Set()) {
  const node = findNode(map, id);
  if (!node || node.isGoal) return false;
  if (seen.has(id)) return true;
  const visited = new Set([...seen, id]);
  return exitsOf(node).every((entry) => {
    if (entry.status === "unexplored") return false;
    if (entry.loopsBack || !entry.leadsTo) return true;
    return isExhausted(map, entry.leadsTo, visited);
  });
}

/**
 * What came of a way out, in the terms the explorer cares about:
 *   untried    nobody has walked it
 *   ruled-out  the explorer said not that way
 *   way-back   the way they arrived
 *   dead-end   walked, and the place it led to has no way on
 *   loops-back walked, and it came out somewhere already mapped
 *   exhausted  walked, and everything beyond it has since been tried
 *   open       walked, and there is still something untried beyond it
 */
export function optionState(map, node, entry) {
  if (entry.kind === "back") return "way-back";
  if (entry.status === "unexplored") return "untried";
  if (entry.status === "ruled-out") return "ruled-out";
  if (entry.loopsBack) return "loops-back";
  const target = findNode(map, entry.leadsTo);
  if (!target) return "open";
  if (target.isGoal) return "open";
  if (isDeadEnd(target)) return "dead-end";
  return isExhausted(map, target.id, new Set([node.id])) ? "exhausted" : "open";
}

export const FAILED_STATES = Object.freeze(new Set(["dead-end", "loops-back", "exhausted", "ruled-out"]));

export const untriedCount = (map) =>
  map.nodes.reduce((total, node) =>
    total + exitsOf(node).filter((entry) => entry.status === "unexplored").length, 0);

export const forkCount = (map) => map.nodes.filter(isFork).length;

/**
 * Every walkable link out of a place. A link recorded only at the far end is
 * still walkable in reverse, at the opposite bearing.
 */
function neighbours(map, id) {
  const node = findNode(map, id);
  const direct = node.options
    .filter((entry) => entry.leadsTo && findNode(map, entry.leadsTo))
    .map((entry) => ({ from: id, to: entry.leadsTo, bearing: entry.bearing, optionId: entry.id }));
  const reverse = map.nodes
    .filter((other) => other.id !== id && !direct.some((link) => link.to === other.id))
    .flatMap((other) => other.options
      .filter((entry) => entry.leadsTo === id)
      .slice(0, 1)
      .map((entry) => ({
        from: id, to: other.id, bearing: normalizeDegrees(entry.bearing + 180), optionId: null,
      })));
  return [...direct, ...reverse];
}

/**
 * Shortest walk, in stops, from one place to the nearest other place that
 * satisfies `wanted`. Returns the links to walk in order, or null.
 */
export function findRoute(map, fromId, wanted) {
  const queue = [{ id: fromId, path: [] }];
  const visited = new Set([fromId]);
  while (queue.length > 0) {
    const { id, path } = queue.shift();
    const node = findNode(map, id);
    if (id !== fromId && wanted(node)) return path;
    neighbours(map, id)
      .filter((link) => !visited.has(link.to))
      .forEach((link) => {
        visited.add(link.to);
        queue.push({ id: link.to, path: [...path, link] });
      });
  }
  return null;
}
