import assert from "node:assert/strict";
import test from "node:test";

import { Game } from "./game.js";
import { getGameplayClockDelta, resolveGameplayPauseState } from "./gameplayTiming.js";

test("gameplay pause state keeps clock and physics independent", () => {
  assert.deepEqual(resolveGameplayPauseState(), { clockPaused: false, physicsPaused: false });
  assert.deepEqual(
    resolveGameplayPauseState({ pendingClear: { pauseClock: true } }),
    { clockPaused: true, physicsPaused: false }
  );
  assert.deepEqual(
    resolveGameplayPauseState({ pendingClear: { pausePhysics: true } }),
    { clockPaused: false, physicsPaused: true }
  );
  assert.deepEqual(
    resolveGameplayPauseState({ pendingClear: { pauseClock: true, pausePhysics: true } }),
    { clockPaused: true, physicsPaused: true }
  );
});

test("coingain phase policies compose with pending clear policies", () => {
  assert.deepEqual(
    resolveGameplayPauseState({ coingainClockPaused: true }),
    { clockPaused: true, physicsPaused: false }
  );
  assert.deepEqual(
    resolveGameplayPauseState({ coingainClockPaused: true, coingainPhysicsPaused: true }),
    { clockPaused: true, physicsPaused: true }
  );
  assert.deepEqual(
    resolveGameplayPauseState({
      pendingClear: { pausePhysics: true },
      coingainClockPaused: true
    }),
    { clockPaused: true, physicsPaused: true }
  );
  assert.equal(getGameplayClockDelta(0.25, { clockPaused: true }), 0);
  assert.equal(getGameplayClockDelta(0.25, { clockPaused: false }), 0.25);
});

function makeUpdateHarness({ pendingClear = null } = {}) {
  const observed = {
    effectDt: null,
    physicsSteps: 0,
    tsumDt: null,
    bombDt: null,
    skillDtMs: null,
    feverDt: null,
    comboDt: null
  };
  const game = {
    elapsed: 0,
    displayedScore: 0,
    score: 0,
    updateEffects(dt) { observed.effectDt = dt; },
    skillButtonFeedback: { timer: 0, mode: "idle" },
    state: "playing",
    paused: false,
    fanCooldown: 0,
    fanPulse: 0,
    pendingClear,
    isCoingainTimerPaused: () => false,
    isCoingainPhysicsPaused: () => false,
    getCurrentGameplayPauseState: Game.prototype.getCurrentGameplayPauseState,
    getCurrentGameplayDelta: Game.prototype.getCurrentGameplayDelta,
    isCoingainInputLocked: () => false,
    timeUp: false,
    timeRemaining: 20,
    tempLockTimer: 0,
    actionLock: !!pendingClear,
    clearPipeline: {
      updateSequentialChainClear: () => false,
      queueMyTsumSkillChargeFlights() {}
    },
    finalizePendingClear() {},
    physicsAccumulator: 0,
    stepPhysicsFrame() { observed.physicsSteps += 1; },
    tsums: [{ dead: false, update(dt) { observed.tsumDt = dt; } }],
    bombs: [{ dead: false, update(dt) { observed.bombDt = dt; } }],
    updateSkillChargeFlights() {},
    skillRuntime: { update(dtMs) { observed.skillDtMs = dtMs; } },
    skillSystem: { update() {} },
    feverSystem: { update(dt) { observed.feverDt = dt; } },
    comboSystem: { update(dt) { observed.comboDt = dt; } },
    refreshRenderBodies() {},
    strongestModeEnabled: false,
    updateAiAutoPlay() {},
    dragging: false,
    finishRun() {}
  };
  return { game, observed };
}

test("a paused initial clear freezes gameplay clocks and physics while body presentation continues", () => {
  const pendingClear = { pauseClock: true, pausePhysics: true, timer: 1 };
  const { game, observed } = makeUpdateHarness({ pendingClear });
  game.tsums[0].removing = true;

  Game.prototype.update.call(game, 1 / 60);

  assert.equal(game.timeRemaining, 20);
  assert.equal(observed.skillDtMs, 0);
  assert.equal(observed.feverDt, 0);
  assert.equal(observed.comboDt, 0);
  assert.equal(observed.physicsSteps, 0);
  assert.equal(observed.tsumDt, 1 / 60);
  assert.equal(observed.bombDt, null);
  assert.equal(game.physicsAccumulator, 0);
  assert.equal(observed.effectDt, 1 / 60);
  assert.ok(pendingClear.timer < 1, "the initial clear animation must still complete");
});

test("gameplay clocks and physics resume without catch-up after the initial clear", () => {
  const { game, observed } = makeUpdateHarness({
    pendingClear: { pauseClock: true, pausePhysics: true, timer: 1 }
  });
  Game.prototype.update.call(game, 1 / 60);

  game.pendingClear = null;
  game.actionLock = false;
  Game.prototype.update.call(game, 1 / 60);

  assert.equal(game.timeRemaining, 20 - 1 / 60);
  assert.equal(observed.skillDtMs, 1000 / 60);
  assert.equal(observed.feverDt, 1 / 60);
  assert.equal(observed.comboDt, 1 / 60);
  assert.equal(observed.physicsSteps, 1);
  assert.equal(observed.tsumDt, 1 / 60);
  assert.equal(observed.bombDt, 1 / 60);
  assert.ok(game.physicsAccumulator < 1e-9);
});

function captureInitialClear(skillId, myTsumId, boardTypeId) {
  let clearSpec = null;
  const type = { id: boardTypeId };
  const game = {
    tsums: [{ id: "target", type, x: 207, y: 360, dead: false, removing: false }],
    myTsum: { id: myTsumId },
    isTsumInPlayArea: () => true,
    boardState: { getResolvedType: (node) => node.type },
    pushCenterMessage() {},
    bombs: [],
    addFloatingText() {},
    applyCoingainMiniScaleToBody() {}
  };
  const ctx = {
    level: 1,
    game,
    board: { getResolvedType: (node) => node.type },
    createSession: (spec) => ({ id: `${skillId}-1`, handlerId: skillId, level: 1, ...spec }),
    clear: { beginClear: (spec) => { clearSpec = spec; return true; } },
    setSpawnModifier: () => ({ id: "spawn-1" })
  };

  Game.SkillRegistry[skillId].onActivate(ctx);
  return clearSpec;
}

test("Gaston and Guiding Moana pause both axes only for their initial clear", () => {
  const gastonClear = captureInitialClear("gaston", "gaston", "gaston");
  const moanaClear = captureInitialClear("guidingMoana", "guidingMoana", "pumbaa");

  for (const clearSpec of [gastonClear, moanaClear]) {
    assert.ok(clearSpec);
    assert.equal(clearSpec.pauseClock, true);
    assert.equal(clearSpec.pausePhysics, true);
    assert.equal("freezeGameplayTime" in clearSpec, false);
  }
});
