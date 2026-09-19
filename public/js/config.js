// Tunables for sensing, capture and relocalization. Nothing here is hardcoded
// downstream — adjust in one place after field-testing on a real phone.

export const SENSORS = Object.freeze({
  STRIDE_METERS: 0.72,
  // Peak magnitude (m/s^2) that counts as a footfall. Gravity alone is ~9.81.
  STEP_PEAK_THRESHOLD: 11.6,
  STEP_MIN_INTERVAL_MS: 260,
  // Low-pass factor for the acceleration magnitude, 0..1 (higher = twitchier).
  SMOOTHING: 0.35,
});

export const CAPTURE = Object.freeze({
  MIN_STEPS_BETWEEN: 12,
  MIN_MS_BETWEEN: 8000,
  // Heading change (degrees) that forces a capture — turns are what you forget.
  TURN_DEGREES: 45,
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
  PAN_FRAMES: 4,
  PAN_INTERVAL_MS: 1100,
  MIN_CONFIDENCE: 0.45,
});

export const MAP = Object.freeze({
  PADDING_PX: 28,
  MIN_SPAN_METERS: 12,
});
