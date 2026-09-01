import assert from "node:assert/strict";
import test from "node:test";

import { FIELD_BOTTOM, FIELD_LEFT, FIELD_RIGHT, TSUM_RADIUS } from "./config.js";
import { Game } from "./game.js";
import {
  FEVER_ENTRY_CLEAR_COUNT,
  getFeverClearsRemaining,
  shouldTapStrongestModeCoronationElsaCompletedIce,
  shouldUseStrongestModeFeverBombCancel
} from "./strongestModeLogic.js";

const gaugeAfterClears = (count) => (count / FEVER_ENTRY_CLEAR_COUNT) * 100;

test("fever remaining clear count includes five and excludes four or fewer", () => {
  assert.equal(getFeverClearsRemaining(gaugeAfterClears(23)), 6);
  assert.equal(getFeverClearsRemaining(gaugeAfterClears(24)), 5);
  assert.equal(getFeverClearsRemaining(gaugeAfterClears(25)), 4);
  assert.equal(getFeverClearsRemaining(100), 0);
});

test("fever bomb cancel eligibility requires strongest mode, no fever, no skill, and a bomb", () => {
  const eligible = {
    strongestModeEnabled: true,
    feverActive: false,
    feverGauge: gaugeAfterClears(24),
    activeSkillCount: 0,
    validBombCount: 1
  };
  assert.equal(shouldUseStrongestModeFeverBombCancel(eligible), true);
  assert.equal(shouldUseStrongestModeFeverBombCancel({ ...eligible, strongestModeEnabled: false }), false);
  assert.equal(shouldUseStrongestModeFeverBombCancel({ ...eligible, feverActive: true }), false);
  assert.equal(shouldUseStrongestModeFeverBombCancel({ ...eligible, activeSkillCount: 1 }), false);
  assert.equal(shouldUseStrongestModeFeverBombCancel({ ...eligible, validBombCount: 0 }), false);
  assert.equal(shouldUseStrongestModeFeverBombCancel({ ...eligible, feverGauge: gaugeAfterClears(25) }), false);
});

test("Coronation Elsa taps completed ice at 38 frozen Tsums or after 0.15 seconds with no trace", () => {
  assert.equal(shouldTapStrongestModeCoronationElsaCompletedIce({ frozenCount: 38, noTraceDurationSec: 0, committedTraceCount: 4 }), true);
  assert.equal(shouldTapStrongestModeCoronationElsaCompletedIce({ frozenCount: 37, noTraceDurationSec: 0.149, committedTraceCount: 4 }), false);
  assert.equal(shouldTapStrongestModeCoronationElsaCompletedIce({ frozenCount: 0, noTraceDurationSec: 0.15, committedTraceCount: 4 }), true);
  assert.equal(shouldTapStrongestModeCoronationElsaCompletedIce({
    frozenCount: 38,
    noTraceDurationSec: 0.15,
    hasTraceCandidate: true,
    committedTraceCount: 4
  }), false);
  assert.equal(shouldTapStrongestModeCoronationElsaCompletedIce({
    frozenCount: 38,
    noTraceDurationSec: 1,
    committedTraceCount: 3
  }), false);
});

test("Coronation Elsa any-trace fallback keeps no position, direction, or stability filter", () => {
  const chain = [
    { id: "moving-top-1", x: 180, y: 150, vx: 8, vy: -7 },
    { id: "moving-top-2", x: 210, y: 175, vx: -6, vy: 9 },
    { id: "moving-top-3", x: 240, y: 200, vx: 5, vy: 4 }
  ];
  let receivedOptions = null;
  const harness = {
    findStrongestModeBestChain(options) {
      receivedOptions = options;
      return chain;
    }
  };

  const selected = Game.prototype.findStrongestModeCoronationElsaAnyTraceChain.call(harness);

  assert.equal(selected, chain);
  assert.deepEqual(receivedOptions, { minLength: 3, maxLength: 6 });
  assert.equal(selected.strongestModeCoronationElsaSource, "anyTraceFallback");
});

test("Coronation Elsa chain selection uses the terminal planner result", () => {
  const chain = [
    { id: "central-1" },
    { id: "central-2" },
    { id: "central-3" }
  ];
  const harness = {
    myTsum: { id: "coronationElsa" },
    strongestModeCoronationElsaNoFreezeTargetWaitFrames: 4,
    strongestModeCoronationElsaEarlyFreezeTapWaitFrames: 4,
    getActiveSkillSession: () => ({}),
    findStrongestModeCoronationElsaPlannerChain: () => {
      chain.strongestModeCoronationElsaSource = "planner";
      return chain;
    }
  };

  const selected = Game.prototype.findStrongestModeChain.call(harness);

  assert.equal(selected, chain);
  assert.equal(selected.strongestModeCoronationElsaSource, "planner");
  assert.equal(harness.strongestModeCoronationElsaNoFreezeTargetWaitFrames, 0);
  assert.equal(harness.strongestModeCoronationElsaEarlyFreezeTapWaitFrames, 0);
});

test("Coronation Elsa common ice-tap guard refuses every freeze target while a legal trace exists", () => {
  let tapped = false;
  const harness = {
    findStrongestModeCoronationElsaAnyTraceChain: () => [{ id: 1 }, { id: 2 }, { id: 3 }],
    inputRouter: {
      handleTap() {
        tapped = true;
        return true;
      }
    }
  };

  assert.equal(
    Game.prototype.tryTapStrongestModeCoronationElsaFreezeTarget.call(
      harness,
      { type: "freeze", x: 20, y: 30 }
    ),
    false
  );
  assert.equal(tapped, false);
});

test("Coronation Elsa completed ice revalidates the board before both 38-count and 0.15-second taps", () => {
  for (const { frozenCount, noTraceDurationSec } of [
    { frozenCount: 38, noTraceDurationSec: 0 },
    { frozenCount: 10, noTraceDurationSec: 0.15 }
  ]) {
    let specialTargetRequested = false;
    const harness = {
      strongestModeCoronationElsaPendingExtraFreezeTap: false,
      strongestModeCoronationElsaNoTraceDurationSec: noTraceDurationSec,
      strongestModeCoronationElsaMinimumTraceCount: 4,
      boardState: {
        getFrozenNodesByKind: () => Array.from({ length: frozenCount }, (_, index) => ({ id: index }))
      },
      getStrongestModeCoronationElsaSkillSummary: () => ({ chainCount: 4 }),
      findStrongestModeCoronationElsaAnyTraceChain: () => [{ id: 1 }, { id: 2 }, { id: 3 }],
      findStrongestSpecialTapTarget() {
        specialTargetRequested = true;
        return { type: "freeze", x: 20, y: 30 };
      }
    };

    assert.equal(
      Game.prototype.tryTapStrongestModeCoronationElsaCompletedIce.call(harness),
      false
    );
    assert.equal(specialTargetRequested, false);
  }
});

test("Coronation Elsa common ice-tap path taps only after confirming no legal trace", () => {
  const taps = [];
  const harness = {
    strongestModeCoronationElsaNoChainFrames: 12,
    strongestModeCoronationElsaNoTraceDurationSec: 0.2,
    strongestModeCoronationElsaStopLogged: true,
    strongestModeCoronationElsaPendingExtraFreezeTap: true,
    strongestModeCoronationElsaSuppressRelaxedFallback: true,
    strongestModeCoronationElsaSuppressSpecialTapFrames: 3,
    strongestModeCoronationElsaNoFreezeTargetWaitFrames: 4,
    strongestModeCoronationElsaEarlyFreezeTapWaitFrames: 5,
    strongestModeCoronationElsaUnsafeFreezeTapWaitFrames: 6,
    findStrongestModeCoronationElsaAnyTraceChain: () => [],
    inputRouter: {
      handleTap(pos) {
        taps.push(pos);
        return true;
      }
    }
  };

  assert.equal(
    Game.prototype.tryTapStrongestModeCoronationElsaFreezeTarget.call(
      harness,
      { type: "freeze", x: 20, y: 30 }
    ),
    true
  );
  assert.deepEqual(taps, [{ x: 20, y: 30 }]);
  assert.equal(harness.strongestModeCoronationElsaNoChainFrames, 0);
  assert.equal(harness.strongestModeCoronationElsaNoTraceDurationSec, 0);
  assert.equal(harness.strongestModeCoronationElsaPendingExtraFreezeTap, false);
});

const makeCoronationElsaStepHarness = () => ({
  myTsum: { id: "coronationElsa" },
  strongestModeCoronationElsaPendingExtraFreezeTap: false,
  strongestModeCoronationElsaAfterChainTimer: 0,
  strongestModeCoronationElsaNoTraceDurationSec: 0,
  strongestModeCoronationElsaNoChainFrames: 10,
  strongestModeCoronationElsaFreezeTapDelayFrames: 10,
  strongestModeCoronationElsaMinimumTraceCount: 4,
  strongestModeCoronationElsaMinPlayableNodesBeforeFreezeTap: 35,
  strongestModeCoronationElsaMinFrozenBeforeLowPlayableTap: 25,
  strongestModeCoronationElsaSuppressSpecialTapFrames: 0,
  strongestModeCoronationElsaNoFreezeTargetWaitFrames: 0,
  strongestModeCoronationElsaEarlyFreezeTapWaitFrames: 0,
  strongestModeCoronationElsaUnsafeFreezeTapWaitFrames: 0,
  isStrongestModeBusy: () => false,
  isSkillReadyForActivation: () => false,
  tryPerformStrongestModeFeverBombCancel: () => false,
  getActiveSkillSession: (id) => (id === "coronationElsa" ? {} : null),
  getJudyNickSession: () => null,
  tryTapStrongestModeJudyNickJudyBubble: () => false,
  normalizeStrongestModeBombCount: () => false,
  shouldWaitForCoronationElsaRecentSpawnsToSettle: () => false,
  getStrongestModeCoronationElsaSkillSummary: () => ({ chainCount: 4 }),
  performStrongestModeChains: () => false,
  countStrongestModePlayableNodesBelowCeiling: () => 45,
  boardState: { getFrozenNodesByKind: () => Array.from({ length: 35 }, (_, index) => ({ id: index })) },
  recordStrongestModeCoronationElsaPlayableLowWait: () => {},
  recordStrongestModeCoronationElsaNoChainCandidate: () => {},
  shouldWaitForStrongestModeCoronationElsaEarlyFreezeTap: () => false,
  shouldWaitForStrongestModeCoronationElsaUnsafeFreezeTap: () => false,
  getStrongestModeCoronationElsaNoChainDiagnostics: () => ({}),
  shouldWaitForStrongestModeCoronationElsaNoFreezeTarget: () => false
});

test("Coronation Elsa planner always traces before attempting remaining ice", () => {
  const chain = [{ id: 1 }, { id: 2 }, { id: 3 }];
  let performedChain = null;
  let iceGuardCalled = false;
  const harness = {
    ...makeCoronationElsaStepHarness(),
    planStrongestModeCoronationElsaAction: () => ({
      plan: { action: "trace" },
      chain,
      tapTarget: null
    }),
    isStrongestModeCoronationElsaPlannedChainValid: () => true,
    performStrongestModeChains(selected) {
      performedChain = selected;
      return true;
    },
    findStrongestSpecialTapTarget: () => ({ type: "freeze", x: 20, y: 30 }),
    tryTapStrongestModeCoronationElsaFreezeTarget() {
      iceGuardCalled = true;
      return true;
    }
  };

  assert.equal(Game.prototype.performStrongestModeStep.call(harness), true);
  assert.equal(performedChain, chain);
  assert.equal(iceGuardCalled, false);
});

test("Coronation Elsa WAIT performs no trace or ice tap and retries on the next frame", () => {
  let planCalls = 0;
  let chainCalls = 0;
  let tapCalls = 0;
  const harness = {
    ...makeCoronationElsaStepHarness(),
    planStrongestModeCoronationElsaAction() {
      planCalls += 1;
      return {
        plan: { action: "wait", waitReason: "WAIT_FOR_INFLOW" },
        chain: [],
        tapTarget: { id: "ice", x: 20, y: 30 }
      };
    },
    performStrongestModeChains() {
      chainCalls += 1;
      return true;
    },
    tryTapStrongestModeCoronationElsaFreezeTarget() {
      tapCalls += 1;
      return true;
    }
  };

  assert.equal(Game.prototype.performStrongestModeStep.call(harness), false);
  assert.equal(Game.prototype.performStrongestModeStep.call(harness), false);
  assert.equal(planCalls, 2);
  assert.equal(chainCalls, 0);
  assert.equal(tapCalls, 0);
});

test("Coronation Elsa planner immediately taps only after a second no-trace confirmation", () => {
  const target = { id: "ice", x: 20, y: 30 };
  let guardedTarget = null;
  let planCalls = 0;
  const harness = {
    ...makeCoronationElsaStepHarness(),
    planStrongestModeCoronationElsaAction: () => {
      planCalls += 1;
      return {
        plan: { action: "tap", terminal: { effectiveClearCount: 8, rawCoins: 2 } },
        chain: [],
        tapTarget: target
      };
    },
    tryTapStrongestModeCoronationElsaFreezeTarget(selected) {
      guardedTarget = selected;
      return true;
    }
  };

  assert.equal(Game.prototype.performStrongestModeStep.call(harness), true);
  assert.equal(planCalls, 2);
  assert.deepEqual(guardedTarget, {
    type: "freeze",
    x: 20,
    y: 30,
    target,
    effectCount: 8
  });
});

test("Coronation Elsa discards an invalid planned route and replans once from the live board", () => {
  const staleChain = [{ id: "stale-1" }, { id: "stale-2" }, { id: "stale-3" }];
  const freshChain = [{ id: "fresh-1" }, { id: "fresh-2" }, { id: "fresh-3" }];
  let planCalls = 0;
  let performedChain = null;
  const harness = {
    ...makeCoronationElsaStepHarness(),
    planStrongestModeCoronationElsaAction() {
      planCalls += 1;
      return {
        plan: { action: "trace" },
        chain: planCalls === 1 ? staleChain : freshChain,
        tapTarget: null
      };
    },
    isStrongestModeCoronationElsaPlannedChainValid: (chain) => chain === freshChain,
    performStrongestModeChains(chain) {
      performedChain = chain;
      return true;
    }
  };

  assert.equal(Game.prototype.performStrongestModeStep.call(harness), true);
  assert.equal(planCalls, 2);
  assert.equal(performedChain, freshChain);
});

test("Coronation Elsa records one WAIT episode and releases it to a safe trace", () => {
  const summary = {
    waitForInflowCount: 0,
    waitForInflowTotalDurationSec: 0,
    waitForInflowMinDurationSec: null,
    waitForInflowMaxDurationSec: 0,
    waitForInflowToSafeTraceCount: 0
  };
  const logs = [];
  const harness = {
    elapsed: 4,
    strongestModeCoronationElsaInflowWaitStartedAt: null,
    getStrongestModeCoronationElsaSkillSummary: () => summary,
    logCodexCoronationPayload(prefix, payload) {
      logs.push({ prefix, payload });
    }
  };

  Game.prototype.recordStrongestModeCoronationElsaPlannerDecision.call(harness, {
    action: "wait",
    diagnostics: { activeInflowNodeCount: 3 }
  });
  harness.elapsed = 4.1;
  Game.prototype.recordStrongestModeCoronationElsaPlannerDecision.call(harness, {
    action: "wait",
    diagnostics: { activeInflowNodeCount: 2 }
  });
  harness.elapsed = 4.25;
  Game.prototype.recordStrongestModeCoronationElsaPlannerDecision.call(harness, {
    action: "trace",
    diagnostics: { safeTraceCandidateCount: 1 }
  });

  assert.equal(summary.waitForInflowCount, 1);
  assert.equal(summary.waitForInflowTotalDurationSec, 0.25);
  assert.equal(summary.waitForInflowMinDurationSec, 0.25);
  assert.equal(summary.waitForInflowMaxDurationSec, 0.25);
  assert.equal(summary.waitForInflowToSafeTraceCount, 1);
  assert.equal(harness.strongestModeCoronationElsaInflowWaitStartedAt, null);
  assert.deepEqual(logs.map((entry) => entry.payload.event), ["start", "release"]);
  assert.equal(logs[1].payload.releasedTo, "trace");
});

test("Coronation Elsa replans the second trace in the same step and stops after two", () => {
  const firstChain = [{ id: "first-1" }, { id: "first-2" }, { id: "first-3" }];
  const secondChain = [{ id: "second-1" }, { id: "second-2" }, { id: "second-3" }];
  firstChain.strongestModeCoronationElsaSource = "planner";
  secondChain.strongestModeCoronationElsaSource = "planner";
  const performed = [];
  let replans = 0;
  const harness = {
    myTsum: { id: "coronationElsa" },
    strongestModeMaxChainsPerStep: 2,
    strongestModeCoronationElsaAfterChainDelay: 0.1,
    isStrongestModeBusy: () => false,
    canQueueChainDuringActiveClear: () => false,
    getActiveSkillSession: () => ({}),
    getStrongestModeCoronationElsaSkillSummary: () => null,
    performStrongestModeChain(chain, options) {
      performed.push(chain);
      options.result.committedLength = chain.length;
      return true;
    },
    findStrongestModeChain() {
      replans += 1;
      return secondChain;
    }
  };

  assert.equal(Game.prototype.performStrongestModeChains.call(harness, firstChain), true);
  assert.deepEqual(performed, [firstChain, secondChain]);
  assert.equal(replans, 1);
});

const makeCoronationElsaNode = (id, x, y) => ({
  id,
  x,
  y,
  dead: false,
  removing: false,
  clearOccupying: false,
  inChain: false,
  type: { id: "test" }
});

const makeCoronationElsaPreviewHarness = ({ nodes, chainsByStart, frozenNodes = [], committedTraceCount = 0 }) => ({
  tsums: [...nodes, ...frozenNodes],
  selectedSkillLevel: 6,
  strongestModeCoronationElsaMinimumTraceCount: 4,
  boardState: {
    getFrozenNodesByKind: () => frozenNodes,
    getResolvedType: (node) => node.type
  },
  getStrongestModeChainNodes: () => nodes,
  getStrongestModeCoronationElsaSkillSummary: () => ({ chainCount: committedTraceCount }),
  getChainBehaviorForStart(start) {
    return chainsByStart.has(start.id) ? { allowedTypeIds: new Set(["test"]) } : null;
  },
  canConnectWithChainRule: () => true,
  findStrongestModeGreedyChain(start) {
    return chainsByStart.get(start.id) || [];
  },
  isStrongestModeCoronationElsaEdgeStart: Game.prototype.isStrongestModeCoronationElsaEdgeStart,
  getStrongestModeCoronationElsaStartDirections: Game.prototype.getStrongestModeCoronationElsaStartDirections,
  getStrongestModeCoronationElsaDirectionalGeometry: Game.prototype.getStrongestModeCoronationElsaDirectionalGeometry,
  findStrongestModeCoronationElsaBestPreviewChain: Game.prototype.findStrongestModeCoronationElsaBestPreviewChain,
  findStrongestModeCoronationElsaDirectionalChains(
    start,
    nodes,
    rule,
    maxLength,
    direction,
    adjacency,
    geometryOptions
  ) {
    const entry = chainsByStart.get(start.id);
    const availableIds = new Set(nodes.map((node) => node.id));
    if (
      !entry ||
      entry.direction !== direction ||
      !entry.chain.every((node) => availableIds.has(node.id))
    ) {
      return [];
    }
    const geometry = Game.prototype.getStrongestModeCoronationElsaDirectionalGeometry.call(
      this,
      entry.chain,
      direction,
      geometryOptions
    );
    return geometry?.valid ? [{ chain: entry.chain, geometry, searchScore: entry.searchScore || 0 }] : [];
  },
  isTsumInPlayArea: () => true
});

const makeCoronationElsaPracticalStableHarness = () => ({
  elapsed: 1,
  strongestModeCoronationElsaPracticalStableMinSpawnAgeSec: 0.3,
  strongestModeCoronationElsaPracticalStableVelocityThreshold: 1,
  boardState: {
    isFrozen: () => false,
    hasBubble: () => false
  },
  isTsumInPlayArea: () => true,
  getStrongestModeCoronationElsaSafePlayableY: () => 220
});

test("Coronation Elsa practical stability accepts non-contact Tsums at 1 velocity", () => {
  const harness = makeCoronationElsaPracticalStableHarness();
  const tsum = {
    ...makeCoronationElsaNode("practical-stable", 207, 360),
    vx: 1,
    vy: -1,
    spawnedAtElapsed: 0,
    isSettled: () => false
  };

  assert.equal(
    Game.prototype.isStrongestModeCoronationElsaPracticalStableTsum.call(harness, tsum),
    true
  );
  assert.equal(
    Game.prototype.isStrongestModeCoronationElsaPracticalStableTsum.call(harness, { ...tsum, vx: 1.0001 }),
    false
  );
  assert.equal(
    Game.prototype.isStrongestModeCoronationElsaPracticalStableTsum.call(harness, {
      ...tsum,
      vx: 0,
      vy: 0,
      spawnedAtElapsed: harness.elapsed - 0.299
    }),
    false
  );
});

test("Coronation Elsa active inflow excludes a moving Tsum already supported from below", () => {
  const supportY = FIELD_BOTTOM - 29;
  const moving = { id: "moving", x: 150, y: supportY - 58, vx: 2, vy: 2, radius: 29, spawnedAtElapsed: 0 };
  const support = { id: "support", x: 150, y: supportY, vx: 0, vy: 0, radius: 29, spawnedAtElapsed: 0 };
  const harness = {
    elapsed: 1,
    strongestModeCoronationElsaPracticalStableMinSpawnAgeSec: 0.3,
    strongestModeCoronationElsaPracticalStableVelocityThreshold: 1,
    strongestModeCoronationElsaMinPlayableNodesBeforeFreezeTap: 35,
    isTsumInPlayArea: () => true,
    boardState: { isFrozen: () => false, hasBubble: () => false },
    getBodyRadius: (body) => body.radius,
    getBodyCollisionX: (body) => body.x,
    getBodyCollisionY: (body) => body.y,
    getFieldFloorY: () => FIELD_BOTTOM,
    getPhysicsBodies: () => [moving, support],
    isBodySettled: () => false
  };
  const context = {
    safePlayableY: 220,
    lowerPlayableNodeCount: 45,
    lowerBoardFilled: true,
    physicsBodies: [moving, support]
  };
  const supported = Game.prototype.getStrongestModeCoronationElsaFlowSafetyState.call(harness, moving, context);

  context.physicsBodies = [moving];
  const falling = Game.prototype.getStrongestModeCoronationElsaFlowSafetyState.call(harness, moving, context);

  assert.equal(supported.supportKind, "stable");
  assert.equal(supported.inflowUnsafe, false);
  assert.equal(supported.naturalFallSpace, false);
  assert.equal(supported.activeInflow, false);
  assert.equal(falling.naturalFallSpace, true);
  assert.equal(falling.activeInflow, true);
  assert.equal(falling.inflowUnsafe, true);
});

test("Coronation Elsa marks an unsupported descending support column as dynamic inflow", () => {
  const upper = { id: "upper", x: 150, y: 260, vx: 0, vy: 2, radius: 29, spawnedAtElapsed: 0 };
  const lower = { id: "lower", x: 150, y: 318, vx: 0, vy: 2, radius: 29, spawnedAtElapsed: 0 };
  const harness = {
    elapsed: 1,
    strongestModeCoronationElsaPracticalStableMinSpawnAgeSec: 0.3,
    strongestModeCoronationElsaPracticalStableVelocityThreshold: 1,
    strongestModeCoronationElsaMinPlayableNodesBeforeFreezeTap: 35,
    isTsumInPlayArea: () => true,
    boardState: { isFrozen: () => false, hasBubble: () => false },
    getBodyRadius: (body) => body.radius,
    getBodyCollisionX: (body) => body.x,
    getBodyCollisionY: (body) => body.y,
    getFieldFloorY: () => FIELD_BOTTOM,
    getPhysicsBodies: () => [upper, lower],
    isBodySettled: () => false
  };
  const context = {
    safePlayableY: 220,
    lowerPlayableNodeCount: 20,
    lowerBoardFilled: false,
    physicsBodies: [upper, lower]
  };

  const upperState = Game.prototype.getStrongestModeCoronationElsaFlowSafetyState.call(harness, upper, context);
  const lowerState = Game.prototype.getStrongestModeCoronationElsaFlowSafetyState.call(harness, lower, context);

  assert.equal(upperState.supportKind, "dynamic");
  assert.equal(upperState.activeInflow, true);
  assert.equal(upperState.inflowUnsafe, true);
  assert.equal(lowerState.supportKind, "fall-space");
  assert.equal(lowerState.activeInflow, true);
  assert.equal(lowerState.inflowUnsafe, true);
});

test("Coronation Elsa preview rejects a chain containing a practically unstable Tsum", () => {
  const chain = [
    { ...makeCoronationElsaNode("stable-start", 20, 500), vx: 0, vy: 0, spawnedAtElapsed: 0 },
    { ...makeCoronationElsaNode("unstable-middle", 25, 440), vx: 1.0001, vy: 0, spawnedAtElapsed: 0 },
    { ...makeCoronationElsaNode("stable-end", 30, 380), vx: 0, vy: 0, spawnedAtElapsed: 0 }
  ];
  const harness = makeCoronationElsaPreviewHarness({
    nodes: chain,
    chainsByStart: new Map([[chain[0].id, { chain, direction: "vertical" }]])
  });
  Object.assign(harness, makeCoronationElsaPracticalStableHarness());
  harness.boardState = {
    ...harness.boardState,
    getFrozenNodesByKind: () => [],
    getResolvedType: (node) => node.type
  };
  harness.isStrongestModeCoronationElsaPracticalStableTsum = function practicalStable(tsum) {
    return Game.prototype.isStrongestModeCoronationElsaPracticalStableTsum.call(this, tsum);
  };

  const selected = Game.prototype.findStrongestModeCoronationElsaBestPreviewChain.call(harness, {
    minLength: 3,
    maxLength: 6,
    filterNode: (tsum) => harness.isStrongestModeCoronationElsaPracticalStableTsum(tsum)
  });

  assert.deepEqual(selected, []);
});

test("Coronation Elsa recent-spawn wait always releases at 0.7 seconds", () => {
  const recentTsum = { id: "recent", spawnedAtElapsed: 0.4, isSettled: () => false };
  const harness = {
    elapsed: 0.699,
    strongestModeCoronationElsaWaitRecentSpawnSettle: true,
    strongestModeCoronationElsaWaitStartElapsed: 0,
    strongestModeCoronationElsaNoRecentSpawnMaxWaitSec: 0.7,
    strongestModeCoronationElsaSuppressRelaxedFallback: false,
    strongestModeCoronationElsaSuppressSpecialTapFrames: 0,
    strongestModeCoronationElsaNoChainFrames: 0,
    findStrongestModeCoronationElsaSafeWaitReleaseChain: () => [],
    getStrongestModeCoronationElsaRecentSpawnedTsums: () => [recentTsum],
    getStrongestModeCoronationElsaSkillSummary: () => null,
    countStrongestModePlayableNodesBelowCeiling: () => 45,
    boardState: { getFrozenNodesByKind: () => [] },
    pushCodexDebugLog: () => {},
    logCodexCoronationPayload: () => {}
  };

  assert.equal(Game.prototype.shouldWaitForCoronationElsaRecentSpawnsToSettle.call(harness), true);
  harness.elapsed = 0.7;
  assert.equal(Game.prototype.shouldWaitForCoronationElsaRecentSpawnsToSettle.call(harness), false);
  assert.equal(harness.strongestModeCoronationElsaWaitRecentSpawnSettle, false);
});

test("Coronation Elsa edge starts include exactly two Tsum radii and exclude top-only or central starts", () => {
  const harness = {};
  const edgeBand = TSUM_RADIUS * 2;
  assert.equal(Game.prototype.isStrongestModeCoronationElsaEdgeStart.call(
    harness,
    makeCoronationElsaNode("left-limit", FIELD_LEFT + edgeBand, 300)
  ), true);
  assert.equal(Game.prototype.isStrongestModeCoronationElsaEdgeStart.call(
    harness,
    makeCoronationElsaNode("right-limit", FIELD_RIGHT - edgeBand, 300)
  ), true);
  assert.equal(Game.prototype.isStrongestModeCoronationElsaEdgeStart.call(
    harness,
    makeCoronationElsaNode("bottom-limit", 207, FIELD_BOTTOM - edgeBand)
  ), true);
  assert.equal(Game.prototype.isStrongestModeCoronationElsaEdgeStart.call(
    harness,
    makeCoronationElsaNode("outside-limit", FIELD_LEFT + edgeBand + 0.001, 300)
  ), false);
  assert.equal(Game.prototype.isStrongestModeCoronationElsaEdgeStart.call(
    harness,
    makeCoronationElsaNode("top-only", 207, 145)
  ), false);
});

test("Coronation Elsa maps bottom starts to horizontal and side starts to vertical searches", () => {
  const harness = {
    isStrongestModeCoronationElsaEdgeStart: Game.prototype.isStrongestModeCoronationElsaEdgeStart
  };
  assert.deepEqual(
    Game.prototype.getStrongestModeCoronationElsaStartDirections.call(
      harness,
      makeCoronationElsaNode("bottom", 207, FIELD_BOTTOM - 20)
    ),
    ["horizontal"]
  );
  assert.deepEqual(
    Game.prototype.getStrongestModeCoronationElsaStartDirections.call(
      harness,
      makeCoronationElsaNode("left", FIELD_LEFT + 20, 320)
    ),
    ["vertical"]
  );
  assert.deepEqual(
    Game.prototype.getStrongestModeCoronationElsaStartDirections.call(
      harness,
      makeCoronationElsaNode("corner", FIELD_LEFT + 20, FIELD_BOTTOM - 20)
    ),
    ["horizontal", "vertical"]
  );
});

test("Coronation Elsa directional geometry requires 58 pixels of progress within 35 percent tilt", () => {
  const left = makeCoronationElsaNode("left", 20, 400);
  const verticalValid = [left, makeCoronationElsaNode("vertical-valid", 40, 320)];
  const verticalTilted = [left, makeCoronationElsaNode("vertical-tilted", 55, 320)];
  const verticalShort = [left, makeCoronationElsaNode("vertical-short", 20, 343)];
  assert.equal(
    Game.prototype.getStrongestModeCoronationElsaDirectionalGeometry.call({}, verticalValid, "vertical").valid,
    true
  );
  assert.equal(
    Game.prototype.getStrongestModeCoronationElsaDirectionalGeometry.call({}, verticalTilted, "vertical").valid,
    false
  );
  assert.equal(
    Game.prototype.getStrongestModeCoronationElsaDirectionalGeometry.call({}, verticalShort, "vertical").valid,
    false
  );

  const bottom = makeCoronationElsaNode("bottom", 200, 560);
  const horizontalValid = [bottom, makeCoronationElsaNode("horizontal-valid", 280, 535)];
  const horizontalTilted = [bottom, makeCoronationElsaNode("horizontal-tilted", 280, 530)];
  assert.equal(
    Game.prototype.getStrongestModeCoronationElsaDirectionalGeometry.call({}, horizontalValid, "horizontal").valid,
    true
  );
  assert.equal(
    Game.prototype.getStrongestModeCoronationElsaDirectionalGeometry.call({}, horizontalTilted, "horizontal").valid,
    false
  );
});

test("Coronation Elsa directional search builds a valid parallel chain from connected Tsums", () => {
  const nodes = [
    makeCoronationElsaNode("left", 20, 500),
    makeCoronationElsaNode("mid", 25, 440),
    makeCoronationElsaNode("top", 30, 380)
  ];
  const harness = {
    canConnectWithChainRule: (rule, from, to) => Math.hypot(from.x - to.x, from.y - to.y) <= 70,
    getStrongestModeCoronationElsaDirectionalGeometry: Game.prototype.getStrongestModeCoronationElsaDirectionalGeometry,
    countStrongestModeOnwardConnections: Game.prototype.countStrongestModeOnwardConnections
  };
  const chains = Game.prototype.findStrongestModeCoronationElsaDirectionalChains.call(
    harness,
    nodes[0],
    nodes,
    { allowedTypeIds: new Set(["test"]) },
    6,
    "vertical"
  );
  assert.deepEqual(chains[0].chain.map((node) => node.id), ["left", "mid", "top"]);
  assert.equal(chains[0].geometry.valid, true);
});

test("Coronation Elsa rejects a chain whose middle Tsums snake out of the edge lane", () => {
  const chain = [
    makeCoronationElsaNode("left-start", 20, 500),
    makeCoronationElsaNode("center-detour", 207, 440),
    makeCoronationElsaNode("left-end", 25, 380)
  ];
  const geometry = Game.prototype.getStrongestModeCoronationElsaDirectionalGeometry.call(
    {},
    chain,
    "vertical"
  );
  assert.equal(geometry.staysInEdgeLane, false);
  assert.equal(geometry.valid, false);
});

test("Coronation Elsa deterministic search keeps a connected detour inside the edge lane", () => {
  const nodes = [
    makeCoronationElsaNode("left-start", 20, 500),
    makeCoronationElsaNode("edge-detour", 55, 450),
    makeCoronationElsaNode("left-end", 25, 390)
  ];
  const allowedLinks = new Set(["left-start:edge-detour", "edge-detour:left-end"]);
  const harness = {
    canConnectWithChainRule: (rule, from, to) => allowedLinks.has(`${from.id}:${to.id}`),
    getStrongestModeCoronationElsaDirectionalGeometry: Game.prototype.getStrongestModeCoronationElsaDirectionalGeometry,
    countStrongestModeOnwardConnections: Game.prototype.countStrongestModeOnwardConnections
  };
  const chains = Game.prototype.findStrongestModeCoronationElsaDirectionalChains.call(
    harness,
    nodes[0],
    nodes,
    { allowedTypeIds: new Set(["test"]) },
    6,
    "vertical"
  );
  assert.deepEqual(chains[0].chain.map((node) => node.id), ["left-start", "edge-detour", "left-end"]);
});

test("Coronation Elsa primary search keeps endpoints within 58 pixels and allows middle Tsums within 116 pixels", () => {
  const chain = [
    makeCoronationElsaNode("primary-start", 20, 500),
    makeCoronationElsaNode("primary-middle", 100, 450),
    makeCoronationElsaNode("primary-end", 25, 390)
  ];
  const harness = makeCoronationElsaPreviewHarness({
    nodes: chain,
    chainsByStart: new Map([[chain[0].id, { chain, direction: "vertical" }]])
  });

  const selected = Game.prototype.findStrongestModeCoronationElsaBestPreviewChain.call(harness, {
    minLength: 3,
    maxLength: 6
  });

  assert.deepEqual(selected.map((node) => node.id), chain.map((node) => node.id));
  assert.equal(selected.strongestModeCoronationElsaPlan.searchTier, "primary58");
  assert.equal(selected.strongestModeCoronationElsaPlan.intermediateEdgeBand, TSUM_RADIUS * 4);
});

test("Coronation Elsa secondary search expands endpoints to 116 pixels when primary has no candidate", () => {
  const chain = [
    makeCoronationElsaNode("secondary-start", 90, 500),
    makeCoronationElsaNode("secondary-middle", 105, 445),
    makeCoronationElsaNode("secondary-end", 95, 385)
  ];
  const harness = makeCoronationElsaPreviewHarness({
    nodes: chain,
    chainsByStart: new Map([[chain[0].id, { chain, direction: "vertical" }]])
  });

  const selected = Game.prototype.findStrongestModeCoronationElsaBestPreviewChain.call(harness, {
    minLength: 3,
    maxLength: 6
  });

  assert.deepEqual(selected.map((node) => node.id), chain.map((node) => node.id));
  assert.equal(selected.strongestModeCoronationElsaPlan.searchTier, "secondary116");
});

test("Coronation Elsa secondary search prioritizes endpoints nearest existing ice", () => {
  const left = [
    makeCoronationElsaNode("near-start", 90, 500),
    makeCoronationElsaNode("near-middle", 100, 445),
    makeCoronationElsaNode("near-end", 95, 385)
  ];
  const right = [
    makeCoronationElsaNode("far-start", 324, 500),
    makeCoronationElsaNode("far-middle", 314, 445),
    makeCoronationElsaNode("far-end", 319, 385)
  ];
  const rightExtras = [
    makeCoronationElsaNode("far-extra-1", 330, 330),
    makeCoronationElsaNode("far-extra-2", 335, 275)
  ];
  const frozen = makeCoronationElsaNode("existing-ice", 80, 410);
  const harness = makeCoronationElsaPreviewHarness({
    nodes: [...left, ...right, ...rightExtras],
    frozenNodes: [frozen],
    chainsByStart: new Map([
      [left[0].id, { chain: left, direction: "vertical" }],
      [right[0].id, { chain: right, direction: "vertical" }]
    ])
  });

  const selected = Game.prototype.findStrongestModeCoronationElsaBestPreviewChain.call(harness, {
    minLength: 3,
    maxLength: 6
  });

  assert.deepEqual(selected.map((node) => node.id), left.map((node) => node.id));
  assert.equal(selected.strongestModeCoronationElsaPlan.searchTier, "secondary116");
  assert.ok(Number.isFinite(selected.strongestModeCoronationElsaPlan.iceProximityDistancePx));
});

test("Coronation Elsa preview selects the largest predicted clear without edge-direction bonuses", () => {
  const left = [
    makeCoronationElsaNode("left-start", 20, 270),
    makeCoronationElsaNode("left-mid", 20, 330),
    makeCoronationElsaNode("left-end", 20, 390)
  ];
  const right = [
    makeCoronationElsaNode("right-start", 394, 270),
    makeCoronationElsaNode("right-mid", 394, 330),
    makeCoronationElsaNode("right-end", 394, 390)
  ];
  const rightLineExtras = [
    makeCoronationElsaNode("right-extra-1", 380, 450),
    makeCoronationElsaNode("right-extra-2", 382, 510)
  ];
  const nodes = [...left, ...right, ...rightLineExtras];
  const harness = makeCoronationElsaPreviewHarness({
    nodes,
    chainsByStart: new Map([
      [left[0].id, { chain: left, direction: "vertical" }],
      [right[0].id, { chain: right, direction: "vertical" }]
    ])
  });

  const selected = Game.prototype.findStrongestModeCoronationElsaBestPreviewChain.call(harness, {
    minLength: 3,
    maxLength: 6
  });

  assert.deepEqual(selected.map((node) => node.id), right.map((node) => node.id));
});

test("Coronation Elsa prioritizes a candidate that leaves another legal trace before the fourth commit", () => {
  const highClearBottom = [
    makeCoronationElsaNode("high-start", 140, FIELD_BOTTOM - 20),
    makeCoronationElsaNode("high-mid", 200, FIELD_BOTTOM - 20),
    makeCoronationElsaNode("high-end", 260, FIELD_BOTTOM - 20)
  ];
  const preservingSide = [
    makeCoronationElsaNode("preserve-start", FIELD_LEFT + 20, FIELD_BOTTOM - 20),
    makeCoronationElsaNode("preserve-mid", FIELD_LEFT + 20, FIELD_BOTTOM - 80),
    makeCoronationElsaNode("preserve-end", FIELD_LEFT + 20, FIELD_BOTTOM - 140)
  ];
  const highLineExtras = [
    makeCoronationElsaNode("high-extra-1", 300, FIELD_BOTTOM - 20),
    makeCoronationElsaNode("high-extra-2", 350, FIELD_BOTTOM - 20)
  ];
  const nodes = [...highClearBottom, ...preservingSide, ...highLineExtras];
  const harness = makeCoronationElsaPreviewHarness({
    nodes,
    chainsByStart: new Map([
      [highClearBottom[0].id, { chain: highClearBottom, direction: "horizontal" }],
      [preservingSide[0].id, { chain: preservingSide, direction: "vertical" }]
    ]),
    committedTraceCount: 1
  });
  const selected = Game.prototype.findStrongestModeCoronationElsaBestPreviewChain.call(harness, {
    minLength: 3,
    maxLength: 6
  });
  assert.deepEqual(selected.map((node) => node.id), preservingSide.map((node) => node.id));
  assert.equal(selected.strongestModeCoronationElsaPlan.preservesNextTrace, true);
  assert.ok(selected.strongestModeCoronationElsaPlan.nextChainPotential >= 3);
});

test("Coronation Elsa preview re-evaluates vertical and horizontal directions from the current board", () => {
  const vertical = [
    makeCoronationElsaNode("side-start", 20, 440),
    makeCoronationElsaNode("side-mid", 25, 380),
    makeCoronationElsaNode("side-end", 30, 320)
  ];
  const horizontal = [
    makeCoronationElsaNode("bottom-start", 140, 560),
    makeCoronationElsaNode("bottom-mid", 200, 555),
    makeCoronationElsaNode("bottom-end", 260, 550)
  ];
  const verticalLineExtras = [
    makeCoronationElsaNode("vertical-extra-1", 35, 260),
    makeCoronationElsaNode("vertical-extra-2", 40, 220)
  ];
  const nodes = [...vertical, ...horizontal, ...verticalLineExtras];
  const harness = makeCoronationElsaPreviewHarness({
    nodes,
    chainsByStart: new Map([
      [vertical[0].id, { chain: vertical, direction: "vertical" }],
      [horizontal[0].id, { chain: horizontal, direction: "horizontal" }]
    ])
  });

  const selected = Game.prototype.findStrongestModeCoronationElsaBestPreviewChain.call(harness, {
    minLength: 3,
    maxLength: 6
  });

  assert.deepEqual(selected.map((node) => node.id), vertical.map((node) => node.id));
});

test("Coronation Elsa preview does not use full-board fallback after four committed traces", () => {
  const central = [
    makeCoronationElsaNode("center-start", 207, 280),
    makeCoronationElsaNode("center-mid", 207, 340),
    makeCoronationElsaNode("center-end", 207, 400)
  ];
  const harness = makeCoronationElsaPreviewHarness({
    nodes: central,
    chainsByStart: new Map([[central[0].id, { chain: central, direction: "vertical" }]]),
    committedTraceCount: 4
  });

  const selected = Game.prototype.findStrongestModeCoronationElsaBestPreviewChain.call(harness, {
    minLength: 3,
    maxLength: 6
  });

  assert.deepEqual(selected, []);
});

test("Coronation Elsa expands to 174 pixels before four committed traces", () => {
  const chain = [
    makeCoronationElsaNode("tertiary-start", FIELD_LEFT + 145, 500),
    makeCoronationElsaNode("tertiary-mid", FIELD_LEFT + 150, 440),
    makeCoronationElsaNode("tertiary-end", FIELD_LEFT + 148, 380)
  ];
  const harness = makeCoronationElsaPreviewHarness({
    nodes: chain,
    chainsByStart: new Map([[chain[0].id, { chain, direction: "vertical" }]])
  });
  const selected = Game.prototype.findStrongestModeCoronationElsaBestPreviewChain.call(harness, {
    minLength: 3,
    maxLength: 6
  });
  assert.deepEqual(selected.map((node) => node.id), chain.map((node) => node.id));
  assert.equal(selected.strongestModeCoronationElsaPlan.searchTier, "tertiary174");
});

test("Coronation Elsa uses a parallel full-board chain only before four committed traces", () => {
  const chain = [
    makeCoronationElsaNode("center-start", 207, 500),
    makeCoronationElsaNode("center-mid", 210, 440),
    makeCoronationElsaNode("center-end", 212, 380)
  ];
  const harness = makeCoronationElsaPreviewHarness({
    nodes: chain,
    chainsByStart: new Map([[chain[0].id, { chain, direction: "vertical" }]])
  });
  const selected = Game.prototype.findStrongestModeCoronationElsaBestPreviewChain.call(harness, {
    minLength: 3,
    maxLength: 6
  });
  assert.deepEqual(selected.map((node) => node.id), chain.map((node) => node.id));
  assert.equal(selected.strongestModeCoronationElsaPlan.searchTier, "fullBoard");
});

test("fever bomb cancel queues every snapshot chain once and ignores later nodes", () => {
  const snapshotNodes = Array.from({ length: 6 }, (_, index) => ({ id: `snapshot-${index}` }));
  const laterNodes = Array.from({ length: 3 }, (_, index) => ({ id: `later-${index}` }));
  const chains = [snapshotNodes.slice(0, 3), snapshotNodes.slice(3, 6), laterNodes];
  const bomb = { id: "bomb-best", x: 40, y: 50, dead: false, removing: false };
  const performed = [];
  const taps = [];
  const harness = {
    strongestModeEnabled: true,
    feverSystem: { active: false, gauge: 0 },
    skillRuntime: { sessions: [] },
    getStrongestModeValidBombs: () => [bomb],
    findStrongestModeBestBomb: () => bomb,
    getStrongestModeChainNodes: () => snapshotNodes,
    findStrongestModeBestChain(options) {
      return chains.find((chain) => chain.every((node) => options.filterNode(node))) || [];
    },
    performStrongestModeChain(chain) {
      performed.push(chain.map((node) => node.id));
      chains.splice(chains.indexOf(chain), 1);
      return true;
    },
    isStrongestModeDeferredBombTargetValid: (target) => target === bomb && !target.dead,
    inputRouter: {
      handleTap(pos) {
        taps.push(pos);
        return true;
      }
    },
    canBombCancelActiveChain: () => true,
    explodeBomb() {
      assert.fail("direct bomb fallback should not run when the tap succeeds");
    }
  };

  const result = Game.prototype.tryPerformStrongestModeFeverBombCancel.call(harness);

  assert.equal(result, true);
  assert.deepEqual(performed, [
    ["snapshot-0", "snapshot-1", "snapshot-2"],
    ["snapshot-3", "snapshot-4", "snapshot-5"]
  ]);
  assert.deepEqual(taps, [{ x: 40, y: 50 }]);
});

test("fever bomb cancel does not consume a bomb when the snapshot has no chain", () => {
  const bomb = { id: "bomb", x: 10, y: 20, dead: false, removing: false };
  let tapped = false;
  const harness = {
    strongestModeEnabled: true,
    feverSystem: { active: false, gauge: 0 },
    skillRuntime: { sessions: [] },
    getStrongestModeValidBombs: () => [bomb],
    findStrongestModeBestBomb: () => bomb,
    getStrongestModeChainNodes: () => [{ id: "one" }, { id: "two" }],
    inputRouter: { handleTap() { tapped = true; return true; } }
  };

  assert.equal(Game.prototype.tryPerformStrongestModeFeverBombCancel.call(harness), false);
  assert.equal(tapped, false);
});

test("fever bomb cancel reselects a bomb when the reservation becomes invalid", () => {
  const nodes = [{ id: "one" }, { id: "two" }, { id: "three" }];
  const reserved = { id: "reserved", x: 10, y: 20 };
  const replacement = { id: "replacement", x: 30, y: 40 };
  let selectionCount = 0;
  let tappedBomb = null;
  const harness = {
    strongestModeEnabled: true,
    feverSystem: { active: false, gauge: 0 },
    skillRuntime: { sessions: [] },
    getStrongestModeValidBombs: () => [reserved, replacement],
    findStrongestModeBestBomb() {
      selectionCount += 1;
      return selectionCount === 1 ? reserved : replacement;
    },
    getStrongestModeChainNodes: () => nodes,
    findStrongestModeBestChain: () => nodes,
    performStrongestModeChain: () => true,
    isStrongestModeDeferredBombTargetValid: (bomb) => bomb === replacement,
    inputRouter: {
      handleTap(pos) {
        tappedBomb = pos;
        return true;
      }
    },
    canBombCancelActiveChain: () => true
  };

  assert.equal(Game.prototype.tryPerformStrongestModeFeverBombCancel.call(harness), true);
  assert.equal(selectionCount, 2);
  assert.deepEqual(tappedBomb, { x: 30, y: 40 });
});

test("strongest mode best bomb chooses the largest effect and preserves other bombs", () => {
  const low = { id: "low", x: 0, y: 20, effectRadius: 10, bombType: "normal" };
  const high = { id: "high", x: 50, y: 20, effectRadius: 20, bombType: "normal" };
  const tsums = [
    { id: "a", x: 50, y: 20 },
    { id: "b", x: 60, y: 20 },
    { id: "c", x: 70, y: 20 }
  ];
  const harness = {
    tsums,
    isTsumInPlayArea: () => true,
    boardState: { canBombAffectNode: () => true }
  };

  assert.equal(Game.prototype.findStrongestModeBestBomb.call(harness, [low, high]), high);
});
