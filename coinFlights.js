import {
  LARGE_TSUM_CLEAR_WEIGHT,
  calculateEffectiveClearCount,
  getCoinIncludedClearPositions,
  getTsumClearWeight
} from './bombLogic.js';

export const COIN_FLIGHT_HOLD_MIN_SEC = 0.10;
export const COIN_FLIGHT_HOLD_MAX_SEC = 0.20;
export const COIN_FLIGHT_CHASE_SEC = 0.55;
export const COIN_FLIGHT_CHASE_TAU_SEC = 0.22;
export const COIN_FLIGHT_FLIP_PERIOD_SEC = 0.4;
export const COIN_FLIGHT_DIAMETER_RATIO = 0.475;

function finite(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

function randomBetween(rng, min, max) {
  return min + (max - min) * Math.min(1, Math.max(0, finite(rng?.(), 0.5)));
}

export function buildCoinFlightAwardPlan({ coinTable, targets = [], ...clearEvent } = {}) {
  if (!coinTable) {
    return { totalCoins: 0, targetAwards: [], syntheticCoins: 0 };
  }
  const resolvedClearCount = Math.max(0, Math.floor(calculateEffectiveClearCount({ targets, ...clearEvent })));
  const includedPositions = new Set(getCoinIncludedClearPositions({ targets, ...clearEvent }));
  const owners = new Array(resolvedClearCount + 1).fill(null);
  let logicalPosition = 0;
  for (const target of targets) {
    const weight = Math.max(1, Math.floor(getTsumClearWeight(target)));
    for (let unit = 0; unit < weight && logicalPosition < resolvedClearCount; unit += 1) {
      logicalPosition += 1;
      owners[logicalPosition] = target?.id ?? null;
    }
  }

  const awards = new Map();
  let syntheticCoins = 0;
  let totalCoins = 0;
  for (let position = 1; position <= resolvedClearCount; position += 1) {
    if (!includedPositions.has(position)) {
      continue;
    }
    const current = finite(Number(coinTable[position]), 0);
    const previous = finite(Number(coinTable[position - 1]), 0);
    const marginalCoins = Math.max(0, Math.round(current - previous));
    if (marginalCoins <= 0) {
      continue;
    }
    totalCoins += marginalCoins;
    const ownerId = owners[position];
    if (ownerId == null) {
      syntheticCoins += marginalCoins;
    } else {
      awards.set(ownerId, (awards.get(ownerId) || 0) + marginalCoins);
    }
  }

  return {
    totalCoins,
    targetAwards: Array.from(awards, ([targetId, count]) => ({ targetId, count })),
    syntheticCoins
  };
}

export function createCoinFlight({ startX, startY, targetX, targetY, radius, rng = Math.random } = {}) {
  const holdDuration = randomBetween(rng, COIN_FLIGHT_HOLD_MIN_SEC, COIN_FLIGHT_HOLD_MAX_SEC);
  const originX = finite(startX) + randomBetween(rng, -4.5, 4.5);
  const originY = finite(startY) + randomBetween(rng, -4.5, 4.5);
  return {
    elapsed: 0,
    holdDuration,
    chaseDuration: COIN_FLIGHT_CHASE_SEC,
    tau: COIN_FLIGHT_CHASE_TAU_SEC,
    startX: originX,
    startY: originY,
    holdEndX: originX + randomBetween(rng, -9, 9),
    holdEndY: originY + randomBetween(rng, -8, 5),
    bobX: randomBetween(rng, -5, 5),
    bobY: randomBetween(rng, 4, 11),
    targetX: finite(targetX),
    targetY: finite(targetY),
    radius: Math.max(1, finite(radius, 12)),
    flipPhase: randomBetween(rng, 0, COIN_FLIGHT_FLIP_PERIOD_SEC),
    arrived: false
  };
}

export function sampleCoinFlight(flight) {
  const elapsed = Math.max(0, finite(flight?.elapsed));
  const holdDuration = Math.max(0.001, finite(flight?.holdDuration, COIN_FLIGHT_HOLD_MIN_SEC));
  const chaseDuration = Math.max(0.001, finite(flight?.chaseDuration, COIN_FLIGHT_CHASE_SEC));
  let x;
  let y;
  let progress;
  if (elapsed < holdDuration) {
    progress = elapsed / holdDuration;
    const linger = Math.sin(progress * Math.PI);
    x = flight.startX + (flight.holdEndX - flight.startX) * progress + flight.bobX * linger;
    y = flight.startY + (flight.holdEndY - flight.startY) * progress - flight.bobY * linger;
  } else {
    const chaseElapsed = Math.min(chaseDuration, elapsed - holdDuration);
    const tau = Math.max(0.001, finite(flight.tau, COIN_FLIGHT_CHASE_TAU_SEC));
    const denominator = 1 - Math.exp(-chaseDuration / tau);
    progress = denominator > 0
      ? (1 - Math.exp(-chaseElapsed / tau)) / denominator
      : chaseElapsed / chaseDuration;
    progress = Math.min(1, Math.max(0, progress));
    x = flight.holdEndX + (flight.targetX - flight.holdEndX) * progress;
    y = flight.holdEndY + (flight.targetY - flight.holdEndY) * progress;
  }
  const flipAngle = ((elapsed + finite(flight.flipPhase)) / COIN_FLIGHT_FLIP_PERIOD_SEC) * Math.PI * 2;
  return {
    x,
    y,
    progress,
    scaleX: Math.max(0.12, Math.abs(Math.cos(flipAngle))),
    arrived: elapsed >= holdDuration + chaseDuration
  };
}

export function advanceCoinFlight(flight, dtSec = 0) {
  flight.elapsed = Math.max(0, finite(flight.elapsed) + Math.max(0, finite(dtSec)));
  const sample = sampleCoinFlight(flight);
  flight.arrived = sample.arrived;
  return sample;
}

export function assumeCompletedLargeTsumSteps(targets = []) {
  return new Map(targets
    .filter((target) => Math.floor(getTsumClearWeight(target)) === LARGE_TSUM_CLEAR_WEIGHT)
    .map((target) => [target.id, LARGE_TSUM_CLEAR_WEIGHT]));
}
