import assert from "node:assert/strict";
import test from "node:test";

import { Game } from "./game.js";

function makeGame({ skillId = "coronationElsa", visuals = true } = {}) {
  const game = Object.create(Game.prototype);
  game.myTsum = { id: skillId };
  game.skillVisualsEnabled = visuals;
  game.state = "playing";
  game.paused = false;
  game.dragging = false;
  game.chain = [];
  game.chainSet = new Set();
  game.pendingClear = null;
  game.pendingChainClearQueue = [];
  game.actionLock = false;
  game.deferredSkillInput = null;
  game.heldBombInput = null;
  game.consumedPointerIds = new Set();
  game.tsums = [];
  game.bombs = [];
  game.gameFeel = { setChain() {} };
  game.skillRuntime = { pendingActivation: null, timingPauses: [] };
  game.boardState = { getResolvedType: (tsum) => tsum.type };
  return game;
}

const tsum = (id) => ({ id, type: { id: "test" }, dead: false, removing: false, inChain: true });

test("a stopped board waits for the first skill effect and clears even two surviving chain nodes", () => {
  const game = makeGame();
  const chain = [tsum(1), tsum(2), tsum(3)];
  game.tsums = chain;
  game.chain = chain;
  game.dragging = true;
  const resolved = [];
  game.resolveChain = (targets, options) => resolved.push({ targets, options });

  const deferred = game.beginDeferredSkillInput();
  deferred.ready = true;
  game.skillRuntime.pendingActivation = { skillId: "coronationElsa" };
  game.updateDeferredSkillInput(0);
  assert.equal(resolved.length, 0);
  assert.equal(game.dragging, false);

  chain[1].dead = true;
  game.skillRuntime.pendingActivation = null;
  deferred.activationStarted = true;
  game.updateDeferredSkillInput(0);
  assert.deepEqual(resolved[0].targets.map((target) => target.id), [1, 3]);
  assert.equal(resolved[0].options.committedBeforeSkill, true);
  assert.equal(game.deferredSkillInput, null);
});

test("a moving board starts the held chain after skill acceptance", () => {
  const game = makeGame({ skillId: "finalBattleHook" });
  const chain = [tsum(1), tsum(2), tsum(3)];
  game.tsums = chain;
  game.chain = chain;
  game.dragging = true;
  game.skillRuntime.pendingActivation = { skillId: "finalBattleHook" };
  let resolved = 0;
  game.resolveChain = () => { resolved += 1; };

  const deferred = game.beginDeferredSkillInput();
  deferred.ready = true;
  game.updateDeferredSkillInput(0);
  assert.equal(resolved, 1);
  assert.equal(game.deferredSkillInput, deferred);
});

test("an in-progress clear retains its cursor and runs beside the skill clear on a moving board", () => {
  const game = makeGame({ skillId: "finalBattleHook" });
  const original = { source: "chain", sequentialChain: true, nextRemoveIndex: 2, chainRemoveElapsed: 0.04, targets: [tsum(1), tsum(2), tsum(3)] };
  const skillClear = { source: "skill", timer: 1 };
  game.pendingClear = original;
  game.actionLock = true;
  let updated = null;
  game.clearPipeline = { updateSequentialChainClear(info, dt) { updated = { info, dt }; return true; } };

  const deferred = game.beginDeferredSkillInput();
  deferred.ready = true;
  game.moveActiveClearAsideForSkill("finalBattleHook");
  game.pendingClear = skillClear;
  game.updateDeferredSkillInput(0.1);
  assert.deepEqual(updated, { info: original, dt: 0.1 });
  assert.equal(original.nextRemoveIndex, 2);
  assert.equal(game.pendingClear, skillClear);
  assert.equal(deferred.clear, original);
});

test("a stopped board preserves its clear until the skill's initial work ends", () => {
  const game = makeGame();
  const original = { source: "chain", sequentialChain: true, nextRemoveIndex: 2, targets: [tsum(1), tsum(2), tsum(3)] };
  game.pendingClear = original;
  game.actionLock = true;
  const deferred = game.beginDeferredSkillInput();
  deferred.ready = true;
  assert.equal(game.pendingClear, null);
  assert.equal(deferred.clear, original);

  game.skillRuntime.pendingActivation = { skillId: "coronationElsa" };
  game.updateDeferredSkillInput(0.1);
  assert.equal(game.pendingClear, null);
  game.skillRuntime.pendingActivation = null;
  deferred.activationStarted = true;
  game.updateDeferredSkillInput(0.1);
  assert.equal(game.pendingClear, original);
  assert.equal(original.nextRemoveIndex, 2);
});

test("targets claimed by the skill are removed from the deferred clear once", () => {
  const game = makeGame();
  const targets = [tsum(1), tsum(2), tsum(3)];
  const clear = { targets, sequentialPrimaryTargets: targets, nextRemoveIndex: 1, chainLength: 3 };
  game.deferredSkillInput = { clear, clearQueue: [], startedTargetIds: new Set() };
  game.excludeDeferredClearTargets([targets[1]]);
  assert.deepEqual(clear.targets.map((target) => target.id), [1, 3]);
  assert.equal(clear.nextRemoveIndex, 1);
  assert.equal(targets[1].inChain, false);
});

test("a target removed directly by the skill is pruned but an already popping target stays", () => {
  const game = makeGame();
  const targets = [tsum(1), tsum(2), tsum(3)];
  targets[0].removing = true;
  const clear = { targets, sequentialPrimaryTargets: targets, nextRemoveIndex: 1, chainLength: 3 };
  game.deferredSkillInput = {
    ready: true,
    activationStarted: true,
    moving: false,
    chain: null,
    bomb: null,
    clear,
    clearQueue: [],
    startedTargetIds: new Set([1])
  };
  targets[1].removing = true;
  game.skillRuntime.pendingActivation = { skillId: "coronationElsa" };
  game.updateDeferredSkillInput(0);
  assert.deepEqual(clear.targets.map((target) => target.id), [1, 3]);
});

test("a held bomb waits for release, while a cancelled hold never explodes", () => {
  const game = makeGame();
  const bomb = { dead: false };
  game.bombs = [bomb];
  game.heldBombInput = { bomb, pointerId: 4 };
  game.manualDragPointerId = 4;
  let explosions = 0;
  game.explodeBomb = () => { explosions += 1; };
  game.onPointerUp({ pointerId: 4, type: "pointercancel" });
  assert.equal(explosions, 0);
  game.heldBombInput = { bomb, pointerId: 4 };
  game.manualDragPointerId = 4;
  game.onPointerUp({ pointerId: 4, type: "pointerup" });
  assert.equal(explosions, 1);
});

test("the skill is accepted before a held bomb explodes", () => {
  const game = makeGame();
  const bomb = { dead: false };
  game.bombs = [bomb];
  game.heldBombInput = { bomb, pointerId: 4 };
  game.isCoingainInputLocked = () => false;
  game.skillSystem = {
    ready: true,
    use() {
      events.push("skill");
      game.skillRuntime.pendingActivation = { skillId: "coronationElsa" };
      return true;
    }
  };
  game.gameFeel.emit = () => {};
  game.triggerSkillButtonFeedback = () => {};
  game.explodeBomb = () => { events.push("bomb"); };
  const events = [];

  assert.equal(game.attemptSkillActivation(false), true);
  assert.deepEqual(events, ["skill"]);
  game.deferredSkillInput.activationStarted = true;
  game.skillRuntime.pendingActivation = null;
  game.updateDeferredSkillInput(0);
  assert.deepEqual(events, ["skill", "bomb"]);
});

test("an unready skill does not consume the held bomb", () => {
  const game = makeGame();
  const bomb = { dead: false };
  game.heldBombInput = { bomb, pointerId: 4 };
  game.skillSystem = { ready: false };
  game.isCoingainInputLocked = () => false;
  game.triggerSkillButtonFeedback = () => {};
  game.addFloatingText = () => {};
  assert.equal(game.attemptSkillActivation(false), false);
  assert.equal(game.heldBombInput.bomb, bomb);
  assert.equal(game.deferredSkillInput, null);
});

test("a second pointer can tap the skill without taking over the tracing pointer", () => {
  const game = makeGame();
  game.inputEnabled = true;
  game.canvas = { setPointerCapture() {} };
  game.manualDragPointerId = 7;
  game.manualDragPoint = { x: 200, y: 300 };
  game.dragPointer = { x: 200, y: 300 };
  game.dragging = true;
  game.getPointerPosition = () => ({ x: 55, y: 671 });
  game.isCoingainInputLocked = () => false;
  game.skillRuntime.captureHeldFinalBattleHookInput = () => false;
  let activations = 0;
  game.attemptSkillActivation = () => { activations += 1; return true; };
  game.noteAction = () => {};

  game.onPointerDown({ pointerId: 8 });
  assert.equal(activations, 1);
  assert.equal(game.manualDragPointerId, 7);
  assert.deepEqual(game.dragPointer, { x: 200, y: 300 });
});

test("releasing a consumed tracing pointer cannot trigger a second action", () => {
  const game = makeGame();
  game.consumedPointerIds.add(7);
  game.manualDragPointerId = 7;
  let routed = 0;
  game.skillRuntime.releaseHeldFinalBattleHookInput = () => {};
  game.inputRouter = { handlePointerUp() { routed += 1; return false; } };
  game.onPointerUp({ pointerId: 7, type: "pointerup" });
  assert.equal(routed, 0);
  assert.equal(game.manualDragPointerId, null);
});
