/**
 * Compass maths for a phone held up like a camera. The heading that matters is
 * where the rear camera points, not where the top of the phone points: the two
 * only agree when the phone is held perfectly upright, and every degree of tilt
 * between them used to land in the marker as error.
 */

const RAD = Math.PI / 180;

// Below this, the camera is looking at the floor or the sky and its horizontal
// direction is too small to trust, so fall back to the top edge of the phone.
const MIN_HORIZONTAL = 0.35;

export const normalizeDegrees = (degrees) => ((degrees % 360) + 360) % 360;

/** Signed smallest difference target - current, in -180..180. */
export const angleBetween = (target, current) =>
  ((target - current + 540) % 360) - 180;

/**
 * Heading of the rear camera, degrees clockwise from north, from a W3C
 * DeviceOrientation reading (alpha counter-clockwise about up, then beta about
 * the device x axis, then gamma about the device y axis). The camera looks
 * down the device's -z axis; this is that axis rotated into the earth frame.
 */
export function cameraHeading({ alpha, beta, gamma }) {
  if (![alpha, beta, gamma].every(Number.isFinite)) return null;

  const [sA, cA] = [Math.sin(alpha * RAD), Math.cos(alpha * RAD)];
  const [sB, cB] = [Math.sin(beta * RAD), Math.cos(beta * RAD)];
  const [sG, cG] = [Math.sin(gamma * RAD), Math.cos(gamma * RAD)];

  const east = -(cA * sG + sA * sB * cG);
  const north = cA * sB * cG - sA * sG;

  if (Math.hypot(east, north) < MIN_HORIZONTAL) {
    return normalizeDegrees(360 - alpha);
  }
  return normalizeDegrees(Math.atan2(east, north) / RAD);
}

/**
 * Exponential smoothing on a circle. Averaging 359 and 1 as plain numbers
 * gives 180, which is how a naive filter flips the marker behind you.
 */
export function smoothHeading(previous, next, factor) {
  if (!Number.isFinite(previous)) return normalizeDegrees(next);
  return normalizeDegrees(previous + angleBetween(next, previous) * factor);
}
