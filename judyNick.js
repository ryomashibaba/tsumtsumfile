import { SKILL_TABLES, TSUM_TYPES, clamp } from "./config.js?v=tsum-images-5";

export class DualGaugeSystem {
  constructor() {
    this.judy = {
      charge: 0,
      maxCharge: 25,
      isReady: false,
      isActive: false
    };

    this.nick = {
      charge: 0,
      maxCharge: 25,
      isReady: false,
      isActive: false
    };

    this.activeMode = "judy";
    this.judyChargeBlocked = false;
    this.nickChargeBlocked = false;
  }

  setMaxCharge(maxCharge) {
    const nextMaxCharge = Math.max(1, Number.isFinite(maxCharge) ? maxCharge : 25);
    this.judy.maxCharge = nextMaxCharge;
    this.nick.maxCharge = nextMaxCharge;
    this.judy.charge = Math.min(this.judy.charge, nextMaxCharge);
    this.nick.charge = Math.min(this.nick.charge, nextMaxCharge);
    this.judy.isReady = this.judy.charge >= nextMaxCharge;
    this.nick.isReady = this.nick.charge >= nextMaxCharge;
  }

  reset() {
    this.judy.charge = 0;
    this.judy.isReady = false;
    this.judy.isActive = false;
    this.nick.charge = 0;
    this.nick.isReady = false;
    this.nick.isActive = false;
    this.activeMode = "judy";
    this.judyChargeBlocked = false;
    this.nickChargeBlocked = false;
  }

  addCharge(typeId, amount) {
    if (typeId === "judyNickJudy" && !this.judyChargeBlocked) {
      this.judy.charge = Math.min(this.judy.charge + amount, this.judy.maxCharge);
      this.judy.isReady = this.judy.charge >= this.judy.maxCharge;
    }

    if (typeId === "judyNickNickMate" && !this.nickChargeBlocked) {
      this.nick.charge = Math.min(this.nick.charge + amount, this.nick.maxCharge);
      this.nick.isReady = this.nick.charge >= this.nick.maxCharge;
    }
  }

  activateSkill() {
    if (this.judy.isReady) {
      return "judy";
    }
    if (this.nick.isReady) {
      return "nick";
    }
    return null;
  }

  consumeSkill(mode) {
    if (mode === "judy") {
      this.judy.charge = 0;
      this.judy.isReady = false;
    } else if (mode === "nick") {
      this.nick.charge = 0;
      this.nick.isReady = false;
    }
  }

  startSkill(mode) {
    if (mode === "judy") {
      this.judy.isActive = true;
      this.judy.charge = 0;
      this.judy.isReady = false;
      this.judyChargeBlocked = true;
      this.nickChargeBlocked = false;
      this.activeMode = "judy";
    } else if (mode === "nick") {
      this.nick.isActive = true;
      this.nick.charge = 0;
      this.nick.isReady = false;
      this.nickChargeBlocked = true;
      this.judyChargeBlocked = false;
      this.activeMode = "nick";
    }
  }

  endSkill(mode) {
    if (mode === "judy") {
      this.judy.isActive = false;
      this.judyChargeBlocked = false;
    } else if (mode === "nick") {
      this.nick.isActive = false;
      this.nickChargeBlocked = false;
    }
  }

  getJudyGauge() {
    return {
      charge: this.judy.charge,
      maxCharge: this.judy.maxCharge,
      isReady: this.judy.isReady,
      isActive: this.judy.isActive,
      ratio: this.judy.charge / this.judy.maxCharge
    };
  }

  getNickGauge() {
    return {
      charge: this.nick.charge,
      maxCharge: this.nick.maxCharge,
      isReady: this.nick.isReady,
      isActive: this.nick.isActive,
      ratio: this.nick.charge / this.nick.maxCharge
    };
  }

  getActiveMode() {
    return this.activeMode;
  }

  bothReady() {
    return this.judy.isReady && this.nick.isReady;
  }

  oneReady() {
    return (this.judy.isReady && !this.nick.isReady) || (!this.judy.isReady && this.nick.isReady);
  }
}

export function drawDualGauge(ctx, dualGauge, x, y, width, height) {
  const judyGauge = dualGauge.getJudyGauge();
  const nickGauge = dualGauge.getNickGauge();
  const splitRatio = 0.5;

  ctx.save();

  ctx.fillStyle = "rgba(18, 32, 72, 0.9)";
  ctx.strokeStyle = "rgba(255, 255, 255, 0.24)";
  ctx.lineWidth = 1.5;

  roundRect(ctx, x, y, width, height, 17);
  ctx.fill();
  ctx.stroke();

  if (judyGauge.ratio > 0) {
    const judyWidth = width * judyGauge.ratio * splitRatio;
    const judyHeight = height * judyGauge.ratio;

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + width, y);
    ctx.lineTo(x + width * (1 - splitRatio), y + height);
    ctx.lineTo(x, y + height);
    ctx.closePath();
    ctx.clip();

    const judyGrad = ctx.createLinearGradient(x, y, x + judyWidth, y + judyHeight);
    judyGrad.addColorStop(0, judyGauge.isReady ? "#fff6b4" : "#84c4ff");
    judyGrad.addColorStop(1, judyGauge.isReady ? "#ffd35b" : "#366ca8");

    ctx.fillStyle = judyGrad;
    ctx.fillRect(x, y, judyWidth, judyHeight);
    ctx.restore();
  }

  if (nickGauge.ratio > 0) {
    const nickWidth = width * nickGauge.ratio * splitRatio;
    const nickHeight = height * nickGauge.ratio;

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(x + width * splitRatio, y);
    ctx.lineTo(x + width, y);
    ctx.lineTo(x + width, y + height);
    ctx.lineTo(x, y + height);
    ctx.closePath();
    ctx.clip();

    const nickGrad = ctx.createLinearGradient(x + width - nickWidth, y, x + width, y + nickHeight);
    nickGrad.addColorStop(0, nickGauge.isReady ? "#fff6b4" : "#ffb26a");
    nickGrad.addColorStop(1, nickGauge.isReady ? "#ffd35b" : "#b46221");

    ctx.fillStyle = nickGrad;
    ctx.fillRect(x + width - nickWidth, y + height - nickHeight, nickWidth, nickHeight);
    ctx.restore();
  }

  ctx.strokeStyle = "rgba(255, 255, 255, 0.5)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x + width * (1 - splitRatio), y + height);
  ctx.lineTo(x + width, y);
  ctx.stroke();

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  ctx.fillStyle = judyGauge.isReady ? "#fff6b4" : "#ffffff";
  ctx.font = 'bold 12px "Trebuchet MS", sans-serif';
  ctx.fillText(`JUDY ${Math.floor(judyGauge.ratio * 100)}%`, x + width * 0.25, y + height * 0.3);

  ctx.fillStyle = nickGauge.isReady ? "#fff6b4" : "#ffffff";
  ctx.font = 'bold 12px "Trebuchet MS", sans-serif';
  ctx.fillText(`NICK ${Math.floor(nickGauge.ratio * 100)}%`, x + width * 0.75, y + height * 0.7);

  if (judyGauge.isReady) {
    ctx.fillStyle = "#ffd700";
    ctx.font = 'bold 14px "Trebuchet MS", sans-serif';
    ctx.fillText("READY!", x + width * 0.25, y + height * 0.6);
  }
  if (nickGauge.isReady) {
    ctx.fillStyle = "#ffd700";
    ctx.font = 'bold 14px "Trebuchet MS", sans-serif';
    ctx.fillText("READY!", x + width * 0.75, y + height * 0.4);
  }

  ctx.restore();
}

function roundRect(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

export class JudyNickGaugeManager {
  constructor(game) {
    this.game = game;
    this.dualGauge = new DualGaugeSystem();
    this.syncMaxCharge();
  }

  onClear(typeId, clearCount, chargeMultiplier = 1, context = {}) {
    if (!this.shouldChargeGauge(typeId, context)) {
      return;
    }

    this.syncMaxCharge();
    const chargeAmount = this.calculateCharge(typeId, clearCount, chargeMultiplier);
    this.dualGauge.addCharge(typeId, chargeAmount);
  }

  shouldChargeGauge(typeId, context = {}) {
    if (!this.isJudyNickTsum(typeId) || context.suppressGaugeCharge) {
      return false;
    }

    if (context.activeMode === "judy" && typeId === "judyNickNickMate") {
      return false;
    }

    if (context.activeMode === "nick" && typeId === "judyNickJudy") {
      return false;
    }

    return true;
  }

  isJudyNickTsum(typeId) {
    return typeId === "judyNickJudy" || typeId === "judyNickNickMate";
  }

  calculateCharge(typeId, clearCount, chargeMultiplier = 1) {
    const baseCharge = 1;
    const chainBonus = Math.max(0, (clearCount - 3) * 2);
    const multiplier = Number.isFinite(chargeMultiplier) ? chargeMultiplier : 1;
    return (baseCharge + chainBonus) * multiplier;
  }

  getRequiredCharge() {
    const level = clamp(Number(this.game?.selectedSkillLevel) || 1, 1, 6);
    return SKILL_TABLES.judyNick.cost[level - 1] || 25;
  }

  syncMaxCharge() {
    this.dualGauge.setMaxCharge(this.getRequiredCharge());
  }

  activateSkill() {
    this.syncMaxCharge();
    return this.dualGauge.activateSkill();
  }

  consumeSkill(mode) {
    this.syncMaxCharge();
    this.dualGauge.consumeSkill(mode);
  }

  startSkill(mode) {
    this.dualGauge.startSkill(mode);
  }

  endSkill(mode) {
    this.dualGauge.endSkill(mode);
  }

  update(dt) {
  }

  draw(ctx, x, y, width, height) {
    drawDualGauge(ctx, this.dualGauge, x, y, width, height);
  }

  reset() {
    this.syncMaxCharge();
    this.dualGauge.reset();
  }

  getGaugeInfo() {
    this.syncMaxCharge();
    return {
      judy: this.dualGauge.getJudyGauge(),
      nick: this.dualGauge.getNickGauge(),
      activeMode: this.dualGauge.getActiveMode(),
      bothReady: this.dualGauge.bothReady(),
      oneReady: this.dualGauge.oneReady()
    };
  }
}

export function registerJudyNickSkill({
  SkillRegistry,
  skillValue,
  getLiveTsums,
  movingFreezeKind = "judyNickMovingIce"
}) {
  if (!SkillRegistry || typeof skillValue !== "function" || typeof getLiveTsums !== "function") {
    throw new Error("registerJudyNickSkill requires SkillRegistry, skillValue, and getLiveTsums.");
  }

  function getJudyNickCountCorrectionType(level, countStage) {
    const tables = SKILL_TABLES.judyNick.countCoinCorrectionTypes[clamp(level, 1, 6) - 1];
    return tables[clamp(countStage, 1, 10) - 1];
  }

  function getJudyNickOverlayCorrectionType(level) {
    return SKILL_TABLES.judyNick.overlayCoinCorrectionType[clamp(level, 1, 6) - 1];
  }

  function getJudyNickChargeRate(countStage) {
    return SKILL_TABLES.judyNick.countChargeRate[clamp(countStage, 1, 10) - 1];
  }

  function getStackIndex(stackCount, maxLength) {
    return clamp((stackCount || 1) - 1, 0, Math.max(0, maxLength - 1));
  }

  function isJudyNickPairTypeId(typeId) {
    return typeId === "judyNickJudy" || typeId === "judyNickNickMate";
  }

  function convertJudyNickSwitchSubTsums(ctx) {
    const nickType = TSUM_TYPES.find((type) => type.id === "judyNickNickMate");
    const judyType = TSUM_TYPES.find((type) => type.id === "judyNickJudy");
    if (!nickType || !judyType) {
      return;
    }

    const subTsums = getLiveTsumsIncludingCeiling(ctx.game, (tsum) => {
      const typeId = ctx.board.getResolvedType(tsum).id;
      return !isJudyNickPairTypeId(typeId);
    });
    const convertCount = Math.min(Math.round(subTsums.length * 0.2), Math.floor(subTsums.length / 2));
    if (convertCount <= 0) {
      return;
    }

    const pool = subTsums.slice();
    const pick = () => pool.splice(Math.floor(Math.random() * pool.length), 1)[0];
    for (let i = 0; i < convertCount && pool.length; i += 1) {
      pick().type = nickType;
    }
    for (let i = 0; i < convertCount && pool.length; i += 1) {
      pick().type = judyType;
    }
  }

  function getLiveTsumsIncludingCeiling(game, predicate = () => true) {
    return (game.tsums || []).filter((tsum) => (
      tsum &&
      !tsum.dead &&
      !tsum.removing &&
      predicate(tsum)
    ));
  }

  function applyJudyNickMovingFreeze(ctx, session, targets) {
    const uniqueTargets = Array.from(new Map(
      targets
        .filter((tsum) => tsum && !tsum.dead && !tsum.removing)
        .map((tsum) => [tsum.id, tsum])
    ).values()).filter((tsum) => !ctx.board.hasFreezeKind(tsum, movingFreezeKind));

    if (!uniqueTargets.length) {
      return [];
    }

    const countStage = clamp(session.data.countStage || 1, 1, 10);
    const groupId = ctx.board.nextGroupId(movingFreezeKind);
    ctx.board.applyMovingFreeze(uniqueTargets.map((tsum) => tsum.id), {
      sessionId: session.id,
      groupId,
      freezeKind: movingFreezeKind,
      persist: false,
      bombImmune: true,
      correctionType: getJudyNickCountCorrectionType(ctx.level, countStage),
      chargeMultiplier: getJudyNickChargeRate(countStage)
    });
    session.data.nickLayerIds.push(groupId);
    return uniqueTargets;
  }

  function applyJudyNickMode(ctx, session) {
    const countStage = clamp(session.data.countStage || 1, 1, 10);
    const correctionType = getJudyNickCountCorrectionType(ctx.level, countStage);
    const chargeMultiplier = getJudyNickChargeRate(countStage);

    if (session.data.currentMode === "judy") {
      const judyNodes = getLiveTsumsIncludingCeiling(ctx.game, (tsum) => (
        ctx.board.getResolvedType(tsum).id === "judyNickJudy" &&
        !ctx.board.hasBubble(tsum)
      ));
      if (judyNodes.length) {
        const groupId = ctx.board.nextGroupId("judyNickJudy");
        ctx.applyBubble(judyNodes.map((tsum) => tsum.id), {
          sessionId: session.id,
          bubbleId: groupId,
          radius: skillValue("judyNick", "bubbleRadius", ctx.level),
          correctionType,
          chargeMultiplier
        });
        session.data.judyLayerIds.push(groupId);
      }
      ctx.game.pushCenterMessage("JUDY!", "#d7f0ff", 0.88);
      return;
    }

    const targets = getLiveTsumsIncludingCeiling(ctx.game, (tsum) => {
      const typeId = ctx.board.getResolvedType(tsum).id;
      return isJudyNickPairTypeId(typeId) && !ctx.board.hasFreezeKind(tsum, movingFreezeKind);
    });
    applyJudyNickMovingFreeze(ctx, session, targets);
    ctx.game.pushCenterMessage("NICK!", "#e8f3ff", 0.88);
  }

  function buildJudyNickOverlayRequest(ctx, session, previousMode, countStage) {
    const overlayCorrectionType = getJudyNickOverlayCorrectionType(ctx.level);
    const overlayChargeMultiplier = getJudyNickChargeRate(countStage);
    const targets = previousMode === "judy"
      ? ctx.board.getBubbleNodesBySession(session.id)
      : ctx.board.getJudyNickMovingFrozenNodes(session.id);

    if (!targets.length) {
      return null;
    }

    const center = targets.reduce((acc, tsum) => {
      acc.x += tsum.x;
      acc.y += tsum.y;
      return acc;
    }, { x: 0, y: 0 });

    return {
      source: previousMode === "judy" ? "bubble" : "freeze",
      targets,
      x: center.x / targets.length,
      y: center.y / targets.length,
      allowBomb: false,
      correctionType: overlayCorrectionType,
      chargeMultiplier: overlayChargeMultiplier,
      meta: {
        judyNickSuppressGaugeCharge: true
      },
      type: targets[0] ? ctx.board.getResolvedType(targets[0]) : ctx.game.myTsum
    };
  }

  SkillRegistry.judyNick = {
    id: "judyNick",
    tables: SKILL_TABLES.judyNick,
    onActivate(ctx) {
      const existing = ctx.runtime.getSessionsByHandlerId("judyNick")[0];
      const durationMs = skillValue("judyNick", "durationSec", ctx.level) * 1000;
      let session = existing;
      if (session) {
        const previousMode = session.data.currentMode || "judy";
        const nextMode = previousMode === "judy" ? "nick" : "judy";
        session.level = ctx.level;
        session.remainingMs = durationMs;
        session.data.countStage = Math.min(10, (session.data.countStage || 1) + 1);
        session.data.currentMode = nextMode;
        const overlayRequest = buildJudyNickOverlayRequest(ctx, session, previousMode, session.data.countStage);
        if (overlayRequest) {
          overlayRequest.onFinalize = () => {
            ctx.clearBySource(session.id);
            if (previousMode === "nick" && nextMode === "judy") {
              convertJudyNickSwitchSubTsums(ctx);
            }
            applyJudyNickMode(ctx, session);
          };
          if (!ctx.clear.beginClear(overlayRequest)) {
            ctx.clearBySource(session.id);
            applyJudyNickMode(ctx, session);
          }
          return session;
        }
        ctx.clearBySource(session.id);
      } else {
        session = ctx.createSession({
          remainingMs: durationMs,
          cleanupOnEnd: false,
          data: {
            currentMode: ctx.game.judyNickPreparedMode || "judy",
            countStage: 1,
            judyLayerIds: [],
            nickLayerIds: []
          }
        });
      }
      applyJudyNickMode(ctx, session);
      return session;
    },
    onSpawn(ctx, session, node) {
      const typeId = ctx.board.getResolvedType(node).id;
      if (session.data.currentMode === "judy") {
        if (typeId === "judyNickJudy" && !ctx.board.hasBubble(node)) {
          const groupId = ctx.board.nextGroupId("judyNickJudy");
          ctx.applyBubble([node.id], {
            sessionId: session.id,
            bubbleId: groupId,
            radius: skillValue("judyNick", "bubbleRadius", ctx.level),
            correctionType: getJudyNickCountCorrectionType(ctx.level, session.data.countStage || 1),
            chargeMultiplier: getJudyNickChargeRate(session.data.countStage || 1)
          });
          session.data.judyLayerIds.push(groupId);
        }
        return null;
      }

      if (isJudyNickPairTypeId(typeId) && !ctx.board.hasFreezeKind(node, movingFreezeKind)) {
        applyJudyNickMovingFreeze(ctx, session, [node]);
      }
      return null;
    },
    onChainCommit(ctx, session, chain) {
      if (session.data.currentMode !== "nick") {
        return false;
      }
      const targets = chain.filter((tsum) => tsum && !tsum.dead && !tsum.removing);
      const frozenTargets = applyJudyNickMovingFreeze(ctx, session, targets);
      if (!frozenTargets.length) {
        return false;
      }
      const last = chain[chain.length - 1];
      ctx.game.createShockwave(last.x, last.y, "rgba(215,240,255,0.75)", 4, 12, 0.22, 120);
      return true;
    },
    onAugmentClear(ctx, session, request) {
      const countStage = clamp(session.data.countStage || 1, 1, 10);
      request.correctionType = request.correctionType || getJudyNickCountCorrectionType(ctx.level, countStage);
      if (typeof request.chargeMultiplier !== "number" || request.chargeMultiplier === 1) {
        request.chargeMultiplier = getJudyNickChargeRate(countStage);
      }
      return request;
    },
    onEnd(ctx, session) {
      ctx.clearBySource(session.id);
    },
    cleanupBySession() {
    }
  };

  return {
    getJudyNickCountCorrectionType,
    getJudyNickOverlayCorrectionType,
    getJudyNickChargeRate,
    getStackIndex,
    isJudyNickPairTypeId
  };
}
