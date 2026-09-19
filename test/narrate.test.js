import { test } from "node:test";
import assert from "node:assert/strict";
import { addSurvey, commitChoice, currentNode, emptyMap, trackMotion } from "../public/js/graph.js";
import { decide } from "../public/js/decide.js";
import { narrate } from "../public/js/narrate.js";
import { selectReferences, toServerNodes, serverArrival } from "../public/js/recall.js";
import { relativeSide } from "../public/js/guidance.js";
import { at, option, survey } from "./helpers.js";

const go = (map, bearing, steps) => {
  const chosen = currentNode(map).options.find((entry) => entry.bearing === bearing);
  return trackMotion(
    commitChoice(map, { bearing, optionId: chosen.id, expectedId: chosen.leadsTo }),
    { steps, heading: bearing },
  );
};

test("relativeSide names a bearing against the way you are going", () => {
  assert.equal(relativeSide(10, 0), "ahead");
  assert.equal(relativeSide(270, 0), "left");
  assert.equal(relativeSide(80, 0), "right");
  assert.equal(relativeSide(180, 0), "behind");
  assert.equal(relativeSide(45, 0), "bear right");
});

test("a new fork is announced with its branches and the pick", () => {
  const pan = survey({ options: [option(270), option(90)], pick: 1 });
  const map = addSurvey(emptyMap(), pan, at(0));
  const text = narrate({ map, decision: decide(map, pan), survey: pan, heading: 0 });
  assert.match(text, /fork 1/i);
  assert.match(text, /left and right/);
  assert.match(text, /Take the left path/);
  assert.match(text, /Trees all round/);
});

test("a revisit says so and names the branch that already failed", () => {
  let map = addSurvey(emptyMap(), survey({ options: [option(270), option(90)] }), at(0));
  map = go(map, 270, 10);
  map = addSurvey(map, survey({ options: [option(90)] }), at(270, 10));
  const back = decide(map, survey());
  map = trackMotion(commitChoice(map, back), { steps: 20, heading: 90 });
  // Arriving back at n1 walking east, so its 270 exit is now behind, and its
  // 90 exit is ahead.
  const pan = survey({ options: [option(90), option(270)], sameAs: "n1", pick: 1 });
  map = addSurvey(map, pan, at(90, 20));
  const text = narrate({ map, decision: decide(map, pan), survey: pan, heading: 90 });
  assert.match(text, /been here before/);
  assert.match(text, /dead end/);
});

test("a backtrack says where it is going and why", () => {
  let map = addSurvey(emptyMap(), survey({ options: [option(0), option(90)] }), at(0));
  map = go(map, 0, 10);
  const pan = survey({ options: [option(180)] });
  map = addSurvey(map, pan, at(0, 10));
  const text = narrate({ map, decision: decide(map, pan), survey: pan, heading: 0 });
  assert.match(text, /Dead end/);
  assert.match(text, /back to fork 1/);
  assert.match(text, /Turn around/);
});

test("stuck is said plainly", () => {
  const pan = survey();
  const map = addSurvey(emptyMap(), pan, at(0));
  assert.match(narrate({ map, decision: decide(map, pan), survey: pan, heading: 0 }), /tried/);
});

test("references favour the place being walked back to, then the nearest", () => {
  let map = addSurvey(emptyMap(), survey({ options: [option(0), option(90)] }), { heading: 0, steps: 0, references: ["a"] });
  map = go(map, 0, 10);
  map = addSurvey(map, survey({ options: [option(180)] }), { heading: 0, steps: 10, references: ["b1", "b2"] });
  const back = decide(map, survey());
  map = trackMotion(commitChoice(map, back), { steps: 20, heading: 180 });
  const picked = selectReferences(map);
  assert.equal(picked[0].id, "n1");
  assert.deepEqual(picked[0].images, ["a"]);
  assert.deepEqual(picked[1].images, ["b1", "b2"]);
});

test("places without photos are not sent as references", () => {
  const map = addSurvey(emptyMap(), survey({ options: [option(0)] }), at(0));
  assert.deepEqual(selectReferences(map), []);
});

test("server nodes carry each branch's state and side", () => {
  let map = addSurvey(emptyMap(), survey({ options: [option(270), option(90)] }), at(0));
  map = go(map, 270, 10);
  map = addSurvey(map, survey({ options: [option(90)] }), at(270, 10));
  const [n1, n2] = toServerNodes(map);
  assert.equal(n1.is_fork, true);
  assert.deepEqual(n1.options.map((entry) => entry.state).sort(), ["dead-end", "untried"]);
  assert.equal(n2.is_current, true);
  assert.equal(n2.options[0].state, "way-back");
  assert.equal(serverArrival(map), null);
  assert.deepEqual(serverArrival(go(map, 90, 12)), { from_node_id: "n2", bearing: 90 });
});

test("the first stop names sides from where the pan started, and collapses repeats", () => {
  const pan = survey({ options: [option(170), option(80), option(200)], pick: 2 });
  // The pan began facing north; by the time the answer arrives the phone faces 250.
  const map = addSurvey(emptyMap(), pan, { heading: 250, steps: 0, references: [], facing: 0 });
  const text = narrate({ map, decision: decide(map, pan), survey: pan, heading: 250 });
  assert.match(text, /Paths go right and two behind/);
  assert.match(text, /Take the right path/);
});
