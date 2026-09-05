import test from 'node:test';
import assert from 'node:assert/strict';

import {
  GameFeelController,
  calculateVisualChainCount,
  resolveChainAnticipationLevel,
  resolveClearLevel,
  resolveComboMilestone,
  resolveFeverAnticipation,
  resolveGameFeelQuality
} from './gameFeel.js';

const normal = {
  drawTransientEffects: true,
  particleScale: 1,
  gameFeelScale: 1,
  shakeScale: 1,
  flashScale: 1,
  maxGameFeelParticles: 80,
  maxGameFeelRings: 8,
  visualHitStop: true
};

test('clear intensity boundaries resolve from effective count', () => {
  const cases = [[0, 0], [2, 0], [3, 1], [5, 1], [6, 2], [9, 2], [10, 3], [14, 3], [15, 4], [24, 4], [25, 5], [100, 5]];
  for (const [count, level] of cases) assert.equal(resolveClearLevel(count), level);
});

test('chain anticipation uses weighted large-Tsum count and exact thresholds', () => {
  assert.equal(calculateVisualChainCount([{ clearWeight: 5 }, {}, {}]), 7);
  assert.deepEqual([5, 6, 9, 10, 14, 15, 19, 20].map(resolveChainAnticipationLevel), [0, 1, 1, 2, 2, 3, 3, 4]);
});

test('combo milestones keep ordinary combos quiet and celebrate hundreds', () => {
  assert.deepEqual([9, 10, 20, 30, 50, 99, 100, 200, 201].map(resolveComboMilestone), [0, 1, 2, 3, 4, 0, 5, 5, 0]);
});

test('fever anticipation uses 70, 85, 95, and 100 percent stages', () => {
  assert.deepEqual([69, 70, 84.9, 85, 94.9, 95, 100].map((value) => resolveFeverAnticipation(value)), [0, 1, 1, 2, 2, 3, 4]);
  assert.equal(resolveFeverAnticipation(12, true), 4);
});

test('skill ready fires once per false-to-true transition', () => {
  const controller = new GameFeelController({ getQualityProfile: () => normal });
  controller.syncSkillReady(false);
  controller.syncSkillReady(true);
  const firstLife = controller.skillReady.life;
  assert.ok(firstLife > 0);
  controller.update(0.1);
  controller.syncSkillReady(true);
  assert.equal(controller.skillReady.life, firstLife - 0.1);
  controller.syncSkillReady(false);
  controller.syncSkillReady(true);
  assert.equal(controller.skillReady.life, controller.skillReady.maxLife);
});

test('quality progressively suppresses feedback without changing the event payload', () => {
  const light = resolveGameFeelQuality({ ...normal, particleScale: 0.5, shakeScale: 0.5, maxGameFeelParticles: 40, visualHitStop: false });
  const minimal = resolveGameFeelQuality({ ...normal, drawTransientEffects: false, particleScale: 0, gameFeelScale: 0, shakeScale: 0, flashScale: 0, maxGameFeelParticles: 0, maxGameFeelRings: 0, visualHitStop: false });
  assert.equal(light.maxGameFeelParticles, 40);
  assert.equal(light.visualHitStop, false);
  assert.equal(minimal.maxGameFeelParticles, 0);

  const payload = Object.freeze({ effectiveClearCount: 30, source: 'chain', x: 100, y: 300 });
  const lightController = new GameFeelController({ getQualityProfile: () => light });
  lightController.emit('clear', payload);
  assert.ok(lightController.particles.length <= 14);
  assert.equal(lightController.hitStop.life, 0);
  const minimalController = new GameFeelController({ getQualityProfile: () => minimal });
  minimalController.emit('clear', payload);
  assert.equal(minimalController.particles.length, 0);
  assert.equal(minimalController.rings.length, 0);
  assert.equal(minimalController.getRenderState().shakeX, 0);
  assert.deepEqual(payload, { effectiveClearCount: 30, source: 'chain', x: 100, y: 300 });
});

test('particle and ring budgets cap a large bomb chain', () => {
  const controller = new GameFeelController({ getQualityProfile: () => ({ ...normal, maxGameFeelParticles: 20, maxGameFeelRings: 3 }) });
  controller.emit('bomb', { centers: Array.from({ length: 12 }, (_, index) => ({ x: index * 10, y: 300 })), chainLength: 12 });
  assert.ok(controller.particles.length <= 20);
  assert.ok(controller.rings.length <= 3);
  assert.equal(controller.hitStop.maxLife, 0.035);
  controller.update(0.04);
  controller.emit('clear', { effectiveClearCount: 30, source: 'bomb', x: 20, y: 300 });
  assert.equal(controller.hitStop.life, 0, 'the resolved bomb clear must not trigger a second hit-stop');
});

test('crossing the same chain threshold twice does not replay its accent', () => {
  const controller = new GameFeelController({ getQualityProfile: () => normal });
  controller.setChain(10, 100, 300);
  const firstCount = controller.particles.length;
  controller.setChain(9, 100, 300);
  controller.setChain(10, 100, 300);
  assert.equal(controller.particles.length, firstCount);
  controller.setChain(0);
  controller.setChain(10, 100, 300);
  assert.ok(controller.particles.length > firstCount);
});

test('reset removes every transient and result state', () => {
  const controller = new GameFeelController({ getQualityProfile: () => normal });
  controller.emit('clear', { effectiveClearCount: 30, x: 100, y: 300 });
  controller.emit('combo', { combo: 100 });
  controller.emit('result', { stats: { finalScore: 12345 } });
  controller.setChain(20, 100, 300);
  controller.reset({ skillReady: true });
  assert.equal(controller.particles.length, 0);
  assert.equal(controller.rings.length, 0);
  assert.equal(controller.hitStop.life, 0);
  assert.equal(controller.chain.level, 0);
  assert.equal(controller.result, null);
  assert.equal(controller.lastSkillReady, true);
});

test('result count-up reaches the exact score and reveals all rows within one second', () => {
  const controller = new GameFeelController({ getQualityProfile: () => normal });
  controller.emit('result', { stats: { finalScore: 987654 } });
  assert.equal(controller.getResultPresentation().score, 0);
  controller.update(0.6);
  assert.ok(controller.getResultPresentation().score < 987654);
  controller.update(0.4);
  const result = controller.getResultPresentation();
  assert.equal(result.score, 987654);
  assert.equal(result.revealedStats, 5);
  assert.equal(result.completed, true);
});

test('disabled CPU-style controller creates no feedback state', () => {
  const controller = new GameFeelController({ enabled: false, getQualityProfile: () => normal });
  controller.emit('clear', { effectiveClearCount: 30, x: 100, y: 300 });
  controller.emit('result', { stats: { finalScore: 1 } });
  assert.equal(controller.particles.length, 0);
  assert.equal(controller.rings.length, 0);
  assert.equal(controller.result, null);
});
