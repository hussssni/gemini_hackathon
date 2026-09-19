import { test } from "node:test";
import assert from "node:assert/strict";
import { addSurvey, commitChoice, currentNode, emptyMap, trackMotion } from "../public/js/graph.js";
import { decide } from "../public/js/decide.js";
import { mapSummary, markerLabel, stats, surveyView } from "../public/js/present.js";
import { screenPosition } from "../public/js/marker.js";
import { at, option, survey } from "./helpers.js";

test("the panel lists branches left to right with their fate and the pick", () => {
  const pan = survey({ options: [option(90), option(270)], pick: 2 });
  const map = addSurvey(emptyMap(), pan, at(0));
  const decision = decide(map, pan);
  const view = surveyView({ map, survey: pan, decision, spoken: "said" });
  assert.deepEqual(view.rows.map((row) => row.side), ["left", "right"]);
  assert.equal(view.rows[0].isPick, true);
  assert.match(view.badge, /^Fork 1/);
  assert.equal(markerLabel(map, decision), "left path");
});

test("stats count places, forks and untried branches", () => {
  let map = addSurvey(emptyMap(), survey({ options: [option(0), option(90)] }), at(0));
  const chosen = currentNode(map).options[0];
  map = trackMotion(commitChoice(map, { bearing: chosen.bearing, optionId: chosen.id }), { steps: 5, heading: 0 });
  map = addSurvey(map, survey({ options: [option(180)] }), at(0, 5));
  assert.deepEqual(stats(map), { places: 2, forks: 1, untried: 1 });
  assert.equal(markerLabel(map, decide(map, survey())), "Back to fork 1");
});

test("the marker sits where the bearing falls in the camera view", () => {
  assert.equal(screenPosition(0, 60), 0.5);
  assert.ok(Math.abs(screenPosition(30, 60) - 1) < 1e-9);
  assert.ok(Math.abs(screenPosition(-30, 60)) < 1e-9);
});

test("an empty map has no panel", () => {
  assert.equal(surveyView({ map: emptyMap(), survey: survey(), decision: { kind: "stuck" }, spoken: "" }), null);
});

test("the map has a text summary for screen readers", () => {
  assert.equal(mapSummary(emptyMap()), "Map: nothing mapped yet.");
  const map = addSurvey(emptyMap(), survey({ options: [option(0), option(90)] }), at(0));
  assert.equal(mapSummary(map), "Map: 1 place, 1 fork, 2 untried paths. You are at fork 1.");
});
