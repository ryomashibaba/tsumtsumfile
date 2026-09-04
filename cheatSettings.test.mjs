import test from "node:test";
import assert from "node:assert/strict";

import {
  CHEAT_SPECIAL,
  advanceSpawnSchedule,
  getSkillCostKey,
  normalizeCheatSettings,
  reconcileGaugeCharge,
  resolveSkillCost,
  settingValueFromSlider
} from "./cheatSettings.js";
import { DualGaugeSystem } from "./judyNick.js";
import { Game } from "./game.js";

test("cheat settings normalize old, invalid, boundary, and special values", () => {
  assert.deepEqual(normalizeCheatSettings(), {
    enabled: false,
    boardTarget: 45,
    spawnRate: "instant",
    largeTsumChance: 1,
    gravityMultiplier: 1,
    tsumDiameter: 58,
    autoSkill: false,
    skillCosts: {},
    coinCorrections: {}
  });
  assert.deepEqual(normalizeCheatSettings({
    enabled: true,
    boardTarget: "unlimited",
    spawnRate: 5000,
    largeTsumChance: 500,
    gravityMultiplier: 0,
    tsumDiameter: 500,
    autoSkill: true,
    skillCosts: { alice: -2, bad: "oops", "judyNick:nick": "unlimited" },
    coinCorrections: { "coingain:skill:coingainBase": -15, bad: "oops", huge: 5000 }
  }), {
    enabled: true,
    boardTarget: "unlimited",
    spawnRate: 999,
    largeTsumChance: 100,
    gravityMultiplier: 0.1,
    tsumDiameter: 100,
    autoSkill: true,
    skillCosts: { alice: 0, "judyNick:nick": "unlimited" },
    coinCorrections: { "coingain:skill:coingainBase": -15, huge: 999 }
  });
  assert.equal(settingValueFromSlider(999, CHEAT_SPECIAL.UNLIMITED), 999);
  assert.equal(settingValueFromSlider(1000, CHEAT_SPECIAL.UNLIMITED), "unlimited");
});

test("skill cost overrides are character-specific and keep Judy and Nick separate", () => {
  const settings = normalizeCheatSettings({
    enabled: true,
    skillCosts: { alice: 0, "judyNick:judy": 7, "judyNick:nick": "unlimited" }
  });
  assert.equal(getSkillCostKey("judyNick", "judy"), "judyNick:judy");
  assert.equal(resolveSkillCost(settings, "alice", null, 25), 0);
  assert.equal(resolveSkillCost(settings, "judyNick", "judy", 25), 7);
  assert.equal(resolveSkillCost(settings, "judyNick", "nick", 25), Infinity);
  assert.equal(resolveSkillCost({ ...settings, enabled: false }, "alice", null, 25), 25);
});

test("finite spawn scheduling is deterministic and does not bank tokens while full", () => {
  const settings = normalizeCheatSettings({ enabled: true, boardTarget: 10, spawnRate: 4 });
  assert.deepEqual(advanceSpawnSchedule({ settings, occupancy: 0, accumulator: 0, dt: 0.5 }), {
    spawnCount: 2,
    accumulator: 0
  });
  assert.deepEqual(advanceSpawnSchedule({ settings, occupancy: 10, accumulator: 0.75, dt: 20 }), {
    spawnCount: 0,
    accumulator: 0
  });
  assert.deepEqual(advanceSpawnSchedule({
    settings: { ...settings, boardTarget: 0 }, occupancy: 4, accumulator: 0, dt: 1
  }), { spawnCount: 0, accumulator: 0 });
});

test("instant finite fill and unlimited instant use the safe 999 per second rate", () => {
  const finite = normalizeCheatSettings({ enabled: true, boardTarget: 45, spawnRate: "instant" });
  assert.equal(advanceSpawnSchedule({ settings: finite, occupancy: 12, dt: 0 }).spawnCount, 33);
  const unlimited = normalizeCheatSettings({ enabled: true, boardTarget: "unlimited", spawnRate: "instant" });
  assert.deepEqual(advanceSpawnSchedule({ settings: unlimited, occupancy: 45, dt: 0.1 }), {
    spawnCount: 99,
    accumulator: 0.9000000000000057
  });
});

test("gauge reconciliation preserves ratio across finite, zero, and unlimited costs", () => {
  const half = reconcileGaugeCharge({ charge: 10, maxCharge: 20, lastFiniteRatio: 0 }, 8, true);
  assert.equal(half.charge, 4);
  const unlimited = reconcileGaugeCharge(half, Infinity, true);
  assert.equal(unlimited.isReady, false);
  assert.equal(unlimited.lastFiniteRatio, 0.5);
  const restored = reconcileGaugeCharge(unlimited, 30, true);
  assert.equal(restored.charge, 15);
  const zero = reconcileGaugeCharge(restored, 0, true);
  assert.equal(zero.isReady, true);
  assert.equal(reconcileGaugeCharge(zero, 9, true).charge, 9);
});

test("Judy and Nick support independent zero and unlimited thresholds", () => {
  const gauges = new DualGaugeSystem();
  gauges.setMaxCharges(0, Infinity, true);
  assert.equal(gauges.getJudyGauge().isReady, true);
  assert.equal(gauges.getNickGauge().isReady, false);
  gauges.addCharge("judyNickNickMate", 500);
  assert.equal(gauges.getNickGauge().charge, 0);
  gauges.consumeSkill("judy");
  assert.equal(gauges.getJudyGauge().isReady, true);
});

test("auto skill waits for locks and active sessions, then uses the normal activation entry", () => {
  let attempts = 0;
  const game = {
    cheatSettings: { enabled: true, autoSkill: true },
    role: "player",
    state: "playing",
    paused: false,
    timeUp: false,
    actionLock: false,
    pendingClear: null,
    skillRuntime: { sessions: [], timingPauses: [], isPresentationActive: () => false },
    isCheatActive: Game.prototype.isCheatActive,
    isSkillReadyForActivation: () => true,
    attemptSkillActivation: () => { attempts += 1; return true; }
  };
  assert.equal(Game.prototype.updateCheatAutoSkill.call(game), true);
  game.skillRuntime.sessions.push({ id: "active" });
  assert.equal(Game.prototype.updateCheatAutoSkill.call(game), false);
  assert.equal(attempts, 1);
});

test("coin correction supports values outside the built-in table and shifts coingain stages", () => {
  const game = {
    role: "player",
    myTsum: { id: "coingain", coinCorrectionType: "correction_0" },
    cheatSettings: normalizeCheatSettings({
      enabled: true,
      coinCorrections: { "coingain:skill:coingainBase": -15 }
    }),
    isCheatActive: Game.prototype.isCheatActive,
    getCheatCoinCorrection: Game.prototype.getCheatCoinCorrection,
    createCoinCorrectionTable: Game.prototype.createCoinCorrectionTable
  };
  const minus15 = Game.prototype.getCoinsByClearCount.call(game, 20, "coingain", "correction_0");
  game.cheatSettings.coinCorrections["coingain:skill:coingainBase"] = 100;
  const plus100 = Game.prototype.getCoinsByClearCount.call(game, 20, "coingain", "correction_0");
  game.cheatSettings.coinCorrections["coingain:skill:coingainBase"] = -15;
  const shiftedTop = Game.prototype.getCoinsByClearCount.call(game, 20, "coingain", "correction_30");
  assert.ok(plus100 > minus15);
  assert.equal(shiftedTop, Game.prototype.createCoinCorrectionTable.call(game, 15)[20]);
});

test("Judy and Nick expose ten independent count corrections plus the overlay", () => {
  const controls = Game.prototype.getCoinCorrectionControls.call({
    myTsum: { id: "judyNick", skillType: "judyNick" },
    selectedSkillLevel: 4
  });
  assert.deepEqual(controls.map((entry) => entry.route), [
    "count1", "count2", "count3", "count4", "count5", "count6",
    "count7", "count8", "count9", "count10", "overlay"
  ]);
  assert.deepEqual(controls.map((entry) => entry.defaultValue), [-9, -8, -7, -6, -5, -4, -3, -2, -1, 0, 0]);
});

test("Tsum diameter is clamped and updates normal and large live bodies", () => {
  assert.equal(normalizeCheatSettings({ tsumDiameter: 0 }).tsumDiameter, 1);
  assert.equal(normalizeCheatSettings({ tsumDiameter: 101 }).tsumDiameter, 100);
  const normal = { radius: 29, baseRadius: 29, isLarge: false };
  const large = { radius: 43.5, baseRadius: 43.5, isLarge: true };
  const game = {
    role: "player",
    cheatSettings: normalizeCheatSettings({ enabled: true, tsumDiameter: 80 }),
    tsums: [normal, large],
    isCheatActive: Game.prototype.isCheatActive,
    getConfiguredTsumRadius: Game.prototype.getConfiguredTsumRadius
  };
  Game.prototype.refreshCheatTsumSizes.call(game);
  assert.equal(normal.baseRadius, 40);
  assert.equal(large.baseRadius, 60);
});
