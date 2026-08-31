import assert from "node:assert/strict";
import test from "node:test";

import { coronationElsaSkillHandler } from "./game.js";
import {
  buildCoronationElsaPlannerAdjacency,
  buildCoronationElsaPlannerSnapshot,
  enumerateCoronationElsaPlannerTraces,
  getCoronationElsaPlannerNodeIndex,
  profileCoronationElsaPlanner,
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
  const game = {
    tsums: nodes,
    boardState,
    selectedSkillLevel: options.level || 6,
    elapsed: 12.5,
    strongestModeCoronationElsaNoTraceDurationSec: 0.04,
    coronationElsaDebug: !!options.coronationElsaDebug,
    isTsumInPlayArea: (node) => !!node && !node.dead && !node.removing && node.inPlay !== false,
    getBodyRadius: (node) => boardState.getEffectiveRadius(node),
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
