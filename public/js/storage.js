const KEY = "breadcrumb.map.v1";

/**
 * Maps persist between visits, so walking into somewhere you have explored
 * before means Gemini can recognise it and route over ground you already
 * covered instead of guessing again. Every access is guarded: private windows
 * and blocked site data make localStorage throw rather than return empty.
 */
// Reference photos are what make a place recognisable, but they are also the
// only large thing here, and localStorage is a few megabytes at best. Keep them
// for the most recent places and let older ones fall back to their description.
const KEEP_REFERENCES_FOR = 12;

const trimReferences = (nodes) => {
  const cutoff = nodes.length - KEEP_REFERENCES_FOR;
  return nodes.map((node, index) =>
    index >= cutoff ? node : { ...node, reference: null });
};

export function saveMap(map) {
  if (map.nodes.length === 0) return;

  const write = (nodes) => localStorage.setItem(KEY, JSON.stringify({
    savedAt: Date.now(),
    nodes,
    currentNodeId: map.currentNodeId,
  }));

  try {
    write(trimReferences(map.nodes));
  } catch (err) {
    // Out of room: the places and their links matter more than the photos.
    console.warn("Could not save the map with references, retrying without", err);
    try {
      write(map.nodes.map((node) => ({ ...node, reference: null })));
    } catch (fallbackErr) {
      console.warn("Could not save the map", fallbackErr);
    }
  }
}

export function loadMap() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed?.nodes) || parsed.nodes.length === 0) return null;

    return {
      savedAt: parsed.savedAt ?? null,
      nodes: parsed.nodes,
      currentNodeId: parsed.currentNodeId ?? null,
    };
  } catch (err) {
    console.warn("Could not read the saved map", err);
    return null;
  }
}

export function clearMap() {
  try {
    localStorage.removeItem(KEY);
  } catch (err) {
    console.warn("Could not clear the saved map", err);
  }
}

export function describeAge(savedAt) {
  if (!savedAt) return "earlier";
  const minutes = Math.round((Date.now() - savedAt) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  return hours < 24 ? `${hours}h ago` : `${Math.round(hours / 24)}d ago`;
}
