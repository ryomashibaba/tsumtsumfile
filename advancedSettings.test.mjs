import assert from 'node:assert/strict';
import test from 'node:test';
import { Game } from './game.js';
import {
  ADVANCED_SETTINGS_RECTS as R,
  ADVANCED_SETTINGS_STORAGE_KEY,
  loadAdvancedSettings,
  orderDebugEntries
} from './advancedSettings.js';

function storage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value)
  };
}

function press(game, rect) {
  game.handleTitlePointer({ x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 });
}

function makeGame({ query = false, saved = null } = {}) {
  const game = Object.create(Game.prototype);
  game.role = 'player';
  game.advancedSettingsStorage = storage();
  if (saved) game.advancedSettingsStorage.setItem(ADVANCED_SETTINGS_STORAGE_KEY, JSON.stringify(saved));
  game.advancedSettings = loadAdvancedSettings(game.advancedSettingsStorage);
  game.advancedSettingsOpen = false;
  game.advancedSettingsSection = 'developer';
  game.otherDebugExpanded = false;
  game.chainTelemetryQueryForced = query;
  game.chainTelemetry = null;
  game.syncChainTelemetry();
  return game;
}

test('selection screen opens and closes advanced settings without selecting a Tsum', () => {
  const game = makeGame();
  press(game, R.entry);
  assert.equal(game.advancedSettingsOpen, true);
  assert.equal(game.advancedSettingsSection, 'developer');
  press(game, R.close);
  assert.equal(game.advancedSettingsOpen, false);
});

test('game, display, Developer, and other-debug disclosure are navigable', () => {
  const game = makeGame();
  press(game, R.entry);
  press(game, R.game);
  assert.equal(game.advancedSettingsSection, 'game');
  press(game, R.display);
  assert.equal(game.advancedSettingsSection, 'display');
  press(game, R.developer);
  assert.equal(game.advancedSettingsSection, 'developer');
  press(game, R.other);
  assert.equal(game.otherDebugExpanded, true);
  press(game, R.other);
  assert.equal(game.otherDebugExpanded, false);
});

test('Telemetry turns on and off from Developer and persists independently of progress', () => {
  const game = makeGame();
  press(game, R.entry);
  press(game, R.telemetry);
  assert.equal(game.advancedSettings.chainTelemetryEnabled, true);
  assert.ok(game.chainTelemetry);
  assert.equal(loadAdvancedSettings(game.advancedSettingsStorage).chainTelemetryEnabled, true);
  press(game, R.telemetry);
  assert.equal(game.advancedSettings.chainTelemetryEnabled, false);
  assert.equal(game.chainTelemetry, null);
  assert.equal(loadAdvancedSettings(game.advancedSettingsStorage).chainTelemetryEnabled, false);
});

test('Overlay can be toggled while measurement continues, then reset', () => {
  const game = makeGame({ saved: { chainTelemetryEnabled: true, chainTelemetryOverlay: true } });
  let shown = 0;
  let hidden = 0;
  let resets = 0;
  game.chainTelemetry.show = () => { shown += 1; };
  game.chainTelemetry.hide = () => { hidden += 1; };
  game.chainTelemetry.reset = () => { resets += 1; };
  press(game, R.entry);
  press(game, R.overlay);
  assert.equal(game.advancedSettings.chainTelemetryOverlay, false);
  assert.ok(game.chainTelemetry);
  assert.ok(hidden > 0);
  press(game, R.overlay);
  assert.equal(game.advancedSettings.chainTelemetryOverlay, true);
  assert.equal(loadAdvancedSettings(game.advancedSettingsStorage).chainTelemetryOverlay, true);
  press(game, R.reset);
  assert.equal(resets, 1);
  press(game, R.close);
  assert.ok(shown > 0);
});

test('saved settings restore after relaunch and query can force measurement despite saved OFF', () => {
  const saved = { chainTelemetryEnabled: true, chainTelemetryOverlay: false };
  const game = makeGame({ saved });
  assert.ok(game.chainTelemetry);
  assert.equal(game.chainTelemetry.overlay, null);
  const forced = makeGame({ query: true, saved: { chainTelemetryEnabled: false, chainTelemetryOverlay: false } });
  assert.ok(forced.chainTelemetry);
  forced.setChainTelemetryEnabled(false);
  assert.ok(forced.chainTelemetry);
  assert.equal(forced.advancedSettings.chainTelemetryEnabled, false);
  assert.equal(forced.chainTelemetry.overlay, null);
});

test('without either enable source there is no Telemetry object or processing', () => {
  const game = makeGame();
  assert.equal(game.chainTelemetry, null);
  game.manualDragPointerId = null;
  game.deferredSkillInput = null;
  game.manualDragPoint = null;
  game.dragging = false;
  game.canvas = { getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 100 }) };
  game.width = game.height = 100;
  game.inputRouter = { trackBubbleGesture() {} };
  game.processDragPoint = () => false;
  game.onPointerMove({ pointerId: 1, clientX: 10, clientY: 10 });
  assert.equal(game.chainTelemetry, null);
});

test('current debug entries sort above older entries by metadata', () => {
  const entries = orderDebugEntries([
    { id: 'physics', label: 'Physics', current: false, priority: 200 },
    { id: 'chain', label: 'Chain', current: true, priority: 100 },
    { id: 'render', label: 'Render', current: false, priority: 10 }
  ]);
  assert.deepEqual(entries.map((entry) => entry.id), ['chain', 'physics', 'render']);
});
