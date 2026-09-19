import { GoogleGenAI } from "@google/genai";

const MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";

let client = null;

function getClient() {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY is not set");
  }
  client ??= new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  return client;
}

export async function generateJson({ prompt, images = [], schema }) {
  const parts = [
    { text: prompt },
    ...images.map((data) => ({ inlineData: { mimeType: "image/jpeg", data } })),
  ];

  const response = await getClient().models.generateContent({
    model: MODEL,
    contents: [{ role: "user", parts }],
    config: { responseMimeType: "application/json", responseSchema: schema },
  });

  return JSON.parse(response.text);
}
