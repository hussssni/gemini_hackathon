import { Type } from "@google/genai";

// One survey per stop. It does everything at once: describe where you are,
// recognise the place if you have stood here before, list the ways out, and
// pick one. Folding it into a single call keeps the loop fast and cheap.
export const surveySchema = {
  type: Type.OBJECT,
  properties: {
    here: {
      type: Type.OBJECT,
      properties: {
        description: { type: Type.STRING },
        features: { type: Type.ARRAY, items: { type: Type.STRING } },
        distinctiveness: { type: Type.NUMBER },
      },
      required: ["description", "features", "distinctiveness"],
    },
    // Loop closure: set when this is somewhere already on the map, which is
    // what turns a line of stops into a graph.
    same_as_node_id: { type: Type.STRING, nullable: true },
    options: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          direction: { type: Type.STRING, enum: ["ahead", "left", "right", "back"] },
          description: { type: Type.STRING },
          promise: { type: Type.NUMBER },
        },
        required: ["direction", "description", "promise"],
      },
    },
    recommendation: {
      type: Type.OBJECT,
      nullable: true,
      properties: {
        direction: { type: Type.STRING, enum: ["ahead", "left", "right", "back"] },
        why: { type: Type.STRING },
      },
      required: ["direction", "why"],
    },
    spoken: { type: Type.STRING },
    arrived: { type: Type.BOOLEAN },
    confidence: { type: Type.NUMBER },
  },
  required: ["here", "options", "spoken", "arrived", "confidence"],
};

const noMapYet = `
Nothing has been mapped yet. This is the first stop, so there is no history to
match against and no route to retrace: work only from what the photos show.
`;

const withMap = (nodes) => `
Places already surveyed, oldest first. "options" records the ways out that were
seen there and whether each was taken, so any option still marked unexplored is
somewhere nobody has been. "steps" is the dead-reckoned step count when it was
recorded, and drifts, so trust the photos over the numbers.

${JSON.stringify(nodes, null, 2)}

If these photos show a place already in that list, set same_as_node_id to it. Be
strict: matching a place you have merely walked past something similar to sends
the explorer in circles. Leave it null unless the specific features line up.
`;

export const surveyPrompt = ({ nodes, destination, heading, facing }) => `
Someone is on foot and does not know the way. The attached photos are a pan of
everything visible from where they are standing right now, taken left to right.
They are facing compass heading ${heading}.

${nodes.length === 0 ? noMapYet : withMap(nodes)}

They are trying to reach: "${destination || "anywhere they can get their bearings, ideally a road, building or landmark"}"

Do four things.

1. Describe where they are standing, in "here". Lead with whatever would let
   someone recognise this exact spot again from a different angle. Rate
   distinctiveness 0 for somewhere featureless and interchangeable, 1 for
   unmistakable.

2. List every way out you can actually see in "options". Use "direction" relative
   to the way they are facing: ahead, left, right, or back the way they came. Only
   list a direction where the photos genuinely show somewhere to walk — a path,
   an opening, a slope, a corridor. Do not invent exits to fill the list. Rate
   "promise" 0 to 1 for how likely that direction leads to the destination, and
   say what makes you think so in the description.

3. Recommend one option to take, with an honest "why". Prefer somewhere unexplored
   when the destination has not been found. If every direction is a dead end or
   they should go back, say that instead and leave recommendation null.

4. Write "spoken": one or two sentences read aloud to someone who cannot look at
   a screen. Say where they are and what to do next. No ids, no compass degrees,
   no JSON field names. Plain speech.

Before anything else, check the photos against what they are looking for. Set
"arrived" true when the thing they asked for is visibly there — if they wanted a
road and a road is in shot, they have arrived, even if they are not standing on it
yet. Say so first in "spoken", and leave recommendation null. Do not keep sending
someone onward past the thing they were looking for. Equally, do not call it
arrived because somewhere looks promising or similar: it has to be in the photos.

Set "confidence" honestly — low when the scenery is generic and repetitive, or
when the photos are too dark or blurred to judge. Guessing confidently is worse
than admitting the view gives you little.
`;
