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
Places already surveyed, oldest first. Every way out ever seen is recorded, with
what became of it:

  status "unexplored"  nobody has walked it
  outcome "open"       it was walked and led somewhere new
  outcome "dead-end"   it was walked and led nowhere
  outcome "loops-back" it was walked and came back to somewhere already mapped

${JSON.stringify(nodes, null, 2)}

Three things follow from having this map.

First, if these photos show a place already in that list, set same_as_node_id to
it. Where a place has a reference photo, decide by the photographs alone and
ignore how thin or generic its written description is — a place recorded as
"Place one" with a photo that plainly matches the pan is still a match, and the
description is only a fallback for places that have no photo. What must not
happen is matching on a family resemblance: two similar corridors, two ordinary
clearings. Look for the same individual objects in the same arrangement.

Second, never recommend a way out whose outcome is "dead-end" or "loops-back".
They have been tried and they failed. If the explorer is back at a junction they
have stood at before, say so plainly in "spoken" — that they are back where they
were, which way already failed, and which one you are sending them down now. Being
told you have gone in a circle is worth more than being told nothing. If every way
out of a place has been tried and failed, say that and send them back to the
nearest junction that still has something untried.

Third, if the destination is a place already on the map, you are not guessing any
more. Work out the route over the recorded connections and recommend the option
that starts it. Say in "spoken" that this is a way already walked, not a hunch.
`;

const intro = (panCount) => `
Someone is on foot and does not know the way. The next ${panCount} photos are a
pan of everything visible from where they are standing, taken in order as they
turned. Each is labelled with its number and the compass heading it was shot at.
`;

const memoryIntro = `
The photos that follow are not what the explorer can see now. Each one was taken
at a place already on the map and is labelled with that place's id.

Compare the pan against them directly. They show the same places, but shot from
wherever the explorer happened to be standing at the time, so expect a different
angle, different light and a different framing. Match on things that do not
change: the shape of a rock, the arrangement of doors, a distinctive tree, how
the ground slopes. Do not match on where something sits in the frame.
`;

/**
 * The prompt as an ordered list of text and images, so every photo is named in
 * the sentence immediately before it and can be referred to by number later.
 */
export const surveyParts = ({ nodes, destination, frames, memory = [] }) => [
  { text: intro(frames.length) },
  ...frames.flatMap((frame, index) => [
    { text: `Photo ${index + 1}, facing ${frame.heading} degrees:` },
    { image: frame.image },
  ]),
  ...(memory.length === 0 ? [] : [
    { text: memoryIntro },
    ...memory.flatMap((reference) => [
      { text: `Reference photo of the place recorded as "${reference.id}":` },
      { image: reference.image },
    ]),
  ]),
  { text: surveyInstructions({ nodes, destination, panCount: frames.length }) },
];

const surveyInstructions = ({ nodes, destination, panCount }) => `
${nodes.length === 0 ? noMapYet : withMap(nodes)}

They are trying to reach: "${destination}"

Do four things.

1. Describe where they are standing, in "here". Lead with whatever would let
   someone recognise this exact spot again from a different angle. Rate
   distinctiveness 0 for somewhere featureless and interchangeable, 1 for
   unmistakable.

2. List every way out you can actually see in "options", working through pan
   photos 1 to ${panCount} in order so that nothing behind the explorer is
   missed. For each, set "photo" to the number of the pan photo it appears in — that photo's heading is how the
   explorer will be pointed at it, so getting it right matters more than the
   wording. Only list somewhere the photos genuinely show you can walk: a path, an
   opening, a slope, a corridor, a doorway. Do not invent exits to fill the list,
   and never give a reference photo's number here — only the pan shows where the
   explorer can walk right now. Rate "promise" 0 to 1 for how likely it leads to
   the destination, and say what makes you think so in the description.

3. Recommend one option by its position in the list you just wrote, 1 for the
   first. Prefer somewhere unexplored while the destination has not been found.
   If every way out is a dead end, leave recommendation null and say so.

4. Write "spoken", which is read aloud to someone who may not be able to see at
   all. Write it for them:

   - Keep it to two short sentences. Say what is around them, then anything they
     need to be careful of.
   - Never say "as you can see", "over there", "the one on the right of the photo"
     or anything else that needs eyes or a screen. Never say photo numbers,
     compass degrees, ids or field names.
   - Describe a way out by something they could hear, feel or walk into — a slope,
     a doorway, a gap between walls, traffic noise, gravel underfoot — rather than
     by colour or by what it looks like from a distance.
   - Do not say which way to turn. The app measures the turn from the phone and
     says that part itself, so it is correct however they are standing.
   - Mention anything underfoot or in the way that would matter to someone who
     cannot see it: steps, a drop, water, loose rock, a road to cross.

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
