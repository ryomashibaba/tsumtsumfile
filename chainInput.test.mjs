import assert from 'node:assert/strict';
import test from 'node:test';
import { Game } from './game.js';
import { CHAIN_INPUT_TUNING, segmentCircleEntry } from './chainInput.js';

const node = (id, x, y, type = 'red') => ({ id, x, y, radius: 10, type: { id: type }, inChain: false });

function gameWith(nodes, options = {}) {
  const game = Object.create(Game.prototype);
  game.tsums = nodes;
  game.chain = [nodes[0]];
  nodes[0].inChain = true;
  game.chainSet = new Set([nodes[0].id]);
  game.dragging = true;
  game.chainTypeId = 'red';
  game.chainRule = { mode: 'normal', allowedTypeIds: new Set(['red']) };
  game.chainBacktrackArmed = false;
  game.chainSelectedAt = new Map();
  game.gameFeel = { setChain() {} };
  game.boardState = {
    getResolvedType: (entry) => entry.type,
    getEffectiveRadius: (entry) => entry.radius,
    isFrozen: (entry) => !!entry.frozen
  };
  game.isTsumInPlayArea = () => true;
  game.getCoingainData = () => null;
  game.getActiveSkillSession = (name) => options.skill === name ? {} : null;
  game.myTsum = { id: 'red' };
  return game;
}

test('one fast pointermove adds four Tsums in travel order, independent of array order', () => {
  const a = node('a', 0, 0);
  const b = node('b', 20, 0);
  const c = node('c', 40, 0);
  const d = node('d', 60, 0);
  const e = node('e', 80, 0);
  const game = gameWith([a, e, c, b, d]);
  const result = game.extendChainSegment({ x: 0, y: 0 }, { x: 90, y: 0 });
  assert.deepEqual(game.chain.map((item) => item.id), ['a', 'b', 'c', 'd', 'e']);
  assert.equal(result.added, 4);
});

test('a segment grazing the edge intersects without a center sample', () => {
  const radius = 10 * CHAIN_INPUT_TUNING.extensionRadiusScale;
  assert.notEqual(segmentCircleEntry({ x: -20, y: radius - 0.1 }, { x: 20, y: radius - 0.1 }, { x: 0, y: 0 }, radius), null);
  assert.equal(segmentCircleEntry({ x: -20, y: radius + 0.1 }, { x: 20, y: radius + 0.1 }, { x: 0, y: 0 }, radius), null);
});

test('chain start uses its own slightly larger input radius', () => {
  const a = node('a', 20, 20);
  const game = gameWith([a]);
  assert.equal(game.findChainStartTsumAt(20 + 10 * 1.25, 20), a);
  assert.equal(game.findChainStartTsumAt(20 + 10 * 1.27, 20), null);
});

test('endpoint assist accepts a slightly short head-on trace but not a wider miss', () => {
  for (const [endX, expected] of [[16.1, 1], [15.9, 0]]) {
    const game = gameWith([node('a', 0, 0), node('b', 30, 0)]);
    assert.equal(game.extendChainSegment({ x: 0, y: 0 }, { x: endX, y: 0 }).added, expected);
  }
});

test('endpoint assist does not pull sideways, backwards, or from a stationary finger', () => {
  for (const [from, to, target] of [
    [{ x: 0, y: 0 }, { x: 20, y: 0 }, node('b', 20, 13.5)],
    [{ x: 16.5, y: 0 }, { x: 17, y: 0 }, node('b', 3, 0)],
    [{ x: 16.5, y: 0 }, { x: 16.5, y: 0 }, node('b', 30, 0)]
  ]) {
    const game = gameWith([node('a', 0, 0), target]);
    assert.equal(game.extendChainSegment(from, to).added, 0);
  }
});

test('endpoint assist does not reach past a closer wrong-color Tsum', () => {
  const game = gameWith([node('a', 0, 0), node('b', 30, 0), node('wrong', 29.5, 0, 'blue')]);
  assert.equal(game.extendChainSegment({ x: 0, y: 0 }, { x: 16.5, y: 0 }).added, 0);
});

test('ambiguous endpoint targets do not receive assist, regardless of board order', () => {
  for (const sign of [-1, 1]) {
    const game = gameWith([node('a', 0, 0), node('b', 30, sign * 2), node('c', 30, -sign * 2)]);
    assert.equal(game.extendChainSegment({ x: 0, y: 0 }, { x: 16.5, y: 0 }).added, 0);
  }
});

function releaseGame() {
  const game = gameWith([node('a', 0, 0), node('b', 20, 0), node('c', 40, 0)]);
  game.manualDragPoint = { x: 0, y: 0 };
  game.manualDragPointerId = 7;
  game.state = 'playing';
  game.canvas = { getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 100 }) };
  game.width = game.height = 100;
  game.skillRuntime = { releaseHeldFinalBattleHookInput() {} };
  game.inputRouter = { handlePointerUp: () => false, finishBubbleGesture: () => false };
  game.isCoingainInputLocked = () => false;
  game.finishChain = () => { game.committed = game.chain.map((item) => item.id); };
  return game;
}

test('release includes the final movement even without a preceding pointermove', () => {
  const game = releaseGame();
  game.onPointerUp({ pointerId: 7, type: 'pointerup', clientX: 45, clientY: 0 });
  assert.deepEqual(game.committed, ['a', 'b', 'c']);
});

test('release respects coalesced curves instead of connecting across their chord', () => {
  const game = releaseGame();
  game.tsums[1].y = 20;
  game.onPointerUp({ pointerId: 7, type: 'pointerup', clientX: 45, clientY: 0,
    getCoalescedEvents: () => [{ clientX: 20, clientY: 20 }] });
  assert.deepEqual(game.committed, ['a', 'b', 'c']);
});

test('a stationary release does not select an overlapping neighbor', () => {
  const game = releaseGame();
  game.tsums[1].x = 10;
  game.onPointerUp({ pointerId: 7, type: 'pointerup', clientX: 0, clientY: 0 });
  assert.deepEqual(game.committed, ['a']);
});

test('cancelled input never adds the final segment or commits', () => {
  const game = releaseGame();
  game.onPointerUp({ pointerId: 7, type: 'pointercancel', clientX: 45, clientY: 0 });
  assert.equal(game.committed, undefined);
  assert.equal(game.tsums[1].inChain, false);
  assert.equal(game.dragging, false);
});

test('an invalid crossed candidate does not block a valid candidate beyond it', () => {
  const a = node('a', 0, 0);
  const wrong = node('wrong', 18, 0, 'blue');
  const b = node('b', 32, 0);
  const game = gameWith([a, wrong, b]);
  const result = game.extendChainSegment({ x: 0, y: 0 }, { x: 40, y: 0 });
  assert.deepEqual(game.chain.map((item) => item.id), ['a', 'b']);
  assert.equal(result.rejected, 1);
});

test('a long movement remains continuous beyond the old 64-point interpolation limit', () => {
  const a = node('a', 0, 0);
  const b = node('b', 390, 9.5);
  const game = gameWith([a, b]);
  game.chainRule.unlimitedDistance = true;
  assert.equal(game.extendChainSegment({ x: 0, y: 0 }, { x: 800, y: 0 }).added, 1);
});

test('small jitter does not backtrack, while a deliberate return removes one node', () => {
  const a = node('a', 0, 0);
  const b = node('b', 20, 0);
  const game = gameWith([a, b]);
  game.chain.push(b);
  game.chainSet.add(b.id);
  b.inChain = true;
  game.extendChainSegment({ x: 20, y: 0 }, { x: 17, y: 1 });
  assert.equal(game.chain.length, 2);
  game.extendChainSegment({ x: 17, y: 1 }, { x: 1, y: 0 });
  assert.deepEqual(game.chain.map((item) => item.id), ['a']);
});

test('frozen nodes are skipped and a special unlimited-distance rule remains usable', () => {
  const a = node('a', 0, 0);
  const frozen = node('frozen', 20, 0);
  frozen.frozen = true;
  const b = node('b', 90, 0);
  const game = gameWith([a, frozen, b]);
  game.chainRule.unlimitedDistance = true;
  game.extendChainSegment({ x: 0, y: 0 }, { x: 100, y: 0 });
  assert.deepEqual(game.chain.map((item) => item.id), ['a', 'b']);
});

test('a pointermove without coalesced events still uses its actual endpoint', () => {
  const a = node('a', 0, 0);
  const b = node('b', 20, 0);
  const c = node('c', 40, 0);
  const game = gameWith([a, b, c]);
  game.manualDragPoint = { x: 0, y: 0 };
  game.manualDragPointerId = 7;
  game.dragPointer = game.manualDragPoint;
  game.state = 'playing';
  game.paused = false;
  game.canvas = { getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 100 }) };
  game.width = game.height = 100;
  game.inputRouter = { trackBubbleGesture() {}, handleDrag: () => false };
  game.isCoingainInputLocked = () => false;
  game.noteAction = () => {};
  game.onPointerMove({ pointerId: 7, clientX: 50, clientY: 0 });
  assert.deepEqual(game.chain.map((item) => item.id), ['a', 'b', 'c']);
});

test('coalesced points preserve a curved path instead of using the endpoint chord', () => {
  const a = node('a', 0, 0);
  const b = node('b', 20, 20);
  const c = node('c', 40, 0);
  const game = gameWith([a, b, c]);
  game.manualDragPoint = { x: 0, y: 0 };
  game.manualDragPointerId = 7;
  game.state = 'playing';
  game.paused = false;
  game.canvas = { getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 100 }) };
  game.width = game.height = 100;
  game.inputRouter = { trackBubbleGesture() {}, handleDrag: () => false };
  game.isCoingainInputLocked = () => false;
  game.noteAction = () => {};
  game.onPointerMove({
    pointerId: 7, clientX: 45, clientY: 0,
    getCoalescedEvents: () => [{ clientX: 20, clientY: 20 }, { clientX: 45, clientY: 0 }]
  });
  assert.deepEqual(game.chain.map((item) => item.id), ['a', 'b', 'c']);
});

test('pointercancel releases the manual chain without committing', () => {
  const a = node('a', 0, 0);
  const b = node('b', 20, 0);
  const game = gameWith([a, b]);
  game.chain.push(b);
  b.inChain = true;
  game.manualDragPointerId = 7;
  game.state = 'playing';
  game.skillRuntime = { releaseHeldFinalBattleHookInput() {} };
  game.inputRouter = { handlePointerUp: () => false, finishBubbleGesture: () => false };
  game.getPointerPosition = () => ({ x: 20, y: 0 });
  game.isCoingainInputLocked = () => false;
  game.onPointerUp({ pointerId: 7, type: 'pointercancel' });
  assert.equal(game.dragging, false);
  assert.equal(a.inChain, false);
  assert.equal(b.inChain, false);
});


test('mixed chains and distance multipliers apply to pointer extension only with player cheat enabled', () => {
  const a = node('a', 0, 0);
  const b = node('b', 100, 0, 'blue');
  const game = gameWith([a, b]);
  game.role = 'player';
  game.cheatSettings = { enabled: true, allowMixedChains: true, chainDistanceMultiplier: 10 };
  assert.equal(game.canExtendActiveChain(a, b), true);
  const expandedRadius = game.getChainConnectionSearchRadius(game.chainRule, a, 10);
  game.cheatSettings.enabled = false;
  assert.equal(expandedRadius, game.getChainConnectionSearchRadius(game.chainRule, a, 10) * 10);
  game.cheatSettings.enabled = true;
  assert.equal(game.extendChainSegment({ x: 0, y: 0 }, { x: 100, y: 0 }).added, 1);
  game.cheatSettings.enabled = false;
  assert.equal(game.canExtendActiveChain(a, b), false);
  game.cheatSettings.enabled = true;
  game.cheatSettings.allowMixedChains = false;
  assert.equal(game.canExtendActiveChain(a, b), false);
  b.type.id = 'red';
  game.cheatSettings.chainDistanceMultiplier = 0.5;
  b.x = 40;
  assert.equal(game.canExtendActiveChain(a, b), false);
  game.cheatSettings.enabled = false;
  assert.equal(game.canExtendActiveChain(a, b), true);
});
