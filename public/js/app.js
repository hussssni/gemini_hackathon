import { LOST } from "./config.js";
import { createBudget } from "./budget.js";
import { createCamera, frameAt, referenceShot } from "./camera.js";
import { createSensorTracker, requestSensorAccess } from "./sensors.js";
import { survey } from "./api.js";
import { drawMap } from "./map.js";
import { createMarker } from "./marker.js";
import { primeSpeech, speak, stopSpeaking } from "./speech.js";
import { bearingDelta, directionSentence, turnPhrase } from "./guidance.js";
import {
  addSurvey, commitRecommendation, emptyMap, fromSaved,
  selectReferences, toServerNodes, trackMotion, unexploredCount,
} from "./graph.js";
import { clearMap, describeAge, loadMap, saveMap } from "./storage.js";
import {
  clearArrived, clearSurvey, elements, renderStats, renderSurvey,
  setBusy, setStatus, showArrived, showError,
} from "./ui.js";

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Long enough that turning slowly does not produce a stream of instructions.
const GUIDANCE_MIN_GAP_MS = 1500;

const camera = createCamera(elements.video);
const budget = createBudget();
const marker = createMarker({
  root: elements.marker,
  ring: elements.markerRing,
  label: elements.markerLabel,
});

let map = emptyMap();
let lastSurvey = null;
let surveying = false;
let guidance = { zone: null, spokenAt: 0 };

function render() {
  renderStats(map, unexploredCount(map));
  drawMap(elements.canvas, map, {
    recommendedBearing: lastSurvey?.recommendation?.bearing ?? null,
  });
}

/**
 * Speaks the turn as the explorer rotates, but only when the instruction
 * genuinely changes. Someone who cannot see the marker is steering entirely by
 * this, and repeating "turn left" every tick would drown out everything else.
 */
function announceTurn(state) {
  if (!state || surveying) return;

  const changed = state.zone !== guidance.zone;
  const settled = Date.now() - guidance.spokenAt > GUIDANCE_MIN_GAP_MS;
  if (!changed || !settled) return;

  guidance = { zone: state.zone, spokenAt: Date.now() };
  speak(state.aligned ? "Straight ahead, go now" : turnPhrase(state.delta));
}

const sensors = createSensorTracker({
  onUpdate: (snapshot) => {
    map = trackMotion(map, snapshot);
    // Redrawing the marker on every heading tick is what keeps it pinned to the
    // world rather than the screen.
    announceTurn(marker.update(snapshot.heading));
    render();
  },
  onError: showError,
});

/**
 * Grabs a spread of frames while the explorer pans, tagging each with the
 * heading it was shot at. Those headings are what let an exit seen in a photo
 * become a bearing the marker can point at afterwards.
 */
async function capturePanorama() {
  const frames = [];
  for (let index = 0; index < LOST.PAN_FRAMES; index += 1) {
    setStatus(`Keep panning — frame ${index + 1} of ${LOST.PAN_FRAMES}`, "busy");
    frames.push(frameAt(camera, map.heading));
    if (index < LOST.PAN_FRAMES - 1) await delay(LOST.PAN_INTERVAL_MS);
  }
  return frames;
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

  const destination = elements.destination.value.trim();
  if (!destination) {
    elements.destination.focus();
    showError("Say what you are trying to find first, so it knows when you have got there.");
    return;
  }

  surveying = true;
  setBusy(true);
  stopSpeaking();

  try {
    const frames = await capturePanorama();

    setStatus("Reading the surroundings…", "busy");
    budget.spend();
    const result = await survey({
      frames,
      nodes: toServerNodes(map),
      destination,
      memory: selectReferences(map),
    });

    map = addSurvey(map, result, {
      heading: Math.round(map.heading),
      steps: map.steps,
      // Keep a small shot of this place so a later visit can be recognised by
      // sight rather than by how well two written descriptions happen to agree.
      reference: referenceShot(camera),
    });
    if (result.recommendation) {
      map = commitRecommendation(map, result.recommendation.option_index);
    }
    saveMap(map);

    lastSurvey = result;
    renderSurvey(result, map);

    if (result.arrived) {
      marker.clear();
      clearArrived();
      showArrived(destination);
      speak(`You have reached ${destination}. ${result.spoken}`);
      setStatus("You made it", "good");
    } else if (result.recommendation) {
      // The bearing came from the compass reading of the photo the exit appears
      // in, so the marker points where the camera actually saw it.
      marker.setTarget(result.recommendation.bearing, "Go this way");
      // Lead with the turn, measured from where they are actually standing, so
      // the first thing heard is something to do rather than something to see.
      const delta = bearingDelta(result.recommendation.bearing, map.heading);
      speak(directionSentence(delta, result.spoken));
      guidance = { zone: null, spokenAt: Date.now() };
      announceTurn(marker.update(map.heading));
      clearArrived();
      setStatus("Follow the marker, then look around again", "good");
    } else {
      marker.clear();
      clearArrived();
      speak(`Dead end. ${result.spoken} Go back the way you came.`);
      setStatus("Dead end — go back", "warn");
    }

    render();
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
  marker.clear();
  clearMap();
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
  if (!lastSurvey) return;
  const bearing = lastSurvey.recommendation?.bearing;
  speak(bearing === undefined
    ? lastSurvey.spoken
    : directionSentence(bearingDelta(bearing, map.heading), lastSurvey.spoken));
});
elements.resetButton.addEventListener("click", reset);
elements.stepButton.addEventListener("click", () =>
  sensors.simulateStep(Number(elements.headingInput.value)));
elements.headingInput.addEventListener("input", () => {
  map = trackMotion(map, { steps: map.steps, heading: Number(elements.headingInput.value) });
  render();
});
addEventListener("resize", render);

/** Somewhere explored before is somewhere Gemini can recognise, so the map
 *  outlives the session and a return visit picks up where it left off. */
function restoreSavedMap() {
  const saved = loadMap();
  if (!saved) return;

  map = fromSaved(saved);
  render();
  setStatus(`Remembered ${map.nodes.length} places from ${describeAge(saved.savedAt)}`, "good");
}

restoreSavedMap();
render();
