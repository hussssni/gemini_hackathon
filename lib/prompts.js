import { Type } from "@google/genai";

// One survey per stop. It does everything at once: describe where you are,
// recognise the place if you have stood here before, list the ways out, and
// pick one. Folding it into a single call keeps the loop fast and cheap.
//
// The phone enforces the rules that follow from the map (never the way back,
// never a failed branch, backtrack when nothing is left). The model's job is
// the part only it can do: read the photos.
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
    match_confidence: { type: Type.NUMBER },
    options: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          // Which pan photo it is in, and where across that photo (0 = left
          // edge, 1 = right edge). Together with the photo's heading, that is
          // the bearing the marker points at.
          photo: { type: Type.INTEGER },
          x: { type: Type.NUMBER },
          description: { type: Type.STRING },
          promise: { type: Type.NUMBER },
          is_way_back: { type: Type.BOOLEAN },
        },
        required: ["photo", "x", "description", "promise", "is_way_back"],
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
  required: ["here", "same_as_node_id", "match_confidence", "options", "spoken", "arrived", "confidence"],
};

const noMapYet = `
Nothing has been mapped yet. This is the first stop, so there is no history to
match against: work only from what the photos show. Set same_as_node_id to null
and match_confidence to 0.
`;

const withMap = (nodes) => `
Places already surveyed, oldest first. Every way out ever seen at each is listed
with its compass bearing, which side it is on for someone who walked in, and what
became of it ("untried", "way-back", "dead-end", "loops-back", "exhausted",
"open", or "ruled-out" — the explorer themselves said it is not the way):

${JSON.stringify(nodes)}

If these photos show a place already in that list, set same_as_node_id to it and
match_confidence to how sure you are, 0 to 1. Decide by the reference photographs
where there are any, and ignore how thin a written description is. What must not
happen is matching on a family resemblance: two similar corridors, two ordinary
clearings. Only match when you can point to the same individual objects in the
same arrangement — say which in "here.description". A false match wrecks the map
far worse than a missed one, so when unsure, leave it null and give a low number.
`;

const arrivalNote = (arrival, expectedId) => {
  if (!arrival) return "";
  const back = Math.round((arrival.bearing + 180) % 360);
  const expected = expectedId
    ? ` They were deliberately sent back toward "${expectedId}", so check that place's reference photos first — but only match it if the photos agree.`
    : "";
  return `
They just walked here from "${arrival.from_node_id}", heading about
${Math.round(arrival.bearing)} degrees, so the way they came is behind them at about
${back} degrees. Include that way in "options" if you can see it, with
is_way_back true, so it is recorded as where they came from rather than as
somewhere new. Every other option has is_way_back false.${expected}
`;
};

const intro = (panCount) => `
Someone is on foot and does not know the way. The next ${panCount} photos are a
pan of everything visible from where they are standing, taken in order as they
turned. Each is labelled with its number and the compass heading its centre was
facing.
`;

const memoryIntro = `
The photos that follow are not what the explorer can see now. Each was taken at
a place already on the map and is labelled with that place's id; a place may
have several, facing different ways.

Compare the pan against them directly. They were shot from wherever the explorer
stood at the time, so expect a different angle, light and framing. Match on
things that do not change: the shape of a rock, the arrangement of doors, a
distinctive tree, how the ground slopes. Do not match on where something sits in
the frame.
`;

/**
 * The prompt as an ordered list of text and images, so every photo is named in
 * the sentence immediately before it and can be referred to by number later.
 */
export const surveyParts = ({
  nodes, destination, frames, memory = [], arrival = null, expected_node_id: expectedId = null,
}) => [
  { text: intro(frames.length) },
  ...frames.flatMap((frame, index) => [
    { text: `Photo ${index + 1}, centre facing ${frame.heading} degrees:` },
    { image: frame.image },
  ]),
  ...(memory.length === 0 ? [] : [
    { text: memoryIntro },
    ...memory.flatMap((place) => place.images.flatMap((image, view) => [
      { text: `Reference photo ${view + 1} of the place recorded as "${place.id}":` },
      { image },
    ])),
  ]),
  { text: surveyInstructions({ nodes, destination, panCount: frames.length, arrival, expectedId }) },
];

const surveyInstructions = ({ nodes, destination, panCount, arrival, expectedId }) => `
${nodes.length === 0 ? noMapYet : withMap(nodes)}
${arrivalNote(arrival, expectedId)}
They are trying to reach: "${destination}"

Do four things.

1. Describe where they are standing, in "here". Lead with whatever would let
   someone recognise this exact spot again from a different angle. Rate
   distinctiveness 0 for somewhere featureless and interchangeable, 1 for
   unmistakable.

2. List every distinct way out you can actually see in "options", working
   through pan photos 1 to ${panCount} in order so nothing behind the explorer is
   missed. Neighbouring photos overlap, so list each way out once, from the
   photo where it is most central. For each:
   - "photo": the pan photo it is in. Never a reference photo's number.
   - "x": where the opening's centre is across that photo, 0 at the left edge,
     0.5 in the middle, 1 at the right edge. Be precise: this is what the
     explorer is physically pointed at, and an error here sends them into a
     wall.
   - "promise": 0 to 1, how likely it leads to the destination, and say what
     makes you think so in the description. Use real evidence: a slope down
     toward traffic, signs, light at the end of a corridor, a worn path.
   Only list somewhere the photos genuinely show you can walk: a path, an
   opening, a slope, a corridor, a doorway. Do not invent exits.

3. Recommend one option by its position in your list, 1 for the first, and say
   why in one short sentence in "why", in words a blind person could use —
   "it slopes downhill toward traffic noise", not "the brighter one". Never
   recommend a way with is_way_back true, or one the map already shows as
   "dead-end", "loops-back", "exhausted" or "ruled-out": the phone will refuse
   it. A way that looks like one the explorer ruled out at this place is
   probably that same way. Prefer
   the most promising untried way. If none is left, leave recommendation null.

4. Write "spoken", read aloud to someone who may not be able to see at all.
   ONE short sentence: what is around them and anything underfoot or in the way
   that matters to someone who cannot see it — steps, a drop, water, loose
   rock, a road to cross. Do not say which way to go, whether they have been
   here before, or anything about forks: the phone says all of that itself.
   Never say photo numbers, degrees, ids, colours seen from afar, or anything
   that needs eyes or a screen.

Before all of that, check the photos against what they are looking for. Set
"arrived" true only when the thing they asked for is visibly there — if they
wanted a road and a road is in shot, they have arrived. Do not call it arrived
because somewhere looks promising: it has to be in the photos.

Set "confidence" honestly — low when the scenery is generic and repetitive, or
the photos are too dark or blurred to judge.
`;
