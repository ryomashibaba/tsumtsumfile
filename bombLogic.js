export const STANDARD_BOMB_TYPES = Object.freeze([
  "normal",
  "time",
  "star",
  "coin",
  "score"
]);

/**
 * Estimated bomb probabilities based on large-scale empirical Tsum Tsum
 * observations. These are not confirmed internal game constants.
 */
export const BOMB_PROBABILITIES = Object.freeze({
  7: Object.freeze({ normal: 1 }),
  8: Object.freeze({ normal: 1 }),
  9: Object.freeze({ normal: 0.75, time: 0.25 }),
  10: Object.freeze({ normal: 0.8, time: 0.2 }),
  11: Object.freeze({ normal: 0.6, time: 0.2, star: 0.2 }),
  12: Object.freeze({ normal: 0.5, time: 0.25, star: 0.25 }),
  13: Object.freeze({ normal: 0.1, time: 0.2, star: 0.55, coin: 0.15 }),
  14: Object.freeze({ time: 0.25, star: 0.5, coin: 0.25 }),
  15: Object.freeze({ time: 0.05, star: 0.45, coin: 0.25, score: 0.25 }),
  16: Object.freeze({ time: 0.05, star: 0.45, coin: 0.3, score: 0.2 }),
  17: Object.freeze({ star: 0.3, coin: 0.4, score: 0.3 }),
  18: Object.freeze({ star: 1 / 3, coin: 1 / 3, score: 1 / 3 }),
  19: Object.freeze({ coin: 0.55, score: 0.45 }),
  20: Object.freeze({ coin: 0.4, score: 0.6 })
});

export const LARGE_TSUM_CLEAR_WEIGHT = 5;
export const LARGE_TSUM_OCCUPANCY_WEIGHT = 1;
export const LARGE_TSUM_SCALE = 1.5;
export const MAX_NATURAL_LARGE_TSUMS = 2;

// The official game only documents that large Tsums may appear after a clear
// of seven or more. The exact rate is unknown; 1% is this project's estimate.
export const DEFAULT_LARGE_TSUM_SPAWN_CHANCE = 0.01;

export function getTsumClearWeight(tsum) {
  const weight = Number(tsum?.clearWeight);
  return Number.isFinite(weight) && weight > 0 ? weight : 1;
}

export function getTsumOccupancyWeight(tsum) {
  const weight = Number(tsum?.occupancyWeight);
  return Number.isFinite(weight) && weight > 0 ? weight : 1;
}

export function getTsumSkillChargeWeight(tsum, chargeMultiplier = 1) {
  const multiplier = Number.isFinite(chargeMultiplier) ? chargeMultiplier : 1;
  return getTsumClearWeight(tsum) * multiplier;
}

export function calculateEffectiveClearCount({
  targets = [],
  additionalClearCount = 0,
  effectiveClearCountOverride,
  clearCountOverride
} = {}) {
  const weightedTargetCount = targets.reduce(
    (sum, target) => sum + getTsumClearWeight(target),
    0
  );
  const legacyOrExplicitOverride = effectiveClearCountOverride ?? clearCountOverride;
  if (Number.isFinite(legacyOrExplicitOverride)) {
    return Math.max(0, legacyOrExplicitOverride);
  }
  const additional = Number.isFinite(additionalClearCount)
    ? Math.max(0, additionalClearCount)
    : 0;
  return Math.max(0, weightedTargetCount + additional);
}

function readCompletedLargeSteps(completedLargeSteps, target) {
  if (!target) {
    return 0;
  }
  const raw = completedLargeSteps instanceof Map
    ? completedLargeSteps.get(target.id)
    : completedLargeSteps?.[target.id];
  return Number.isFinite(raw)
    ? Math.max(0, Math.min(LARGE_TSUM_CLEAR_WEIGHT, Math.floor(raw)))
    : 0;
}

/**
 * Returns the one-based logical clear positions whose marginal coin values
 * survive large-Tsum correction. Synthetic/override clear units are appended
 * after the physical targets and are always retained.
 */
export function getCoinIncludedClearPositions({
  targets = [],
  additionalClearCount = 0,
  effectiveClearCountOverride,
  clearCountOverride,
  applyLargeTsumCorrection = false,
  completedLargeSteps = null
} = {}) {
  const resolvedClearCount = Math.max(0, Math.floor(calculateEffectiveClearCount({
    targets,
    additionalClearCount,
    effectiveClearCountOverride,
    clearCountOverride
  })));
  const included = [];
  let logicalPosition = 0;

  for (const target of targets) {
    const weight = Math.max(1, Math.floor(getTsumClearWeight(target)));
    const isLarge = weight === LARGE_TSUM_CLEAR_WEIGHT;
    const completed = isLarge
      ? readCompletedLargeSteps(completedLargeSteps, target)
      : weight;
    for (let unit = 1; unit <= weight && logicalPosition < resolvedClearCount; unit += 1) {
      logicalPosition += 1;
      const keep = !applyLargeTsumCorrection
        || !isLarge
        || completed >= weight
        || unit <= completed
        || unit === weight;
      if (keep) {
        included.push(logicalPosition);
      }
    }
    if (logicalPosition >= resolvedClearCount) {
      break;
    }
  }

  while (logicalPosition < resolvedClearCount) {
    logicalPosition += 1;
    included.push(logicalPosition);
  }
  return included;
}

export function calculateCorrectedClearCoins({ coinTable, ...clearEvent } = {}) {
  if (!coinTable) {
    return 0;
  }
  const includedPositions = getCoinIncludedClearPositions(clearEvent);
  if (!includedPositions.length) {
    return Number(coinTable[0]) || 0;
  }
  if (!clearEvent.applyLargeTsumCorrection) {
    return Number(coinTable[includedPositions[includedPositions.length - 1]]) || 0;
  }
  return includedPositions.reduce((coins, position) => {
    const current = Number(coinTable[position]) || 0;
    const previous = Number(coinTable[position - 1]) || 0;
    return coins + (current - previous);
  }, 0);
}

export function getEffectiveBombCount(effectiveClearCount, bombCountModifier = 0) {
  const clearCount = Number.isFinite(effectiveClearCount) ? effectiveClearCount : 0;
  const modifier = Number.isFinite(bombCountModifier) ? bombCountModifier : 0;
  return Math.max(0, clearCount + modifier);
}

export function getBombProbabilityTable(effectiveBombCount) {
  if (effectiveBombCount < 7) {
    return null;
  }
  if (effectiveBombCount >= 21) {
    return Object.freeze({ score: 1 });
  }
  return BOMB_PROBABILITIES[effectiveBombCount] || null;
}

export function chooseWeightedBomb(table, rng = Math.random) {
  const entries = Object.entries(table || {});
  if (!entries.length) {
    throw new Error("Empty bomb probability table");
  }
  const value = rng();
  let cumulative = 0;
  let lastType = null;
  for (const [type, probability] of entries) {
    cumulative += probability;
    lastType = type;
    if (value < cumulative) {
      return type;
    }
  }
  return lastType;
}

export function resolveBombGeneration(context = {}, rng = Math.random) {
  if (context.disableStandardBomb) {
    return null;
  }
  const effectiveBombCount = getEffectiveBombCount(
    context.effectiveClearCount,
    context.bombCountModifier
  );
  if (context.forcedBombType) {
    return { bombType: context.forcedBombType, effectiveBombCount };
  }
  if (effectiveBombCount < 7) {
    return null;
  }
  if (effectiveBombCount >= 21) {
    return { bombType: "score", effectiveBombCount };
  }
  const table = getBombProbabilityTable(effectiveBombCount);
  if (!table) {
    return null;
  }
  const deterministicType = Object.entries(table).find(([, probability]) => probability === 1)?.[0];
  return {
    bombType: deterministicType || chooseWeightedBomb(table, rng),
    effectiveBombCount
  };
}

export function shouldSpawnLargeTsum(
  effectiveClearCount,
  rng = Math.random,
  chance = DEFAULT_LARGE_TSUM_SPAWN_CHANCE
) {
  if (effectiveClearCount < 7 || chance <= 0) {
    return false;
  }
  if (chance >= 1) {
    return true;
  }
  return rng() < chance;
}

export function canSpawnNaturalLargeTsum({
  hasPendingReservation = false,
  liveNaturalLargeCount = 0,
  availableBodySlots = 0
} = {}) {
  return !!hasPendingReservation
    && availableBodySlots >= LARGE_TSUM_OCCUPANCY_WEIGHT
    && Math.max(0, Math.floor(liveNaturalLargeCount || 0)) < MAX_NATURAL_LARGE_TSUMS;
}
