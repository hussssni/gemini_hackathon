import express from "express";
import { z } from "zod";
import { generateJson, MODELS } from "./lib/gemini.js";
import { isRateLimit } from "./lib/retry.js";
import {
  landmarkPrompt, landmarkSchema,
  locatePrompt, locateSchema,
  routePrompt, routeSchema,
} from "./lib/prompts.js";

const PORT = Number(process.env.PORT) || 3000;
const MAX_IMAGE_CHARS = 2_000_000;
const MAX_LOCATE_IMAGES = 6;

const image = z.string().min(1).max(MAX_IMAGE_CHARS);
const heading = z.number().min(0).max(360);

const landmarkRecord = z.object({
  id: z.string(),
  description: z.string(),
  distinctive_features: z.array(z.string()).default([]),
  is_decision_point: z.boolean().default(false),
  options_seen: z.array(z.string()).default([]),
  heading: heading,
  steps: z.number().int().nonnegative(),
});

const bodies = {
  landmark: z.object({ image, heading, steps: z.number().int().nonnegative() }),
  locate: z.object({
    images: z.array(image).min(1).max(MAX_LOCATE_IMAGES),
    landmarks: z.array(landmarkRecord).min(1),
  }),
  route: z.object({
    landmarks: z.array(landmarkRecord).min(1),
    currentLandmarkId: z.string(),
    facingHeading: heading,
  }),
};

function handler(schemaKey, run) {
  return async (req, res) => {
    const parsed = bodies[schemaKey].safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid request", details: parsed.error.issues });
    }
    try {
      res.json(await run(parsed.data));
    } catch (err) {
      console.error(`[${schemaKey}]`, err);
      // Quota is the one failure the user can act on, so name it. Everything
      // else stays generic; details belong in the server log, not the client.
      if (isRateLimit(err)) {
        return res.status(429).json({
          error: "Gemini's per-minute quota is used up. Wait about a minute, then try again.",
        });
      }
      res.status(502).json({ error: "Gemini request failed" });
    }
  };
}

const app = express();
app.use(express.json({ limit: "12mb" }));
app.use(express.static("public"));

// Landmark capture happens mid-walk, so latency matters more than deliberation.
app.post("/api/landmark", handler("landmark", ({ image, heading, steps }) =>
  generateJson({
    prompt: landmarkPrompt({ heading, steps }),
    images: [image],
    schema: landmarkSchema,
    thinkingBudget: 0,
    model: MODELS.PERCEPTION,
  })));

app.post("/api/locate", handler("locate", ({ images, landmarks }) =>
  generateJson({ prompt: locatePrompt({ landmarks }), images, schema: locateSchema })));

app.post("/api/route", handler("route", (data) =>
  generateJson({ prompt: routePrompt(data), schema: routeSchema })));

app.listen(PORT, () => console.log(`Breadcrumb running on http://localhost:${PORT}`));
