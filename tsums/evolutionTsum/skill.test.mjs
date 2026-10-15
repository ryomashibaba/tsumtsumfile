import test from 'node:test';
import assert from 'node:assert/strict';
import definition from './definition.js';
import { makeTdkGame } from '../../tdk/testing.mjs';
import { NAMINE_SPLASH_RADIUS, TSUM_RADIUS } from '../../config.js';
import { calculateEffectiveClearCount } from '../../bombLogic.js';
import { advanceEvolution, evolutionSpec, EVOLUTION_TUNING, updateEvolutionRaw } from './skill.js';

export function makeEvolution(level = 6) {
  const game = makeTdkGame(definition, level, 3);
  game.skillVisualsEnabled = false;
  game.skillRuntime.activateNow(definition.id, level);
  for (let i = 0; i < 120; i++) game.update(1 / 60);
  return game;
}
const session = game => game.getActiveSkillSession(definition.id);
export function pump(game, predicate, max = 600) {
  for (let i = 0; i < max && !predicate(); i++) game.update(1 / 60);
  assert.ok(predicate(), 'game must finish work within bounded frames');
}
function nodes(game, n = 6) {
  const targets = game.tsums.slice(0, n);
  for (const [i, t] of targets.entries()) {
    t.type = game.myTsum; t.x = 70 + i * 45; t.y = 450;
    t.vx = 0; t.vy = 0; t.spawnedAboveField = false;
  }
  return targets;
}
function manual(game, targets) {
  assert.ok(game.startChain(targets[0], targets[0]));
  game.chain = targets; game.chainSet = new Set(targets.map(t => t.id));
  game.finishChain();
}

test('SL1–6 retain exact durations and all four incremental thresholds; Namine radius is fixed', () => {
  for (let sl = 1; sl <= 6; sl++) {
    assert.deepEqual(evolutionSpec(sl), { durationSec: 12 + sl, first: 20 - sl, splash: 20 - sl, overdrive: 100 - sl * 5, periodic: 80 - sl * 4 });
    for (const key of ['first', 'splash', 'overdrive', 'periodic']) assert.equal(definition.tables[key][sl - 1], evolutionSpec(sl)[key]);
  }
  assert.equal(EVOLUTION_TUNING.splashRadius, NAMINE_SPLASH_RADIUS);
});
test('large overflow retains first line, both evolutions and every periodic line in order', () => {
  const d = { progress: 0, stage: 0, queue: [] };
  advanceEvolution(d, 14 + 14 + 70 + 56 * 3 + 9, evolutionSpec(6));
  assert.deepEqual(d.queue, ['line', 'phase2', 'phase3', 'line', 'line', 'line']);
  assert.equal(d.progress, 9);
});
test('SL1–6 real session timeout restores clock, input, scale and session data', () => {
  for (let sl = 1; sl <= 6; sl++) {
    const game = makeEvolution(sl);
    pump(game, () => !session(game), 1300);
    assert.deepEqual(game.getCurrentGameplayPauseState(), { clockPaused: false, physicsPaused: false });
    assert.equal(game.isGameplayInputLocked(), false);
    assert.ok(game.tsums.every(t => game.getBodyRadius(t) === t.baseRadius));
    assert.equal(game.evolutionLastMetrics.phase3AtSec, null);
  }
});
test('manual chain uses normal pipeline once, three-times animation and 10% primary gauge', () => {
  const game = makeEvolution(), targets = nodes(game);
  const coins = game.coinBonus, gauge = game.skillSystem.charge;
  manual(game, targets);
  assert.equal(game.pendingClear.chainStepInterval, (game.feverSystem.active ? 0.08 : 0.15) / 3);
  assert.ok(targets.every(n => n.removeDuration === 0.06));
  pump(game, () => !game.pendingClear && game.skillChargeFlights.length === 0);
  assert.equal(game.coinBonus - coins, game.getCoinsByClearCount(6, definition.id, 'correction_0'));
  assert.ok(Math.abs(game.skillSystem.charge - gauge - 0.6) < 1e-9);
  assert.equal(session(game).data.progress, 6);
});
test('every manual node splashes, overlap is deduplicated, and offscreen top nodes remain reachable by splash', () => {
  const game = makeEvolution(); session(game).data.phase = 2;
  const primary = nodes(game, 3), extra = game.tsums.slice(3, 6);
  primary.forEach((n, i) => { n.x = 70 + i * 100; n.y = 175; });
  extra.forEach((n, i) => { n.x = primary[i].x; n.y = 105; });
  const prepared = game.clearPipeline.buildPreparedClear({ source: 'chain', targets: primary });
  assert.ok(extra.every(n => prepared.targets.includes(n)));
  assert.equal(prepared.targets.length, new Set(prepared.targets.map(n => n.id)).size);
  assert.equal(prepared.sequentialSplashGroups.length, 3);
});
test('OD doubles award evaluation once; physical progress and primary-only 20% gauge stay separate', () => {
  const game = makeEvolution(), s = session(game); s.data.phase = 3; s.data.stage = 3;
  const primary = nodes(game, 3);
  const other = game.tsums.slice(3);
  other.forEach((n, i) => { n.x = 360; n.y = 180 + i; });
  const splash = other[0]; splash.x = primary[0].x; splash.y = primary[0].y - 50; splash.type = game.myTsum;
  const coins = game.coinBonus, cleared = game.totalCleared, gauge = game.skillSystem.charge;
  manual(game, primary);
  const pending = game.pendingClear, count = pending.targets.length;
  assert.equal(calculateEffectiveClearCount(pending), count * 2);
  pump(game, () => !game.pendingClear && game.skillChargeFlights.length === 0);
  assert.equal(game.totalCleared - cleared, count * 2);
  assert.equal(game.coinBonus - coins, game.getCoinsByClearCount(count * 2, definition.id, 'correction_0'));
  assert.equal(s.data.progress, count);
  assert.ok(Math.abs(game.skillSystem.charge - gauge - 0.6) < 1e-9);
  assert.equal(s.data.metrics.splashClears, count - 3);
});
test('automatic lines never advance evolution or charge gauge; refill separates queued attacks', () => {
  const game = makeEvolution(), s = session(game);
  s.data.queue.push('line', 'line');
  const gauge = game.skillSystem.charge;
  pump(game, () => s.data.metrics.lines === 2 && !s.data.event && !game.pendingClear);
  assert.equal(s.data.progress, 0);
  assert.equal(s.data.stage, 0);
  assert.equal(game.skillSystem.charge, gauge);
  assert.ok(s.data.metrics.realClears >= 12);
  assert.equal(s.data.metrics.watchdogRecoveries, 0);
});
test('no evolution or automatic clear interrupts an active pointer chain', () => {
  const game = makeEvolution(), s = session(game);
  const chain = nodes(game, 3);
  assert.ok(game.startChain(chain[0], chain[0]));
  s.data.queue.push('line', 'phase2');
  for (let i = 0; i < 30; i++) updateEvolutionRaw(game, 1 / 60);
  assert.equal(game.dragging, true); assert.equal(game.pendingClear, null);
  assert.equal(s.data.phase, 1); assert.equal(s.data.metrics.lines, 0);
  game.chain = chain; game.finishChain();
  assert.equal(game.pendingClear.meta.phase, 1);
  pump(game, () => s.data.phase === 2 && !s.data.event);
});
test('evolution freezes main, skill, combo, fever and effect clocks while physics/refill continue; resumes together', () => {
  const game = makeEvolution(), s = session(game);
  game.comboSystem.recordAction();
  game.feverSystem.active = true; game.feverSystem.gauge = 80;
  game.feverSystem.bannerTimer = 1; game.feverSystem.flash = 0.5;
  s.data.queue.push('phase2'); updateEvolutionRaw(game, 0);
  const before = { main: game.timeRemaining, skill: s.remainingMs, elapsed: game.elapsed,
    combo: game.comboSystem.timer, fever: game.feverSystem.gauge, banner: game.feverSystem.bannerTimer, y: game.tsums[0].y };
  game.tsums[0].vy = 4;
  for (let i = 0; i < 10; i++) game.update(1 / 60);
  assert.equal(game.timeRemaining, before.main); assert.equal(s.remainingMs, before.skill);
  assert.equal(game.elapsed, before.elapsed);
  assert.equal(game.comboSystem.timer, before.combo); assert.equal(game.feverSystem.gauge, before.fever);
  assert.equal(game.feverSystem.bannerTimer, before.banner);
  assert.notEqual(game.tsums[0].y, before.y);
  assert.equal(game.isGameplayInputLocked(), true);
  pump(game, () => !s.data.event);
  assert.equal(game.isGameplayInputLocked(), false);
  assert.equal(game.getCurrentGameplayPauseState().clockPaused, false);
  const remaining = s.remainingMs; game.update(1 / 60); assert.ok(s.remainingMs < remaining);
});
test('OD grows existing/spawned physical and input radii without expanding splash, reset removes modifiers', () => {
  const game = makeEvolution(), s = session(game);
  s.data.queue.push('phase3'); updateEvolutionRaw(game, 0);
  const target = nodes(game, 1)[0]; game.tsums = [target];
  assert.ok(Math.abs(game.getBodyRadius(target) - TSUM_RADIUS * 1.2) < 1e-8);
  assert.equal(game.boardState.getVisualScale(target), 1.2);
  assert.equal(game.findTsumAt(target.x + TSUM_RADIUS * 1.15, target.y), target);
  target.y = 125; target.spawnedAboveField = false;
  game.resolveFieldBoundary(target);
  assert.equal(target.y, 125, 'OD must preserve the intentional top overflow');
  const spawned = game.createSpawnTsum(game.myTsum, 0, 1);
  assert.ok(Math.abs(game.getBodyRadius(spawned) - spawned.baseRadius * 1.2) < 1e-8);
  game.skillRuntime.reset();
  assert.equal(game.getBodyRadius(target), target.baseRadius);
  assert.equal(game.getBodyRadius(spawned), spawned.baseRadius);
  assert.equal(game.isGameplayInputLocked(), false);
});
test('chain held across expiry retains original capability, finishes events, and cannot leak into next skill', () => {
  const game = makeEvolution(), s = session(game), targets = nodes(game, 3);
  s.data.progress = 12;
  game.startChain(targets[0], targets[0]); game.chain = targets;
  s.remainingMs = 1; game.update(1 / 60);
  assert.equal(s.data.expired, true); assert.equal(game.dragging, true);
  game.finishChain();
  assert.equal(game.pendingClear.meta.phase, 1);
  pump(game, () => !session(game));
  assert.deepEqual(game.evolutionLastMetrics.events, ['line']);
  assert.equal(game.evolutionLastMetrics.manualClears, 3);
  game.skillRuntime.activateNow(definition.id, 6);
  assert.deepEqual(session(game).data.queue, []); assert.equal(session(game).data.phase, 1);
});
test('watchdog finalizes a stuck automatic clear once and releases input', () => {
  const game = makeEvolution(), s = session(game);
  s.data.queue.push('line'); updateEvolutionRaw(game, 0);
  assert.ok(game.pendingClear);
  updateEvolutionRaw(game, EVOLUTION_TUNING.watchdogSec + 0.1);
  assert.equal(game.pendingClear, null);
  pump(game, () => !s.data.event);
  assert.equal(s.data.metrics.watchdogRecoveries, 1);
  assert.equal(s.data.metrics.lines, 1);
});
test('game time-up waits for the committed chain and reserved evolution work', () => {
  const game = makeEvolution(), s = session(game), targets = nodes(game, 3);
  s.data.progress = 12; s.remainingMs = 1;
  game.timeRemaining = 0.001;
  let finished = 0;
  game.finishRun = () => { finished++; game.state = 'result'; };
  game.startChain(targets[0], targets[0]); game.chain = targets;
  game.update(1 / 60);
  assert.equal(game.timeUp, true); assert.equal(finished, 0);
  game.finishChain();
  pump(game, () => !session(game));
  assert.deepEqual(game.evolutionLastMetrics.events, ['line']);
  assert.equal(finished, 1);
  assert.equal(game.pendingClear, null);
});
test('ordinary clears outside the skill retain original speed, radius, evaluation and full gauge', () => {
  const game = makeEvolution();
  const survivors = nodes(game, 3);
  game.clearPipeline.buildPreparedClear({ source: 'chain', targets: survivors });
  assert.ok(survivors.every(n => n.removeDuration === 0.06));
  game.skillRuntime.reset();
  assert.ok(survivors.every(n => n.removeDuration === 0.18));
  const targets = nodes(game), before = game.skillSystem.charge;
  manual(game, targets);
  assert.equal(game.pendingClear.chainStepInterval, 0.15);
  assert.equal(calculateEffectiveClearCount(game.pendingClear), 6);
  pump(game, () => !game.pendingClear && !game.skillChargeFlights.length);
  assert.equal(game.skillSystem.charge - before, 6);
});
