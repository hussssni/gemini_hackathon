# Breadcrumb

Lost on a trail? Breadcrumb remembers the landmarks you passed and uses Gemini to guide you back.

Built for EmberHacks 2026.

## How it works
1. **Walk out:** the phone captures keyframes, compass heading and steps. Gemini turns each keyframe into a structured landmark.
2. **Live map:** dead reckoning (steps + heading) sketches the path and pins landmarks.
3. **I'm lost:** pan the camera. Gemini matches what it sees against stored landmarks and relocalizes.
4. **Way back:** Gemini narrates the reversed route, spoken aloud.

## Setup
Copy `.env.example` to `.env` and add your `GEMINI_API_KEY`. Never commit `.env`.
