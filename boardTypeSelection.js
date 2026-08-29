export const MIN_BOARD_COLOR_DISTANCE = 0.12;

export function hasTsumArtwork(type) {
  return !!type && (
    typeof type.imageSrc === "string" ||
    (Array.isArray(type.imageSources) && type.imageSources.length > 0)
  );
}

export function getSubTsumCandidates(types) {
  return (types || []).filter((type) => type?.subEligible === true && hasTsumArtwork(type));
}

function srgbChannelToLinear(channel) {
  const value = channel / 255;
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

export function hexToOklab(hex) {
  const match = /^#?([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(String(hex || ""));
  if (!match) {
    throw new Error(`Invalid board color: ${hex}`);
  }

  const r = srgbChannelToLinear(Number.parseInt(match[1], 16));
  const g = srgbChannelToLinear(Number.parseInt(match[2], 16));
  const b = srgbChannelToLinear(Number.parseInt(match[3], 16));
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);

  return {
    l: 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    a: 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    b: 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s
  };
}

function getBoardColors(type) {
  const colors = Array.isArray(type?.boardColors) ? type.boardColors : [type?.boardColor];
  const validColors = colors.filter(Boolean);
  if (validColors.length === 0) {
    throw new Error(`Missing boardColor for Tsum type: ${type?.id || "unknown"}`);
  }
  return validColors;
}

export function getBoardColorDistance(typeA, typeB) {
  let minimum = Infinity;
  for (const colorA of getBoardColors(typeA)) {
    const labA = hexToOklab(colorA);
    for (const colorB of getBoardColors(typeB)) {
      const labB = hexToOklab(colorB);
      const distance = Math.hypot(labA.l - labB.l, labA.a - labB.a, labA.b - labB.b);
      minimum = Math.min(minimum, distance);
    }
  }
  return minimum;
}

export function areBoardTypesColorCompatible(types, minimumDistance = MIN_BOARD_COLOR_DISTANCE) {
  for (let i = 0; i < types.length; i += 1) {
    for (let j = i + 1; j < types.length; j += 1) {
      if (getBoardColorDistance(types[i], types[j]) < minimumDistance) {
        return false;
      }
    }
  }
  return true;
}

export function findValidBoardTypeLineups({
  requiredTypes,
  candidates,
  targetCount,
  minimumDistance = MIN_BOARD_COLOR_DISTANCE
}) {
  const required = (requiredTypes || []).filter(Boolean);
  if (required.length > targetCount || !areBoardTypesColorCompatible(required, minimumDistance)) {
    return [];
  }

  const requiredIds = new Set(required.map((type) => type.id));
  const pool = (candidates || []).filter((type) => !requiredIds.has(type.id));
  const needed = targetCount - required.length;
  const lineups = [];

  function visit(startIndex, selected) {
    if (selected.length === needed) {
      lineups.push([...required, ...selected]);
      return;
    }
    const remainingNeeded = needed - selected.length;
    for (let index = startIndex; index <= pool.length - remainingNeeded; index += 1) {
      const candidate = pool[index];
      const current = [...required, ...selected];
      if (current.every((type) => getBoardColorDistance(type, candidate) >= minimumDistance)) {
        visit(index + 1, [...selected, candidate]);
      }
    }
  }

  visit(0, []);
  return lineups;
}

export function selectBoardTypes({
  requiredTypes,
  candidates,
  targetCount,
  random = Math.random,
  minimumDistance = MIN_BOARD_COLOR_DISTANCE
}) {
  const lineups = findValidBoardTypeLineups({ requiredTypes, candidates, targetCount, minimumDistance });
  if (lineups.length === 0) {
    const requiredIds = (requiredTypes || []).map((type) => type?.id).filter(Boolean).join(", ");
    throw new Error(`No color-safe ${targetCount}-type board lineup for: ${requiredIds || "unknown"}`);
  }
  const randomValue = Math.max(0, Math.min(0.999999999999, Number(random()) || 0));
  return lineups[Math.floor(randomValue * lineups.length)];
}
