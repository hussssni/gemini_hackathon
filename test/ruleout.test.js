import { test } from "node:test";
import assert from "node:assert/strict";
import { addSurvey, commitChoice, currentNode, emptyMap, setRuledOut } from "../public/js/graph.js";
import { optionState, untriedCount } from "../public/js/explore.js";
import { decide } from "../public/js/decide.js";
import { narrate } from "../public/js/narrate.js";
import { surveyView } from "../public/js/present.js";
import { toServerNodes } from "../public/js/recall.js";
import { at, option, survey } from "./helpers.js";

const fork = () => {
  const pan = survey({ options: [option(270, { promise: 0.9 }), option(90, { promise: 0.4 })], pick: 1 });
  const map = addSurvey(emptyMap(), pan, at(0));
  const decision = decide(map, pan);
  return { pan, map: commitChoice(map, decision), decision };
};

test("ruling out the pick cancels the walk and the next decision avoids it", () => {
  const { pan, map, decision } = fork();
  const ruled = setRuledOut(map, "n1", decision.optionId, true);
  assert.equal(ruled.pending, null);
  const node = currentNode(ruled);
  const left = node.options.find((entry) => entry.bearing === 270);
  assert.equal(optionState(ruled, node, left), "ruled-out");
  assert.equal(untriedCount(ruled), 1);
  assert.equal(decide(ruled, pan).bearing, 90);
});

test("ruling out another path keeps the current walk", () => {
  const { map } = fork();
  const right = currentNode(map).options.find((entry) => entry.bearing === 90);
  assert.notEqual(setRuledOut(map, "n1", right.id, true).pending, null);
});

test("undo puts the path back as untried", () => {
  const { map, decision } = fork();
  const undone = setRuledOut(setRuledOut(map, "n1", decision.optionId, true), "n1", decision.optionId, false);
  assert.equal(untriedCount(undone), 2);
});

test("only untried paths can be ruled out", () => {
  const { map } = fork();
  assert.equal(setRuledOut(map, "n1", "nope", true), map);
  assert.equal(setRuledOut(map, "n9", "o1", true), map);
});

test("ruling out everything leaves nothing to explore", () => {
  const { pan, map } = fork();
  const ids = currentNode(map).options.map((entry) => entry.id);
  const ruled = ids.reduce((acc, id) => setRuledOut(acc, "n1", id, true), map);
  assert.equal(decide(ruled, pan).kind, "stuck");
});

test("a re-decision is said briefly, without repeating where you are", () => {
  const { pan, map, decision } = fork();
  const ruled = setRuledOut(map, "n1", decision.optionId, true);
  const text = narrate({ map: ruled, decision: decide(ruled, pan), survey: pan, heading: 0, brief: true });
  assert.match(text, /^Okay, not that way\./);
  assert.doesNotMatch(text, /You're at fork/);
  assert.match(text, /right path/);
});

test("the panel and the model both see a ruled-out path", () => {
  const { pan, map, decision } = fork();
  const ruled = setRuledOut(map, "n1", decision.optionId, true);
  const rows = surveyView({ map: ruled, survey: pan, decision: decide(ruled, pan), spoken: "" }).rows;
  const left = rows.find((row) => row.side === "left");
  assert.equal(left.state, "ruled-out");
  assert.equal(left.id, decision.optionId);
  assert.ok(toServerNodes(ruled)[0].options.some((entry) => entry.state === "ruled-out"));
});
