import assert from 'node:assert/strict';
import test from 'node:test';

import { Game, SkillRuntimeManager } from './game.js';
import { UIRenderer } from './ui.js';
import {
  JUDY_NICK_WORLD_SWITCH_MS,
  drawSkillActiveBackdrop,
  drawSkillActiveFieldBackground,
  drawSkillActiveForeground,
  getCaptainLightyearReticleCount,
  getSkillActiveThemeId,
  resolveSkillActiveVisualFrame
} from './skillActiveVisuals.js';

function makeContext() {
  const commands = [];
  let depth = 0;
  const gradient = { addColorStop: (...args) => commands.push(['addColorStop', ...args]) };
  const target = {
    commands,
    globalAlpha: 1,
    get depth() { return depth; },
    save() { depth += 1; commands.push(['save']); },
    restore() { depth -= 1; commands.push(['restore']); assert.ok(depth >= 0); },
    createLinearGradient(...args) { commands.push(['createLinearGradient', ...args]); return gradient; },
    createRadialGradient(...args) { commands.push(['createRadialGradient', ...args]); return gradient; }
  };
  const methods = new Set([
    'beginPath', 'closePath', 'fillRect', 'arc', 'fill', 'stroke', 'moveTo', 'lineTo',
    'bezierCurveTo', 'quadraticCurveTo', 'clip', 'rect'
  ]);
  return new Proxy(target, {
    get(object, property) {
      if (property in object) return object[property];
      if (methods.has(property)) return (...args) => commands.push([property, ...args]);
      return undefined;
    },
    set(object, property, value) {
      commands.push(['set', property, value]);
      object[property] = value;
      return true;
    }
  });
}

function activeState(skillId, overrides = {}) {
  return {
    sessionId: `${skillId}-1`,
    skillId,
    remainingMs: 2000,
    mode: null,
    remainingShots: null,
    phase: 'active',
    ...overrides
  };
}

test('every requested skill resolves to a distinct active theme', () => {
  const expected = {
    coronationElsa: 'coronationElsa',
    captainLightyear: 'captainLightyear',
    namine: 'namine',
    gaston: 'gaston',
    guidingMoana: 'guidingMoana',
    perfumeAlice: 'perfumeAlice',
    jamilViper: 'jamilViper',
    snowQueenElsa: 'snowQueenElsa',
    liliaVanrouge: 'liliaVanrouge',
    finalBattleHook: 'finalBattleHook'
  };
  for (const [skillId, themeId] of Object.entries(expected)) {
    assert.equal(getSkillActiveThemeId(activeState(skillId)), themeId);
  }
  assert.equal(getSkillActiveThemeId(activeState('judyNick', { mode: 'judy' })), 'judyNickJudy');
  assert.equal(getSkillActiveThemeId(activeState('judyNick', { mode: 'nick' })), 'judyNickNick');
});

test('Gaston state exists during initial clear but the red world waits for loopActive', () => {
  assert.equal(getSkillActiveThemeId(activeState('gaston', { phase: 'initialClear' })), null);
  assert.equal(getSkillActiveThemeId(activeState('gaston', { phase: 'active' })), 'gaston');
});

test('Captain Lightyear reticles exactly follow remainingShots', () => {
  for (const count of [5, 4, 3, 2, 1, 0]) {
    const state = activeState('captainLightyear', { remainingShots: count });
    assert.equal(getCaptainLightyearReticleCount(state), count);
    const frame = resolveSkillActiveVisualFrame(state, { visibleElapsedMs: 150 });
    assert.equal(frame.reticleCount, count);
  }
});

test('Judy and Nick switch through white without blending both worlds', () => {
  const nick = activeState('judyNick', { mode: 'nick' });
  const beforeMidpoint = resolveSkillActiveVisualFrame(nick, {
    visibleElapsedMs: 200,
    previousThemeId: 'judyNickJudy',
    modeSwitchElapsedMs: 25
  });
  const afterMidpoint = resolveSkillActiveVisualFrame(nick, {
    visibleElapsedMs: 200,
    previousThemeId: 'judyNickJudy',
    modeSwitchElapsedMs: 75
  });
  const finished = resolveSkillActiveVisualFrame(nick, {
    visibleElapsedMs: 200,
    previousThemeId: 'judyNickJudy',
    modeSwitchElapsedMs: JUDY_NICK_WORLD_SWITCH_MS
  });
  assert.equal(beforeMidpoint.themeId, 'judyNickJudy');
  assert.equal(afterMidpoint.themeId, 'judyNickNick');
  assert.ok(beforeMidpoint.whiteFlashAlpha > 0);
  assert.ok(afterMidpoint.whiteFlashAlpha > 0);
  assert.equal(finished.themeId, 'judyNickNick');
  assert.equal(finished.whiteFlashAlpha, 0);
});

test('minimal quality still draws identifying active surfaces and Captain reticles', () => {
  const frame = resolveSkillActiveVisualFrame(activeState('captainLightyear', { remainingShots: 3 }), {
    detail: 'minimal',
    visibleElapsedMs: 150
  });
  const ctx = makeContext();
  assert.equal(drawSkillActiveBackdrop(ctx, frame), true);
  assert.equal(drawSkillActiveFieldBackground(ctx, frame), true);
  assert.equal(drawSkillActiveForeground(ctx, frame), true);
  assert.equal(ctx.depth, 0);
  assert.ok(ctx.commands.filter(([name]) => name === 'arc').length >= 3);
  assert.ok(ctx.commands.some(([name]) => name === 'fillRect'));
});

test('Coronation Elsa and Perfume Alice use high-contrast active surfaces', () => {
  const cases = [
    {
      skillId: 'coronationElsa',
      outerColors: ['#C5FAFF', '#087F9F'],
      fieldColors: ['#0C1C38', '#030817'],
      outerAlpha: 0.98,
      fieldAlpha: 0.8
    },
    {
      skillId: 'perfumeAlice',
      outerColors: ['#3E58B8', '#071329'],
      fieldColors: ['#271653', '#050A1B'],
      outerAlpha: 0.98,
      fieldAlpha: 0.8
    }
  ];

  for (const expected of cases) {
    const frame = resolveSkillActiveVisualFrame(activeState(expected.skillId), {
      detail: 'full',
      visibleElapsedMs: 150
    });
    const outerCtx = makeContext();
    const fieldCtx = makeContext();
    drawSkillActiveBackdrop(outerCtx, frame);
    drawSkillActiveFieldBackground(fieldCtx, frame);
    const outerStops = outerCtx.commands.filter(([name]) => name === 'addColorStop').map(([, , color]) => color);
    const fieldStops = fieldCtx.commands.filter(([name]) => name === 'addColorStop').map(([, , color]) => color);
    assert.ok(expected.outerColors.every((color) => outerStops.includes(color)));
    assert.ok(expected.fieldColors.every((color) => fieldStops.includes(color)));
    assert.ok(outerCtx.commands.some(([name, property, value]) => name === 'set' && property === 'globalAlpha' && value === expected.outerAlpha));
    assert.ok(fieldCtx.commands.some(([name, property, value]) => name === 'set' && property === 'globalAlpha' && value === expected.fieldAlpha));
  }
});

test('runtime exposes a copied active snapshot and removes it on the session end frame', () => {
  const original = Game.SkillRegistry.coronationElsa;
  Game.SkillRegistry.coronationElsa = {
    id: 'coronationElsa',
    onActivate(ctx) {
      return ctx.createSession({ remainingMs: 1200, cleanupOnEnd: false, data: {} });
    }
  };
  try {
    const game = {
      clearPipeline: {},
      tsums: [{ freezeKind: 'coronationElsa' }],
      bombs: [{ bombType: 'moanaSpecial' }]
    };
    const runtime = new SkillRuntimeManager(game, {});
    assert.equal(runtime.activateNow('coronationElsa', 1), true);
    const snapshot = runtime.getActiveVisualState();
    assert.equal(snapshot.skillId, 'coronationElsa');
    snapshot.remainingMs = 1;
    assert.equal(runtime.sessions[0].remainingMs, 1200);
    runtime.endSession(runtime.sessions[0], 'manual');
    assert.equal(runtime.getActiveVisualState(), null);
    assert.equal(game.tsums[0].freezeKind, 'coronationElsa');
    assert.equal(game.bombs[0].bombType, 'moanaSpecial');
  } finally {
    Game.SkillRegistry.coronationElsa = original;
  }
});

test('Moana remnants cannot keep the active world alive after its session ends', () => {
  const runtime = new SkillRuntimeManager({ clearPipeline: {}, bombs: [{ bombType: 'moanaSpecial' }] }, {});
  runtime.sessions.push({ id: 'moana-1', handlerId: 'guidingMoana', remainingMs: 100, data: {}, cleanupOnEnd: false, schedules: [] });
  assert.equal(runtime.getActiveVisualState().skillId, 'guidingMoana');
  runtime.endSession(runtime.sessions[0], 'manual');
  assert.equal(runtime.getActiveVisualState(), null);
});

test('runtime snapshot follows Captain shots and Judy Nick currentMode', () => {
  const runtime = new SkillRuntimeManager({ clearPipeline: {} }, {});
  runtime.sessions.push({
    id: 'captain-1',
    handlerId: 'captainLightyear',
    remainingMs: 5000,
    data: { remainingShots: 4 },
    schedules: []
  });
  assert.equal(runtime.getActiveVisualState().remainingShots, 4);
  runtime.sessions[0].data.remainingShots = 3;
  assert.equal(runtime.getActiveVisualState().remainingShots, 3);

  runtime.sessions[0] = {
    id: 'judy-nick-1',
    handlerId: 'judyNick',
    remainingMs: 4000,
    data: { currentMode: 'judy' },
    schedules: []
  };
  assert.equal(runtime.getActiveVisualState().mode, 'judy');
  runtime.sessions[0].data.currentMode = 'nick';
  assert.equal(runtime.getActiveVisualState().mode, 'nick');
  assert.equal(Game.prototype.getSkillActiveVisualState.call({ skillRuntime: runtime }).mode, 'nick');
});

test('skill visual OFF does not suppress the independent ACTIVE state', () => {
  const renderer = {
    game: {
      elapsed: 1,
      skillVisualsEnabled: false,
      getSkillActiveVisualState: () => activeState('namine')
    },
    activeSkillVisualTransition: null,
    profile: () => ({ activeSkillVisualDetail: 'minimal' })
  };
  const frame = UIRenderer.prototype.resolveActiveSkillVisualFrame.call(renderer);
  assert.equal(frame.themeId, 'namine');
  assert.equal(frame.detail, 'minimal');
});

test('FEVER frame remains drawable while an ACTIVE world exists', () => {
  const ctx = makeContext();
  const renderer = {
    game: { feverSystem: { active: true }, elapsed: 2 },
    currentActiveSkillVisualFrame: resolveSkillActiveVisualFrame(activeState('namine'), { visibleElapsedMs: 150 })
  };
  UIRenderer.prototype.drawActiveFeverFrame.call(renderer, ctx);
  assert.equal(ctx.depth, 0);
  assert.ok(ctx.commands.some(([name]) => name === 'stroke'));
});
