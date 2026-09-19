import { createBudget } from "./budget.js";
import { createCamera } from "./camera.js";
import { createSensorTracker, requestSensorAccess } from "./sensors.js";
import { survey } from "./api.js";
import { drawMap } from "./map.js";
import { createMarker } from "./marker.js";
import { capturePan } from "./pan.js";
import { primeSpeech, speak, stopSpeaking } from "./speech.js";
import { turnPhrase } from "./guidance.js";
import {
  addSurvey, commitChoice, emptyMap, fromSaved, setRuledOut, trackMotion,
} from "./graph.js";
import { decide } from "./decide.js";
import { narrate } from "./narrate.js";
import { selectReferences, serverArrival, toServerNodes } from "./recall.js";
import { mapSummary, markerLabel, stats, surveyView } from "./present.js";
import { clearMap, describeAge, loadMap, saveMap } from "./storage.js";
import {
  clearArrived, clearSurvey, elements, renderStats, renderSurvey,
  setBusy, setStatus, showArrived, showError,
} from "./ui.js";

// Long enough that turning slowly does not produce a stream of instructions.
const GUIDANCE_MIN_GAP_MS = 1500;

const camera = createCamera(elements.video);
const budget = createBudget();
const marker = createMarker({
  root: elements.marker,
  ring: elements.markerRing,
  label: elements.markerLabel,
  getFov: () => camera.horizontalFov(),
});

let map = emptyMap();
// The last survey, the decision made from it, and what was said about it.
let last = null;
let surveying = false;
let guidance = { zone: null, spokenAt: 0 };
// Whether the phone is reporting a real compass heading.
let compassLive = false;

function render() {
  renderStats(stats(map));
  drawMap(elements.canvas, map);
  elements.canvas.setAttribute("aria-label", mapSummary(map));
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
  // A distinct double buzz when lined up, so "go now" can be felt as well as heard.
  if (state.aligned) navigator.vibrate?.([90, 60, 90]);
  speak(state.aligned ? "Straight ahead, go now" : turnPhrase(state.delta));
}

const sensors = createSensorTracker({
  onUpdate: (snapshot) => {
    map = trackMotion(map, snapshot);
    compassLive = snapshot.hasHeading;
    // Redrawing the marker on every heading tick is what keeps it pinned to the
    // world rather than the screen.
    announceTurn(marker.update(snapshot.heading));
    render();
  },
  onError: showError,
});

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

function readDestination() {
  const destination = elements.destination.value.trim();
  if (!destination) {
    elements.destination.focus();
    showError("Say what you are trying to find first, so it knows when you have got there.");
  }
  return destination;
}

/** Everything the model needs besides the photos: the map and how we got here. */
const surveyContext = (destination) => ({
  destination,
  nodes: toServerNodes(map),
  memory: selectReferences(map),
  arrival: serverArrival(map),
  expected_node_id: map.pending?.expectedId ?? null,
});

/** Acts on a decision: point the marker, say it, and show it. `brief` is for a
 *  re-decision, which only says the new instruction. */
function act(result, decision, destination, brief = false) {
  const spoken = decision.kind === "arrived"
    ? `You have reached ${destination}. ${result.spoken}`
    : narrate({ map, decision, survey: result, heading: map.heading, brief });

  last = { result, decision, destination };
  renderSurvey(surveyView({ map, survey: result, decision, spoken }));
  clearArrived();

  if (decision.kind === "arrived") {
    marker.clear();
    showArrived(destination);
    setStatus("You made it", "good");
  } else if (decision.kind === "stuck") {
    marker.clear();
    setStatus("Everything nearby is tried", "warn");
  } else {
    marker.setTarget(decision.bearing, markerLabel(map, decision));
    setStatus(decision.kind === "backtrack"
      ? "Head back, then look around again"
      : "Follow the marker, then look around again", "good");
  }

  speak(spoken);
  guidance = { zone: null, spokenAt: Date.now() };
  announceTurn(marker.update(map.heading));
}

/**
 * One stop in the exploration loop: pan, let Gemini read the surroundings,
 * fold what it found into the map, decide, and say where to go. Walk that way,
 * then run it again — the map grows a place at a time.
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
  const destination = readDestination();
  if (!destination) return;

  surveying = true;
  setBusy(true);
  stopSpeaking();
  marker.clear();
  speak(compassLive
    ? "Hold the phone up and turn slowly all the way round. Take your time."
    : "Hold the phone up and turn all the way round, about one step each second.");

  try {
    const { frames, references } = await capturePan({
      camera,
      readHeading: () => map.heading,
      hasCompass: () => compassLive,
      // A short buzz per photo lets someone pace the turn without the screen.
      onFrame: () => navigator.vibrate?.(25),
      onProgress: (done, total) => setStatus(`Keep turning slowly — ${done} of ${total}`, "busy"),
    });

    setStatus("Reading the surroundings…", "busy");
    budget.spend();
    const result = await survey({ frames, fov: camera.horizontalFov(), ...surveyContext(destination) });

    map = addSurvey(map, result, {
      heading: map.heading,
      steps: map.steps,
      references,
      facing: frames[0].heading,
    });
    const decision = redecide(result);
    saveMap(map);

    surveying = false;
    act(result, decision, destination);
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

/** Decides again at this place and commits to it, as after a survey. */
function redecide(result) {
  const decision = decide(map, result);
  if (decision.kind === "explore" || decision.kind === "backtrack") {
    map = commitChoice(map, decision);
  }
  return decision;
}

/**
 * The explorer's veto on a path at this place, or the undo of one. Either way
 * the choice is made again at once and the new instruction said.
 */
function ruleOut(optionId, ruledOut) {
  if (!last || surveying || !optionId) return;
  const before = map;
  map = setRuledOut(map, map.currentNodeId, optionId, ruledOut);
  if (map === before) return;
  const decision = redecide(last.result);
  saveMap(map);
  act(last.result, decision, last.destination, ruledOut ? true : "Okay, that path is back.");
  render();
}

function replay() {
  if (!last) return;
  const { result, decision, destination } = last;
  speak(decision.kind === "arrived"
    ? `You have reached ${destination}.`
    : narrate({ map, decision, survey: result, heading: map.heading }));
}

function reset() {
  stopSpeaking();
  sensors.stop();
  camera.stop();
  marker.clear();
  clearMap();
  map = emptyMap();
  last = null;
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
elements.replayButton.addEventListener("click", replay);
elements.rejectButton.addEventListener("click", () => {
  primeSpeech();
  ruleOut(last?.decision.optionId, true);
});
// One listener for every row's "Not this way" / "Undo", however often the
// list is rebuilt.
elements.surveyOptions.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-option-id]");
  if (!button) return;
  primeSpeech();
  ruleOut(button.dataset.optionId, button.dataset.ruledOut === "true");
});
elements.resetButton.addEventListener("click", reset);
elements.stepButton.addEventListener("click", () =>
  sensors.simulateStep(Number(elements.headingInput.value)));
elements.headingInput.addEventListener("input", () => {
  map = trackMotion(map, { steps: map.steps, heading: Number(elements.headingInput.value) });
  announceTurn(marker.update(map.heading));
  render();
});
addEventListener("resize", render);

/** Somewhere explored before is somewhere Gemini can recognise, so the map
 *  outlives the session and a return visit picks up where it left off. */
function restoreSavedMap() {
  const saved = loadMap();
  if (!saved) return;
  map = fromSaved(saved);
  setStatus(`Remembered ${map.nodes.length} places from ${describeAge(saved.savedAt)}`, "good");
}

restoreSavedMap();
render();
