import test from 'node:test';
import assert from 'node:assert/strict';
import { validateDefinition } from './core.js';
import { createChainSkill } from './chainSkill.js';

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

export function testCommonTsumContract(definition) {
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

  for (let level = 1; level <= 6; level++) test(`${definition.id}: common SL${level} session and state restoration`, () => {
    const game = makeTdkGame(definition, level, [3, 4, 5][(level - 1) % 3]);
    game.skillVisualsEnabled = false;
    assert.equal(game.skillRuntime.activate(definition.id, level), true);
    const session = game.skillRuntime.sessions[0];
    assert.equal(session.remainingMs, definition.tables.durationSec[level - 1] * 1000);
    game.skillRuntime.endSession(session, 'replaced', { skipEndPause: true });
    assert.equal(game.skillRuntime.sessions.length, 0);
    assert.equal(game.persistenceEnabled, false);
    assert.equal(game.dragging, false);
    assert.equal(game.actionLock, false);
    assert.deepEqual(game.getCurrentGameplayPauseState(), { clockPaused: false, physicsPaused: false });
  });

  test(`${definition.id}: common presentation, timeout and reset restore pause state`, () => {
    const game = makeTdkGame(definition);
    game.skillRuntime.activate(definition.id, 1);
    assert.deepEqual(game.getCurrentGameplayPauseState(), { clockPaused: true, physicsPaused: true });
    game.skillRuntime.updateRaw(definition.timing.presentation.durationMs);
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

export function testTapSkillContract(definition) {
  test(`${definition.id}: repeated tap cannot schedule a second clear`, () => {
    const game = makeTdkGame(definition);
    game.skillVisualsEnabled = false;
    const node = game.tsums[0]; node.x = 190; node.y = 350;
    game.tsums = [node];
    game.skillRuntime.activate(definition.id, 1);
    assert.equal(game.skillRuntime.dispatchTap(node), true);
    const pending = game.pendingClear;
    assert.equal(game.skillRuntime.dispatchTap(node), false);
    assert.equal(game.pendingClear, pending);
  });
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

// v1.0 compatibility: existing generated tests keep their original behavior.
export function testTsumContract(definition) {
  testCommonTsumContract(definition);
  testTapSkillContract(definition);
}

function chainBoard(definition, level = 1, count = 5) {
  const game = makeTdkGame(definition, level, count);
  game.skillVisualsEnabled = false;
  const nodes = game.tsums.slice(0, 6);
  for (const [index, node] of nodes.entries()) {
    node.type = game.myTsum;
    node.x = 90 + index * 40; node.y = 350; node.vx = 0; node.vy = 0;
  }
  game.tsums = nodes;
  return { game, nodes };
}

export function testChainSkillContract(definition) {
  test(`${definition.id}: duplicate start and cancelled gesture cannot replay a clear`, () => {
    const { game, nodes } = chainBoard(definition);
    game.skillRuntime.activate(definition.id, 1);
    game.inputRouter.handleChainStart(nodes[0]);
    game.extendChain(nodes[1]); game.extendChain(nodes[2]);
    const originalChain = game.chain.slice();
    assert.equal(game.inputRouter.handleChainStart(nodes[4]), true);
    assert.deepEqual(game.chain, originalChain);
    game.cancelActiveChain();
    assert.equal(game.inputRouter.handleChainCommit(originalChain), true);
    assert.equal(game.pendingClear, null);
  });
  test(`${definition.id}: game clock expiry cancels an active chain before result`, () => {
    const { game, nodes } = chainBoard(definition);
    game.skillRuntime.activate(definition.id, 1);
    game.inputRouter.handleChainStart(nodes[0]);
    game.extendChain(nodes[1]); game.extendChain(nodes[2]);
    game.timeRemaining = 0.001;
    game.update(0.02);
    assert.equal(game.state, 'result');
    assert.equal(game.skillRuntime.sessions.length, 0);
    assert.equal(game.chain.length, 0);
    assert.equal(game.pendingClear, null);
    assert.equal(game.totalCleared, 0);
    assert.equal(nodes.some(node => node.inChain), false);
    assert.deepEqual(game.getCurrentGameplayPauseState(), { clockPaused: false, physicsPaused: false });
  });
  test(`${definition.id}: configurable length, halo, correction and zero recovery use the real pipeline`, () => {
    const original = Game.SkillRegistry[definition.id];
    const tables = { ...definition.tables, minChainLength: Array(6).fill(4),
      eraseRadius: Array(6).fill(45), chargeMultiplier: Array(6).fill(0),
      coinCorrectionType: Array(6).fill('correction_0') };
    Game.SkillRegistry[definition.id] = { ...createChainSkill(definition.id, tables, {}), tables };
    try {
      const { game, nodes } = chainBoard(definition);
      game.skillRuntime.activate(definition.id, 1);
      game.inputRouter.handleChainStart(nodes[0]);
      game.extendChain(nodes[1]); game.extendChain(nodes[2]);
      game.finishChain();
      assert.equal(game.pendingClear, null);
      assert.equal(game.skillRuntime.sessions.length, 1);
      game.inputRouter.handleChainStart(nodes[0]);
      for (const node of nodes.slice(1, 4)) game.extendChain(node);
      game.finishChain();
      assert.deepEqual(game.pendingClear.targets, nodes.slice(0, 5));
      game.clearPipeline.finalize(game.pendingClear);
      game.updateSkillChargeFlights(1000);
      assert.equal(game.coinBonus, COIN_CORRECTION_TABLE.correction_0[5]);
      assert.equal(game.skillSystem.charge, 0);
    } finally { Game.SkillRegistry[definition.id] = original; }
  });

  test(`${definition.id}: pipeline rejection consumes commit and permits a fresh retry`, () => {
    const { game, nodes } = chainBoard(definition);
    game.skillRuntime.activate(definition.id, 1);
    const begin = game.clearPipeline.beginClear.bind(game.clearPipeline);
    game.clearPipeline.beginClear = () => false;
    game.inputRouter.handleChainStart(nodes[0]);
    for (const node of nodes.slice(1)) game.extendChain(node);
    game.finishChain();
    assert.equal(game.pendingClear, null);
    assert.equal(game.skillRuntime.sessions.length, 1);
    assert.equal(game.skillRuntime.sessions[0].data.committed, false);
    game.clearPipeline.beginClear = begin;
    game.inputRouter.handleChainStart(nodes[0]);
    for (const node of nodes.slice(1)) game.extendChain(node);
    game.finishChain();
    assert.equal(game.pendingClear.source, 'skill');
  });
  for (let level = 1; level <= 6; level++) test(`${definition.id}: chain SL${level} real tracing, single skill clear, coin and gauge`, () => {
    const { game, nodes } = chainBoard(definition, level, [3, 4, 5][(level - 1) % 3]);
    game.skillRuntime.activate(definition.id, level);
    const session = game.skillRuntime.sessions[0];
    let normalClears = 0, skillClears = 0;
    const begin = game.clearPipeline.beginClear.bind(game.clearPipeline);
    game.clearPipeline.beginClear = spec => {
      if (spec.source === 'chain') normalClears++;
      if (spec.source === 'skill') skillClears++;
      return begin(spec);
    };
    assert.equal(game.inputRouter.handleTap(nodes[0]), false);
    assert.equal(game.inputRouter.handleChainStart(nodes[0]), true);
    assert.equal(game.dragging, true);
    for (const node of nodes.slice(1)) game.extendChain(node);
    assert.equal(game.chain.length, 6);
    game.finishChain();
    game.finishChain(); // repeated release cannot clear twice
    assert.equal(skillClears, 1);
    assert.equal(normalClears, 0);
    assert.equal(game.pendingClear.source, 'skill');
    assert.deepEqual(game.pendingClear.targets, nodes);
    assert.equal(game.pendingClear.chargeMultiplier, definition.tables.chargeMultiplier[level - 1]);
    assert.equal(definition.handler.onChainCommit(game.skillRuntime.createContext(definition.handler, level, session), session, nodes), false);
    assert.equal(game.skillRuntime.sessions.length, 0);
    assert.deepEqual(game.getCurrentGameplayPauseState(), { clockPaused: true, physicsPaused: false });
    game.clearPipeline.finalize(game.pendingClear);
    game.updateSkillChargeFlights(1000);
    assert.equal(game.totalCleared, 6);
    assert.equal(game.coinBonus, COIN_CORRECTION_TABLE[definition.tables.coinCorrectionType[level - 1]][6]);
    assert.equal(game.skillSystem.charge, 6 * definition.tables.chargeMultiplier[level - 1]);
    assert.equal(game.tsums.length, 45);
    assert.equal(game.pendingClear, null);
    assert.equal(game.actionLock, false);
    assert.deepEqual(game.getCurrentGameplayPauseState(), { clockPaused: false, physicsPaused: false });
  });

  for (const kind of ['null', 'unselected', 'short', 'duplicate', 'foreign', 'dead', 'removing', 'bomb', 'frozen', 'outside', 'mixed', 'distant', 'noStart', 'busy', 'paused', 'timeUp']) test(`${definition.id}: rejects ${kind} chain without ordinary fallback`, () => {
    const { game, nodes } = chainBoard(definition);
    game.skillRuntime.activate(definition.id, 1);
    if (kind !== 'noStart') game.inputRouter.handleChainStart(nodes[0]);
    let chain = nodes.slice(0, 3);
    for (const node of chain) node.inChain = true;
    if (kind === 'null') chain = null;
    if (kind === 'unselected') nodes[2].inChain = false;
    if (kind === 'short') chain = nodes.slice(0, 2);
    if (kind === 'duplicate') chain = [nodes[0], nodes[1], nodes[1]];
    if (kind === 'foreign') chain[2] = { ...nodes[2] };
    if (kind === 'dead') nodes[2].dead = true;
    if (kind === 'removing') nodes[2].removing = true;
    if (kind === 'bomb') nodes[2].isBomb = true;
    if (kind === 'frozen') game.boardState.isFrozen = node => node === nodes[2];
    if (kind === 'outside') nodes[2].y = -1000;
    if (kind === 'mixed') nodes[2].type = game.availableTypes[1];
    if (kind === 'distant') nodes[2].x = 380;
    if (kind === 'busy') game.actionLock = true;
    if (kind === 'paused') game.paused = true;
    if (kind === 'timeUp') game.timeUp = true;
    assert.equal(game.inputRouter.handleChainCommit(chain), true);
    assert.equal(game.pendingClear, null);
    assert.equal(game.totalCleared, 0);
    assert.equal(game.coinBonus, 0);
    assert.equal(game.skillRuntime.sessions.length, 1);
  });

  for (const reason of ['timeout', 'reset', 'cancel']) test(`${definition.id}: ${reason} during drag restores state; normal chains still work`, () => {
    const { game, nodes } = chainBoard(definition);
    game.skillRuntime.activate(definition.id, 1);
    game.inputRouter.handleChainStart(nodes[0]);
    game.extendChain(nodes[1]);
    if (reason === 'timeout') game.skillRuntime.update(definition.tables.durationSec[0] * 1000);
    else if (reason === 'reset') game.skillRuntime.reset();
    else { game.cancelActiveChain(); game.skillRuntime.endSession(game.skillRuntime.sessions[0], 'cancelled'); }
    game.skillRuntime.updateRaw(1000);
    game.finishChain();
    assert.equal(game.pendingClear, null);
    assert.equal(game.dragging, false);
    assert.equal(game.chain.length, 0);
    assert.equal(nodes.some(node => node.inChain), false);
    assert.equal(game.skillRuntime.sessions.length, 0);
    assert.deepEqual(game.getCurrentGameplayPauseState(), { clockPaused: false, physicsPaused: false });
    game.startChain(nodes[0], nodes[0]);
    game.extendChain(nodes[1]); game.extendChain(nodes[2]);
    game.finishChain();
    assert.equal(game.pendingClear.source, 'chain');
  });
}

export function testChainTsumContract(definition) {
  testCommonTsumContract(definition);
  testChainSkillContract(definition);
}

