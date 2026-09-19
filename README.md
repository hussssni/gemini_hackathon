# Breadcrumb

Lost with no map and no signal? Point your phone at your surroundings. Gemini reads
what it sees, tells you which way to try, and draws the map as you go.

Built for EmberHacks 2026.

## How it works

There is no setup walk. You start where you are, already lost.

1. **Look around.** You pan the camera through everything visible from where you
   stand. Those frames go to Gemini with the map so far and what you are looking for.
2. **Gemini reads the place.** In one call it describes where you are, recognises the
   spot if you have stood here before, lists every way out it can actually see, and
   rates how promising each one looks for your destination.
3. **It picks one and says it aloud**, and drops a marker over the camera feed at
   the bearing it means. The marker is pinned to the compass, not the screen, so
   turning the phone sweeps it across the view until it settles on the way to walk.
   "Take the left path" stops meaning anything the moment you turn around; a marker
   you can physically hunt for does not.
4. **You walk that way and look around again.** The new stop joins the map, linked to
   the one you left. Repeat until it tells you that what you were looking for is in
   shot — you say up front what you are trying to find, and every survey is checked
   against it.

The map grows a node at a time. Dashed stubs show the ways nobody has taken yet, so
at a glance you can see where there is still left to try — and the highlighted one is
what Gemini suggests next.

### Why this needs Gemini

The hard parts are all judgement calls on a photograph. Which of these gaps in the
trees is a path and which is just a gap. Whether the slope descending toward traffic
noise beats the one climbing a ridge when you are looking for a road. Whether this
clearing is the clearing you passed twenty minutes ago, seen from the other side.

That last one is what turns a line of stops into a graph: recognising a place from a
different angle closes the loop, and the map stops being a trail and starts being a
map. None of it reduces to sensor readings.

### What it will not do

It cannot see around corners. It chooses between the ways out that are actually
visible from where you stand, and reasons about where they probably lead. Step counts
come from the phone's accelerometer and drift, so the map is the right shape but not
a survey.

## Setup

Requires Node 20.6 or newer.

```bash
npm install
cp .env.example .env     # then paste your key into .env
npm start                # http://localhost:3000
```

Get a key from [Google AI Studio](https://aistudio.google.com/apikey). `.env` is
gitignored — keep the key out of commits. The browser never sees it; the key stays
on the server and all Gemini calls go through `/api/*`.

### Quota, and why it shapes the design

On the free tier, Gemini counts requests **per model per day** — `gemini-3.6-flash`
allows only 20, which a single test run can exhaust. Two things follow:

- The app defaults to `gemini-3.1-flash-lite`, which reads a pan and plans the next
  move in a few seconds. Override it in `.env`.
- One look around is one Gemini call, so the loop is cheap. The client keeps a
  rolling request budget ([public/js/budget.js](public/js/budget.js)) and refuses to
  start a survey it cannot finish.

Enabling billing on the Google Cloud project removes the cap. For a demo it costs
very little and is worth doing beforehand.

### Running it on a phone

Camera and motion sensors need a secure context, so `http://<your-laptop-ip>:3000`
will not work. Tunnel it:

```bash
npx cloudflared tunnel --url http://localhost:3000
```

Open the generated `https://…` URL on the phone. On iOS, motion access is only
granted from a tap, which is why the **Camera on** button asks for it.

### No phone handy

Open **Desktop testing** in the UI to fake walking between stops: drag the heading
slider and tap Step. Surveys still come from the webcam.

## Tuning

Pan length, step detection and the request budget live in
[public/js/config.js](public/js/config.js). Stride length and the step threshold are
the two worth calibrating on a real phone before demoing.

## Layout

| Path | What it does |
| --- | --- |
| [server.js](server.js) | Express app, request validation, the survey route |
| [lib/prompts.js](lib/prompts.js) | The survey prompt and its response schema |
| [lib/gemini.js](lib/gemini.js) | Gemini client, structured JSON output |
| [public/js/sensors.js](public/js/sensors.js) | Step detection, compass heading, iOS permissions |
| [public/js/graph.js](public/js/graph.js) | Immutable map of places, leads and links |
| [public/js/map.js](public/js/map.js) | Canvas renderer, including unexplored leads |
| [public/js/marker.js](public/js/marker.js) | Compass-anchored direction marker |
| [public/js/app.js](public/js/app.js) | The look-around loop |

## Limitations

- Dead reckoning drifts. The map is the right shape, not a survey.
- Repetitive scenery (identical corridors, uniform forest) makes recognising a place
  you have already been unreliable, which is why every survey carries a confidence
  score and the app shows it.
- The marker needs an absolute compass heading. Some Android browsers only report
  a relative one, and it cannot anchor without it.
- No offline mode. Every survey needs a network round trip, which is the opposite of
  what a real trail offers.
