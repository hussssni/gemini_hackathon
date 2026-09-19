import { MAP } from "./config.js";
import { currentPoint } from "./trail.js";

const PALETTE = Object.freeze({
  path: "#5eead4",
  pathDim: "rgba(94, 234, 212, 0.25)",
  start: "#fbbf24",
  landmark: "#a78bfa",
  decision: "#fb7185",
  match: "#f8fafc",
  here: "#22d3ee",
  grid: "rgba(148, 163, 184, 0.14)",
});

/** Maps trail metres onto canvas pixels, keeping the whole path in frame. */
function createProjection(trail, width, height) {
  const points = trail.path;
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);

  const centerX = (Math.min(...xs) + Math.max(...xs)) / 2;
  const centerY = (Math.min(...ys) + Math.max(...ys)) / 2;
  const spanX = Math.max(Math.max(...xs) - Math.min(...xs), MAP.MIN_SPAN_METERS);
  const spanY = Math.max(Math.max(...ys) - Math.min(...ys), MAP.MIN_SPAN_METERS);

  const usableWidth = width - MAP.PADDING_PX * 2;
  const usableHeight = height - MAP.PADDING_PX * 2;
  const scale = Math.min(usableWidth / spanX, usableHeight / spanY);

  return (point) => ({
    x: width / 2 + (point.x - centerX) * scale,
    y: height / 2 + (point.y - centerY) * scale,
  });
}

function drawGrid(context, width, height) {
  context.strokeStyle = PALETTE.grid;
  context.lineWidth = 1;
  const step = 40;
  for (let x = step; x < width; x += step) {
    context.beginPath();
    context.moveTo(x, 0);
    context.lineTo(x, height);
    context.stroke();
  }
  for (let y = step; y < height; y += step) {
    context.beginPath();
    context.moveTo(0, y);
    context.lineTo(width, y);
    context.stroke();
  }
}

function drawPath(context, projected) {
  if (projected.length < 2) return;
  context.strokeStyle = PALETTE.path;
  context.lineWidth = 3;
  context.lineJoin = "round";
  context.lineCap = "round";
  context.beginPath();
  projected.forEach((point, index) => {
    if (index === 0) context.moveTo(point.x, point.y);
    else context.lineTo(point.x, point.y);
  });
  context.stroke();
}

function drawDot(context, { x, y }, color, radius) {
  context.fillStyle = color;
  context.beginPath();
  context.arc(x, y, radius, 0, Math.PI * 2);
  context.fill();
}

function drawHeadingArrow(context, point, heading) {
  const radians = (heading * Math.PI) / 180;
  const length = 18;
  const tip = {
    x: point.x + Math.sin(radians) * length,
    y: point.y - Math.cos(radians) * length,
  };
  context.strokeStyle = PALETTE.here;
  context.lineWidth = 2.5;
  context.beginPath();
  context.moveTo(point.x, point.y);
  context.lineTo(tip.x, tip.y);
  context.stroke();
}

/** Finds where a landmark sits on the path, using its recorded step count. */
function landmarkPoint(trail, landmark) {
  return (
    trail.path.find((point) => point.steps >= landmark.steps) ?? currentPoint(trail)
  );
}

export function drawTrail(canvas, trail, { matchedLandmarkId = null } = {}) {
  const ratio = globalThis.devicePixelRatio || 1;
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  if (width === 0 || height === 0) return;

  canvas.width = Math.round(width * ratio);
  canvas.height = Math.round(height * ratio);

  const context = canvas.getContext("2d");
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  context.clearRect(0, 0, width, height);
  drawGrid(context, width, height);

  const project = createProjection(trail, width, height);
  const projected = trail.path.map(project);
  drawPath(context, projected);

  trail.landmarks.forEach((landmark) => {
    const point = project(landmarkPoint(trail, landmark));
    const isMatch = landmark.id === matchedLandmarkId;
    const color = isMatch
      ? PALETTE.match
      : landmark.is_decision_point
        ? PALETTE.decision
        : PALETTE.landmark;
    drawDot(context, point, color, isMatch ? 8 : 5);
  });

  drawDot(context, projected[0], PALETTE.start, 7);

  const here = projected[projected.length - 1];
  drawHeadingArrow(context, here, trail.heading);
  drawDot(context, here, PALETTE.here, 5);
}
