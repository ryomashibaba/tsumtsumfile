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
  assert.equal(shouldTapStrongestModeCoronationElsaCompletedIce({ frozenCount: 38, noTraceDurationSec: 0 }), true);
  assert.equal(shouldTapStrongestModeCoronationElsaCompletedIce({ frozenCount: 37, noTraceDurationSec: 0.149 }), false);
  assert.equal(shouldTapStrongestModeCoronationElsaCompletedIce({ frozenCount: 0, noTraceDurationSec: 0.15 }), true);
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

const makeCoronationElsaPreviewHarness = ({ nodes, chainsByStart }) => ({
  tsums: nodes,
  selectedSkillLevel: 6,
  boardState: {
    getFrozenNodesByKind: () => [],
    getResolvedType: (node) => node.type
  },
  getStrongestModeChainNodes: () => nodes,
  getChainBehaviorForStart(start) {
    return chainsByStart.has(start.id) ? { allowedTypeIds: new Set(["test"]) } : null;
  },
  findStrongestModeGreedyChain(start) {
    return chainsByStart.get(start.id) || [];
  },
  isStrongestModeCoronationElsaEdgeStart: Game.prototype.isStrongestModeCoronationElsaEdgeStart,
  getStrongestModeCoronationElsaStartDirections: Game.prototype.getStrongestModeCoronationElsaStartDirections,
  getStrongestModeCoronationElsaDirectionalGeometry: Game.prototype.getStrongestModeCoronationElsaDirectionalGeometry,
  findStrongestModeCoronationElsaDirectionalChains(start, nodes, rule, maxLength, direction) {
    const entry = chainsByStart.get(start.id);
    if (!entry || entry.direction !== direction) {
      return [];
    }
    const geometry = Game.prototype.getStrongestModeCoronationElsaDirectionalGeometry.call(this, entry.chain, direction);
    return geometry?.valid ? [{ chain: entry.chain, geometry, searchScore: entry.searchScore || 0 }] : [];
  },
  isTsumInPlayArea: () => true
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

test("Coronation Elsa maps bottom starts to vertical and side starts to horizontal searches", () => {
  const harness = {
    isStrongestModeCoronationElsaEdgeStart: Game.prototype.isStrongestModeCoronationElsaEdgeStart
  };
  assert.deepEqual(
    Game.prototype.getStrongestModeCoronationElsaStartDirections.call(
      harness,
      makeCoronationElsaNode("bottom", 207, FIELD_BOTTOM - 20)
    ),
    ["vertical"]
  );
  assert.deepEqual(
    Game.prototype.getStrongestModeCoronationElsaStartDirections.call(
      harness,
      makeCoronationElsaNode("left", FIELD_LEFT + 20, 320)
    ),
    ["horizontal"]
  );
  assert.deepEqual(
    Game.prototype.getStrongestModeCoronationElsaStartDirections.call(
      harness,
      makeCoronationElsaNode("corner", FIELD_LEFT + 20, FIELD_BOTTOM - 20)
    ),
    ["vertical", "horizontal"]
  );
});

test("Coronation Elsa directional geometry requires 58 pixels of progress within 35 percent tilt", () => {
  const bottom = makeCoronationElsaNode("bottom", 200, 560);
  const verticalValid = [bottom, makeCoronationElsaNode("vertical-valid", 220, 480)];
  const verticalTilted = [bottom, makeCoronationElsaNode("vertical-tilted", 235, 480)];
  const verticalShort = [bottom, makeCoronationElsaNode("vertical-short", 200, 503)];
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

  const left = makeCoronationElsaNode("left", 20, 340);
  const horizontalValid = [left, makeCoronationElsaNode("horizontal-valid", 100, 365)];
  const horizontalTilted = [left, makeCoronationElsaNode("horizontal-tilted", 100, 370)];
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
    makeCoronationElsaNode("bottom", 207, 560),
    makeCoronationElsaNode("mid", 212, 500),
    makeCoronationElsaNode("top", 216, 440)
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
  assert.deepEqual(chains[0].chain.map((node) => node.id), ["bottom", "mid", "top"]);
  assert.equal(chains[0].geometry.valid, true);
});

test("Coronation Elsa preview selects the largest predicted clear without edge-direction bonuses", () => {
  const left = [
    makeCoronationElsaNode("left-start", 20, 270),
    makeCoronationElsaNode("left-mid", 80, 270),
    makeCoronationElsaNode("left-end", 140, 270)
  ];
  const right = [
    makeCoronationElsaNode("right-start", 394, 390),
    makeCoronationElsaNode("right-mid", 334, 390),
    makeCoronationElsaNode("right-end", 274, 390)
  ];
  const rightLineExtras = [
    makeCoronationElsaNode("right-extra-1", 210, 382),
    makeCoronationElsaNode("right-extra-2", 150, 380)
  ];
  const nodes = [...left, ...right, ...rightLineExtras];
  const harness = makeCoronationElsaPreviewHarness({
    nodes,
    chainsByStart: new Map([
      [left[0].id, { chain: left, direction: "horizontal" }],
      [right[0].id, { chain: right, direction: "horizontal" }]
    ])
  });

  const selected = Game.prototype.findStrongestModeCoronationElsaBestPreviewChain.call(harness, {
    minLength: 3,
    maxLength: 6
  });

  assert.deepEqual(selected.map((node) => node.id), right.map((node) => node.id));
});

test("Coronation Elsa preview re-evaluates vertical and horizontal directions from the current board", () => {
  const vertical = [
    makeCoronationElsaNode("bottom-start", 207, 560),
    makeCoronationElsaNode("bottom-mid", 210, 500),
    makeCoronationElsaNode("bottom-end", 212, 440)
  ];
  const horizontal = [
    makeCoronationElsaNode("side-start", 20, 260),
    makeCoronationElsaNode("side-mid", 80, 260),
    makeCoronationElsaNode("side-end", 140, 260)
  ];
  const verticalLineExtras = [
    makeCoronationElsaNode("vertical-extra-1", 205, 380),
    makeCoronationElsaNode("vertical-extra-2", 215, 320)
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

test("Coronation Elsa preview never falls back to a central start", () => {
  const central = [
    makeCoronationElsaNode("center-start", 207, 280),
    makeCoronationElsaNode("center-mid", 207, 340),
    makeCoronationElsaNode("center-end", 207, 400)
  ];
  const harness = makeCoronationElsaPreviewHarness({
    nodes: central,
    chainsByStart: new Map([[central[0].id, { chain: central, direction: "vertical" }]])
  });

  const selected = Game.prototype.findStrongestModeCoronationElsaBestPreviewChain.call(harness, {
    minLength: 3,
    maxLength: 6
  });

  assert.deepEqual(selected, []);
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
