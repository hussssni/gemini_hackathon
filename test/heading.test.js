import { test } from "node:test";
import assert from "node:assert/strict";
import { cameraHeading, normalizeDegrees, smoothHeading } from "../public/js/heading.js";

const close = (actual, expected, tolerance = 0.5) =>
  assert.ok(
    Math.abs(((actual - expected + 540) % 360) - 180) <= tolerance,
    `expected ${actual} to be within ${tolerance} of ${expected}`,
  );

test("normalizeDegrees wraps into 0..360", () => {
  assert.equal(normalizeDegrees(-10), 350);
  assert.equal(normalizeDegrees(370), 10);
  assert.equal(normalizeDegrees(0), 0);
});

test("upright phone facing north reads 0", () => {
  close(cameraHeading({ alpha: 0, beta: 90, gamma: 0 }), 0);
});

test("upright phone rotated counter-clockwise by 90 faces west", () => {
  close(cameraHeading({ alpha: 90, beta: 90, gamma: 0 }), 270);
});

test("tilting the phone back does not change where the camera points", () => {
  close(cameraHeading({ alpha: 30, beta: 60, gamma: 0 }), 330);
  close(cameraHeading({ alpha: 30, beta: 120, gamma: 0 }), 330);
});

test("gamma on an upright phone swings the camera, and is counted", () => {
  // Upright, gamma turns the phone about the vertical, so the camera really
  // points 20 degrees west of north. The old 360-alpha reading said north.
  close(cameraHeading({ alpha: 0, beta: 90, gamma: 20 }), 340, 1);
});

test("a phone lying flat falls back to where its top points", () => {
  close(cameraHeading({ alpha: 45, beta: 0, gamma: 0 }), 315);
});

test("missing angles give null", () => {
  assert.equal(cameraHeading({ alpha: null, beta: 90, gamma: 0 }), null);
});

test("smoothHeading moves toward the new reading the short way round", () => {
  close(smoothHeading(350, 10, 0.5), 0);
  close(smoothHeading(10, 350, 0.5), 0);
  close(smoothHeading(null, 123, 0.2), 123);
});
