import { test } from "node:test";
import assert from "node:assert/strict";
import { frameOffsetDegrees, resolveBearings } from "../lib/bearings.js";

const frames = [
  { heading: 0 }, { heading: 45 }, { heading: 90 }, { heading: 350 },
];

test("an exit in the middle of the photo is at the photo's heading", () => {
  assert.equal(frameOffsetDegrees(0.5, 60), 0);
});

test("an exit at the edge of the photo is half the field of view away", () => {
  assert.ok(Math.abs(frameOffsetDegrees(1, 60) - 30) < 1e-9);
  assert.ok(Math.abs(frameOffsetDegrees(0, 60) + 30) < 1e-9);
});

test("positions outside 0..1 are clamped, a missing one means centre", () => {
  assert.equal(frameOffsetDegrees(3, 60), frameOffsetDegrees(1, 60));
  assert.equal(frameOffsetDegrees(undefined, 60), 0);
});

test("bearings add the in-photo offset and wrap past north", () => {
  const result = resolveBearings({
    options: [
      { photo: 2, x: 1, description: "gap", promise: 0.3 },
      { photo: 4, x: 1, description: "path", promise: 0.9, is_way_back: true },
    ],
    recommendation: { option_index: 1, why: "downhill" },
    arrived: false,
  }, frames, 60);

  assert.equal(result.options[0].bearing, 75);
  assert.equal(result.options[1].bearing, 20);
  assert.equal(result.options[1].is_way_back, true);
  assert.equal(result.recommendation.bearing, 75);
});

test("options pointing at photos that do not exist are dropped", () => {
  const result = resolveBearings({
    options: [
      { photo: 9, description: "invented", promise: 1 },
      { photo: 1, description: "real", promise: 0.2 },
    ],
    recommendation: { option_index: 1, why: "x" },
    arrived: false,
  }, frames, 60);

  assert.equal(result.options.length, 1);
  // The model picked the dropped one, so the best survivor is used instead.
  assert.equal(result.recommendation.option_index, 1);
  assert.equal(result.recommendation.bearing, 0);
});

test("arrival clears the recommendation", () => {
  const result = resolveBearings({
    options: [{ photo: 1, description: "road", promise: 1 }],
    recommendation: { option_index: 1, why: "x" },
    arrived: true,
  }, frames, 60);
  assert.equal(result.recommendation, null);
});
