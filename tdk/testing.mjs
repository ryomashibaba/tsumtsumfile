import test from 'node:test';
import assert from 'node:assert/strict';
import { validateDefinition } from './core.js';

// A small browser boundary; all gameplay services remain the real implementation.
globalThis.location = { search: '?tdk=1' };
globalThis.window = { location: globalThis.location, devicePixelRatio: 1, addEventListener() {} };
const { Game } = await import('../game.js');
const { COIN_CORRECTION_TABLE } = await import('../config.js');
const { applyDevelopmentLaunch } = await import('./development.js');

export function makeTdkGame(definition, level = 1, count = 5) {
  let seed = 12345;
  const rng = () => ((seed = (1664525 * seed + 1013904223) >>> 0) / 4294967296);
  const canvas = { style: {}, getContext: () => ({ setTransform() {} }), getBoundingClientRect: () => ({ width: 414, height: 736 }) };
  const game = new Game(canvas, { inputEnabled: false, persistenceEnabled: false, tdkDevelopment: true, managedLoop: true, renderQualityMode: 'light', rng, largeTsumSpawnChance: 0 });
  applyDevelopmentLaunch(game, { definition, level, count });
  return game;
}

export function testTsumContract(definition) {
  test(`${definition.id}: valid definition, real registry and 3/4/5-type playable boards`, () => {
    validateDefinition(definition);
    assert.equal(Game.SkillRegistry[definition.id].id, definition.id);
    for (const count of [3, 4, 5]) {
      const game = makeTdkGame(definition, 1, count);
      assert.equal(game.state, 'playing');
      assert.equal(game.availableTypes.length, count);
      assert.equal(game.tsums.length, 45);
      assert.equal(game.getSelectableTsumTypes().some(t => t.id === definition.id), !definition.developmentOnly);
      assert.equal(game.persistenceEnabled, false);
    }
  });

  // Starter-specific behavioral test. Replace with your own assertions for a different skill.
  for (let level = 1; level <= 6; level++) test(`${definition.id}: SL${level} activation, tap, real clear/coin/gauge and cleanup`, () => {
    const game = makeTdkGame(definition, level);
    game.skillVisualsEnabled = false;
    const nodes = game.tsums.slice(0, 6);
    for (const [index, node] of nodes.entries()) {
      node.type = game.myTsum;
      node.x = 180 + index * 5; node.y = 350;
    }
    game.tsums = nodes;
    assert.equal(game.skillRuntime.activate(definition.id, level), true);
    const session = game.skillRuntime.sessions[0];
    assert.equal(session.remainingMs, definition.tables.durationSec[level - 1] * 1000);
    assert.equal(game.skillRuntime.dispatchChainStart({ x: 190, y: 350 }), false);
    assert.equal(game.skillRuntime.dispatchDrag({ x: 195, y: 350 }), false);
    assert.equal(game.skillRuntime.dispatchChainCommit(nodes.slice(0, 3)), false);
    assert.equal(game.skillRuntime.dispatchTap({ x: 195, y: 350 }), true);
    assert.deepEqual(game.pendingClear.targets.map(t => t.id), nodes.map(t => t.id));
    assert.equal(game.pendingClear.chargeMultiplier, definition.tables.chargeMultiplier[level - 1]);
    assert.equal(game.skillRuntime.sessions.length, 0);
    assert.deepEqual(game.getCurrentGameplayPauseState(), { clockPaused: true, physicsPaused: false });
    const info = game.pendingClear;
    game.clearPipeline.finalize(info);
    assert.equal(game.totalCleared, 6);
    assert.equal(game.coinBonus, COIN_CORRECTION_TABLE[definition.tables.coinCorrectionType[level - 1]][6]);
    assert.equal(game.skillChargeFlights.length, 6);
    game.updateSkillChargeFlights(1000);
    assert.equal(game.skillSystem.charge, 6 * definition.tables.chargeMultiplier[level - 1]);
    assert.equal(game.actionLock, false);
    assert.equal(game.pendingClear, null);
    assert.equal(game.tsums.length, 45);
    assert.deepEqual(game.getCurrentGameplayPauseState(), { clockPaused: false, physicsPaused: false });
    game.skillRuntime.reset();
    assert.equal(game.skillRuntime.sessions.length, 0);
  });

  test(`${definition.id}: presentation pause, natural timeout, reset and duplicate target safety`, () => {
    const game = makeTdkGame(definition);
    game.skillRuntime.activate(definition.id, 1);
    assert.deepEqual(game.getCurrentGameplayPauseState(), { clockPaused: true, physicsPaused: true });
    game.skillRuntime.updateRaw(definition.timing.presentation.durationMs);
    const node = game.tsums[0];
    assert.deepEqual(game.clearPipeline.uniqueTargets([node, node, null, { id: 'dead', dead: true }, { id: 'bomb', isBomb: true }]), [node]);
    game.skillRuntime.update(definition.tables.durationSec[0] * 1000);
    assert.equal(game.skillRuntime.sessions.length, 0);
    game.skillRuntime.updateRaw(definition.timing.endPause.durationMs);
    assert.deepEqual(game.getCurrentGameplayPauseState(), { clockPaused: false, physicsPaused: false });
    game.skillRuntime.activateNow(definition.id, 1);
    game.skillRuntime.reset();
    assert.equal(game.skillRuntime.sessions.length, 0);
    assert.equal(game.skillRuntime.timingPauses.length, 0);
  });
}

