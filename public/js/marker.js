import { MARKER } from "./config.js";

/**
 * A heading-anchored marker drawn over the camera feed. It is pinned to a
 * compass bearing, not to the screen, so spinning the phone sweeps it across
 * the view and it settles on the real-world direction to walk. Without this,
 * "take the left path" is meaningless the moment you turn around.
 */
export function createMarker({ root, ring, label }) {
  let targetHeading = null;
  let targetLabel = "";

  const clear = () => {
    targetHeading = null;
    root.hidden = true;
  };

  const setTarget = (heading, text) => {
    targetHeading = ((heading % 360) + 360) % 360;
    targetLabel = text;
    root.hidden = false;
  };

  /** Signed angle from where the phone points to the target, in -180..180. */
  const bearingDelta = (currentHeading) =>
    ((targetHeading - currentHeading + 540) % 360) - 180;

  const update = (currentHeading) => {
    if (targetHeading === null || !Number.isFinite(currentHeading)) return;

    const delta = bearingDelta(currentHeading);
    const halfFov = MARKER.CAMERA_FOV_DEGREES / 2;
    const inView = Math.abs(delta) <= halfFov;

    if (inView) {
      // Place it where the direction actually falls within the frame.
      root.style.left = `${50 + (delta / MARKER.CAMERA_FOV_DEGREES) * 100}%`;
      root.dataset.state = Math.abs(delta) <= MARKER.ALIGNED_DEGREES ? "aligned" : "in-view";
    } else {
      // Off frame: pin to the edge you need to turn towards.
      root.style.left = delta > 0 ? "88%" : "12%";
      root.dataset.state = delta > 0 ? "turn-right" : "turn-left";
    }

    ring.textContent = root.dataset.state === "aligned"
      ? "◉"
      : delta > 0 ? "›" : "‹";

    label.textContent = root.dataset.state === "aligned"
      ? `${targetLabel} — this way`
      : `${targetLabel} — turn ${delta > 0 ? "right" : "left"} ${Math.round(Math.abs(delta))}°`;
  };

  return { setTarget, update, clear };
}
