import express from "express";
import { z } from "zod";
import { generateJson, MODELS } from "./lib/gemini.js";
import { isRateLimit } from "./lib/retry.js";
import { surveyPrompt, surveySchema } from "./lib/prompts.js";

const PORT = Number(process.env.PORT) || 3000;
const MAX_IMAGE_CHARS = 2_000_000;
const MAX_IMAGES = 6;
const MAX_NODES = 60;

const image = z.string().min(1).max(MAX_IMAGE_CHARS);

const optionRecord = z.object({
  direction: z.enum(["ahead", "left", "right", "back"]),
  description: z.string(),
  status: z.enum(["unexplored", "taken"]),
  leads_to: z.string().nullable().default(null),
});

const nodeRecord = z.object({
  id: z.string(),
  description: z.string(),
  features: z.array(z.string()).default([]),
  steps: z.number().int().nonnegative(),
  is_current: z.boolean().default(false),
  options: z.array(optionRecord).default([]),
});

const surveyBody = z.object({
  images: z.array(image).min(1).max(MAX_IMAGES),
  nodes: z.array(nodeRecord).max(MAX_NODES).default([]),
  destination: z.string().trim().max(200).default(""),
  heading: z.number().min(0).max(360),
});

const app = express();
app.use(express.json({ limit: "12mb" }));
app.use(express.static("public"));

app.post("/api/survey", async (req, res) => {
  const parsed = surveyBody.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid request", details: parsed.error.issues });
  }

  const { images, nodes, destination, heading } = parsed.data;

  try {
    const survey = await generateJson({
      prompt: surveyPrompt({ nodes, destination, heading }),
      images,
      schema: surveySchema,
      model: MODELS.REASONING,
    });
    res.json(survey);
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
});

app.listen(PORT, () => console.log(`Breadcrumb running on http://localhost:${PORT}`));
