import assert from "node:assert/strict";
import test from "node:test";

import { coronationElsaSkillHandler } from "./game.js";
import {
  CORONATION_ELSA_PLANNER_CONFIG,
  buildCoronationElsaPlannerAdjacency,
  buildCoronationElsaPlannerSnapshot,
  enumerateCoronationElsaPlannerTraces,
  evaluateCoronationElsaFreezeTransitionSafety,
  evaluateCoronationElsaTapComponents,
  getCoronationElsaPlannerNodeIndex,
  profileCoronationElsaPlanner,
  solveCoronationElsaStrongestModePlan,
  simulateCoronationElsaFreeze
} from "./coronationElsaPlanner.js";

const makeNode = (id, x, y, typeId = "red", options = {}) => ({
  id,
  x,
  y,
  vx: options.vx || 0,
  vy: options.vy || 0,
  spawnedAtElapsed: options.spawnedAtElapsed ?? 0,
  type: { id: typeId },
  radius: options.radius || 29,
  baseRadius: options.radius || 29,
  isLarge: !!options.isLarge,
  clearWeight: options.isLarge ? 5 : 1,
  inPlay: options.inPlay !== false,
  dead: !!options.dead,
  removing: !!options.removing,
  clearOccupying: !!options.clearOccupying,
  inChain: !!options.inChain
});

const makeBoard = (nodes, options = {}) => {
  const freezeLayer = new Map();
  const freezeGroups = new Map();
  const bubbles = new Set(options.bubbleIds || []);
  for (const [id, layerCount] of Object.entries(options.coronationLayers || {})) {
    freezeLayer.set(id, Array.from({ length: layerCount }, (_, index) => ({
      freezeKind: "coronationElsa",
      groupId: `prior-${index}`,
      correctionType: "correction_-5",
      chargeMultiplier: 0.4
    })));
  }
  for (const id of options.otherFrozenIds || []) {
    const entries = freezeLayer.get(id) || [];
    entries.push({ freezeKind: "generic", groupId: "generic-prior" });
    freezeLayer.set(id, entries);
  }
  const board = {
    freezeLayer,
    freezeGroups,
    hasBubble: (node) => bubbles.has(node.id),
    isFrozen: (node) => (freezeLayer.get(node.id) || []).length > 0,
    getFrozenEntriesByKind(node, kind) {
      return (freezeLayer.get(node.id) || []).filter((entry) => entry.freezeKind === kind);
    },
    getFrozenNodesByKind(kind) {
      return nodes.filter((node) => (
        !node.dead &&
        !node.removing &&
        board.getFrozenEntriesByKind(node, kind).length > 0
      ));
    },
    getResolvedType: (node) => node.type,
    getEffectiveRadius: (node) => node.radius,
    nextGroupId: (() => {
      let nextId = 0;
      return (kind) => `${kind}-${++nextId}`;
    })()
  };
  return board;
};

const makeGame = (nodes, options = {}) => {
  const boardState = makeBoard(nodes, options);
  const links = options.links || null;
  const flowStates = options.flowStates || {};
  const game = {
    tsums: nodes,
    boardState,
    selectedSkillLevel: options.level || 6,
    myTsum: { id: options.myTsumId || "red" },
    elapsed: options.elapsed ?? 12.5,
    strongestModeCoronationElsaNoTraceDurationSec: 0.04,
    coronationElsaDebug: !!options.coronationElsaDebug,
    isTsumInPlayArea: (node) => !!node && !node.dead && !node.removing && node.inPlay !== false,
    getBodyRadius: (node) => boardState.getEffectiveRadius(node),
    isMyTsumTypeId: (typeId) => typeId === (options.myTsumId || "red"),
    getStrongestModeCoronationElsaFlowSafetyContext: () => Object.freeze({
      safePlayableY: options.safePlayableY ?? 220,
      lowerPlayableNodeCount: options.lowerPlayableNodeCount ?? 45,
      lowerBoardFilled: (options.lowerPlayableNodeCount ?? 45) >= 35
    }),
    getStrongestModeCoronationElsaFlowSafetyState(node) {
      return Object.freeze({
        spawnAgeSec: 10,
        settled: true,
        recentSpawn: false,
        upperInflow: false,
        activeInflow: false,
        inflowUnsafe: false,
        ...(flowStates[node.id] || {})
      });
    },
    getChainBehaviorForStart(node) {
      if (typeof options.getChainBehaviorForStart === "function") {
        return options.getChainBehaviorForStart(node);
      }
      return { mode: "normal", allowedTypeIds: new Set([node.type.id]) };
    },
    canConnectWithChainRule(rule, from, candidate) {
      if (typeof options.canConnectWithChainRule === "function") {
        return options.canConnectWithChainRule(rule, from, candidate);
      }
      return (
        rule.allowedTypeIds.has(candidate.type.id) &&
        (!links || links.has(`${from.id}:${candidate.id}`)) &&
        Math.hypot(from.x - candidate.x, from.y - candidate.y) <= 95
      );
    },
    logCodexCoronationPayload(prefix, payload) {
      options.logs?.push({ prefix, payload });
    },
    recordStrongestModeCoronationElsaChainCommit() {},
    recordStrongestModeCoronationElsaTracePlanChain() {},
    createShockwave() {}
  };
  return game;
};

const captureLiveState = (game) => ({
  tsums: game.tsums.map((node) => ({ ...node, type: { ...node.type } })),
  freezeLayer: Array.from(game.boardState.freezeLayer.entries()).map(([id, entries]) => [
    id,
    entries.map((entry) => ({ ...entry }))
  ]),
  freezeGroups: Array.from(game.boardState.freezeGroups.entries()).map(([id, members]) => [
    id,
    Array.from(members)
  ]),
  elapsed: game.elapsed,
  noTraceDurationSec: game.strongestModeCoronationElsaNoTraceDurationSec
});

const idsForMask = (snapshot, mask) => snapshot.nodes
  .filter((node) => (mask & (1n << BigInt(node.index))) !== 0n)
  .map((node) => node.id);

const popcountForTest = (mask) => {
  let value = mask;
  let count = 0;
  while (value) {
    value &= value - 1n;
    count += 1;
  }
  return count;
};

test("planner snapshot, adjacency, simulation, and enumeration never mutate the live board", () => {
  const nodes = [
    makeNode("a", 120, 180),
    makeNode("b", 170, 220),
    makeNode("c", 220, 260),
    makeNode("frozen", 270, 300)
  ];
  const game = makeGame(nodes, { coronationLayers: { frozen: 2 } });
  const before = captureLiveState(game);
  const snapshot = buildCoronationElsaPlannerSnapshot(game, 6);
  const adjacency = buildCoronationElsaPlannerAdjacency(game, snapshot);
  const chain = ["a", "b", "c"].map((id) => getCoronationElsaPlannerNodeIndex(snapshot, id));
  simulateCoronationElsaFreeze(snapshot, snapshot.initialState, chain);
  enumerateCoronationElsaPlannerTraces(snapshot, adjacency, snapshot.initialState);

  assert.deepEqual(captureLiveState(game), before);
  assert.equal(Object.isFrozen(snapshot), true);
  assert.equal(Object.isFrozen(snapshot.nodes), true);
  assert.equal(Object.isFrozen(adjacency), true);
});

test("the pure freeze transition is deterministic and increments each unique target by one layer", () => {
  const nodes = [
    makeNode("a", 100, 220),
    makeNode("b", 150, 220),
    makeNode("c", 200, 220),
    makeNode("prior", 240, 220),
    makeNode("surround", 240, 270)
  ];
  const game = makeGame(nodes, { coronationLayers: { prior: 3 } });
  const snapshot = buildCoronationElsaPlannerSnapshot(game, 6);
  const chain = ["a", "b", "c"].map((id) => getCoronationElsaPlannerNodeIndex(snapshot, id));
  const beforeLayers = snapshot.initialState.freezeLayerCounts.slice();
  const first = simulateCoronationElsaFreeze(snapshot, snapshot.initialState, chain);
  const second = simulateCoronationElsaFreeze(snapshot, snapshot.initialState, chain);

  assert.equal(first.targetMask, second.targetMask);
  assert.equal(first.nextFrozenMask, second.nextFrozenMask);
  assert.deepEqual(first.targetIndices, second.targetIndices);
  assert.deepEqual(
    first.targetIndices.map((index) => snapshot.nodes[index].id),
    ["a", "b", "c", "prior", "surround"]
  );
  assert.deepEqual(first.nextFreezeLayerCounts, second.nextFreezeLayerCounts);
  assert.deepEqual(snapshot.initialState.freezeLayerCounts, beforeLayers);
  for (let index = 0; index < snapshot.nodes.length; index += 1) {
    const expectedIncrease = first.targetIndices.includes(index) ? 1 : 0;
    assert.equal(
      first.nextFreezeLayerCounts[index],
      snapshot.initialState.freezeLayerCounts[index] + expectedIncrease
    );
  }
});

test("actual Coronation Elsa onChainCommit and planner simulation freeze the same IDs and layers", () => {
  const nodes = [
    makeNode("a", 95, 240),
    makeNode("b", 145, 240),
    makeNode("c", 195, 240),
    makeNode("prior", 245, 240),
    makeNode("near-prior", 245, 295),
    makeNode("far", 370, 400)
  ];
  const game = makeGame(nodes, { coronationLayers: { prior: 2 } });
  const snapshot = buildCoronationElsaPlannerSnapshot(game, 6);
  const chain = nodes.slice(0, 3);
  const chainIndices = chain.map((node) => getCoronationElsaPlannerNodeIndex(snapshot, node.id));
  const simulated = simulateCoronationElsaFreeze(snapshot, snapshot.initialState, chainIndices);
  let appliedIds = [];
  const ctx = {
    game,
    board: game.boardState,
    level: 6,
    applyFreeze(ids, spec) {
      appliedIds = ids.slice();
      for (const id of ids) {
        const entries = game.boardState.freezeLayer.get(id) || [];
        entries.push({ ...spec });
        game.boardState.freezeLayer.set(id, entries);
      }
    }
  };

  assert.equal(coronationElsaSkillHandler.onChainCommit(ctx, { id: "session-1" }, chain), true);
  assert.deepEqual(appliedIds, simulated.targetIndices.map((index) => snapshot.nodes[index].id));
  assert.deepEqual(
    nodes.map((node) => game.boardState.getFrozenEntriesByKind(node, "coronationElsa").length),
    simulated.nextFreezeLayerCounts
  );
});

test("planner enumerates a legal upper central diagonal 3-chain without edge or stability filters", () => {
  const nodes = [
    makeNode("upper-a", 160, 150, "blue", { vx: 8 }),
    makeNode("upper-b", 205, 190, "blue", { vy: -9 }),
    makeNode("upper-c", 250, 230, "blue", { vx: -7 })
  ];
  const game = makeGame(nodes);
  const snapshot = buildCoronationElsaPlannerSnapshot(game, 6);
  const adjacency = buildCoronationElsaPlannerAdjacency(game, snapshot);
  const result = enumerateCoronationElsaPlannerTraces(snapshot, adjacency, snapshot.initialState, {
    lengths: [3],
    dedupeByNextFrozenMask: false
  });

  assert.equal(result.candidates.length, 1);
  assert.deepEqual(new Set(result.candidates[0].chainIds), new Set(nodes.map((node) => node.id)));
});

test("planner exhaustively enumerates every undirected 3-node path in a branching graph", () => {
  const nodes = [
    makeNode("a", 100, 240),
    makeNode("b", 150, 240),
    makeNode("c", 200, 200),
    makeNode("d", 200, 280)
  ];
  const undirectedEdges = [["a", "b"], ["b", "c"], ["b", "d"]];
  const links = new Set(undirectedEdges.flatMap(([first, second]) => [
    `${first}:${second}`,
    `${second}:${first}`
  ]));
  const game = makeGame(nodes, { links });
  const snapshot = buildCoronationElsaPlannerSnapshot(game, 6);
  const adjacency = buildCoronationElsaPlannerAdjacency(game, snapshot);
  const result = enumerateCoronationElsaPlannerTraces(snapshot, adjacency, snapshot.initialState, {
    lengths: [3],
    dedupeByNextFrozenMask: false
  });
  const normalized = result.candidates.map((candidate) => [...candidate.chainIds].sort().join(""));

  assert.deepEqual(new Set(normalized), new Set(["abc", "abd", "bcd"]));
  assert.equal(result.rawCandidateCount, 6);
  assert.equal(result.pathDedupedCandidateCount, 3);
});

test("equivalent future frozen masks dedupe in Phase A and remain available for Phase B", () => {
  const nodes = [
    makeNode("a", 100, 250),
    makeNode("b", 150, 250),
    makeNode("c", 200, 250),
    makeNode("d", 250, 250)
  ];
  const game = makeGame(nodes);
  const snapshot = buildCoronationElsaPlannerSnapshot(game, 6);
  const adjacency = buildCoronationElsaPlannerAdjacency(game, snapshot);
  const phaseA = enumerateCoronationElsaPlannerTraces(snapshot, adjacency, snapshot.initialState, {
    lengths: [3],
    dedupeByNextFrozenMask: true
  });
  const phaseB = enumerateCoronationElsaPlannerTraces(snapshot, adjacency, snapshot.initialState, {
    lengths: [3],
    dedupeByNextFrozenMask: false
  });

  assert.ok(phaseB.candidates.length > phaseA.candidates.length);
  assert.equal(phaseA.candidates.length, 1);
  assert.deepEqual(idsForMask(snapshot, phaseA.candidates[0].nextFrozenMask), nodes.map((node) => node.id));
});

test("adjacency uses the live directed chain rule and excludes disallowed types", () => {
  const nodes = [
    makeNode("left", 100, 240, "red"),
    makeNode("right", 150, 240, "red"),
    makeNode("blue", 200, 240, "blue")
  ];
  const game = makeGame(nodes, {
    getChainBehaviorForStart: () => ({ mode: "directed-test", allowedTypeIds: new Set(["red"]) }),
    canConnectWithChainRule: (rule, from, candidate) => (
      rule.allowedTypeIds.has(candidate.type.id) && from.x < candidate.x
    )
  });
  const snapshot = buildCoronationElsaPlannerSnapshot(game, 6);
  const adjacency = buildCoronationElsaPlannerAdjacency(game, snapshot);
  const leftIndex = getCoronationElsaPlannerNodeIndex(snapshot, "left");
  const rightIndex = getCoronationElsaPlannerNodeIndex(snapshot, "right");
  const blueIndex = getCoronationElsaPlannerNodeIndex(snapshot, "blue");
  const context = adjacency.contexts[adjacency.startContextIndexByNode[leftIndex]];

  assert.deepEqual(context.neighborsByNode[leftIndex], [rightIndex]);
  assert.deepEqual(context.neighborsByNode[rightIndex], []);
  assert.equal(context.neighborsByNode[leftIndex].includes(blueIndex), false);
});

test("planner profiling reports counts and only logs under Coronation Elsa debug", () => {
  const nodes = [
    makeNode("a", 100, 240),
    makeNode("b", 150, 240),
    makeNode("c", 200, 240),
    makeNode("d", 250, 240)
  ];
  const logs = [];
  const game = makeGame(nodes, { logs, coronationElsaDebug: false });
  const quiet = profileCoronationElsaPlanner(game, { log: true });
  assert.equal(logs.length, 0);
  game.coronationElsaDebug = true;
  const debug = profileCoronationElsaPlanner(game, {
    log: true,
    sessionId: "session-1",
    committedTraceCount: 2
  });

  assert.equal(logs.length, 1);
  assert.equal(logs[0].prefix, "[CODEXLOG CORONATION PLANNER PROFILE]");
  for (const key of [
    "snapshotBuildMs",
    "adjacencyBuildMs",
    "length3CandidateCount",
    "length3To6CandidateCount",
    "length3To6FrozenMaskDedupedCount"
  ]) {
    assert.ok(Number.isFinite(debug.diagnostics[key]));
    assert.ok(debug.diagnostics[key] >= 0);
  }
  assert.equal(quiet.diagnostics.initialFrozenMaskHex, "0x0");
});

test("recent fast-falling upper chain is legal but rejected as freeze-flow unsafe", () => {
  const nodes = [
    makeNode("fall-a", 100, 170, "red", { vy: 8 }),
    makeNode("fall-b", 155, 170, "red", { vy: 8 }),
    makeNode("fall-c", 210, 170, "red", { vy: 8 }),
    makeNode("ice", 350, 500, "blue")
  ];
  const unsafe = { spawnAgeSec: 0.05, settled: false, recentSpawn: true, upperInflow: true, activeInflow: true, inflowUnsafe: true };
  const game = makeGame(nodes, {
    coronationLayers: { ice: 1 },
    lowerPlayableNodeCount: 20,
    flowStates: { "fall-a": unsafe, "fall-b": unsafe, "fall-c": unsafe }
  });
  const snapshot = buildCoronationElsaPlannerSnapshot(game, 6);
  const adjacency = buildCoronationElsaPlannerAdjacency(game, snapshot);
  const all = enumerateCoronationElsaPlannerTraces(snapshot, adjacency, snapshot.initialState, {
    lengths: [3],
    dedupeByNextFrozenMask: true
  });
  const plan = solveCoronationElsaStrongestModePlan(snapshot, adjacency, {
    config: { hardBudgetMs: 1000, softBudgetMs: 1000 }
  });

  assert.ok(all.unsafeTraceCandidateCount > 0);
  assert.equal(plan.action, "wait");
  assert.equal(plan.waitReason, "WAIT_FOR_INFLOW");
  assert.equal(plan.diagnostics.safeTraceCandidateCount, 0);
  assert.ok(plan.diagnostics.unsafeTraceCandidateCount > 0);
});

test("stable lower chain is rejected when its line preview freezes an upper inflow node", () => {
  const nodes = [
    makeNode("lower-a", 150, 300, "red"),
    makeNode("lower-b", 150, 355, "red"),
    makeNode("lower-c", 150, 410, "red"),
    makeNode("upper-flow", 150, 165, "blue", { vy: 7 }),
    makeNode("ice", 350, 500, "blue")
  ];
  const game = makeGame(nodes, {
    coronationLayers: { ice: 1 },
    lowerPlayableNodeCount: 20,
    flowStates: {
      "upper-flow": { spawnAgeSec: 0.04, settled: false, recentSpawn: true, upperInflow: true, activeInflow: true, inflowUnsafe: true }
    }
  });
  const snapshot = buildCoronationElsaPlannerSnapshot(game, 6);
  const adjacency = buildCoronationElsaPlannerAdjacency(game, snapshot);
  const enumeration = enumerateCoronationElsaPlannerTraces(snapshot, adjacency, snapshot.initialState, {
    lengths: [3],
    dedupeByNextFrozenMask: false
  });
  const candidate = enumeration.candidates.find((entry) => entry.chainIds.every((id) => String(id).startsWith("lower-")));
  const safety = evaluateCoronationElsaFreezeTransitionSafety(
    snapshot,
    snapshot.initialState,
    candidate.chainIndices
  );
  const plan = solveCoronationElsaStrongestModePlan(snapshot, adjacency, {
    config: { hardBudgetMs: 1000, softBudgetMs: 1000 }
  });

  assert.equal(candidate.chainIndices.some((index) => snapshot.nodes[index].inflowUnsafe), false);
  assert.equal(safety.freezeFlowSafe, false);
  assert.equal(safety.unsafeNewlyFrozenCount, 1);
  assert.equal(plan.action, "wait");
});

test("a fresh snapshot rejects a stale route after movement brings inflow into its freeze line", () => {
  const lower = [
    makeNode("lower-a", 150, 300, "red"),
    makeNode("lower-b", 150, 355, "red"),
    makeNode("lower-c", 150, 410, "red")
  ];
  const upper = makeNode("upper-flow", 300, 165, "blue", { vy: 7 });
  const flowStates = {
    "upper-flow": { spawnAgeSec: 0.04, settled: false, recentSpawn: true, upperInflow: true, activeInflow: true, inflowUnsafe: true }
  };
  const game = makeGame([...lower, upper], { lowerPlayableNodeCount: 20, flowStates });
  const before = buildCoronationElsaPlannerSnapshot(game, 6);
  const beforeIndices = lower.map((node) => getCoronationElsaPlannerNodeIndex(before, node.id));
  const beforeSafety = evaluateCoronationElsaFreezeTransitionSafety(before, before.initialState, beforeIndices);

  upper.x = 150;
  const after = buildCoronationElsaPlannerSnapshot(game, 6);
  const afterIndices = lower.map((node) => getCoronationElsaPlannerNodeIndex(after, node.id));
  const afterSafety = evaluateCoronationElsaFreezeTransitionSafety(after, after.initialState, afterIndices);

  assert.equal(beforeSafety.freezeFlowSafe, true);
  assert.equal(afterSafety.freezeFlowSafe, false);
  assert.equal(afterSafety.unsafeNewlyFrozenCount, 1);
});

test("safe lower trace remains selectable while unrelated upper inflow is falling", () => {
  const nodes = [
    makeNode("safe-a", 80, 410, "red"),
    makeNode("safe-b", 135, 410, "red"),
    makeNode("safe-c", 190, 410, "red"),
    makeNode("upper-flow", 340, 165, "blue", { vy: 7 })
  ];
  const game = makeGame(nodes, {
    lowerPlayableNodeCount: 20,
    flowStates: {
      "upper-flow": { spawnAgeSec: 0.04, settled: false, recentSpawn: true, upperInflow: true, activeInflow: true, inflowUnsafe: true }
    }
  });
  const snapshot = buildCoronationElsaPlannerSnapshot(game, 6);
  const adjacency = buildCoronationElsaPlannerAdjacency(game, snapshot);
  const plan = solveCoronationElsaStrongestModePlan(snapshot, adjacency, {
    config: { hardBudgetMs: 1000, softBudgetMs: 1000 }
  });

  assert.equal(plan.action, "trace");
  assert.deepEqual(new Set(plan.chainIds), new Set(["safe-a", "safe-b", "safe-c"]));
  assert.equal(plan.diagnostics.selectedUnsafeNewlyFrozenCount, 0);
  assert.equal(plan.diagnostics.selectedCandidateMinY, 410);
  assert.equal(plan.diagnostics.selectedCandidateMaxY, 410);
  assert.equal(plan.diagnostics.selectedCandidateMeanY, 410);
  assert.equal(plan.diagnostics.selectedCandidateUpperHalfNodeCount, 0);
  assert.equal(plan.diagnostics.selectedCandidateLowerHalfNodeCount, 3);
  assert.equal(plan.diagnostics.activeInflowMinY, 165);
  assert.equal(plan.diagnostics.activeInflowMaxY, 165);
  assert.equal(plan.diagnostics.activeInflowMeanY, 165);
  assert.equal(plan.diagnostics.activeInflowUpperHalfNodeCount, 1);
  assert.equal(plan.diagnostics.activeInflowLowerHalfNodeCount, 0);
});

test("moving lower chain on stable support remains freeze-flow safe", () => {
  const nodes = [
    makeNode("stable-a", 100, 410, "red", { vx: 1.8, vy: 1.4 }),
    makeNode("stable-b", 155, 410, "red", { vx: -1.6, vy: 1.2 }),
    makeNode("stable-c", 210, 410, "red", { vx: 1.4, vy: -1.3 })
  ];
  const supportedMoving = {
    spawnAgeSec: 1,
    settled: false,
    recentSpawn: false,
    supportKind: "stable",
    stableSupport: true,
    dynamicSupport: false,
    genuineFallSpace: false,
    activeInflow: false,
    inflowUnsafe: false
  };
  const game = makeGame(nodes, {
    flowStates: Object.fromEntries(nodes.map((node) => [node.id, supportedMoving]))
  });
  const snapshot = buildCoronationElsaPlannerSnapshot(game, 6);
  const adjacency = buildCoronationElsaPlannerAdjacency(game, snapshot);
  const plan = solveCoronationElsaStrongestModePlan(snapshot, adjacency, {
    config: { hardBudgetMs: 1000, softBudgetMs: 1000 }
  });

  assert.equal(snapshot.flowDiagnostics.stableSupportNodeCount, 3);
  assert.equal(snapshot.flowDiagnostics.settlingOpportunityNodeCount, 3);
  assert.equal(snapshot.flowDiagnostics.pendingGeometryNodeCount, 3);
  assert.equal(snapshot.flowDiagnostics.futureTraceRelevantPendingCount, 3);
  assert.equal(snapshot.inflowUnsafeMask, 0n);
  assert.notEqual(snapshot.settlingOpportunityMask, 0n);
  assert.equal(snapshot.flowDiagnostics.activeInflowNodeCount, 0);
  assert.equal(snapshot.flowDiagnostics.inflowUnsafeNodeCount, 0);
  assert.equal(plan.action, "trace");
});

test("TAP diagnostics compare pending geometry with the current Coronation ice when no trace is selected", () => {
  const ice = makeNode("ice", 260, 430, "blue");
  const pending = makeNode("pending", 260, 180, "red", { vy: 2 });
  const game = makeGame([ice, pending], {
    coronationLayers: { ice: 1 },
    flowStates: {
      pending: {
        settled: false, stableSupport: true, dynamicSupport: false,
        genuineFallSpace: false, activeInflow: false, inflowUnsafe: false
      }
    }
  });
  const snapshot = buildCoronationElsaPlannerSnapshot(game, 6);
  const adjacency = buildCoronationElsaPlannerAdjacency(game, snapshot);
  const plan = solveCoronationElsaStrongestModePlan(snapshot, adjacency, {
    config: { hardBudgetMs: 1000, softBudgetMs: 1000 }
  });
  assert.equal(plan.action, "tap");
  assert.equal(plan.diagnostics.selectedCandidateMeanY, null);
  assert.equal(plan.diagnostics.coronationFrozenMeanY, 430);
  assert.equal(plan.diagnostics.pendingGeometryAboveFrozenMeanCount, 1);
  assert.equal(plan.diagnostics.settlingOpportunityAboveFrozenCount, 1);
});

test("Phase A keeps temporary unsafe nodes as future structural trace potential", () => {
  const safeNodes = [
    makeNode("safe-a", 80, 410, "safe"),
    makeNode("safe-b", 135, 410, "safe"),
    makeNode("safe-c", 190, 410, "safe")
  ];
  const flowNodes = [
    makeNode("flow-a", 330, 170, "flow", { vy: 7 }),
    makeNode("flow-b", 385, 170, "flow", { vy: 7 }),
    makeNode("flow-c", 440, 170, "flow", { vy: 7 })
  ];
  const falling = {
    spawnAgeSec: 0.05,
    settled: false,
    recentSpawn: true,
    supportKind: "fall-space",
    stableSupport: false,
    dynamicSupport: false,
    genuineFallSpace: true,
    activeInflow: true,
    inflowUnsafe: true
  };
  const game = makeGame([...safeNodes, ...flowNodes], {
    lowerPlayableNodeCount: 20,
    flowStates: Object.fromEntries(flowNodes.map((node) => [node.id, falling]))
  });
  const snapshot = buildCoronationElsaPlannerSnapshot(game, 6);
  const adjacency = buildCoronationElsaPlannerAdjacency(game, snapshot);
  const plan = solveCoronationElsaStrongestModePlan(snapshot, adjacency, {
    config: { hardBudgetMs: 1000, softBudgetMs: 1000 }
  });

  assert.equal(plan.action, "trace");
  assert.deepEqual(new Set(plan.chainIds), new Set(safeNodes.map((node) => node.id)));
  assert.equal(plan.maxAdditionalTraces, 2);
  assert.equal(plan.routeChainIds.length, 2);
  assert.deepEqual(new Set(plan.routeChainIds[1]), new Set(flowNodes.map((node) => node.id)));
  assert.ok(plan.diagnostics.unsafeTransitionRejectedCount > 0);
  assert.ok(plan.diagnostics.futureTemporarilyUnsafeCandidateCount > 0);

  let clockCalls = 0;
  const beamPlan = solveCoronationElsaStrongestModePlan(snapshot, adjacency, {
    now: () => (clockCalls++ === 0 ? 0 : 5),
    config: { hardBudgetMs: 10, exactBudgetMs: 4, softBudgetMs: 4 }
  });
  assert.equal(beamPlan.mode, "beam");
  assert.equal(beamPlan.action, "trace");
  assert.deepEqual(new Set(beamPlan.chainIds), new Set(safeNodes.map((node) => node.id)));
  assert.equal(beamPlan.maxAdditionalTraces, 2);
  assert.ok(beamPlan.diagnostics.futureTemporarilyUnsafeCandidateCount > 0);
});

test("five supported trace groups remain projected before the first ice tap", () => {
  const nodes = [];
  const links = new Set();
  const supportedMoving = {
    spawnAgeSec: 1,
    settled: false,
    recentSpawn: false,
    supportKind: "stable",
    stableSupport: true,
    activeInflow: false,
    inflowUnsafe: false
  };
  for (let group = 0; group < 5; group += 1) {
    const type = `group-${group}`;
    const x = 50 + group * 200;
    const groupNodes = [
      makeNode(`${type}-a`, x, 300, type, { vx: 1.4 }),
      makeNode(`${type}-b`, x, 355, type, { vy: 1.5 }),
      makeNode(`${type}-c`, x, 410, type, { vx: -1.3 })
    ];
    nodes.push(...groupNodes);
    for (let index = 0; index < groupNodes.length - 1; index += 1) {
      links.add(`${groupNodes[index].id}:${groupNodes[index + 1].id}`);
      links.add(`${groupNodes[index + 1].id}:${groupNodes[index].id}`);
    }
  }
  const game = makeGame(nodes, {
    links,
    flowStates: Object.fromEntries(nodes.map((node) => [node.id, supportedMoving]))
  });
  const snapshot = buildCoronationElsaPlannerSnapshot(game, 6);
  const adjacency = buildCoronationElsaPlannerAdjacency(game, snapshot);
  const plan = solveCoronationElsaStrongestModePlan(snapshot, adjacency, {
    config: { hardBudgetMs: 1000, softBudgetMs: 1000 }
  });

  assert.equal(plan.action, "trace");
  assert.equal(plan.maxAdditionalTraces, 5);
  assert.equal(plan.routeChainIds.length, 5);
});

test("ice taps without waiting when no legal root trace is flow-blocked", () => {
  const nodes = [
    makeNode("ice", 100, 500, "blue"),
    makeNode("single-flow", 200, 170, "red", { vy: 8 })
  ];
  const game = makeGame(nodes, {
    coronationLayers: { ice: 1 },
    flowStates: {
      "single-flow": {
        settled: false,
        supportKind: "fall-space",
        genuineFallSpace: true,
        activeInflow: true,
        inflowUnsafe: true
      }
    }
  });
  const snapshot = buildCoronationElsaPlannerSnapshot(game, 6);
  const adjacency = buildCoronationElsaPlannerAdjacency(game, snapshot);
  const plan = solveCoronationElsaStrongestModePlan(snapshot, adjacency, {
    config: { hardBudgetMs: 1000, softBudgetMs: 1000 }
  });

  assert.equal(plan.diagnostics.rootLegalTraceCandidateCount, 0);
  assert.equal(plan.action, "tap");
});

test("board refill waits separately when no ice or legal trace exists", () => {
  const node = makeNode("single-flow", 200, 170, "red", { vy: 8 });
  const game = makeGame([node], {
    flowStates: {
      "single-flow": {
        settled: false,
        supportKind: "fall-space",
        genuineFallSpace: true,
        activeInflow: true,
        inflowUnsafe: true
      }
    }
  });
  const snapshot = buildCoronationElsaPlannerSnapshot(game, 6);
  const adjacency = buildCoronationElsaPlannerAdjacency(game, snapshot);
  const plan = solveCoronationElsaStrongestModePlan(snapshot, adjacency, {
    config: { hardBudgetMs: 1000, softBudgetMs: 1000 }
  });

  assert.equal(plan.action, "wait");
  assert.equal(plan.waitReason, "WAIT_FOR_BOARD_REFILL");
});

test("condition-based wait releases immediately when the same upper chain becomes safe", () => {
  const nodes = [
    makeNode("flow-a", 100, 170),
    makeNode("flow-b", 155, 170),
    makeNode("flow-c", 210, 170),
    makeNode("ice", 350, 500, "blue")
  ];
  const falling = { spawnAgeSec: 0.05, settled: false, recentSpawn: true, upperInflow: true, activeInflow: true, inflowUnsafe: true };
  const flowStates = { "flow-a": falling, "flow-b": falling, "flow-c": falling };
  const game = makeGame(nodes, { coronationLayers: { ice: 1 }, lowerPlayableNodeCount: 20, flowStates });
  const firstSnapshot = buildCoronationElsaPlannerSnapshot(game, 6);
  const firstAdjacency = buildCoronationElsaPlannerAdjacency(game, firstSnapshot);
  const first = solveCoronationElsaStrongestModePlan(firstSnapshot, firstAdjacency, {
    config: { hardBudgetMs: 1000, softBudgetMs: 1000 }
  });
  for (const id of ["flow-a", "flow-b", "flow-c"]) {
    flowStates[id] = { spawnAgeSec: 0.4, settled: true, recentSpawn: false, upperInflow: false, activeInflow: false, inflowUnsafe: false };
  }
  const secondSnapshot = buildCoronationElsaPlannerSnapshot(game, 6);
  const secondAdjacency = buildCoronationElsaPlannerAdjacency(game, secondSnapshot);
  const second = solveCoronationElsaStrongestModePlan(secondSnapshot, secondAdjacency, {
    config: { hardBudgetMs: 1000, softBudgetMs: 1000 }
  });

  assert.equal(first.action, "wait");
  assert.equal(second.action, "trace");
});

test("settled upper chain remains usable when the lower board is filled", () => {
  const nodes = [
    makeNode("upper-a", 100, 170),
    makeNode("upper-b", 155, 170),
    makeNode("upper-c", 210, 170)
  ];
  const game = makeGame(nodes, { lowerPlayableNodeCount: 35 });
  const snapshot = buildCoronationElsaPlannerSnapshot(game, 6);
  const adjacency = buildCoronationElsaPlannerAdjacency(game, snapshot);
  const plan = solveCoronationElsaStrongestModePlan(snapshot, adjacency, {
    config: { hardBudgetMs: 1000, softBudgetMs: 1000 }
  });

  assert.equal(plan.action, "trace");
  assert.equal(plan.chainIds.length, 3);
});

test("existing upper Coronation ice without active inflow taps instead of waiting", () => {
  const nodes = [makeNode("upper-ice", 150, 165)];
  const game = makeGame(nodes, { coronationLayers: { "upper-ice": 1 }, lowerPlayableNodeCount: 10 });
  const snapshot = buildCoronationElsaPlannerSnapshot(game, 6);
  const adjacency = buildCoronationElsaPlannerAdjacency(game, snapshot);
  const plan = solveCoronationElsaStrongestModePlan(snapshot, adjacency, {
    config: { hardBudgetMs: 1000, softBudgetMs: 1000 }
  });

  assert.equal(snapshot.flowDiagnostics.activeInflowNodeCount, 0);
  assert.equal(plan.action, "tap");
  assert.equal(plan.tapNodeId, "upper-ice");
});

test("terminal solver traces every reachable isolated triple before tapping ice", () => {
  const nodes = [];
  const links = new Set();
  for (let group = 0; group < 3; group += 1) {
    const type = `type-${group}`;
    const x = 55 + group * 150;
    const groupNodes = [
      makeNode(`${type}-a`, x, 160, type),
      makeNode(`${type}-b`, x, 215, type),
      makeNode(`${type}-c`, x, 270, type)
    ];
    nodes.push(...groupNodes);
    for (let first = 0; first < groupNodes.length; first += 1) {
      for (let second = 0; second < groupNodes.length; second += 1) {
        if (first !== second) links.add(`${groupNodes[first].id}:${groupNodes[second].id}`);
      }
    }
  }
  const game = makeGame(nodes, { links, myTsumId: "type-2" });
  const snapshot = buildCoronationElsaPlannerSnapshot(game, 6);
  const adjacency = buildCoronationElsaPlannerAdjacency(game, snapshot);
  const first = solveCoronationElsaStrongestModePlan(snapshot, adjacency, {
    config: { hardBudgetMs: 1000, softBudgetMs: 1000 }
  });
  const second = solveCoronationElsaStrongestModePlan(snapshot, adjacency, {
    config: { hardBudgetMs: 1000, softBudgetMs: 1000 }
  });

  assert.equal(first.mode, "exact");
  assert.equal(first.action, "trace");
  assert.equal(first.maxAdditionalTraces, 3);
  assert.equal(first.routeChainIds.length, 3);
  assert.deepEqual(first.chainIds, second.chainIds);
  assert.deepEqual(first.routeChainIds, second.routeChainIds);
});

test("terminal solver immediately taps the best component when no legal trace remains", () => {
  const nodes = [
    makeNode("my", 70, 250, "red"),
    makeNode("other", 340, 250, "blue")
  ];
  const game = makeGame(nodes, {
    coronationLayers: { my: 1, other: 1 },
    myTsumId: "red"
  });
  const snapshot = buildCoronationElsaPlannerSnapshot(game, 6);
  const adjacency = buildCoronationElsaPlannerAdjacency(game, snapshot);
  const plan = solveCoronationElsaStrongestModePlan(snapshot, adjacency, {
    config: { hardBudgetMs: 1000, softBudgetMs: 1000 }
  });

  assert.equal(plan.action, "tap");
  assert.equal(plan.maxAdditionalTraces, 0);
  assert.equal(plan.tapNodeId, "my");
  assert.equal(plan.terminal.physicalMyTsumCount, 1);
});

test("equal-coin terminal components prefer the one with more physical MyTsum", () => {
  const nodes = [
    makeNode("other", 70, 250, "blue"),
    makeNode("my", 340, 250, "red")
  ];
  const game = makeGame(nodes, {
    coronationLayers: { other: 1, my: 1 },
    myTsumId: "red"
  });
  const snapshot = buildCoronationElsaPlannerSnapshot(game, 6);
  const adjacency = buildCoronationElsaPlannerAdjacency(game, snapshot);
  const plan = solveCoronationElsaStrongestModePlan(snapshot, adjacency, {
    config: { hardBudgetMs: 1000, softBudgetMs: 1000 }
  });

  assert.equal(plan.terminal.rawCoins, 0);
  assert.equal(plan.terminal.effectiveClearCount, 1);
  assert.equal(plan.tapNodeId, "my");
});

test("terminal tap evaluator includes layered and large-Tsum effective clear units", () => {
  const nodes = [
    makeNode("large", 150, 250, "red", { isLarge: true, radius: 43.5 }),
    makeNode("normal", 220, 250, "blue")
  ];
  const game = makeGame(nodes, {
    coronationLayers: { large: 2, normal: 1 },
    myTsumId: "red"
  });
  const snapshot = buildCoronationElsaPlannerSnapshot(game, 6);
  const terminal = evaluateCoronationElsaTapComponents(snapshot, snapshot.initialState).best;

  assert.equal(terminal.connectedFrozenCount, 2);
  assert.equal(terminal.additionalClearCount, 1);
  assert.equal(terminal.effectiveClearCount, 7);
  assert.equal(terminal.physicalTargetCount, 2);
  assert.equal(terminal.physicalMyTsumCount, 1);
  assert.ok(terminal.rawCoins >= 0);
});

test("terminal component evaluation recognizes a frozen bridge", () => {
  const nodes = [
    makeNode("left", 100, 260),
    makeNode("bridge", 175, 260),
    makeNode("right", 250, 260)
  ];
  const game = makeGame(nodes, { coronationLayers: { left: 1, right: 1 } });
  const snapshot = buildCoronationElsaPlannerSnapshot(game, 6);
  assert.equal(evaluateCoronationElsaTapComponents(snapshot, snapshot.initialState).components.length, 2);
  const bridgedState = Object.freeze({
    frozenMask: snapshot.initialState.frozenMask | (1n << BigInt(getCoronationElsaPlannerNodeIndex(snapshot, "bridge"))),
    freezeLayerCounts: Object.freeze([1, 1, 1])
  });
  const bridged = evaluateCoronationElsaTapComponents(snapshot, bridgedState);
  assert.equal(bridged.components.length, 1);
  assert.equal(bridged.best.connectedFrozenCount, 3);
});

test("hard-budget timeout switches to deterministic adaptive beam mode", () => {
  const nodes = [
    makeNode("a", 100, 220),
    makeNode("b", 150, 220),
    makeNode("c", 200, 220)
  ];
  const game = makeGame(nodes);
  const snapshot = buildCoronationElsaPlannerSnapshot(game, 6);
  const adjacency = buildCoronationElsaPlannerAdjacency(game, snapshot);
  let calls = 0;
  const plan = solveCoronationElsaStrongestModePlan(snapshot, adjacency, {
    now: () => (calls++ === 0 ? 0 : 5),
    config: { hardBudgetMs: 10, exactBudgetMs: 4, softBudgetMs: 4 }
  });

  assert.equal(plan.mode, "beam");
  assert.equal(plan.action, "trace");
  assert.equal(plan.maxAdditionalTraces, 1);
  assert.equal(plan.diagnostics.exactTimedOut, true);
});

test("outer deadline returns WAIT instead of tapping when no safe candidate was confirmed", () => {
  const frozen = makeNode("ice", 180, 300);
  const game = makeGame([frozen], { coronationLayers: { ice: 1 } });
  const snapshot = buildCoronationElsaPlannerSnapshot(game, 6);
  const adjacency = buildCoronationElsaPlannerAdjacency(game, snapshot);
  let calls = 0;
  const plan = solveCoronationElsaStrongestModePlan(snapshot, adjacency, {
    now: () => (calls++ === 0 ? 0 : 9),
    config: { hardBudgetMs: 8, exactBudgetMs: 4, softBudgetMs: 4 }
  });

  assert.equal(plan.action, "wait");
  assert.equal(plan.waitReason, "WAIT_FOR_PLANNER_BUDGET");
  assert.equal(plan.diagnostics.budgetTimedOut, true);
  assert.equal(plan.tapNodeId, null);
});

test("outer deadline returns the best confirmed safe trace instead of tapping", () => {
  const nodes = [
    makeNode("a", 100, 220),
    makeNode("b", 150, 220),
    makeNode("c", 200, 220)
  ];
  const game = makeGame(nodes);
  const snapshot = buildCoronationElsaPlannerSnapshot(game, 6);
  const adjacency = buildCoronationElsaPlannerAdjacency(game, snapshot);
  let expired = false;
  let firstClockCall = true;
  const plan = solveCoronationElsaStrongestModePlan(snapshot, adjacency, {
    now: () => {
      if (firstClockCall) {
        firstClockCall = false;
        return 0;
      }
      return expired ? 9 : 1;
    },
    onBestSafeCandidate: () => {
      expired = true;
    },
    config: { hardBudgetMs: 8, exactBudgetMs: 4, softBudgetMs: 4 }
  });

  assert.equal(plan.action, "trace");
  assert.deepEqual(new Set(plan.chainIds), new Set(nodes.map((node) => node.id)));
  assert.equal(plan.diagnostics.budgetTimedOut, true);
  assert.equal(plan.diagnostics.bestSoFarUsed, true);
  assert.equal(plan.tapNodeId, null);
});

test("adaptive beam configuration covers depths 1 through 15 and all three rollouts", () => {
  assert.equal(CORONATION_ELSA_PLANNER_CONFIG.opportunityWaitMaxMs, 1000 / 15);
  assert.equal(CORONATION_ELSA_PLANNER_CONFIG.hardBudgetMs, 8);
  assert.equal(CORONATION_ELSA_PLANNER_CONFIG.exactBudgetMs, 4);
  assert.equal(CORONATION_ELSA_PLANNER_CONFIG.targetBudgetMs, 4.5);
  assert.equal(CORONATION_ELSA_PLANNER_CONFIG.finalizationReserveMs, 1.25);
  assert.equal(CORONATION_ELSA_PLANNER_CONFIG.rolloutTopChildren, 4);
  assert.deepEqual(CORONATION_ELSA_PLANNER_CONFIG.beamWidths, [
    { minDepth: 1, maxDepth: 6, width: 48 },
    { minDepth: 7, maxDepth: 10, width: 24 },
    { minDepth: 11, maxDepth: 15, width: 8 }
  ]);
  assert.deepEqual(CORONATION_ELSA_PLANNER_CONFIG.rolloutPolicies, [
    "min-new-frozen",
    "max-next-three-chain-nodes",
    "max-existing-ice-concentration"
  ]);
  assert.equal(CORONATION_ELSA_PLANNER_CONFIG.maxTraceDepth, 15);
});

test("equivalent three- and six-chains keep the deterministic shorter representative", () => {
  const nodes = Array.from({ length: 6 }, (_, index) => (
    makeNode(`line-${index}`, 50 + index * 55, 230)
  ));
  const game = makeGame(nodes);
  const snapshot = buildCoronationElsaPlannerSnapshot(game, 6);
  const adjacency = buildCoronationElsaPlannerAdjacency(game, snapshot);
  const plan = solveCoronationElsaStrongestModePlan(snapshot, adjacency, {
    config: { hardBudgetMs: 1000, softBudgetMs: 1000 }
  });

  assert.equal(plan.maxAdditionalTraces, 1);
  assert.equal(plan.chainIds.length, 3);
  assert.equal(plan.diagnostics.selectedNextFrozenCount, 6);
});

test("Phase A chooses a six-trace future over an edge-aligned four-trace freeze", () => {
  const nodes = [
    makeNode("bad-a", 5, 100, "bad"),
    makeNode("bad-b", 55, 100, "bad"),
    makeNode("bad-c", 105, 100, "bad")
  ];
  const links = new Set([
    "bad-a:bad-b", "bad-b:bad-a", "bad-b:bad-c", "bad-c:bad-b"
  ]);
  const xs = [70, 125, 180, 235, 290, 345];
  for (let group = 0; group < 6; group += 1) {
    const type = `safe-${group}`;
    const damagedByBadLine = group < 3;
    const y = damagedByBadLine ? 130 : 210;
    const groupNodes = [
      makeNode(`${type}-a`, xs[group], y, type),
      makeNode(`${type}-b`, xs[group], y + 55, type),
      makeNode(`${type}-c`, xs[group], y + 110, type)
    ];
    nodes.push(...groupNodes);
    for (let first = 0; first < groupNodes.length; first += 1) {
      for (let second = 0; second < groupNodes.length; second += 1) {
        if (first !== second) links.add(`${groupNodes[first].id}:${groupNodes[second].id}`);
      }
    }
  }
  const game = makeGame(nodes, { links, myTsumId: "safe-5" });
  const snapshot = buildCoronationElsaPlannerSnapshot(game, 6);
  const adjacency = buildCoronationElsaPlannerAdjacency(game, snapshot);
  const plan = solveCoronationElsaStrongestModePlan(snapshot, adjacency, {
    config: { hardBudgetMs: 1000, softBudgetMs: 1000 }
  });
  const badCandidate = enumerateCoronationElsaPlannerTraces(snapshot, adjacency, snapshot.initialState, {
    lengths: [3], dedupeByNextFrozenMask: false
  }).candidates.find((candidate) => candidate.chainIds.every((id) => String(id).startsWith("bad-")));
  const badTransition = simulateCoronationElsaFreeze(snapshot, snapshot.initialState, badCandidate.chainIndices);
  const afterBadSnapshot = Object.freeze({
    ...snapshot,
    initialState: Object.freeze({
      frozenMask: badTransition.nextFrozenMask,
      freezeLayerCounts: badTransition.nextFreezeLayerCounts
    })
  });
  const afterBad = solveCoronationElsaStrongestModePlan(afterBadSnapshot, adjacency, {
    config: { hardBudgetMs: 1000, softBudgetMs: 1000 }
  });

  assert.equal(1 + afterBad.maxAdditionalTraces, 4);
  assert.equal(plan.maxAdditionalTraces, 6);
  assert.equal(plan.chainIds.some((id) => String(id).startsWith("bad-")), false);
  assert.ok(plan.diagnostics.selectedNextFrozenCount < popcountForTest(badTransition.nextFrozenMask));
});

test("Phase B permits a four-chain when depth is equal and its real terminal coin is higher", () => {
  const nodes = [
    makeNode("a", 72, 100),
    makeNode("b", 150, 100),
    makeNode("c", 200, 100),
    makeNode("d", 200, 178)
  ];
  const links = new Set(["a:b", "b:c", "c:d"]);
  const game = makeGame(nodes, {
    links,
    canConnectWithChainRule: (_rule, from, candidate) => links.has(`${from.id}:${candidate.id}`)
  });
  const snapshot = buildCoronationElsaPlannerSnapshot(game, 6);
  const adjacency = buildCoronationElsaPlannerAdjacency(game, snapshot);
  const plan = solveCoronationElsaStrongestModePlan(snapshot, adjacency, {
    config: { hardBudgetMs: 1000, softBudgetMs: 1000 }
  });

  assert.equal(plan.maxAdditionalTraces, 1);
  assert.deepEqual(plan.chainIds, ["a", "b", "c", "d"]);
  assert.equal(plan.diagnostics.selectedFirstChainLength, 4);
  assert.equal(plan.terminal.effectiveClearCount, 4);
  assert.equal(plan.terminal.rawCoins, 1);
});
