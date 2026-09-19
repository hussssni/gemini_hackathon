import { Type } from "@google/genai";

export const landmarkSchema = {
  type: Type.OBJECT,
  properties: {
    description: { type: Type.STRING },
    distinctive_features: { type: Type.ARRAY, items: { type: Type.STRING } },
    distinctiveness: { type: Type.NUMBER },
    is_decision_point: { type: Type.BOOLEAN },
    options_seen: { type: Type.ARRAY, items: { type: Type.STRING } },
  },
  required: ["description", "distinctive_features", "distinctiveness", "is_decision_point"],
};

export const locateSchema = {
  type: Type.OBJECT,
  properties: {
    matched_landmark_id: { type: Type.STRING, nullable: true },
    confidence: { type: Type.NUMBER },
    reasoning: { type: Type.STRING },
    need_more_views: { type: Type.BOOLEAN },
  },
  required: ["matched_landmark_id", "confidence", "reasoning", "need_more_views"],
};

export const routeSchema = {
  type: Type.OBJECT,
  properties: {
    summary: { type: Type.STRING },
    steps: { type: Type.ARRAY, items: { type: Type.STRING } },
    warnings: { type: Type.ARRAY, items: { type: Type.STRING } },
  },
  required: ["summary", "steps"],
};

export const landmarkPrompt = ({ heading, steps }) => `
You are the memory of a hiker's navigation assistant. The attached photo was taken
while walking OUT along a route (compass heading ${heading} degrees, ${steps} steps
since the start).

Describe the single most useful landmark visible so the hiker can recognise this
spot later, possibly from the opposite direction. Prefer permanent, distinctive
features (trees, rocks, signs, buildings, water, path shape) over transient ones
(people, lighting). Rate distinctiveness 0 (generic, e.g. plain corridor) to 1
(unmistakable). Mark is_decision_point true if the path forks or a wrong turn is
plausible, and list the options seen.
`;

export const locatePrompt = ({ landmarks }) => `
A hiker is lost. The attached photos show what they currently see (several angles).
Below are the landmarks recorded on the way out, in order.

${JSON.stringify(landmarks, null, 2)}

Decide which recorded landmark the hiker is at or nearest to. Return its id, or null
if nothing matches. Be honest about confidence (0 to 1). If confidence is low or the
scene is generic, set need_more_views to true and explain what to look for.
`;

export const routePrompt = ({ landmarks, currentLandmarkId, facingHeading }) => `
A hiker is at landmark "${currentLandmarkId}" facing compass heading ${facingHeading}
and must return to the START. Landmarks recorded on the way out, in order from the
start (heading = walking direction when recorded; steps = cumulative step count):

${JSON.stringify(landmarks, null, 2)}

Write the way back: walk the route in REVERSE, from the current landmark back to the
first. Because the hiker travels the opposite direction, left and right are flipped
relative to how each landmark was described. Give short spoken-style steps that name
the landmark to look for and roughly how far (use step differences). Call out decision
points where a wrong turn is likely in warnings.
`;
