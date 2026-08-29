import test from "node:test";
import assert from "node:assert/strict";
import {
  BattleController,
  calculateAdaptiveMultiplier,
  createDefaultBattleRecords,
  getWinBonus,
  normalizeDifficulty,
  resolveBattleOutcome
} from "./battle.js";

test("difficulty normalization falls back to normal", () => {
  assert.equal(normalizeDifficulty("easy"), "easy");
  assert.equal(normalizeDifficulty("unknown"), "normal");
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

test("win bonus is difficulty specific and only awarded for wins", () => {
  assert.equal(getWinBonus("easy", "win"), 1000);
  assert.equal(getWinBonus("normal", "win"), 5000);
  assert.equal(getWinBonus("hard", "win"), 10000);
  assert.equal(getWinBonus("hard", "draw"), 0);
  assert.equal(getWinBonus("hard", "loss"), 0);
});

test("finalization awards and saves the battle bonus only once", () => {
  const controller = Object.create(BattleController.prototype);
  let saveCount = 0;
  controller.active = true;
  controller.difficulty = "hard";
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
  assert.equal(controller.records.byDifficulty.hard.wins, 1);
});
