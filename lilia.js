import {
  FIELD_CENTER_X,
  FIELD_CENTER_Y,
  FIELD_RADIUS_X,
  FIELD_RADIUS_Y,
  TSUM_RADIUS
} from "./config.js?v=perfume-alice-target-1";
import { collectIdsAlongPolyline, collectIdsInCircles } from "./clearGeometry.js?v=tsum-images-5";

export const LILIA_TYPE_ID = "liliaVanrouge";
export const LILIA_CHAIN_TYPE = Object.freeze({
  NONE: "NONE",
  LILIA: "LILIA_CHAIN",
  BAT: "BAT_CHAIN",
  INVALID: "INVALID"
});

export const LILIA_SKILL_DURATION = Object.freeze({ 1: 5, 2: 6, 3: 7, 4: 8, 5: 9, 6: 10 });
export const LILIA_COIN_CORRECTION = Object.freeze({ 1: -2, 2: -1, 3: -1, 4: 0, 5: 0, 6: 1 });
export const LILIA_SKILL_COST = 19;

export const LILIA_TUNING = Object.freeze({
  // TODO LILIA_VERIFY: Exact flight motion, radii and boundary behavior are not known.
  batSpeed: 315,
  batTurnRate: 0.75,
  batLineRadius: 68,
  batBoundaryEdgeOffset: 10,
  liliaAuraRadius: 58,
  boundaryPadding: 24,
  // TODO LILIA_VERIFY: Confirm whether newly spawned matching sub-tsums transform immediately.
  transformNewSpawns: true,
  // TODO LILIA_VERIFY: Confirm whether the last bat connects back to the first bat.
  closeBatLoop: false,
  // TODO LILIA_VERIFY: Actual in-game MyTsum skill-gauge reflection rate is unknown.
  skillGaugeRate: 1.0
});

function typeIdOf(node) {
  return node?.type?.id || node?.typeId || null;
}

function hashUnit(value) {
  let hash = 2166136261;
  const text = String(value);
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 4294967296;
}

function liveTsums(game) {
  return (game?.tsums || []).filter((node) => node && !node.dead && !node.removing && !node.isBomb);
}

export function isLiliaBatNode(node, state) {
  return !!(
    state?.active &&
    state.transformedBaseTypeId &&
    typeIdOf(node) === state.transformedBaseTypeId
  );
}

export function classifyLiliaChain(chain, state) {
  if (!Array.isArray(chain) || chain.length === 0 || !state?.active) {
    return LILIA_CHAIN_TYPE.NONE;
  }
  const allLilia = chain.every((node) => typeIdOf(node) === LILIA_TYPE_ID);
  if (allLilia) {
    return LILIA_CHAIN_TYPE.LILIA;
  }
  const allBats = chain.every((node) => isLiliaBatNode(node, state));
  return allBats ? LILIA_CHAIN_TYPE.BAT : LILIA_CHAIN_TYPE.INVALID;
}

export function chooseLiliaBatBaseType(game) {
  const counts = new Map();
  for (const node of liveTsums(game)) {
    const typeId = typeIdOf(node);
    if (!typeId || typeId === LILIA_TYPE_ID || game?.isMyTsumTypeId?.(typeId)) {
      continue;
    }
    counts.set(typeId, (counts.get(typeId) || 0) + 1);
  }
  const order = new Map((game?.availableTypes || []).map((type, index) => [type.id, index]));
  const candidates = Array.from(counts.entries()).sort((left, right) => (
    right[1] - left[1] ||
    (order.get(left[0]) ?? Number.MAX_SAFE_INTEGER) - (order.get(right[0]) ?? Number.MAX_SAFE_INTEGER) ||
    left[0].localeCompare(right[0])
  ));
  // TODO LILIA_VERIFY: The exact transformed sub-tsum selection rule is unknown.
  return candidates[0]?.[0] || null;
}

export class LiliaBatFlightController {
  constructor(tuning = LILIA_TUNING) {
    this.tuning = tuning;
    this.flying = [];
    this.holdTime = 0;
  }

  reset() {
    this.flying = [];
    this.holdTime = 0;
  }

  sync(nodes) {
    const previous = new Map(this.flying.map((bat) => [bat.tsumId, bat]));
    this.flying = (nodes || []).map((node, chainIndex) => {
      const existing = previous.get(node.id);
      if (existing) {
        existing.chainIndex = chainIndex;
        return existing;
      }
      const seed = `${node.id}|${Math.round(node.x * 10)}|${Math.round(node.y * 10)}|${chainIndex}`;
      const angle = hashUnit(seed) * Math.PI * 2;
      return {
        tsumId: node.id,
        virtual: !!node.virtual,
        sourceTsumId: node.sourceTsumId || null,
        x: node.x,
        y: node.y,
        vx: Math.cos(angle) * this.tuning.batSpeed,
        vy: Math.sin(angle) * this.tuning.batSpeed,
        turnPhase: hashUnit(`${seed}|turn`) * Math.PI * 2,
        chainIndex
      };
    });
  }

  update(dtSeconds) {
    const dt = Math.max(0, Math.min(0.05, dtSeconds || 0));
    if (!dt || !this.flying.length) {
      return;
    }
    this.holdTime += dt;
    const edgeOffset = Math.max(0, this.tuning.batBoundaryEdgeOffset || 0);
    const radiusX = Math.max(1, FIELD_RADIUS_X - this.tuning.boundaryPadding - TSUM_RADIUS * 0.45 + edgeOffset);
    const radiusY = Math.max(1, FIELD_RADIUS_Y - this.tuning.boundaryPadding - TSUM_RADIUS * 0.45 + edgeOffset * 0.5);
    const centerY = FIELD_CENTER_Y + edgeOffset * 0.5;
    for (const bat of this.flying) {
      const turn = Math.sin(this.holdTime * 1.7 + bat.turnPhase) * this.tuning.batTurnRate * dt;
      const cos = Math.cos(turn);
      const sin = Math.sin(turn);
      const nextVx = bat.vx * cos - bat.vy * sin;
      const nextVy = bat.vx * sin + bat.vy * cos;
      const magnitude = Math.hypot(nextVx, nextVy) || 1;
      bat.vx = (nextVx / magnitude) * this.tuning.batSpeed;
      bat.vy = (nextVy / magnitude) * this.tuning.batSpeed;
      bat.x += bat.vx * dt;
      bat.y += bat.vy * dt;

      const nx = (bat.x - FIELD_CENTER_X) / radiusX;
      const ny = (bat.y - centerY) / radiusY;
      if (nx * nx + ny * ny > 1) {
        const normalX = nx / radiusX;
        const normalY = ny / radiusY;
        const normalLength = Math.hypot(normalX, normalY) || 1;
        const ux = normalX / normalLength;
        const uy = normalY / normalLength;
        const dot = bat.vx * ux + bat.vy * uy;
        bat.vx -= 2 * dot * ux;
        bat.vy -= 2 * dot * uy;
        const scale = 0.995 / Math.sqrt(nx * nx + ny * ny);
        bat.x = FIELD_CENTER_X + (bat.x - FIELD_CENTER_X) * scale;
        bat.y = centerY + (bat.y - centerY) * scale;
      }
    }
  }

  snapshot() {
    return this.flying
      .slice()
      .sort((left, right) => left.chainIndex - right.chainIndex)
      .map((bat) => Object.freeze({ ...bat }));
  }

  getPosition(tsumId) {
    const bat = this.flying.find((entry) => entry.tsumId === tsumId);
    return bat ? { x: bat.x, y: bat.y } : null;
  }
}

export function computeBatLineClear({ batPositions, boardTsums, lineRadius, closeLoop = false }) {
  return collectIdsAlongPolyline(boardTsums, batPositions, lineRadius, closeLoop);
}

export function computeLiliaAuraClear({ chainedLilia, boardTsums, auraRadius }) {
  return collectIdsInCircles(boardTsums, chainedLilia, auraRadius);
}

function addKnownIds(target, ids) {
  for (const id of ids || []) {
    if (id) {
      target.add(id);
    }
  }
}

export function resolveBatChain({ batPositions, boardTsums, lineRadius = LILIA_TUNING.batLineRadius, closeLoop = LILIA_TUNING.closeBatLoop, chainedBatIds = [] }) {
  const lineClearIds = computeBatLineClear({ batPositions, boardTsums, lineRadius, closeLoop });
  const clearIds = new Set(lineClearIds);
  addKnownIds(clearIds, chainedBatIds);
  addKnownIds(clearIds, (batPositions || []).map((bat) => bat.tsumId));
  return { lineClearIds, auraClearIds: new Set(), clearIds };
}

export function resolveLiliaChain({ batPositions, chainedLilia, boardTsums, lineRadius = LILIA_TUNING.batLineRadius, auraRadius = LILIA_TUNING.liliaAuraRadius, closeLoop = LILIA_TUNING.closeBatLoop }) {
  const lineClearIds = computeBatLineClear({ batPositions, boardTsums, lineRadius, closeLoop });
  const auraClearIds = computeLiliaAuraClear({ chainedLilia, boardTsums, auraRadius });
  const clearIds = new Set([...lineClearIds, ...auraClearIds]);
  addKnownIds(clearIds, (batPositions || []).map((bat) => bat.tsumId));
  addKnownIds(clearIds, (chainedLilia || []).map((node) => node.id));
  return { lineClearIds, auraClearIds, clearIds };
}

export class LiliaSkillController {
  constructor(transformedBaseTypeId, tuning = LILIA_TUNING) {
    this.active = true;
    this.transformedBaseTypeId = transformedBaseTypeId;
    this.activeChainType = LILIA_CHAIN_TYPE.NONE;
    this.flight = new LiliaBatFlightController(tuning);
    this.tuning = tuning;
    this.releasePositions = null;
    this.lastClearCounts = { line: 0, aura: 0, union: 0 };
  }

  isBat(node) {
    return isLiliaBatNode(node, this);
  }

  chooseFlyingNodes(game, chain) {
    if (this.activeChainType === LILIA_CHAIN_TYPE.BAT) {
      return chain.filter((node) => this.isBat(node));
    }
    if (this.activeChainType !== LILIA_CHAIN_TYPE.LILIA) {
      return [];
    }
    // A Lilia chain moves existing BAT tsums only. There can never be more
    // flying bats than the board currently contains, even when the Lilia chain
    // is longer. Keep board order so the selected bats are deterministic.
    return liveTsums(game)
      .filter((node) => this.isBat(node) && !node.virtual)
      .slice(0, chain.length);
  }

  syncChain(game, chain) {
    this.activeChainType = classifyLiliaChain(chain, this);
    if (this.activeChainType === LILIA_CHAIN_TYPE.INVALID || this.activeChainType === LILIA_CHAIN_TYPE.NONE) {
      this.flight.reset();
      return false;
    }
    this.flight.sync(this.chooseFlyingNodes(game, chain));
    return true;
  }

  update(dtSeconds) {
    this.flight.update(dtSeconds);
  }

  snapshotRelease() {
    this.releasePositions = Object.freeze(this.flight.snapshot());
    return this.releasePositions;
  }

  resetChain() {
    this.activeChainType = LILIA_CHAIN_TYPE.NONE;
    this.releasePositions = null;
    this.flight.reset();
  }
}

function getController(session) {
  return session?.data?.controller || null;
}

function findNodeById(game, id) {
  return (game?.tsums || []).find((node) => node.id === id && !node.dead && !node.removing) || null;
}

function resolveControllerChain(ctx, session, chain) {
  const controller = getController(session);
  if (!controller || !Array.isArray(chain) || chain.length < 3) {
    controller?.resetChain();
    return false;
  }
  const chainType = classifyLiliaChain(chain, controller);
  if (chainType !== LILIA_CHAIN_TYPE.LILIA && chainType !== LILIA_CHAIN_TYPE.BAT) {
    controller.resetChain();
    return false;
  }
  const batPositions = controller.releasePositions || controller.snapshotRelease();
  const result = chainType === LILIA_CHAIN_TYPE.LILIA
    ? resolveLiliaChain({
      batPositions,
      chainedLilia: chain,
      boardTsums: liveTsums(ctx.game),
      lineRadius: controller.tuning.batLineRadius,
      auraRadius: controller.tuning.liliaAuraRadius,
      closeLoop: controller.tuning.closeBatLoop
    })
    : resolveBatChain({
      batPositions,
      boardTsums: liveTsums(ctx.game),
      lineRadius: controller.tuning.batLineRadius,
      closeLoop: controller.tuning.closeBatLoop,
      chainedBatIds: chain.map((node) => node.id)
    });
  controller.lastClearCounts = {
    line: result.lineClearIds.size,
    aura: result.auraClearIds.size,
    union: result.clearIds.size
  };
  const targets = Array.from(result.clearIds).map((id) => findNodeById(ctx.game, id)).filter(Boolean);
  const releasePositionById = new Map(batPositions.map((bat) => [bat.tsumId, bat]));
  for (const target of targets) {
    const releasePosition = releasePositionById.get(target.id);
    if (!releasePosition) {
      continue;
    }
    // Flight is display-only while held. Once released, every flying BAT is a clear target,
    // so commit it to the frozen release position for the existing removal animation.
    target.x = releasePosition.x;
    target.y = releasePosition.y;
    target.vx = 0;
    target.vy = 0;
  }
  const center = batPositions.length
    ? batPositions.reduce((sum, bat) => ({ x: sum.x + bat.x, y: sum.y + bat.y }), { x: 0, y: 0 })
    : { x: chain[chain.length - 1].x, y: chain[chain.length - 1].y };
  const divisor = Math.max(1, batPositions.length);
  const handled = targets.length > 0 && ctx.clear.beginClear({
    source: "liliaSkill",
    targets,
    x: center.x / divisor,
    y: center.y / divisor,
    allowBomb: true,
    correctionType: `correction_${LILIA_COIN_CORRECTION[session.level]}`,
    // TODO LILIA_VERIFY: Actual in-game gauge reflection rate is unknown.
    chargeMultiplier: controller.tuning.skillGaugeRate,
    meta: { liliaChainType: chainType }
  });
  controller.resetChain();
  return !!handled;
}

export function registerLiliaSkill({ SkillRegistry, skillValue }) {
  SkillRegistry[LILIA_TYPE_ID] = {
    id: LILIA_TYPE_ID,
    onActivate(ctx) {
      const transformedBaseTypeId = chooseLiliaBatBaseType(ctx.game);
      const durationSec = skillValue(LILIA_TYPE_ID, "durationSec", ctx.level) || LILIA_SKILL_DURATION[ctx.level];
      const session = ctx.createSession({
        remainingMs: durationSec * 1000,
        cleanupOnEnd: false,
        data: { controller: new LiliaSkillController(transformedBaseTypeId) }
      });
      ctx.game.pushCenterMessage("LILIA!", "#ff9ad8", 0.92);
      return session;
    },
    onChainStart(ctx, session, pos) {
      const controller = getController(session);
      const node = ctx.game.findTsumAt(pos.x, pos.y);
      if (!controller || !node || (typeIdOf(node) !== LILIA_TYPE_ID && !controller.isBat(node))) {
        return false;
      }
      if (ctx.game.actionLock) {
        return true;
      }
      ctx.game.startChain(node, pos);
      controller.syncChain(ctx.game, ctx.game.chain);
      return true;
    },
    onDrag(ctx, session, pos) {
      const controller = getController(session);
      if (!controller || !ctx.game.dragging || controller.activeChainType === LILIA_CHAIN_TYPE.NONE) {
        return false;
      }
      ctx.game.extendChain(pos);
      controller.syncChain(ctx.game, ctx.game.chain);
      return true;
    },
    onPointerUp(ctx, session) {
      const controller = getController(session);
      if (!controller || !ctx.game.dragging || controller.activeChainType === LILIA_CHAIN_TYPE.NONE) {
        return false;
      }
      controller.syncChain(ctx.game, ctx.game.chain);
      controller.snapshotRelease();
      ctx.game.finishChain();
      if (controller.activeChainType !== LILIA_CHAIN_TYPE.NONE) {
        controller.resetChain();
      }
      return true;
    },
    onChainCommit(ctx, session, chain) {
      const controller = getController(session);
      if (!controller) {
        return false;
      }
      const chainType = classifyLiliaChain(chain, controller);
      if (chainType === LILIA_CHAIN_TYPE.NONE || chainType === LILIA_CHAIN_TYPE.INVALID) {
        return false;
      }
      resolveControllerChain(ctx, session, chain);
      return true;
    },
    onTick(ctx, session, dtMs) {
      const controller = getController(session);
      if (controller && ctx.game.dragging && controller.activeChainType !== LILIA_CHAIN_TYPE.NONE) {
        controller.syncChain(ctx.game, ctx.game.chain);
        controller.update(dtMs / 1000);
      }
    },
    onSpawn(ctx, session, node) {
      const controller = getController(session);
      // BAT identity is derived from the retained base type, so matching new spawns require no mutation.
      if (!controller?.tuning.transformNewSpawns || !controller.isBat(node)) {
        return null;
      }
      return null;
    },
    onEnd(ctx, session) {
      const controller = getController(session);
      if (!controller) {
        return;
      }
      // TODO LILIA_VERIFY: Resolve a held special chain at timeout before restoring BATs.
      if (ctx.game.dragging && controller.activeChainType !== LILIA_CHAIN_TYPE.NONE) {
        controller.syncChain(ctx.game, ctx.game.chain);
        controller.snapshotRelease();
        ctx.game.finishChain();
      }
      controller.active = false;
      controller.resetChain();
    },
    cleanupBySession() {}
  };
}

export function drawLiliaBat(ctx, radius, highlighted = false) {
  ctx.save();
  ctx.fillStyle = highlighted ? "#ff8bd4" : "#382044";
  ctx.strokeStyle = "rgba(255,176,224,0.92)";
  ctx.lineWidth = Math.max(2, radius * 0.08);
  ctx.beginPath();
  ctx.moveTo(0, radius * 0.2);
  ctx.quadraticCurveTo(-radius * 0.45, -radius * 0.55, -radius, -radius * 0.12);
  ctx.quadraticCurveTo(-radius * 0.74, radius * 0.04, -radius * 0.82, radius * 0.48);
  ctx.quadraticCurveTo(-radius * 0.36, radius * 0.28, 0, radius * 0.62);
  ctx.quadraticCurveTo(radius * 0.36, radius * 0.28, radius * 0.82, radius * 0.48);
  ctx.quadraticCurveTo(radius * 0.74, radius * 0.04, radius, -radius * 0.12);
  ctx.quadraticCurveTo(radius * 0.45, -radius * 0.55, 0, radius * 0.2);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#ffec7a";
  ctx.beginPath();
  ctx.arc(-radius * 0.14, radius * 0.12, Math.max(1.5, radius * 0.06), 0, Math.PI * 2);
  ctx.arc(radius * 0.14, radius * 0.12, Math.max(1.5, radius * 0.06), 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}
