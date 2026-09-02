import assert from "node:assert/strict";
import test from "node:test";

import { Game, SkillRuntimeManager } from "./game.js";
import { SKILL_TIMING_TABLE, getGameplayClockDelta, resolveGameplayPauseState } from "./gameplayTiming.js";

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

test("skill timing table keeps presentation, clear, and end phases independent", () => {
  assert.deepEqual(
    Object.fromEntries(Object.entries(SKILL_TIMING_TABLE).map(([id, timing]) => [id, timing.presentation.durationMs])),
    {
      coronationElsa: 1750,
      captainLightyear: 2080,
      namine: 3170,
      gaston: 3560,
      guidingMoana: 2380,
      perfumeAlice: 3090,
      jamilViper: 2820,
      snowQueenElsa: 3160,
      liliaVanrouge: 3360,
      judyNick: 2920
    }
  );
  assert.equal(SKILL_TIMING_TABLE.captainLightyear.finalClear.durationMs, 570);
  assert.equal(SKILL_TIMING_TABLE.guidingMoana.initialClear.durationMs, 790);
  assert.equal(SKILL_TIMING_TABLE.guidingMoana.specialBombClear.durationMs, 670);
  assert.equal(SKILL_TIMING_TABLE.namine.endPause.durationMs, 270);
  assert.equal(SKILL_TIMING_TABLE.perfumeAlice.endPause.durationMs, 770);
  assert.equal(SKILL_TIMING_TABLE.jamilViper.endPause.durationMs, 770);
  assert.equal(SKILL_TIMING_TABLE.liliaVanrouge.endPause.durationMs, 520);
  for (const id of ["coronationElsa", "snowQueenElsa", "gaston", "judyNick"]) {
    assert.equal(SKILL_TIMING_TABLE[id].endPause, undefined);
  }
});

function makeUpdateHarness({ pendingClear = null, skillTimingState = null } = {}) {
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
    skillRuntime: {
      getTimingPauseState: () => skillTimingState || ({ pauseClock: false, pausePhysics: false }),
      updateRaw(dtMs) { observed.rawDtMs = dtMs; },
      update(dtMs) { observed.skillDtMs = dtMs; }
    },
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

test("a skill presentation freezes gameplay while its raw timer still advances", () => {
  const { game, observed } = makeUpdateHarness({
    skillTimingState: { pauseClock: true, pausePhysics: true }
  });

  Game.prototype.update.call(game, 1 / 30);

  assert.equal(game.timeRemaining, 20);
  assert.equal(observed.rawDtMs, 1000 / 30);
  assert.equal(observed.skillDtMs, 0);
  assert.equal(observed.feverDt, 0);
  assert.equal(observed.comboDt, 0);
  assert.equal(observed.physicsSteps, 0);
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

test("Gaston runs the clock while Moana pauses both axes for the full initial clear", () => {
  const gastonClear = captureInitialClear("gaston", "gaston", "gaston");
  const moanaClear = captureInitialClear("guidingMoana", "guidingMoana", "pumbaa");

  assert.ok(gastonClear);
  assert.equal(gastonClear.pauseClock, false);
  assert.equal(gastonClear.pausePhysics, true);
  assert.equal(gastonClear.timer, undefined);
  assert.ok(moanaClear);
  assert.equal(moanaClear.pauseClock, true);
  assert.equal(moanaClear.pausePhysics, true);
  assert.equal(moanaClear.timer, 0.79);
});

test("SkillRuntimeManager defers activation to the exact raw presentation boundary", () => {
  const original = Game.SkillRegistry.coronationElsa;
  const activationData = { marker: "accepted-state" };
  let activationCount = 0;
  let receivedActivationData = null;
  Game.SkillRegistry.coronationElsa = {
    id: "coronationElsa",
    onActivate(ctx) {
      activationCount += 1;
      receivedActivationData = ctx.activationData;
      return ctx.createSession({ remainingMs: 1000, cleanupOnEnd: false });
    }
  };
  try {
    const runtime = new SkillRuntimeManager({ clearPipeline: {} }, {});
    assert.equal(runtime.activate("coronationElsa", 3, activationData), true);
    assert.equal(runtime.activate("coronationElsa", 3), false, "a presentation cannot be accepted twice");
    assert.equal(activationCount, 0);
    assert.equal(runtime.isPresentationActive(), true);
    assert.deepEqual(runtime.getTimingPauseState(), { pauseClock: true, pausePhysics: true });

    runtime.updateRaw(1749);
    assert.equal(activationCount, 0);
    runtime.updateRaw(1);
    assert.equal(activationCount, 1);
    assert.equal(receivedActivationData, activationData);
    assert.equal(runtime.isPresentationActive(), false);
    assert.equal(runtime.sessions.length, 1);
    runtime.updateRaw(1000);
    assert.equal(activationCount, 1, "raw time must not activate the handler twice");
  } finally {
    Game.SkillRegistry.coronationElsa = original;
  }
});

test("natural skill end runs cleanup once and holds the configured raw end pause", () => {
  const original = Game.SkillRegistry.namine;
  let endCount = 0;
  Game.SkillRegistry.namine = {
    id: "namine",
    onActivate(ctx) {
      return ctx.createSession({ remainingMs: 10, cleanupOnEnd: false });
    },
    onEnd() {
      endCount += 1;
    }
  };
  try {
    const runtime = new SkillRuntimeManager({ clearPipeline: {} }, {});
    assert.equal(runtime.activateNow("namine", 1), true);
    runtime.update(10);
    assert.equal(endCount, 1);
    assert.equal(runtime.sessions.length, 0);
    assert.equal(runtime.isInputLocked(), true);
    assert.deepEqual(runtime.getTimingPauseState(), { pauseClock: true, pausePhysics: true });
    runtime.updateRaw(269);
    assert.equal(runtime.isInputLocked(), true);
    runtime.updateRaw(1);
    assert.equal(runtime.isInputLocked(), false);
    runtime.updateRaw(1000);
    assert.equal(endCount, 1);
  } finally {
    Game.SkillRegistry.namine = original;
  }
});

test("forced runtime reset never adds a character end pause", () => {
  const original = Game.SkillRegistry.perfumeAlice;
  let endCount = 0;
  Game.SkillRegistry.perfumeAlice = {
    id: "perfumeAlice",
    onActivate(ctx) {
      return ctx.createSession({ remainingMs: 1000, cleanupOnEnd: false });
    },
    onEnd() {
      endCount += 1;
    }
  };
  try {
    const runtime = new SkillRuntimeManager({ clearPipeline: {} }, {});
    runtime.activateNow("perfumeAlice", 1);
    runtime.reset();
    assert.equal(endCount, 1);
    assert.equal(runtime.isInputLocked(), false);
    assert.deepEqual(runtime.getTimingPauseState(), { pauseClock: false, pausePhysics: false });
  } finally {
    Game.SkillRegistry.perfumeAlice = original;
  }
});

test("central skill timing lock blocks user, bomb, fan, and skill entry points", () => {
  let activated = 0;
  const game = {
    state: "playing",
    paused: false,
    actionLock: false,
    dragging: false,
    fanCooldown: 0,
    skillRuntime: {
      isInputLocked: () => true,
      activate() { activated += 1; return true; }
    },
    isGameplayInputLocked: Game.prototype.isGameplayInputLocked,
    isCoingainInputLocked: () => false,
    noteAction() {},
    getChainBehaviorForStart() {
      throw new Error("chain behavior must not be queried while presentation is active");
    }
  };

  assert.equal(Game.prototype.executeSkill.call(game, "coronationElsa", 1), false);
  assert.equal(Game.prototype.triggerFan.call(game), false);
  assert.equal(Game.prototype.startChain.call(game, {}, { x: 0, y: 0 }), false);
  assert.equal(Game.prototype.explodeBomb.call(game, { bombType: "normal" }), false);
  assert.equal(activated, 0);
});

test("Captain Lightyear final clear replaces the normal clear delay with 570 ms", () => {
  let clearSpec = null;
  let ended = 0;
  const target = { id: "target", x: 100, y: 100, dead: false, removing: false };
  const session = { id: "captain-1", handlerId: "captainLightyear", level: 1, data: { remainingShots: 1 } };
  const ctx = {
    level: 1,
    game: {
      actionLock: false,
      tsums: [target],
      isTsumInPlayArea: () => true,
      createShockwave() {},
      addFloatingText() {}
    },
    clear: { beginClear(spec) { clearSpec = spec; return true; } },
    runtime: { endSession() { ended += 1; }, startTimingPause() {} }
  };

  assert.equal(Game.SkillRegistry.captainLightyear.onTap(ctx, session, { x: 100, y: 100 }), true);
  assert.equal(clearSpec.timer, 0.57);
  assert.equal(clearSpec.pauseClock, true);
  assert.equal(clearSpec.pausePhysics, true);
  assert.equal(ended, 1);
});

test("one Moana special-bomb action creates one 670 ms pause even for multiple bombs", () => {
  const pauses = [];
  let clearSpec = null;
  const target = { id: "target", x: 100, y: 100, dead: false, removing: false };
  const bombs = [
    { id: "bomb-1", bombType: "moanaSpecial", x: 100, y: 100, dead: false, effectRadius: 200 },
    { id: "bomb-2", bombType: "moanaSpecial", x: 120, y: 100, dead: false, effectRadius: 200 }
  ];
  const game = {
    actionLock: false,
    bombs,
    tsums: [target],
    boardState: { canBombAffectNode: () => true },
    skillRuntime: {
      isInputLocked: () => false,
      startTimingPause(spec) { pauses.push(spec); }
    },
    isGameplayInputLocked: Game.prototype.isGameplayInputLocked,
    canBombCancelActiveChain: () => false,
    getSequentialClearDebugState: () => null,
    logAiBombCancelDebug() {},
    getActiveSkillSession: () => null,
    isCoingainCountingActive: () => false,
    isTsumInPlayArea: () => true,
    applyBombEffect() {},
    createShockwave() {},
    spawnExplosionSparks() {},
    noteAction() {},
    clearPipeline: { beginClear(spec) { clearSpec = spec; return true; } }
  };

  Game.prototype.explodeBomb.call(game, bombs[0]);

  assert.equal(pauses.length, 1);
  assert.equal(pauses[0].durationMs, 670);
  assert.equal(clearSpec.timer, 0.67);
  assert.equal(clearSpec.pauseClock, true);
  assert.equal(clearSpec.pausePhysics, true);
});

test("JudyNick activation uses the mode captured at acceptance", () => {
  const messages = [];
  const existing = {
    id: "judyNick-1",
    handlerId: "judyNick",
    level: 1,
    remainingMs: 1,
    data: { currentMode: "judy", countStage: 1, judyLayerIds: [], nickLayerIds: [] }
  };
  const ctx = {
    level: 1,
    activationData: { judyNickMode: "nick" },
    game: {
      judyNickPreparedMode: "judy",
      tsums: [],
      myTsum: { id: "judyNick" },
      pushCenterMessage(text) { messages.push(text); }
    },
    board: {
      getResolvedType: (node) => node.type,
      getBubbleNodesBySession: () => [],
      getJudyNickMovingFrozenNodes: () => []
    },
    runtime: { getSessionsByHandlerId: () => [existing] },
    clear: { beginClear: () => false },
    clearBySource() {},
    applyBubble() {}
  };

  const activated = Game.SkillRegistry.judyNick.onActivate(ctx);

  assert.equal(activated, existing);
  assert.equal(existing.data.currentMode, "nick");
  assert.equal(messages.at(-1), "NICK!");
});
