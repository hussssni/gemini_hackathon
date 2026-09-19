const KEY = "breadcrumb.map.v1";

/**
 * Maps persist between visits, so walking into somewhere you have explored
 * before means Gemini can recognise it and route over ground you already
 * covered instead of guessing again. Every access is guarded: private windows
 * and blocked site data make localStorage throw rather than return empty.
 */
export function saveMap(map) {
  if (map.nodes.length === 0) return;
  try {
    localStorage.setItem(KEY, JSON.stringify({
      savedAt: Date.now(),
      nodes: map.nodes,
      currentNodeId: map.currentNodeId,
    }));
  } catch (err) {
    console.warn("Could not save the map", err);
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
