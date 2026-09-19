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
          // Which photo it is visible in. That photo's compass heading is the
          // bearing we point the marker at, so this must be accurate.
          photo: { type: Type.INTEGER },
          description: { type: Type.STRING },
          promise: { type: Type.NUMBER },
        },
        required: ["photo", "description", "promise"],
      },
    },
    recommendation: {
      type: Type.OBJECT,
      nullable: true,
      properties: {
        option_index: { type: Type.INTEGER },
        why: { type: Type.STRING },
      },
      required: ["option_index", "why"],
    },
    spoken: { type: Type.STRING },
    arrived: { type: Type.BOOLEAN },
    confidence: { type: Type.NUMBER },
  },
  required: ["here", "options", "spoken", "arrived", "confidence"],
};

const noMapYet = `
Nothing has been mapped yet. This is the first stop, so there is no history to
match against: work only from what the photos show.
`;

const withMap = (nodes) => `
Places already surveyed, oldest first. "options" records the ways out seen there
and whether each was taken, so any option still marked unexplored is somewhere
nobody has been. "leads_to" says which place an option was found to connect to.

${JSON.stringify(nodes, null, 2)}

Two things follow from having this map.

First, if these photos show a place already in that list, set same_as_node_id to
it. Be strict: matching somewhere that merely looks similar sends the explorer in
circles. Leave it null unless the specific features line up.

Second, if the destination is a place already on the map, you are not guessing any
more. Work out the route over the recorded connections and recommend the option
that starts it. Say in "spoken" that this is a way already walked, not a hunch.
`;

const photoList = (headings) =>
  headings.map((heading, index) => `  Photo ${index + 1}: facing ${heading} degrees`).join("\n");

export const surveyPrompt = ({ nodes, destination, headings }) => `
Someone is on foot and does not know the way. The attached photos are a pan of
everything visible from where they are standing, taken in order as they turned.
Each was shot facing a different compass heading:

${photoList(headings)}

${nodes.length === 0 ? noMapYet : withMap(nodes)}

They are trying to reach: "${destination}"

Do four things.

1. Describe where they are standing, in "here". Lead with whatever would let
   someone recognise this exact spot again from a different angle. Rate
   distinctiveness 0 for somewhere featureless and interchangeable, 1 for
   unmistakable.

2. List every way out you can actually see in "options". For each, set "photo" to
   the number of the photo it appears in — that photo's heading is how the
   explorer will be pointed at it, so getting it right matters more than the
   wording. Only list somewhere the photos genuinely show you can walk: a path, an
   opening, a slope, a corridor, a doorway. Do not invent exits to fill the list.
   Rate "promise" 0 to 1 for how likely it leads to the destination, and say what
   makes you think so in the description.

3. Recommend one option by its position in the list you just wrote, 1 for the
   first. Prefer somewhere unexplored while the destination has not been found.
   If every way out is a dead end, leave recommendation null and say so.

4. Write "spoken": one or two sentences read aloud to someone who cannot look at a
   screen. Say where they are and what to do next. Describe the way to go by what
   it looks like, not by photo number, compass degrees, ids or field names.

Before all of that, check the photos against what they are looking for. Set
"arrived" true when the thing they asked for is visibly there — if they wanted a
road and a road is in shot, they have arrived, even if they are not standing on it
yet. Say so first in "spoken" and leave recommendation null. Do not send someone
onward past the thing they were looking for. Equally, do not call it arrived
because somewhere looks promising: it has to be in the photos.

Set "confidence" honestly — low when the scenery is generic and repetitive, or
when the photos are too dark or blurred to judge. Guessing confidently is worse
than admitting the view gives you little.
`;
