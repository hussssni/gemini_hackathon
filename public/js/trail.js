import { SENSORS } from "./config.js";

// The trail is plain immutable data: every helper returns a new object so the
// UI can diff snapshots and nothing mutates behind the renderer's back.

export const emptyTrail = () =>
  Object.freeze({
    startedAt: null,
    steps: 0,
    heading: 0,
    path: Object.freeze([Object.freeze({ x: 0, y: 0, steps: 0, heading: 0 })]),
    landmarks: Object.freeze([]),
  });

export const startTrail = (trail, now = Date.now()) =>
  Object.freeze({ ...trail, startedAt: now });

const headingToVector = (degrees) => {
  const radians = (degrees * Math.PI) / 180;
  // Screen space: north is up, so a north heading walks toward negative y.
  return { x: Math.sin(radians), y: -Math.cos(radians) };
};

export const currentPoint = (trail) => trail.path[trail.path.length - 1];

/**
 * Integrates a sensor snapshot into the path by dead reckoning. Extra steps
 * are projected along the heading that was held while they were taken.
 */
export const advance = (trail, { steps, heading }) => {
  const delta = steps - trail.steps;
  if (delta <= 0) {
    return heading === trail.heading ? trail : Object.freeze({ ...trail, heading });
  }

  const here = currentPoint(trail);
  const vector = headingToVector(trail.heading);
  const distance = delta * SENSORS.STRIDE_METERS;
  const point = Object.freeze({
    x: here.x + vector.x * distance,
    y: here.y + vector.y * distance,
    steps,
    heading: trail.heading,
  });

  return Object.freeze({
    ...trail,
    steps,
    heading,
    path: Object.freeze([...trail.path, point]),
  });
};

export const addLandmark = (trail, landmark) =>
  Object.freeze({
    ...trail,
    landmarks: Object.freeze([...trail.landmarks, Object.freeze(landmark)]),
  });

export const lastLandmark = (trail) =>
  trail.landmarks.length > 0 ? trail.landmarks[trail.landmarks.length - 1] : null;

export const findLandmark = (trail, id) =>
  trail.landmarks.find((landmark) => landmark.id === id) ?? null;

/** Smallest absolute angle between two compass headings, in degrees. */
export const headingDelta = (a, b) => {
  const diff = Math.abs(a - b) % 360;
  return diff > 180 ? 360 - diff : diff;
};

/** Strips client-only fields so the payload matches the server's schema. */
export const toServerLandmarks = (landmarks) =>
  landmarks.map(({ id, description, distinctive_features, is_decision_point, options_seen, heading, steps }) => ({
    id,
    description,
    distinctive_features,
    is_decision_point,
    options_seen,
    heading,
    steps,
  }));
