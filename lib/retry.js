// Gemini returns 503 under load and 429 when the per-minute quota is spent.
// Both are transient and both are fatal to a live demo, so retry them.
const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);

const DEFAULTS = Object.freeze({
  attempts: 4,
  baseDelayMs: 700,
  maxDelayMs: 8000,
  // Gemini asks for a ~60s wait when a DAILY quota is gone, and waiting it out
  // changes nothing. Past this, fail fast rather than hang the caller.
  maxServerDelayMs: 12_000,
});

export const isRateLimit = (error) => error?.status === 429;

const isRetryable = (error) => RETRYABLE_STATUS.has(error?.status);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Gemini reports how long to wait when it throttles, either as a structured
 * RetryInfo detail or in the message text. Honour it: guessing is what makes
 * quota errors look like hard failures.
 */
function serverRequestedDelayMs(error) {
  const details = error?.details ?? error?.error?.details ?? [];
  const retryInfo = Array.isArray(details)
    ? details.find((detail) => String(detail?.["@type"]).includes("RetryInfo"))
    : null;

  const seconds = retryInfo?.retryDelay
    ? Number.parseFloat(retryInfo.retryDelay)
    : Number.parseFloat(String(error?.message).match(/retry in ([\d.]+)s/i)?.[1] ?? "");

  return Number.isFinite(seconds) ? Math.ceil(seconds * 1000) : null;
}

/** Exponential backoff with jitter, so parallel calls do not resynchronise. */
const backoffMs = (attempt, { baseDelayMs, maxDelayMs }) => {
  const exponential = Math.min(baseDelayMs * 2 ** attempt, maxDelayMs);
  return exponential * (0.5 + Math.random() * 0.5);
};

export async function withRetry(operation, options = {}) {
  const config = { ...DEFAULTS, ...options };
  let lastError;

  for (let attempt = 0; attempt < config.attempts; attempt += 1) {
    try {
      return await operation(attempt);
    } catch (error) {
      lastError = error;
      if (!isRetryable(error) || attempt >= config.attempts - 1) throw error;

      const requested = serverRequestedDelayMs(error);
      if (requested !== null && requested > config.maxServerDelayMs) {
        console.warn(`Gemini asked for a ${Math.round(requested / 1000)}s wait; not retrying.`);
        throw error;
      }

      const wait = requested === null
        ? backoffMs(attempt, config)
        : requested + 250;

      console.warn(
        `Gemini returned ${error.status}; waiting ${Math.round(wait)}ms ` +
        `(attempt ${attempt + 2} of ${config.attempts})`,
      );
      await sleep(wait);
    }
  }

  throw lastError;
}
