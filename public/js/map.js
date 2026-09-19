import { MAP } from "./config.js";
import { optionHeading } from "./graph.js";

const PALETTE = Object.freeze({
  edge: "#5eead4",
  node: "#a78bfa",
  start: "#fbbf24",
  current: "#22d3ee",
  lead: "rgba(251, 191, 36, 0.85)",
  leadBest: "#fb7185",
  grid: "rgba(148, 163, 184, 0.14)",
  label: "#94a3b8",
});

const LEAD_LENGTH_PX = 26;

function createProjection(nodes, width, height) {
  const xs = nodes.map((node) => node.x);
  const ys = nodes.map((node) => node.y);

  const centerX = (Math.min(...xs) + Math.max(...xs)) / 2;
  const centerY = (Math.min(...ys) + Math.max(...ys)) / 2;
  const spanX = Math.max(Math.max(...xs) - Math.min(...xs), MAP.MIN_SPAN_METERS);
  const spanY = Math.max(Math.max(...ys) - Math.min(...ys), MAP.MIN_SPAN_METERS);

  const scale = Math.min(
    (width - MAP.PADDING_PX * 2) / spanX,
    (height - MAP.PADDING_PX * 2) / spanY,
  );

  return (node) => ({
    x: width / 2 + (node.x - centerX) * scale,
    y: height / 2 + (node.y - centerY) * scale,
  });
}

function drawGrid(context, width, height) {
  context.strokeStyle = PALETTE.grid;
  context.lineWidth = 1;
  for (let x = 40; x < width; x += 40) {
    context.beginPath();
    context.moveTo(x, 0);
    context.lineTo(x, height);
    context.stroke();
  }
  for (let y = 40; y < height; y += 40) {
    context.beginPath();
    context.moveTo(0, y);
    context.lineTo(width, y);
    context.stroke();
  }
}

function drawDot(context, point, color, radius) {
  context.fillStyle = color;
  context.beginPath();
  context.arc(point.x, point.y, radius, 0, Math.PI * 2);
  context.fill();
}

/** Edges are the ways already walked, drawn between the nodes they connect. */
function drawEdges(context, map, project) {
  context.strokeStyle = PALETTE.edge;
  context.lineWidth = 2.5;
  context.lineCap = "round";

  map.nodes.forEach((node) => {
    node.options
      .filter((option) => option.leadsTo)
      .forEach((option) => {
        const target = map.nodes.find((entry) => entry.id === option.leadsTo);
        if (!target) return;
        const from = project(node);
        const to = project(target);
        context.beginPath();
        context.moveTo(from.x, from.y);
        context.lineTo(to.x, to.y);
        context.stroke();
      });
  });
}

/**
 * Unexplored options are drawn as dashed stubs pointing the way they lead.
 * They are the whole point of the map: where there is still left to try.
 */
function drawLeads(context, map, project, recommendedDirection) {
  context.setLineDash([4, 4]);
  context.lineWidth = 2;

  map.nodes.forEach((node) => {
    const origin = project(node);
    node.options
      .filter((option) => option.status === "unexplored")
      .forEach((option) => {
        const isBest = node.id === map.currentNodeId && option.direction === recommendedDirection;
        const radians = (optionHeading(node, option) * Math.PI) / 180;

        context.strokeStyle = isBest ? PALETTE.leadBest : PALETTE.lead;
        context.beginPath();
        context.moveTo(origin.x, origin.y);
        context.lineTo(
          origin.x + Math.sin(radians) * LEAD_LENGTH_PX,
          origin.y - Math.cos(radians) * LEAD_LENGTH_PX,
        );
        context.stroke();
      });
  });

  context.setLineDash([]);
}

function drawEmptyState(context, width, height) {
  context.fillStyle = PALETTE.label;
  context.font = "13px -apple-system, system-ui, sans-serif";
  context.textAlign = "center";
  context.fillText("Look around to start mapping", width / 2, height / 2);
  context.textAlign = "start";
}

export function drawMap(canvas, map, { recommendedDirection = null } = {}) {
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

  if (map.nodes.length === 0) {
    drawEmptyState(context, width, height);
    return;
  }

  const project = createProjection(map.nodes, width, height);
  drawEdges(context, map, project);
  drawLeads(context, map, project, recommendedDirection);

  map.nodes.forEach((node, index) => {
    const isCurrent = node.id === map.currentNodeId;
    const color = isCurrent ? PALETTE.current : index === 0 ? PALETTE.start : PALETTE.node;
    drawDot(context, project(node), color, isCurrent ? 8 : 5);
  });
}
