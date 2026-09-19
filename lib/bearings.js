const RAD = Math.PI / 180;

const normalize = (degrees) => ((degrees % 360) + 360) % 360;

/**
 * How far an exit sits from the centre of its photo, in degrees. `x` is where
 * it appears across the frame, 0 at the left edge and 1 at the right. Pinhole
 * projection rather than a straight line, so the edges are not overstated.
 *
 * This is the correction that matters most for the marker: an exit near the
 * edge of a frame used to be reported at the frame's centre heading, up to
 * half a field of view (~30 degrees) off.
 */
export function frameOffsetDegrees(x, fovDegrees) {
  const position = Number.isFinite(x) ? Math.min(1, Math.max(0, x)) : 0.5;
  const halfWidth = Math.tan((fovDegrees / 2) * RAD);
  return Math.atan((2 * position - 1) * halfWidth) / RAD;
}

/**
 * Turns each option's photo number and in-photo position into the compass
 * bearing it lies at, and drops any option pointing at a photo that does not
 * exist. A bearing invented from a bad index would aim the marker at nothing.
 */
export function resolveBearings(survey, frames, fovDegrees) {
  // Keep the original position of each option: the model's recommendation
  // indexes into the list it wrote, not into whatever survives the filter.
  const kept = (survey.options ?? [])
    .map((option, index) => ({ option, originalIndex: index + 1 }))
    .filter(({ option }) => Number.isInteger(option.photo)
      && option.photo >= 1
      && option.photo <= frames.length);

  const options = kept.map(({ option }) => ({
    bearing: Math.round(normalize(
      frames[option.photo - 1].heading + frameOffsetDegrees(option.x, fovDegrees),
    )),
    description: option.description,
    promise: option.promise ?? 0,
    is_way_back: option.is_way_back === true,
  }));

  if (survey.arrived || options.length === 0) {
    return { ...survey, options, recommendation: null };
  }

  const asked = survey.recommendation?.option_index;
  const position = kept.findIndex((entry) => entry.originalIndex === asked);
  const chosen = position >= 0
    ? position
    : options.reduce((best, option, index) =>
      option.promise > options[best].promise ? index : best, 0);

  return {
    ...survey,
    options,
    recommendation: {
      why: survey.recommendation?.why ?? options[chosen].description,
      option_index: chosen + 1,
      bearing: options[chosen].bearing,
    },
  };
}
