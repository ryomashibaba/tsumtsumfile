import assert from 'node:assert/strict';
import test from 'node:test';

import {
  SKILL_VISUAL_TIMELINES,
  resolveSkillVisualPhase,
  drawSkillPresentation,
  drawSkillSecondaryVisual
} from './skillPresentationVisuals.js';
import { SKILL_TIMING_TABLE } from './gameplayTiming.js';
import { UIRenderer } from './ui.js';

function makeContext() {
  const commands = [];
  let depth = 0;
  const gradient = { addColorStop: (...args) => commands.push(['addColorStop', ...args]) };
  const target = {
    commands,
    get depth() { return depth; },
    save() { depth += 1; commands.push(['save']); },
    restore() { depth -= 1; commands.push(['restore']); assert.ok(depth >= 0, 'restore cannot underflow'); },
    createLinearGradient(...args) { commands.push(['createLinearGradient', ...args]); return gradient; },
    createRadialGradient(...args) { commands.push(['createRadialGradient', ...args]); return gradient; }
  };
  const methods = new Set([
    'beginPath', 'rect', 'clip', 'fillRect', 'arc', 'fill', 'stroke', 'moveTo', 'lineTo',
    'closePath', 'translate', 'rotate', 'scale', 'quadraticCurveTo', 'bezierCurveTo',
    'roundRect'
  ]);
  return new Proxy(target, {
    get(object, property) {
      if (property in object) return object[property];
      if (methods.has(property)) return (...args) => commands.push([property, ...args]);
      return undefined;
    },
    set(object, property, value) {
      commands.push(['set', property, typeof value === 'object' ? '[object]' : value]);
      object[property] = value;
      return true;
    }
  });
}

function visualGame() {
  return {
    score: 12345,
    coinBonus: 678,
    timeRemaining: 42,
    renderBodies: [],
    tsums: [
      { id: 'a', x: 90, y: 310, radius: 25, vx: 0.1, vy: 0.2, type: { id: 'gaston' }, dead: false },
      { id: 'b', x: 205, y: 420, radius: 25, vx: -0.1, vy: 0.3, type: { id: 'guidingMoana' }, dead: false },
      { id: 'c', x: 320, y: 535, radius: 25, vx: 0, vy: 0, type: { id: 'namine' }, dead: false }
    ],
    skillSystem: { charge: 12, ready: false },
    pendingClear: null
  };
}

function boundaryPoints(timeline, durationMs) {
  const points = new Set([0, durationMs]);
  for (const [endMs] of timeline) {
    points.add(Math.max(0, endMs - 0.001));
    points.add(Math.min(durationMs, endMs + 0.001));
  }
  return [...points].sort((a, b) => a - b);
}

test('all skill visual timeline boundaries resolve and draw without mutating game state', () => {
  for (const [skillId, kinds] of Object.entries(SKILL_VISUAL_TIMELINES)) {
    for (const [kind, timeline] of Object.entries(kinds)) {
      const durationMs = kind === 'presentation'
        ? SKILL_TIMING_TABLE[skillId].presentation.durationMs
        : kind === 'skillEnd'
          ? SKILL_TIMING_TABLE[skillId].endPause.durationMs
          : SKILL_TIMING_TABLE[skillId][kind]?.durationMs || 160;
      for (const elapsedMs of boundaryPoints(timeline, durationMs)) {
        const phase = resolveSkillVisualPhase(skillId, kind, elapsedMs, durationMs);
        assert.ok(phase.name);
        assert.ok(phase.progress >= 0 && phase.progress <= 1);
        const game = visualGame();
        const before = structuredClone(game);
        const ctx = makeContext();
        const state = {
          skillId,
          kind,
          elapsedMs,
          durationMs,
          sequenceId: 7,
          activationData: skillId === 'judyNick' ? { judyNickMode: 'nick', judyNickExistingMode: 'judy' } : null,
          centers: [{ x: 205, y: 410 }],
          targetIds: ['a', 'b']
        };
        const drawn = kind === 'presentation'
          ? drawSkillPresentation(ctx, game, state)
          : drawSkillSecondaryVisual(ctx, game, state);
        assert.equal(drawn, true, `${skillId}/${kind}/${elapsedMs} should draw`);
        assert.equal(ctx.depth, 0, `${skillId}/${kind}/${elapsedMs} must balance save/restore`);
        assert.deepEqual(game, before, `${skillId}/${kind}/${elapsedMs} must be visual-only`);
      }
    }
  }
});

test('the same visual seed emits the same deterministic canvas command stream', () => {
  const state = {
    skillId: 'liliaVanrouge',
    kind: 'presentation',
    elapsedMs: 3250,
    durationMs: 3360,
    sequenceId: 12,
    activationData: null,
    centers: [],
    targetIds: []
  };
  const first = makeContext();
  const second = makeContext();
  drawSkillPresentation(first, visualGame(), state);
  drawSkillPresentation(second, visualGame(), state);
  assert.deepEqual(first.commands, second.commands);
});

test('unknown visual states fail closed without drawing gameplay effects', () => {
  const ctx = makeContext();
  assert.equal(drawSkillPresentation(ctx, visualGame(), { skillId: 'unknown', kind: 'presentation', elapsedMs: 0, durationMs: 1 }), false);
  assert.equal(drawSkillSecondaryVisual(ctx, visualGame(), { skillId: 'unknown', kind: 'skillEnd', elapsedMs: 0, durationMs: 1 }), false);
  assert.equal(ctx.depth, 0);
});

test('disabling all skill visuals skips both presentation and secondary drawing', () => {
  let stateReads = 0;
  const renderer = {
    game: {
      skillVisualsEnabled: false,
      getSkillVisualState() {
        stateReads += 1;
        return { skillId: 'coronationElsa', kind: 'presentation', elapsedMs: 500, durationMs: 1750 };
      }
    }
  };
  UIRenderer.prototype.drawSkillVisualLayer.call(renderer, makeContext());
  assert.equal(stateReads, 0);
});
