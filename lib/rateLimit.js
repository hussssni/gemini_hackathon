// A public demo link spends one Gemini quota on everyone who finds it. This
// keeps any single visitor from using it all. It lives in memory, so on a
// serverless host each instance counts separately: a guard rail, not a wall.

const DEFAULTS = Object.freeze({
  // A real walk is one look every half minute or so. Ten a minute is generous.
  limit: 10,
  windowMs: 60_000,
});

export function createRateLimit({ limit, windowMs, now = () => Date.now() } = {}) {
  const max = limit ?? DEFAULTS.limit;
  const window = windowMs ?? DEFAULTS.windowMs;
  let hits = new Map();

  return (req, res, next) => {
    const at = now();
    const key = req.ip ?? "unknown";
    const recent = (hits.get(key) ?? []).filter((time) => at - time < window);

    // Forget visitors who have gone quiet, so the map cannot grow forever.
    hits = new Map([...hits].filter(([, times]) => times.some((time) => at - time < window)));

    if (recent.length >= max) {
      const waitSeconds = Math.ceil((window - (at - recent[0])) / 1000);
      res.set("Retry-After", String(waitSeconds));
      return res.status(429).json({
        error: `Too many looks in a row. Wait ${waitSeconds} seconds, then look around again.`,
      });
    }

    hits = new Map(hits).set(key, [...recent, at]);
    return next();
  };
}
