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
});

export const CAPTURE = Object.freeze({
  FRAME_WIDTH: 640,
  JPEG_QUALITY: 0.72,
});

// The free Gemini tier allows 20 requests a minute. Landmark capture must stay
// well under it, because being lost costs two more calls (locate, then route).
export const QUOTA = Object.freeze({
  REQUESTS_PER_MINUTE: 20,
  RESERVED_FOR_RESCUE: 4,
});

export const LOST = Object.freeze({
  // Eight frames over roughly five seconds. Four was too few to cover a full
  // turn, so exits behind the explorer were simply never photographed.
  PAN_FRAMES: 8,
  PAN_INTERVAL_MS: 650,
  MIN_CONFIDENCE: 0.45,
});

// Recognising somewhere you have already been is a visual question, so each
// place keeps a small reference shot and the likeliest candidates are sent back
// for Gemini to compare against directly, rather than only a written summary.
export const MEMORY = Object.freeze({
  THUMB_WIDTH: 320,
  THUMB_QUALITY: 0.6,
  MAX_REFERENCES: 4,
});

export const MARKER = Object.freeze({
  // Roughly the horizontal field of view of a phone's rear camera. Only used to
  // place the marker within the frame, so being a few degrees off is harmless.
  CAMERA_FOV_DEGREES: 65,
  ALIGNED_DEGREES: 12,
});

export const MAP = Object.freeze({
  PADDING_PX: 28,
  MIN_SPAN_METERS: 12,
});
