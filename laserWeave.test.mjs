import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Game, ClearPipeline, InputRouter, SkillRuntimeManager } from './game.js';
import { TSUM_TYPES, SKILL_TABLES, COIN_CORRECTION_TABLE } from './config.js';
import { GameFeelController } from './gameFeel.js';
import { isBodyOccupying } from './bodyLifecycle.js';
import { getRenderQualityProfile } from './renderQuality.js';
import { LaserWeaveAudio } from './laserWeaveAudio.js';
import { UIRenderer } from './ui.js';
import { distancePointToSegment } from './clearGeometry.js';
import {
  getLaserWeaveSession, getLaserWeaveHeldNodes, getLaserWeaveWidth, getLaserWeaveBeams,
  collectLaserWeaveTargets, isLaserWeaveHeld, resetLaserWeave, updateLaserWeaveVisuals,
  drawLaserWeave, isLaserWeaveFiring, LASER_WEAVE_TUNING
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
  assert.equal(beams[0].start.y, 230);
  assert.ok(beams[0].start.x < 0 && beams[0].end.x > 414);
  for (const [index, anchors] of [[0, [first[0], second[0]]], [1, [first.at(-1), second.at(-1)]]]) {
    for (const anchor of anchors) assert.ok(distancePointToSegment(anchor, beams[index].start, beams[index].end) < 1e-8);
  }
});

test('full-board horizontal bands use body contacts, reach both edges, exclude the gap and double clears', () => {
  const { first, second } = pair();
  const beams = getLaserWeaveBeams(first, second, 20);
  const boundary = node('edge', 120, 240);
  const outside = node('outside', 120, 262, type, 10);
  const end = node('right-edge', 414, 230);
  const left = node('left-edge', 0, 230);
  const gap = node('gap', 120, 280);
  const dead = { ...boundary, id: 'dead', dead: true };
  const bomb = { ...boundary, id: 'bomb', isBomb: true };
  const targets = collectLaserWeaveTargets([...first, ...second, boundary, outside, end, left, gap, dead, bomb], first, second, beams);
  assert.deepEqual(targets.map(n => n.id), [...first, ...second, boundary, end, left].map(n => n.id));
  const reversed = getLaserWeaveBeams(first, second.toReversed(), 500);
  assert.equal(new Set(collectLaserWeaveTargets([...first, ...second], first, second, reversed).map(n => n.id)).size, 6);
});

test('laser contact uses actual body radius instead of requiring the center line', () => {
  const first = [node('a', 40, 230), node('c', 40, 390)];
  const second = [node('b', 240, 230), node('d', 240, 390)];
  const beams = getLaserWeaveBeams(first, second, 43);
  const touch = node('touch', 140, 260);
  const miss = node('miss', 140, 262);
  assert.deepEqual(collectLaserWeaveTargets([touch, miss], [], [], beams).map(n => n.id), ['touch']);
  assert.deepEqual(collectLaserWeaveTargets([touch, miss], [], [], beams, () => 0), []);
});

test('SL6 synthetic 45-Tsum board footprint expands without changing coin coefficients', () => {
  const first = [node('a', 70, 230), node('c', 70, 430)];
  const second = [node('b', 320, 230), node('d', 320, 430)];
  const before = getLaserWeaveBeams(first, second, 44);
  const after = getLaserWeaveBeams(first, second, 64);
  let rng = 73;
  const random = () => {
    rng = (Math.imul(rng, 1664525) + 1013904223) >>> 0;
    return rng / 0x100000000;
  };
  let oldHits = 0, improvedHits = 0;
  for (let sample = 0; sample < 128; sample++) {
    const board = [];
    while (board.length < 45) {
      const x = random() * 414, y = 140 + random() * 440;
      if (((x - 207) / 207) ** 2 + ((y - 360) / 220) ** 2 > 1) continue;
      board.push(node('probe-' + board.length, x, y, type, 29));
    }
    oldHits += board.filter(n => before.some(beam =>
      distancePointToSegment(n, beam.start, beam.end) <= beam.width / 2)).length;
    improvedHits += collectLaserWeaveTargets(board, [], [], after).length;
  }
  assert.ok(improvedHits > oldHits * 2, `synthetic geometry ${oldHits} -> ${improvedHits}`);
  assert.deepEqual(SKILL_TABLES.laserWeave.coinCorrectionType,
    ['correction_-5','correction_-4','correction_-4','correction_-3','correction_-3','correction_-2']);
});

test('diagonal lasers extend through both anchor pairs to board edges in either direction', () => {
  const first = [node('a', 150, 250), node('z', 150, 350)];
  const second = [node('b', 250, 350), node('y', 250, 250)];
  const hits = [node('top', 40, 140), node('right', 414, 514), node('left', 0, 500), node('bottom', 400, 500)];
  const gap = node('gap', 250, 300);
  const offscreen = node('above-board', 0, 100);
  for (const [a, b] of [[first, second], [second, first]]) {
    const beams = getLaserWeaveBeams(a, b, 20);
    assert.deepEqual(collectLaserWeaveTargets([...hits, gap, offscreen], [], [], beams), hits);
    for (const [index, anchors] of [[0, [a[0], b[0]]], [1, [a.at(-1), b.at(-1)]]]) {
      assert.ok(anchors.every(anchor => distancePointToSegment(anchor, beams[index].start, beams[index].end) < 1e-8));
    }
  }
});

test('vertical, coincident and unlimited-width beams stay finite and cover the displayed board', () => {
  const first = [node('a', 200, 200), node('z', 240, 200)];
  const second = [node('b', 200, 300), node('y', 240, 300)];
  const top = node('top', 200, 140); const bottom = node('bottom', 240, 580); const gap = node('gap', 220, 400);
  const beams = getLaserWeaveBeams(first, second, 20);
  assert.deepEqual(collectLaserWeaveTargets([top, bottom, gap], [], [], beams), [top, bottom]);
  const same = getLaserWeaveBeams(first, first, 20);
  assert.ok(same.every(beam => Number.isFinite(beam.start.x) && Number.isFinite(beam.end.y)));
  assert.deepEqual(collectLaserWeaveTargets([node('left', 0, 200), node('right', 414, 200)], [], [], same).map(n => n.id), ['left', 'right']);
  const corners = [node('tl', 0, 140), node('tr', 414, 140), node('bl', 0, 580), node('br', 414, 580)];
  assert.deepEqual(collectLaserWeaveTargets(corners, [], [], getLaserWeaveBeams(first, second, 10000)), corners);
});

test('second release clears the union once, holds only clocks, and accepts next trace after the firing phase', () => {
  const { first, second } = pair(); const hit = node('hit', 140, 230);
  const gap = node('gap', 140, 280);
  const game = harness([...first, ...second, hit, gap]); const session = activate(game);
  commit(game, first); commit(game, second);
  assert.deepEqual(game.tsums, [gap]);
  assert.equal(game.totalCleared, 7); assert.equal(game.comboSystem.combo, 1);
  assert.equal(game.charge, 4); assert.equal(game.score, 7 * 150);
  assert.equal(game.coinBonus, COIN_CORRECTION_TABLE['correction_-4'][7]);
  assert.equal(getLaserWeaveWidth(session), 55);
  assert.equal(game.pendingClear, null); assert.equal(game.actionLock, false);
  assert.equal(game.laserWeaveVisual.bursts.length, 1);
  assert.equal(game.isGameplayInputLocked(), true);
  assert.deepEqual(game.getCurrentGameplayPauseState(), { clockPaused: true, physicsPaused: false });
  assert.equal(game.startChain(gap, gap), false);
  game.skillRuntime.updateRaw(LASER_WEAVE_TUNING.tailMs);
  assert.equal(game.isGameplayInputLocked(), false);
  assert.equal(game.startChain(gap, gap), true);
});

test('two-node chains fire only while LASER WEAVE is active; near-contact nodes join clear', () => {
  const first = [node('a', 40, 230), node('c', 40, 390)];
  const second = [node('b', 240, 230, other), node('d', 240, 390, other)];
  const touch = node('touch', 140, 260);
  const miss = node('miss', 140, 262);
  const game = harness([...first, ...second, touch, miss]);
  commit(game, first);
  assert.equal(game.totalCleared, 0, 'ordinary two-node chains must not clear');
  const session = activate(game);
  commit(game, first);
  assert.equal(getLaserWeaveHeldNodes(game).length, 2);
  assert.equal(game.totalCleared, 0);
  commit(game, second);
  assert.equal(game.totalCleared, 5);
  assert.deepEqual(game.tsums, [miss]);
  assert.equal(getLaserWeaveWidth(session), 55);
  assert.equal(game.coinBonus, COIN_CORRECTION_TABLE['correction_-4'][5]);
});

test('an unfinished two-node reservation times out without free normal clear rewards', () => {
  const first = [node('a', 40, 230), node('b', 40, 300)];
  const game = harness(first);
  const session = activate(game);
  commit(game, first);
  game.skillRuntime.update(session.remainingMs);
  assert.equal(getLaserWeaveSession(game), null);
  assert.equal(game.totalCleared, 0);
  assert.equal(game.coinBonus, 0);
  assert.deepEqual(game.tsums, first);
});

test('release includes Tsums beyond the original anchor segments in the same simultaneous clear', () => {
  const { first, second } = pair();
  const left = node('left-extension', 10, 230); const right = node('right-extension', 400, 330, other);
  const game = harness([...first, ...second, left, right]); const session = activate(game);
  commit(game, first); commit(game, second);
  assert.deepEqual(game.tsums, []);
  assert.equal(game.totalCleared, 8); assert.equal(game.comboSystem.combo, 1);
  assert.equal(game.score, 8 * 150);
  assert.equal(game.coinBonus, COIN_CORRECTION_TABLE['correction_-4'][8]);
  assert.equal(getLaserWeaveWidth(session), 55);
  assert.ok(game.laserWeaveVisual.bursts[0].beams.every(beam => beam.start.x < 0 && beam.end.x > 414));
});

function enableUpdates(game) {
  Object.assign(game, {
    elapsed: 0, displayedScore: 0, timeRemaining: 20, fanCooldown: 0, fanPulse: 0,
    tempLockTimer: 0, physicsAccumulator: 0, strongestModeEnabled: false,
    skillButtonFeedback: { timer: 0 },
    coinFlights: [], updateCoinFlights() {}, updateEffects() {}, updateSkillChargeFlights() {}, updateAiAutoPlay() {},
    skillSystem: { ready: false, update() {} },
    isSkillReadyForActivation: () => false,
    physicsSteps: 0,
    stepPhysicsFrame() { this.physicsSteps += 1; for (const node of this.tsums) node.y += 0.45; }
  });
  for (const n of game.tsums) n.update = () => {};
  game.gameFeel.enabled = true; game.gameFeel.update = () => {}; game.gameFeel.syncSkillReady = () => {};
  game.feverSystem.update = () => {}; game.comboSystem.update = () => {};
}

test('actual update keeps gravity/VFX moving during 180ms while game and skill clocks stop', () => {
  const { first, second } = pair(); const spare = node('spare', 150, 290);
  const game = harness([...first, ...second, spare]); const session = activate(game);
  commit(game, first); commit(game, second); enableUpdates(game);
  const y = spare.y;
  for (let frame = 0; frame < 4; frame++) game.update(0.05);
  assert.equal(game.timeRemaining, 20);
  assert.equal(session.remainingMs, 7000);
  assert.ok(spare.y > y); assert.ok(game.physicsSteps > 0);
  assert.equal(game.laserWeaveVisual.bursts.length, 1, 'afterimage persists beyond input hold');
  assert.equal(isLaserWeaveFiring(game), false);
  assert.equal(game.isGameplayInputLocked(), false);
  game.update(0.05);
  assert.equal(game.timeRemaining, 19.95);
  assert.equal(session.remainingMs, 6950);
  for (let frame = 0; frame < 4; frame++) game.update(0.05);
  assert.equal(game.laserWeaveVisual.bursts.length, 0);
});

test('manual pause holds the firing phase and switching visuals off releases it immediately', () => {
  const { first, second } = pair(); const spare = node('spare', 150, 290);
  const game = harness([...first, ...second, spare]); activate(game);
  commit(game, first); commit(game, second); enableUpdates(game);
  game.paused = true; const y = spare.y; game.update(0.2);
  assert.equal(game.skillRuntime.timingPauses[0].remainingMs, 180);
  assert.equal(game.laserWeaveVisual.bursts[0].ageMs, 0); assert.equal(spare.y, y);
  game.saveProgress = () => {}; game.toggleSkillVisuals();
  assert.equal(isLaserWeaveFiring(game), false); assert.equal(game.isGameplayInputLocked(), false);
  game.paused = false; game.update(0.05);
  assert.equal(game.timeRemaining, 19.95); assert.equal(game.laserWeaveVisual.bursts.length, 0);
});

test('zero game time with coin flights still advances the firing phase and falling board before result', () => {
  const { first, second } = pair(); const spare = node('spare', 150, 290);
  const game = harness([...first, ...second, spare]); const session = activate(game);
  commit(game, first); commit(game, second); enableUpdates(game);
  game.timeRemaining = 0; game.timeUp = true; game.coinFlights = [{}]; game.updateCoinFlights = () => {};
  game.finishRun();
  assert.equal(game.runFinished, undefined); assert.equal(getLaserWeaveSession(game), session);
  const y = spare.y; game.update(0.1);
  assert.equal(game.skillRuntime.timingPauses[0].remainingMs, 80);
  assert.ok(spare.y > y); assert.equal(session.remainingMs, 7000);
  game.skillRuntime.updateRaw(80); game.finishRun();
  assert.equal(getLaserWeaveSession(game), null);
  assert.equal(game.runFinished, undefined, 'coin collection still finishes before results');
});

test('firing reset clears only LASER WEAVE timing and previews remain available in minimal quality', () => {
  const { first, second } = pair(); const game = harness([...first, ...second]); activate(game);
  commit(game, first); commit(game, second);
  const calls = [];
  const ctx = new Proxy({}, { get: (target, key) => target[key] ?? ((...args) => calls.push([key, ...args])), set: (target, key, value) => { target[key] = value; return true; } });
  drawLaserWeave(ctx, game, getRenderQualityProfile('minimal'));
  assert.ok(calls.some(call => call[0] === 'clip'), 'basic two-line burst survives minimal quality');
  game.skillRuntime.startTimingPause({ durationMs: 100, pauseClock: true }, { skillId: 'anotherSkill' });
  resetLaserWeave(game);
  assert.equal(game.skillRuntime.timingPauses.length, 1);
  assert.equal(game.skillRuntime.timingPauses[0].skillId, 'anotherSkill');
});

test('single-node second traces and cancellation do not consume the held first chain or grow width', () => {
  const { first, second } = pair(); const game = harness([...first, ...second]); const session = activate(game);
  commit(game, first); commit(game, second.slice(0, 1));
  assert.equal(getLaserWeaveHeldNodes(game).length, 3); assert.equal(getLaserWeaveWidth(session), 43);
  assert.equal(game.totalCleared, 0);
  game.startChain(second[0], second[0]); game.cancelActiveChain();
  assert.equal(getLaserWeaveHeldNodes(game).length, 3);
  assert.equal(getLaserWeaveWidth(session), 43);
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
  old.data.completedSets = 1000; assert.equal(getLaserWeaveWidth(old), 12043);
  commit(game, first); const fresh = activate(game);
  assert.equal(game.totalCleared, 3); assert.equal(getLaserWeaveWidth(fresh), 43);
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
  assert.equal(calls.filter(call => call[0] === 'arc' && call[3] === 21.5).length, 4, 'two 43px capsules');
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

test('both cutting cores stay bright at 100ms, then fade within the 400ms clock pause', () => {
  const { first, second } = pair(); const game = harness([...first, ...second]); activate(game);
  commit(game, first); commit(game, second);
  const strokes = [];
  const ctx = new Proxy({}, {
    get: (target, key) => key === 'stroke' ? () => strokes.push({ width: target.lineWidth, alpha: target.globalAlpha }) : target[key] ?? (() => {}),
    set: (target, key, value) => { target[key] = value; return true; }
  });
  for (const [age, minimum, maximum] of [[100, 0.9, 1], [200, 0.7, 0.9], [390, 0, 0.05]]) {
    strokes.length = 0; game.laserWeaveVisual.bursts[0].ageMs = age;
    drawLaserWeave(ctx, game, getRenderQualityProfile('minimal'));
    const cores = strokes.filter(stroke => Math.abs(stroke.width - 29 * 0.4) < 1e-8);
    assert.equal(cores.length, 2);
    assert.ok(cores.every(stroke => stroke.alpha >= minimum && stroke.alpha <= maximum));
  }
});

test('the actual timer HUD shows HOLD during firing and returns to TIME afterward', () => {
  const { first, second } = pair(); const game = harness([...first, ...second]); activate(game);
  commit(game, first); commit(game, second);
  Object.assign(game, { timeRemaining: 20, gameDuration: 60, displayedScore: 0, getDisplayedRunCoins: () => 0 });
  const renderer = Object.assign(Object.create(UIRenderer.prototype), {
    game, drawStitchedRoundedRect() {}, drawButton() {}, drawCoingainStatusPanel() {}, drawBattleStatusPanel() {}
  });
  const labels = [];
  const ctx = new Proxy({}, { get: (target, key) => target[key] ?? (key === 'fillText' ? text => labels.push(text) : key.startsWith('create') ? () => ({ addColorStop() {} }) : () => {}), set: (target, key, value) => { target[key] = value; return true; } });
  renderer.drawTopHUDReal(ctx);
  assert.ok(labels.includes('HOLD')); assert.ok(!labels.includes('TIME'));
  game.skillRuntime.updateRaw(400); labels.length = 0;
  renderer.drawTopHUDReal(ctx);
  assert.ok(labels.includes('TIME')); assert.ok(!labels.includes('HOLD'));
});

test('missing audio and failed devices cannot interrupt gameplay; CPU remains silent', () => {
  const audio = new LaserWeaveAudio({ role: 'player', skillVisualsEnabled: true });
  assert.doesNotThrow(() => { audio.unlock(); audio.play('fire', 10000); audio.stop(); });
  const cpu = new LaserWeaveAudio({ role: 'cpu', skillVisualsEnabled: true });
  cpu.unlock(); assert.equal(cpu.context, null);
});
