import { currentNode, findNode } from "./graph.js";
import {
  FAILED_STATES, exitsOf, isDeadEnd, isFork, optionState, placeLabel,
} from "./explore.js";
import { bearingDelta, directionSentence, relativeSide } from "./guidance.js";

// What gets said after each stop. Built here from the map, not left to the
// model, so "you've been here", "this is a fork" and "the left was a dead
// end" are always true to what was recorded. Gemini's own words only describe
// the surroundings and hazards, which is the part it can see and we cannot.

const FAILURE_PHRASES = Object.freeze({
  "dead-end": "was a dead end",
  "loops-back": "just loops back",
  exhausted: "has been fully tried",
});

const joinWords = (words) => (words.length <= 1
  ? words.join("")
  : `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}`);

const COUNTS = Object.freeze(["", "", "two", "three", "four", "five"]);

/** "behind, right, behind" becomes "right and two behind": repeats are counted,
 *  and anything behind comes last, after the ways in front. */
function describeSides(sides) {
  const groups = sides.reduce((found, side) => {
    const existing = found.find((group) => group.side === side);
    return existing
      ? found.map((group) => (group === existing ? { ...group, count: group.count + 1 } : group))
      : [...found, { side, count: 1 }];
  }, []);
  const ordered = [
    ...groups.filter((group) => group.side !== "behind"),
    ...groups.filter((group) => group.side === "behind"),
  ];
  return joinWords(ordered.map(({ side, count }) =>
    count > 1 ? `${COUNTS[count] ?? count} ${side}` : side));
}

// "bear left" is a fine direction but reads badly as an adjective.
const spokenSide = (side) => side.replace("bear ", "half ");
const pathName = (side) => {
  if (side === "behind") return "the path behind you";
  if (side === "ahead") return "the path ahead";
  return side.startsWith("bear ") ? `the path ${spokenSide(side)}` : `the ${side} path`;
};
const capitalise = (text) => text.charAt(0).toUpperCase() + text.slice(1);

/** The way the explorer is facing at this place, for naming left and right. */
const referenceBearing = (map, node) =>
  map.lastEvent?.arrivalBearing ?? node.arrivalBearing ?? map.heading;

function placeSentence(map, node, reference) {
  const event = map.lastEvent?.type;
  const label = placeLabel(map, node.id);
  if (event === "revisit") return `You've been here before. This is ${label}.`;
  if (event === "resurvey") return "";
  if (isDeadEnd(node)) return "Dead end, no way on from here.";
  if (!isFork(node)) return "";
  const sides = exitsOf(node)
    .map((entry) => ({ entry, delta: bearingDelta(entry.bearing, reference) }))
    .sort((a, b) => a.delta - b.delta)
    .map(({ entry }) => spokenSide(relativeSide(entry.bearing, reference)));
  return `You're at ${label}. Paths go ${describeSides(sides)}.`;
}

/** On a return, the branches that already failed, so they are not retried. */
function historySentence(map, node, reference) {
  if (map.lastEvent?.type === "new") return "";
  return exitsOf(node)
    .map((entry) => ({ entry, state: optionState(map, node, entry) }))
    .filter(({ state }) => FAILED_STATES.has(state))
    .slice(0, 2)
    .map(({ entry, state }) =>
      `${capitalise(pathName(relativeSide(entry.bearing, reference)))} ${FAILURE_PHRASES[state]}.`)
    .join(" ");
}

function actionSentence(map, node, decision, reference, heading) {
  if (decision.kind === "stuck") {
    return "Every path I know of has been tried. Move somewhere new and look around again.";
  }
  const turn = directionSentence(bearingDelta(decision.bearing, heading), "");

  if (decision.kind === "backtrack") {
    const target = placeLabel(map, decision.targetId);
    const distance = decision.hops > 1 ? `, ${decision.hops} stops away` : "";
    return `Nothing left to try here. Head back to ${target}${distance}, where a path is still untried. ${turn}`;
  }

  const pick = isFork(node)
    ? `Take ${pathName(relativeSide(decision.bearing, reference))}. `
    : "";
  const why = decision.why ? capitalise(decision.why.trim().replace(/[.!]?$/, ".")) : "";
  return `${pick}${turn} ${why}`.trim();
}

/**
 * The full sentence spoken after a survey, leading with where you are, then
 * what failed before, then what to do, then what to watch out for.
 */
export function narrate({ map, decision, survey, heading }) {
  const node = currentNode(map) ?? findNode(map, map.currentNodeId);
  if (!node) return survey.spoken ?? "";
  const reference = referenceBearing(map, node);
  return [
    placeSentence(map, node, reference),
    historySentence(map, node, reference),
    actionSentence(map, node, decision, reference, heading),
    survey.spoken ?? "",
  ].filter(Boolean).join(" ");
}
