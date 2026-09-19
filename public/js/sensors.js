import { SENSORS } from "./config.js";

// iOS 13+ gates motion and orientation behind a permission call that must
// happen inside a user gesture. Android and desktop Chrome grant it silently.
export async function requestSensorAccess() {
  const requests = [
    globalThis.DeviceMotionEvent?.requestPermission,
    globalThis.DeviceOrientationEvent?.requestPermission,
  ];

  const results = await Promise.all(
    requests.map(async (request, index) => {
      if (typeof request !== "function") return "granted";
      const target = index === 0 ? DeviceMotionEvent : DeviceOrientationEvent;
      try {
        return await request.call(target);
      } catch (err) {
        console.warn("Sensor permission request failed", err);
        return "denied";
      }
    }),
  );

  return results.every((state) => state === "granted");
}

function magnitude({ x = 0, y = 0, z = 0 } = {}) {
  return Math.sqrt(x * x + y * y + z * z);
}

// Compass heading in degrees clockwise from north, or null if unavailable.
function readHeading(event) {
  if (typeof event.webkitCompassHeading === "number") {
    return event.webkitCompassHeading;
  }
  if (event.absolute === true && typeof event.alpha === "number") {
    return (360 - event.alpha) % 360;
  }
  return null;
}

/**
 * Tracks step count and compass heading, emitting an immutable snapshot on
 * every change. Returns handles to start and stop listening.
 */
export function createSensorTracker({ onUpdate, onError }) {
  let steps = 0;
  let heading = 0;
  let hasHeading = false;
  let smoothed = 9.81;
  let aboveThreshold = false;
  let lastStepAt = 0;

  const emit = () =>
    onUpdate(Object.freeze({ steps, heading, hasHeading }));

  const handleMotion = (event) => {
    const reading = event.accelerationIncludingGravity;
    if (!reading) return;

    smoothed += SENSORS.SMOOTHING * (magnitude(reading) - smoothed);

    const now = event.timeStamp || performance.now();
    if (smoothed > SENSORS.STEP_PEAK_THRESHOLD) {
      const settled = now - lastStepAt > SENSORS.STEP_MIN_INTERVAL_MS;
      if (!aboveThreshold && settled) {
        aboveThreshold = true;
        lastStepAt = now;
        steps += 1;
        emit();
      }
    } else {
      aboveThreshold = false;
    }
  };

  const handleOrientation = (event) => {
    const next = readHeading(event);
    if (next === null || Number.isNaN(next)) return;
    heading = next;
    hasHeading = true;
    emit();
  };

  const start = () => {
    if (!globalThis.DeviceMotionEvent) {
      onError?.("This device reports no motion sensor, so steps will not count.");
    }
    addEventListener("devicemotion", handleMotion);
    addEventListener("deviceorientationabsolute", handleOrientation);
    addEventListener("deviceorientation", handleOrientation);
  };

  const stop = () => {
    removeEventListener("devicemotion", handleMotion);
    removeEventListener("deviceorientationabsolute", handleOrientation);
    removeEventListener("deviceorientation", handleOrientation);
  };

  // Lets the demo advance without a phone in hand.
  const simulateStep = (headingOverride) => {
    steps += 1;
    if (typeof headingOverride === "number") {
      heading = headingOverride;
      hasHeading = true;
    }
    emit();
  };

  return { start, stop, simulateStep };
}
