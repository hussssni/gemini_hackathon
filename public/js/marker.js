import { MARKER } from "./config.js";
import { bearingDelta, sideOf, turnPhrase, zoneFor } from "./guidance.js";

/**
 * A heading-anchored marker drawn over the camera feed. It is pinned to a
 * compass bearing, not to the screen, so turning the phone sweeps it across the
 * view until it settles on the real-world direction to walk.
 */
/** Where a bearing `delta` degrees off-centre lands across the camera view, 0..1. */
export const screenPosition = (delta, fovDegrees) =>
  0.5 + Math.tan((delta * Math.PI) / 180) / (2 * Math.tan((fovDegrees * Math.PI) / 360));

export function createMarker({ root, ring, label, getFov }) {
  let targetHeading = null;
  let targetLabel = "";
  let wasBehind = false;

  const clear = () => {
    targetHeading = null;
    wasBehind = false;
    root.hidden = true;
  };

  const setTarget = (heading, text) => {
    targetHeading = ((Math.round(heading) % 360) + 360) % 360;
    targetLabel = text ?? "";
    wasBehind = false;
    root.hidden = false;
  };

  const update = (currentHeading) => {
    if (targetHeading === null || !Number.isFinite(currentHeading)) return null;

    const delta = bearingDelta(targetHeading, currentHeading);
    const zone = zoneFor(delta, wasBehind);
    wasBehind = zone.id === "behind";

    if (wasBehind) {
      // Anything behind you is neither left nor right in any stable sense, so
      // it sits centred and says so rather than flicking between the edges.
      root.style.left = "50%";
      root.dataset.state = "behind";
      ring.textContent = "↺";
    } else {
      const fov = getFov();
      if (Math.abs(delta) <= fov / 2) {
        root.style.left = `${screenPosition(delta, fov) * 100}%`;
        root.dataset.state = Math.abs(delta) <= MARKER.ALIGNED_DEGREES ? "aligned" : "in-view";
        ring.textContent = root.dataset.state === "aligned" ? "◉" : "○";
      } else {
        root.style.left = delta > 0 ? "88%" : "12%";
        root.dataset.state = delta > 0 ? "turn-right" : "turn-left";
        ring.textContent = delta > 0 ? "›" : "‹";
      }
    }

    const phrase = root.dataset.state === "aligned"
      ? `${targetLabel} — go now`
      : turnPhrase(delta, wasBehind);
    label.textContent = root.dataset.state === "behind"
      ? phrase
      : `${phrase}${root.dataset.state === "aligned" ? "" : ` ${Math.round(Math.abs(delta))}°`}`;

    return { delta, zone: zone.id, side: sideOf(delta), aligned: root.dataset.state === "aligned" };
  };

  return { setTarget, update, clear };
}
