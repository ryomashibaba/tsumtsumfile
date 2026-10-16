import test from 'node:test';
import assert from 'node:assert/strict';
import definition from './definition.js';
import { longestPath, getAutoChainSession, updateAutoChainClock } from './skill.js';
import { makeTdkGame } from '../../tdk/testing.mjs';
import { validateDefinition } from '../../tdk/core.js';
import { resolveDevelopmentLaunch } from '../../tdk/development.js';

function setup(count = 45) {
  const game = makeTdkGame(definition, 6);
  let clock = 0; game.autoChainNow = () => clock;
  game.tsums = game.tsums.slice(0, count);
  const tick = ms => { clock = ms; game.skillRuntime.update(16); };
  const activate = () => { assert.equal(game.skillRuntime.activate('autoChain', 6), true); return getAutoChainSession(game); };
  return { game, tick, activate, setClock: ms => { clock = ms; } };
}
function fixture(game, length) {
  game.tsums = game.tsums.slice(0, length);
  for (const [i, n] of game.tsums.entries()) {
    n.type = game.myTsum; n.x = 60 + (i % 10) * 28; n.y = 330 + Math.floor(i / 10) * 55;
    n.vx = 0; n.vy = 6; n.isLarge = false;
  }
  return game.tsums.slice();
}
const graph = (size, edges) => longestPath(Array.from({ length: size }, (_, i) => i),
  (a, b) => edges.some(([x, y]) => x === a && y === b || x === b && y === a),
  { minimum: 1, maxMs: Infinity });

test('AUTO CHAIN definition validates, development isolation, SL6-only launcher and runtime', () => {
  validateDefinition(definition);
  const { game } = setup();
  assert.equal(game.persistenceEnabled, false);
  assert.equal(game.getSelectableTsumTypes().some(t => t.id === 'autoChain'), false);
  assert.equal(game.skillSystem.maxCharge, 22);
  for (let level = 1; level < 6; level++) {
    assert.equal(game.skillRuntime.activate('autoChain', level), false);
    assert.throws(() => resolveDevelopmentLaunch(new URLSearchParams(`tdk=1&tsum=autoChain&sl=${level}`)), /SL6/);
  }
});
test('path search excludes unreachable branches rather than counting a connected group', () => {
  const r = graph(10, Array.from({ length: 9 }, (_, i) => [0, i + 1]));
  assert.equal(r.complete, true); assert.equal(r.chain.length, 3);
  assert.deepEqual(r.chain, [1, 0, 2]);
});
test('path search chooses the longest candidate and first equal candidate', () => {
  assert.deepEqual(graph(9, [[0,1],[1,2],[3,4],[4,5],[5,6],[6,7],[7,8]]).chain, [3,4,5,6,7,8]);
  assert.deepEqual(graph(6, [[0,1],[1,2],[3,4],[4,5]]).chain, [0,1,2]);
});
test('exhausted search never presents a partial candidate as the longest', () => {
  const r = longestPath(Array.from({length: 12}, (_, i) => i), () => true, { maxSteps: 1 });
  assert.equal(r.complete, false); assert.deepEqual(r.chain, []);
});
test('exact search matches exhaustive oracle on 100 deterministic small graphs', () => {
  let seed = 99;
  const random = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
  for (let trial = 0; trial < 100; trial++) {
    const n = 7, edges = [];
    for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) if (random() < .35) edges.push([a,b]);
    const linked = (a,b) => edges.some(([x,y]) => x===a && y===b || x===b && y===a);
    let best = [];
    function visit(path) {
      if (path.length > best.length) best = path.slice();
      for (let i=0;i<n;i++) if (!path.includes(i) && linked(path.at(-1), i)) visit([...path,i]);
    }
    for (let i=0;i<n;i++) visit([i]);
    assert.deepEqual(graph(n, edges).chain, best);
  }
});
for (const length of [9, 10, 12]) test(`falling ${length}-node path threshold, exact clear and 10% charge`, () => {
  const {game, tick, activate} = setup(); fixture(game, length); const session = activate();
  const coins = game.getCoinsByClearCount(length, 'autoChain', 'correction_0');
  tick(20);
  assert.equal(session.data.count, length >= 10 ? 1 : 0);
  assert.equal(game.totalCleared, length >= 10 ? length : 0);
  assert.equal(game.coinBonus, length >= 10 ? coins : 0);
  assert.equal(game.pendingClear, null); assert.equal(game.bombs.length, 0);
  game.updateSkillChargeFlights(2000);
  assert.ok(Math.abs(game.skillSystem.charge - (length >= 10 ? length * .1 : 0)) < 1e-8);
});
test('bombs are removed without explosion, scoring or collateral clear', () => {
  const {game, activate} = setup(); game.bombs = [{ x: 200, y: 350, dead: false }];
  const nodes = game.tsums.slice(); activate();
  assert.equal(game.bombs.length, 0); assert.deepEqual(game.tsums, nodes);
  assert.equal(game.totalCleared, 0); assert.equal(game.score, 0);
});
test('automatic path cancels an overlapping drag with no double award', () => {
  const {game, tick, activate} = setup(); const nodes = fixture(game, 12); const session = activate();
  game.startChain(nodes[0], nodes[0]);
  tick(20); const coins = game.coinBonus;
  assert.equal(game.dragging, false); assert.equal(session.data.count, 1);
  game.skillRuntime.dispatchChainCommit(nodes);
  assert.equal(game.totalCleared, 12); assert.equal(game.coinBonus, coins);
});
test('manual chain is instant, bomb-free, awards once and does not increment counter', () => {
  const {game, activate} = setup(); const nodes = fixture(game, 9); const session = activate();
  assert.equal(game.skillRuntime.dispatchChainCommit(nodes), true);
  assert.equal(game.totalCleared, 9); assert.equal(session.data.count, 0);
  assert.equal(game.pendingClear, null); assert.equal(game.bombs.length, 0);
  game.skillRuntime.dispatchChainCommit(nodes); assert.equal(game.totalCleared, 9);
});
test('manual commit gives automatic 10+ path priority', () => {
  const {game, activate} = setup(); const nodes = fixture(game, 12); const session = activate();
  game.skillRuntime.dispatchChainCommit(nodes);
  assert.equal(game.totalCleared, 12); assert.equal(session.data.count, 1);
});
test('board is reevaluated after each automatic clear', () => {
  const {game, tick, activate} = setup(); fixture(game, 12); const session = activate(); tick(20);
  fixture(game, 10); tick(40);
  assert.equal(session.data.count, 2); assert.equal(game.totalCleared, 22);
});
test('above-ceiling bodies do not qualify', () => {
  const {game, tick, activate} = setup(); const nodes = fixture(game, 12); nodes.forEach(n => n.y = 80);
  const session = activate(); tick(20); assert.equal(session.data.count, 0);
});
test('real wall clock expires at 10s even when runtime gameplay delta is zero', () => {
  const {game, activate, setClock} = setup(); const session = activate();
  setClock(9999); game.skillRuntime.update(0); assert.equal(session.data.phase, 'active');
  setClock(10000); game.skillRuntime.update(0); assert.equal(session.data.phase, 'finish');
});
test('normal game clock keeps running during AUTO CHAIN', () => {
  const {game, activate} = setup(); activate(); const before = game.timeRemaining;
  game.update(.1); assert.ok(game.timeRemaining < before);
  assert.deepEqual(game.getCurrentGameplayPauseState(), {clockPaused:false, physicsPaused:false});
});
for (const [limit, count] of [[45,11], [53,11], [45,20], [45,60], [45,0]]) test(`finish ${count}×5 from limit ${limit}: containment, reward, resize and restore`, () => {
  const {game, activate, tick} = setup();
  if (limit === 53) { game.cheatSettings.enabled = true; game.cheatSettings.boardTarget = 53; }
  const radius = game.getConfiguredTsumRadius(), beforeLimit = game.getTargetBodyCount();
  const settings = JSON.stringify(game.cheatSettings);
  const session = activate(); session.data.count = count;
  tick(10000); assert.equal(session.data.phase, 'finish');
  assert.equal(game.isGameplayInputLocked(), true);
  const targetCount = count*5;
  const before = game.totalCleared;
  tick(10760); assert.equal(game.totalCleared, before);
  assert.ok(session.data.slots.every(s => game.isTsumInPlayArea(s.node)));
  tick(10959); assert.equal(game.totalCleared, before);
  tick(10960);
  assert.equal(game.totalCleared, before+targetCount);
  assert.equal(game.autoChainLastResult.finishCount, targetCount);
  assert.equal(game.autoChainLastResult.containedWaitMs, 200);
  assert.equal(game.coinBonus, targetCount ? game.getCoinsByClearCount(targetCount,'autoChain','correction_0') : 0);
  assert.equal(game.comboSystem.combo, targetCount ? 1 : 0);
  assert.equal(game.getConfiguredTsumRadius(), radius);
  assert.equal(game.getTargetBodyCount(), beforeLimit);
  assert.equal(JSON.stringify(game.cheatSettings), settings);
  assert.equal(game.autoChainCapacity, undefined);
  assert.equal(getAutoChainSession(game), undefined);
  assert.equal(game.bombs.length, 0);
  assert.ok(game.tsums.length <= Math.max(limit, 45));
});
test('time-up holds result screen until finish has awarded its clear', () => {
  const {game, activate, tick, setClock} = setup(); const session = activate(); session.data.count = 11;
  game.timeRemaining = .01; setClock(50); game.update(.02);
  assert.equal(game.timeUp, true); assert.equal(session.data.phase, 'finish');
  game.finishRun(); assert.equal(game.state, 'playing');
  tick(810); tick(1010); assert.equal(game.totalCleared, 55);
  game.coinFlights = []; game.finishRun(); assert.equal(game.runFinished, true);
});
test('reset during expanded finish restores configuration and leaves no extra bodies', () => {
  const {game, activate, tick} = setup(); const radius = game.getConfiguredTsumRadius();
  activate().data.count=20; tick(10000); assert.equal(game.tsums.length, 100);
  game.skillRuntime.reset();
  assert.equal(game.getTargetBodyCount(),45); assert.equal(game.getConfiguredTsumRadius(),radius);
  assert.equal(game.autoChainCapacity,undefined); assert.equal(game.tsums.length,45);
  assert.ok(game.tsums.every(n=>n.radius===radius));
});
test('strongest candidate selection is capped at 9 only during active skill', () => {
  const {game, activate} = setup(); fixture(game,12);
  const before = game.findStrongestModeBestChain(); assert.ok(before.length>=10);
  const session = activate();
  assert.equal(game.findStrongestModeBestChain().length,9);
  game.skillRuntime.endSession(session,'cancelled');
  assert.ok(game.findStrongestModeBestChain().length>=10);
});

test('dense 20-node clique with a hub and two leaves proves longest path without factorial search', () => {
  const nodes = Array.from({length:23}, (_,i)=>i);
  const connected = (a,b) => a!==b && (a<20&&b<20 || a===20 || b===20);
  const result = longestPath(nodes,connected,{maxMs:Infinity});
  assert.equal(result.complete,true);assert.equal(result.chain.length,22);
  assert.ok(result.steps<2000);
});

test('finish queues exactly 10% of real my-tsum bodies and calls chain scoring once', () => {
  const {game,activate,tick}=setup();const session=activate();session.data.count=11;
  const calls=[];let myCount=0;
  const score=game.calculateChainScore.bind(game);
  game.calculateChainScore=(base,length)=>{calls.push(length);return score(base,length);};
  const clear=game.clearPipeline.beginClear.bind(game.clearPipeline);
  game.clearPipeline.beginClear=spec=>{myCount=spec.targets.filter(n=>game.boardState.getResolvedType(n).id===game.myTsum.id).length;assert.equal(spec.chargeMultiplier,.1);return clear(spec);};
  tick(10000);tick(10760);tick(10960);game.updateSkillChargeFlights(2000);
  assert.deepEqual(calls,[55]);assert.ok(Math.abs(game.skillSystem.charge-myCount*.1)<1e-8);
});
