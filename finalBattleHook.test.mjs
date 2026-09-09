import assert from 'node:assert/strict';
import test from 'node:test';

import { SKILL_TABLES } from './config.js';
import { ClearPipeline, InputRouter, SkillRuntimeManager } from './game.js';
import {
  FINAL_BATTLE_HOOK_ACTIVE_DURATION_MS,
  FINAL_BATTLE_HOOK_PHASE,
  FINAL_BATTLE_HOOK_SKILL_COST,
  FINAL_BATTLE_HOOK_TUNING,
  classifyFinalBattleHookChain,
  collectFinalBattleHookDiagonalTargets,
  createFinalBattleHookSlashGeometry,
  getFinalBattleHookHalfWidth,
  getFinalBattleHookLogicalEquivalent,
  getFinalBattleHookVisualScale,
  registerFinalBattleHookSkill
} from './finalBattleHook.js';

const type = { id: 'finalBattleHook', score: 60, color: '#8f2735' };
const node = (id, x, y, extra = {}) => ({
  id,
  type,
  x,
  y,
  radius: 29,
  baseRadius: 29,
  dead: false,
  removing: false,
  clearOccupying: false,
  inChain: false,
  isBomb: false,
  ...extra
});

test('Final Battle Hook SL1-6 tables match the calibrated specification', () => {
  assert.equal(FINAL_BATTLE_HOOK_SKILL_COST, 19);
  assert.equal(FINAL_BATTLE_HOOK_ACTIVE_DURATION_MS, 1800);
  assert.deepEqual(SKILL_TABLES.finalBattleHook.cost, [19, 19, 19, 19, 19, 19]);
  assert.deepEqual(SKILL_TABLES.finalBattleHook.activeDurationMs, [1800, 1800, 1800, 1800, 1800, 1800]);
  assert.deepEqual(SKILL_TABLES.finalBattleHook.initialLogicalEquivalent, [5, 6, 7, 8, 9, 10]);
  assert.deepEqual(SKILL_TABLES.finalBattleHook.manualScoreMultiplier, [0.70, 0.81, 0.92, 1.03, 1.14, 1.25]);
  assert.deepEqual(SKILL_TABLES.finalBattleHook.diagonalScoreMultiplier, [0.70, 0.78, 0.86, 0.94, 1.02, 1.10]);
  assert.deepEqual(SKILL_TABLES.finalBattleHook.manualCoinCorrectionType, Array(6).fill('correction_-1'));
  assert.deepEqual(SKILL_TABLES.finalBattleHook.diagonalCoinCorrectionType, [
    'correction_-1', 'correction_-1', 'correction_-1', 'correction_-2', 'correction_-2', 'correction_-2'
  ]);
});

test('SL6 first special chain counts two physical Hooks plus Angry ten as twelve', () => {
  const angry = node('angry', 207, 360, { virtual: true, finalBattleHookAngry: true });
  const result = classifyFinalBattleHookChain([node('a', 100, 400), angry, node('b', 320, 260)]);
  assert.equal(result.valid, true);
  assert.equal(result.physicalHooks.length + getFinalBattleHookLogicalEquivalent(6, 0), 12);
});

test('slash geometry is 65 degrees and grows only through halfWidth calibration', () => {
  const first = createFinalBattleHookSlashGeometry({ boardWidth: 600, level: 6, successCount: 0 });
  const seventh = createFinalBattleHookSlashGeometry({ boardWidth: 600, level: 6, successCount: 7 });
  assert.equal(first.angleDeg, 65);
  assert.ok(first.start.x < first.end.x && first.start.y > first.end.y);
  assert.ok(Math.abs(first.halfWidth - 106.5) < 1e-9);
  assert.ok(Math.abs(seventh.halfWidth - 199.1) < 0.1);
  assert.deepEqual(first.start, seventh.start);
  assert.deepEqual(first.end, seventh.end);
  assert.ok(seventh.halfWidth > first.halfWidth);
});

test('visual scale follows every anchor, interpolates monotonically, and has no success cap', () => {
  for (const [count, scale] of FINAL_BATTLE_HOOK_TUNING.visualScaleAnchors) {
    assert.ok(Math.abs(getFinalBattleHookVisualScale(count) - scale) < 0.002);
  }
  let previous = 0;
  for (let count = 0; count <= 20; count += 1) {
    const scale = getFinalBattleHookVisualScale(count);
    assert.ok(scale >= previous);
    assert.equal(getFinalBattleHookLogicalEquivalent(1, count), 5 + count * 2);
    previous = scale;
  }
  assert.equal(getFinalBattleHookLogicalEquivalent(6, 15), 40);
});

test('diagonal selection uses live capsule geometry and excludes bombs', () => {
  const geometry = createFinalBattleHookSlashGeometry({ boardWidth: 414, level: 1, successCount: 0 });
  const inside = node('inside', 207, 360);
  const outside = node('outside', 10, 150);
  const bomb = node('bomb', 207, 360, { isBomb: true });
  const targets = collectFinalBattleHookDiagonalTargets([inside, outside, bomb], geometry);
  assert.deepEqual(targets.map((entry) => entry.id), ['inside']);
});

test('representative 45-node boards expand geometrically for SL3, SL4, and SL6', () => {
  const board = [];
  for (let row = 0; row < 9; row += 1) {
    for (let column = 0; column < 5; column += 1) {
      board.push(node(`${row}-${column}`, 42 + column * 82, 170 + row * 50));
    }
  }
  for (const level of [3, 4, 6]) {
    const counts = [0, 2, 4, 7].map((successCount) => collectFinalBattleHookDiagonalTargets(
      board,
      createFinalBattleHookSlashGeometry({ boardWidth: 414, level, successCount })
    ).length);
    assert.ok(counts.every((count, index) => index === 0 || count >= counts[index - 1]));
    assert.ok(counts.at(-1) > counts[0]);
  }
});

function makeSkillHarness(level = 6) {
  const registry = {};
  registerFinalBattleHookSkill({ SkillRegistry: registry });
  const physicalA = node('hook-a', 90, 460);
  const physicalB = node('hook-b', 330, 230);
  const diagonal = node('diagonal', 207, 360, { type: { id: 'sub', score: 100, color: '#fff' } });
  const game = {
    width: 414,
    myTsum: type,
    tsums: [physicalA, physicalB, diagonal],
    dragging: false,
    chain: [],
    chainSet: new Set(),
    actionLock: false,
    skillVisualsEnabled: true,
    boardState: {
      getResolvedType: (entry) => entry.type,
      isFrozen: () => false
    },
    isTsumInPlayArea: () => true,
    getBodyRadius: (entry) => entry.radius || 29,
    canConnectWithChainRule: (_rule, left, right) => Math.hypot(left.x - right.x, left.y - right.y) <= 100,
    gameFeel: { setChain() {} }
  };
  const clearCalls = [];
  const pauses = [];
  const ended = [];
  let session;
  const ctx = {
    level,
    game,
    clear: { beginClear(spec) { clearCalls.push(spec); return true; } },
    runtime: {
      createVisualSequenceId: (() => { let id = 0; return () => ++id; })(),
      startTimingPause(spec, metadata) { pauses.push({ spec, ...metadata }); return metadata; },
      endSession(target, reason) { ended.push({ target, reason }); }
    },
    createSession(spec) {
      session = { id: 'hook-session', handlerId: 'finalBattleHook', level, schedules: [], ...spec };
      return session;
    }
  };
  const handler = registry.finalBattleHook;
  handler.onActivate(ctx);
  pauses.shift().onComplete();
  return { handler, ctx, game, session, clearCalls, pauses, ended, physicalA, physicalB, diagonal };
}

function makeHeldInputRuntimeHarness() {
  const physicalHook = node('held-hook', 90, 460);
  const game = {
    state: 'playing',
    paused: false,
    timeUp: false,
    manualDragPointerId: 41,
    actionLock: false,
    pendingClear: null,
    width: 414,
    myTsum: type,
    tsums: [physicalHook],
    dragging: false,
    chain: [],
    chainSet: new Set(),
    skillVisualsEnabled: true,
    boardState: {
      getResolvedType: (entry) => entry.type,
      isFrozen: () => false
    },
    isTsumInPlayArea: () => true,
    getBodyRadius: (entry) => entry.radius || 29,
    findTsumAt(x, y) {
      return this.tsums.find((entry) => Math.hypot(entry.x - x, entry.y - y) <= this.getBodyRadius(entry)) || null;
    },
    canConnectWithChainRule: () => true,
    gameFeel: { setChain() {} },
    noteAction() { this.noteActionCount = (this.noteActionCount || 0) + 1; }
  };
  const runtime = new SkillRuntimeManager(game, game.boardState);
  game.isGameplayInputLocked = () => runtime.isInputLocked();
  game.inputRouter = new InputRouter(game, game.boardState, runtime, {});
  return { game, runtime, physicalHook };
}

test('held input during every Final Battle Hook presentation resumes only after input is unlocked', () => {
  const initial = makeHeldInputRuntimeHarness();
  assert.equal(initial.runtime.activate('finalBattleHook', 1), true);
  assert.equal(initial.runtime.captureHeldFinalBattleHookInput({ x: 90, y: 460 }, 41), true);
  initial.runtime.updateRaw(1970);
  initial.runtime.updateRaw(20);
  assert.equal(initial.game.dragging, false, 'smoke reveal still locks input after activation presentation');
  initial.runtime.updateRaw(400);
  assert.equal(initial.runtime.resumeHeldFinalBattleHookInput(), true);
  assert.deepEqual(initial.game.chain.map((entry) => entry.id), ['held-hook']);
  const initialSession = initial.runtime.getSessionsByHandlerId('finalBattleHook')[0];
  assert.equal(initial.game.inputRouter.handleDrag({
    x: initialSession.data.angryHook.x,
    y: initialSession.data.angryHook.y
  }), true, 'the resumed chain continues through the normal Hook drag path');
  assert.deepEqual(initial.game.chain.map((entry) => entry.id), ['held-hook', initialSession.data.angryHook.id]);

  for (const presentation of ['manualResolve', 'slashVisual', 'diagonalResolve', 'growthSettle']) {
    const harness = makeHeldInputRuntimeHarness();
    assert.equal(harness.runtime.activateNow('finalBattleHook', 1), true);
    harness.runtime.updateRaw(400);
    const session = harness.runtime.getSessionsByHandlerId('finalBattleHook')[0];
    session.data.phase = FINAL_BATTLE_HOOK_PHASE.ACTIVE_INPUT;
    if (presentation === 'manualResolve' || presentation === 'diagonalResolve') {
      harness.game.pendingClear = { visual: { skillId: 'finalBattleHook', kind: presentation } };
    } else {
      harness.runtime.startTimingPause({ durationMs: 100, pauseClock: true, pausePhysics: true }, {
        skillId: 'finalBattleHook',
        kind: presentation
      });
    }
    assert.equal(harness.runtime.captureHeldFinalBattleHookInput({ x: 90, y: 460 }, 41), true, presentation);
    harness.game.pendingClear = null;
    harness.runtime.timingPauses = [];
    assert.equal(harness.runtime.resumeHeldFinalBattleHookInput(), true, presentation);
    assert.deepEqual(harness.game.chain.map((entry) => entry.id), ['held-hook'], presentation);
  }
});

test('held Final Battle Hook input can resume from the Angry Hook', () => {
  const harness = makeHeldInputRuntimeHarness();
  assert.equal(harness.runtime.activateNow('finalBattleHook', 1), true);
  const session = harness.runtime.getSessionsByHandlerId('finalBattleHook')[0];
  const pos = { x: session.data.angryHook.x, y: session.data.angryHook.y };
  assert.equal(harness.runtime.captureHeldFinalBattleHookInput(pos, 41), true);
  harness.runtime.updateRaw(400);
  assert.equal(harness.runtime.resumeHeldFinalBattleHookInput(), true);
  assert.deepEqual(harness.game.chain.map((entry) => entry.id), [session.data.angryHook.id]);
});

test('held Final Battle Hook input is discarded on release, invalid targets, and session end', () => {
  const released = makeHeldInputRuntimeHarness();
  released.runtime.activateNow('finalBattleHook', 1);
  assert.equal(released.runtime.captureHeldFinalBattleHookInput({ x: 90, y: 460 }, 41), true);
  released.runtime.releaseHeldFinalBattleHookInput(41);
  released.runtime.timingPauses = [];
  assert.equal(released.runtime.resumeHeldFinalBattleHookInput(), false);

  const invalid = makeHeldInputRuntimeHarness();
  invalid.runtime.activateNow('finalBattleHook', 1);
  assert.equal(invalid.runtime.captureHeldFinalBattleHookInput({ x: 12, y: 12 }, 41), true);
  invalid.runtime.timingPauses = [];
  assert.equal(invalid.runtime.resumeHeldFinalBattleHookInput(), false);
  assert.equal(invalid.game.dragging, false);

  const ended = makeHeldInputRuntimeHarness();
  ended.runtime.activateNow('finalBattleHook', 1);
  assert.equal(ended.runtime.captureHeldFinalBattleHookInput({ x: 90, y: 460 }, 41), true);
  const session = ended.runtime.getSessionsByHandlerId('finalBattleHook')[0];
  ended.runtime.endSession(session, 'timeout');
  ended.runtime.timingPauses = [];
  assert.equal(ended.runtime.resumeHeldFinalBattleHookInput(), false);
});

test('successful chain emits separate manual and diagonal events and never clears Angry Hook', () => {
  const harness = makeSkillHarness(6);
  const { handler, ctx, game, session, clearCalls, pauses, physicalA, physicalB } = harness;
  const angry = session.data.angryHook;
  session.data.specialChain.active = true;
  handler.onChainCommit(ctx, session, [physicalA, angry, physicalB]);
  assert.equal(clearCalls.length, 1);
  const manual = clearCalls[0];
  assert.deepEqual(manual.targets, [physicalA, physicalB]);
  assert.equal(manual.targets.includes(angry), false);
  assert.equal(manual.effectiveClearCountOverride, 12);
  assert.equal(manual.bombEffectiveClearCount, 2);
  assert.equal(manual.scoreMode, 'chain');
  assert.equal(manual.skillChargePerPhysicalMyTsum, 0.10);
  assert.equal(manual.additionalSkillCharge, 1.0);
  assert.equal(manual.correctionType, 'correction_-1');
  assert.equal(manual.pausePhysics, false, 'the background board keeps falling during the manual-clear effect');

  manual.onFinalize();
  assert.equal(session.data.phase, FINAL_BATTLE_HOOK_PHASE.SLASH_VISUAL);
  pauses.shift().onComplete();
  assert.equal(clearCalls.length, 2);
  const diagonalClear = clearCalls[1];
  assert.equal(diagonalClear.source, 'finalBattleHookDiagonal');
  assert.equal(diagonalClear.allowBomb, false);
  assert.equal(diagonalClear.chargeMultiplier, 0.20);
  assert.equal(diagonalClear.pausePhysics, false, 'the background board keeps falling during the diagonal-clear effect');
  assert.equal(diagonalClear.targets.some((entry) => entry.isBomb), false);
  diagonalClear.onFinalize();
  assert.equal(session.data.successCount, 1);
  assert.equal(session.data.angryHook.logicalEquivalent, 12);
  assert.equal(session.data.angryHook.dead, false);
  assert.equal(session.data.phase, FINAL_BATTLE_HOOK_PHASE.GROWTH_SETTLE);
  pauses.shift().onComplete();
  assert.equal(session.data.phase, FINAL_BATTLE_HOOK_PHASE.ACTIVE_INPUT);
  assert.equal(game.tsums.includes(angry), false);
});

test('only ACTIVE_INPUT consumes the 1800 ms budget', () => {
  const harness = makeSkillHarness(3);
  const { handler, ctx, session } = harness;
  assert.equal(session.data.remainingActiveMs, 1800);
  handler.onTick(ctx, session, 100);
  assert.equal(session.data.remainingActiveMs, 1700);
  for (const phase of [
    FINAL_BATTLE_HOOK_PHASE.MANUAL_RESOLVE,
    FINAL_BATTLE_HOOK_PHASE.SLASH_VISUAL,
    FINAL_BATTLE_HOOK_PHASE.DIAGONAL_RESOLVE,
    FINAL_BATTLE_HOOK_PHASE.GROWTH_SETTLE
  ]) {
    session.data.phase = phase;
    handler.onTick(ctx, session, 1000);
    assert.equal(session.data.remainingActiveMs, 1700, phase);
  }
});

test('an expired in-progress drag can commit, while expiry without a drag ends immediately', () => {
  const dragging = makeSkillHarness(1);
  dragging.session.data.remainingActiveMs = 50;
  dragging.session.data.specialChain.active = true;
  dragging.game.dragging = true;
  dragging.handler.onTick(dragging.ctx, dragging.session, 100);
  assert.equal(dragging.session.data.phase, FINAL_BATTLE_HOOK_PHASE.EXPIRED_DRAG);
  assert.equal(dragging.ended.length, 0);

  const idle = makeSkillHarness(1);
  idle.session.data.remainingActiveMs = 50;
  idle.handler.onTick(idle.ctx, idle.session, 100);
  assert.equal(idle.ended.length, 1);
  assert.equal(idle.ended[0].reason, 'timeout');
});

test('Angry Hook provides the only long-distance edge while physical Hooks retain normal distance', () => {
  const harness = makeSkillHarness(1);
  const { handler, ctx, game, session, physicalA, physicalB } = harness;
  physicalA.x = 20;
  physicalA.y = 180;
  physicalB.x = 394;
  physicalB.y = 180;
  session.data.angryHook.x = 207;
  session.data.angryHook.y = 360;
  game.findTsumAt = (x, y) => game.tsums.find((entry) => Math.hypot(entry.x - x, entry.y - y) <= 29) || null;
  assert.equal(handler.onChainStart(ctx, session, { x: physicalA.x, y: physicalA.y }), true);
  handler.onDrag(ctx, session, { x: physicalB.x, y: physicalB.y });
  assert.deepEqual(game.chain.map((entry) => entry.id), ['hook-a']);
  handler.onDrag(ctx, session, { x: session.data.angryHook.x, y: session.data.angryHook.y });
  handler.onDrag(ctx, session, { x: physicalB.x, y: physicalB.y });
  assert.deepEqual(game.chain.map((entry) => entry.id), ['hook-a', session.data.angryHook.id, 'hook-b']);
});

test('ClearPipeline uses independent bomb count and exact physical plus synthetic gauge contributions', () => {
  const flights = [];
  const game = {
    myTsum: type,
    isMyTsumTypeId: (id) => id === 'finalBattleHook',
    enqueueSkillChargeFlight: (x, y, tsumType, amount) => flights.push({ x, y, tsumType, amount })
  };
  const board = { getResolvedType: (entry) => entry.type };
  const pipeline = new ClearPipeline(game, board, {});
  const info = {
    targets: [node('large-hook', 10, 20, { clearWeight: 5 })],
    x: 207,
    y: 360,
    skillChargePerPhysicalMyTsum: 0.10,
    additionalSkillCharge: 1.0
  };
  pipeline.queueMyTsumSkillChargeFlights(info, { includeUndead: true });
  pipeline.queueMyTsumSkillChargeFlights(info, { includeUndead: true });
  assert.deepEqual(flights.map((flight) => flight.amount), [0.10, 1.0]);
  assert.equal(info.additionalSkillChargeQueued, true);
});

test('two finalized ClearEvents each add one combo and manual bomb resolution receives physical count', () => {
  const combos = [];
  const bombCounts = [];
  const makeTarget = (id) => node(id, 100, 300, { dead: true });
  const targets = [makeTarget('a'), makeTarget('b'), makeTarget('c')];
  const game = {
    myTsum: type,
    tsums: targets.slice(),
    totalCleared: 0,
    pendingClear: null,
    pendingChainClearQueue: [],
    actionLock: true,
    timeUp: false,
    getCoinCalculationContext: () => ({ table: Object.fromEntries(Array.from({ length: 50 }, (_, index) => [index, 0])) }),
    enqueueCoinFlights() {},
    spawnPopParticles() {},
    isMyTsumTypeId: () => false,
    feverSystem: { active: false, addClears() {} },
    comboSystem: { combo: 0, recordAction() { this.combo += 1; combos.push(this.combo); } },
    calculateChainScore: () => 100,
    calculateMixedClearScore: () => 100,
    addScore() {},
    addFloatingText() {},
    getCoinsByClearCount: () => 0,
    addCoinBonus() {},
    gameFeel: { emit() {} },
    recordCoingainClear() {},
    resolveGeneratedBombType(count) { bombCounts.push(count); return null; },
    queueNaturalLargeTsum() {},
    spawnReplacementTsums() {},
    flushPostChainCleanup() {}
  };
  const board = {
    getResolvedType: (entry) => entry.type,
    onNodesCleared() {}
  };
  const pipeline = new ClearPipeline(game, board, {});
  pipeline.finalize({
    source: 'finalBattleHookManual', scoreMode: 'chain', targets: targets.slice(0, 2),
    x: 207, y: 360, effectiveClearCountOverride: 12, bombEffectiveClearCount: 2
  });
  game.tsums = [targets[2]];
  pipeline.finalize({
    source: 'finalBattleHookDiagonal', targets: [targets[2]], x: 207, y: 360, allowBomb: false
  });
  assert.deepEqual(combos, [1, 2]);
  assert.deepEqual(bombCounts, [2, 1]);
});
