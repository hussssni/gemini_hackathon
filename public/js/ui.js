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
  forks: byId("forks"),
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
  rejectButton: byId("reject"),
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

export function renderStats({ places, forks, untried }) {
  elements.places.textContent = String(places);
  elements.forks.textContent = String(forks);
  elements.leads.textContent = String(untried);
}

const STATE_LABELS = Object.freeze({
  untried: "untried",
  "way-back": "way you came",
  "dead-end": "dead end",
  "loops-back": "loops back",
  exhausted: "all tried",
  "ruled-out": "ruled out",
  open: "walked",
});

/**
 * One row per way out of this place, as the map now knows it: which side it
 * is on, what came of it, and whether it is the one being taken.
 */
/** "Not this way" on an untried path, "Undo" on one already ruled out. */
function vetoButton({ id, side, state }) {
  if (state !== "untried" && state !== "ruled-out") return null;
  const button = document.createElement("button");
  button.type = "button";
  button.className = "ghost veto";
  button.dataset.optionId = id;
  button.dataset.ruledOut = String(state === "untried");
  button.textContent = state === "untried" ? "Not this way" : "Undo";
  button.setAttribute("aria-label", state === "untried"
    ? `Rule out the ${side} path`
    : `Put the ${side} path back`);
  return button;
}

function optionRow({ id, side, state, description, promise, isPick }) {
  const item = document.createElement("li");
  item.className = "option";
  item.dataset.state = state;
  if (isPick) item.classList.add("is-pick");

  const direction = document.createElement("span");
  direction.className = "option-direction";
  direction.textContent = isPick ? `${side} · take this` : side;

  const tag = document.createElement("span");
  tag.className = "option-promise";
  tag.textContent = state === "untried"
    ? `${STATE_LABELS[state]} · ${Math.round((promise ?? 0) * 100)}%`
    : STATE_LABELS[state] ?? state;

  const text = document.createElement("p");
  text.textContent = description;

  const veto = vetoButton({ id, side, state });
  item.append(direction, tag, text, ...(veto ? [veto] : []));
  return item;
}

/**
 * @param view.badge  e.g. "Fork 2 · 70% sure"
 * @param view.spoken the sentence that was read aloud
 * @param view.rows   branches, already described by the caller
 */
export function renderSurvey({ badge, tone, spoken, here, rows }) {
  // The big button only makes sense while something is being suggested.
  elements.rejectButton.hidden = !rows.some((row) => row.isPick && row.state === "untried");
  elements.surveyBadge.textContent = badge;
  elements.surveyBadge.dataset.tone = tone;
  elements.surveySpoken.textContent = spoken;
  elements.surveyHere.textContent = here;
  elements.surveyOptions.replaceChildren(...rows.map(optionRow));
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
