import { MEMORY, PAN } from "./config.js";
import { angleBetween, normalizeDegrees } from "./heading.js";

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Takes the pan. A frame is grabbed each time the phone has turned another
 * STEP_DEGREES, so the photos are spread evenly round the circle however fast
 * the explorer turns, and each is tagged with the heading read at that
 * instant. They can turn as slowly as they like, and slower is better:
 * sharper photos, and a compass that keeps up. With a live compass the
 * clock only steps in if the turn stalls completely; without one it is the
 * only thing that can pace the pan.
 *
 * A few frames also become small reference shots of this place, facing
 * different ways, so a return from any side has something to match.
 */
export async function capturePan({
  camera,
  readHeading,
  onProgress = () => {},
  // Called as each frame is taken, so the pace can be felt, not only seen.
  onFrame = () => {},
  hasCompass = () => false,
  config = PAN,
  now = () => Date.now(),
  sleep = wait,
}) {
  const frames = [];
  const references = [];
  let last = null;

  while (frames.length < config.FRAMES) {
    const heading = readHeading();
    const elapsed = last === null ? Infinity : now() - last.at;
    const turned = last === null || !Number.isFinite(heading)
      ? 0
      : Math.abs(angleBetween(heading, last.heading));
    const fallbackMs = hasCompass()
      ? config.STALL_MS ?? Infinity
      : config.MAX_INTERVAL_MS;
    const due = last === null
      || (elapsed >= config.MIN_INTERVAL_MS && turned >= config.STEP_DEGREES)
      || elapsed >= fallbackMs;

    if (!due) {
      await sleep(config.POLL_MS);
      continue;
    }

    const safe = Number.isFinite(heading) ? normalizeDegrees(Math.round(heading)) : 0;
    frames.push(Object.freeze({ image: camera.captureFrame(), heading: safe }));
    if (config.REFERENCE_FRAMES.includes(frames.length - 1)) {
      references.push(camera.captureFrame({
        width: MEMORY.THUMB_WIDTH,
        quality: MEMORY.THUMB_QUALITY,
      }));
    }
    last = { at: now(), heading: safe };
    onFrame();
    onProgress(frames.length, config.FRAMES);
  }

  return { frames: Object.freeze(frames), references: Object.freeze(references) };
}
