import { test } from "node:test";
import assert from "node:assert/strict";
import { capturePan } from "../public/js/pan.js";
import { horizontalFovFor } from "../public/js/camera.js";

const config = {
  FRAMES: 4, STEP_DEGREES: 40, MIN_INTERVAL_MS: 100, MAX_INTERVAL_MS: 1000, POLL_MS: 10,
  REFERENCE_FRAMES: [0, 2],
};

// A fake phone turning at a steady rate, driven by a fake clock.
const rig = (degreesPerMs) => {
  let clock = 0;
  const shots = [];
  return {
    shots,
    now: () => clock,
    sleep: async (ms) => { clock += ms; },
    readHeading: () => (clock * degreesPerMs) % 360,
    camera: { captureFrame: (options) => { shots.push(options ? "thumb" : "frame"); return `img${shots.length}`; } },
  };
};

test("frames are spaced by rotation, not by time", async () => {
  const phone = rig(0.1); // 100 degrees a second
  const { frames } = await capturePan({ ...phone, config });
  const headings = frames.map((frame) => frame.heading);
  assert.equal(headings.length, 4);
  headings.slice(1).forEach((heading, index) => {
    const step = heading - headings[index];
    assert.ok(step >= 40 && step < 45, `step was ${step}`);
  });
});

test("with no compass the clock still finishes the pan", async () => {
  const phone = rig(0);
  const { frames } = await capturePan({ ...phone, config });
  assert.equal(frames.length, 4);
});

test("chosen frames also yield reference thumbnails", async () => {
  const phone = rig(0.1);
  const { references } = await capturePan({ ...phone, config });
  assert.equal(references.length, 2);
});

test("an upright frame sees less across than the sensor's long side", () => {
  assert.equal(horizontalFovFor(1280, 720, 68), 68);
  const portrait = horizontalFovFor(720, 1280, 68);
  assert.ok(portrait > 40 && portrait < 43, `was ${portrait}`);
  assert.equal(horizontalFovFor(0, 0, 68), 68);
});

test("turning slowly still spreads frames round the whole circle", async () => {
  const phone = rig(0.015); // 15 degrees a second: a slow, careful turn
  const { frames } = await capturePan({ ...phone, config, hasCompass: () => true });
  const headings = frames.map((frame) => frame.heading);
  headings.slice(1).forEach((heading, index) => {
    const step = heading - headings[index];
    assert.ok(step >= 40, `frames bunched: step was ${step}`);
  });
});

test("a turn that stalls still finishes, just more slowly", async () => {
  const phone = rig(0);
  const { frames } = await capturePan({ ...phone, config: { ...config, STALL_MS: 3000 }, hasCompass: () => true });
  assert.equal(frames.length, 4);
});

test("each frame gives a tap the explorer can feel", async () => {
  const phone = rig(0.1);
  let taps = 0;
  await capturePan({ ...phone, config, onFrame: () => { taps += 1; } });
  assert.equal(taps, 4);
});
