const byId = (id) => {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing element #${id}`);
  return element;
};

export const elements = {
  video: byId("preview"),
  canvas: byId("map"),
  status: byId("status"),
  places: byId("places"),
  leads: byId("leads"),
  steps: byId("steps"),
  survey: byId("survey"),
  surveyBadge: byId("survey-badge"),
  surveySpoken: byId("survey-spoken"),
  surveyHere: byId("survey-here"),
  surveyOptions: byId("survey-options"),
  destination: byId("destination"),
  arrived: byId("arrived"),
  marker: byId("marker"),
  markerRing: byId("marker-ring"),
  markerLabel: byId("marker-label"),
  replayButton: byId("replay"),
  startButton: byId("start"),
  lookButton: byId("look"),
  resetButton: byId("reset"),
  stepButton: byId("sim-step"),
  headingInput: byId("sim-heading"),
  toast: byId("toast"),
};

export function setStatus(text, tone = "neutral") {
  elements.status.textContent = text;
  elements.status.dataset.tone = tone;
}

let toastTimer = null;
export function showError(message) {
  elements.toast.textContent = message;
  elements.toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    elements.toast.hidden = true;
  }, 6000);
}

export function renderStats(map, leads) {
  elements.places.textContent = String(map.nodes.length);
  elements.leads.textContent = String(leads);
  elements.steps.textContent = String(map.steps);
}

const COMPASS_POINTS = Object.freeze(["N", "NE", "E", "SE", "S", "SW", "W", "NW"]);

/** Bearings are exact but unreadable; a compass point is what a person wants. */
const compassPoint = (bearing) =>
  COMPASS_POINTS[Math.round((((bearing % 360) + 360) % 360) / 45) % 8];

function optionRow(option, isRecommended) {
  const item = document.createElement("li");
  item.className = "option";
  if (isRecommended) item.classList.add("is-pick");

  const direction = document.createElement("span");
  direction.className = "option-direction";
  direction.textContent = compassPoint(option.bearing);

  const text = document.createElement("p");
  text.textContent = option.description;

  const promise = document.createElement("span");
  promise.className = "option-promise";
  promise.textContent = `${Math.round((option.promise ?? 0) * 100)}%`;

  item.append(direction, promise, text);
  return item;
}

export function renderSurvey(result, map) {
  const recommendedIndex = result.recommendation?.option_index ?? null;

  elements.surveyBadge.textContent = result.arrived
    ? "Arrived"
    : `${map.nodes.length} mapped · ${Math.round(result.confidence * 100)}% sure`;
  elements.surveyBadge.dataset.tone = result.arrived
    ? "good"
    : result.confidence < 0.4 ? "warn" : "neutral";

  elements.surveySpoken.textContent = result.spoken;
  elements.surveyHere.textContent = result.here.description;

  elements.surveyOptions.replaceChildren(
    ...(result.options ?? []).map((option, index) =>
      optionRow(option, index + 1 === recommendedIndex)),
  );

  elements.survey.hidden = false;
}

export function showArrived(destination) {
  elements.arrived.textContent = `You've reached ${destination || "your destination"}.`;
  elements.arrived.hidden = false;
}

export function clearArrived() {
  elements.arrived.hidden = true;
}

export function clearSurvey() {
  elements.survey.hidden = true;
  clearArrived();
}

export function setBusy(isBusy) {
  [elements.startButton, elements.lookButton, elements.resetButton].forEach((button) => {
    button.disabled = isBusy;
  });
}
