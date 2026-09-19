// Tunables for sensing, capture and relocalization. Nothing here is hardcoded
// downstream — adjust in one place after field-testing on a real phone.

export const SENSORS = Object.freeze({
  STRIDE_METERS: 0.72,
  // Used to space nodes when step detection reports nothing, so a map still
  // has shape on phones whose accelerometer readings never cross the threshold.
  NOMINAL_LEG_METERS: 18,
  // Peak magnitude (m/s^2) that counts as a footfall. Gravity alone is ~9.81.
  STEP_PEAK_THRESHOLD: 11.6,
  STEP_MIN_INTERVAL_MS: 260,
  // Low-pass factor for the acceleration magnitude, 0..1 (higher = twitchier).
  SMOOTHING: 0.35,
  // Low-pass factor for the compass. Low enough to kill jitter, high enough
  // that the heading recorded with each pan frame is not left behind the turn.
  HEADING_SMOOTHING: 0.3,
});

export const CAPTURE = Object.freeze({
  FRAME_WIDTH: 640,
  JPEG_QUALITY: 0.72,
});

// A phone's main camera sees roughly 68 degrees across its long side. The
// field of view across the frame actually sent depends on how it is held, so
// it is derived from the frame's shape rather than fixed.
export const CAMERA = Object.freeze({
  LONG_SIDE_FOV_DEGREES: 68,
});

// The free Gemini tier allows 20 requests a minute.
export const QUOTA = Object.freeze({
  REQUESTS_PER_MINUTE: 20,
  RESERVED_FOR_RESCUE: 4,
});

// Frames are taken as the phone turns, not on a clock: one every STEP_DEGREES
// of rotation, so a fast spin and a slow one both cover the circle evenly.
// MAX_INTERVAL_MS paces the pan only on phones with no compass; with one, the
// clock waits STALL_MS, so a slow careful turn is never cut short.
export const PAN = Object.freeze({
  FRAMES: 8,
  STEP_DEGREES: 40,
  MIN_INTERVAL_MS: 250,
  MAX_INTERVAL_MS: 1100,
  STALL_MS: 6000,
  POLL_MS: 40,
  // Which frames also become the place's reference photos: roughly a third of
  // a turn apart, so a return from any side has a matching view.
  REFERENCE_FRAMES: Object.freeze([0, 3, 6]),
});

// Recognising somewhere you have already been is a visual question, so each
// place keeps a few small reference shots and the likeliest candidates are
// sent back for Gemini to compare against directly.
export const MEMORY = Object.freeze({
  THUMB_WIDTH: 320,
  THUMB_QUALITY: 0.6,
  MAX_PLACES: 5,
  VIEWS_PER_PLACE: 3,
});

export const GRAPH = Object.freeze({
  // Two bearings this close are the same way, allowing for compass drift.
  SAME_DIRECTION_DEGREES: 35,
  // Exits this close in one pan are the same exit seen in two photos.
  DUPLICATE_EXIT_DEGREES: 20,
  // A re-seen exit this close to a known one is that one.
  MERGE_DEGREES: 22,
  MAX_OPTIONS: 8,
  // How much less promising than the best untried way Gemini's own pick may
  // be before the best is taken instead.
  PICK_PROMISE_MARGIN: 0.15,
  // How sure Gemini must be before "you have been here" is believed. A false
  // match corrupts the map far worse than a missed one, so the bar is high,
  // and lower only for the place the explorer was deliberately walked back to.
  MATCH_CONFIDENCE: 0.6,
  EXPECTED_MATCH_CONFIDENCE: 0.4,
});

export const MARKER = Object.freeze({
  ALIGNED_DEGREES: 12,
});

export const MAP = Object.freeze({
  PADDING_PX: 34,
  MIN_SPAN_METERS: 14,
  STUB_PX: 30,
});
