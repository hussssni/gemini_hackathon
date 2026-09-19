import { GoogleGenAI } from "@google/genai";
import { withRetry } from "./retry.js";

// Free-tier quota is counted per model per DAY, so the model choice is a quota
// decision as much as a quality one. Both roles default to flash-lite: it is
// fast enough to describe a landmark mid-stride and still handles the reversed
// route. Split them (or point REASONING at gemini-3.6-flash, which is stronger
// but capped at 20 requests a day on the free tier) once billing is enabled.
export const MODELS = Object.freeze({
  PERCEPTION: process.env.GEMINI_MODEL_FAST || "gemini-3.1-flash-lite",
  REASONING: process.env.GEMINI_MODEL || "gemini-3.1-flash-lite",
});

let client = null;

function getClient() {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY is not set");
  }
  client ??= new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  return client;
}

/**
 * @param thinkingBudget Tokens the model may spend reasoning before answering.
 *   0 disables it, which roughly halves latency — right for plain perception,
 *   wrong for the spatial reasoning behind a reversed route.
 */
export async function generateJson({
  prompt,
  images = [],
  schema,
  thinkingBudget,
  model = MODELS.REASONING,
}) {
  const parts = [
    { text: prompt },
    ...images.map((data) => ({ inlineData: { mimeType: "image/jpeg", data } })),
  ];

  const response = await withRetry(() =>
    getClient().models.generateContent({
      model,
      contents: [{ role: "user", parts }],
      config: {
        responseMimeType: "application/json",
        responseSchema: schema,
        ...(thinkingBudget === undefined ? {} : { thinkingConfig: { thinkingBudget } }),
      },
    }));

  try {
    return JSON.parse(response.text);
  } catch (cause) {
    throw new Error("Gemini returned output that was not valid JSON", { cause });
  }
}
