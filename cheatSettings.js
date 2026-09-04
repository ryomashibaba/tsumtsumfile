export const CHEAT_SPECIAL = Object.freeze({
  UNLIMITED: "unlimited",
  INSTANT: "instant"
});

export const DEFAULT_CHEAT_SETTINGS = Object.freeze({
  enabled: false,
  boardTarget: 45,
  spawnRate: CHEAT_SPECIAL.INSTANT,
  largeTsumChance: 1,
  gravityMultiplier: 1,
  tsumDiameter: 58,
  autoSkill: false,
  skillCosts: Object.freeze({}),
  coinCorrections: Object.freeze({})
});

function normalizeInteger(value, fallback) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }
  return Math.max(0, Math.min(999, Math.round(numeric)));
}

function normalizeRangedValue(value, specialValue, fallback) {
  if (value === specialValue) {
    return specialValue;
  }
  return normalizeInteger(value, fallback);
}

function normalizeNumber(value, fallback, min, max, decimals = 0) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  const factor = 10 ** decimals;
  return Math.max(min, Math.min(max, Math.round(numeric * factor) / factor));
}

export function normalizeCheatSettings(value = {}) {
  const source = value && typeof value === "object" ? value : {};
  const rawCosts = source.skillCosts && typeof source.skillCosts === "object" && !Array.isArray(source.skillCosts)
    ? source.skillCosts
    : {};
  const skillCosts = {};
  for (const [key, cost] of Object.entries(rawCosts)) {
    if (!key) continue;
    if (cost === CHEAT_SPECIAL.UNLIMITED) {
      skillCosts[key] = CHEAT_SPECIAL.UNLIMITED;
      continue;
    }
    const numeric = Number(cost);
    if (Number.isFinite(numeric)) {
      skillCosts[key] = normalizeInteger(numeric, 0);
    }
  }
  const rawCorrections = source.coinCorrections && typeof source.coinCorrections === "object" && !Array.isArray(source.coinCorrections)
    ? source.coinCorrections
    : {};
  const coinCorrections = {};
  for (const [key, correction] of Object.entries(rawCorrections)) {
    if (!key) continue;
    const numeric = Number(correction);
    if (Number.isFinite(numeric)) coinCorrections[key] = normalizeNumber(numeric, 0, -999, 999);
  }
  return {
    enabled: source.enabled === true,
    boardTarget: normalizeRangedValue(
      source.boardTarget,
      CHEAT_SPECIAL.UNLIMITED,
      DEFAULT_CHEAT_SETTINGS.boardTarget
    ),
    spawnRate: normalizeRangedValue(
      source.spawnRate,
      CHEAT_SPECIAL.INSTANT,
      DEFAULT_CHEAT_SETTINGS.spawnRate
    ),
    largeTsumChance: normalizeNumber(source.largeTsumChance, DEFAULT_CHEAT_SETTINGS.largeTsumChance, 0, 100, 1),
    gravityMultiplier: normalizeNumber(source.gravityMultiplier, DEFAULT_CHEAT_SETTINGS.gravityMultiplier, 0.1, 10, 1),
    tsumDiameter: normalizeNumber(source.tsumDiameter, DEFAULT_CHEAT_SETTINGS.tsumDiameter, 1, 100),
    autoSkill: source.autoSkill === true,
    skillCosts,
    coinCorrections
  };
}

export function getCoinCorrectionKey(characterId, kind, route = "default") {
  return `${String(characterId || "")}:${kind}:${route}`;
}

export function parseCoinCorrectionType(value) {
  const match = /^correction_(-?\d+)$/.exec(String(value || ""));
  return match ? Number(match[1]) : 0;
}

export function getSkillCostKey(characterId, pairMode = null) {
  if (characterId === "judyNick" && (pairMode === "judy" || pairMode === "nick")) {
    return `${characterId}:${pairMode}`;
  }
  return String(characterId || "");
}

export function resolveSkillCost(settings, characterId, pairMode, defaultCost) {
  const fallback = Math.max(0, Number(defaultCost) || 0);
  if (!settings?.enabled) {
    return fallback;
  }
  const key = getSkillCostKey(characterId, pairMode);
  if (!Object.prototype.hasOwnProperty.call(settings.skillCosts || {}, key)) {
    return fallback;
  }
  const override = settings.skillCosts[key];
  return override === CHEAT_SPECIAL.UNLIMITED ? Infinity : normalizeInteger(override, fallback);
}

export function displaySettingValue(value, specialValue) {
  return value === specialValue ? 1000 : normalizeInteger(value, 0);
}

export function settingValueFromSlider(value, specialValue) {
  const numeric = Math.max(0, Math.min(1000, Math.round(Number(value) || 0)));
  return numeric === 1000 ? specialValue : numeric;
}

export function reconcileGaugeCharge({ charge = 0, maxCharge = 0, lastFiniteRatio = 0 }, nextMaxCharge, preserveRatio) {
  let ratio = 0;
  if (maxCharge === Infinity) {
    ratio = Math.max(0, Math.min(1, Number(lastFiniteRatio) || 0));
  } else if (maxCharge === 0) {
    ratio = 1;
  } else if (Number.isFinite(maxCharge) && maxCharge > 0) {
    ratio = Math.max(0, Math.min(1, (Number(charge) || 0) / maxCharge));
  }
  if (!preserveRatio) {
    ratio = nextMaxCharge === 0 ? 1 : 0;
  }
  if (nextMaxCharge === Infinity) {
    return { charge: 0, maxCharge: Infinity, lastFiniteRatio: ratio, isReady: false };
  }
  const finiteMax = Math.max(0, normalizeInteger(nextMaxCharge, 0));
  const nextCharge = finiteMax === 0 ? 0 : ratio * finiteMax;
  return {
    charge: nextCharge,
    maxCharge: finiteMax,
    lastFiniteRatio: finiteMax === 0 ? 1 : ratio,
    isReady: finiteMax === 0 || nextCharge >= finiteMax
  };
}

export function advanceSpawnSchedule({ settings, occupancy = 0, accumulator = 0, dt = 0, defaultTarget = 45 }) {
  const normalized = normalizeCheatSettings(settings);
  if (!normalized.enabled) {
    return {
      spawnCount: Math.max(0, Math.ceil(defaultTarget - occupancy)),
      accumulator: 0
    };
  }

  const unlimited = normalized.boardTarget === CHEAT_SPECIAL.UNLIMITED;
  const deficit = unlimited ? Infinity : Math.max(0, normalized.boardTarget - occupancy);
  if (!unlimited && deficit < 1) {
    return { spawnCount: 0, accumulator: 0 };
  }

  if (normalized.spawnRate === CHEAT_SPECIAL.INSTANT && !unlimited) {
    return { spawnCount: Math.ceil(deficit), accumulator: 0 };
  }
  const rate = normalized.spawnRate === CHEAT_SPECIAL.INSTANT ? 999 : normalized.spawnRate;
  if (!(rate > 0)) {
    return { spawnCount: 0, accumulator: 0 };
  }
  const nextAccumulator = Math.max(0, Number(accumulator) || 0) + rate * Math.max(0, Number(dt) || 0);
  const available = Math.floor(nextAccumulator);
  const spawnCount = unlimited ? available : Math.min(available, Math.ceil(deficit));
  return {
    spawnCount,
    accumulator: nextAccumulator - spawnCount
  };
}
