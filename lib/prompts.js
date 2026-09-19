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

export const navigateSchema = {
  type: Type.OBJECT,
  properties: {
    // "retrace" walks known ground; "explore" gambles on an untaken branch.
    strategy: { type: Type.STRING, enum: ["retrace", "explore", "arrived"] },
    target_landmark_id: { type: Type.STRING, nullable: true },
    summary: { type: Type.STRING },
    steps: { type: Type.ARRAY, items: { type: Type.STRING } },
    frontier: {
      type: Type.OBJECT,
      nullable: true,
      properties: {
        from_landmark_id: { type: Type.STRING },
        option: { type: Type.STRING },
        why: { type: Type.STRING },
      },
      required: ["from_landmark_id", "option", "why"],
    },
    confidence: { type: Type.NUMBER },
    warnings: { type: Type.ARRAY, items: { type: Type.STRING } },
  },
  required: ["strategy", "summary", "steps", "confidence"],
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

const DESTINATION_START = "back to where I started";

export const navigatePrompt = ({ landmarks, currentLandmarkId, facingHeading, destination }) => `
This is the map of everywhere the walker has been, in the order they walked it.
"steps" is the cumulative step count from the start, "heading" is the compass
direction they were walking when it was recorded, and "options_seen" lists the
paths visible at that spot.

${JSON.stringify(landmarks, null, 2)}

Because this list is the route actually walked, any entry in "options_seen" that
does not lead to the next recorded landmark is an UNEXPLORED branch. Those branches
are the only leads available for anywhere the walker has not already been.

The walker has been positively identified at landmark id "${currentLandmarkId}",
facing compass heading ${facingHeading}. Treat that as fact.

They want to get to: "${destination || DESTINATION_START}"

Decide between three strategies and set "strategy" accordingly:

- "arrived" if they are already there. Return no steps.
- "retrace" if the destination is somewhere on the recorded map. This includes the
  start, which is the FIRST landmark. Route them over known ground, set
  target_landmark_id, and leave frontier null. Confidence should be high.
- "explore" if the destination is NOT on the recorded map. You cannot know where it
  is, so reason about which unexplored branch is the most promising lead, given what
  the destination is and what each branch looked like. Set frontier to the branch you
  picked, with an honest "why". Direct them to the decision point and then onto that
  branch. Confidence should be modest, and say plainly in the summary that this is a
  guess to try, not a known route.

Rules for the steps:
- Walking a recorded stretch in the opposite direction FLIPS left and right relative
  to how it was described. Account for this whenever you reverse along the route.
- These lines are spoken aloud. Never mention landmark ids, compass degrees, or JSON
  field names. Describe landmarks by what they look like.
- Give rough distances in steps, using the differences between step counts.
- Put anywhere a wrong turn is plausible into warnings.
`;
