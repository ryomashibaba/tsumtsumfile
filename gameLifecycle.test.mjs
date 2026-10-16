import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from './game.js';

function canvas() {
  return {
    style: {}, getContext: () => ({ setTransform() {} }),
    getBoundingClientRect: () => ({ width: 414, height: 736 })
  };
}

test('blocked browser storage does not prevent Game construction or in-memory settings', (t) => {
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  globalThis.window = { devicePixelRatio: 1, addEventListener() {}, location: { search: '' } };
  t.after(() => {
    if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow);
    else delete globalThis.window;
  });
  const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    get() { throw new Error('SecurityError: storage access denied'); }
  });
  t.after(() => {
    if (original) Object.defineProperty(globalThis, 'localStorage', original);
    else delete globalThis.localStorage;
  });
  const game = new Game(canvas(), { role: 'cpu', inputEnabled: false, managedLoop: true, renderQualityMode: 'light' });
  assert.equal(game.coins, 5000);
  assert.equal(game.advancedSettingsStorage, null);
  assert.equal(game.advancedSettings.chainTelemetryEnabled, false);
  game.setChainTelemetryEnabled(true);
  assert.equal(game.advancedSettings.chainTelemetryEnabled, true);
});

test('menu reset cleans active skill sessions, presentation locks and board modifiers', (t) => {
  const originalWindow = globalThis.window;
  globalThis.window = { devicePixelRatio: 1, addEventListener() {}, location: { search: '' } };
  t.after(() => {
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
  });
  const game = new Game(canvas(), { role: 'cpu', inputEnabled: false, persistenceEnabled: false, managedLoop: true, renderQualityMode: 'light' });
  game.selectTsum('perfumeAlice', 6);
  game.startGame();
  game.skillVisualsEnabled = false;
  game.skillRuntime.activateNow('perfumeAlice', 6);
  assert.equal(game.skillRuntime.sessions.length, 1);
  const oldNode = game.tsums[0];
  game.boardState.setScaleModifier({ sessionId: 'reset-fixture', nodeIds: [oldNode.id], scale: 2, radiusScale: 2 });
  game.skillRuntime.timingPauses.push({ remainingMs: 1000 });
  game.inputRouter.pendingBubbleGesture = { pointerId: 1 };
  game.paused = game.timeUp = true;
  game.resetGame();
  assert.equal(game.state, 'title');
  assert.equal(game.skillRuntime.sessions.length, 0);
  assert.equal(game.skillRuntime.timingPauses.length, 0);
  assert.equal(game.inputRouter.pendingBubbleGesture, null);
  assert.equal(game.paused, false);
  assert.equal(game.timeUp, false);
  assert.equal(game.getBodyRadius(oldNode), oldNode.radius);
});
