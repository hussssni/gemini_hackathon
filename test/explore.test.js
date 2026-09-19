import { test } from "node:test";
import assert from "node:assert/strict";
import { addSurvey, commitChoice, currentNode, emptyMap, findNode, trackMotion } from "../public/js/graph.js";
import {
  findRoute, forkNumber, hasUntried, isFork, optionState, placeLabel, untriedCount,
} from "../public/js/explore.js";
import { decide } from "../public/js/decide.js";
import { at, option, survey } from "./helpers.js";

const go = (map, bearing, steps) => {
  const chosen = currentNode(map).options.find((entry) => entry.bearing === bearing);
  return trackMotion(
    commitChoice(map, { bearing, optionId: chosen.id, expectedId: chosen.leadsTo }),
    { steps, heading: bearing },
  );
};

const optionAt = (map, id, bearing) =>
  findNode(map, id).options.find((entry) => entry.bearing === bearing);

// n1 is a fork (0 and 90). Going 0 reaches n2, a dead end.
const forkThenDeadEnd = () => {
  let map = addSurvey(emptyMap(), survey({ options: [option(0), option(90)] }), at(0));
  map = go(map, 0, 10);
  return addSurvey(map, survey({ options: [option(180)] }), at(0, 10));
};

test("a place with two or more exits is a fork, numbered in order", () => {
  const map = forkThenDeadEnd();
  assert.equal(isFork(findNode(map, "n1")), true);
  assert.equal(isFork(findNode(map, "n2")), false);
  assert.equal(forkNumber(map, "n1"), 1);
  assert.equal(forkNumber(map, "n2"), null);
  assert.equal(placeLabel(map, "n1"), "fork 1");
  assert.equal(placeLabel(map, "n2"), "place 2");
});

test("branch states say what came of each way out", () => {
  const map = forkThenDeadEnd();
  const n1 = findNode(map, "n1");
  assert.equal(optionState(map, n1, optionAt(map, "n1", 0)), "dead-end");
  assert.equal(optionState(map, n1, optionAt(map, "n1", 90)), "untried");
  const n2 = findNode(map, "n2");
  assert.equal(optionState(map, n2, n2.options[0]), "way-back");
  assert.equal(untriedCount(map), 1);
});

test("a branch whose every onward path failed is exhausted", () => {
  let map = addSurvey(emptyMap(), survey({ options: [option(0), option(90)] }), at(0));
  map = go(map, 0, 10);
  map = addSurvey(map, survey({ options: [option(180), option(0)] }), at(0, 10));
  map = go(map, 0, 20);
  map = addSurvey(map, survey({ options: [option(180)] }), at(0, 20));
  const n1 = findNode(map, "n1");
  assert.equal(optionState(map, n1, optionAt(map, "n1", 0)), "exhausted");
});

test("the route back runs to the nearest place with something untried", () => {
  const map = forkThenDeadEnd();
  const route = findRoute(map, "n2", (node) => hasUntried(node));
  assert.equal(route.length, 1);
  assert.equal(route[0].to, "n1");
  assert.equal(route[0].bearing, 180);
});

test("decide follows Gemini's pick when it is a real untried exit", () => {
  const map = addSurvey(emptyMap(), survey({ options: [option(0), option(90)] }), at(0));
  const result = decide(map, survey({ options: [option(0), option(90)], pick: 2 }));
  assert.equal(result.kind, "explore");
  assert.equal(result.bearing, 90);
  assert.equal(result.followedModel, true);
});

test("decide refuses to send you back the way you came", () => {
  let map = addSurvey(emptyMap(), survey({ options: [option(0)] }), at(0));
  map = go(map, 0, 10);
  const pan = survey({ options: [option(180, { promise: 0.9 }), option(60, { promise: 0.2 })], pick: 1 });
  map = addSurvey(map, pan, at(0, 10));
  const result = decide(map, pan);
  assert.equal(result.kind, "explore");
  assert.equal(result.bearing, 60);
  assert.equal(result.followedModel, false);
});

test("at a dead end, decide backtracks to the fork with an untried branch", () => {
  const map = forkThenDeadEnd();
  const result = decide(map, survey({ options: [option(180)] }));
  assert.equal(result.kind, "backtrack");
  assert.equal(result.bearing, 180);
  assert.equal(result.expectedId, "n1");
  assert.equal(result.targetId, "n1");
});

test("when nothing anywhere is untried, decide says so", () => {
  let map = addSurvey(emptyMap(), survey({ options: [option(0)] }), at(0));
  map = go(map, 0, 10);
  map = addSurvey(map, survey({ options: [option(180)] }), at(0, 10));
  assert.equal(decide(map, survey()).kind, "stuck");
});

test("arrival overrides everything", () => {
  const map = forkThenDeadEnd();
  assert.equal(decide(map, survey({ arrived: true })).kind, "arrived");
});

test("a backtrack walk is recognised at a lower bar and not double-linked", () => {
  let map = forkThenDeadEnd();
  const back = decide(map, survey());
  map = trackMotion(commitChoice(map, back), { steps: 20, heading: 180 });
  map = addSurvey(map, survey({ options: [option(0), option(90)], sameAs: "n1", confidence: 0.45 }), at(180, 20));
  assert.equal(map.currentNodeId, "n1");
  assert.equal(map.nodes.length, 2);
  assert.equal(optionAt(map, "n1", 90).status, "unexplored");
  assert.equal(decide(map, survey({ options: [option(90)], pick: 1 })).bearing, 90);
});

test("a pick clearly less promising than another untried way is overruled", () => {
  const pan = survey({ options: [option(270, { promise: 0.3 }), option(90, { promise: 0.2 }), option(180, { promise: 0.1 })], pick: 2 });
  const map = addSurvey(emptyMap(), pan, at(0));
  assert.equal(decide(map, pan).bearing, 90, "0.1 behind is within the margin");
  const lopsided = survey({ options: [option(270, { promise: 0.8 }), option(90, { promise: 0.2 })], pick: 2 });
  const other = addSurvey(emptyMap(), lopsided, at(0));
  const result = decide(other, lopsided);
  assert.equal(result.bearing, 270);
  assert.equal(result.followedModel, false);
});
