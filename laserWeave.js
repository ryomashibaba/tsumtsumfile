import { WIDTH, FIELD_TOP, FIELD_BOTTOM, FIELD_CENTER_X, FIELD_CENTER_Y } from './config.js';
import { distancePointToSegment } from './clearGeometry.js';
import { drawTsumArtwork } from './tsumImages.js?v=render-quality-1';
import { LaserWeaveAudio } from './laserWeaveAudio.js';
import { SKILL_TIMING_TABLE } from './gameplayTiming.js?v=skill-timing-3';

export const LASER_WEAVE_TUNING = Object.freeze({
  widthIncrement: 12, activationMs: 240, breathingMs: 800,
  // Afterimages outlive the 180ms input hold, without extending game/skill clocks.
  visualHoldMs: 28, tailMs: 360, previewAlpha: 0.18,
  maxThreads: 8, maxParticles: 24, maxGlow: 6
});
export const LASER_WEAVE_COLORS = Object.freeze({
  edge: '#8e3544', band: '#ba626a', thread: '#f7f4ec', contrast: '#162332'
});

export function getLaserWeaveSession(game) {
  return game.skillRuntime?.sessions?.find(session => session.handlerId === 'laserWeave') || null;
}

export function isLaserWeaveFiring(game) {
  return !!game.skillRuntime?.timingPauses?.some(pause => pause.skillId === 'laserWeave' && pause.kind === 'laserWeaveFire');
}

export function isLaserWeaveHeld(game, node) {
  return !!node && !!getLaserWeaveSession(game)?.data.heldIds.includes(node.id);
}

export function getLaserWeaveHeldNodes(game, session = getLaserWeaveSession(game)) {
  if (!session) return [];
  const live = new Map((game.tsums || []).filter(node => !node.dead && !node.removing).map(node => [node.id, node]));
  return session.data.heldIds.map(id => live.get(id)).filter(Boolean);
}

export function getLaserWeaveWidth(session) {
  return session.data.initialWidth + session.data.completedSets * LASER_WEAVE_TUNING.widthIncrement;
}

export function getLaserWeaveBeams(first, second, width) {
  if (!first.length || !second.length) return [];
  return [[first[0], second[0]], [first.at(-1), second.at(-1)]].map(([from, to]) => {
    const dx = to.x - from.x; const dy = to.y - from.y;
    const length = Math.hypot(dx, dy);
    // Coincident moving anchors have no direction; use a stable horizontal line.
    const ux = length > 0.000001 ? dx / length : 1;
    const uy = length > 0.000001 ? dy / length : 0;
    const projections = [[0, FIELD_TOP], [WIDTH, FIELD_TOP], [0, FIELD_BOTTOM], [WIDTH, FIELD_BOTTOM]]
      .map(([x, y]) => (x - from.x) * ux + (y - from.y) * uy);
    // Extend beyond every board projection, including the band radius, so the
    // rounded caps cannot truncate a diagonal or a very wide beam on screen.
    const padding = width / 2 + 1;
    const startT = Math.min(...projections) - padding;
    const endT = Math.max(...projections) + padding;
    return {
      start: { x: from.x + ux * startT, y: from.y + uy * startT },
      end: { x: from.x + ux * endT, y: from.y + uy * endT }, width
    };
  });
}

export function collectLaserWeaveTargets(nodes, first, second, beams, getRadius = node => node.radius) {
  const ids = new Set([...first, ...second].map(node => node.id));
  return nodes.filter(node => node && !node.dead && !node.removing && !node.isBomb && (
    ids.has(node.id) || (node.x >= 0 && node.x <= WIDTH && node.y >= FIELD_TOP && node.y <= FIELD_BOTTOM &&
      // A Tsum is hit when the actual laser capsule touches its circular body.
      // Using the resolved hit radius keeps artwork and gameplay consistent.
      beams.some(beam => distancePointToSegment(node, beam.start, beam.end) <=
        beam.width / 2 + Math.max(0, Number(getRadius(node)) || 0)))
  ));
}

export function unlockLaserWeaveAudio(game) {
  if (game.myTsum?.id !== 'laserWeave') return;
  game.laserWeaveAudio ||= new LaserWeaveAudio(game);
  game.laserWeaveAudio.unlock();
}

export function resetLaserWeave(game) {
  for (const session of (game.skillRuntime?.sessions || []).slice()) {
    if (session.handlerId === 'laserWeave') {
      session.data.heldIds = [];
      game.skillRuntime.endSession(session, 'reset', { skipEndPause: true });
    }
  }
  game.laserWeaveVisual = null;
  if (game.skillRuntime?.timingPauses) {
    game.skillRuntime.timingPauses = game.skillRuntime.timingPauses.filter(pause => pause.skillId !== 'laserWeave');
  }
  game.laserWeaveAudio?.stop();
}

function settleHeldChain(ctx, session) {
  const held = getLaserWeaveHeldNodes(ctx.game, session);
  session.data.heldIds = [];
  if (!held.length) return;
  // Two-Tsum traces are a skill-only aiming shortcut, not normal clear awards.
  if (held.length < 3) return;
  const end = held.at(-1);
  ctx.clear.beginClear({
    source: 'chain', clearMode: 'simultaneous', scoreMode: 'chain',
    targets: held, type: ctx.board.getResolvedType(held[0]), x: end.x, y: end.y,
    allowBomb: false, meta: { laserWeave: true, laserWeaveTimeout: true }
  });
}

export function registerLaserWeaveSkill({ SkillRegistry, skillValue }) {
  SkillRegistry.laserWeave = {
    id: 'laserWeave',
    onActivate(ctx) {
      for (const previous of ctx.runtime.getSessionsByHandlerId('laserWeave')) {
        ctx.runtime.endSession(previous, 'reactivated', { skipEndPause: true });
      }
      const session = ctx.createSession({
        remainingMs: skillValue('laserWeave', 'durationSec', ctx.level) * 1000,
        data: { heldIds: [], completedSets: 0, initialWidth: skillValue('laserWeave', 'laserWidth', ctx.level) }
      });
      // Register before refill so every spawn route already sees bomb suppression.
      ctx.runtime.sessions.push(session);
      for (const bomb of ctx.game.bombs || []) bomb.dead = true;
      ctx.game.bombs = [];
      ctx.game.heldBombInput = null;
      if (ctx.game.deferredSkillInput) ctx.game.deferredSkillInput.bomb = null;
      ctx.game.laserWeaveVisual = { activationAgeMs: 0, bursts: [] };
      ctx.game.laserWeaveAudio?.play('activate');
      ctx.game.spawnReplacementTsums?.();
      ctx.game.refreshRenderBodies?.();
      return session;
    },
    onChainCommit(ctx, session, chain) {
      if (chain.length < 2) return true;
      const first = getLaserWeaveHeldNodes(ctx.game, session);
      if (!first.length) {
        session.data.heldIds = chain.map(node => node.id);
        // Holding is a selection reservation only: physics and collisions continue.
        for (const node of chain) node.inChain = false;
        ctx.game.laserWeaveAudio?.play('hold');
        return true;
      }
      const width = getLaserWeaveWidth(session);
      const beams = getLaserWeaveBeams(first, chain, width);
      const tracedIds = new Set([...first, ...chain].map(node => node.id));
      const playable = ctx.game.tsums.filter(node => tracedIds.has(node.id) || (ctx.game.isTsumInPlayArea?.(node) ?? true));
      const targets = collectLaserWeaveTargets(playable, first, chain, beams,
        node => ctx.game.getBodyRadius?.(node) ?? node.radius);
      const ghosts = targets.map(node => ({
        x: node.x, y: node.y, radius: ctx.game.getBodyRadius?.(node) || node.radius,
        type: ctx.board.getResolvedType(node)
      }));
      const heldIds = session.data.heldIds;
      session.data.heldIds = [];
      const success = ctx.clear.beginClear({
        source: 'skill', clearMode: 'simultaneous', scoreMode: 'mixed', targets,
        x: chain.at(-1).x, y: chain.at(-1).y,
        correctionType: skillValue('laserWeave', 'coinCorrectionType', ctx.level),
        allowBomb: false, meta: { laserWeave: true }
      });
      if (!success) {
        session.data.heldIds = heldIds;
        return true;
      }
      session.data.completedSets += 1;
      ctx.runtime.startTimingPause(SKILL_TIMING_TABLE.laserWeave.finalClear, {
        skillId: 'laserWeave', kind: 'laserWeaveFire'
      });
      const visual = ctx.game.laserWeaveVisual;
      if (visual && ctx.game.skillVisualsEnabled !== false) {
        visual.bursts.push({ beams, ghosts, ageMs: 0, seed: session.data.completedSets });
        // Bound afterimages, never gameplay width or actual clear targets.
        visual.bursts = visual.bursts.slice(-3);
      }
      ctx.game.laserWeaveAudio?.play('fire', width);
      return true;
    },
    onAugmentClear(ctx, session, request) {
      request.allowBomb = false;
      return request;
    },
    onEnd(ctx, session, reason) {
      if (reason === 'timeout' || reason === 'reactivated') settleHeldChain(ctx, session);
      else session.data.heldIds = [];
    }
  };
}

export function updateLaserWeaveVisuals(game, dt) {
  if (!game.laserWeaveVisual || game.paused) {
    if (game.paused) game.laserWeaveAudio?.stop();
    return;
  }
  const visual = game.laserWeaveVisual;
  visual.activationAgeMs += dt * 1000;
  if (game.skillVisualsEnabled === false) {
    visual.bursts = [];
    game.laserWeaveAudio?.stop();
  }
  for (const burst of visual.bursts) burst.ageMs += dt * 1000;
  visual.bursts = visual.bursts.filter(burst => burst.ageMs < LASER_WEAVE_TUNING.tailMs);
}

// Clockwise capsule subpaths are filled together, so overlaps receive alpha once.
function addCapsule(ctx, beam) {
  const { start, end } = beam;
  const radius = beam.width / 2;
  const angle = Math.atan2(end.y - start.y, end.x - start.x);
  const nx = Math.cos(angle + Math.PI / 2) * radius;
  const ny = Math.sin(angle + Math.PI / 2) * radius;
  ctx.moveTo(start.x + nx, start.y + ny);
  ctx.lineTo(end.x + nx, end.y + ny);
  ctx.arc(end.x, end.y, radius, angle + Math.PI / 2, angle - Math.PI / 2, true);
  ctx.lineTo(start.x - nx, start.y - ny);
  ctx.arc(start.x, start.y, radius, angle - Math.PI / 2, angle - Math.PI * 1.5, true);
  ctx.closePath();
}

function drawBands(ctx, beams, alpha, edgeAlpha = 0.7) {
  ctx.beginPath();
  for (const beam of beams) addCapsule(ctx, beam);
  ctx.fillStyle = LASER_WEAVE_COLORS.band;
  ctx.globalAlpha = alpha;
  ctx.fill();
  ctx.globalAlpha = edgeAlpha;
  ctx.lineWidth = 1;
  ctx.strokeStyle = LASER_WEAVE_COLORS.thread;
  ctx.stroke();
  ctx.globalAlpha = 1;
}

function drawHeldChain(ctx, nodes, ageMs, decorated) {
  if (!nodes.length) return;
  const pulse = decorated ? 0.84 + 0.16 * Math.sin(ageMs * Math.PI * 2 / LASER_WEAVE_TUNING.breathingMs) : 1;
  ctx.lineCap = 'round';
  ctx.shadowColor = LASER_WEAVE_COLORS.band;
  ctx.shadowBlur = decorated ? 3 : 0;
  ctx.beginPath();
  nodes.forEach((node, index) => index ? ctx.lineTo(node.x, node.y) : ctx.moveTo(node.x, node.y));
  ctx.strokeStyle = LASER_WEAVE_COLORS.contrast;
  ctx.lineWidth = 3.5;
  ctx.stroke();
  ctx.strokeStyle = LASER_WEAVE_COLORS.thread;
  ctx.lineWidth = 1.5;
  ctx.globalAlpha = pulse;
  ctx.stroke();
  for (const [index, node] of nodes.entries()) {
    const radius = (node.radius || 29) * 0.84;
    ctx.beginPath();
    ctx.arc(node.x, node.y, radius, 0.1, Math.PI * 2 - (index === 0 ? 0.4 : 0.1));
    ctx.strokeStyle = LASER_WEAVE_COLORS.edge;
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.strokeStyle = LASER_WEAVE_COLORS.thread;
    ctx.lineWidth = 1.1;
    ctx.stroke();
    if (index === nodes.length - 1) {
      ctx.beginPath();
      ctx.moveTo(node.x + radius - 2, node.y - 5); ctx.lineTo(node.x + radius + 3, node.y - 5);
      ctx.moveTo(node.x + radius - 2, node.y + 1); ctx.lineTo(node.x + radius + 3, node.y + 1);
      ctx.stroke();
    }
  }
  if (decorated && nodes.length > 1) {
    const position = (ageMs / 700) % (nodes.length - 1);
    const index = Math.floor(position);
    const t = position - index;
    const a = nodes[index]; const b = nodes[index + 1];
    ctx.beginPath(); ctx.arc(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, 2.3, 0, Math.PI * 2);
    ctx.fillStyle = LASER_WEAVE_COLORS.thread; ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.shadowBlur = 0;
}

function drawBurst(ctx, burst, profile) {
  const hold = profile.visualHitStop ? LASER_WEAVE_TUNING.visualHoldMs : 0;
  const progress = Math.max(0, burst.ageMs - hold) / (LASER_WEAVE_TUNING.tailMs - hold);
  // Hold a readable cutting stroke before fading. A 90ms spike alone was
  // easy to miss while looking at the moving Tsums and integer game timer.
  const fadeStartMs = 160;
  const alpha = Math.max(0, 1 - Math.max(0, burst.ageMs - fadeStartMs) / (LASER_WEAVE_TUNING.tailMs - fadeStartMs)) ** 1.2;
  const strike = Math.max(0, 1 - Math.max(0, burst.ageMs - hold) / 180);
  if (profile.drawArtwork && progress < 0.28) {
    ctx.globalAlpha = Math.max(0, 1 - progress / 0.28);
    for (const ghost of burst.ghosts) drawTsumArtwork(ctx, ghost.type, ghost.x, ghost.y, ghost.radius, { fit: 'cover' });
    ctx.globalAlpha = 1;
  }
  drawBands(ctx, burst.beams, (0.42 + strike * 0.2) * alpha, 0.9 * alpha);
  ctx.save();
  ctx.beginPath();
  for (const beam of burst.beams) addCapsule(ctx, beam);
  ctx.clip();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = LASER_WEAVE_COLORS.thread;
  ctx.lineCap = 'round';
  ctx.lineWidth = 1.5;
  if (profile.skillVisualDetail === 'full') {
    ctx.shadowColor = LASER_WEAVE_COLORS.band;
    ctx.shadowBlur = LASER_WEAVE_TUNING.maxGlow;
  }
  for (const beam of burst.beams) {
    const dx = beam.end.x - beam.start.x; const dy = beam.end.y - beam.start.y;
    const length = Math.hypot(dx, dy) || 1;
    const nx = -dy / length; const ny = dx / length;
    // A sharp white cutting core and a brief inner flare stay inside the
    // actual two capsules. No full-screen flash or physics snapshot is used.
    ctx.beginPath(); ctx.moveTo(beam.start.x, beam.start.y); ctx.lineTo(beam.end.x, beam.end.y);
    ctx.strokeStyle = LASER_WEAVE_COLORS.thread;
    ctx.lineWidth = Math.min(beam.width * 0.85, 40);
    ctx.globalAlpha = strike * 0.6;
    ctx.stroke();
    ctx.lineWidth = Math.min(beam.width * 0.4, 22);
    ctx.globalAlpha = alpha * 0.95;
    ctx.stroke();
    const count = profile.skillVisualDetail === 'full'
      ? Math.min(LASER_WEAVE_TUNING.maxThreads, 3 + Math.floor(Math.max(0, beam.width - 19) / 16)) : 3;
    const spread = Math.min(beam.width * 0.32, WIDTH * 0.6);
    for (let thread = 0; thread < count; thread++) {
      ctx.globalAlpha = alpha;
      ctx.lineWidth = thread === Math.floor(count / 2) ? 2.5 : 1.3;
      const offset = (thread / (count - 1) * 2 - 1) * spread;
      ctx.beginPath();
      for (let step = 0; step <= 12; step++) {
        const t = step / 12;
        const weave = Math.sin(t * Math.PI * 4 + thread * 2 + progress * 2) * Math.min(beam.width * 0.1, 4);
        const x = beam.start.x + dx * t + nx * (offset + weave);
        const y = beam.start.y + dy * t + ny * (offset + weave);
        if (!step) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    const head = Math.min(1, burst.ageMs / 70);
    if (head < 1) {
      ctx.globalAlpha = (1 - head) * 0.9;
      ctx.beginPath();
      ctx.arc(beam.start.x + dx * head, beam.start.y + dy * head, Math.min(beam.width * 0.26, 14), 0, Math.PI * 2);
      ctx.fillStyle = LASER_WEAVE_COLORS.thread; ctx.fill();
    }
  }
  ctx.restore();
  if (profile.drawTransientEffects) {
    ctx.globalAlpha = alpha;
    ctx.fillStyle = LASER_WEAVE_COLORS.thread;
    // Firing locks the next set; one burst shares its budget across both lines.
    const count = Math.round(LASER_WEAVE_TUNING.maxParticles * (profile.particleScale ?? 1));
    for (let i = 0; i < count; i++) {
      const beam = burst.beams[i % 2];
      const dx = beam.end.x - beam.start.x; const dy = beam.end.y - beam.start.y;
      const length = Math.hypot(dx, dy) || 1;
      const t = ((i * 7 + burst.seed * 3) % 23) / 23;
      const travel = progress * (14 + i % 6 * 4) * (i % 4 < 2 ? 1 : -1);
      const x = beam.start.x + dx * t - dy / length * travel;
      const y = beam.start.y + dy * t + dx / length * travel;
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = i % 3 ? LASER_WEAVE_COLORS.thread : LASER_WEAVE_COLORS.band;
      ctx.beginPath(); ctx.moveTo(x, y);
      ctx.lineTo(x - dy / length * 5, y + dx / length * 5); ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
}

export function drawLaserWeave(ctx, game, profile) {
  const session = getLaserWeaveSession(game);
  const visual = game.laserWeaveVisual;
  if (!session && !visual?.bursts.length) return;
  ctx.save();
  ctx.beginPath(); ctx.rect(0, FIELD_TOP, WIDTH, FIELD_BOTTOM - FIELD_TOP); ctx.clip();
  const decorated = game.skillVisualsEnabled !== false && profile.drawTransientEffects;
  const ageMs = visual?.activationAgeMs || 0;
  if (session) {
    const held = getLaserWeaveHeldNodes(game, session);
    const beams = game.dragging ? getLaserWeaveBeams(held, game.chain || [], getLaserWeaveWidth(session)) : [];
    if (beams.length) drawBands(ctx, beams, LASER_WEAVE_TUNING.previewAlpha);
    drawHeldChain(ctx, held, ageMs, decorated);
    if (decorated && ageMs < LASER_WEAVE_TUNING.activationMs) {
      const progress = ageMs / LASER_WEAVE_TUNING.activationMs;
      ctx.globalAlpha = Math.sin(progress * Math.PI);
      ctx.strokeStyle = LASER_WEAVE_COLORS.thread; ctx.lineWidth = 1.5;
      for (const sign of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(FIELD_CENTER_X - 44, FIELD_CENTER_Y + sign * (1 - progress) * 18);
        ctx.bezierCurveTo(FIELD_CENTER_X - 12, FIELD_CENTER_Y - sign * 10, FIELD_CENTER_X + 12, FIELD_CENTER_Y + sign * 10, FIELD_CENTER_X + 44, FIELD_CENTER_Y - sign * (1 - progress) * 18);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
    ctx.fillStyle = 'rgba(22,35,50,0.82)'; ctx.fillRect(FIELD_CENTER_X - 105, FIELD_TOP + 7, 210, 23);
    ctx.fillStyle = LASER_WEAVE_COLORS.thread; ctx.textAlign = 'center';
    ctx.font = '700 12px "Trebuchet MS", sans-serif';
    ctx.fillText(`LASER WEAVE  ${(Math.max(0, session.remainingMs) / 1000).toFixed(1)}s · ${getLaserWeaveWidth(session)}px`, FIELD_CENTER_X, FIELD_TOP + 23);
  }
  if (game.skillVisualsEnabled !== false) for (const burst of visual?.bursts || []) drawBurst(ctx, burst, profile);
  ctx.restore();
}
