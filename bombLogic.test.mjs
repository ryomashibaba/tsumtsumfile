import test from "node:test";
import assert from "node:assert/strict";

import {
  BOMB_PROBABILITIES,
  LARGE_TSUM_CLEAR_WEIGHT,
  LARGE_TSUM_OCCUPANCY_WEIGHT,
  MAX_NATURAL_LARGE_TSUMS,
  calculateCorrectedClearCoins,
  calculateEffectiveClearCount,
  canSpawnNaturalLargeTsum,
  chooseWeightedBomb,
  getCoinIncludedClearPositions,
  getEffectiveBombCount,
  getTsumOccupancyWeight,
  getTsumSkillChargeWeight,
  resolveBombGeneration,
  shouldSpawnLargeTsum
} from "./bombLogic.js";
import { COIN_CORRECTION_TABLE } from "./config.js";

const bombTypeAt = (count, value, modifier = 0) => resolveBombGeneration({
  effectiveClearCount: count,
  bombCountModifier: modifier
}, () => value)?.bombType ?? null;

test("all empirical bomb probability tables sum to one", () => {
  for (const [count, table] of Object.entries(BOMB_PROBABILITIES)) {
    const sum = Object.values(table).reduce((total, probability) => total + probability, 0);
    assert.ok(Math.abs(sum - 1) < 1e-12, `count ${count} sums to ${sum}`);
  }
});

test("standard bomb boundaries resolve without unnecessary RNG", () => {
  for (const count of [0, 1, 6]) {
    assert.equal(bombTypeAt(count, 0), null);
  }
  let calls = 0;
  const rng = () => (calls += 1, 0.5);
  assert.equal(resolveBombGeneration({ effectiveClearCount: 7 }, rng).bombType, "normal");
  assert.equal(resolveBombGeneration({ effectiveClearCount: 8 }, rng).bombType, "normal");
  assert.equal(resolveBombGeneration({ effectiveClearCount: 21 }, rng).bombType, "score");
  assert.equal(resolveBombGeneration({ effectiveClearCount: 30 }, rng).bombType, "score");
  assert.equal(calls, 0);
});

test("+Bomb shifts both threshold and probability lookup by one", () => {
  assert.equal(bombTypeAt(5, 0, 1), null);
  assert.equal(bombTypeAt(6, 0, 1), "normal");
  assert.equal(bombTypeAt(8, 0.749999, 1), "normal");
  assert.equal(bombTypeAt(8, 0.75, 1), "time");
  assert.equal(bombTypeAt(13, 0, 1), "time");
  assert.equal(bombTypeAt(20, 0.5, 1), "score");
  assert.equal(getEffectiveBombCount(8, 1), 9);
  assert.equal(bombTypeAt(5, 0, 2), "normal");
});

test("large Tsum weights contribute five to effective clear count", () => {
  const large = { clearWeight: LARGE_TSUM_CLEAR_WEIGHT };
  const normal = () => ({ clearWeight: 1 });
  assert.equal(calculateEffectiveClearCount({ targets: [large, normal()] }), 6);
  assert.equal(calculateEffectiveClearCount({ targets: [large, normal(), normal()] }), 7);
  assert.equal(calculateEffectiveClearCount({ targets: [large, normal(), normal(), normal(), normal()] }), 9);
  assert.equal(getTsumOccupancyWeight({ occupancyWeight: LARGE_TSUM_OCCUPANCY_WEIGHT }), 1);
});

test("45 physical Tsums stay at 45 body slots while large Tsums add four clears each", () => {
  const board = (largeCount) => Array.from({ length: 45 }, (_, index) => ({
    id: `tsum-${index}`,
    clearWeight: index < largeCount ? LARGE_TSUM_CLEAR_WEIGHT : 1,
    occupancyWeight: 1
  }));
  for (const [largeCount, expectedClears] of [[0, 45], [1, 49], [2, 53]]) {
    const targets = board(largeCount);
    assert.equal(targets.reduce((sum, target) => sum + getTsumOccupancyWeight(target), 0), 45);
    assert.equal(calculateEffectiveClearCount({ targets }), expectedClears);
  }
});

test("one large MyTsum charges the skill gauge like five normal MyTsums", () => {
  assert.equal(getTsumSkillChargeWeight({ clearWeight: 1 }, 0.5), 0.5);
  assert.equal(getTsumSkillChargeWeight({ clearWeight: 5 }, 0.5), 2.5);
  assert.equal(getTsumSkillChargeWeight({ clearWeight: 5 }), 5);
});

test("large Tsum correction keeps completed prefix and final marginal coin only", () => {
  const targets = [
    { id: "n1", clearWeight: 1 },
    { id: "n2", clearWeight: 1 },
    { id: "n3", clearWeight: 1 },
    { id: "large", clearWeight: 5 },
    { id: "n4", clearWeight: 1 },
    { id: "n5", clearWeight: 1 }
  ];
  const coins = (completed) => calculateCorrectedClearCoins({
    coinTable: COIN_CORRECTION_TABLE.correction_0,
    targets,
    applyLargeTsumCorrection: true,
    completedLargeSteps: new Map([["large", completed]])
  });
  assert.deepEqual(getCoinIncludedClearPositions({
    targets,
    applyLargeTsumCorrection: true,
    completedLargeSteps: { large: 0 }
  }), [1, 2, 3, 8, 9, 10]);
  assert.equal(coins(0), 9);
  assert.equal(coins(3), 14);
  assert.equal(coins(5), 16);
  assert.equal(calculateCorrectedClearCoins({
    coinTable: COIN_CORRECTION_TABLE.correction_0,
    targets
  }), COIN_CORRECTION_TABLE.correction_0[10]);
});

test("large Tsum correction uses marginal values from the active correction table", () => {
  const targets = [
    { id: "n1", clearWeight: 1 },
    { id: "n2", clearWeight: 1 },
    { id: "n3", clearWeight: 1 },
    { id: "large", clearWeight: 5 },
    { id: "n4", clearWeight: 1 },
    { id: "n5", clearWeight: 1 }
  ];
  const table = COIN_CORRECTION_TABLE.correction_5;
  const included = [1, 2, 3, 8, 9, 10];
  const expected = included.reduce((sum, position) => sum + table[position] - table[position - 1], 0);
  assert.equal(calculateCorrectedClearCoins({
    coinTable: table,
    targets,
    applyLargeTsumCorrection: true,
    completedLargeSteps: { large: 0 }
  }), expected);
});

test("multiple large Tsums are corrected independently and synthetic clears append normally", () => {
  const targets = [
    { id: "normal-a", clearWeight: 1 },
    { id: "large-a", clearWeight: 5 },
    { id: "normal-b", clearWeight: 1 },
    { id: "large-b", clearWeight: 5 }
  ];
  assert.deepEqual(getCoinIncludedClearPositions({
    targets,
    additionalClearCount: 2,
    applyLargeTsumCorrection: true,
    completedLargeSteps: { "large-a": 0, "large-b": 3 }
  }), [1, 6, 7, 8, 9, 10, 12, 13, 14]);
  assert.deepEqual(getCoinIncludedClearPositions({
    targets,
    effectiveClearCountOverride: 14,
    applyLargeTsumCorrection: true,
    completedLargeSteps: { "large-a": 5, "large-b": 5 }
  }), Array.from({ length: 14 }, (_, index) => index + 1));
});

test("explicit overrides and additive synthetic clears remain distinct", () => {
  const targets = [{ clearWeight: 5 }, { clearWeight: 1 }];
  assert.equal(calculateEffectiveClearCount({ targets, additionalClearCount: 2 }), 8);
  assert.equal(calculateEffectiveClearCount({ targets, effectiveClearCountOverride: 12 }), 12);
  assert.equal(calculateEffectiveClearCount({ targets, clearCountOverride: 11 }), 11);
});

test("9-clear weighted random boundaries are exact", () => {
  assert.equal(bombTypeAt(9, 0), "normal");
  assert.equal(bombTypeAt(9, 0.749999), "normal");
  assert.equal(bombTypeAt(9, 0.75), "time");
  assert.equal(bombTypeAt(9, 0.999999), "time");
});

test("14-clear weighted random boundaries are exact", () => {
  assert.equal(bombTypeAt(14, 0), "time");
  assert.equal(bombTypeAt(14, 0.249999), "time");
  assert.equal(bombTypeAt(14, 0.25), "star");
  assert.equal(bombTypeAt(14, 0.749999), "star");
  assert.equal(bombTypeAt(14, 0.75), "coin");
  assert.equal(bombTypeAt(14, 0.999999), "coin");
});

test("18-clear thirds and floating point fallback always return a type", () => {
  assert.equal(bombTypeAt(18, 0), "star");
  assert.equal(bombTypeAt(18, 1 / 3), "coin");
  assert.equal(bombTypeAt(18, 2 / 3), "score");
  assert.equal(chooseWeightedBomb({ normal: 0.1, time: 0.1 }, () => 0.999999), "time");
});

test("forced and disabled generation bypass standard selection", () => {
  let calls = 0;
  const rng = () => (calls += 1, 0.5);
  assert.equal(resolveBombGeneration({
    effectiveClearCount: 3,
    forcedBombType: "moanaSpecial"
  }, rng).bombType, "moanaSpecial");
  assert.equal(resolveBombGeneration({
    effectiveClearCount: 30,
    forcedBombType: "score",
    disableStandardBomb: true
  }, rng), null);
  assert.equal(calls, 0);
});

test("each resolver call represents one independent ClearEvent", () => {
  const first = resolveBombGeneration({ effectiveClearCount: 14 }, () => 0.1);
  const second = resolveBombGeneration({ effectiveClearCount: 18 }, () => 0.5);
  assert.deepEqual([first.bombType, second.bombType], ["time", "coin"]);
  assert.equal(Object.hasOwn(first, "bombType"), true);
});

test("large Tsum natural spawn uses pre-item count and the 1% boundary", () => {
  let calls = 0;
  assert.equal(shouldSpawnLargeTsum(6, () => (calls += 1, 0), 0.01), false);
  assert.equal(calls, 0);
  assert.equal(shouldSpawnLargeTsum(7, () => 0.009999, 0.01), true);
  assert.equal(shouldSpawnLargeTsum(7, () => 0.01, 0.01), false);
  assert.equal(shouldSpawnLargeTsum(7, () => 0.999, 1), true);
});

test("natural large Tsum reservations are capped only when they enter the board", () => {
  assert.equal(MAX_NATURAL_LARGE_TSUMS, 2);
  assert.equal(canSpawnNaturalLargeTsum({
    hasPendingReservation: true,
    liveNaturalLargeCount: 0,
    availableBodySlots: 1
  }), true);
  assert.equal(canSpawnNaturalLargeTsum({
    hasPendingReservation: true,
    liveNaturalLargeCount: 1,
    availableBodySlots: 1
  }), true);
  assert.equal(canSpawnNaturalLargeTsum({
    hasPendingReservation: true,
    liveNaturalLargeCount: 2,
    availableBodySlots: 1
  }), false);
  assert.equal(canSpawnNaturalLargeTsum({
    hasPendingReservation: false,
    liveNaturalLargeCount: 0,
    availableBodySlots: 1
  }), false);
  let liveNaturalLargeCount = 0;
  const spawnedAsLarge = Array.from({ length: 3 }, () => {
    const canSpawn = canSpawnNaturalLargeTsum({
      hasPendingReservation: true,
      liveNaturalLargeCount,
      availableBodySlots: 1
    });
    if (canSpawn) liveNaturalLargeCount += 1;
    return canSpawn;
  });
  assert.deepEqual(spawnedAsLarge, [true, true, false]);
});
