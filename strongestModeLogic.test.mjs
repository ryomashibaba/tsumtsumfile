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
      [left[0].id, left],
      [right[0].id, right]
    ])
  });

  const selected = Game.prototype.findStrongestModeCoronationElsaBestPreviewChain.call(harness, {
    minLength: 3,
    maxLength: 6
  });

  assert.deepEqual(selected.map((node) => node.id), right.map((node) => node.id));
});

test("Coronation Elsa preview never falls back to a central start", () => {
  const central = [
    makeCoronationElsaNode("center-start", 207, 280),
    makeCoronationElsaNode("center-mid", 207, 340),
    makeCoronationElsaNode("center-end", 207, 400)
  ];
  const harness = makeCoronationElsaPreviewHarness({
    nodes: central,
    chainsByStart: new Map([[central[0].id, central]])
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
