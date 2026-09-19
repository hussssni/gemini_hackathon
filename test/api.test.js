import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createApp } from "../lib/app.js";
import { surveyParts } from "../lib/prompts.js";

let server;
let base;
let calls = [];
let reply = null;

before(async () => {
  const app = createApp({
    generate: async (request) => {
      calls = [...calls, request];
      if (reply instanceof Error) throw reply;
      return reply;
    },
  });
  await new Promise((resolve) => { server = app.listen(0, resolve); });
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => new Promise((resolve) => server.close(resolve)));

const post = (body) => fetch(`${base}/api/survey`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

const frames = [{ image: "AAA", heading: 0 }, { image: "BBB", heading: 90 }];

test("a survey resolves in-photo positions into compass bearings", async () => {
  reply = {
    here: { description: "clearing", features: [], distinctiveness: 0.4 },
    same_as_node_id: null,
    match_confidence: 0,
    options: [{ photo: 2, x: 1, description: "path", promise: 0.7, is_way_back: false }],
    recommendation: { option_index: 1, why: "downhill" },
    spoken: "Soft ground.",
    arrived: false,
    confidence: 0.6,
  };
  const response = await post({ frames, fov: 60, destination: "a road" });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.options[0].bearing, 120);
  assert.equal(body.recommendation.bearing, 120);
});

test("the map, memory and arrival reach the prompt", async () => {
  calls = [];
  await post({
    frames,
    destination: "exit",
    nodes: [{
      id: "n1", description: "hall", is_fork: true,
      options: [{ bearing: 10, side: "left", description: "door", state: "dead-end" }],
    }],
    memory: [{ id: "n1", images: ["CCC", "DDD"] }],
    arrival: { from_node_id: "n1", bearing: 90 },
    expected_node_id: "n1",
  });
  const pieces = calls[0].pieces;
  const text = pieces.filter((piece) => piece.text).map((piece) => piece.text).join("\n");
  assert.match(text, /dead-end/);
  assert.match(text, /about\s+270 degrees/);
  assert.match(text, /deliberately sent back toward "n1"/);
  assert.equal(pieces.filter((piece) => piece.image).length, 4);
});

test("a malformed request names the bad field", async () => {
  const response = await post({ frames: [], destination: "x" });
  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /frames/);
});

test("quota errors are reported as such", async () => {
  reply = Object.assign(new Error("quota"), { status: 429 });
  const response = await post({ frames, destination: "x" });
  assert.equal(response.status, 429);
});

test("other model failures stay generic", async () => {
  reply = new Error("boom");
  const response = await post({ frames, destination: "x" });
  assert.equal(response.status, 502);
  assert.doesNotMatch((await response.json()).error, /boom/);
});

test("the first stop says there is no map yet", () => {
  const text = surveyParts({ nodes: [], destination: "x", frames })
    .map((piece) => piece.text ?? "").join("");
  assert.match(text, /Nothing has been mapped yet/);
  assert.doesNotMatch(text, /They just walked here/);
});
