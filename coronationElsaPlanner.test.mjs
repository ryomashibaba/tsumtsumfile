import assert from "node:assert/strict";
import test from "node:test";

import { Game, coronationElsaSkillHandler } from "./game.js";
import { normalizeCheatSettings } from "./cheatSettings.js";
import {
  CORONATION_ELSA_PLANNER_CONFIG,
  buildCoronationElsaPlannerAdjacency,
  buildCoronationElsaPlannerSnapshot,
  enumerateCoronationElsaPlannerTraces,
  evaluateCoronationElsaIceTapReadiness,
  evaluateCoronationElsaFinalTraceSettleRisk,
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
    cheatSettings: normalizeCheatSettings(options.cheatSettings),
    isCheatActive: () => !!options.cheatSettings?.enabled,
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

test("Coronation Elsa line and frozen-neighbor radii independently control prediction and actual freeze", () => {
  const makeScenario = (cheatSettings) => {
    const nodes = [
      makeNode("a", 100, 220),
      makeNode("b", 150, 220),
      makeNode("c", 200, 220),
      makeNode("line-only", 270, 250),
      makeNode("prior", 300, 400),
      makeNode("surround-only", 300, 455)
    ];
    return makeGame(nodes, { coronationLayers: { prior: 1 }, cheatSettings });
  };
  for (const [lineRadius, surroundRadius, expectedLine, expectedSurround] of [
    [20, 70, false, true],
    [40, 20, true, false]
  ]) {
    const game = makeScenario({ enabled: true, coronationElsaLineRadius: lineRadius, coronationElsaSurroundRadius: surroundRadius });
    const snapshot = buildCoronationElsaPlannerSnapshot(game, 6);
    assert.equal(snapshot.lineRadius, lineRadius);
    assert.equal(snapshot.surroundRadius, surroundRadius);
    const chain = game.tsums.slice(0, 3);
    const chainIndices = chain.map((node) => getCoronationElsaPlannerNodeIndex(snapshot, node.id));
    const simulated = simulateCoronationElsaFreeze(snapshot, snapshot.initialState, chainIndices);
    const predictedIds = simulated.targetIndices.map((index) => snapshot.nodes[index].id);
    assert.equal(predictedIds.includes("line-only"), expectedLine);
    assert.equal(predictedIds.includes("surround-only"), expectedSurround);
    let appliedIds = [];
    const ctx = {
      game,
      board: game.boardState,
      level: 6,
      applyFreeze(ids) { appliedIds = ids.slice(); }
    };
    assert.equal(coronationElsaSkillHandler.onChainCommit(ctx, { id: "session" }, chain), true);
    assert.deepEqual(appliedIds, predictedIds);
  }
  const disabled = makeScenario({ enabled: false, coronationElsaLineRadius: 0, coronationElsaSurroundRadius: 0 });
  const defaultSnapshot = buildCoronationElsaPlannerSnapshot(disabled, 6);
  assert.equal(defaultSnapshot.lineRadius, 78 * 0.58);
  assert.equal(defaultSnapshot.surroundRadius, 78);
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

test("ICE_TAP_READY ignores a falling Tsum that is far above the actual tap corridor", () => {
  const nodes = [
    makeNode("ice-a", 120, 420, "red"),
    makeNode("ice-b", 175, 420, "red"),
    makeNode("falling-singleton", 150, 190, "blue", { vy: 18 })
  ];
  const game = makeGame(nodes, {
    coronationLayers: { "ice-a": 1, "ice-b": 1 },
    flowStates: {
      "falling-singleton": {
        settled: false,
        recentSpawn: false,
        activeInflow: true,
        inflowUnsafe: true,
        dynamicSupport: true
      }
    }
  });
  const snapshot = buildCoronationElsaPlannerSnapshot(game, 6, {
    temporalPositions: new Map([["falling-singleton", { x: 150, y: 175 }]])
  });
  assert.equal(snapshot.flowDiagnostics.futureTraceRelevantPendingCount, 0);
  const readiness = evaluateCoronationElsaIceTapReadiness(snapshot, "ice-a");
  assert.equal(readiness.physicallyReady, true);
  assert.equal(readiness.activeInflowCount, 0);
  assert.equal(readiness.positionDeltaCount, 0);
  assert.equal(readiness.aboveFrozenRegionCount, 0);
});

test("ICE_TAP_READY detects motion around the ice and immediately accepts an initially stable board", () => {
  const movingNodes = [
    makeNode("ice", 150, 420, "red"),
    makeNode("moving-near", 208, 430, "blue", { vx: -4 })
  ];
  const movingGame = makeGame(movingNodes, {
    coronationLayers: { ice: 1 },
    flowStates: {
      "moving-near": { settled: false, activeInflow: false, stableSupport: true }
    }
  });
  const movingSnapshot = buildCoronationElsaPlannerSnapshot(movingGame, 6, {
    temporalPositions: new Map([["moving-near", { x: 200, y: 430 }]])
  });
  const blocked = evaluateCoronationElsaIceTapReadiness(movingSnapshot, "ice");
  assert.equal(blocked.physicallyReady, false);
  assert.equal(blocked.aroundFrozenComponentCount, 1);
  assert.equal(blocked.meaningfulMotionCount, 1);

  movingNodes[1].vx = 0;
  movingGame.getStrongestModeCoronationElsaFlowSafetyState = () => Object.freeze({
    spawnAgeSec: 10,
    settled: true,
    recentSpawn: false,
    upperInflow: false,
    activeInflow: false,
    inflowUnsafe: false,
    stableSupport: true
  });
  const stableSnapshot = buildCoronationElsaPlannerSnapshot(movingGame, 6, {
    temporalPositions: new Map([["moving-near", { x: 210, y: 430 }]])
  });
  const ready = evaluateCoronationElsaIceTapReadiness(stableSnapshot, "ice");
  assert.equal(ready.physicallyReady, true);
  assert.equal(ready.relevantUnstableCount, 0);
});

test("final-trace settle risk waits only for unsettled nodes that can change freeze or tap impact", () => {
  const chain = [
    makeNode("a", 100, 420),
    makeNode("b", 155, 420),
    makeNode("c", 210, 420)
  ];
  const related = makeNode("related", 155, 370, "blue", { vy: 5 });
  const far = makeNode("far", 430, 180, "blue", { vy: 18 });
  const game = makeGame([...chain, related, far], {
    flowStates: {
      related: { settled: false, stableSupport: true, activeInflow: false },
      far: { settled: false, dynamicSupport: true, activeInflow: true }
    }
  });
  const snapshot = buildCoronationElsaPlannerSnapshot(game, 6, {
    temporalPositions: new Map([["related", { x: 155, y: 365 }], ["far", { x: 430, y: 162 }]])
  });
  const risk = evaluateCoronationElsaFinalTraceSettleRisk(snapshot, snapshot.initialState, [0, 1, 2]);
  assert.equal(risk.shouldWait, true);
  assert.ok(risk.relatedNodeIds.includes("related"));
  assert.equal(risk.relatedNodeIds.includes("far"), false);
  assert.ok(risk.maxVelocity >= 5);
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

test("streaming enumeration confirms a safe trace before enumerating the remaining dense paths", () => {
  const game = makeGame(Array.from({ length: 100 }, (_, i) => makeNode(`dense-${i}`, 100 + i % 10, 300 + Math.floor(i / 10))));
  const snapshot = buildCoronationElsaPlannerSnapshot(game, 6);
  const adjacency = buildCoronationElsaPlannerAdjacency(game, snapshot);
  let confirmed = false;
  const result = enumerateCoronationElsaPlannerTraces(snapshot, adjacency, snapshot.initialState, {
    lengths: [3, 4, 5, 6], shouldAbort: () => confirmed,
    onSafeCandidate: () => { confirmed = true; }
  });
  assert.equal(result.aborted, true);
  assert.equal(result.rawCandidateCount, 1);
  assert.equal(result.safeTraceCandidateCount, 1);
});

test("large-board progressive search resumes beyond leading starts after repeated budget expiry", () => {
  const nodes = Array.from({ length: 97 }, (_, i) => makeNode(`single-${i}`, 350, 500, `single-${i}`));
  nodes.push(makeNode("late-a", 70, 300), makeNode("late-b", 100, 300), makeNode("late-c", 130, 300));
  const game = makeGame(nodes);
  const snapshot = buildCoronationElsaPlannerSnapshot(game, 6);
  const adjacency = buildCoronationElsaPlannerAdjacency(game, snapshot);
  const continuation = {};
  let plan;
  let waits = 0;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    let ticks = 0;
    plan = solveCoronationElsaStrongestModePlan(snapshot, adjacency, {
      continuation, now: () => ticks++, deadlineMs: 35,
      config: { highBodyCandidateLimit: 1 }
    });
    if (plan.action === "trace") break;
    assert.equal(plan.waitReason, "WAIT_FOR_PLANNER_BUDGET");
    waits += 1;
  }
  assert.ok(waits > 0);
  assert.equal(plan.action, "trace");
  assert.deepEqual(new Set(plan.chainIds), new Set(["late-a", "late-b", "late-c"]));
});

test("an incomplete adjacency waits and resumes instead of declaring that no trace exists", () => {
  const game = makeGame(Array.from({ length: 100 }, (_, i) => makeNode(`node-${i}`, 100 + i, 300)));
  const snapshot = buildCoronationElsaPlannerSnapshot(game, 6);
  const continuation = {};
  let adjacency;
  let waits = 0;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    let checks = 0;
    adjacency = buildCoronationElsaPlannerAdjacency(game, snapshot, { continuation, shouldAbort: () => ++checks > 20 });
    if (!adjacency.aborted) break;
    const plan = solveCoronationElsaStrongestModePlan(snapshot, adjacency);
    assert.equal(plan.action, "wait");
    assert.equal(plan.diagnostics.timeoutStage, "adjacency");
    waits += 1;
  }
  assert.ok(waits > 0);
  assert.equal(adjacency.aborted, false);
  assert.ok(adjacency.contexts[0].neighborsByNode[0].length > 0);
  assert.equal(buildCoronationElsaPlannerAdjacency(game, snapshot, { continuation }), adjacency);
});

test("spatial adjacency matches exact live rules for small, mixed, large and unlimited-distance Tsums", () => {
  const nodes = Array.from({ length: 120 }, (_, i) => makeNode(`node-${i}`, (i % 12) * 36, Math.floor(i / 12) * 45, `type-${i % 3}`, {
    radius: [0.5, 5, 14.5, 29, 43.5][i % 5]
  }));
  for (const unlimitedDistance of [false, true]) {
    const game = makeGame(nodes, {
      getChainBehaviorForStart: (node) => ({ mode: "normal", allowedTypeIds: new Set([node.type.id]), unlimitedDistance })
    });
    game.canConnectWithChainRule = Game.prototype.canConnectWithChainRule;
    const snapshot = buildCoronationElsaPlannerSnapshot(game, 6);
    const brute = buildCoronationElsaPlannerAdjacency(game, snapshot);
    game.getChainConnectionSearchRadius = Game.prototype.getChainConnectionSearchRadius;
    const spatial = buildCoronationElsaPlannerAdjacency(game, snapshot);
    assert.deepEqual(spatial, brute);
  }
});

test("dense cheat boards retain safe progress and prediction/commit parity across count, radius, gravity and spawn modes", () => {
  for (const count of [45, 100, 200, 500, 999]) {
    for (const diameter of [100, 58, 29, 10, 1]) {
      for (const gravityMultiplier of [0.1, 1, 5, 10]) {
        for (const spawnRate of ["instant", 30]) {
          const spacing = Math.min(12, diameter);
          const nodes = Array.from({ length: count }, (_, i) => makeNode(`n-${i}`, 50 + (i % 25) * spacing,
            300 + Math.floor(i / 25) * Math.min(6, spacing),
            i < 3 ? "red" : (count < 81 ? `single-${i}` : `type-${i % 5}`),
            { radius: diameter / 2, vy: gravityMultiplier, vx: gravityMultiplier * 0.2 }));
          const flowStates = Object.fromEntries(nodes.map((node) => [node.id, { settled: false, stableSupport: true }]));
          const game = makeGame(nodes, {
            flowStates, cheatSettings: { enabled: true, boardTarget: count, tsumDiameter: diameter, gravityMultiplier, spawnRate }
          });
          game.canConnectWithChainRule = Game.prototype.canConnectWithChainRule;
          game.getChainConnectionSearchRadius = Game.prototype.getChainConnectionSearchRadius;
          const snapshot = buildCoronationElsaPlannerSnapshot(game, 6);
          const adjacency = buildCoronationElsaPlannerAdjacency(game, snapshot);
          const plan = solveCoronationElsaStrongestModePlan(snapshot, adjacency, {
            config: { hardBudgetMs: 1000, softBudgetMs: 1000, highBodyCandidateLimit: 2 }
          });
          assert.equal(plan.action, "trace", JSON.stringify({ count, diameter, gravityMultiplier, spawnRate }));
          assert.equal(plan.diagnostics.selectedUnsafeNewlyFrozenCount, 0);
          const chain = plan.chainIds.map((id) => nodes.find((node) => node.id === id));
          const simulation = simulateCoronationElsaFreeze(snapshot, snapshot.initialState, chain.map((node) => getCoronationElsaPlannerNodeIndex(snapshot, node.id)));
          let frozenIds;
          coronationElsaSkillHandler.onChainCommit({ game, board: game.boardState, level: 6, applyFreeze: (ids) => { frozenIds = ids; } }, { id: "matrix" }, chain);
          assert.deepEqual(frozenIds, simulation.targetIndices.map((index) => nodes[index].id));
        }
      }
    }
  }
});

test("a large board only uses budget-expiry tap fallback when ice exists and the caller's wait has expired", () => {
  const nodes = Array.from({ length: 100 }, (_, i) => makeNode(`n-${i}`, 100 + i % 10, 300));
  for (const hasIce of [false, true]) {
    const game = makeGame(nodes, { coronationLayers: hasIce ? { "n-0": 1 } : {} });
    const snapshot = buildCoronationElsaPlannerSnapshot(game, 6);
    const adjacency = buildCoronationElsaPlannerAdjacency(game, snapshot);
    for (const allowBudgetTap of [false, true]) {
      const plan = solveCoronationElsaStrongestModePlan(snapshot, adjacency, { now: () => 10, deadlineMs: 0, allowBudgetTap });
      assert.equal(plan.action, hasIce && allowBudgetTap ? "tap" : "wait");
      if (plan.action === "tap") assert.equal(plan.tapNodeId, "n-0");
    }
  }
});

test("spatial ice propagation and one-contact splash match a brute-force oracle on large mixed-radius boards", () => {
  for (const diameter of [1, 10, 58]) {
    const nodes = Array.from({ length: 999 }, (_, i) => makeNode(`n-${i}`, 25 + (i % 30) * 12, 180 + Math.floor(i / 30) * 10,
      `type-${i % 5}`, { radius: diameter / 2 * (i % 7 === 0 ? 1.5 : 1), isLarge: i % 7 === 0 }));
    const layers = Object.fromEntries(nodes.filter((_, i) => i % 3 === 0).map((node) => [node.id, 2]));
    const game = makeGame(nodes, { coronationLayers: layers });
    const snapshot = buildCoronationElsaPlannerSnapshot(game, 6);
    const remaining = new Set(snapshot.nodes.filter((node) => node.coronationFrozen).map((node) => node.index));
    const expected = [];
    while (remaining.size) {
      const queue = [remaining.values().next().value];
      remaining.delete(queue[0]);
      for (let head = 0; head < queue.length; head += 1) {
        const a = snapshot.nodes[queue[head]];
        for (const index of Array.from(remaining)) {
          const b = snapshot.nodes[index];
          if (Math.hypot(a.x - b.x, a.y - b.y) <= Math.max(78, a.effectiveRadius + b.effectiveRadius + 3)) {
            remaining.delete(index); queue.push(index);
          }
        }
      }
      const splash = snapshot.nodes.filter((node) => !node.coronationFrozen && queue.filter((index) => {
        const frozen = snapshot.nodes[index];
        return Math.hypot(node.x - frozen.x, node.y - frozen.y) <= node.effectiveRadius + frozen.effectiveRadius + 29 * 0.02;
      }).length === 1).map((node) => node.index);
      expected.push({ component: new Set(queue), targets: new Set(queue.concat(splash)) });
    }
    const evaluation = evaluateCoronationElsaTapComponents(snapshot);
    assert.equal(evaluation.components.length, expected.length);
    for (const component of evaluation.components) {
      const oracle = expected.find((entry) => entry.component.has(component.tapNodeIndex));
      assert.deepEqual(new Set(component.componentIndices), oracle.component);
      assert.deepEqual(new Set(component.targetIndices), oracle.targets);
      assert.equal(component.additionalClearCount, oracle.component.size);
    }
  }
});

test("zero and maximum freeze-radius overrides preserve the exact frozen-neighbor expansion on a 999-body board", () => {
  const nodes = Array.from({ length: 999 }, (_, i) => makeNode(`n-${i}`, 40 + (i % 30) * 10, 280 + Math.floor(i / 30) * 6,
    `type-${i % 5}`, { radius: 0.5 }));
  for (const lineRadius of [0, 999]) {
    for (const surroundRadius of [0, 999]) {
      const game = makeGame(nodes, { coronationLayers: { "n-900": 2, "n-950": 1 },
        cheatSettings: { enabled: true, coronationElsaLineRadius: lineRadius, coronationElsaSurroundRadius: surroundRadius } });
      const snapshot = buildCoronationElsaPlannerSnapshot(game, 6);
      const simulated = simulateCoronationElsaFreeze(snapshot, snapshot.initialState, [0, 5, 10]);
      const prior = [900, 950];
      const expectedSurround = nodes.filter((node, index) => !prior.includes(index) && prior.some((center) => (
        Math.hypot(node.x - nodes[center].x, node.y - nodes[center].y) <= surroundRadius
      ))).map((node) => getCoronationElsaPlannerNodeIndex(snapshot, node.id));
      assert.deepEqual(new Set(simulated.surroundTargetIndices), new Set(expectedSurround));
      assert.equal(simulated.nextFreezeLayerCounts[900], 3);
      assert.equal(simulated.nextFreezeLayerCounts[950], 2);
      if (lineRadius === 999 || surroundRadius === 999) assert.equal(simulated.targetIndices.length, 999);
      // The same cached geometry remains correct for a different chain.
      assert.deepEqual(simulateCoronationElsaFreeze(snapshot, snapshot.initialState, [1, 6, 11]).surroundTargetIndices,
        simulated.surroundTargetIndices);
    }
  }
});

test("live planner context, identity execution and freeze/tap remain consistent through a 999-body cycle", () => {
  const nodes = Array.from({ length: 999 }, (_, i) => makeNode(`n-${i}`, 40 + (i % 30) * 10, 280 + Math.floor(i / 30) * 6,
    `type-${i % 5}`, { radius: 5 }));
  const harness = Object.assign(Object.create(Game.prototype), makeGame(nodes, {
    cheatSettings: { enabled: true, boardTarget: 999, tsumDiameter: 10, gravityMultiplier: 10, spawnRate: "instant" }
  }), {
    bombs: [], strongestModeEnabled: true,
    myTsum: { id: "coronationElsa" },
    strongestModeCoronationElsaPlannerFrameRevision: 1,
    strongestModeCoronationElsaFreezeRevision: 0,
    strongestModeCoronationElsaPhysicsStepCount: 1,
    strongestModeCoronationElsaPlannerFrameCallCount: 0,
    strongestModeCoronationElsaPlannerCallsSinceTrace: 0,
    strongestModeCoronationElsaPlannerBlockedTotalMs: 0,
    getActiveSkillSession: () => ({ id: "integration" }),
    getStrongestModeCoronationElsaSkillSummary: () => null,
    getStrongestModeCoronationElsaFlowSafetyContext: Game.prototype.getStrongestModeCoronationElsaFlowSafetyContext,
    getStrongestModeCoronationElsaFlowSafetyState: Game.prototype.getStrongestModeCoronationElsaFlowSafetyState,
    canConnectWithChainRule: Game.prototype.canConnectWithChainRule,
    getPhysicsBodies: () => nodes,
    getBodyCollisionX: (body) => body.x, getBodyCollisionY: (body) => body.y,
    isBodySettled: () => true, isBodyMotionLocked: () => false,
    getStrongestModeCoronationElsaSafePlayableY: () => 220,
    getFieldFloorY: () => 700,
    isStrongestModeBusy: () => false,
    isGameplayInputLocked: () => false,
    noteAction() {}
  });
  harness.resetStrongestModeCoronationElsaSettleOpportunityState();
  const decision = harness.planStrongestModeCoronationElsaAction({ deadlineMs: performance.now() + 1000 });
  assert.equal(decision.plan.action, "trace");
  assert.equal(decision.plan.diagnostics.highBodyCount, true);
  assert.equal(decision.chain.strongestModeCoronationElsaValidationToken.validation.valid, true);
  harness.inputRouter = { handleChainCommit(chain) {
    assert.deepEqual(chain.map((node) => node.id), decision.plan.chainIds);
    return coronationElsaSkillHandler.onChainCommit({ game: harness, board: harness.boardState, level: 6,
      applyFreeze(ids, spec) {
        for (const id of ids) harness.boardState.freezeLayer.set(id, [...(harness.boardState.freezeLayer.get(id) || []), spec]);
        harness.strongestModeCoronationElsaFreezeRevision += 1;
      }
    }, { id: "integration" }, chain);
  } };
  assert.equal(harness.performStrongestModeChain(decision.chain), true);
  const frozen = harness.boardState.getFrozenNodesByKind("coronationElsa");
  assert.ok(frozen.length >= 3);
  harness.boardState.hasFreezeKind = (node) => harness.boardState.isFrozen(node);
  const latest = buildCoronationElsaPlannerSnapshot(harness, 6);
  const tap = evaluateCoronationElsaTapComponents(latest).best;
  const target = nodes[tap.tapNodeIndex];
  assert.equal(harness.evaluateStrongestModeCoronationElsaIceTapReadiness({ target }).ready, true);
  assert.equal(tap.connectedFrozenCount, frozen.length);
  assert.ok(tap.componentIndices.includes(getCoronationElsaPlannerNodeIndex(latest, decision.chain[0].id)));
  // Moving a node invalidates the previous validation token and graph work.
  nodes[0].x += 100;
  harness.strongestModeCoronationElsaPlannerFrameRevision += 1;
  assert.equal(harness.isCoronationElsaPlannerRevisionCurrent(decision.chain.strongestModeCoronationElsaValidationToken.revision), false);
  const freshContext = harness.buildCoronationElsaPlannerContext({ deadlineMs: performance.now() + 1000 });
  assert.equal(freshContext.snapshot.nodes[0].x, nodes[0].x);
  assert.notEqual(freshContext.adjacency, decision.chain.strongestModeCoronationElsaValidationToken.context.adjacency);
});

test("moving geometry invalidates suspended paths but rotates starts to reach a late legal chain", () => {
  const nodes = Array.from({ length: 97 }, (_, i) => makeNode(`single-${i}`, 350, 500, `single-${i}`));
  nodes.push(makeNode("late-a", 70, 300), makeNode("late-b", 100, 300), makeNode("late-c", 130, 300));
  const harness = Object.assign(Object.create(Game.prototype), makeGame(nodes), {
    strongestModeCoronationElsaPlannerFrameRevision: 0,
    strongestModeCoronationElsaFreezeRevision: 0,
    strongestModeCoronationElsaPhysicsStepCount: 0,
    strongestModeCoronationElsaPlannerFrameCallCount: 0,
    strongestModeCoronationElsaPlannerCallsSinceTrace: 0,
    strongestModeCoronationElsaPlannerBlockedTotalMs: 0,
    isBodyMotionLocked: () => false, isBodySettled: () => true,
    getStrongestModeCoronationElsaSkillSummary: () => null
  });
  harness.resetStrongestModeCoronationElsaSettleOpportunityState();
  let decision;
  let lastWork;
  for (let frame = 0; frame < 60; frame += 1) {
    nodes[0].x += 0.1;
    harness.strongestModeCoronationElsaPlannerFrameRevision += 1;
    harness.elapsed += 1 / 60;
    let ticks = 0;
    decision = harness.planStrongestModeCoronationElsaAction({ now: () => ticks++, deadlineMs: 250 });
    if (lastWork) assert.notEqual(harness.strongestModeCoronationElsaProgressiveSearch.continuation, lastWork);
    lastWork = harness.strongestModeCoronationElsaProgressiveSearch.continuation;
    if (decision.plan.action === "trace") break;
  }
  assert.equal(decision.plan.action, "trace");
  assert.deepEqual(new Set(decision.plan.chainIds), new Set(["late-a", "late-b", "late-c"]));
});
