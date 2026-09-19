import { test } from "node:test";
import assert from "node:assert/strict";
import {
  addSurvey, commitChoice, currentNode, emptyMap, estimatePosition, findNode,
  fromSaved, trackMotion,
} from "../public/js/graph.js";
import { at, option, survey } from "./helpers.js";

const exitsOf = (node) => node.options.filter((entry) => entry.kind === "exit");

const walk = (map, bearing, steps) => {
  const node = currentNode(map);
  const chosen = node.options.find((entry) => entry.bearing === bearing);
  return trackMotion(
    commitChoice(map, { bearing, optionId: chosen?.id ?? null, expectedId: chosen?.leadsTo ?? null }),
    { steps, heading: bearing },
  );
};

test("the first stop becomes the origin with every exit untried", () => {
  const map = addSurvey(emptyMap(), survey({ options: [option(0), option(90)] }), at(0));
  const node = currentNode(map);
  assert.equal(node.id, "n1");
  assert.deepEqual([node.x, node.y], [0, 0]);
  assert.equal(exitsOf(node).length, 2);
  assert.ok(node.options.every((entry) => entry.status === "unexplored"));
  assert.equal(map.lastEvent.type, "new");
});

test("the way you came is recorded as the way back, never as a new lead", () => {
  let map = addSurvey(emptyMap(), survey({ options: [option(0), option(90)] }), at(0));
  map = walk(map, 90, 10);
  // Standing at the new place, the pan sees the path behind (270) plus one more.
  map = addSurvey(map, survey({ options: [option(265), option(10)] }), at(90, 10));

  const node = currentNode(map);
  const back = node.options.find((entry) => entry.kind === "back");
  assert.equal(back.bearing, 265);
  assert.equal(back.leadsTo, "n1");
  assert.equal(exitsOf(node).length, 1);

  const first = findNode(map, "n1").options.find((entry) => entry.bearing === 90);
  assert.equal(first.status, "taken");
  assert.equal(first.leadsTo, "n2");
});

test("a way back is synthesised when the pan missed it", () => {
  let map = addSurvey(emptyMap(), survey({ options: [option(0)] }), at(0));
  map = walk(map, 0, 5);
  map = addSurvey(map, survey({ options: [option(90)] }), at(0, 5));
  const back = currentNode(map).options.find((entry) => entry.kind === "back");
  assert.equal(back.bearing, 180);
  assert.equal(back.leadsTo, "n1");
});

test("a flagged way back is trusted over a closer-looking exit", () => {
  let map = addSurvey(emptyMap(), survey({ options: [option(0)] }), at(0));
  map = walk(map, 0, 5);
  map = addSurvey(map, survey({
    options: [option(200), option(150, { is_way_back: true })],
  }), at(0, 5));
  const back = currentNode(map).options.find((entry) => entry.kind === "back");
  assert.equal(back.bearing, 150);
});

test("steps walked since the last stop place the next node, not the live total", () => {
  let map = addSurvey(emptyMap(), survey({ options: [option(90)] }), at(0, 100));
  map = walk(map, 90, 110);
  map = addSurvey(map, survey({ options: [option(270)] }), at(90, 110));
  const node = currentNode(map);
  assert.ok(Math.abs(node.x - 7.2) < 1e-6, `x was ${node.x}`);
  assert.ok(Math.abs(node.y) < 1e-6);
});

test("returning to a known place closes the loop at both ends", () => {
  let map = addSurvey(emptyMap(), survey({ options: [option(0), option(90)] }), at(0));
  map = walk(map, 0, 10);
  map = addSurvey(map, survey({ options: [option(180), option(90)] }), at(0, 10));
  map = walk(map, 90, 20);
  map = addSurvey(map, survey({ options: [option(270), option(200)] }), at(90, 20));
  map = walk(map, 200, 30);
  // n1 seen again, approached heading 200 so arriving from its 20-degree side.
  map = addSurvey(map, survey({ options: [option(25), option(95)], sameAs: "n1" }), at(200, 30));

  assert.equal(map.currentNodeId, "n1");
  assert.equal(map.lastEvent.type, "revisit");
  assert.equal(map.nodes.length, 3);

  const n1 = findNode(map, "n1");
  assert.equal(n1.visits, 2);
  // The new exit at 25 degrees is the corridor just walked, so it is resolved.
  const corridor = n1.options.find((entry) => entry.leadsTo === "n3");
  assert.ok(corridor, "n1 should now link to n3");
  assert.equal(corridor.loopsBack, true);

  const leaving = findNode(map, "n3").options.find((entry) => entry.bearing === 200);
  assert.equal(leaving.leadsTo, "n1");
  assert.equal(leaving.loopsBack, true);
});

test("a revisit maps the recommendation onto the known node's options", () => {
  let map = addSurvey(emptyMap(), survey({ options: [option(0), option(90)] }), at(0));
  map = walk(map, 0, 10);
  map = addSurvey(map, survey({ options: [option(180)] }), at(0, 10));
  map = walk(map, 180, 20);
  // Back at n1 from the north; the pan lists exits in a different order and
  // sees one new one at 225.
  map = addSurvey(map, survey({
    options: [option(225), option(92), option(2)],
    sameAs: "n1",
  }), at(180, 20));

  const n1 = findNode(map, "n1");
  const bearings = n1.options.map((entry) => entry.bearing).sort((a, b) => a - b);
  assert.deepEqual(bearings, [0, 90, 225]);
});

test("a weak match is not trusted", () => {
  let map = addSurvey(emptyMap(), survey({ options: [option(0)] }), at(0));
  map = walk(map, 0, 10);
  map = addSurvey(map, survey({ options: [option(180)], sameAs: "n1", confidence: 0.3 }), at(0, 10));
  assert.equal(map.nodes.length, 2);
});

test("a match to a node that does not exist is ignored", () => {
  const map = addSurvey(emptyMap(), survey({ options: [option(0)], sameAs: "n9" }), at(0));
  assert.equal(map.nodes.length, 1);
});

test("looking again without moving refreshes the place and cancels the walk", () => {
  let map = addSurvey(emptyMap(), survey({ options: [option(0), option(90)] }), at(0));
  map = walk(map, 90, 0);
  map = addSurvey(map, survey({ options: [option(0), option(90), option(180)], sameAs: "n1" }), at(0));
  assert.equal(map.lastEvent.type, "resurvey");
  assert.equal(map.pending, null);
  const n1 = findNode(map, "n1");
  assert.equal(n1.options.length, 3);
  assert.ok(n1.options.every((entry) => entry.status === "unexplored"));
});

test("near-duplicate exits in one pan collapse to the more promising", () => {
  const map = addSurvey(emptyMap(), survey({
    options: [option(10, { promise: 0.2 }), option(20, { promise: 0.8 })],
  }), at(0));
  const exits = exitsOf(currentNode(map));
  assert.equal(exits.length, 1);
  assert.equal(exits[0].promise, 0.8);
});

test("estimatePosition follows the chosen bearing by steps walked", () => {
  let map = addSurvey(emptyMap(), survey({ options: [option(180)] }), at(0, 0));
  map = walk(map, 180, 10);
  const position = estimatePosition(map);
  assert.ok(Math.abs(position.x) < 1e-6);
  assert.ok(Math.abs(position.y - 7.2) < 1e-6);
});

test("saved maps come back without the live step count", () => {
  const map = addSurvey(emptyMap(), survey({ options: [option(0)] }), at(0, 40));
  const restored = fromSaved(JSON.parse(JSON.stringify(map)));
  assert.equal(restored.nodes.length, 1);
  assert.equal(restored.stepsAtStop, null);
  assert.equal(restored.pending, null);
});

test("the map is never mutated in place", () => {
  const map = addSurvey(emptyMap(), survey({ options: [option(0)] }), at(0));
  assert.ok(Object.isFrozen(map));
  assert.ok(Object.isFrozen(map.nodes[0]));
  assert.ok(Object.isFrozen(map.nodes[0].options[0]));
});
