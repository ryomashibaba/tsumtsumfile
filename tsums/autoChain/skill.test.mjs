import test from 'node:test';
import assert from 'node:assert/strict';
import definition from './definition.js';
import { longestPath, findAutomaticPath, getAutoChainSession, updateAutoChainClock } from './skill.js';
import { makeTdkGame } from '../../tdk/testing.mjs';
import { validateDefinition } from '../../tdk/core.js';
import { resolveDevelopmentLaunch } from '../../tdk/development.js';
import { FIELD_CENTER_Y } from '../../config.js';

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

test('AUTO CHAIN is selectable in the public game and remains SL6-only', () => {
  validateDefinition(definition);
  const { game } = setup();
  assert.equal(game.persistenceEnabled, false);
  assert.equal(game.getSelectableTsumTypes().some(t => t.id === 'autoChain'), true);
  assert.equal(game.skillSystem.maxCharge, 22);
  for (let level = 1; level < 6; level++) {
    assert.equal(game.skillRuntime.activate('autoChain', level), false);
    assert.throws(() => resolveDevelopmentLaunch(new URLSearchParams(`tdk=1&tsum=autoChain&sl=${level}`)), /SL6/);
  }
});
test('selecting AUTO CHAIN locks its skill level to SL6', () => {
  const { game } = setup();
  game.selectTsum('autoChain', 1);
  assert.equal(game.myTsum.id, 'autoChain');
  assert.equal(game.selectedSkillLevel, 6);
  assert.equal(game.skillSystem.maxCharge, 22);
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
for (const length of [9, 10, 12]) test(`falling ${length}-node path threshold, usable clear and 10% charge`, () => {
  const {game, tick, activate} = setup(); fixture(game, length); const session = activate();
  const cleared = length >= 10 ? 10 : 0;
  const coins = game.getCoinsByClearCount(cleared, 'autoChain', 'correction_0');
  tick(20);
  assert.equal(session.data.count, length >= 10 ? 1 : 0);
  assert.equal(game.totalCleared, cleared);
  assert.equal(game.coinBonus, length >= 10 ? coins : 0);
  assert.equal(game.pendingClear, null); assert.equal(game.bombs.length, 0);
  game.updateSkillChargeFlights(2000);
  assert.ok(Math.abs(game.skillSystem.charge - cleared * .1) < 1e-8);
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
  assert.equal(game.totalCleared, 10); assert.equal(game.coinBonus, coins);
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
  assert.equal(game.totalCleared, 10); assert.equal(session.data.count, 1);
});
test('board is reevaluated after each automatic clear', () => {
  const {game, tick, activate} = setup(); fixture(game, 12); const session = activate(); tick(20);
  fixture(game, 10); tick(40);
  assert.equal(session.data.count, 2); assert.equal(game.totalCleared, 20);
});
for (const [pathLength, expected] of [[20, [10, 10]], [24, [10, 14]], [39, [10, 10, 19]]]) {
  test(`automatic ${pathLength}-node path clears as ${expected.join('+')}`, () => {
    const {game, tick, activate} = setup(pathLength);
    fixture(game, pathLength);
    game.canConnectWithChainRule = () => true;
    const session = activate();
    const clearLengths = [];
    const beginClear = game.clearPipeline.beginClear.bind(game.clearPipeline);
    game.clearPipeline.beginClear = spec => {
      clearLengths.push(spec.targets.length);
      return beginClear(spec);
    };

    tick(20);

    assert.deepEqual(clearLengths, expected);
    assert.equal(session.data.count, expected.length);
    assert.equal(game.totalCleared, pathLength);
  });
}
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
  const {game, activate} = setup(); fixture(game,12).forEach(n => n.y += 80);
  const before = game.findStrongestModeBestChain(); assert.ok(before.length>=10);
  const session = activate();
  assert.equal(game.findStrongestModeBestChain().length,9);
  game.skillRuntime.endSession(session,'cancelled');
  assert.ok(game.findStrongestModeBestChain().length>=10);
});

test('strongest candidates require every center in the lower half and preserve stricter options', () => {
  const {game, activate} = setup(); const nodes = fixture(game, 9);
  nodes.forEach((n, i) => { n.x = 120 + i * 20; n.y = FIELD_CENTER_Y; });
  activate();
  assert.ok(game.findStrongestModeChain().length >= 3);
  nodes[4].y = FIELD_CENTER_Y - 0.01;
  const chain = game.findStrongestModeChain();
  assert.ok(chain.length >= 3);
  assert.ok(chain.every(n => n.y >= FIELD_CENTER_Y));
  assert.ok(!chain.includes(nodes[4]));
  assert.equal(game.findStrongestModeBestChain({minY: FIELD_CENTER_Y + 1}).length, 0);
  assert.equal(game.findStrongestModeBestChain({maxLength: 4, minY: 0, filterNode: n => n !== nodes[0]}).length, 4);
  assert.ok(!game.findStrongestModeBestChain({filterNode: n => n !== nodes[0]}).includes(nodes[0]));
});

test('strongest mode waits without an eligible lower chain and restores upper candidates after skill', () => {
  const {game, activate} = setup(); const nodes = fixture(game, 9);
  nodes.forEach((n, i) => { n.x = 120 + i * 20; n.y = FIELD_CENTER_Y - 1; });
  assert.ok(game.findStrongestModeChain().length >= 3);
  const session = activate();
  assert.deepEqual(game.findStrongestModeChain(), []);
  assert.equal(game.performStrongestModeChains(game.findStrongestModeChain()), false);
  assert.equal(game.totalCleared, 0);
  game.skillRuntime.endSession(session, 'cancelled');
  assert.ok(game.findStrongestModeChain().length >= 3);
});

test('strongest execution rejects a moved center or oversized chain before input starts', () => {
  const {game, activate} = setup(); const nodes = fixture(game, 12);
  nodes.forEach(n => n.y = FIELD_CENTER_Y);
  activate();
  const chain = game.findStrongestModeChain();
  assert.equal(chain.length, 9);
  chain[4].y = FIELD_CENTER_Y - 0.01;
  let starts = 0;
  game.startChain = () => { starts++; return false; };
  assert.equal(game.performStrongestModeChain(chain), false);
  chain[4].y = FIELD_CENTER_Y;
  assert.equal(game.performStrongestModeChain(nodes.slice(0, 10)), false);
  assert.equal(starts, 0);
  assert.equal(game.totalCleared, 0);
  assert.equal(game.performStrongestModeChain(chain), false);
  assert.equal(starts, 1);
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

test('automatic search returns a usable path without proving the longest', () => {
  const nodes = Array.from({length: 60}, (_, i) => i);
  const connected = (a, b) => a !== b && (a < 20 && b < 20 || a === 20 || b === 20);
  assert.equal(longestPath(nodes, connected, {maxSteps: 1000, maxMs: Infinity}).complete, false);
  const result = findAutomaticPath(nodes, connected, {maxSteps: 1000, maxMs: Infinity});
  assert.ok(result.chain.length >= 10);
  assert.equal(new Set(result.chain).size, result.chain.length);
  assert.ok(result.chain.every((n, i) => i === 0 || connected(result.chain[i - 1], n)));
});

test('budget includes adjacency construction and moves past an expensive starting node', () => {
  const nodes = Array.from({length: 20}, (_, i) => i);
  const connected = (a, b) => a !== b && (a < 9 && b < 9 || a >= 9 && b >= 9 && Math.abs(a - b) === 1);
  let calls = 0;
  let result = findAutomaticPath(nodes, (a, b) => { calls++; return connected(a, b); }, {maxSteps: 300, maxMs: Infinity});
  assert.equal(result.complete, false);
  assert.deepEqual(result.chain, []);
  assert.ok(calls <= 300);
  for (let retry = 0; retry < 20 && !result.chain.length; retry++) {
    result = findAutomaticPath(nodes, connected, {startIndex: result.nextStart, maxSteps: 300, maxMs: Infinity});
  }
  assert.ok(result.chain.length >= 10);
  assert.ok(result.chain.every(n => n >= 9));
  const timedOut = findAutomaticPath(nodes, () => { throw new Error('budget must precede graph work'); }, {maxMs: 0});
  assert.equal(timedOut.complete, false);
  assert.deepEqual(timedOut.chain, []);
});

test('a connected star with ten bodies is not a ten-node automatic chain', () => {
  const nodes = Array.from({length: 10}, (_, i) => i);
  const result = findAutomaticPath(nodes, (a, b) => a !== b && (a === 0 || b === 0), {maxMs: Infinity});
  assert.deepEqual(result.chain, []);
  assert.equal(result.complete, true);
});

for (const limit of [45, 53, 100, 999, 'unlimited']) test(`automatic clears continue with real cheat board target ${limit}`, () => {
  const {game, activate, tick} = setup();
  game.updateCheatSettings({enabled: true, boardTarget: limit, tsumDiameter: 12, myTsumChance: 100});
  const count = limit === 'unlimited' ? 120 : limit;
  game.spawnTsumBatch(count - game.tsums.length, count);
  assert.equal(game.tsums.length, count);
  for (const [i, node] of game.tsums.entries()) {
    node.type = game.myTsum;
    node.x = 70 + i % 40 * 7;
    node.y = 300 + Math.floor(i / 40) * 8;
  }
  const session = activate();
  for (let i = 1; i <= 30 && game.totalCleared < 20; i++) tick(i * 16);
  assert.ok(game.totalCleared >= 20);
  assert.ok(session.data.count >= 2);
  assert.equal(game.getTargetBodyCount(), limit === 'unlimited' ? Infinity : limit);
  const settings = JSON.stringify(game.cheatSettings);
  tick(10000); tick(10760); tick(10960);
  assert.equal(game.autoChainLastResult.finishCount, session.data.count * 5);
  assert.equal(getAutoChainSession(game), undefined);
  assert.equal(JSON.stringify(game.cheatSettings), settings);
  assert.equal(game.autoChainCapacity, undefined);
});

test('target changes during the skill take effect without restarting the session', () => {
  const {game, activate, tick} = setup();
  game.updateCheatSettings({enabled: true, boardTarget: 53});
  fixture(game, 10);
  const session = activate(); tick(20);
  assert.equal(session.data.count, 1);
  game.updateCheatSettings({boardTarget: 100});
  game.spawnTsumBatch(10, 100); fixture(game, 10); tick(40);
  assert.equal(session.data.count, 2);
  game.updateCheatSettings({boardTarget: 9});
  game.spawnTsumBatch(9, 9); fixture(game, 9); tick(60);
  assert.equal(session.data.count, 2);
  game.skillRuntime.reset();
  assert.equal(game.getTargetBodyCount(), 9);
  assert.equal(game.autoChainCapacity, undefined);
});

for (const excluded of ['dead', 'removing', 'clearOccupying', 'isBomb', 'frozen', 'outside']) {
  test(`automatic chain excludes ${excluded} bodies`, () => {
    const {game, activate, tick} = setup();
    const nodes = fixture(game, 10);
    if (excluded === 'frozen') game.boardState.isFrozen = n => n === nodes[0];
    else if (excluded === 'outside') nodes[0].y = 80;
    else nodes[0][excluded] = true;
    const session = activate(); tick(20);
    assert.equal(session.data.count, 0);
    assert.equal(game.totalCleared, 0);
  });
}

for (const change of ['removed', 'disconnected', 'deadline', 'rejected']) {
  test(`automatic clear rechecks ${change} and counts only successful groups`, () => {
    const {game, activate, tick, setClock} = setup();
    const nodes = fixture(game, 20);
    game.canConnectWithChainRule = () => true;
    const session = activate();
    const beginClear = game.clearPipeline.beginClear.bind(game.clearPipeline);
    game.clearPipeline.beginClear = spec => {
      if (change === 'rejected') return false;
      const result = beginClear(spec);
      if (change === 'removed') game.tsums = game.tsums.filter(n => !nodes.includes(n));
      if (change === 'disconnected') game.canConnectWithChainRule = () => false;
      if (change === 'deadline') setClock(10000);
      return result;
    };
    tick(20);
    assert.equal(session.data.count, change === 'rejected' ? 0 : 1);
    assert.equal(game.totalCleared, change === 'rejected' ? 0 : 10);
    if (change === 'deadline') {
      assert.equal(session.data.phase, 'finish');
      assert.equal(session.data.finishCount, 5);
    }
  });
}

test('connections are checked again immediately before awarding a candidate', () => {
  const {game, activate, tick} = setup(); fixture(game, 10);
  const getRule = game.getChainBehaviorForStart.bind(game);
  let calls = 0;
  game.getChainBehaviorForStart = n => {
    if (++calls === 11) game.canConnectWithChainRule = () => false;
    return getRule(n);
  };
  const session = activate(); tick(20);
  assert.equal(session.data.count, 0);
  assert.equal(game.totalCleared, 0);
});
