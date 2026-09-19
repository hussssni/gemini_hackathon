import { MAP } from "./config.js";
import { estimatePosition, findNode } from "./graph.js";
import { FAILED_STATES, forkNumber, isDeadEnd, isFork, optionState } from "./explore.js";
import { sideLetter } from "./guidance.js";

// North-up map of everything walked. The point is to make every decision
// legible: forks are numbered diamonds, each branch is labelled left, ahead or
// right as it was first walked into, and its line says what became of it:
//   solid teal   walked, still worth something
//   rose with ✕  walked, and it failed (dead end, loop, fully tried)
//   dashed amber untried
//   bold pink    the way you are being sent right now

const PALETTE = Object.freeze({
  walked: "#5eead4",
  failed: "#fb7185",
  untried: "#fbbf24",
  chosen: "#f472b6",
  place: "#a78bfa",
  fork: "#fbbf24",
  goal: "#4ade80",
  current: "#22d3ee",
  you: "#f8fafc",
  grid: "rgba(148, 163, 184, 0.12)",
  label: "#94a3b8",
  ink: "#0b1120",
});

const FONT = "-apple-system, system-ui, sans-serif";
const unit = (bearing) => {
  const radians = (bearing * Math.PI) / 180;
  return { x: Math.sin(radians), y: -Math.cos(radians) };
};

function createProjection(points, width, height) {
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const center = { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2 };
  const spanX = Math.max(Math.max(...xs) - Math.min(...xs), MAP.MIN_SPAN_METERS);
  const spanY = Math.max(Math.max(...ys) - Math.min(...ys), MAP.MIN_SPAN_METERS);
  const scale = Math.min((width - MAP.PADDING_PX * 2) / spanX, (height - MAP.PADDING_PX * 2) / spanY);
  return (point) => ({
    x: width / 2 + (point.x - center.x) * scale,
    y: height / 2 + (point.y - center.y) * scale,
  });
}

function drawGrid(context, width, height) {
  context.strokeStyle = PALETTE.grid;
  context.lineWidth = 1;
  for (let x = 40; x < width; x += 40) line(context, { x, y: 0 }, { x, y: height });
  for (let y = 40; y < height; y += 40) line(context, { x: 0, y }, { x: width, y });
  text(context, "N ↑", { x: width - 18, y: 14 }, PALETTE.label, 11);
}

function line(context, from, to) {
  context.beginPath();
  context.moveTo(from.x, from.y);
  context.lineTo(to.x, to.y);
  context.stroke();
}

function text(context, value, at, color, size = 11, weight = 600) {
  context.fillStyle = color;
  context.font = `${weight} ${size}px ${FONT}`;
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(value, at.x, at.y);
}

function cross(context, at, color) {
  context.strokeStyle = color;
  context.lineWidth = 2.5;
  line(context, { x: at.x - 4, y: at.y - 4 }, { x: at.x + 4, y: at.y + 4 });
  line(context, { x: at.x + 4, y: at.y - 4 }, { x: at.x - 4, y: at.y + 4 });
}

function arrowHead(context, at, bearing, color, size = 7) {
  const forward = unit(bearing);
  const side = { x: -forward.y, y: forward.x };
  context.fillStyle = color;
  context.beginPath();
  context.moveTo(at.x + forward.x * size, at.y + forward.y * size);
  context.lineTo(at.x - forward.x * size + side.x * size * 0.7, at.y - forward.y * size + side.y * size * 0.7);
  context.lineTo(at.x - forward.x * size - side.x * size * 0.7, at.y - forward.y * size - side.y * size * 0.7);
  context.closePath();
  context.fill();
}

/** One line per pair of linked places, coloured by the fate of the branch. */
function drawEdges(context, map, project) {
  const drawn = new Set();
  map.nodes.forEach((node) => node.options
    .filter((entry) => entry.leadsTo && entry.kind === "exit")
    .forEach((entry) => {
      const target = findNode(map, entry.leadsTo);
      const key = [node.id, entry.leadsTo].sort().join("-");
      if (!target || drawn.has(key)) return;
      drawn.add(key);

      const from = project(node);
      const to = project(target);
      const failed = FAILED_STATES.has(optionState(map, node, entry));
      const chosen = map.pending?.fromId === node.id && map.pending.optionId === entry.id;
      context.strokeStyle = chosen ? PALETTE.chosen : failed ? PALETTE.failed : PALETTE.walked;
      context.lineWidth = chosen ? 4 : 2.5;
      context.setLineDash(failed ? [6, 4] : []);
      line(context, from, to);
      context.setLineDash([]);

      // The direction it was walked, which is the decision that was made.
      const mid = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
      const bearing = (Math.atan2(to.x - from.x, -(to.y - from.y)) * 180) / Math.PI;
      if (failed) cross(context, mid, PALETTE.failed);
      else arrowHead(context, mid, bearing, context.strokeStyle);
    }));
  drawBackOnlyEdges(context, map, project, drawn);
}

/** A link recorded only as someone's way back (no exit at the far end yet). */
function drawBackOnlyEdges(context, map, project, drawn) {
  context.strokeStyle = PALETTE.walked;
  context.lineWidth = 2.5;
  map.nodes.forEach((node) => node.options
    .filter((entry) => entry.kind === "back" && entry.leadsTo)
    .forEach((entry) => {
      const key = [node.id, entry.leadsTo].sort().join("-");
      const target = findNode(map, entry.leadsTo);
      if (!target || drawn.has(key)) return;
      drawn.add(key);
      line(context, project(node), project(target));
    }));
}

/** Untried branches as dashed stubs, and the one you were sent down in pink. */
function drawStubs(context, map, project) {
  map.nodes.forEach((node) => {
    const origin = project(node);
    const fork = isFork(node);
    node.options
      .filter((entry) => entry.kind === "exit")
      .forEach((entry) => {
        const direction = unit(entry.bearing);
        const tip = { x: origin.x + direction.x * MAP.STUB_PX, y: origin.y + direction.y * MAP.STUB_PX };
        const chosen = map.pending?.fromId === node.id && map.pending.optionId === entry.id;

        if (!entry.leadsTo) {
          context.strokeStyle = chosen ? PALETTE.chosen : PALETTE.untried;
          context.lineWidth = chosen ? 4 : 2;
          context.setLineDash(chosen ? [] : [4, 4]);
          line(context, origin, tip);
          context.setLineDash([]);
          if (chosen) arrowHead(context, tip, entry.bearing, PALETTE.chosen, 8);
        }
        if (fork) {
          const at = { x: origin.x + direction.x * (MAP.STUB_PX + 10), y: origin.y + direction.y * (MAP.STUB_PX + 10) };
          const color = chosen ? PALETTE.chosen : entry.leadsTo ? PALETTE.label : PALETTE.untried;
          text(context, sideLetter(entry.bearing, node.arrivalBearing ?? 0), at, color, 11, 700);
        }
      });
  });
}

function drawNode(context, map, node, point, index) {
  const isCurrent = node.id === map.currentNodeId;
  if (isCurrent) {
    context.strokeStyle = PALETTE.current;
    context.lineWidth = 2.5;
    context.beginPath();
    context.arc(point.x, point.y, 15, 0, Math.PI * 2);
    context.stroke();
  }

  if (node.isGoal) {
    drawShape(context, point, 11, PALETTE.goal, "circle");
    text(context, "★", point, PALETTE.ink, 12);
  } else if (isFork(node)) {
    drawShape(context, point, 12, PALETTE.fork, "diamond");
    text(context, `F${forkNumber(map, node.id)}`, point, PALETTE.ink, 10, 800);
  } else if (isDeadEnd(node)) {
    drawShape(context, point, 8, PALETTE.ink, "circle");
    cross(context, point, PALETTE.failed);
  } else {
    drawShape(context, point, 8, index === 0 ? PALETTE.untried : PALETTE.place, "circle");
    text(context, String(index + 1), point, PALETTE.ink, 9, 800);
  }
}

function drawShape(context, at, radius, color, shape) {
  context.fillStyle = color;
  context.beginPath();
  if (shape === "diamond") {
    context.moveTo(at.x, at.y - radius);
    context.lineTo(at.x + radius, at.y);
    context.lineTo(at.x, at.y + radius);
    context.lineTo(at.x - radius, at.y);
    context.closePath();
  } else {
    context.arc(at.x, at.y, radius, 0, Math.PI * 2);
  }
  context.fill();
}

/** Where dead reckoning puts you now, pointing the way the phone faces. */
function drawYou(context, map, project) {
  const position = estimatePosition(map);
  if (!position) return;
  const point = project(position);
  if (map.pending) {
    context.strokeStyle = PALETTE.chosen;
    context.lineWidth = 2;
    context.setLineDash([2, 4]);
    line(context, project(findNode(map, map.pending.fromId)), point);
    context.setLineDash([]);
  }
  context.strokeStyle = PALETTE.ink;
  context.lineWidth = 2;
  arrowHead(context, point, map.heading, PALETTE.you, 8);
}

function drawEmptyState(context, width, height) {
  text(context, "Look around to start mapping", { x: width / 2, y: height / 2 }, PALETTE.label, 13, 400);
}

export function drawMap(canvas, map) {
  const ratio = globalThis.devicePixelRatio || 1;
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  if (width === 0 || height === 0) return;

  canvas.width = Math.round(width * ratio);
  canvas.height = Math.round(height * ratio);

  const context = canvas.getContext("2d");
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  context.clearRect(0, 0, width, height);
  context.lineCap = "round";
  drawGrid(context, width, height);

  if (map.nodes.length === 0) {
    drawEmptyState(context, width, height);
    return;
  }

  const you = estimatePosition(map);
  const project = createProjection([...map.nodes, ...(you ? [you] : [])], width, height);
  drawEdges(context, map, project);
  drawStubs(context, map, project);
  map.nodes.forEach((node, index) => drawNode(context, map, node, project(node), index));
  drawYou(context, map, project);
}
