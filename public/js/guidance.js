/**
 * Turns a bearing into something you can act on without looking at anything.
 * Everything spoken to the explorer is egocentric — left, right, straight on,
 * turn around — because a description of what a place looks like is no use to
 * someone who cannot see it.
 */

/** Signed angle from where you face to the target, in -180..180. */
export const bearingDelta = (target, current) =>
  ((target - current + 540) % 360) - 180;

// Ordered widest-last. "behind" is deliberately a wide band: near 180 degrees
// the sign of the delta flips on the smallest movement, so left and right stop
// meaning anything and the only honest instruction is to turn around.
const ZONES = Object.freeze([
  { id: "straight", limit: 20, phrase: () => "Straight ahead" },
  { id: "slight", limit: 70, phrase: (side) => `Slightly ${side}` },
  { id: "turn", limit: 115, phrase: (side) => `Turn ${side}` },
  { id: "sharp", limit: 150, phrase: (side) => `Sharp ${side}` },
  { id: "behind", limit: 181, phrase: () => "Turn around" },
]);

// Once "turn around" is showing, it takes a real turn to leave that state, so
// a hand shaking on the boundary cannot make the instruction flicker.
const BEHIND_ENTER = 150;
const BEHIND_LEAVE = 135;

export function zoneFor(delta, wasBehind = false) {
  const magnitude = Math.abs(delta);
  const threshold = wasBehind ? BEHIND_LEAVE : BEHIND_ENTER;
  if (magnitude >= threshold) return ZONES[ZONES.length - 1];
  return ZONES.find((zone) => magnitude < zone.limit) ?? ZONES[ZONES.length - 1];
}

export const sideOf = (delta) => (delta > 0 ? "right" : "left");

/** The short phrase spoken while the explorer turns to line up. */
export function turnPhrase(delta, wasBehind = false) {
  return zoneFor(delta, wasBehind).phrase(sideOf(delta));
}

/**
 * The fuller instruction given the moment a direction is chosen. It leads with
 * the action, then says what to expect, so the useful half comes first.
 */
export function directionSentence(delta, description) {
  const zone = zoneFor(delta);
  const side = sideOf(delta);

  const lead = {
    straight: "Go straight ahead.",
    slight: `Turn slightly ${side}, then go straight.`,
    turn: `Turn ${side}, then go straight.`,
    sharp: `Turn sharply ${side}, then go straight.`,
    behind: "Turn around and go back the way you came.",
  }[zone.id];

  return description ? `${lead} ${description}` : lead;
}

/**
 * Names a direction against the way someone is going, the way a person would
 * give it at a junction: "the left path", "the one ahead". Used for branches,
 * where the reference is the way the explorer walked in, not the phone.
 */
export function relativeSide(bearing, reference) {
  const delta = bearingDelta(bearing, reference);
  const magnitude = Math.abs(delta);
  if (magnitude <= 25) return "ahead";
  if (magnitude >= 150) return "behind";
  const side = sideOf(delta);
  return magnitude <= 60 ? `bear ${side}` : side;
}

/** One letter for the map: L, R, A (ahead) or B (behind). */
export function sideLetter(bearing, reference) {
  const side = relativeSide(bearing, reference);
  if (side === "ahead") return "A";
  if (side === "behind") return "B";
  return side.endsWith("left") ? "L" : "R";
}
