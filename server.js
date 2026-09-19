import express from "express";
import { z } from "zod";
import { generateJson, MODELS } from "./lib/gemini.js";
import { isRateLimit } from "./lib/retry.js";
import { surveyParts, surveySchema } from "./lib/prompts.js";

const PORT = Number(process.env.PORT) || 3000;
const MAX_IMAGE_CHARS = 2_000_000;
const MAX_PAN_FRAMES = 10;
const MAX_REFERENCES = 4;
const MAX_NODES = 60;

const frameRecord = z.object({
  image: z.string().min(1).max(MAX_IMAGE_CHARS),
  heading: z.number().min(0).max(360),
});

const optionRecord = z.object({
  bearing: z.number().min(0).max(360),
  description: z.string(),
  status: z.enum(["unexplored", "taken"]),
  leads_to: z.string().nullable().default(null),
  // What came of walking it, so already-failed branches are never suggested.
  outcome: z.enum(["open", "dead-end", "loops-back"]).nullable().default(null),
});

const nodeRecord = z.object({
  id: z.string(),
  description: z.string(),
  features: z.array(z.string()).default([]),
  steps: z.number().int().nonnegative(),
  is_current: z.boolean().default(false),
  times_visited: z.number().int().positive().default(1),
  options: z.array(optionRecord).default([]),
});

const referenceRecord = z.object({
  id: z.string(),
  image: z.string().min(1).max(MAX_IMAGE_CHARS),
});

const surveyBody = z.object({
  frames: z.array(frameRecord).min(1).max(MAX_PAN_FRAMES),
  nodes: z.array(nodeRecord).max(MAX_NODES).default([]),
  destination: z.string().trim().min(1).max(200),
  // Reference shots of places already mapped, for recognising a return.
  memory: z.array(referenceRecord).max(MAX_REFERENCES).default([]),
});

/**
 * Turns each option's photo number into the compass bearing that photo was shot
 * at, and drops any option pointing at a photo that does not exist. A bearing
 * invented from a bad index would aim the marker at nothing.
 */
function resolveBearings(survey, frames) {
  // Keep the original position of each option: the model's recommendation
  // indexes into the list it wrote, not into whatever survives the filter.
  const kept = (survey.options ?? [])
    .map((option, index) => ({ option, originalIndex: index + 1 }))
    .filter(({ option }) => Number.isInteger(option.photo)
      && option.photo >= 1
      && option.photo <= frames.length);

  const options = kept.map(({ option }) => ({
    bearing: frames[option.photo - 1].heading,
    description: option.description,
    promise: option.promise ?? 0,
  }));

  if (survey.arrived || options.length === 0) {
    return { ...survey, options, recommendation: null };
  }

  const asked = survey.recommendation?.option_index;
  const position = kept.findIndex((entry) => entry.originalIndex === asked);
  // A dropped or missing pick still leaves somewhere to walk, so fall back to
  // the most promising option rather than leaving the marker with no bearing.
  const chosen = position >= 0
    ? position
    : options.reduce((best, option, index) =>
      option.promise > options[best].promise ? index : best, 0);

  return {
    ...survey,
    options,
    recommendation: {
      why: survey.recommendation?.why ?? options[chosen].description,
      option_index: chosen + 1,
      bearing: options[chosen].bearing,
    },
  };
}

const app = express();
app.use(express.json({ limit: "12mb" }));
app.use(express.static("public"));

app.post("/api/survey", async (req, res) => {
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

  const { frames, nodes, destination, memory } = parsed.data;

  try {
    const survey = await generateJson({
      pieces: surveyParts({ nodes, destination, frames, memory }),
      schema: surveySchema,
      model: MODELS.REASONING,
    });
    // The model picks options by photo number; resolve those to the bearings
    // the phone actually recorded, so the client never repeats the lookup.
    res.json(resolveBearings(survey, frames));
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
