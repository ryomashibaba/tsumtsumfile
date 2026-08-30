import assert from "node:assert/strict";
import test from "node:test";

import { Game } from "./game.js";
import {
  FEVER_ENTRY_CLEAR_COUNT,
  getFeverClearsRemaining,
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
