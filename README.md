# Breadcrumb

Lost on a trail? Breadcrumb remembers the landmarks you walked past and uses Gemini
to talk you back to the start.

Built for EmberHacks 2026.

## How it works

1. **Walk out.** The phone camera runs while you walk. At the start, at every turn,
   and periodically in between, the app grabs a keyframe along with the compass
   heading and step count. Gemini turns each frame into a structured landmark:
   what is distinctive about it, and whether it is a point where you could take a
   wrong turn.
2. **Live map.** Steps and heading are dead-reckoned into a path drawn on a canvas,
   with the landmarks pinned along it.
3. **"I'm lost."** You pan the camera around. Gemini compares those frames against
   the landmarks it recorded and decides where on the route you are, with a
   confidence score and a request for another look when it is unsure.
4. **The way back.** Gemini writes the route in reverse, flipping left and right
   because you are now walking the other way, and the phone speaks it aloud.

Gemini does the part that is hard to code: recognising a place from a different
angle, in different light, and describing it the way a person would. The phone
sensors only supply the geometry.

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

### Running it on a phone

Camera and motion sensors need a secure context, so `http://<your-laptop-ip>:3000`
will not work. Tunnel it:

```bash
npx cloudflared tunnel --url http://localhost:3000
```

Open the generated `https://…` URL on the phone. On iOS, motion access is only
granted from a tap, which is why the **Start walk** button asks for it.

### No phone handy

Open **Desktop testing** in the UI to fake a walk: drag the heading slider and tap
Step to move the dead-reckoned position. Landmarks still come from the webcam.

## Tuning

Capture rate, step detection and match confidence all live in
[public/js/config.js](public/js/config.js). Stride length and the step threshold are
the two worth calibrating on a real phone before demoing.

## Layout

| Path | What it does |
| --- | --- |
| [server.js](server.js) | Express app, request validation, three Gemini routes |
| [lib/prompts.js](lib/prompts.js) | Prompts and response schemas |
| [lib/gemini.js](lib/gemini.js) | Gemini client, structured JSON output |
| [public/js/sensors.js](public/js/sensors.js) | Step detection, compass heading, iOS permissions |
| [public/js/trail.js](public/js/trail.js) | Immutable trail state and dead reckoning |
| [public/js/map.js](public/js/map.js) | Canvas renderer |
| [public/js/app.js](public/js/app.js) | Wiring: walk loop, lost flow |

## Limitations

- Dead reckoning drifts. The map is a sketch of the route's shape, not a survey.
- Repetitive scenery (identical corridors, uniform forest) makes relocalization
  unreliable, which is why the match carries a confidence score.
- No offline mode. Every landmark and match needs a network round trip, which is
  the opposite of what a real trail offers.
