import { LOST } from "./config.js";
import { createBudget } from "./budget.js";
import { createCamera } from "./camera.js";
import { createSensorTracker, requestSensorAccess } from "./sensors.js";
import { survey } from "./api.js";
import { drawMap } from "./map.js";
import { primeSpeech, speak, stopSpeaking } from "./speech.js";
import {
  addSurvey, commitRecommendation, emptyMap,
  toServerNodes, trackMotion, unexploredCount,
} from "./graph.js";
import {
  clearSurvey, elements, renderStats, renderSurvey,
  setBusy, setStatus, showError,
} from "./ui.js";

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const camera = createCamera(elements.video);
const budget = createBudget();

let map = emptyMap();
let lastSurvey = null;
let surveying = false;

function render() {
  renderStats(map, unexploredCount(map));
  drawMap(elements.canvas, map, {
    recommendedDirection: lastSurvey?.recommendation?.direction ?? null,
  });
}

const sensors = createSensorTracker({
  onUpdate: (snapshot) => {
    map = trackMotion(map, snapshot);
    render();
  },
  onError: showError,
});

/** Grabs a spread of frames while the explorer pans, left to right. */
async function capturePanorama() {
  const images = [];
  for (let index = 0; index < LOST.PAN_FRAMES; index += 1) {
    setStatus(`Keep panning — frame ${index + 1} of ${LOST.PAN_FRAMES}`, "busy");
    images.push(camera.captureFrame());
    if (index < LOST.PAN_FRAMES - 1) await delay(LOST.PAN_INTERVAL_MS);
  }
  return images;
}

async function begin() {
  setBusy(true);
  try {
    const granted = await requestSensorAccess();
    if (!granted) {
      showError("Motion access was denied. The map will still build, but distances will be rough.");
    }
    await camera.start();
    sensors.start();
    setStatus("Ready — look around", "good");
    render();
  } catch (err) {
    console.error(err);
    showError(err.message);
    setStatus("Could not start the camera", "warn");
  } finally {
    setBusy(false);
  }
}

/**
 * One stop in the exploration loop: pan, let Gemini read the surroundings, add
 * what it found to the map, and act on what it suggests. Walk that way, then
 * run it again — the map grows a node at a time.
 */
async function lookAround() {
  if (!camera.isRunning()) {
    showError("Start the camera first.");
    return;
  }
  if (surveying) return;
  if (!budget.canCapture()) {
    showError(`Out of Gemini requests for now. Try again in ${Math.ceil(budget.resetsInMs() / 1000)}s.`);
    return;
  }

  surveying = true;
  setBusy(true);
  stopSpeaking();

  try {
    const images = await capturePanorama();

    setStatus("Reading the surroundings…", "busy");
    budget.spend();
    const result = await survey({
      images,
      nodes: toServerNodes(map),
      destination: elements.destination.value.trim(),
      heading: Math.round(map.heading),
    });

    map = addSurvey(map, result, { heading: Math.round(map.heading), steps: map.steps });
    if (result.recommendation) {
      map = commitRecommendation(map, result.recommendation.direction);
    }

    lastSurvey = result;
    renderSurvey(result, map);
    speak(result.spoken);
    render();

    if (result.arrived) {
      setStatus("You made it", "good");
    } else if (result.recommendation) {
      setStatus(`Head ${result.recommendation.direction} — then look around again`, "good");
    } else {
      setStatus("No way forward from here — go back", "warn");
    }
  } catch (err) {
    console.error(err);
    showError(err.message);
    setStatus("Could not read the surroundings", "warn");
  } finally {
    surveying = false;
    setBusy(false);
  }
}

function reset() {
  stopSpeaking();
  sensors.stop();
  camera.stop();
  map = emptyMap();
  lastSurvey = null;
  clearSurvey();
  setStatus("Ready", "neutral");
  render();
}

// primeSpeech must run synchronously inside the tap, before any await, or iOS
// refuses to speak the result that arrives once the request comes back.
elements.startButton.addEventListener("click", () => {
  primeSpeech();
  begin();
});
elements.lookButton.addEventListener("click", () => {
  primeSpeech();
  lookAround();
});
elements.replayButton.addEventListener("click", () => {
  if (lastSurvey) speak(lastSurvey.spoken);
});
elements.resetButton.addEventListener("click", reset);
elements.stepButton.addEventListener("click", () =>
  sensors.simulateStep(Number(elements.headingInput.value)));
elements.headingInput.addEventListener("input", () => {
  map = trackMotion(map, { steps: map.steps, heading: Number(elements.headingInput.value) });
  render();
});
addEventListener("resize", render);

setStatus("Ready", "neutral");
render();
