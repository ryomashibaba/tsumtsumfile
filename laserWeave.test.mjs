import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Game, ClearPipeline, InputRouter, SkillRuntimeManager } from './game.js';
import { TSUM_TYPES, SKILL_TABLES, COIN_CORRECTION_TABLE } from './config.js';
import { GameFeelController } from './gameFeel.js';
import { isBodyOccupying } from './bodyLifecycle.js';
import { getRenderQualityProfile } from './renderQuality.js';
import { LaserWeaveAudio } from './laserWeaveAudio.js';
import {
  getLaserWeaveSession, getLaserWeaveHeldNodes, getLaserWeaveWidth, getLaserWeaveBeams,
  collectLaserWeaveTargets, isLaserWeaveHeld, resetLaserWeave, updateLaserWeaveVisuals,
  drawLaserWeave, LASER_WEAVE_TUNING
} from './laserWeave.js';

const type = TSUM_TYPES.find(type => type.id === 'laserWeave');
const other = TSUM_TYPES.find(type => type.id === 'perfumeAlice');
function node(id, x, y, tsumType = type, radius = 10) {
  return { id, x, y, vx: 2, vy: 1, radius, baseRadius: radius, type: tsumType,
    inChain: false, dead: false, removing: false,
    beginRemove() { this.removing = true; this.inChain = false; this.clearOccupying = false; } };
}
function harness(nodes = [], level = 3) {
  const game = Object.create(Game.prototype);
  Object.assign(game, {
    state: 'playing', role: 'player', paused: false, actionLock: false, timeUp: false,
    myTsum: type, selectedSkillLevel: level, skillVisualsEnabled: true,
    tsums: nodes, bombs: [], pendingClear: null, pendingChainClearQueue: [],
    chain: [], chainSet: new Set(), chainSelectedAt: new Map(), dragging: false,
    score: 0, coinBonus: 0, totalCleared: 0, aiRunMaxChain: 0,
    activeItems: { bomb: false }, random: () => 0.5,
    feverSystem: { clears: 0, addClears(n) { this.clears += n; } },
    comboSystem: { combo: 0, recordAction() { this.combo += 1; } },
    boardState: {
      getResolvedType: n => n.type, getEffectiveRadius: n => n.radius,
      hasBubble: () => false, isFrozen: () => false, isFreezeMovementLocked: () => false,
      onNodesCleared() {}, clearBySource() {}
    },
    getCheatCoinCorrection: (category, route, value) => value,
    isCheatActive: () => false, isTsumInPlayArea: () => true,
    addScore(n) { this.score += n; }, addCoinBonus(n) { this.coinBonus += n; },
    calculateMixedClearScore: (count) => count * 150,
    calculateChainScore: (base, count) => base * count,
    enqueueCoinFlights() {}, enqueueSkillChargeFlight(x, y, t, weight) { this.charge += weight; },
    charge: 0, spawnPopParticles() {}, addFloatingText() {}, queueNaturalLargeTsum() {},
    recordCoingainClear() {}, flushPostChainCleanup() {}, noteAction() {},
    spawnReplacementTsums() { this.refills += 1; }, refills: 0,
    refreshRenderBodies() {},
    gameFeel: { emit() {}, setChain() {} }
  });
  game.skillRuntime = new SkillRuntimeManager(game, game.boardState);
  game.clearPipeline = new ClearPipeline(game, game.boardState, game.skillRuntime);
  game.inputRouter = new InputRouter(game, game.boardState, game.skillRuntime, game.clearPipeline);
  return game;
}
function activate(game) {
  return Game.SkillRegistry.laserWeave.onActivate(game.skillRuntime.createContext(Game.SkillRegistry.laserWeave, game.selectedSkillLevel));
}
function commit(game, nodes) {
  game.chain = nodes;
  game.dragging = true;
  nodes.forEach(n => { n.inChain = true; });
  game.finishChain();
}
function pair() {
  return {
    first: [node('a1', 40, 230), node('a2', 40, 280), node('a3', 40, 330)],
    second: [node('b1', 240, 230, other), node('b2', 240, 280, other), node('b3', 240, 330, other)]
  };
}

test('LASER WEAVE is selectable, keeps all six exact levels and a transparent 512px sprite', () => {
  assert.equal(type.score, 150);
  assert.equal(type.subEligible, false);
  assert.deepEqual(SKILL_TABLES.laserWeave.cost, Array(6).fill(17));
  assert.deepEqual(SKILL_TABLES.laserWeave.coinCorrectionType,
    ['correction_-5','correction_-4','correction_-4','correction_-3','correction_-3','correction_-2']);
  for (let level = 1; level <= 6; level++) {
    const game = harness([], level); const session = activate(game);
    assert.equal(session.remainingMs, (4 + level) * 1000);
    assert.equal(getLaserWeaveWidth(session), 14 + 5 * level);
    assert.equal(game.isGameplayInputLocked(), false);
    assert.equal(game.skillRuntime.pendingActivation, null);
  }
  const png = readFileSync(new URL('./tsum_image/LASER_WEAVE.png', import.meta.url));
  assert.equal(png.readUInt32BE(16), 512);
  assert.equal(png.readUInt32BE(20), 512);
  assert.equal(png[25], 6, 'RGBA image');
});

test('activation discards every bomb and held/deferred bomb without awards or explosions', () => {
  const game = harness();
  const bombs = ['normal', 'time', 'coin', 'score', 'star', 'moanaSpecial'].map(bombType => ({ bombType }));
  game.bombs = bombs; game.heldBombInput = { bomb: bombs[1] }; game.deferredSkillInput = { bomb: bombs[2] };
  activate(game);
  assert.deepEqual(game.bombs, []);
  assert.ok(bombs.every(bomb => bomb.dead));
  assert.equal(game.heldBombInput, null);
  assert.equal(game.deferredSkillInput.bomb, null);
  assert.equal(game.totalCleared, 0); assert.equal(game.coinBonus, 0); assert.equal(game.charge, 0);
});

test('first release retains moving physical Tsums, no awards, and follows current positions', () => {
  const { first, second } = pair(); const game = harness([...first, ...second]);
  const session = activate(game); commit(game, first);
  assert.equal(game.totalCleared, 0); assert.equal(game.pendingClear, null);
  assert.equal(game.actionLock, false);
  assert.ok(first.every(n => isBodyOccupying(n) && !n.inChain && !n.clearOccupying));
  assert.equal(first[0].vx, 2); assert.equal(game.isBodyMotionLocked(first[0]), false);
  assert.equal(game.getChainBehaviorForStart(first[0]), null);
  assert.equal(game.findChainStartTsumAt(first[0].x, first[0].y), null);
  assert.equal(game.canConnectWithChainRule({ allowedTypeIds: new Set([type.id]) }, second[0], first[0]), false);
  first[0].x += 35; first[2].y += 20;
  const beams = getLaserWeaveBeams(getLaserWeaveHeldNodes(game), second, getLaserWeaveWidth(session));
  assert.deepEqual(beams[0].start, { x: 75, y: 230 });
  assert.deepEqual(beams[1].start, { x: 40, y: 350 });
});

test('capsule boundaries use centers, include rounded ends, exclude the gap and double clears', () => {
  const { first, second } = pair();
  const beams = getLaserWeaveBeams(first, second, 20);
  const boundary = node('edge', 120, 240);
  const outside = node('outside', 120, 240.001, type, 100);
  const end = node('round-end', 250, 230);
  const gap = node('gap', 120, 280);
  const dead = { ...boundary, id: 'dead', dead: true };
  const bomb = { ...boundary, id: 'bomb', isBomb: true };
  const targets = collectLaserWeaveTargets([...first, ...second, boundary, outside, end, gap, dead, bomb], first, second, beams);
  assert.deepEqual(targets.map(n => n.id), [...first, ...second, boundary, end].map(n => n.id));
  const reversed = getLaserWeaveBeams(first, second.toReversed(), 500);
  assert.equal(new Set(collectLaserWeaveTargets([...first, ...second], first, second, reversed).map(n => n.id)).size, 6);
});

test('second release instantly clears the exact union, awards once, and immediately accepts next trace', () => {
  const { first, second } = pair(); const hit = node('hit', 140, 230);
  const gap = node('gap', 140, 280);
  const game = harness([...first, ...second, hit, gap]); const session = activate(game);
  commit(game, first); commit(game, second);
  assert.deepEqual(game.tsums, [gap]);
  assert.equal(game.totalCleared, 7); assert.equal(game.comboSystem.combo, 1);
  assert.equal(game.charge, 4); assert.equal(game.score, 7 * 150);
  assert.equal(game.coinBonus, COIN_CORRECTION_TABLE['correction_-4'][7]);
  assert.equal(getLaserWeaveWidth(session), 37);
  assert.equal(game.pendingClear, null); assert.equal(game.actionLock, false);
  assert.equal(game.laserWeaveVisual.bursts.length, 1);
  assert.equal(game.startChain(gap, gap), true);
});

test('short second traces and cancellation do not consume the held first chain or grow width', () => {
  const { first, second } = pair(); const game = harness([...first, ...second]); const session = activate(game);
  commit(game, first); commit(game, second.slice(0, 2));
  assert.equal(getLaserWeaveHeldNodes(game).length, 3); assert.equal(getLaserWeaveWidth(session), 29);
  assert.equal(game.totalCleared, 0);
  game.startChain(second[0], second[0]); game.cancelActiveChain();
  assert.equal(getLaserWeaveHeldNodes(game).length, 3);
  assert.equal(getLaserWeaveWidth(session), 29);
});

test('timeout settles only held chain normally and leaves the live second trace for normal release', () => {
  const { first, second } = pair(); const game = harness([...first, ...second]); const session = activate(game);
  commit(game, first); game.startChain(second[0], second[0]);
  game.skillRuntime.update(session.remainingMs);
  assert.equal(getLaserWeaveSession(game), null);
  assert.deepEqual(game.tsums, second); assert.equal(game.dragging, true);
  assert.equal(game.totalCleared, 3); assert.equal(game.charge, 3);
  assert.equal(game.laserWeaveVisual.bursts.length, 0);
  assert.equal(game.coinBonus, COIN_CORRECTION_TABLE.correction_0[3]);
  assert.notEqual(game.resolveGeneratedBombType(7), null, 'ordinary generation resumes');
});

test('reactivation settles the old chain once, resets width and timer; reset never awards', () => {
  const { first, second } = pair(); const game = harness([...first, ...second]); const old = activate(game);
  old.data.completedSets = 1000; assert.equal(getLaserWeaveWidth(old), 8029);
  commit(game, first); const fresh = activate(game);
  assert.equal(game.totalCleared, 3); assert.equal(getLaserWeaveWidth(fresh), 29);
  assert.equal(fresh.remainingMs, 7000); assert.equal(game.skillRuntime.sessions.length, 1);
  commit(game, second); resetLaserWeave(game);
  assert.equal(game.totalCleared, 3); assert.equal(getLaserWeaveSession(game), null);
  assert.equal(game.laserWeaveVisual, null); assert.ok(second.every(n => !n.removing));
});

test('bomb suppression is stamped into delayed clears even if they finalize after expiry', () => {
  const { first, second } = pair(); const game = harness([...first, ...second]); const session = activate(game);
  const request = game.clearPipeline.buildPreparedClear({ source: 'skill', targets: first, forcedBombType: 'time' });
  assert.equal(request.allowBomb, false);
  assert.equal(game.resolveGeneratedBombType(40, { forcedBombType: 'time' }), null);
  game.skillRuntime.endSession(session);
  assert.equal(game.resolveGeneratedBombType(40, request), null);
  assert.notEqual(game.resolveGeneratedBombType(40), null);
});

test('instant clear preserves an unrelated pending clear and its input lock', () => {
  const { first, second } = pair(); const game = harness([...first, ...second]); activate(game);
  const previous = { source: 'chain', sequentialChain: true, targets: [] };
  game.pendingClear = previous; game.actionLock = true;
  game.clearPipeline.beginClear({ source: 'skill', clearMode: 'simultaneous', targets: second, allowBomb: false });
  assert.equal(game.pendingClear, previous); assert.equal(game.actionLock, true);
  assert.equal(game.totalCleared, 3);
});

test('auto/CPU candidates skip reserved nodes and may choose a different chain type', () => {
  const { first, second } = pair(); const game = harness([...first, ...second]); game.role = 'cpu'; activate(game);
  commit(game, first);
  assert.deepEqual(game.getStrongestModeChainNodes(), second);
  assert.deepEqual(new Set(game.findBestAiChainNormal().map(n => n.id)), new Set(second.map(n => n.id)));
  commit(game, second); assert.equal(game.totalCleared, 6);
});

test('manual pause freezes skill/VFX age and visuals-off retains the required preview without particles', () => {
  const { first, second } = pair(); const game = harness([...first, ...second]); const session = activate(game);
  commit(game, first); game.paused = true;
  updateLaserWeaveVisuals(game, 1);
  assert.equal(game.laserWeaveVisual.activationAgeMs, 0); assert.equal(session.remainingMs, 7000);
  game.paused = false; game.skillVisualsEnabled = false; game.dragging = true; game.chain = second;
  const calls = [];
  const ctx = new Proxy({}, { get: (target, key) => target[key] ?? ((...args) => calls.push([key, ...args])), set: (target, key, value) => { target[key] = value; return true; } });
  drawLaserWeave(ctx, game, getRenderQualityProfile('minimal'));
  assert.ok(calls.some(call => call[0] === 'fill'), 'preview union fill remains');
  assert.equal(calls.filter(call => call[0] === 'arc' && call[3] === 14.5).length, 4, 'two 29px capsules');
  game.dragging = false; game.chain = []; commit(game, second);
  assert.equal(game.totalCleared, 6); assert.equal(game.laserWeaveVisual.bursts.length, 0);
});

test('LASER WEAVE feedback does not freeze/shake/flash the entire board', () => {
  const feel = new GameFeelController();
  feel.emit('clear', { effectiveClearCount: 45, visualPolicy: 'laserWeave' });
  assert.equal(feel.hitStop.life, 0); assert.equal(feel.shake.life, 0); assert.equal(feel.flash.life, 0);
  assert.equal(feel.particles.length, 0); assert.equal(feel.rings.length, 0);
  assert.equal(LASER_WEAVE_TUNING.maxParticles, 24);
});

test('missing audio and failed devices cannot interrupt gameplay; CPU remains silent', () => {
  const audio = new LaserWeaveAudio({ role: 'player', skillVisualsEnabled: true });
  assert.doesNotThrow(() => { audio.unlock(); audio.play('fire', 10000); audio.stop(); });
  const cpu = new LaserWeaveAudio({ role: 'cpu', skillVisualsEnabled: true });
  cpu.unlock(); assert.equal(cpu.context, null);
});
