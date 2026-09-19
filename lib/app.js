import express from "express";
import { z } from "zod";
import { generateJson, MODELS } from "./gemini.js";
import { isRateLimit } from "./retry.js";
import { surveyParts, surveySchema } from "./prompts.js";
import { resolveBearings } from "./bearings.js";
import { createRateLimit } from "./rateLimit.js";

const MAX_IMAGE_CHARS = 2_000_000;
const MAX_PAN_FRAMES = 10;
const MAX_REFERENCE_PLACES = 6;
const MAX_VIEWS_PER_PLACE = 3;
const MAX_NODES = 60;
const DEFAULT_FOV_DEGREES = 55;

const frameRecord = z.object({
  image: z.string().min(1).max(MAX_IMAGE_CHARS),
  heading: z.number().min(0).max(360),
});

const optionRecord = z.object({
  bearing: z.number().min(0).max(360),
  side: z.string().max(20).default("ahead"),
  description: z.string().max(500),
  // What came of it, derived from the map on the phone.
  state: z.enum(["untried", "ruled-out", "way-back", "dead-end", "loops-back", "exhausted", "open"]),
  leads_to: z.string().max(20).nullable().default(null),
});

const nodeRecord = z.object({
  id: z.string().max(20),
  description: z.string().max(1000),
  features: z.array(z.string().max(200)).max(20).default([]),
  is_current: z.boolean().default(false),
  is_fork: z.boolean().default(false),
  times_visited: z.number().int().positive().default(1),
  options: z.array(optionRecord).max(12).default([]),
});

const referenceRecord = z.object({
  id: z.string().max(20),
  images: z.array(z.string().min(1).max(MAX_IMAGE_CHARS)).min(1).max(MAX_VIEWS_PER_PLACE),
});

const surveyBody = z.object({
  frames: z.array(frameRecord).min(1).max(MAX_PAN_FRAMES),
  // Horizontal field of view of the frames, so an exit's position within a
  // photo can be turned into degrees.
  fov: z.number().min(20).max(120).default(DEFAULT_FOV_DEGREES),
  nodes: z.array(nodeRecord).max(MAX_NODES).default([]),
  destination: z.string().trim().min(1).max(200),
  // Reference shots of places already mapped, for recognising a return.
  memory: z.array(referenceRecord).max(MAX_REFERENCE_PLACES).default([]),
  // How the explorer got here: the place they left and the way they walked.
  arrival: z.object({
    from_node_id: z.string().max(20),
    bearing: z.number().min(0).max(360),
  }).nullable().default(null),
  // Set when they were deliberately sent back to a known place.
  expected_node_id: z.string().max(20).nullable().default(null),
});

/**
 * Sets up routes on an Express app. `generate` is the Gemini call, injected so
 * the route can be exercised end to end without spending quota. The app itself
 * is created by the caller: Vercel only deploys an entry file that imports
 * express directly.
 */
export function configureApp(app, { generate = generateJson, rateLimit = createRateLimit() } = {}) {
  // Behind Vercel or a tunnel, the visitor's address arrives in a header set by
  // the one proxy in front; trusting that hop is what lets the limit tell
  // visitors apart.
  app.set("trust proxy", 1);
  app.use(express.json({ limit: "12mb" }));
  app.use(express.static("public"));
  app.post("/api/survey", rateLimit, (req, res) => handleSurvey(req, res, generate));
  return app;
}

export const createApp = (deps) => configureApp(express(), deps);

async function handleSurvey(req, res, generate) {
  const parsed = surveyBody.safeParse(req.body);
  if (!parsed.success) {
    // Name the offending field. "Invalid request" alone hides which end is
    // wrong, and a client and server that disagree look like a model failure.
    const issue = parsed.error.issues[0];
    console.error("[survey] rejected", parsed.error.issues);
    return res.status(400).json({
      error: `Invalid request: ${issue.path.join(".") || "body"} ${issue.message}`,
      details: parsed.error.issues,
    });
  }

  const { frames, fov, ...context } = parsed.data;

  try {
    const survey = await generate({
      pieces: surveyParts({ ...context, frames }),
      schema: surveySchema,
      model: MODELS.REASONING,
    });
    // The model places options by photo number and position in the photo;
    // resolve those to compass bearings from what the phone recorded.
    res.json(resolveBearings(survey, frames, fov));
  } catch (err) {
    console.error("[survey]", err);
    // Quota is the one failure the user can act on, so name it. Everything
    // else stays generic; details belong in the server log, not the client.
    if (isRateLimit(err)) {
      return res.status(429).json({
        error: "Gemini's quota is used up. Wait a minute, then look around again.",
      });
    }
    res.status(502).json({ error: "Gemini could not read the surroundings." });
  }
}
