import { test } from "node:test";
import assert from "node:assert/strict";
import { createRateLimit } from "../lib/rateLimit.js";

// Runs the middleware against a fake request and reports what it did.
const hit = (limiter, ip) => {
  let status = null;
  let body = null;
  let passed = false;
  const res = {
    set: () => res,
    status: (code) => { status = code; return res; },
    json: (payload) => { body = payload; return res; },
  };
  limiter({ ip }, res, () => { passed = true; });
  return { passed, status, body };
};

test("allows up to the limit, then refuses with a readable message", () => {
  let clock = 0;
  const limiter = createRateLimit({ limit: 2, windowMs: 60_000, now: () => clock });
  assert.equal(hit(limiter, "a").passed, true);
  assert.equal(hit(limiter, "a").passed, true);
  const refused = hit(limiter, "a");
  assert.equal(refused.passed, false);
  assert.equal(refused.status, 429);
  assert.match(refused.body.error, /Too many looks/);
});

test("each visitor has their own allowance", () => {
  const limiter = createRateLimit({ limit: 1, windowMs: 60_000, now: () => 0 });
  assert.equal(hit(limiter, "a").passed, true);
  assert.equal(hit(limiter, "b").passed, true);
  assert.equal(hit(limiter, "a").passed, false);
});

test("the allowance comes back once the window has passed", () => {
  let clock = 0;
  const limiter = createRateLimit({ limit: 1, windowMs: 1000, now: () => clock });
  hit(limiter, "a");
  clock = 1001;
  assert.equal(hit(limiter, "a").passed, true);
});
