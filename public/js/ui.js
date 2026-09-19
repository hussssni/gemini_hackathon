const byId = (id) => {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing element #${id}`);
  return element;
};

export const elements = {
  video: byId("preview"),
  canvas: byId("map"),
  status: byId("status"),
  steps: byId("steps"),
  heading: byId("heading"),
  landmarkCount: byId("landmark-count"),
  landmarks: byId("landmarks"),
  route: byId("route"),
  routeSummary: byId("route-summary"),
  routeSteps: byId("route-steps"),
  routeWarnings: byId("route-warnings"),
  toast: byId("toast"),
  startButton: byId("start"),
  lostButton: byId("lost"),
  resetButton: byId("reset"),
  stepButton: byId("sim-step"),
  headingInput: byId("sim-heading"),
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

export function renderStats(trail) {
  elements.steps.textContent = String(trail.steps);
  elements.heading.textContent = `${Math.round(trail.heading)}°`;
  elements.landmarkCount.textContent = String(trail.landmarks.length);
}

export function renderLandmarks(trail, matchedId = null) {
  elements.landmarks.replaceChildren(
    ...[...trail.landmarks].reverse().map((landmark) => {
      const item = document.createElement("li");
      item.className = "landmark";
      if (landmark.id === matchedId) item.classList.add("is-match");
      if (landmark.is_decision_point) item.classList.add("is-decision");

      const meta = document.createElement("span");
      meta.className = "landmark-meta";
      meta.textContent = `${landmark.steps} steps · ${Math.round(landmark.heading)}°`;

      const text = document.createElement("p");
      text.textContent = landmark.description;

      item.append(meta, text);
      return item;
    }),
  );
}

function listItems(target, values) {
  target.replaceChildren(
    ...values.map((value) => {
      const item = document.createElement("li");
      item.textContent = value;
      return item;
    }),
  );
}

export function renderRoute(route) {
  elements.routeSummary.textContent = route.summary;
  listItems(elements.routeSteps, route.steps ?? []);
  listItems(elements.routeWarnings, route.warnings ?? []);
  elements.route.hidden = false;
}

export function clearRoute() {
  elements.route.hidden = true;
}

export function setBusy(isBusy) {
  [elements.startButton, elements.lostButton, elements.resetButton].forEach((button) => {
    button.disabled = isBusy;
  });
}
