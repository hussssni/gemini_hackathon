// Builders for surveys as the server returns them, so tests read as walks.

export const option = (bearing, extra = {}) => ({
  bearing,
  description: `path at ${bearing}`,
  promise: 0.5,
  is_way_back: false,
  ...extra,
});

export const survey = ({ options = [], sameAs = null, confidence = 0.9, pick = null, arrived = false } = {}) => ({
  here: { description: "somewhere", features: ["rock"], distinctiveness: 0.5 },
  same_as_node_id: sameAs,
  match_confidence: sameAs ? confidence : 0,
  options,
  recommendation: pick === null ? null : { option_index: pick, bearing: options[pick - 1].bearing, why: "looks good" },
  spoken: "Trees all round.",
  arrived,
  confidence: 0.8,
});

export const at = (heading, steps = 0) => ({ heading, steps, references: [] });
