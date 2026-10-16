import test from 'node:test';
import assert from 'node:assert/strict';
import { Game, ClearPipeline, InputRouter, SkillRuntimeManager } from './game.js';
import { TSUM_TYPES } from './config.js';
import { BattleController } from './battle.js';

const type = TSUM_TYPES.find(type => type.id === 'perfumeAlice');
const node = (id, x = 200, y = 400) => ({
  id, x, y, radius: 10, type, dead: false, removing: false,
  beginRemove() { this.removing = true; this.inChain = false; this.clearOccupying = false; }
});
const bomb = (id = 'bomb', x = 200, y = 400) => ({ ...node(id, x, y), isBomb: true, bombType: 'normal' });
function fixture(nodes = []) {
  const game = Object.assign(Object.create(Game.prototype), {
    state: 'playing', inputEnabled: true, paused: false, timeUp: false, dragging: false,
    actionLock: false, myTsum: type, selectedSkillLevel: 1, role: 'player',
    skillVisualsEnabled: false, tsums: nodes, bombs: [], chain: [], chainSet: new Set(),
    pendingClear: null, pendingChainClearQueue: [], heldBombInput: null,
    manualDragPointerId: null, consumedPointerIds: new Set(),
    canvas: { setPointerCapture() {} }, getPointerPosition: e => ({ x: e.x ?? 200, y: e.y ?? 400 }),
    boardState: {
      getResolvedType: n => n.type, getEffectiveRadius: n => n.radius,
      hasBubble: () => false, canBombAffectNode: () => true,
      findFrozenGroupAt: () => null, findBubbleAt: () => null,
      onNodesCleared() {}, clearBySource() {}
    },
    totalCleared: 0, score: 0, coinBonus: 0, charge: 0, refills: 0,
    activeItems: {}, random: () => 0.5,
    feverSystem: { addClears() {} }, comboSystem: { combo: 0, recordAction() { this.combo++; } },
    calculateMixedClearScore: count => count * 150, calculateChainScore: (base, count) => base * count,
    addScore(n) { this.score += n; }, addCoinBonus(n) { this.coinBonus += n; },
    enqueueSkillChargeFlight(x, y, t, weight) { this.charge += weight; }, enqueueCoinFlights() {},
    spawnReplacementTsums() { this.refills++; },
    getCheatCoinCorrection: (category, route, value) => value, isCheatActive: () => false,
    isTsumInPlayArea: () => true, isCoingainInputLocked: () => false,
    spawnPopParticles() {}, addFloatingText() {}, queueNaturalLargeTsum() {}, recordCoingainClear() {},
    flushPostChainCleanup() {}, noteAction() {}, createShockwave() {}, spawnExplosionSparks() {},
    gameFeel: { emit() {}, setChain() {} }
  });
  game.skillRuntime = new SkillRuntimeManager(game, game.boardState);
  game.clearPipeline = new ClearPipeline(game, game.boardState, game.skillRuntime);
  game.inputRouter = new InputRouter(game, game.boardState, game.skillRuntime, game.clearPipeline);
  return game;
}
const down = (g, id, x = 200, y = 400) => g.onPointerDown({ pointerId: id, x, y });
const up = (g, id, kind = 'pointerup') => g.onPointerUp({ pointerId: id, type: kind });

for (const battle of [false, true]) test(`${battle ? 'battle' : 'solo'} pause cancels held pointer input before resume`, () => {
  const g = fixture(); const b = bomb(); g.bombs = [b];
  down(g, 1);
  g.inputRouter.pendingBubbleGesture = { pointerId: 1 };
  g.skillRuntime.heldFinalBattleHookInput = { pointerId: 1 };
  if (battle) {
    const controller = Object.create(BattleController.prototype);
    controller.active = true;
    controller.player = g;
    controller.cpu = fixture();
    const cpuNode = node('cpu-chain'); cpuNode.inChain = true;
    controller.cpu.dragging = true;
    controller.cpu.chain = [cpuNode];
    controller.cpu.chainRule = { mode: 'normal' };
    g.battleController = controller;
  }
  assert.equal(g.togglePause(), true);
  assert.equal(g.heldBombInput, null);
  assert.equal(g.manualDragPointerId, null);
  assert.equal(g.inputRouter.pendingBubbleGesture, null);
  assert.equal(g.skillRuntime.heldFinalBattleHookInput, null);
  if (battle) {
    assert.equal(g.battleController.cpu.dragging, false);
    assert.equal(g.battleController.cpu.chainRule, null);
  }
  g.togglePause();
  up(g, 1);
  assert.equal(b.dead, false, 'release from before pause must not explode a bomb');
  down(g, 2); up(g, 2);
  assert.equal(b.dead, true, 'fresh input must work after resume');
});
function tick(g, dt = 1) {
  if (!g.pendingClear) return;
  if (!g.clearPipeline.updateSequentialChainClear(g.pendingClear, dt)) {
    g.pendingClear.timer -= dt;
    if (g.pendingClear.timer <= 0) g.finalizePendingClear(g.pendingClear);
  }
}

test('stationary first contact does not block another finger; release uses the held moving bomb', () => {
  const g = fixture(); const b = bomb(); g.bombs = [b];
  g.manualDragPointerId = 1;
  down(g, 2);
  assert.equal(g.heldBombInput.bomb, b);
  assert.equal(b.dead, false);
  b.x = 310;
  up(g, 2);
  assert.equal(b.dead, true);
  assert.equal(g.manualDragPointerId, 1);
  up(g, 2); // duplicate release cannot trigger anything
});

test('another finger cannot use a bomb during a trace or trigger it later on release', () => {
  const g = fixture(); const b = bomb(); g.bombs = [b];
  g.dragging = true; g.manualDragPointerId = 1;
  down(g, 2);
  assert.equal(g.heldBombInput, null);
  assert.equal(g.explodeBomb(b), false);
  g.dragging = false;
  up(g, 2);
  assert.equal(b.dead, false);
  down(g, 2); up(g, 2);
  assert.equal(b.dead, true);
});

test('bomb hit wins over overlapping frozen, bubble and skill tap routes and allows a small edge margin', () => {
  const g = fixture(); const b = bomb(); g.bombs = [b];
  g.inputRouter.beginBubbleGesture = g.inputRouter.handleTap = () => { throw Error('bomb must win'); };
  assert.equal(g.findBombAt(212, 400), b);
  assert.equal(g.findBombAt(212.01, 400), null);
  down(g, 1, 211, 400); up(g, 1);
  assert.equal(b.dead, true);
});

test('cancelled, paused, expired, removed and foreign bombs never explode', () => {
  for (const mode of ['cancel', 'pause', 'timeUp', 'removed', 'dead', 'removing', 'title', 'lock']) {
    const g = fixture(); const b = bomb(); g.bombs = [b]; down(g, 1);
    if (mode === 'pause') g.paused = true;
    if (mode === 'timeUp') g.timeUp = true;
    if (mode === 'removed') g.bombs = [];
    if (mode === 'dead') b.dead = true;
    if (mode === 'removing') b.removing = true;
    if (mode === 'title') g.state = 'title';
    if (mode === 'lock') g.skillRuntime.isInputLocked = () => true;
    let effects = 0; g.applyBombEffect = () => effects++;
    up(g, 1, mode === 'cancel' ? 'pointercancel' : 'pointerup');
    assert.equal(effects, 0, mode);
    assert.equal(g.heldBombInput, null, mode);
  }
});

for (const source of ['chain', 'bomb', 'freeze', 'bubble']) {
  test(`multiple bombs during ${source} clear preserve and settle every clear exactly once`, () => {
    const root = node('root', 40, 400), a = node('a', 200, 400), b = node('b', 370, 400);
    const g = fixture([root, a, b]);
    g.clearPipeline.beginClear({ source, targets: [root], x: 40, y: 400 });
    const original = g.pendingClear;
    const first = bomb('first', 200), second = bomb('second', 370); g.bombs = [first, second];
    down(g, 1); up(g, 1);
    down(g, 2, 370); up(g, 2);
    assert.equal(first.dead, true); assert.equal(second.dead, true);
    assert.equal(g.pendingClear, original);
    assert.equal(original.pendingBombClears.length, 2);
    if (source === 'chain') assert.equal(original.bombCancelled, true);
    for (const target of g.tsums) if (target.removing) target.dead = true;
    tick(g);
    assert.equal(g.pendingClear, null);
    assert.equal(g.totalCleared, 3);
    assert.equal(g.comboSystem.combo, 3);
    assert.equal(g.refills, 3);
    assert.equal(g.charge, 3);
    assert.equal(g.score, source === 'chain' ? 300 + type.score : 450);
    const coins = g.coinBonus;
    tick(g);
    assert.equal(g.coinBonus, coins);
    assert.equal(g.totalCleared, 3);
  });
}

test('a clear transition between press and release does not invalidate a held bomb', () => {
  const g = fixture(); const b = bomb(); g.bombs = [b];
  g.pendingClear = { source: 'chain', sequentialChain: true }; g.actionLock = true;
  down(g, 1);
  g.pendingClear.bombCancelled = true;
  up(g, 1);
  assert.equal(b.dead, true);
});

test('additional clear waits for its timer and root cannot finish before all additional clears', () => {
  const root = node('root'), extra = node('extra'); const g = fixture([root, extra]);
  g.clearPipeline.beginClear({ source: 'freeze', targets: [root], timer: 0 });
  g.clearPipeline.beginClear({ source: 'bomb', targets: [extra], timer: 0.67 });
  extra.dead = true;
  tick(g, 0.2);
  assert.ok(g.pendingClear); assert.equal(g.totalCleared, 0);
  tick(g, 0.5);
  assert.equal(g.pendingClear, null); assert.equal(g.totalCleared, 2);
});

test('overlapping bomb blasts award nonzero coins and gauge once per distinct target', () => {
  const nodes = Array.from({length: 12}, (_, i) => node(`n${i}`, i < 4 ? 40 : i < 8 ? 200 : 370));
  const g = fixture(nodes);
  let flyingCoins = 0;
  g.enqueueCoinFlights = (x, y, count) => { flyingCoins += count; };
  g.clearPipeline.beginClear({ source: 'chain', targets: nodes.slice(0,4), x:40, y:400 });
  const first = bomb('first'), second = bomb('second',370);
  first.effectRadius = 200; // also hits the second bomb's future targets
  g.bombs = [first, second];
  down(g,1); up(g,1);
  down(g,2,370); up(g,2);
  assert.equal(g.pendingClear.pendingBombClears.length,1);
  for (const n of nodes) n.dead = true;
  tick(g);
  const expectedCoins = g.getCoinsByClearCount(4, type.id) + g.getCoinsByClearCount(8, type.id);
  assert.ok(expectedCoins > 0);
  assert.equal(g.coinBonus,expectedCoins);
  assert.equal(flyingCoins,expectedCoins);
  assert.equal(g.totalCleared,12);
  assert.equal(g.charge,12);
  assert.equal(g.refills,2);
});

test('a counted bomb contributes once across the cancelled chain and its additional blast clear', () => {
  const root = node('root',40), extra = node('extra');
  const g = fixture([root,extra]);
  g.isCoingainCountingActive = () => true;
  g.clearPipeline.beginClear({source:'chain',targets:[root],x:40,y:400});
  g.bombs = [bomb()]; down(g,1); up(g,1);
  root.dead = extra.dead = true;
  tick(g);
  assert.equal(g.totalCleared,3); // two Tsums plus one counted bomb
});

test('independent held bomb pointer survives a rejected skill and is consumed by an accepted one', () => {
  const g = fixture(); const b = bomb(); g.bombs = [b];
  g.manualDragPointerId = 1; down(g, 2);
  const deferred = g.beginDeferredSkillInput();
  assert.equal(deferred.bombPointerId, 2);
  assert.ok(g.consumedPointerIds.has(2));
  g.restoreDeferredSkillInput(deferred);
  assert.equal(g.heldBombInput.pointerId, 2);
  assert.equal(g.consumedPointerIds.has(2), false);
  g.beginDeferredSkillInput(); up(g, 2, 'pointercancel');
  assert.equal(g.deferredSkillInput.bomb, null);
  assert.equal(b.dead, false);
});
