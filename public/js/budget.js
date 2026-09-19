import { QUOTA } from "./config.js";

/**
 * A rolling per-minute request budget. The free Gemini tier allows a fixed
 * number of calls per minute, and the walk loop must never spend the whole
 * allowance on landmarks — relocalizing and routing has to be possible at any
 * moment, which is the one call that actually matters when you are lost.
 */
export function createBudget({ limit = QUOTA.REQUESTS_PER_MINUTE, windowMs = 60_000 } = {}) {
  let timestamps = [];

  const prune = (now) => {
    timestamps = timestamps.filter((at) => now - at < windowMs);
  };

  const spend = () => {
    const now = Date.now();
    prune(now);
    timestamps = [...timestamps, now];
  };

  const used = () => {
    prune(Date.now());
    return timestamps.length;
  };

  /** Landmarks stop early so the reserve is still there for getting found. */
  const canCapture = () => used() < limit - QUOTA.RESERVED_FOR_RESCUE;

  const remaining = () => Math.max(0, limit - used());

  /** Milliseconds until the oldest call ages out of the window. */
  const resetsInMs = () => {
    const now = Date.now();
    prune(now);
    if (timestamps.length === 0) return 0;
    return Math.max(0, windowMs - (now - timestamps[0]));
  };

  return { spend, used, canCapture, remaining, resetsInMs };
}
