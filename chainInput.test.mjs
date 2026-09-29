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
  assert.equal(game.findChainStartTsumAt(20 + 10 * 1.19, 20), a);
  assert.equal(game.findChainStartTsumAt(20 + 10 * 1.21, 20), null);
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
