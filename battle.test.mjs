import test from "node:test";
import assert from "node:assert/strict";
import {
  BattleController,
  DIFFICULTY_PROFILES,
  calculateAdaptiveMultiplier,
  createDefaultBattleRecords,
  getWinBonus,
  normalizeDifficulty,
  resolveBattleOutcome
} from "./battle.js";

test("CPU battle always uses the strongest mode", () => {
  assert.equal(normalizeDifficulty("easy"), "strongest");
  assert.equal(normalizeDifficulty("normal"), "strongest");
  assert.equal(normalizeDifficulty("hard"), "strongest");
  assert.equal(normalizeDifficulty("unknown"), "strongest");
});

test("adaptive multiplier requires three matches", () => {
  assert.equal(calculateAdaptiveMultiplier(["win", "win"]), 1);
  assert.equal(calculateAdaptiveMultiplier(["win", "win", "win"]), 0.9);
  assert.equal(calculateAdaptiveMultiplier(["loss", "draw", "loss"]), 1.1);
  assert.equal(calculateAdaptiveMultiplier(["win", "loss", "draw", "win", "loss"]), 1);
  assert.equal(calculateAdaptiveMultiplier(["loss", "win", "win", "win", "win"]), 0.9);
});

test("battle outcome handles win, loss, and draw", () => {
  assert.equal(resolveBattleOutcome(101, 100), "win");
  assert.equal(resolveBattleOutcome(99, 100), "loss");
  assert.equal(resolveBattleOutcome(100, 100), "draw");
});

test("strongest CPU win bonus is only awarded for wins", () => {
  assert.equal(getWinBonus("strongest", "win"), 10000);
  assert.equal(getWinBonus("hard", "win"), 10000);
  assert.equal(getWinBonus("strongest", "draw"), 0);
  assert.equal(getWinBonus("strongest", "loss"), 0);
});

test("starting a CPU battle enables strongest mode and disables regular AI", () => {
  const controller = Object.create(BattleController.prototype);
  let disabledAiModes = 0;
  let started = 0;
  controller.difficulty = "strongest";
  controller.ensureCpu = () => true;
  controller.getDifficultyRuntime = () => ({
    profile: DIFFICULTY_PROFILES.strongest,
    adaptiveMultiplier: 1
  });
  controller.updateArena = () => {};
  controller.player = {
    selectedMyTsumIndex: 0,
    selectedSkillLevel: 6,
    itemSelection: {},
    myTsum: { id: "mickey" },
    renderQualityMode: "minimal",
    startGame() {}
  };
  controller.cpu = {
    disableAiModesForStrongestMode() { disabledAiModes += 1; },
    setRenderQualityMode(mode, options) {
      this.receivedRenderQuality = { mode, options };
    },
    startGame() { started += 1; }
  };

  controller.startBattle();

  assert.equal(disabledAiModes, 1);
  assert.equal(started, 1);
  assert.equal(controller.cpu.strongestModeEnabled, true);
  assert.equal(controller.cpu.aiAutoPlay, false);
  assert.equal(controller.cpu.battleContext.adaptiveMultiplier, 1);
  assert.deepEqual(controller.cpu.receivedRenderQuality, {
    mode: "minimal",
    options: { persist: false, sync: false }
  });
});

test("render quality synchronization updates the other board", () => {
  const controller = Object.create(BattleController.prototype);
  const updates = [];
  controller.arena = { dataset: {} };
  controller.player = { setRenderQualityMode: (...args) => updates.push(["player", ...args]) };
  controller.cpu = { setRenderQualityMode: (...args) => updates.push(["cpu", ...args]) };

  assert.equal(controller.syncRenderQuality("light", controller.player), "light");
  assert.deepEqual(updates, [["cpu", "light", { persist: false, sync: false }]]);
  assert.equal(controller.arena.dataset.renderQuality, "light");
});

test("finalization awards and saves the battle bonus only once", () => {
  const controller = Object.create(BattleController.prototype);
  let saveCount = 0;
  controller.active = true;
  controller.difficulty = "strongest";
  controller.records = createDefaultBattleRecords();
  controller.pendingResults = {
    player: { finalScore: 200, finalCoins: 10 },
    cpu: { finalScore: 100, finalCoins: 5 }
  };
  controller.player = {
    coins: 500,
    battleContext: { adaptiveMultiplier: 0.9 },
    saveProgress() {
      saveCount += 1;
    }
  };
  controller.cpu = { battleContext: {} };
  controller.saveRecords = () => {};
  controller.updateArena = () => {};

  controller.finalizeBattle();
  controller.finalizeBattle();

  assert.equal(controller.player.coins, 10500);
  assert.equal(saveCount, 1);
  assert.equal(controller.player.state, "result");
  assert.equal(controller.cpu.state, "battleWaiting");
  assert.equal(controller.player.battleStats.outcome, "win");
  assert.equal(controller.records.byDifficulty.strongest.wins, 1);
});
