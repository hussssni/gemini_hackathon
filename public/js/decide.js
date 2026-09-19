import { GRAPH } from "./config.js";
import { currentNode } from "./graph.js";
import { exitsOf, findRoute, hasUntried } from "./explore.js";
import { angleBetween } from "./heading.js";

/**
 * Picks where to go next. Gemini's judgement decides which untried way looks
 * best, but the rules are enforced here, over the map, where they cannot be
 * forgotten: never the way back, never a branch already known to fail, and
 * when nothing is left here, the shortest walk to a fork that still has
 * something untried.
 *
 * Returns one of:
 *   { kind: "arrived" }
 *   { kind: "explore",   bearing, optionId, expectedId: null, why, followedModel }
 *   { kind: "backtrack", bearing, optionId, expectedId, targetId, hops }
 *   { kind: "stuck" }
 */
export function decide(map, survey) {
  if (survey.arrived) return { kind: "arrived" };

  const node = currentNode(map);
  if (!node) return { kind: "stuck" };

  const untried = exitsOf(node).filter((entry) => entry.status === "unexplored");
  if (untried.length > 0) return explore(untried, survey.recommendation);

  const route = findRoute(map, node.id, hasUntried);
  if (!route) return { kind: "stuck" };

  const [first] = route;
  return {
    kind: "backtrack",
    bearing: first.bearing,
    optionId: first.optionId,
    expectedId: first.to,
    targetId: route[route.length - 1].to,
    hops: route.length,
  };
}

function explore(untried, recommendation) {
  const suggested = Number.isFinite(recommendation?.bearing)
    ? untried
      .map((entry) => ({ entry, off: Math.abs(angleBetween(entry.bearing, recommendation.bearing)) }))
      .filter(({ off }) => off <= GRAPH.MERGE_DEGREES)
      .sort((a, b) => a.off - b.off)[0]?.entry
    : undefined;

  const best = untried.reduce((top, entry) => (entry.promise > top.promise ? entry : top));
  // Gemini's pick and its own scores sometimes disagree. A small gap is a
  // judgement call worth deferring to; a large one is a slip.
  const trusted = suggested
    && suggested.promise >= best.promise - GRAPH.PICK_PROMISE_MARGIN;
  const chosen = trusted ? suggested : best;

  return {
    kind: "explore",
    bearing: chosen.bearing,
    optionId: chosen.id,
    expectedId: null,
    why: trusted ? recommendation.why : chosen.description,
    followedModel: Boolean(trusted),
  };
}
