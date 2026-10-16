import { wakePhysicsBody } from '../../tsumPhysics.js';
// Isolated gameplay for the staged evolution prototype. No config/game imports
// (definitions are imported by config itself).
export const EVOLUTION_ID = 'evolutionTsum';
export const EVOLUTION_TUNING = Object.freeze({
  cost: 24, speed: 3, diameter: 1.2, splashRadius: 29 * 2.8,
  manualCharge: 0.1, lineHalfWidth: 72, lineX: 207,
  lineTop: 190, lineBottom: 580, lineWidthSkill6: 2.5, lineHeightSkill6: 1.2,
  lineSec: 0.18, evolutionSec: 0.48, refillMinSec: 0.14,
  refillMaxSec: 2.5, watchdogSec: 4
});
export const evolutionSpec = level => {
  const sl = Math.max(1, Math.min(6, Math.floor(level)));
  return { durationSec: 12 + sl, first: 20 - sl, splash: 20 - sl,
    overdrive: (20 - sl) * 5, periodic: (20 - sl) * 4 };
};
export const getEvolution = game => game.skillRuntime?.sessions?.find(s => s.handlerId === EVOLUTION_ID) || null;
export const evolutionLocked = game => {
  const s = getEvolution(game);
  return !!s && !game.dragging && !!(s.data.event || s.data.queue.length || s.data.expired || game.pendingClear?.meta?.evolution);
};
export const evolutionOverdrive = game => getEvolution(game)?.data.phase === 3;

// Count physical nodes, independently of large-Tsum and OD award weights.
export function advanceEvolution(data, count, spec) {
  data.progress += count;
  while (true) {
    const threshold = [spec.first, spec.splash, spec.overdrive, spec.periodic][Math.min(data.stage, 3)];
    if (data.progress < threshold) break;
    data.progress -= threshold;
    data.queue.push(data.stage === 0 || data.stage >= 3 ? 'line' : data.stage === 1 ? 'phase2' : 'phase3');
    data.stage++;
  }
}

function grow(game, session, nodes) {
  game.boardState.setScaleModifier({ sessionId: session.id, nodeIds: nodes.map(t => t.id),
    scale: EVOLUTION_TUNING.diameter, radiusScale: EVOLUTION_TUNING.diameter });
  for (const node of nodes) wakePhysicsBody(node);
}

function accelerateRemoval(session, nodes) {
  const originals = session.data.originalRemoveDurations;
  for (const node of nodes) {
    if (!originals.has(node)) originals.set(node, node.removeDuration);
    node.removeDuration = originals.get(node) / EVOLUTION_TUNING.speed;
  }
}

function tone(game, phase) {
  if (game.skillVisualsEnabled === false || game.role === 'cpu') return;
  try {
    const Audio = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!Audio) return;
    const audio = game.evolutionAudio ||= new Audio();
    audio.resume().catch(() => {});
    const now = audio.currentTime;
    for (let i = 0; i < 3; i++) {
      const oscillator = audio.createOscillator(), gain = audio.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.value = (phase === 3 ? 440 : 330) * [1, 1.25, 1.5][i];
      gain.gain.setValueAtTime(0, now + i * 0.055);
      gain.gain.linearRampToValueAtTime(0.055, now + i * 0.055 + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.055 + 0.19);
      oscillator.connect(gain).connect(audio.destination);
      oscillator.start(now + i * 0.055); oscillator.stop(now + i * 0.055 + 0.2);
    }
  } catch { /* Audio can be unavailable without blocking gameplay. */ }
}

function readyNodes(game, top = 140) {
  return game.tsums.filter(n => !n.dead && !n.removing && n.y >= top - game.getBodyRadius(n) && n.y <= 580);
}

function lineGeometry(level) {
  const t = EVOLUTION_TUNING;
  const skill6 = level >= 6;
  const height = (t.lineBottom - t.lineTop) * (skill6 ? t.lineHeightSkill6 : 1);
  return {
    halfWidth: t.lineHalfWidth * (skill6 ? t.lineWidthSkill6 : 1),
    top: t.lineBottom - height,
    bottom: t.lineBottom
  };
}

function fireLine(game, session, event, targets) {
  const d = session.data, t = EVOLUTION_TUNING;
  event.prefire = false; event.elapsed = 0;
  d.metrics.lines++;
  game.createShockwave?.(event.x, 360, '#ffda79', 5, 20, 0.24, 400);
  game.clearPipeline.beginClear({ source: 'skill', targets, timer: t.lineSec / t.speed,
    chargeMultiplier: 0, allowBomb: false, correctionType: 'correction_0',
    meta: { evolution: session.id, automatic: true },
    onFinalize: info => { if (getEvolution(game) === session) d.metrics.realClears += info.targets.length; } });
}

export function updateEvolutionRaw(game, dt) {
  const session = getEvolution(game);
  if (!session) return;
  const d = session.data, t = EVOLUTION_TUNING;
  d.metrics.wallSec += dt;
  d.metrics.realWallSec = (performance.now() - d.wallStartedAt) / 1000;
  d.metrics.stoppedWallSec = d.stoppedWallAccum + (d.event ? (performance.now() - d.event.wallStartedAt) / 1000 : 0);
  d.metrics.coins = game.coinBonus - d.coinStart;
  let countedStop = false;
  if (game.dragging || game.pendingClear || game.pendingChainClearQueue?.length) {
    if (d.event) {
      d.event.elapsed += dt;
      d.metrics.stoppedSec += dt;
      // A malformed animation must not hold the game forever. Complete its
      // existing award event once; never abandon or replay it.
      if (d.event.elapsed > t.watchdogSec && game.pendingClear?.meta?.evolution) {
        d.metrics.watchdogRecoveries++;
        game.clearPipeline.finalize(game.pendingClear);
      }
    }
    return;
  }
  if (d.event) {
    const e = d.event;
    e.elapsed += dt; d.metrics.stoppedSec += dt;
    countedStop = true;
    if (e.prefire) {
      const geometry = lineGeometry(session.level);
      const candidates = readyNodes(game, session.level >= 6 ? geometry.top : 140);
      let targets = candidates.filter(n => Math.abs(n.x - t.lineX) <= geometry.halfWidth);
      const minimum = Math.min(6, Math.max(1, Math.ceil(game.tsums.length * 0.15)));
      if (targets.length < minimum && e.elapsed < t.refillMaxSec) return;
      if (targets.length < minimum) {
        d.metrics.refillTimeouts++;
        // A sparse, bomb-heavy board can have no central lane. Preserve the
        // reserved shot by aiming at the densest remaining lane after the cap.
        const fallback = candidates.length ? candidates : game.tsums.filter(n => !n.dead && !n.removing);
        for (const node of fallback) {
          const lane = fallback.filter(n => Math.abs(n.x - node.x) <= geometry.halfWidth);
          if (lane.length > targets.length) { targets = lane; e.x = node.x; }
        }
      }
      fireLine(game, session, e, targets);
      return;
    }
    const duration = e.kind === 'line' ? t.lineSec : t.evolutionSec;
    const available = game.tsums.filter(n => !n.dead && !n.removing && n.y >= 140 && n.y <= 580).length;
    // Need a usable board, not zero velocity. Refill is required before every
    // queued line, preventing repeated attacks on the same emptied board.
    if (e.elapsed < duration + t.refillMinSec) return;
    const minimumPlayable = Math.min(24, Math.ceil(game.tsums.length * 0.6));
    if (available < minimumPlayable && e.elapsed < t.refillMaxSec) return;
    if (e.elapsed >= t.refillMaxSec) d.metrics.refillTimeouts++;
    d.stoppedWallAccum += (performance.now() - e.wallStartedAt) / 1000;
    d.metrics.stoppedWallSec = d.stoppedWallAccum;
    d.event = null;
    if (!d.queue.length) { d.metrics.stoppedSec -= dt; countedStop = false; }
  }
  const kind = d.queue.shift();
  if (kind) {
    d.event = { kind, elapsed: 0, wallStartedAt: performance.now() };
    if (!countedStop) d.metrics.stoppedSec += dt;
    d.metrics.events.push(kind);
    if (kind === 'line') {
      d.event.prefire = true; d.event.x = t.lineX;
    } else {
      d.phase = kind === 'phase2' ? 2 : 3;
      d.metrics[`phase${d.phase}AtSec`] = d.metrics.activeSec;
      if (d.phase === 3) grow(game, session, game.tsums);
      tone(game, d.phase);
      game.createShockwave?.(207, 360, d.phase === 3 ? '#ffda79' : '#70fff2', 6, 24, 0.42, 440);
    }
  } else if (d.expired || session.remainingMs <= 0) {
    game.skillRuntime.endSession(session, 'timeout');
  }
}

export const evolutionHandler = {
  id: EVOLUTION_ID,
  onActivate(ctx) {
    for (const old of ctx.runtime.getSessionsByHandlerId(EVOLUTION_ID)) ctx.runtime.endSession(old, 'replaced');
    const spec = evolutionSpec(ctx.level);
    const session = ctx.createSession({ remainingMs: spec.durationSec * 1000, data: {
      phase: 1, stage: 0, progress: 0, queue: [], event: null, expired: false,
      originalRemoveDurations: new Map(),
      wallStartedAt: performance.now(), stoppedWallAccum: 0,
      metrics: { level: ctx.level, activeSec: 0, wallSec: 0, phase2AtSec: null, phase3AtSec: null,
        phase3PlayableSec: 0, realClears: 0, manualClears: 0, splashClears: 0,
        coins: 0, lines: 0, stoppedSec: 0, realWallSec: 0, stoppedWallSec: 0,
        gauge: 0, watchdogRecoveries: 0, refillTimeouts: 0, events: [] },
      coinStart: ctx.game.coinBonus
    } });
    // Unlock audio while activation is still inside a user gesture where possible.
    tone(ctx.game, 1);
    return session;
  },
  onTick(ctx, session, dtMs) {
    const dt = Math.min(Math.max(0, session.remainingMs), dtMs) / 1000;
    session.data.metrics.activeSec += dt;
    if (session.data.phase === 3 && !session.data.event && !session.data.queue.length && !ctx.game.pendingClear) session.data.metrics.phase3PlayableSec += dt;
  },
  onSpawn(ctx, session, node) { if (session.data.phase === 3) grow(ctx.game, session, [node]); },
  onAugmentClear(ctx, session, request) {
    const d = session.data, t = EVOLUTION_TUNING;
    accelerateRemoval(session, request.targets);
    if (request.source !== 'chain' || request.committedBeforeSkill || request.meta?.automatic) return request;
    const primary = request.targets.slice(), ids = new Set(primary.map(n => n.id));
    const groups = [];
    if (d.phase >= 2) for (const source of primary) {
      const targets = ctx.game.tsums.filter(n => !n.dead && !n.removing && !ids.has(n.id) &&
        Math.hypot(source.x - n.x, source.y - n.y) <= t.splashRadius);
      for (const n of targets) ids.add(n.id);
      groups.push({ triggerId: source.id, targets });
    }
    request.targets = primary.concat(groups.flatMap(g => g.targets));
    request.sequentialPrimaryTargets = primary;
    request.sequentialSplashGroups = groups;
    request.chainSpeedMultiplier = t.speed;
    accelerateRemoval(session, request.targets);
    const multiplier = d.phase === 3 ? 2 : 1;
    // Preserve ordinary large-Tsum evaluation, but evolution counts physical nodes.
    request.effectiveClearCountOverride = request.targets.reduce((sum, n) => sum + (n.clearWeight || 1), 0) * multiplier;
    request.chargeMultiplier = 0;
    request.evolutionPrimaryIds = new Set(primary.map(n => n.id));
    request.evolutionGaugeMultiplier = t.manualCharge * multiplier;
    request.correctionType = 'correction_0';
    request.meta = { ...request.meta, evolution: session.id, phase: d.phase };
    const previous = request.onFinalize;
    request.onFinalize = info => {
      previous?.(info);
      if (getEvolution(ctx.game) !== session) return;
      d.metrics.realClears += info.targets.length;
      const manual = info.targets.filter(n => request.evolutionPrimaryIds.has(n.id)).length;
      d.metrics.manualClears += manual;
      d.metrics.splashClears += info.targets.length - manual;
      advanceEvolution(d, info.targets.length, evolutionSpec(session.level));
    };
    return request;
  },
  onEnd(ctx, session, reason) {
    const d = session.data;
    d.metrics.realWallSec = (performance.now() - d.wallStartedAt) / 1000;
    d.metrics.stoppedWallSec = d.stoppedWallAccum + (d.event ? (performance.now() - d.event.wallStartedAt) / 1000 : 0);
    d.metrics.coins = ctx.game.coinBonus - d.coinStart;
    d.metrics.reason = reason;
    ctx.game.evolutionLastMetrics = structuredClone(d.metrics);
    ctx.game.evolutionHistory ||= [];
    ctx.game.evolutionHistory.push(ctx.game.evolutionLastMetrics);
    if (ctx.game.evolutionHistory.length > 30) ctx.game.evolutionHistory.shift();
    d.queue.length = 0; d.event = null;
  },
  cleanupBySession(ctx, sessionId) {
    ctx.clearScaleBySource(sessionId);
    const session = ctx.runtime.sessions.find(s => s.id === sessionId);
    for (const [node, duration] of session?.data.originalRemoveDurations || []) node.removeDuration = duration;
  }
};

export function drawEvolution(ctx, game) {
  if (game.state !== 'playing') return;
  const s = getEvolution(game);
  if (!s) return;
  const d = s.data, color = ['#72e6ff', '#70fff2', '#ffda79'][d.phase - 1];
  const spec = evolutionSpec(s.level);
  const threshold = [spec.first, spec.splash, spec.overdrive, spec.periodic][Math.min(d.stage, 3)];
  ctx.save();
  ctx.fillStyle = '#0a192de8'; ctx.fillRect(90, 588, 234, 32);
  ctx.fillStyle = color; ctx.font = 'bold 14px sans-serif'; ctx.textAlign = 'center';
  ctx.fillText(`PHASE ${d.phase} · ${['SPEED ×3', 'SPLASH', 'OVERDRIVE ×2'][d.phase - 1]} · ${(Math.max(0, s.remainingMs) / 1000).toFixed(1)}s`, 207, 605);
  ctx.globalAlpha = 0.8; ctx.fillRect(98, 613, 218 * Math.min(1, d.progress / threshold), 3);
  const e = d.event;
  if (e && game.skillVisualsEnabled !== false) {
    if (e.kind === 'line') {
      if (e.prefire) { ctx.restore(); return; }
      const geometry = lineGeometry(s.level);
      if (game.isGameplayInputLocked?.()) {
        ctx.globalAlpha = 0.38;
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 140, 414, 440);
      }
      ctx.globalAlpha = Math.max(0, 0.32 * (1 - e.elapsed / 0.3));
      ctx.fillStyle = '#fff2bc'; ctx.fillRect(e.x - geometry.halfWidth, geometry.top,
        geometry.halfWidth * 2, geometry.bottom - geometry.top);
    } else {
      ctx.globalAlpha = Math.min(1, Math.max(0, (0.6 - e.elapsed) * 5));
      ctx.fillStyle = '#0a192de8'; ctx.fillRect(35, 290, 344, 86);
      ctx.fillStyle = color; ctx.font = 'bold 27px sans-serif';
      ctx.fillText(d.phase === 3 ? 'OVERDRIVE' : 'SPLASH UNLOCKED', 207, 325);
      ctx.font = 'bold 15px sans-serif';
      ctx.fillText(d.phase === 3 ? '直径 ×1.2   消去評価 ×2' : '全チェーンに周囲巻き込み', 207, 355);
    }
  }
  ctx.restore();
}
