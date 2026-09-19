import { CAPTURE, LOST } from "./config.js";
import { createCamera } from "./camera.js";
import { createSensorTracker, requestSensorAccess } from "./sensors.js";
import { describeLandmark, locate, routeBack } from "./api.js";
import { drawTrail } from "./map.js";
import { speakRoute, stopSpeaking } from "./speech.js";
import {
  addLandmark, advance, emptyTrail, headingDelta,
  startTrail, toServerLandmarks,
} from "./trail.js";
import {
  clearRoute, elements, renderLandmarks, renderRoute,
  renderStats, setBusy, setStatus, showError,
} from "./ui.js";

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const camera = createCamera(elements.video);

let trail = emptyTrail();
let mode = "idle";
let matchedLandmarkId = null;
let describing = false;
let lastCapture = { at: 0, steps: 0, heading: 0 };

function render() {
  renderStats(trail);
  renderLandmarks(trail, matchedLandmarkId);
  drawTrail(elements.canvas, trail, { matchedLandmarkId });
}

/**
 * Landmarks are worth spending a Gemini call on at the start, at turns, and
 * every so often in between. Anything denser just burns quota on hallway.
 */
function shouldCapture() {
  if (describing || mode !== "walking") return false;
  if (trail.landmarks.length === 0) return true;

  const stepsSince = trail.steps - lastCapture.steps;
  const turned = headingDelta(trail.heading, lastCapture.heading) >= CAPTURE.TURN_DEGREES;
  if (turned && stepsSince >= 4) return true;

  return stepsSince >= CAPTURE.MIN_STEPS_BETWEEN
    && Date.now() - lastCapture.at >= CAPTURE.MIN_MS_BETWEEN;
}

async function captureLandmark() {
  describing = true;
  const heading = Math.round(trail.heading);
  const steps = trail.steps;

  try {
    const image = camera.captureFrame();
    setStatus("Reading the landmark…", "busy");
    const described = await describeLandmark({ image, heading, steps });

    trail = addLandmark(trail, {
      id: `lm-${trail.landmarks.length + 1}`,
      description: described.description,
      distinctive_features: described.distinctive_features ?? [],
      distinctiveness: described.distinctiveness ?? 0,
      is_decision_point: described.is_decision_point ?? false,
      options_seen: described.options_seen ?? [],
      heading,
      steps,
    });

    lastCapture = { at: Date.now(), steps, heading };
    setStatus("Walking — dropping breadcrumbs", "good");
    render();
  } catch (err) {
    console.error(err);
    showError(err.message);
    // Back off so a failing call does not retry on every footfall.
    lastCapture = { ...lastCapture, at: Date.now(), steps };
    setStatus("Walking — last landmark failed", "warn");
  } finally {
    describing = false;
  }
}

const sensors = createSensorTracker({
  onUpdate: (snapshot) => {
    trail = advance(trail, snapshot);
    render();
    if (shouldCapture()) captureLandmark();
  },
  onError: showError,
});

async function startWalk() {
  setBusy(true);
  try {
    const granted = await requestSensorAccess();
    if (!granted) {
      showError("Motion access was denied, so the map cannot track steps.");
    }
    await camera.start();
    sensors.start();

    trail = startTrail(emptyTrail());
    matchedLandmarkId = null;
    lastCapture = { at: 0, steps: 0, heading: 0 };
    mode = "walking";
    clearRoute();
    setStatus("Walking — dropping breadcrumbs", "good");
    render();
  } catch (err) {
    console.error(err);
    showError(err.message);
    setStatus("Could not start", "warn");
  } finally {
    setBusy(false);
  }
}

async function capturePanorama() {
  const images = [];
  for (let index = 0; index < LOST.PAN_FRAMES; index += 1) {
    setStatus(`Pan slowly — frame ${index + 1} of ${LOST.PAN_FRAMES}`, "busy");
    images.push(camera.captureFrame());
    if (index < LOST.PAN_FRAMES - 1) await delay(LOST.PAN_INTERVAL_MS);
  }
  return images;
}

async function findWayBack() {
  if (trail.landmarks.length === 0) {
    showError("There are no landmarks yet. Start a walk first.");
    return;
  }
  if (!camera.isRunning()) {
    showError("The camera is off. Start a walk first.");
    return;
  }

  mode = "lost";
  setBusy(true);
  stopSpeaking();

  try {
    const images = await capturePanorama();
    const landmarks = toServerLandmarks(trail.landmarks);

    setStatus("Matching what you see…", "busy");
    const match = await locate({ images, landmarks });

    if (!match.matched_landmark_id || match.confidence < LOST.MIN_CONFIDENCE) {
      matchedLandmarkId = null;
      render();
      setStatus("Not sure where you are", "warn");
      showError(match.reasoning || "No landmark matched. Try panning somewhere more distinctive.");
      return;
    }

    matchedLandmarkId = match.matched_landmark_id;
    render();

    setStatus("Working out the way back…", "busy");
    const route = await routeBack({
      landmarks,
      currentLandmarkId: match.matched_landmark_id,
      facingHeading: Math.round(trail.heading),
    });

    renderRoute(route);
    speakRoute(route);
    setStatus(`Found you — confidence ${Math.round(match.confidence * 100)}%`, "good");
  } catch (err) {
    console.error(err);
    showError(err.message);
    setStatus("Could not find the way back", "warn");
  } finally {
    setBusy(false);
  }
}

function reset() {
  stopSpeaking();
  sensors.stop();
  camera.stop();
  trail = emptyTrail();
  matchedLandmarkId = null;
  mode = "idle";
  lastCapture = { at: 0, steps: 0, heading: 0 };
  clearRoute();
  setStatus("Ready", "neutral");
  render();
}

elements.startButton.addEventListener("click", startWalk);
elements.lostButton.addEventListener("click", findWayBack);
elements.resetButton.addEventListener("click", reset);
elements.stepButton.addEventListener("click", () =>
  sensors.simulateStep(Number(elements.headingInput.value)));
elements.headingInput.addEventListener("input", () => {
  trail = advance(trail, { steps: trail.steps, heading: Number(elements.headingInput.value) });
  render();
});
addEventListener("resize", render);

setStatus("Ready", "neutral");
render();
