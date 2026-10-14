import { FIELD_TOP, FIELD_CENTER_X, FIELD_CENTER_Y } from './config.js';
import { LaserWeaveAudio } from './laserWeaveAudio.js';
import { photonThread, photonCrossings, photonLineTargets, photonCircleTargets, photonZones, photonBestCombination, photonZoneTargets } from './photonGeometry.js';
export { drawLaserWeave } from './photonVisuals.js';

// Final SL values live in SKILL_TABLES. Only provisional pacing/visual values
// belong here. Attack timing is simulation time and never depends on VFX mode.
export const LASER_WEAVE_TUNING = Object.freeze({
  crossDelayMs: 200, threadRecoveryMs: 200, ignitionChargeMs: 260,
  cascadeRefillMs: 450, cascadeTailMs: 300, finalRefillMs: 350,
  refillGravity: 2, minimumCrossAngle: 20, crossMergeRadiusFactor: 0.4,
  minimumZoneArea: 0.03, visualTailMs: 580, simulationStepSec: 1 / 60
});
export const getLaserWeaveSession = game => game.skillRuntime?.sessions?.find(s => s.handlerId === 'laserWeave') || null;
export const isLaserWeaveFiring = game => !!getLaserWeaveSession(game) && getLaserWeaveSession(game).data.phase !== 'aim';
// Kept for legacy input integrations; PHOTON LOOM reserves no held chain.
export const isLaserWeaveHeld = () => false;
export const getLaserWeaveHeldNodes = () => [];
export const getLaserWeaveWidth = session => session.data.width;
export function getLaserWeaveBeams(first, second, width) { const thread = photonThread(second.length >= 3 ? second : first, width); return thread ? [thread] : []; }
export const collectLaserWeaveTargets = (nodes, first, second, beams) => photonLineTargets(nodes, beams, new Set([...first, ...second].map(n => n.id)));
const radiusFor = game => n => game.getBodyRadius?.(n) ?? n.radius ?? 0;
const hasFallingRefill = game => game.tsums.some(n => !n.dead && !n.removing && n.spawnedAboveField && n.y - radiusFor(game)(n) < FIELD_TOP);

export function unlockLaserWeaveAudio(game) {
  if (game.myTsum?.id !== 'laserWeave') return;
  game.laserWeaveAudio ||= new LaserWeaveAudio(game);
  game.laserWeaveAudio.unlock();
}
export function resetLaserWeave(game) {
  for (const session of (game.skillRuntime?.sessions || []).slice()) if (session.handlerId === 'laserWeave') game.skillRuntime.endSession(session, 'reset', { skipEndPause: true });
  game.laserWeaveVisual = null;
  game.photonSimulationAccumulator = 0;
  if (game.skillRuntime?.timingPauses) game.skillRuntime.timingPauses = game.skillRuntime.timingPauses.filter(p => p.skillId !== 'laserWeave');
  game.laserWeaveAudio?.stop();
}
function phase(session, name, durationMs) { session.data.phase = name; session.data.phaseAgeMs = 0; session.data.phaseRemainingMs = durationMs; }
function effect(game, kind, payload = {}) {
  if (game.skillVisualsEnabled !== false && game.laserWeaveVisual) game.laserWeaveVisual.bursts.push({ kind, ageMs: 0, ...payload });
  game.laserWeaveAudio?.play(kind);
}
function clearGroup(game, session, targets, kind, payload = {}) {
  const ghosts = targets.map(n => ({ x: n.x, y: n.y, radius: radiusFor(game)(n), type: game.boardState.getResolvedType(n) }));
  effect(game, kind, { ...payload, ghosts });
  if (!targets.length) return false;
  return game.clearPipeline.beginClear({ source: 'skill', clearMode: 'simultaneous', scoreMode: 'mixed', targets,
    x: FIELD_CENTER_X, y: FIELD_CENTER_Y, correctionType: session.data.correctionType, allowBomb: false,
    meta: { laserWeave: true, photonAttack: kind } });
}
function updateZones(game, session) {
  const old = new Set(session.data.zones.map(z => z.key));
  session.data.zones = photonZones(session.data.beams, LASER_WEAVE_TUNING.minimumZoneArea);
  const formed = session.data.zones.filter(z => !old.has(z.key));
  if (formed.length) effect(game, 'zone', { zones: formed });
}
function shoot(game, session, chain) {
  const data = session.data;
  if (data.phase !== 'aim' || data.finishRequested || chain.length < 3 || game.pendingClear) return false;
  const thread = photonThread(chain, data.width);
  if (!thread) return false;
  const crossings = photonCrossings(thread, data.beams, LASER_WEAVE_TUNING.minimumCrossAngle, data.blastRadius * LASER_WEAVE_TUNING.crossMergeRadiusFactor);
  data.beams.push(thread);
  // Lock before awarding anything: fever/cleanup callbacks cannot accept a
  // second release or end the run in the middle of this attack.
  phase(session, 'thread', LASER_WEAVE_TUNING.crossDelayMs);
  clearGroup(game, session, photonLineTargets(game.tsums, [thread], new Set(chain.map(n => n.id)), radiusFor(game)), 'thread', { beams: [thread] });
  data.crossings = photonBestCombination(crossings, data.blastLimit, c => photonCircleTargets(game.tsums, [c], data.blastRadius, radiusFor(game)));
  updateZones(game, session);
  return true;
}
function startFinish(game, session) {
  const data = session.data;
  data.finishRequested = true;
  if (data.phase !== 'aim' || game.pendingClear) return;
  if (!data.beams.length) { game.skillRuntime.endSession(session, 'complete', { skipEndPause: true }); return; }
  phase(session, 'ignitionCharge', LASER_WEAVE_TUNING.ignitionChargeMs);
  effect(game, 'charge', { beams: data.beams });
}

export function finishLaserWeaveAtTimeUp(game) {
  const session = getLaserWeaveSession(game);
  if (!session) return false;
  if (!session.data.timeUpHandled) {
    session.data.timeUpHandled = true;
    // finishChain clears the gesture before dispatch, preventing pointer-up
    // from submitting it twice. Short chains use the normal cancel path.
    if (game.dragging) game.finishChain();
    session.data.finishRequested = true;
  }
  startFinish(game, session);
  return true;
}

export function updateLaserWeaveGameplay(game, dt) {
  const session = getLaserWeaveSession(game);
  if (!session || game.paused) return;
  const data = session.data;
  if (data.phase === 'aim') {
    if (data.finishRequested || game.timeUp || data.beams.length >= data.threadLimit) startFinish(game, session);
    return;
  }
  data.phaseAgeMs += dt * 1000;
  data.phaseRemainingMs -= dt * 1000;
  if (data.phaseRemainingMs > 0.001) return;
  switch (data.phase) {
    case 'thread':
      if (data.crossings.length) clearGroup(game, session, photonCircleTargets(game.tsums, data.crossings, data.blastRadius, radiusFor(game)), 'cross', { centers: data.crossings, radius: data.blastRadius });
      phase(session, 'threadRecovery', LASER_WEAVE_TUNING.threadRecoveryMs);
      break;
    case 'threadRecovery':
      phase(session, 'aim', 0);
      if (data.finishRequested || game.timeUp || data.beams.length >= data.threadLimit) startFinish(game, session);
      break;
    case 'ignitionCharge': {
      const lineTargets = photonLineTargets(game.tsums, data.beams, new Set(), radiusFor(game));
      data.selectedZones = photonBestCombination(data.zones, data.zoneLimit, z => photonZoneTargets(game.tsums, [z]), new Set(lineTargets.map(n => n.id)));
      const targets = [...new Map([...lineTargets, ...photonZoneTargets(game.tsums, data.selectedZones)].map(n => [n.id, n])).values()];
      clearGroup(game, session, targets, 'ignition', { beams: data.beams, zones: data.selectedZones });
      phase(session, data.cascade ? 'cascadeRefill' : 'finalRefill', data.cascade ? LASER_WEAVE_TUNING.cascadeRefillMs : LASER_WEAVE_TUNING.finalRefillMs);
      break;
    }
    case 'cascadeRefill':
      if (hasFallingRefill(game)) return;
      data.cascadeBeams = photonBestCombination(data.beams, 2, b => photonLineTargets(game.tsums, [b], new Set(), radiusFor(game)));
      clearGroup(game, session, photonLineTargets(game.tsums, data.cascadeBeams, new Set(), radiusFor(game)), 'cascade', { beams: data.cascadeBeams });
      phase(session, 'cascadeTail', LASER_WEAVE_TUNING.cascadeTailMs);
      break;
    case 'cascadeTail':
      effect(game, 'release', { beams: data.cascadeBeams });
      phase(session, 'finalRefill', LASER_WEAVE_TUNING.finalRefillMs);
      break;
    case 'finalRefill':
      if (hasFallingRefill(game)) return;
      game.skillRuntime.endSession(session, 'complete', { skipEndPause: true });
      // Fever or time bombs may have extended the run during the attacks.
      if (game.timeRemaining > 0) game.timeUp = false;
      break;
  }
}

export function getPhotonPreview(game, session = getLaserWeaveSession(game)) {
  if (!session || !game.dragging || game.chain?.length < 3) return null;
  const data = session.data, beam = photonThread(game.chain, data.width);
  if (!beam) return null;
  const targets = photonLineTargets(game.tsums, [beam], new Set(game.chain.map(n => n.id)), radiusFor(game));
  const remaining = game.tsums.filter(n => !targets.includes(n));
  const crossings = photonBestCombination(photonCrossings(beam, data.beams, LASER_WEAVE_TUNING.minimumCrossAngle, data.blastRadius * LASER_WEAVE_TUNING.crossMergeRadiusFactor), data.blastLimit,
    c => photonCircleTargets(remaining, [c], data.blastRadius, radiusFor(game)));
  const currentKeys = new Set(data.zones.map(z => z.key));
  return { beam, targets, crossings, zones: photonZones([...data.beams, beam], LASER_WEAVE_TUNING.minimumZoneArea).filter(z => !currentKeys.has(z.key)) };
}

export function registerLaserWeaveSkill({ SkillRegistry, skillValue }) {
  SkillRegistry.laserWeave = {
    id: 'laserWeave',
    onActivate(ctx) {
      for (const old of ctx.runtime.getSessionsByHandlerId('laserWeave')) ctx.runtime.endSession(old, 'reactivated', { skipEndPause: true });
      const session = ctx.createSession({ remainingMs: Infinity, data: {
        beams: [], zones: [], selectedZones: [], crossings: [], phase: 'aim', phaseAgeMs: 0,
        finishRequested: false, timeUpHandled: false,
        width: skillValue('laserWeave', 'laserWidth', ctx.level), threadLimit: skillValue('laserWeave', 'threadCount', ctx.level),
        blastRadius: skillValue('laserWeave', 'crossRadius', ctx.level), blastLimit: skillValue('laserWeave', 'crossLimit', ctx.level),
        zoneLimit: skillValue('laserWeave', 'zoneLimit', ctx.level), cascade: ctx.level >= 4,
        correctionType: skillValue('laserWeave', 'coinCorrectionType', ctx.level)
      } });
      ctx.runtime.sessions.push(session);
      ctx.game.photonSimulationAccumulator = 0;
      ctx.game.laserWeaveVisual = { activationAgeMs: 0, bursts: [] };
      effect(ctx.game, 'activate');
      ctx.game.spawnReplacementTsums?.();
      ctx.game.refreshRenderBodies?.();
      return session;
    },
    onChainCommit(ctx, session, chain) { shoot(ctx.game, session, chain); return true; },
    onAugmentClear(ctx, session, request) {
      request.allowBomb = false;
      request.chargeMultiplier = skillValue('laserWeave', 'chargeMultiplier', ctx.level);
      // Existing bombs keep their own correction, score and special effects.
      return request;
    },
    onEnd(ctx) { ctx.game.laserWeaveAudio?.stop(); }
  };
}

export function updateLaserWeaveVisuals(game, dt) {
  if (game.paused) { game.laserWeaveAudio?.stop(); return; }
  const visual = game.laserWeaveVisual;
  if (!visual) return;
  visual.activationAgeMs += dt * 1000;
  if (game.skillVisualsEnabled === false) { visual.bursts = []; game.laserWeaveAudio?.stop(); return; }
  for (const burst of visual.bursts) burst.ageMs += dt * 1000;
  visual.bursts = visual.bursts.filter(b => b.ageMs < (b.kind === 'zone' ? 850 : LASER_WEAVE_TUNING.visualTailMs)).slice(-12);
}
