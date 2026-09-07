import {
  FIELD_BOTTOM,
  FIELD_CENTER_X,
  FIELD_CENTER_Y,
  FIELD_TOP,
  HEIGHT,
  SKILL_TABLES,
  WIDTH,
  clamp,
  distance
} from './config.js';
import { collectIdsAlongPolyline } from './clearGeometry.js';
import { SKILL_TIMING_TABLE } from './gameplayTiming.js';
import { drawTsumArtwork } from './tsumImages.js';

export const FINAL_BATTLE_HOOK_TYPE_ID = 'finalBattleHook';
export const FINAL_BATTLE_HOOK_SKILL_COST = 19;
export const FINAL_BATTLE_HOOK_ACTIVE_DURATION_MS = 1800;

export const FINAL_BATTLE_HOOK_PHASE = Object.freeze({
  REVEAL: 'REVEAL',
  ACTIVE_INPUT: 'ACTIVE_INPUT',
  EXPIRED_DRAG: 'EXPIRED_DRAG',
  MANUAL_RESOLVE: 'MANUAL_RESOLVE',
  SLASH_VISUAL: 'SLASH_VISUAL',
  DIAGONAL_RESOLVE: 'DIAGONAL_RESOLVE',
  GROWTH_SETTLE: 'GROWTH_SETTLE',
  ENDED: 'ENDED'
});

export const FINAL_BATTLE_HOOK_TUNING = Object.freeze({
  // TODO FINAL_BATTLE_HOOK_CALIBRATION: Values below are video-derived, not official internals.
  slashAngleDeg: 65,
  baseHalfWidthRatio: Object.freeze([0.1424, 0.1486, 0.1552, 0.1622, 0.1697, 0.1775]),
  halfWidthGrowthLinear: 0.01617,
  halfWidthGrowthQuadratic: 0.000837,
  angryInitialFaceDiameterRatio: 0.25,
  angryConnectionDistance: Math.hypot(WIDTH, FIELD_BOTTOM - FIELD_TOP),
  pointerSampleStep: 6,
  allowExpiredDragCommit: true,
  manualPhysicalCharge: 0.10,
  diagonalChargeMultiplier: 0.20,
  visualScaleAnchors: Object.freeze([
    Object.freeze([0, 1.000]),
    Object.freeze([1, 1.044]),
    Object.freeze([2, 1.191]),
    Object.freeze([3, 1.286]),
    Object.freeze([4, 1.418]),
    Object.freeze([5, 1.528]),
    Object.freeze([6, 1.661]),
    Object.freeze([7, 1.761]),
    Object.freeze([13, 2.900])
  ])
});

export function finalBattleHookSkillValue(key, level) {
  return SKILL_TABLES.finalBattleHook?.[key]?.[clamp(Number(level) || 1, 1, 6) - 1];
}

export function getFinalBattleHookLogicalEquivalent(level, successCount = 0) {
  return Math.max(0, finalBattleHookSkillValue('initialLogicalEquivalent', level) || 0)
    + Math.max(0, Math.floor(successCount || 0)) * 2;
}

export function getFinalBattleHookVisualScale(successCount = 0) {
  const value = Math.max(0, Number(successCount) || 0);
  const anchors = FINAL_BATTLE_HOOK_TUNING.visualScaleAnchors;
  const [lastK, lastScale] = anchors.at(-1);
  if (value > lastK) {
    const approximation = (k) => 1 + 0.0770 * k + 0.00533 * k * k;
    return lastScale + approximation(value) - approximation(lastK);
  }
  for (let index = 1; index < anchors.length; index += 1) {
    const [endK, endScale] = anchors[index];
    if (value > endK) continue;
    const [startK, startScale] = anchors[index - 1];
    const progress = (value - startK) / Math.max(1, endK - startK);
    return startScale + (endScale - startScale) * progress;
  }
  return 1;
}

export function getFinalBattleHookHalfWidth(boardWidth, level, successCount = 0) {
  const width = Math.max(0, Number(boardWidth) || 0);
  const levelIndex = clamp(Number(level) || 1, 1, 6) - 1;
  const count = Math.max(0, Number(successCount) || 0);
  const growth = FINAL_BATTLE_HOOK_TUNING.halfWidthGrowthLinear * count
    + FINAL_BATTLE_HOOK_TUNING.halfWidthGrowthQuadratic * count * count;
  return width * (FINAL_BATTLE_HOOK_TUNING.baseHalfWidthRatio[levelIndex] + growth);
}

export function createFinalBattleHookSlashGeometry({
  boardWidth = WIDTH,
  level = 1,
  successCount = 0,
  centerX = FIELD_CENTER_X,
  centerY = FIELD_CENTER_Y
} = {}) {
  const angleRad = FINAL_BATTLE_HOOK_TUNING.slashAngleDeg * Math.PI / 180;
  const direction = { x: Math.cos(angleRad), y: -Math.sin(angleRad) };
  const halfLength = Math.hypot(boardWidth, FIELD_BOTTOM - FIELD_TOP) * 0.55;
  return Object.freeze({
    angleDeg: FINAL_BATTLE_HOOK_TUNING.slashAngleDeg,
    start: Object.freeze({ x: centerX - direction.x * halfLength, y: centerY - direction.y * halfLength }),
    end: Object.freeze({ x: centerX + direction.x * halfLength, y: centerY + direction.y * halfLength }),
    halfWidth: getFinalBattleHookHalfWidth(boardWidth, level, successCount)
  });
}

export function collectFinalBattleHookDiagonalTargets(nodes, geometry) {
  if (!geometry) return [];
  const byId = new Map((nodes || []).map((node) => [node?.id, node]));
  return [...collectIdsAlongPolyline(nodes, [geometry.start, geometry.end], geometry.halfWidth)]
    .map((id) => byId.get(id))
    .filter(Boolean);
}

export function classifyFinalBattleHookChain(chain) {
  const entries = Array.isArray(chain) ? chain : [];
  const angryCount = entries.filter((node) => node?.finalBattleHookAngry === true).length;
  const physicalHooks = entries.filter((node) => (
    node?.finalBattleHookAngry !== true
    && !node?.virtual
    && (node?.type?.id || node?.typeId) === FINAL_BATTLE_HOOK_TYPE_ID
  ));
  return {
    angryCount,
    physicalHooks,
    valid: entries.length >= 3 && angryCount === 1 && physicalHooks.length >= 2
  };
}

function getSessionData(session) {
  return session?.data || null;
}

function isPhysicalHook(game, node) {
  return !!node && !node.virtual && game?.boardState?.getResolvedType(node)?.id === FINAL_BATTLE_HOOK_TYPE_ID;
}

function isLiveChainCandidate(game, node) {
  return !!(
    node && !node.dead && !node.removing && !node.clearOccupying && !node.inChain
    && !game.boardState?.isFrozen(node)
    && game.isTsumInPlayArea(node)
  );
}

function angryRadius(data) {
  return WIDTH * FINAL_BATTLE_HOOK_TUNING.angryInitialFaceDiameterRatio * 0.5
    * Math.max(1, data?.angryHook?.visualScale || 1);
}

function setChainFeedback(game, data, fallbackPosition) {
  const classification = classifyFinalBattleHookChain(game.chain);
  const count = classification.angryCount
    ? classification.physicalHooks.length + data.angryHook.logicalEquivalent
    : classification.physicalHooks.length;
  const current = game.chain.at(-1) || fallbackPosition;
  game.gameFeel?.setChain(count, current?.x || fallbackPosition.x, current?.y || fallbackPosition.y);
}

function clearCustomChainState(game, data) {
  data.specialChain = { active: false, nodeIds: [], lastPointer: null };
  if (data.angryHook) data.angryHook.inChain = false;
}

function startCustomChain(game, data, node, pos) {
  node.inChain = true;
  game.dragging = true;
  game.chain = [node];
  game.chainSet = new Set([node.id]);
  game.chainTypeId = FINAL_BATTLE_HOOK_TYPE_ID;
  game.chainRule = { mode: 'finalBattleHook', allowedTypeIds: new Set([FINAL_BATTLE_HOOK_TYPE_ID]) };
  game.dragPointer = pos;
  data.specialChain = { active: true, nodeIds: [node.id], lastPointer: { ...pos } };
  setChainFeedback(game, data, pos);
}

function removeBacktrackNode(game, data, pos) {
  if (game.chain.length <= 1) return false;
  const backtrack = game.chain[game.chain.length - 2];
  const radius = backtrack.finalBattleHookAngry ? angryRadius(data) : game.getBodyRadius(backtrack);
  if (distance(pos.x, pos.y, backtrack.x, backtrack.y) > radius * 1.3) return false;
  const removed = game.chain.pop();
  removed.inChain = false;
  game.chainSet.delete(removed.id);
  data.specialChain.nodeIds = game.chain.map((node) => node.id);
  setChainFeedback(game, data, pos);
  return true;
}

function canConnect(game, data, last, candidate, chainConnectMargin) {
  if (last?.finalBattleHookAngry || candidate?.finalBattleHookAngry) {
    return distance(last.x, last.y, candidate.x, candidate.y)
      <= FINAL_BATTLE_HOOK_TUNING.angryConnectionDistance;
  }
  return game.canConnectWithChainRule(
    { mode: 'normal', allowedTypeIds: new Set([FINAL_BATTLE_HOOK_TYPE_ID]) },
    last,
    candidate,
    chainConnectMargin
  );
}

function extendAtPoint(game, data, pos, chainInputMargin, chainConnectMargin) {
  if (removeBacktrackNode(game, data, pos)) return;
  const last = game.chain.at(-1);
  if (!last) return;
  const angry = data.angryHook;
  if (
    !angry.inChain
    && distance(pos.x, pos.y, angry.x, angry.y) <= angryRadius(data) + chainInputMargin
    && canConnect(game, data, last, angry, chainConnectMargin)
  ) {
    angry.inChain = true;
    game.chain.push(angry);
    game.chainSet.add(angry.id);
    data.specialChain.nodeIds = game.chain.map((node) => node.id);
    setChainFeedback(game, data, pos);
    return;
  }

  let candidate = null;
  let bestCursorDistance = Infinity;
  for (const node of game.tsums || []) {
    if (!isPhysicalHook(game, node) || !isLiveChainCandidate(game, node)) continue;
    const cursorDistance = distance(pos.x, pos.y, node.x, node.y);
    if (cursorDistance > game.getBodyRadius(node) * 1.3 + chainInputMargin) continue;
    if (!canConnect(game, data, last, node, chainConnectMargin)) continue;
    if (cursorDistance < bestCursorDistance) {
      bestCursorDistance = cursorDistance;
      candidate = node;
    }
  }
  if (!candidate) return;
  candidate.inChain = true;
  game.chain.push(candidate);
  game.chainSet.add(candidate.id);
  data.specialChain.nodeIds = game.chain.map((node) => node.id);
  setChainFeedback(game, data, pos);
}

function advanceCustomDrag(game, data, pos, chainInputMargin, chainConnectMargin) {
  const previous = data.specialChain.lastPointer || pos;
  const span = distance(previous.x, previous.y, pos.x, pos.y);
  const steps = Math.max(1, Math.ceil(span / FINAL_BATTLE_HOOK_TUNING.pointerSampleStep));
  for (let index = 1; index <= steps; index += 1) {
    const ratio = index / steps;
    extendAtPoint(game, data, {
      x: previous.x + (pos.x - previous.x) * ratio,
      y: previous.y + (pos.y - previous.y) * ratio
    }, chainInputMargin, chainConnectMargin);
  }
  data.specialChain.lastPointer = { ...pos };
}

function timingClearSpec(game, timing) {
  const enabled = game.skillVisualsEnabled !== false;
  return {
    timer: enabled ? timing.durationMs / 1000 : 0,
    pauseClock: enabled && timing.pauseClock,
    pausePhysics: enabled && timing.pausePhysics
  };
}

function finishGrowth(ctx, session) {
  const data = getSessionData(session);
  if (!data) return;
  if (data.expiryPending || data.remainingActiveMs <= 0) {
    ctx.runtime.endSession(session, 'timeout');
    return;
  }
  data.phase = FINAL_BATTLE_HOOK_PHASE.ACTIVE_INPUT;
}

function completeSuccessfulCycle(ctx, session) {
  const data = getSessionData(session);
  data.successCount += 1;
  data.angryHook.logicalEquivalent = getFinalBattleHookLogicalEquivalent(session.level, data.successCount);
  data.angryHook.visualScale = getFinalBattleHookVisualScale(data.successCount);
  data.angryHook.radius = angryRadius(data);
  data.phase = FINAL_BATTLE_HOOK_PHASE.GROWTH_SETTLE;
  ctx.runtime.startTimingPause(SKILL_TIMING_TABLE.finalBattleHook.growthSettle, {
    kind: 'growthSettle',
    skillId: FINAL_BATTLE_HOOK_TYPE_ID,
    centers: [{ x: data.angryHook.x, y: data.angryHook.y }],
    onComplete: () => finishGrowth(ctx, session)
  });
}

function startDiagonalClear(ctx, session, geometry) {
  const data = getSessionData(session);
  data.phase = FINAL_BATTLE_HOOK_PHASE.DIAGONAL_RESOLVE;
  const candidates = (ctx.game.tsums || []).filter((node) => (
    node && !node.dead && !node.removing && !node.isBomb && ctx.game.isTsumInPlayArea(node)
  ));
  const targets = collectFinalBattleHookDiagonalTargets(candidates, geometry);
  data.debug.diagonalTargetCount = targets.length;
  const timing = SKILL_TIMING_TABLE.finalBattleHook.diagonalResolve;
  const handled = ctx.clear.beginClear({
    source: 'finalBattleHookDiagonal',
    targets,
    allowEmptyEvent: true,
    x: FIELD_CENTER_X,
    y: FIELD_CENTER_Y,
    allowBomb: false,
    scoreMultiplier: finalBattleHookSkillValue('diagonalScoreMultiplier', session.level),
    correctionType: finalBattleHookSkillValue('diagonalCoinCorrectionType', session.level),
    chargeMultiplier: FINAL_BATTLE_HOOK_TUNING.diagonalChargeMultiplier,
    ...timingClearSpec(ctx.game, timing),
    visual: {
      skillId: FINAL_BATTLE_HOOK_TYPE_ID,
      kind: 'diagonalResolve',
      durationMs: timing.durationMs,
      sequenceId: ctx.runtime.createVisualSequenceId(),
      centers: [{ x: FIELD_CENTER_X, y: FIELD_CENTER_Y }],
      targetIds: targets.map((target) => target.id),
      activationData: { geometry }
    },
    onFinalize: () => completeSuccessfulCycle(ctx, session)
  });
  if (!handled) completeSuccessfulCycle(ctx, session);
}

function startSlash(ctx, session, cycleSuccessCount) {
  const data = getSessionData(session);
  const geometry = createFinalBattleHookSlashGeometry({
    boardWidth: ctx.game.width || WIDTH,
    level: session.level,
    successCount: cycleSuccessCount
  });
  data.phase = FINAL_BATTLE_HOOK_PHASE.SLASH_VISUAL;
  data.slashState = { active: true, geometry, cycleSuccessCount };
  ctx.runtime.startTimingPause(SKILL_TIMING_TABLE.finalBattleHook.slashVisual, {
    kind: 'slashVisual',
    skillId: FINAL_BATTLE_HOOK_TYPE_ID,
    centers: [{ x: FIELD_CENTER_X, y: FIELD_CENTER_Y }],
    activationData: { geometry },
    onComplete: () => startDiagonalClear(ctx, session, geometry)
  });
}

function beginManualClear(ctx, session, chain) {
  const data = getSessionData(session);
  const classification = classifyFinalBattleHookChain(chain);
  if (!classification.valid) return false;
  const logicalEquivalent = data.angryHook.logicalEquivalent;
  const physicalCount = classification.physicalHooks.length;
  const effectiveCount = physicalCount + logicalEquivalent;
  const cycleSuccessCount = data.successCount;
  data.phase = FINAL_BATTLE_HOOK_PHASE.MANUAL_RESOLVE;
  data.debug.manualPhysicalCount = physicalCount;
  data.debug.manualEffectiveCount = effectiveCount;
  data.debug.gaugeContribution = physicalCount * FINAL_BATTLE_HOOK_TUNING.manualPhysicalCharge
    + logicalEquivalent * FINAL_BATTLE_HOOK_TUNING.manualPhysicalCharge;
  const timing = SKILL_TIMING_TABLE.finalBattleHook.manualResolve;
  return ctx.clear.beginClear({
    source: 'finalBattleHookManual',
    scoreMode: 'chain',
    targets: classification.physicalHooks,
    x: data.angryHook.x,
    y: data.angryHook.y,
    type: ctx.game.myTsum,
    effectiveClearCountOverride: effectiveCount,
    bombEffectiveClearCount: physicalCount,
    allowBomb: true,
    scoreMultiplier: finalBattleHookSkillValue('manualScoreMultiplier', session.level),
    correctionType: finalBattleHookSkillValue('manualCoinCorrectionType', session.level),
    skillChargePerPhysicalMyTsum: FINAL_BATTLE_HOOK_TUNING.manualPhysicalCharge,
    additionalSkillCharge: logicalEquivalent * FINAL_BATTLE_HOOK_TUNING.manualPhysicalCharge,
    ...timingClearSpec(ctx.game, timing),
    visual: {
      skillId: FINAL_BATTLE_HOOK_TYPE_ID,
      kind: 'manualResolve',
      durationMs: timing.durationMs,
      sequenceId: ctx.runtime.createVisualSequenceId(),
      centers: [{ x: data.angryHook.x, y: data.angryHook.y }],
      targetIds: classification.physicalHooks.map((target) => target.id)
    },
    onFinalize: () => startSlash(ctx, session, cycleSuccessCount)
  });
}

export function registerFinalBattleHookSkill({ SkillRegistry, chainInputMargin = 4, chainConnectMargin = 4 }) {
  SkillRegistry[FINAL_BATTLE_HOOK_TYPE_ID] = {
    id: FINAL_BATTLE_HOOK_TYPE_ID,
    tables: SKILL_TABLES.finalBattleHook,
    onActivate(ctx) {
      const level = clamp(ctx.level, 1, 6);
      const data = {
        phase: FINAL_BATTLE_HOOK_PHASE.REVEAL,
        skillLevel: level,
        remainingActiveMs: finalBattleHookSkillValue('activeDurationMs', level),
        successCount: 0,
        angryHook: {
          id: `final-battle-hook-angry:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`,
          virtual: true,
          finalBattleHookAngry: true,
          type: ctx.game.myTsum,
          x: FIELD_CENTER_X,
          y: FIELD_CENTER_Y,
          radius: WIDTH * FINAL_BATTLE_HOOK_TUNING.angryInitialFaceDiameterRatio * 0.5,
          logicalEquivalent: getFinalBattleHookLogicalEquivalent(level, 0),
          visualScale: getFinalBattleHookVisualScale(0),
          inChain: false,
          dead: false,
          removing: false
        },
        specialChain: { active: false, nodeIds: [], lastPointer: null },
        slashState: null,
        expiryPending: false,
        debug: { manualPhysicalCount: 0, manualEffectiveCount: 0, diagonalTargetCount: 0, gaugeContribution: 0 }
      };
      const session = ctx.createSession({ remainingMs: Infinity, cleanupOnEnd: false, data });
      ctx.runtime.startTimingPause(SKILL_TIMING_TABLE.finalBattleHook.smokeReveal, {
        kind: 'smokeReveal',
        skillId: FINAL_BATTLE_HOOK_TYPE_ID,
        centers: [{ x: FIELD_CENTER_X, y: FIELD_CENTER_Y }],
        onComplete: () => { data.phase = FINAL_BATTLE_HOOK_PHASE.ACTIVE_INPUT; }
      });
      return session;
    },
    onChainStart(ctx, session, pos) {
      const data = getSessionData(session);
      if (!data || data.phase !== FINAL_BATTLE_HOOK_PHASE.ACTIVE_INPUT || data.remainingActiveMs <= 0 || ctx.game.actionLock) {
        return false;
      }
      const angry = data.angryHook;
      const node = distance(pos.x, pos.y, angry.x, angry.y) <= angryRadius(data) + chainInputMargin
        ? angry
        : ctx.game.findTsumAt(pos.x, pos.y);
      if (node !== angry && !isPhysicalHook(ctx.game, node)) return false;
      startCustomChain(ctx.game, data, node, pos);
      return true;
    },
    onDrag(ctx, session, pos) {
      const data = getSessionData(session);
      if (!data?.specialChain?.active || !ctx.game.dragging) return false;
      if (data.phase !== FINAL_BATTLE_HOOK_PHASE.ACTIVE_INPUT && data.phase !== FINAL_BATTLE_HOOK_PHASE.EXPIRED_DRAG) return false;
      advanceCustomDrag(ctx.game, data, pos, chainInputMargin, chainConnectMargin);
      return true;
    },
    onPointerUp(ctx, session) {
      const data = getSessionData(session);
      if (!data?.specialChain?.active || !ctx.game.dragging) return false;
      const chainLength = ctx.game.chain.length;
      ctx.game.finishChain();
      if (chainLength < 3) {
        clearCustomChainState(ctx.game, data);
        if (data.phase === FINAL_BATTLE_HOOK_PHASE.EXPIRED_DRAG) ctx.runtime.endSession(session, 'timeout');
      }
      return true;
    },
    onChainCommit(ctx, session, chain) {
      const data = getSessionData(session);
      if (!data?.specialChain?.active) return false;
      const classification = classifyFinalBattleHookChain(chain);
      clearCustomChainState(ctx.game, data);
      if (classification.angryCount === 0) {
        if (data.phase === FINAL_BATTLE_HOOK_PHASE.EXPIRED_DRAG) ctx.runtime.endSession(session, 'timeout');
        return false;
      }
      if (!classification.valid) {
        if (data.phase === FINAL_BATTLE_HOOK_PHASE.EXPIRED_DRAG) ctx.runtime.endSession(session, 'timeout');
        return true;
      }
      const handled = beginManualClear(ctx, session, chain);
      if (!handled) {
        data.phase = data.expiryPending ? FINAL_BATTLE_HOOK_PHASE.ENDED : FINAL_BATTLE_HOOK_PHASE.ACTIVE_INPUT;
        if (data.expiryPending) ctx.runtime.endSession(session, 'timeout');
      }
      return true;
    },
    onTick(ctx, session, dtMs) {
      const data = getSessionData(session);
      if (!data || data.phase !== FINAL_BATTLE_HOOK_PHASE.ACTIVE_INPUT) return;
      data.remainingActiveMs = Math.max(0, data.remainingActiveMs - Math.max(0, Number(dtMs) || 0));
      if (data.remainingActiveMs > 0) return;
      data.expiryPending = true;
      if (FINAL_BATTLE_HOOK_TUNING.allowExpiredDragCommit && data.specialChain.active && ctx.game.dragging) {
        data.phase = FINAL_BATTLE_HOOK_PHASE.EXPIRED_DRAG;
        return;
      }
      ctx.runtime.endSession(session, 'timeout');
    },
    onEnd(ctx, session) {
      const data = getSessionData(session);
      if (!data) return;
      data.phase = FINAL_BATTLE_HOOK_PHASE.ENDED;
      data.angryHook.inChain = false;
      if (data.specialChain.active && ctx.game.dragging) {
        for (const node of ctx.game.chain || []) node.inChain = false;
        ctx.game.dragging = false;
        ctx.game.chain = [];
        ctx.game.chainSet = new Set();
        ctx.game.chainTypeId = null;
        ctx.game.chainRule = null;
        ctx.game.gameFeel?.setChain(0);
      }
      clearCustomChainState(ctx.game, data);
    },
    cleanupBySession() {}
  };
}

export function getFinalBattleHookStatus(game) {
  const session = game?.getActiveSkillSession?.(FINAL_BATTLE_HOOK_TYPE_ID);
  const data = session?.data;
  if (!session || !data || data.phase === FINAL_BATTLE_HOOK_PHASE.ENDED) return null;
  return {
    sessionId: session.id,
    phase: data.phase,
    skillLevel: data.skillLevel,
    remainingActiveMs: data.remainingActiveMs,
    successCount: data.successCount,
    angryHook: { ...data.angryHook, radius: angryRadius(data) },
    specialChain: { ...data.specialChain, nodeIds: [...(data.specialChain.nodeIds || [])] },
    slashState: data.slashState ? { ...data.slashState } : null,
    debug: { ...data.debug }
  };
}

function drawFallbackHookFace(ctx, radius, angry = false) {
  const face = ctx.createRadialGradient(-radius * 0.25, -radius * 0.3, radius * 0.1, 0, 0, radius);
  face.addColorStop(0, angry ? '#ffb07c' : '#f0a278');
  face.addColorStop(1, angry ? '#8d2030' : '#793342');
  ctx.fillStyle = face;
  ctx.beginPath();
  ctx.arc(0, 0, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#2b1320';
  ctx.beginPath();
  ctx.arc(0, -radius * 0.72, radius * 0.78, Math.PI, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#fff4dc';
  ctx.lineWidth = Math.max(2, radius * 0.08);
  ctx.beginPath();
  ctx.moveTo(-radius * 0.55, -radius * 0.15);
  ctx.lineTo(-radius * 0.12, angry ? radius * 0.02 : -radius * 0.02);
  ctx.moveTo(radius * 0.12, angry ? radius * 0.02 : -radius * 0.02);
  ctx.lineTo(radius * 0.55, -radius * 0.15);
  ctx.stroke();
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(-radius * 0.28, -radius * 0.02, radius * 0.10, 0, Math.PI * 2);
  ctx.arc(radius * 0.28, -radius * 0.02, radius * 0.10, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#171019';
  ctx.beginPath();
  ctx.arc(-radius * 0.28, 0, radius * 0.045, 0, Math.PI * 2);
  ctx.arc(radius * 0.28, 0, radius * 0.045, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#2b1320';
  ctx.lineWidth = Math.max(2, radius * 0.055);
  ctx.beginPath();
  ctx.arc(0, radius * 0.30, radius * 0.30, angry ? Math.PI * 1.12 : 0.15, angry ? Math.PI * 1.88 : Math.PI - 0.15);
  ctx.stroke();
}

export function drawFinalBattleHookFace(ctx, type, x, y, radius, { angry = false, highlighted = false } = {}) {
  ctx.save();
  ctx.translate(x, y);
  ctx.shadowColor = angry ? 'rgba(255,66,108,0.92)' : 'rgba(255,190,120,0.55)';
  ctx.shadowBlur = highlighted ? 24 : 14;
  const hasArtwork = drawTsumArtwork(ctx, type, 0, 0, radius, { fit: 'cover', enabled: true });
  if (!hasArtwork) drawFallbackHookFace(ctx, radius, angry);
  ctx.strokeStyle = highlighted ? '#fff7b5' : 'rgba(255,225,185,0.8)';
  ctx.lineWidth = highlighted ? 5 : 3;
  ctx.beginPath();
  ctx.arc(0, 0, radius, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function slashBoundary(geometry, sign) {
  const dx = geometry.end.x - geometry.start.x;
  const dy = geometry.end.y - geometry.start.y;
  const length = Math.hypot(dx, dy) || 1;
  return {
    start: { x: geometry.start.x - dy / length * geometry.halfWidth * sign, y: geometry.start.y + dx / length * geometry.halfWidth * sign },
    end: { x: geometry.end.x - dy / length * geometry.halfWidth * sign, y: geometry.end.y + dx / length * geometry.halfWidth * sign }
  };
}

export function drawFinalBattleHookOverlay(ctx, game) {
  const status = getFinalBattleHookStatus(game);
  if (!status) return false;
  const angry = status.angryHook;
  if (status.phase !== FINAL_BATTLE_HOOK_PHASE.REVEAL) {
    drawFinalBattleHookFace(ctx, angry.type, angry.x, angry.y, angry.radius, {
      angry: true,
      highlighted: angry.inChain
    });
  }
  if (!game.finalBattleHookDebug) return true;
  const geometry = status.slashState?.geometry || createFinalBattleHookSlashGeometry({
    boardWidth: game.width || WIDTH,
    level: status.skillLevel,
    successCount: status.successCount
  });
  ctx.save();
  ctx.strokeStyle = 'rgba(255,245,120,0.9)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(geometry.start.x, geometry.start.y);
  ctx.lineTo(geometry.end.x, geometry.end.y);
  ctx.stroke();
  for (const sign of [-1, 1]) {
    const edge = slashBoundary(geometry, sign);
    ctx.strokeStyle = 'rgba(255,80,180,0.65)';
    ctx.beginPath();
    ctx.moveTo(edge.start.x, edge.start.y);
    ctx.lineTo(edge.end.x, edge.end.y);
    ctx.stroke();
  }
  const lines = [
    `phase ${status.phase}`,
    `active ${Math.round(status.remainingActiveMs)}ms  success ${status.successCount}`,
    `logical ${angry.logicalEquivalent}  scale ${angry.visualScale.toFixed(3)}`,
    `slash ${geometry.angleDeg}deg  halfWidth ${geometry.halfWidth.toFixed(1)}`,
    `manual ${status.debug.manualPhysicalCount}/${status.debug.manualEffectiveCount}`,
    `diagonal ${status.debug.diagonalTargetCount}  gauge ${status.debug.gaugeContribution.toFixed(2)}`
  ];
  ctx.fillStyle = 'rgba(8,4,20,0.78)';
  ctx.fillRect(8, FIELD_TOP + 8, 260, 92);
  ctx.fillStyle = '#fff7ce';
  ctx.font = '11px Consolas, monospace';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  lines.forEach((line, index) => ctx.fillText(line, 14, FIELD_TOP + 14 + index * 13));
  ctx.restore();
  return true;
}
