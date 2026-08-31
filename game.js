import {
  WIDTH,
  HEIGHT,
  FIELD_CENTER_X,
  FIELD_CENTER_Y,
  FIELD_TOP,
  FIELD_BOTTOM,
  FIELD_LEFT,
  FIELD_RIGHT,
  COLS,
  ROWS,
  TSUM_RADIUS,
  BOMB_BLAST_RADIUS,
  MAX_CHAIN_DIST,
  NAMINE_SPLASH_RADIUS,
  TARGET_TSUM_COUNT,
  GRAVITY,
  RESTITUTION,
  FRICTION,
  TSUM_RESTITUTION,
  FIXED_STEP,
  STORAGE_KEY,
  PAUSE_BUTTON_RECT,
  SELECT_TSUM_BUTTON_RECT,
  SKILL_BUTTON_RECT,
  DECOR_BUTTON_RECT,
  AI_AUTO_BUTTON_RECT,
  STRONGEST_MODE_BUTTON_RECT,
  AI_LEARNING_BUTTON_RECT,
  AI_LEARNING_REPEAT_BUTTON_RECT,
  TSUM_TYPES,
  FIXED_SUB_TSUM_IDS_BY_MY_TSUM,
  ITEM_DEFS,
  BOMB_DATA,
  SKILL_TABLES,
  COIN_CORRECTION_TABLE,
  DEFAULT_COIN_CORRECTION_TYPE,
  clamp,
  lerp,
  rand,
  randInt,
  distance,
  formatNumber,
  rectContains,
  pointInCircle,
  drawStarPath
} from './config.js?v=tsum-images-5';

import { UIRenderer } from './ui.js?v=tsum-images-5';
import { JudyNickGaugeManager, registerJudyNickSkill } from './judyNick.js?v=tsum-images-5';
import {
  LILIA_CHAIN_TYPE,
  LILIA_COIN_CORRECTION,
  LILIA_SKILL_DURATION,
  LILIA_TUNING,
  LILIA_TYPE_ID,
  drawLiliaBat,
  isLiliaBatNode,
  registerLiliaSkill
} from './lilia.js?v=tsum-images-7';
import { drawTsumArtwork } from './tsumImages.js?v=tsum-images-5';
import { areBoardTypesColorCompatible } from './boardTypeSelection.js?v=tsum-images-5';
import {
  DEFAULT_LARGE_TSUM_SPAWN_CHANCE,
  LARGE_TSUM_CLEAR_WEIGHT,
  LARGE_TSUM_OCCUPANCY_WEIGHT,
  LARGE_TSUM_SCALE,
  canSpawnNaturalLargeTsum,
  calculateCorrectedClearCoins,
  calculateEffectiveClearCount,
  getEffectiveBombCount,
  getTsumClearWeight,
  getTsumOccupancyWeight,
  getTsumSkillChargeWeight,
  resolveBombGeneration,
  shouldSpawnLargeTsum
} from './bombLogic.js?v=tsum-images-5';
import { getGameplayClockDelta, resolveGameplayPauseState } from './gameplayTiming.js?v=skill-timing-1';
import {
  beginBodyRemovalState,
  isBodyOccupying,
  isBodyPhysicsActive,
  isBodyVisible
} from './bodyLifecycle.js?v=ghost-tsum-1';
import {
  buildCoronationElsaPlannerAdjacency,
  buildCoronationElsaPlannerSnapshot,
  evaluateCoronationElsaTapComponents,
  getCoronationElsaPlannerNodeIndex,
  profileCoronationElsaPlanner,
  solveCoronationElsaStrongestModePlan,
  simulateCoronationElsaFreeze
} from './coronationElsaPlanner.js?v=coronation-elsa-planner-1';
import {
  shouldTapStrongestModeCoronationElsaCompletedIce,
  shouldUseStrongestModeFeverBombCancel
} from './strongestModeLogic.js?v=strongest-mode-coronation-ice-1';

const TITLE_TSUMS_PER_PAGE = 10;
const JUDY_NICK_MOVING_FREEZE_KIND = "judyNickMovingIce";
const STRONGEST_MODE_JUDY_NICK_JUDY_EARLY_BUBBLE_Y = FIELD_TOP + 80;
const CHAIN_INPUT_MARGIN = 4;
const CHAIN_CONNECT_MARGIN = 4;
const COINGAIN_MAX_CORRECTION_STAGE = 30;
const COINGAIN_CHARGE_MULTIPLIER = 0.02;
const COINGAIN_LOTTERY_CLEAR_INTERVAL = 30;
const COINGAIN_LOTTERY_DURATION_MS = 700;
const COINGAIN_LOTTERY_SPIN_MS = 500;
const COINGAIN_LOTTERY_RESULT_MS = 200;
const COINGAIN_RANDOM_CLEAR_RETRY_LIMIT = 25;
const COINGAIN_SPECIAL_CHAIN_KIND = "coingainGlow";
const COINGAIN_PHASE = {
  INTRO: "intro",
  ACTIVE: "active",
  LOTTERY: "lottery",
  MINI_RESTORE: "miniRestore",
  RESTORE: "restore",
  COMPLETE: "complete"
};
const COINGAIN_LOTTERY_OUTCOMES = [
  { type: "allClear", chance: 1, message: "全消去！", color: "#fff0a8" },
  { type: "mini", chance: 3, message: "小型化！", color: "#ffe487" },
  { type: "extend", chance: 3, message: "時間延長！", color: "#fff3a0" },
  { type: "glow", chance: 3, message: "巻き込み化！", color: "#ffe777" },
  { type: "nonBombClear", chance: 3, message: "ボム以外全消去！", color: "#ffe9a8" },
  { type: "unlimitedChain", chance: 5, message: "距離無制限！", color: "#ffef8f" },
  { type: "largeCenterClear", chance: 5, message: "中央大消去！", color: "#ffe17a" },
  { type: "centerClear", chance: 10, message: "中央消去！", color: "#fff0bc" }
];
const CORONATION_ELSA_FREEZE_STACK_STYLES = {
  2: {
    fill: "rgba(150,90,255,0.38)",
    outerStroke: "rgba(224,206,255,0.95)",
    lineStroke: "rgba(198,166,255,0.88)",
    highlight: "rgba(255,255,255,0.34)"
  },
  3: {
    fill: "rgba(205,70,170,0.40)",
    outerStroke: "rgba(255,190,225,0.95)",
    lineStroke: "rgba(244,130,204,0.90)",
    highlight: "rgba(255,235,248,0.34)"
  },
  4: {
    fill: "rgba(235,72,88,0.40)",
    outerStroke: "rgba(255,205,205,0.95)",
    lineStroke: "rgba(255,128,140,0.90)",
    highlight: "rgba(255,235,235,0.34)"
  },
  5: {
    fill: "rgba(120,0,24,0.48)",
    outerStroke: "rgba(255,155,170,0.95)",
    lineStroke: "rgba(210,38,64,0.92)",
    highlight: "rgba(255,220,225,0.34)"
  }
};
const CORONATION_ELSA_ICE_CONNECT_DISTANCE = 78;

class Tsum {
        constructor(game, type, x, y, vx = 0, vy = 0, options = {}) {
          this.game = game;
          this.type = type;
          this.id = `${type.id}_${Math.random().toString(36).slice(2, 10)}`;
          this.isLarge = !!options.isLarge;
          this.largeSpawnSource = this.isLarge ? (options.largeSpawnSource || "skill") : null;
          this.clearWeight = this.isLarge ? LARGE_TSUM_CLEAR_WEIGHT : 1;
          this.occupancyWeight = this.isLarge ? LARGE_TSUM_OCCUPANCY_WEIGHT : 1;
          this.radius = TSUM_RADIUS * (this.isLarge ? LARGE_TSUM_SCALE : 1);
          this.baseRadius = this.radius;
          this.x = x;
          this.y = y;
          this.vx = vx;
          this.vy = vy;
          this.damping = 0.995;
          this.scale = 1;
          this.alpha = 1;
          this.inChain = false;
          this.clearOccupying = false;
          this.clearOccupyX = null;
          this.clearOccupyY = null;
          this.removing = false;
          this.dead = false;
          this.removeTimer = 0;
          this.removeDuration = 0.18;
          this.removeDx = rand(-2.5, 2.5);
          this.removeDy = rand(-5.8, -2.8);
          this.bounce = 0;
          this.largeClearProgress = 0;
        }

        isSettled() {
          return this.game.isBodySettled(this);
        }

        beginRemove() {
          beginBodyRemovalState(this);
          this.removeTimer = 0;
          this.removeDx += this.vx * 0.3;
          this.removeDy += this.vy * 0.15;
        }

        update(dt) {
          if (this.dead) {
            return;
          }
          const frameScale = dt * 60;
          if (this.removing) {
            this.removeTimer += dt;
            const t = clamp(this.removeTimer / this.removeDuration, 0, 1);
            this.scale = 1 + t * 0.55;
            this.alpha = 1 - t;
            this.x += this.removeDx * frameScale;
            this.y += this.removeDy * frameScale;
            this.removeDy += 0.12 * frameScale;
            if (t >= 1) {
              this.dead = true;
              this.clearOccupying = false;
              this.clearOccupyX = null;
              this.clearOccupyY = null;
              this.inChain = false;
              this.removing = false;
            }
            return;
          }

          this.scale = lerp(this.scale, 1, clamp(dt * 14, 0, 1));
          this.alpha = lerp(this.alpha, 1, clamp(dt * 14, 0, 1));
          this.bounce = Math.max(0, this.bounce - dt * 3.4);
        }

        draw(ctx, highlighted, time) {
          if (this.dead) {
            return;
          }
          const displayType = this.game.boardState ? this.game.boardState.getResolvedType(this) : this.type;
          const liliaBat = this.game.isLiliaBat ? this.game.isLiliaBat(this) : false;
          const renderPosition = this.game.getLiliaRenderPosition?.(this) || this;
          const extraScale = this.game.boardState ? this.game.boardState.getVisualScale(this) : 1;
          const isMyTsum = this.game.isMyTsumTypeId(displayType.id);
          const pulse = highlighted ? 1 + Math.sin(time * 16 + this.x * 0.03) * 0.04 : 1;
          const motionStretch = clamp(Math.abs(this.vy) * 0.015, 0, 0.12);
          const bounceScale = 1 + this.bounce * 0.05;
          const r = this.baseRadius * this.scale * extraScale * pulse * bounceScale;

          ctx.save();
          ctx.translate(renderPosition.x, renderPosition.y);
          ctx.globalAlpha = this.alpha;
          ctx.shadowBlur = highlighted ? 28 : 12;
          ctx.shadowColor = highlighted ? "rgba(255,255,255,0.95)" : "rgba(0,0,0,0.22)";
          ctx.scale(1 - motionStretch * 0.35, 1 + motionStretch * 0.45);

          const hasArtwork = !liliaBat && drawTsumArtwork(ctx, displayType, 0, 0, r, { fit: "cover" });
          if (liliaBat) {
            drawLiliaBat(ctx, r, highlighted);
          } else if (hasArtwork) {
            ctx.shadowBlur = 0;
            ctx.strokeStyle = highlighted ? "rgba(255,255,255,0.98)" : "rgba(255,255,255,0.2)";
            ctx.lineWidth = highlighted ? 4 : 2;
            ctx.beginPath();
            ctx.arc(0, 0, r - 1, 0, Math.PI * 2);
            ctx.stroke();
          } else if (isMyTsum) {
            const gradient = ctx.createRadialGradient(-r * 0.42, -r * 0.44, r * 0.2, 0, 0, r * 1.1);
            gradient.addColorStop(0, displayType.light);
            gradient.addColorStop(0.52, displayType.color);
            gradient.addColorStop(1, displayType.dark);
            ctx.fillStyle = gradient;
            ctx.beginPath();
            ctx.arc(0, 0, r, 0, Math.PI * 2);
            ctx.fill();

            ctx.shadowBlur = 0;
            ctx.fillStyle = "rgba(255,255,255,0.24)";
            ctx.beginPath();
            ctx.ellipse(-r * 0.2, -r * 0.46, r * 0.38, r * 0.2, -0.4, 0, Math.PI * 2);
            ctx.fill();

            ctx.strokeStyle = highlighted ? "rgba(255,255,255,0.96)" : "rgba(255,255,255,0.18)";
            ctx.lineWidth = highlighted ? 4 : 2;
            ctx.beginPath();
            ctx.arc(0, 0, r - 1.5, 0, Math.PI * 2);
            ctx.stroke();

            ctx.globalAlpha *= 0.5;
            ctx.fillStyle = "rgba(52,32,24,0.65)";
            ctx.beginPath();
            ctx.arc(-r * 0.18, -r * 0.06, Math.max(1.5, r * 0.07), 0, Math.PI * 2);
            ctx.arc(r * 0.18, -r * 0.06, Math.max(1.5, r * 0.07), 0, Math.PI * 2);
            ctx.fill();

            ctx.strokeStyle = "rgba(88,48,36,0.45)";
            ctx.lineWidth = Math.max(1.4, r * 0.05);
            ctx.beginPath();
            ctx.arc(0, r * 0.08, r * 0.14, 0.18, Math.PI - 0.18);
            ctx.stroke();

            ctx.globalAlpha = this.alpha;
            ctx.font = `${Math.round(r * 0.95)}px "Segoe UI Emoji", "Apple Color Emoji", sans-serif`;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillStyle = "#ffffff";
            ctx.fillText(displayType.emoji, 0, r * 0.12);
          } else {
            const gradient = ctx.createRadialGradient(-r * 0.38, -r * 0.42, r * 0.16, 0, 0, r * 1.08);
            gradient.addColorStop(0, displayType.light || "#f3ffff");
            gradient.addColorStop(0.56, displayType.color || "#67bfd0");
            gradient.addColorStop(1, displayType.dark || "#286b85");
            ctx.fillStyle = gradient;
            ctx.beginPath();
            ctx.arc(0, 0, r, 0, Math.PI * 2);
            ctx.fill();

            ctx.shadowBlur = 0;
            ctx.fillStyle = "rgba(255,255,255,0.2)";
            ctx.beginPath();
            ctx.ellipse(-r * 0.2, -r * 0.43, r * 0.35, r * 0.18, -0.38, 0, Math.PI * 2);
            ctx.fill();

            ctx.strokeStyle = highlighted ? "rgba(255,255,255,0.94)" : "rgba(255,255,255,0.2)";
            ctx.lineWidth = highlighted ? 3 : 2;
            ctx.beginPath();
            ctx.arc(0, 0, r - 1, 0, Math.PI * 2);
            ctx.stroke();

            ctx.fillStyle = "rgba(46,30,31,0.72)";
            ctx.beginPath();
            ctx.arc(-r * 0.2, -r * 0.08, Math.max(1.4, r * 0.055), 0, Math.PI * 2);
            ctx.arc(r * 0.2, -r * 0.08, Math.max(1.4, r * 0.055), 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = "rgba(70,40,42,0.55)";
            ctx.lineWidth = Math.max(1.2, r * 0.045);
            ctx.beginPath();
            ctx.arc(0, r * 0.08, r * 0.12, 0.18, Math.PI - 0.18);
            ctx.stroke();

            ctx.font = `800 ${Math.round(r * 0.55)}px "Trebuchet MS", sans-serif`;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.lineWidth = Math.max(1.6, r * 0.07);
            ctx.strokeStyle = "rgba(22,38,58,0.48)";
            ctx.fillStyle = "rgba(255,255,255,0.92)";
            ctx.strokeText(displayType.emoji, 0, r * 0.37);
            ctx.fillText(displayType.emoji, 0, r * 0.37);
          }

          const specialEntry = this.game.boardState ? this.game.boardState.getSpecialChainEntry(this) : null;
          if (specialEntry?.kind === COINGAIN_SPECIAL_CHAIN_KIND) {
            ctx.save();
            ctx.globalAlpha = this.alpha * (0.72 + Math.sin(time * 8 + this.x * 0.02) * 0.12);
            ctx.shadowBlur = 18;
            ctx.shadowColor = "rgba(255,214,84,0.95)";
            ctx.strokeStyle = "rgba(255,232,124,0.98)";
            ctx.lineWidth = Math.max(3, r * 0.11);
            ctx.beginPath();
            ctx.arc(0, 0, r + 4, 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();
          }

          if (this.game.boardState && this.game.boardState.isFrozen(this)) {
            const freezeStyle = this.game.boardState.getFreezeVisualStyle(this);
            ctx.fillStyle = freezeStyle?.fill || "rgba(180,235,255,0.38)";
            ctx.beginPath();
            ctx.arc(0, 0, r - 2, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = freezeStyle?.outerStroke || "rgba(228,249,255,0.95)";
            ctx.lineWidth = 2.4;
            ctx.beginPath();
            ctx.arc(0, 0, r + 1.5, 0, Math.PI * 2);
            ctx.stroke();
            ctx.strokeStyle = freezeStyle?.lineStroke || "rgba(220,248,255,0.88)";
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(-r * 0.42, 0);
            ctx.lineTo(r * 0.42, 0);
            ctx.moveTo(0, -r * 0.42);
            ctx.lineTo(0, r * 0.42);
            ctx.moveTo(-r * 0.3, -r * 0.3);
            ctx.lineTo(r * 0.3, r * 0.3);
            ctx.moveTo(-r * 0.3, r * 0.3);
            ctx.lineTo(r * 0.3, -r * 0.3);
            ctx.stroke();
            ctx.fillStyle = freezeStyle?.highlight || "rgba(255,255,255,0.34)";
            ctx.beginPath();
            ctx.arc(-r * 0.28, -r * 0.34, Math.max(2, r * 0.08), 0, Math.PI * 2);
            ctx.arc(r * 0.2, -r * 0.2, Math.max(1.5, r * 0.05), 0, Math.PI * 2);
            ctx.fill();
          }

          if (this.game.boardState && this.game.boardState.hasBubble(this)) {
            ctx.strokeStyle = "rgba(220,250,255,0.9)";
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.arc(0, 0, r + 5, 0, Math.PI * 2);
            ctx.stroke();
            ctx.fillStyle = "rgba(255,255,255,0.25)";
            ctx.beginPath();
            ctx.arc(r * 0.28, -r * 0.42, r * 0.12, 0, Math.PI * 2);
            ctx.fill();
          }

          ctx.restore();
        }
      }

      class Bomb {
        constructor(game, bombType, x, y, vx = 0, vy = 0) {
          this.game = game;
          this.type = "bomb";
          this.bombType = bombType;
          this.id = `bomb_${bombType}_${Math.random().toString(36).slice(2, 10)}`;
          this.x = x;
          this.y = y;
          this.vx = vx;
          this.vy = vy;
          this.radius = TSUM_RADIUS;
          this.damping = 0.995;
          this.inChain = false;
          this.removing = false;
          this.isBomb = true;
          this.alpha = 1;
          this.scale = 1;
          this.bounce = 0;
          this.life = 0;
          this.dead = false;
        }

        isSettled() {
          return this.game.isBodySettled(this);
        }

        update(dt) {
          if (this.dead) {
            return;
          }
          this.life += dt;
          this.bounce = Math.max(0, this.bounce - dt * 3.2);
        }

        draw(ctx) {
          if (this.dead) {
            return;
          }
          const data = BOMB_DATA[this.bombType];
          const extraScale = this.game.boardState ? this.game.boardState.getVisualScale(this) : 1;
          const pulse = 1 + Math.sin(this.life * 8) * 0.03;
          const bounceScale = 1 + this.bounce * 0.04;
          const r = this.radius * extraScale * pulse * bounceScale;

          ctx.save();
          ctx.translate(this.x, this.y);
          ctx.globalAlpha = this.alpha;
          ctx.shadowBlur = 8 + Math.sin(this.life * 7) * 3;
          ctx.shadowColor = data.aura;
          const gradient = ctx.createRadialGradient(-r * 0.35, -r * 0.38, r * 0.2, 0, 0, r * 1.15);
          if (this.bombType === "normal") {
            gradient.addColorStop(0, "#a8a8a8");
            gradient.addColorStop(0.6, "#666666");
            gradient.addColorStop(1, "#2b2b2b");
          } else if (this.bombType === "time") {
            gradient.addColorStop(0, "#7ac9ff");
            gradient.addColorStop(0.55, "#4488ff");
            gradient.addColorStop(1, "#002288");
          } else if (this.bombType === "star") {
            gradient.addColorStop(0, "#fff6a0");
            gradient.addColorStop(0.55, "#ffdd4a");
            gradient.addColorStop(1, "#c27a00");
          } else if (this.bombType === "coin") {
            gradient.addColorStop(0, "#fff1a5");
            gradient.addColorStop(0.58, "#ffd700");
            gradient.addColorStop(1, "#aa6600");
          } else if (this.bombType === "score") {
            gradient.addColorStop(0, "#ff98ca");
            gradient.addColorStop(0.58, "#ff44aa");
            gradient.addColorStop(1, "#880033");
          } else {
            gradient.addColorStop(0, "#b9f3ff");
            gradient.addColorStop(0.58, "#58cfff");
            gradient.addColorStop(1, "#1d6fa6");
          }
          ctx.fillStyle = gradient;
          ctx.beginPath();
          ctx.arc(0, 0, r, 0, Math.PI * 2);
          ctx.fill();

          ctx.shadowBlur = 0;
          ctx.strokeStyle = "rgba(255,255,255,0.8)";
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(0, 0, r - 1, 0, Math.PI * 2);
          ctx.stroke();
          ctx.fillStyle = "rgba(255,255,255,0.22)";
          ctx.beginPath();
          ctx.ellipse(-r * 0.18, -r * 0.44, r * 0.32, r * 0.15, -0.2, 0, Math.PI * 2);
          ctx.fill();
          if (this.bombType === "normal") {
            ctx.strokeStyle = "#2a190d";
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(0, -r + 1);
            ctx.quadraticCurveTo(r * 0.1, -r - 10, r * 0.28, -r - 2);
            ctx.stroke();
            ctx.fillStyle = "#ffcc4d";
            ctx.beginPath();
            ctx.arc(r * 0.32, -r - 3, 3.2, 0, Math.PI * 2);
            ctx.fill();
            ctx.font = `${Math.round(r * 0.8)}px "Segoe UI Emoji", "Apple Color Emoji", sans-serif`;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillStyle = "#ffffff";
            ctx.fillText("💣", 0, 2);
          } else if (this.bombType === "time") {
            ctx.strokeStyle = "rgba(255,255,255,0.92)";
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(0, 0, r * 0.48, 0, Math.PI * 2);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.lineTo(0, -r * 0.24);
            ctx.moveTo(0, 0);
            ctx.lineTo(r * 0.18, 0);
            ctx.stroke();
          } else if (this.bombType === "star") {
            ctx.fillStyle = "#fff7c0";
            drawStarPath(ctx, 5, r * 0.42, r * 0.2);
            ctx.fill();
          } else if (this.bombType === "coin") {
            ctx.strokeStyle = "rgba(255,245,190,0.95)";
            ctx.lineWidth = 2.2;
            ctx.beginPath();
            ctx.arc(0, 0, r * 0.36, 0, Math.PI * 2);
            ctx.stroke();
            ctx.fillStyle = "rgba(255,255,255,0.92)";
            ctx.font = `700 ${Math.round(r * 0.55)}px "Trebuchet MS", sans-serif`;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText("$", 0, 2);
          } else if (this.bombType === "score") {
            ctx.fillStyle = "#ffffff";
            ctx.font = `700 ${Math.round(r * 0.58)}px "Trebuchet MS", sans-serif`;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText("x2", 0, 2);
          } else {
            ctx.fillStyle = "#f4feff";
            drawStarPath(ctx, 6, r * 0.42, r * 0.19);
            ctx.fill();
          }
          ctx.restore();
        }
      }

      class SkillSystem {
        constructor(game) {
          this.game = game;
          this.owner = TSUM_TYPES[0];
          this.type = TSUM_TYPES[0].skillType;
          this.level = 3;
          this.charge = 0;
          this.maxCharge = 10;
          this.activationFlash = 0;
        }

        configure(owner, level) {
          this.owner = owner;
          this.type = owner.skillType;
          this.level = clamp(level, 1, 6);
          this.charge = 0;
          const table = SKILL_TABLES[this.type];
          this.maxCharge = table ? table.cost[this.level - 1] : 10;
          this.activationFlash = 0;
        }

        addCharge(amount) {
          if (amount <= 0) {
            return;
          }
          this.charge = clamp(this.charge + amount, 0, this.maxCharge);
        }

        get ready() {
          return this.charge >= this.maxCharge;
        }

        consume() {
          this.charge = 0;
          this.activationFlash = 1;
        }

        get displayName() {
          return this.owner.skillName;
        }

        use() {
          if (!this.ready) {
            return false;
          }
          const used = this.game.executeSkill(this.owner.id, this.level);
          if (used) {
            this.consume();
          }
          return used;
        }

        update(dt) {
          this.activationFlash = Math.max(0, this.activationFlash - dt * 2.5);
        }
      }

      class FeverSystem {
        constructor(game) {
          this.game = game;
          this.gauge = 0;
          this.active = false;
          this.feverCount = 0;
          this.bannerTimer = 0;
          this.flash = 0;
        }

        reset() {
          this.gauge = 0;
          this.active = false;
          this.feverCount = 0;
          this.bannerTimer = 0;
          this.flash = 0;
        }

        addClears(count) {
          if (this.active || count <= 0) {
            return;
          }
          this.gauge = clamp(this.gauge + (count / 29) * 100, 0, 100);
          if (this.gauge >= 100) {
            this.start();
          }
        }

        start() {
          if (this.active) {
            return;
          }
          this.active = true;
          this.gauge = 100;
          this.feverCount += 1;
          this.bannerTimer = 1.3;
          this.flash = 1;
          this.game.timeRemaining += 5;
          this.game.timeUp = false;
          this.game.noteAction();
          this.game.addFloatingText(this.game.width * 0.5, 270, "+5 SEC", "#fff2a7", 28, 1.1);
        }

        end() {
          this.active = false;
          this.gauge = 0;
        }

        update(dt) {
          this.bannerTimer = Math.max(0, this.bannerTimer - dt);
          this.flash = Math.max(0, this.flash - dt * 1.8);

          if (this.active) {
            this.gauge -= (100 / 11.5) * dt;
            if (this.gauge <= 0) {
              this.end();
            }
            return;
          }

          if (this.game.isIdleForGaugeDrain()) {
            this.gauge = clamp(this.gauge - 5 * dt, 0, 100);
          }
        }
      }

      class ComboSystem {
        constructor(game) {
          this.game = game;
          this.combo = 0;
          this.maxCombo = 0;
          this.timer = 0;
          this.pulse = 0;
        }

        reset() {
          this.combo = 0;
          this.maxCombo = 0;
          this.timer = 0;
          this.pulse = 0;
        }

        comboWindowFor(nextCombo) {
          if (nextCombo <= 50) {
            return 3;
          }
          if (nextCombo <= 100) {
            return 2;
          }
          if (nextCombo <= 500) {
            return 1;
          }
          return 0.5;
        }

        previewNextCombo() {
          return clamp(this.combo + 1, 1, 999);
        }

        recordAction() {
          this.combo = clamp(this.combo + 1, 1, 999);
          this.maxCombo = Math.max(this.maxCombo, this.combo);
          this.timer = this.comboWindowFor(this.combo);
          this.pulse = 1;
        }

        update(dt) {
          this.pulse = Math.max(0, this.pulse - dt * 3);
          if (this.game.activeItems.combo || this.game.feverSystem.active || this.game.dragging || this.game.actionLock) {
            return;
          }
          if (this.combo <= 0) {
            return;
          }
          this.timer -= dt;
          if (this.timer <= 0) {
            this.combo = 0;
            this.timer = 0;
          }
        }
      }

class BoardStateService {

  constructor(game) {
    this.game = game;
    // initialize layers and modifiers used by methods
    this.freezeLayer = new Map();
    this.bubbleLayer = new Map();
    this.transformLayer = new Map();
    this.specialChainLayer = new Map();
    this.nodeScaleLayer = new Map();
    this.spawnModifierLayer = new Map();
    this.typeScaleModifiers = new Map();
    this.freezeGroups = new Map();
    this._nextGroupCounter = 1;
    this._nextHandleCounter = 1;
  }

  reset() {
    this.freezeLayer.clear();
    this.bubbleLayer.clear();
    this.transformLayer.clear();
    this.specialChainLayer.clear();
    this.nodeScaleLayer.clear();
    this.spawnModifierLayer.clear();
    this.typeScaleModifiers.clear();
    this.freezeGroups.clear();
    this._nextGroupCounter = 1;
    this._nextHandleCounter = 1;
  }

  getEffectiveRadius(node) {
    const base = node.isBomb ? node.radius : node.baseRadius || node.radius;
    return base * this.getRadiusScale(node);
  }

  isFrozen(node) {
    return !!this.getLastEntry(this.freezeLayer, node.id);
  }

  getFrozenEntry(node) {
    return this.getLastEntry(this.freezeLayer, node.id);
  }

  getFreezeVisualStyle(node) {
    const entries = this.freezeLayer.get(node.id) || [];
    let coronationFreezeCount = 0;
    for (const entry of entries) {
      if (entry.freezeKind === "coronationElsa") {
        coronationFreezeCount += 1;
      }
    }
    if (coronationFreezeCount <= 1) {
      return null;
    }
    return CORONATION_ELSA_FREEZE_STACK_STYLES[Math.min(coronationFreezeCount, 5)] || null;
  }

  isMovingFrozen(node) {
    const entry = this.getFrozenEntry(node);
    return !!entry && entry.motionMode === "moving";
  }

  isFreezeMovementLocked(node) {
    const entry = this.getFrozenEntry(node);
    return !!entry && entry.motionMode !== "moving";
  }

  hasBubble(node) {
    return !!this.getLastEntry(this.bubbleLayer, node.id);
  }

  getBubbleEntry(node) {
    return this.getLastEntry(this.bubbleLayer, node.id);
  }

  getSpecialChainEntry(node) {
    return this.getLastEntry(this.specialChainLayer, node.id);
  }

  applyFreeze(nodeIds, spec = {}) {
    return this.applyFreezeEntries(nodeIds, spec, {
      freezeKind: "generic",
      persist: true,
      motionMode: "locked"
    });
  }

  applyMovingFreeze(nodeIds, spec = {}) {
    return this.applyFreezeEntries(nodeIds, spec, {
      freezeKind: JUDY_NICK_MOVING_FREEZE_KIND,
      persist: false,
      motionMode: "moving"
    });
  }

  applyFreezeEntries(nodeIds, spec = {}, defaults = {}) {
    const groupId = spec.groupId || this.nextGroupId("freeze");
    const freezeKind = spec.freezeKind || defaults.freezeKind || "generic";
    const persist = typeof spec.persist === "boolean" ? spec.persist : defaults.persist !== false;
    const motionMode = spec.motionMode || defaults.motionMode || "locked";
    const members = new Set(this.freezeGroups.get(groupId) || []);
    for (const nodeId of nodeIds) {
      const node = this.getNodeById(nodeId);
      if (!node || node.dead || node.removing) {
        continue;
      }
      const entries = this.getLayerEntries(this.freezeLayer, nodeId)
        .filter((entry) => !(entry.sessionId === spec.sessionId && entry.groupId === groupId));
      entries.push({
        ...spec,
        sessionId: spec.sessionId,
        groupId,
        freezeKind,
        persist,
        motionMode
      });
      this.setLayerEntries(this.freezeLayer, nodeId, entries);
      members.add(nodeId);
    }
    this.freezeGroups.set(groupId, members);
    return groupId;
  }

  getFrozenGroupNodes(groupId) {
    const ids = Array.from(this.freezeGroups.get(groupId) || []);
    return ids
      .map((nodeId) => this.getNodeById(nodeId))
      .filter((node) => node && !node.dead && !node.removing);
  }

  clearFrozenGroup(groupId) {
    const nodes = this.getFrozenGroupNodes(groupId);
    for (const node of nodes) {
      const entries = this.getLayerEntries(this.freezeLayer, node.id).filter((entry) => entry.groupId !== groupId);
      this.setLayerEntries(this.freezeLayer, node.id, entries);
    }
    this.freezeGroups.delete(groupId);
    return nodes;
  }

  findFrozenGroupAt(pos) {
    let candidate = null;
    let bestY = Infinity;
    for (const tsum of this.game.tsums) {
      if (tsum.dead || tsum.removing || !this.isFrozen(tsum)) {
        continue;
      }
      if (distance(pos.x, pos.y, tsum.x, tsum.y) <= this.getEffectiveRadius(tsum) && tsum.y < bestY) {
        bestY = tsum.y;
        candidate = tsum;
      }
    }
    return candidate;
  }

  applyBubble(nodeIds, spec) {
    const bubbleIds = [];
    for (const nodeId of nodeIds) {
      const node = this.getNodeById(nodeId);
      if (!node || node.dead || node.removing) {
        continue;
      }
      const bubbleId = spec.bubbleId || this.nextGroupId("bubble");
      const entries = this.getLayerEntries(this.bubbleLayer, nodeId).filter((entry) => !(entry.sessionId === spec.sessionId && entry.bubbleId === bubbleId));
      entries.push({
        ...spec,
        sessionId: spec.sessionId,
        bubbleId,
        radius: spec.radius
      });
      this.setLayerEntries(this.bubbleLayer, nodeId, entries);
      bubbleIds.push(bubbleId);
    }
    return bubbleIds;
  }

  findBubbleAt(pos) {
    let candidate = null;
    let bestY = Infinity;
    for (const tsum of this.game.tsums) {
      if (tsum.dead || tsum.removing || !this.hasBubble(tsum)) {
        continue;
      }
      if (distance(pos.x, pos.y, tsum.x, tsum.y) <= this.getEffectiveRadius(tsum) && tsum.y < bestY) {
        bestY = tsum.y;
        candidate = { node: tsum, entry: this.getBubbleEntry(tsum) };
      }
    }
    return candidate;
  }

  removeBubble(nodeId, bubbleId = null, sessionId = null) {
    const entries = this.getLayerEntries(this.bubbleLayer, nodeId).filter((entry) => {
      if (bubbleId && entry.bubbleId !== bubbleId) {
        return true;
      }
      if (sessionId && entry.sessionId !== sessionId) {
        return true;
      }
      return false;
    });
    this.setLayerEntries(this.bubbleLayer, nodeId, entries);
  }

  hasFreezeKind(node, freezeKind) {
    return this.getLayerEntries(this.freezeLayer, node.id).some((entry) => entry.freezeKind === freezeKind);
  }

  getFrozenEntriesByKind(node, freezeKind) {
    return this.getLayerEntries(this.freezeLayer, node.id).filter((entry) => entry.freezeKind === freezeKind);
  }

  getFrozenNodesByKind(freezeKind, sessionId = null) {
    return this.game.tsums.filter((tsum) => {
      if (tsum.dead || tsum.removing) {
        return false;
      }
      return this.getLayerEntries(this.freezeLayer, tsum.id).some((entry) => (
        entry.freezeKind === freezeKind &&
        (!sessionId || entry.sessionId === sessionId)
      ));
    });
  }

  getJudyNickMovingFrozenNodes(sessionId = null) {
    return this.getFrozenNodesByKind(JUDY_NICK_MOVING_FREEZE_KIND, sessionId);
  }

  getBubbleNodesBySession(sessionId) {
    return this.game.tsums.filter((tsum) => {
      if (tsum.dead || tsum.removing) {
        return false;
      }
      return this.getLayerEntries(this.bubbleLayer, tsum.id).some((entry) => entry.sessionId === sessionId);
    });
  }

  canBombAffectNode(node, bombType = "normal") {
    if (!node || node.dead || node.removing) {
      return false;
    }
    const frozenEntries = this.getLayerEntries(this.freezeLayer, node.id);
    if (frozenEntries.some((entry) => entry.bombImmune && bombType === "normal")) {
      return false;
    }
    return true;
  }

  getFrozenTapInfo(node) {
    if (!node) {
      return null;
    }
    const entry = this.getFrozenEntry(node);
    if (!entry) {
      return null;
    }
    if (entry.freezeKind === "coronationElsa") {
      return this.getCoronationFrozenTapInfo(node);
    }
    if (entry.freezeKind === "snowQueen") {
      return this.getFreezeKindTapInfo("snowQueen");
    }
    if (entry.freezeKind === JUDY_NICK_MOVING_FREEZE_KIND) {
      return this.getJudyNickMovingFreezeTapInfo(entry.sessionId);
    }
    const targets = this.getFrozenGroupNodes(entry.groupId);
    return {
      targets,
      correctionType: entry.correctionType,
      chargeMultiplier: entry.chargeMultiplier,
      scoreMultiplier: entry.scoreMultiplier,
      effectiveClearCountOverride: entry.effectiveClearCountOverride ?? entry.clearCountOverride,
      additionalClearCount: entry.additionalClearCount || 0,
      type: targets[0] ? this.getResolvedType(targets[0]) : null
    };
  }

  getFreezeKindTapInfo(freezeKind, sessionId = null) {
    const targets = this.getFrozenNodesByKind(freezeKind, sessionId);
    const sample = targets[0] ? this.getFrozenEntriesByKind(targets[0], freezeKind).slice(-1)[0] : null;
    return {
      targets,
      correctionType: sample?.correctionType,
      chargeMultiplier: sample?.chargeMultiplier,
      scoreMultiplier: sample?.scoreMultiplier,
      additionalClearCount: sample?.additionalClearCount || 0,
      type: targets[0] ? this.getResolvedType(targets[0]) : null
    };
  }

  getJudyNickMovingFreezeTapInfo(sessionId = null) {
    return this.getFreezeKindTapInfo(JUDY_NICK_MOVING_FREEZE_KIND, sessionId);
  }

  getCoronationFrozenTapInfo(startNode) {
    if (!startNode || !this.hasFreezeKind(startNode, "coronationElsa")) {
      return null;
    }
    const snapshot = buildCoronationElsaPlannerSnapshot(this.game, this.game.selectedSkillLevel);
    const startIndex = getCoronationElsaPlannerNodeIndex(snapshot, startNode.id);
    const evaluation = evaluateCoronationElsaTapComponents(snapshot, snapshot.initialState);
    const component = evaluation.components.find((entry) => entry.componentIndices.includes(startIndex));
    if (!component) {
      return null;
    }
    const liveById = new Map(this.game.tsums.map((node) => [String(node.id), node]));
    const targets = component.targetIndices
      .map((index) => liveById.get(String(snapshot.nodes[index].id)))
      .filter(Boolean);
    let correctionType = null;
    let chargeMultiplier = null;
    const componentNodes = component.componentIndices
      .map((index) => liveById.get(String(snapshot.nodes[index].id)))
      .filter(Boolean);
    for (const node of componentNodes) {
      const entries = this.getFrozenEntriesByKind(node, "coronationElsa");
      for (const freezeEntry of entries) {
        correctionType = correctionType || freezeEntry.correctionType;
        if (chargeMultiplier == null && typeof freezeEntry.chargeMultiplier === "number") {
          chargeMultiplier = freezeEntry.chargeMultiplier;
        }
      }
    }

    const freezeLayerHistogramOfTappedGroup = buildCoronationElsaFreezeLayerHistogram(this, componentNodes);

    return {
      targets,
      correctionType,
      chargeMultiplier,
      additionalClearCount: component.additionalClearCount,
      type: targets[0] ? this.getResolvedType(targets[0]) : null,
      connectedFrozenCount: component.connectedFrozenCount,
      splashNormalCount: component.splashNormalCount,
      freezeLayerBonus: component.freezeLayerBonus,
      targetsCount: component.physicalTargetCount,
      freezeLayerHistogramOfTappedGroup
    };
  }

  transformNodes(nodeIds, spec) {
    for (const nodeId of nodeIds) {
      const node = this.getNodeById(nodeId);
      if (!node || node.dead || node.removing) {
        continue;
      }
      const entries = this.getLayerEntries(this.transformLayer, nodeId).filter((entry) => entry.sessionId !== spec.sessionId);
      entries.push({
        sessionId: spec.sessionId,
        toTypeId: spec.toTypeId,
        kind: spec.kind || "transform"
      });
      this.setLayerEntries(this.transformLayer, nodeId, entries);
    }
  }

  commitTransforms(sessionId) {
    for (const tsum of this.game.tsums) {
      const entries = this.getLayerEntries(this.transformLayer, tsum.id);
      const commitEntry = entries.find((entry) => entry.sessionId === sessionId);
      if (!commitEntry) {
        continue;
      }
      tsum.type = TSUM_TYPES.find((type) => type.id === commitEntry.toTypeId) || tsum.type;
      this.setLayerEntries(this.transformLayer, tsum.id, entries.filter((entry) => entry.sessionId !== sessionId));
    }
  }

  addSpecialChainNodes(nodeIds, spec) {
    for (const nodeId of nodeIds) {
      const node = this.getNodeById(nodeId);
      if (!node || node.dead || node.removing) {
        continue;
      }
      const entries = this.getLayerEntries(this.specialChainLayer, nodeId).filter((entry) => entry.sessionId !== spec.sessionId);
      entries.push({
        sessionId: spec.sessionId,
        kind: spec.kind,
        scoreMultiplier: spec.scoreMultiplier || 1,
        correctionType: spec.correctionType || null,
        coinMultiplier: spec.coinMultiplier || 1,
        splashRadius: spec.splashRadius || 0
      });
      this.setLayerEntries(this.specialChainLayer, nodeId, entries);
    }
  }

  setScaleModifier(spec) {
    const handleId = spec.handleId || this.nextHandleId("scale");
    if (spec.nodeIds && spec.nodeIds.length) {
      for (const nodeId of spec.nodeIds) {
        const node = this.getNodeById(nodeId);
        if (!node || node.dead || node.removing) {
          continue;
        }
        const entries = this.getLayerEntries(this.nodeScaleLayer, nodeId).filter((entry) => entry.sessionId !== spec.sessionId);
        entries.push({
          sessionId: spec.sessionId,
          handleId,
          scale: spec.scale,
          radiusScale: spec.radiusScale
        });
        this.setLayerEntries(this.nodeScaleLayer, nodeId, entries);
      }
    }
    if (spec.typeId) {
      this.typeScaleModifiers.set(handleId, {
        sessionId: spec.sessionId,
        typeId: spec.typeId,
        scale: spec.scale,
        radiusScale: spec.radiusScale
      });
    }
    return { id: handleId };
  }

  applyScaleModifiersToSpawn(tsum) {
    for (const modifier of this.typeScaleModifiers.values()) {
      if (modifier.typeId !== tsum.type.id) {
        continue;
      }
      const entries = this.getLayerEntries(this.nodeScaleLayer, tsum.id);
      entries.push({
        sessionId: modifier.sessionId,
        handleId: modifier.handleId || modifier.sessionId,
        scale: modifier.scale,
        radiusScale: modifier.radiusScale
      });
      this.setLayerEntries(this.nodeScaleLayer, tsum.id, entries);
    }
  }

  setSpawnModifier(spec) {
    const handleId = spec.handleId || this.nextHandleId("spawn");
    this.spawnModifierLayer.set(handleId, { ...spec, id: handleId });
    return { id: handleId };
  }

  removeSpawnModifier(handleId) {
    this.spawnModifierLayer.delete(handleId);
  }

  getTypePopulation(typeId) {
    let count = 0;
    for (const tsum of this.game.tsums) {
      if (tsum.dead || tsum.removing) {
        continue;
      }
      if (this.getResolvedType(tsum).id === typeId) {
        count += 1;
      }
    }
    return count;
  }

  chooseSpawnType(types, weights, fallbackType) {
    // Defensive: ensure we have a types array
    if (!types || !types.length) {
      types = TSUM_TYPES || [];
    }
    weights = weights || [];

    let pool = types.map((type, index) => ({ type, weight: weights[index] || 0 }));
    const blockedIds = new Set();
    const modifiers = this.spawnModifierLayer || new Map();
    for (const modifier of modifiers.values()) {
      if (modifier.blockedTypeId) {
        blockedIds.add(modifier.blockedTypeId);
      }
      if (modifier.blockedTypeIds) {
        modifier.blockedTypeIds.forEach((typeId) => blockedIds.add(typeId));
      }
    }
    pool = pool.filter((entry) => !blockedIds.has(entry.type && entry.type.id));
    if (!pool.length) {
      pool = types.map((type, index) => ({ type, weight: weights[index] || 0 }));
    }

    for (const modifier of modifiers.values()) {
      if (modifier.mode === "gastonLoop" && modifier.myTypeId) {
        if (this.getTypePopulation(modifier.myTypeId) < modifier.targetPopulation) {
          return (TSUM_TYPES || []).find((type) => type.id === modifier.myTypeId) || fallbackType;
        }
        const myEntry = pool.find((entry) => (entry.type && entry.type.id) === modifier.myTypeId);
        if (myEntry) {
          myEntry.weight = Math.max(myEntry.weight, modifier.rate);
          const others = pool.filter((entry) => (entry.type && entry.type.id) !== modifier.myTypeId);
          const remain = Math.max(0.01, 1 - myEntry.weight);
          const othersSum = others.reduce((sum, entry) => sum + entry.weight, 0) || 1;
          for (const entry of others) {
            entry.weight = remain * (entry.weight / othersSum);
          }
        }
      }
    }

    const total = pool.reduce((sum, entry) => sum + entry.weight, 0) || 1;
    let roll = Math.random() * total;
    for (const entry of pool) {
      roll -= entry.weight;
      if (roll <= 0) {
        return entry.type;
      }
    }
    return pool.length ? pool[pool.length - 1].type : fallbackType;
  }

  clearBySource(sessionId) {
    const layeredMaps = [this.freezeLayer, this.bubbleLayer, this.transformLayer, this.specialChainLayer, this.nodeScaleLayer];
    for (const layer of layeredMaps) {
      for (const [nodeId, entries] of layer.entries()) {
        this.setLayerEntries(layer, nodeId, entries.filter((entry) => entry.sessionId !== sessionId));
      }
    }
    for (const [groupId, members] of this.freezeGroups.entries()) {
      const retained = Array.from(members).filter((nodeId) => this.getLayerEntries(this.freezeLayer, nodeId).some((entry) => entry.groupId === groupId));
      if (retained.length) {
        this.freezeGroups.set(groupId, new Set(retained));
      } else {
        this.freezeGroups.delete(groupId);
      }
    }
    for (const [handleId, modifier] of this.typeScaleModifiers.entries()) {
      if (modifier.sessionId === sessionId) {
        this.typeScaleModifiers.delete(handleId);
      }
    }
    for (const [handleId, modifier] of this.spawnModifierLayer.entries()) {
      if (modifier.sessionId === sessionId) {
        this.spawnModifierLayer.delete(handleId);
      }
    }
  }

  clearScaleBySource(sessionId) {
    for (const [nodeId, entries] of this.nodeScaleLayer.entries()) {
      this.setLayerEntries(this.nodeScaleLayer, nodeId, entries.filter((entry) => entry.sessionId !== sessionId));
    }
    for (const [handleId, modifier] of this.typeScaleModifiers.entries()) {
      if (modifier.sessionId === sessionId) {
        this.typeScaleModifiers.delete(handleId);
      }
    }
  }

  onNodesCleared(nodes) {
    const clearedIds = new Set(nodes.map((node) => node.id));
    for (const nodeId of clearedIds) {
      this.freezeLayer.delete(nodeId);
      this.bubbleLayer.delete(nodeId);
      this.transformLayer.delete(nodeId);
      this.specialChainLayer.delete(nodeId);
      this.nodeScaleLayer.delete(nodeId);
    }
    for (const [groupId, members] of this.freezeGroups.entries()) {
      const retained = Array.from(members).filter((nodeId) => !clearedIds.has(nodeId));
      if (retained.length) {
        this.freezeGroups.set(groupId, new Set(retained));
      } else {
        this.freezeGroups.delete(groupId);
      }
    }
  }

  getLayerEntries(layer, nodeId) {
    if (!layer) return [];
    const entries = layer.get(nodeId);
    return Array.isArray(entries) ? entries.slice() : [];
  }

  setLayerEntries(layer, nodeId, entries) {
    if (!layer) return;
    if (!entries || !entries.length) {
      layer.delete(nodeId);
    } else {
      layer.set(nodeId, entries.slice());
    }
  }

  getLastEntry(layer, nodeId) {
    const entries = this.getLayerEntries(layer, nodeId);
    return entries.length ? entries[entries.length - 1] : null;
  }

  getNodeById(id) {
    if (!id) return null;
    const byTsum = (this.game.tsums || []).find((t) => t.id === id);
    if (byTsum) return byTsum;
    const byBomb = (this.game.bombs || []).find((b) => b.id === id);
    return byBomb || null;
  }

  nextGroupId(prefix = "g") {
    const id = `${prefix}_${this._nextGroupCounter}`;
    this._nextGroupCounter += 1;
    return id;
  }

  nextHandleId(prefix = "h") {
    const id = `${prefix}_${this._nextHandleCounter}`;
    this._nextHandleCounter += 1;
    return id;
  }

  getRadiusScale(node) {
    let scale = 1;
    if (!node) return scale;
    const entries = this.getLayerEntries(this.nodeScaleLayer, node.id);
    for (const e of entries) {
      if (typeof e.radiusScale === 'number') {
        scale *= e.radiusScale;
      }
    }
    for (const mod of this.typeScaleModifiers.values()) {
      if (mod.typeId === (node.type && node.type.id) && typeof mod.radiusScale === 'number') {
        scale *= mod.radiusScale;
      }
    }
    return scale;
  }

  getVisualScale(node) {
    let scale = 1;
    if (!node) return scale;
    const entries = this.getLayerEntries(this.nodeScaleLayer, node.id);
    for (const e of entries) {
      if (typeof e.scale === 'number') {
        scale *= e.scale;
      }
    }
    for (const mod of this.typeScaleModifiers.values()) {
      if (mod.typeId === (node.type && node.type.id) && typeof mod.scale === 'number') {
        scale *= mod.scale;
      }
    }
    return scale;
  }

  getResolvedType(node) {
    if (!node) return null;
    const transformEntries = this.getLayerEntries(this.transformLayer, node.id);
    if (transformEntries.length) {
      const last = transformEntries[transformEntries.length - 1];
      if (last && last.toTypeId) {
        return TSUM_TYPES.find((t) => t.id === last.toTypeId) || node.type;
      }
    }
    return node.type;
  }
}

class SkillRuntimeManager {
  constructor(game, board) {
    this.game = game;
    this.board = board;
    this.sessions = [];
    this.nextSessionId = 0;
  }

  reset() {
    for (const session of this.sessions.slice()) {
      this.endSession(session, "replaced");
    }
    this.nextSessionId = 0;
  }

  createSessionId(handlerId) {
    this.nextSessionId += 1;
    return `${handlerId}_${this.nextSessionId}`;
  }

  createContext(handler, level, existingSession = null) {
    let createdSession = existingSession;
    return {
      level,
      game: this.game,
      board: this.board,
      clear: this.game.clearPipeline,
      runtime: this,
      rng: { float: Math.random, int: randInt },
      createSession: (spec = {}) => {
        createdSession = {
          id: spec.id || this.createSessionId(handler.id),
          handlerId: handler.id,
          level,
          remainingMs: spec.remainingMs ?? 0,
          cleanupOnEnd: spec.cleanupOnEnd !== false,
          data: spec.data || {},
          schedules: [],
          ...spec
        };
        return createdSession;
      },
      applyFreeze: (nodeIds, spec) => this.board.applyFreeze(nodeIds, spec),
      clearFrozenGroup: (groupId) => this.board.clearFrozenGroup(groupId),
      applyBubble: (nodeIds, spec) => this.board.applyBubble(nodeIds, spec),
      burstBubble: (nodeId, spec = {}) => {
        this.board.removeBubble(nodeId, spec.bubbleId || null, spec.sessionId || null);
      },
      transformNodes: (nodeIds, spec) => this.board.transformNodes(nodeIds, spec),
      setSpawnModifier: (spec) => this.board.setSpawnModifier(spec),
      removeSpawnModifier: (handleId) => this.board.removeSpawnModifier(handleId),
      addSpecialChainNodes: (nodeIds, spec) => this.board.addSpecialChainNodes(nodeIds, spec),
      setScaleModifier: (spec) => this.board.setScaleModifier(spec),
      clearBySource: (sessionId) => this.board.clearBySource(sessionId),
      schedule: (intervalMs, cb) => {
        if (!createdSession) {
          return null;
        }
        const handle = { id: this.board.nextHandleId("timer"), intervalMs, remainingMs: intervalMs, cb };
        createdSession.schedules.push(handle);
        return handle;
      }
    };
  }

  activate(skillId, level) {
    const handler = SkillRegistry[skillId];
    if (!handler) {
      return false;
    }
    const ctx = this.createContext(handler, level);
    const session = handler.onActivate(ctx);
    if (!session) {
      return false;
    }
    if (!this.sessions.some((entry) => entry.id === session.id)) {
      this.sessions.push(session);
    }
    return true;
  }

  getSessionsByHandlerId(handlerId) {
    return this.sessions.filter((session) => session.handlerId === handlerId);
  }

  endSession(session, reason = "timeout") {
    const handler = SkillRegistry[session.handlerId];
    if (handler && handler.onEnd) {
      handler.onEnd(this.createContext(handler, session.level, session), session, reason);
    }
    if (session.cleanupOnEnd !== false && handler && handler.cleanupBySession) {
      handler.cleanupBySession(this.createContext(handler, session.level, session), session.id);
    }
    this.sessions = this.sessions.filter((entry) => entry.id !== session.id);
  }

  update(dtMs) {
    for (const session of this.sessions.slice()) {
      const handler = SkillRegistry[session.handlerId];
      if (!handler) {
        continue;
      }
      if (handler.onTick) {
        handler.onTick(this.createContext(handler, session.level, session), session, dtMs);
      }
      for (const timer of session.schedules || []) {
        timer.remainingMs -= dtMs;
        while (timer.remainingMs <= 0) {
          timer.remainingMs += timer.intervalMs;
          timer.cb(this.createContext(handler, session.level, session), session);
        }
      }
      if (Number.isFinite(session.remainingMs)) {
        session.remainingMs -= dtMs;
        if (session.remainingMs <= 0) {
          this.endSession(session, "timeout");
        }
      }
    }
  }

  dispatchTap(pos) {
    for (const session of this.sessions.slice().reverse()) {
      const handler = SkillRegistry[session.handlerId];
      if (!handler || !handler.onTap) {
        continue;
      }
      const handled = handler.onTap(this.createContext(handler, session.level, session), session, pos);
      if (handled) {
        return true;
      }
    }
    return false;
  }

  dispatchChainStart(pos) {
    for (const session of this.sessions.slice().reverse()) {
      const handler = SkillRegistry[session.handlerId];
      if (!handler || !handler.onChainStart) {
        continue;
      }
      if (handler.onChainStart(this.createContext(handler, session.level, session), session, pos)) {
        return true;
      }
    }
    return false;
  }

  dispatchDrag(pos) {
    for (const session of this.sessions.slice().reverse()) {
      const handler = SkillRegistry[session.handlerId];
      if (!handler || !handler.onDrag) {
        continue;
      }
      if (handler.onDrag(this.createContext(handler, session.level, session), session, pos)) {
        return true;
      }
    }
    return false;
  }

  dispatchPointerUp(pos) {
    for (const session of this.sessions.slice().reverse()) {
      const handler = SkillRegistry[session.handlerId];
      if (!handler || !handler.onPointerUp) {
        continue;
      }
      if (handler.onPointerUp(this.createContext(handler, session.level, session), session, pos)) {
        return true;
      }
    }
    return false;
  }

  dispatchChainCommit(chain) {
    for (const session of this.sessions.slice().reverse()) {
      const handler = SkillRegistry[session.handlerId];
      if (!handler || !handler.onChainCommit) {
        continue;
      }
      if (handler.onChainCommit(this.createContext(handler, session.level, session), session, chain)) {
        return true;
      }
    }
    return false;
  }

  augmentClear(request) {
    let nextRequest = request;
    for (const session of this.sessions.slice()) {
      const handler = SkillRegistry[session.handlerId];
      if (!handler || !handler.onAugmentClear) {
        continue;
      }
      nextRequest = handler.onAugmentClear(this.createContext(handler, session.level, session), session, nextRequest) || nextRequest;
    }
    return nextRequest;
  }

  dispatchSpawn(node) {
    let result = null;
    for (const session of this.sessions.slice()) {
      const handler = SkillRegistry[session.handlerId];
      if (!handler || !handler.onSpawn) {
        continue;
      }
      const nextResult = handler.onSpawn(this.createContext(handler, session.level, session), session, node);
      if (nextResult) {
        result = nextResult;
      }
    }
    return result;
  }
}

class ClearPipeline {
  constructor(game, board, runtime) {
    this.game = game;
    this.board = board;
    this.runtime = runtime;
  }

  markChainTargetsOccupied(targets) {
    targets.forEach((target) => {
      target.clearOccupying = true;
      target.clearOccupyX = target.x;
      target.clearOccupyY = target.y;
      target.inChain = true;
      target.vx = 0;
      target.vy = 0;
    });
  }

  prepareSequentialChainClear(prepared) {
    const interval = this.game.feverSystem.active ? 0.08 : 0.15;
    this.markChainTargetsOccupied(prepared.targets);
    const sequentialPrimaryTargets = Array.isArray(prepared.sequentialPrimaryTargets) && prepared.sequentialPrimaryTargets.length
      ? prepared.sequentialPrimaryTargets
      : prepared.targets;
    const sequentialSplashGroupsByTrigger = new Map();
    const splashSeen = new Set();
    const rawGroups = Array.isArray(prepared.sequentialSplashGroups) ? prepared.sequentialSplashGroups : [];
    for (const group of rawGroups) {
      if (!group || !group.triggerId || !Array.isArray(group.targets)) {
        continue;
      }
      const uniqueGroupTargets = [];
      for (const target of group.targets) {
        if (!target || target.dead || target.removing || splashSeen.has(target.id)) {
          continue;
        }
        splashSeen.add(target.id);
        uniqueGroupTargets.push(target);
      }
      if (uniqueGroupTargets.length) {
        sequentialSplashGroupsByTrigger.set(group.triggerId, uniqueGroupTargets);
      }
    }
    this.game.pendingClear = {
      ...prepared,
      applyLargeTsumCorrection: true,
      chainLength: prepared.targets.length,
      sequentialChain: true,
      chainStepInterval: interval,
      chainRemoveElapsed: 0,
      nextRemoveIndex: 0,
      largeTsumCompletedSteps: new Map(),
      largeTsumStartedSteps: new Map(),
      sequentialPrimaryTargets,
      sequentialSplashGroupsByTrigger
    };
    if (this.game.sequentialSplashClearDebug && prepared.source === "chain") {
      const groupSizes = Array.from(sequentialSplashGroupsByTrigger.values()).map((targets) => targets.length);
      console.log("[SEQUENTIAL SPLASH DEBUG] prepareSequentialChainClear", {
        primaryCount: sequentialPrimaryTargets.length,
        targetsCount: prepared.targets.length,
        groupCount: sequentialSplashGroupsByTrigger.size,
        groupSizes
      });
    }
    this.startNextSequentialChainTarget(this.game.pendingClear);
  }

  enqueueSequentialChainClear(prepared) {
    this.markChainTargetsOccupied(prepared.targets);
    this.game.pendingChainClearQueue.push({
      ...prepared,
      chainLength: prepared.targets.length
    });
  }

  startNextSequentialChainTarget(info) {
    const primaryTargets = Array.isArray(info.sequentialPrimaryTargets) && info.sequentialPrimaryTargets.length
      ? info.sequentialPrimaryTargets
      : info.targets;
    while (info.nextRemoveIndex < primaryTargets.length) {
      const target = primaryTargets[info.nextRemoveIndex];
      if (!target || target.dead || target.removing) {
        info.nextRemoveIndex += 1;
        continue;
      }
      if (target.isLarge) {
        if (!(info.largeTsumCompletedSteps instanceof Map)) {
          info.largeTsumCompletedSteps = new Map();
        }
        if (!(info.largeTsumStartedSteps instanceof Map)) {
          info.largeTsumStartedSteps = new Map();
        }
        const started = info.largeTsumStartedSteps.get(target.id) || 0;
        if (started > 0) {
          info.largeTsumCompletedSteps.set(
            target.id,
            Math.min(LARGE_TSUM_CLEAR_WEIGHT - 1, started)
          );
        }
        const nextStage = Math.min(
          LARGE_TSUM_CLEAR_WEIGHT,
          started + 1
        );
        info.largeTsumStartedSteps.set(target.id, nextStage);
        target.largeClearProgress = nextStage;
        target.bounce = 1;
        if (nextStage < LARGE_TSUM_CLEAR_WEIGHT) {
          this.game.spawnPopParticles(target.x, target.y, this.board.getResolvedType(target).color);
          return true;
        }
      }
      info.nextRemoveIndex += 1;
      target.beginRemove();
      const splashTargets = info.sequentialSplashGroupsByTrigger?.get(target.id) || [];
      if (this.game.sequentialSplashClearDebug) {
        console.log("[SEQUENTIAL SPLASH DEBUG] startNextSequentialChainTarget", {
          triggerId: target.id,
          splashCount: splashTargets.length
        });
      }
      for (const splashTarget of splashTargets) {
        if (!splashTarget || splashTarget.dead || splashTarget.removing) {
          continue;
        }
        splashTarget.beginRemove();
      }
      return true;
    }
    return false;
  }

  updateSequentialChainClear(info, dt) {
    if (!info || !info.sequentialChain) {
      return false;
    }
    const chainComplete = () => info.targets.every((target) => !target || target.dead);
    if (info.largeTsumStartedSteps instanceof Map && info.largeTsumCompletedSteps instanceof Map) {
      for (const [targetId, started] of info.largeTsumStartedSteps) {
        if (started < LARGE_TSUM_CLEAR_WEIGHT) {
          continue;
        }
        const target = info.targets.find((entry) => entry?.id === targetId);
        if (target?.dead) {
          info.largeTsumCompletedSteps.set(targetId, LARGE_TSUM_CLEAR_WEIGHT);
        }
      }
    }
    if (info.bombCancelPending) {
      info.bombCancelPending.timer -= dt;
      const bombCancelComplete = info.bombCancelPending.targets.every((target) => (
        !target ||
        target.dead ||
        !this.game.tsums.includes(target)
      ));
      const bombCancelTimedOut = info.bombCancelPending.timer <= -0.35;
      if (bombCancelComplete || bombCancelTimedOut) {
        this.finalize(info.bombCancelPending, { preserveActiveClear: true });
        info.bombCancelPending = null;
      }
    }
    const primaryTargets = Array.isArray(info.sequentialPrimaryTargets) && info.sequentialPrimaryTargets.length
      ? info.sequentialPrimaryTargets
      : info.targets;
    if (!info.bombCancelled && info.nextRemoveIndex < primaryTargets.length) {
      info.chainRemoveElapsed += dt;
      while (info.chainRemoveElapsed >= info.chainStepInterval && info.nextRemoveIndex < primaryTargets.length) {
        info.chainRemoveElapsed -= info.chainStepInterval;
        this.startNextSequentialChainTarget(info);
      }
    }
    if (!info.bombCancelPending && chainComplete()) {
      this.finalize(info);
    }
    return true;
  }

  cancelSequentialChainWithBomb(extraClearCount = 0, options = {}) {
    const info = this.game.pendingClear;
    if (!info || info.source !== "chain" || !info.sequentialChain) {
      return [];
    }
    const seen = new Set();
    const remaining = [];
    const collectTargets = (targets = []) => {
      const collected = [];
      for (const target of targets) {
        if (!target || target.dead || seen.has(target.id)) {
          continue;
        }
        seen.add(target.id);
        remaining.push(target);
        collected.push(target);
      }
      return collected;
    };
    collectTargets(info.targets);
    if (info.sequentialSplashGroupsByTrigger) {
      for (const splashTargets of info.sequentialSplashGroupsByTrigger.values()) {
        collectTargets(splashTargets);
      }
    }
    const queuedClears = this.game.pendingChainClearQueue.splice(0);
    info.additionalClearCount = Math.max(0, info.additionalClearCount || 0)
      + Math.max(0, extraClearCount || 0);
    if (options.coingainBombCount) {
      info.coingainBombCount = Math.max(0, options.coingainBombCount || 0);
    }
    info.bombCancelledTargets = remaining.slice();
    info.applyLargeTsumCorrection = true;
    for (const target of remaining) {
      target.clearOccupying = true;
      target.inChain = true;
      if (!target.removing) {
        target.beginRemove();
      }
    }
    const primaryTargets = Array.isArray(info.sequentialPrimaryTargets) && info.sequentialPrimaryTargets.length
      ? info.sequentialPrimaryTargets
      : info.targets;
    info.nextRemoveIndex = primaryTargets.length;
    info.chainRemoveElapsed = 0;
    info.bombCancelled = true;
    for (const queuedInfo of queuedClears) {
      const originalQueuedTargetCount = Array.isArray(queuedInfo.targets) ? queuedInfo.targets.length : 0;
      const queuedTargets = collectTargets(queuedInfo.targets);
      for (const target of queuedTargets) {
        target.clearOccupying = true;
        target.inChain = true;
        if (!target.removing) {
          target.beginRemove();
        }
      }
      if (!queuedTargets.length) {
        continue;
      }
      const queuedFinalizeInfo = {
        ...queuedInfo,
        targets: queuedTargets,
        chainLength: queuedTargets.length,
        applyLargeTsumCorrection: true,
        largeTsumCompletedSteps: new Map()
      };
      if (queuedTargets.length !== originalQueuedTargetCount) {
        delete queuedFinalizeInfo.effectiveClearCountOverride;
        delete queuedFinalizeInfo.clearCountOverride;
      }
      this.finalize(queuedFinalizeInfo, { preserveActiveClear: true });
    }
    return remaining;
  }

  buildPreparedClear(spec) {
    const request = {
      scoreMultiplier: 1,
      coinMultiplier: 1,
      chargeMultiplier: 1,
      allowBomb: spec.allowBomb !== false,
      timer: spec.timer ?? (spec.source === "chain" ? 0.18 : 0.16),
      ...spec
    };
    request.targets = this.uniqueTargets(request.targets || []);
    if (!request.targets.length) {
      return null;
    }
    let prepared = this.expandBubbleTargets(request);
    prepared = this.runtime.augmentClear(prepared);
    prepared.targets = this.uniqueTargets(prepared.targets || []);
    if (!prepared.targets.length) {
      return null;
    }
    return prepared;
  }

  uniqueTargets(targets) {
    const seen = new Set();
    const result = [];
    for (const target of targets) {
      if (!target || target.dead || target.removing || target.isBomb || seen.has(target.id)) {
        continue;
      }
      seen.add(target.id);
      result.push(target);
    }
    return result;
  }

  expandBubbleTargets(request) {
    const expanded = request.targets.slice();
    const seen = new Set(expanded.map((target) => target.id));
    const queue = request.targets.filter((target) => this.board.hasBubble(target));
    let bubbleBurst = false;
    let primaryBubbleEntry = null;
    while (queue.length) {
      const target = queue.shift();
      const bubbleEntry = this.board.getBubbleEntry(target);
      if (!bubbleEntry) {
        continue;
      }
      bubbleBurst = true;
      if (!primaryBubbleEntry) {
        primaryBubbleEntry = bubbleEntry;
      }
      this.board.removeBubble(target.id, bubbleEntry.bubbleId, bubbleEntry.sessionId);
      for (const tsum of this.game.tsums) {
        if (tsum.dead || tsum.removing || seen.has(tsum.id)) {
          continue;
        }
        if (distance(target.x, target.y, tsum.x, tsum.y) <= bubbleEntry.radius) {
          seen.add(tsum.id);
          expanded.push(tsum);
          if (this.board.hasBubble(tsum)) {
            queue.push(tsum);
          }
        }
      }
    }
    request.targets = expanded;
    if (bubbleBurst) {
      request.allowBomb = false;
      if (!request.correctionType && primaryBubbleEntry?.correctionType) {
        request.correctionType = primaryBubbleEntry.correctionType;
      }
      if (typeof request.chargeMultiplier !== "number" && typeof primaryBubbleEntry?.chargeMultiplier === "number") {
        request.chargeMultiplier = primaryBubbleEntry.chargeMultiplier;
      }
      if (typeof request.scoreMultiplier !== "number" && typeof primaryBubbleEntry?.scoreMultiplier === "number") {
        request.scoreMultiplier = primaryBubbleEntry.scoreMultiplier;
      }
    }
    return request;
  }

  beginClear(spec) {
    const prepared = this.buildPreparedClear(spec);
    if (!prepared) {
      return false;
    }

    if (prepared.source === "chain") {
      if (this.game.pendingClear?.sequentialChain) {
        this.enqueueSequentialChainClear(prepared);
        this.game.actionLock = true;
        return true;
      }
      this.game.actionLock = true;
      this.prepareSequentialChainClear(prepared);
      return true;
    }
    prepared.applyLargeTsumCorrection = prepared.applyLargeTsumCorrection !== false;
    this.game.actionLock = true;
    prepared.targets.forEach((target) => target.beginRemove());
    this.game.pendingClear = {
      ...prepared,
      chainLength: prepared.targets.length
    };
    return true;
  }

  finalize(info, options = {}) {
    const preserveActiveClear = !!options.preserveActiveClear;
    info.targets.forEach((tsum) => {
      if (!tsum) {
        return;
      }
      tsum.clearOccupying = false;
      tsum.clearOccupyX = null;
      tsum.clearOccupyY = null;
      tsum.inChain = false;
      if (tsum.dead) {
        tsum.removing = false;
      }
    });
    const removedIds = new Set(info.targets.map((tsum) => tsum.id));
    const physicalTsumCount = info.targets.length;
    const resolvedClearCount = calculateEffectiveClearCount(info);
    const clearedTypeCandidates = [];
    const seenClearedTypeIds = new Set();
    for (const target of info.targets) {
      const resolvedType = this.board.getResolvedType(target);
      if (resolvedType && !seenClearedTypeIds.has(resolvedType.id)) {
        seenClearedTypeIds.add(resolvedType.id);
        clearedTypeCandidates.push(resolvedType);
      }
    }
    const clearCenter = info.targets.length
      ? info.targets.reduce((acc, tsum) => {
        acc.x += tsum.x;
        acc.y += tsum.y;
        return acc;
      }, { x: 0, y: 0 })
      : { x: info.x || WIDTH * 0.5, y: info.y || FIELD_CENTER_Y };
    const clearDisplayX = info.targets.length ? clearCenter.x / info.targets.length : (info.x || WIDTH * 0.5);
    const clearDisplayY = info.targets.length ? clearCenter.y / info.targets.length : (info.y || FIELD_CENTER_Y);

    info.targets.forEach((tsum) => {
      this.game.spawnPopParticles(tsum.x, tsum.y, this.board.getResolvedType(tsum).color);
    });
    this.queueMyTsumSkillChargeFlights(info, { includeUndead: true });

    this.board.onNodesCleared(info.targets);
    this.game.tsums = this.game.tsums.filter((tsum) => !removedIds.has(tsum.id));
    if (info.coronationElsaIceTapDebug) {
      const remainingFrozen = [];
      for (const [nodeId, entries] of this.board.freezeLayer.entries()) {
        const freezeLayer = entries.filter((entry) => entry.freezeKind === "coronationElsa").length;
        if (!freezeLayer) {
          continue;
        }
        const node = this.board.getNodeById(nodeId);
        remainingFrozen.push({
          id: nodeId,
          x: node ? node.x : null,
          y: node ? node.y : null,
          freezeLayer,
          dead: !!node?.dead,
          removing: !!node?.removing
        });
      }
      console.log("[CORONATION ELSA TEMP DEBUG] ice tap after clear", {
        remainingCoronationFrozenCount: remainingFrozen.length,
        remainingFrozen
      });
      if (this.game?.strongestModeEnabled && this.game?.myTsum?.id === "coronationElsa") {
        this.game.strongestModeCoronationElsaPendingExtraFreezeTap = remainingFrozen.length > 0;
      }
    }
    this.game.totalCleared += resolvedClearCount;
    this.game.feverSystem.addClears(resolvedClearCount);

    let score = 0;
    let awardedRawCoins = 0;
    if (info.source === "chain") {
      const baseType = info.type || this.board.getResolvedType(info.targets[0]);
      score = this.game.calculateChainScore(baseType.score, resolvedClearCount);
      this.game.comboSystem.recordAction();
      score = Math.round(score * (info.scoreMultiplier || 1));
      this.game.addScore(score);
      this.game.addFloatingText(info.x, info.y - 20, `+${formatNumber(score)}`, "#ffffff", 14, 1.05);
      const chainCoins = this.game.getCoinsByClearCount(
        resolvedClearCount,
        this.game.myTsum.id,
        info.correctionType,
        info
      );
      this.game.coinBonus += chainCoins;
      awardedRawCoins = chainCoins;
    } else {
      score = this.game.calculateMixedClearScore(resolvedClearCount, info.targets);
      if (info.skillBonus) {
        score += info.skillBonus;
      }
      this.game.comboSystem.recordAction();
      score = Math.round(score * (info.scoreMultiplier || 1));
      this.game.addScore(score);
      this.game.addFloatingText(info.x, info.y - 18, `+${formatNumber(score)}`, "#ffffff", 12, 0.98);
      const skillCoins = this.game.getCoinsByClearCount(
        resolvedClearCount,
        this.game.myTsum.id,
        info.correctionType,
        info
      );
      this.game.coinBonus += skillCoins;
      awardedRawCoins = skillCoins;
    }
    if (info.coronationElsaIceTapDebug) {
      this.game.recordStrongestModeCoronationElsaIceTapActual?.({
        effectiveClearCount: resolvedClearCount,
        rawCoins: awardedRawCoins,
        prediction: info.coronationElsaPlannerPrediction || null
      });
      this.game.emitStrongestModeCoronationElsaSkillSummary("iceTap");
    }
    this.game.recordCoingainClear(info, resolvedClearCount);
    const bombType = this.game.resolveGeneratedBombType(resolvedClearCount, info);
    if (bombType) {
        const rawBombX = Number.isFinite(info.x) ? info.x : clearDisplayX;
        const rawBombY = Number.isFinite(info.y) ? info.y : clearDisplayY;
        const bombX = clamp(rawBombX, FIELD_LEFT + TSUM_RADIUS, FIELD_RIGHT - TSUM_RADIUS);
        const bombY = clamp(rawBombY, FIELD_TOP + TSUM_RADIUS, FIELD_BOTTOM - TSUM_RADIUS);
        const bomb = new Bomb(this.game, bombType, bombX, bombY, (this.game.random() - 0.5) * 4, -3);
        if (bombType === "moanaSpecial") {
          bomb.effectRadius = BOMB_BLAST_RADIUS * skillValue("guidingMoana", "specialBombRadiusMultiplier", this.game.selectedSkillLevel);
          bomb.correctionType = this.game.getActiveMoanaCorrectionType();
        }
        this.game.applyCoingainMiniScaleToBody(bomb);
        this.game.bombs.push(bomb);
    }

    this.game.queueNaturalLargeTsum({
      ...info,
      physicalTsumCount,
      effectiveClearCount: resolvedClearCount,
      clearedTypeCandidates
    });

    this.game.addFloatingText(clearDisplayX, clearDisplayY + 6, `${resolvedClearCount}`, "#fff4b8", 48, 1);

    // Note: coinMultiplier will be applied once at finishRun() to the total coinBonus
    // Do NOT apply it here with score-based calculation

    this.game.spawnReplacementTsums();
    if (!preserveActiveClear) {
      if (info.source === "chain" && this.game.pendingChainClearQueue.length) {
        const nextChain = this.game.pendingChainClearQueue.shift();
        this.prepareSequentialChainClear(nextChain);
        this.game.actionLock = true;
      } else {
        this.game.actionLock = false;
        this.game.pendingClear = null;
      }
    }
    if (typeof info.onFinalize === "function") {
      info.onFinalize(info);
    }
    this.game.flushPostChainCleanup();

    if (!preserveActiveClear && this.game.timeUp && !this.game.dragging && !this.game.actionLock) {
      this.game.finishRun();
    }
  }

  queueMyTsumSkillChargeFlights(info, options = {}) {
    if (!info || !Array.isArray(info.targets) || info.targets.length === 0) {
      return;
    }
    // A layered Coronation Elsa ice counts duplicate clears for score/coins,
    // but each physical Tsum may charge the MyTsum gauge only once.
    if (!info.skillFlightQueuedIds) {
      info.skillFlightQueuedIds = new Set();
    }
    const includeUndead = !!options.includeUndead;
    const chargeMultiplier = typeof info.chargeMultiplier === "number" ? info.chargeMultiplier : 1;
    const judyNickSession = this.game.getJudyNickSession?.();
    const judyNickChargeContext = {
      activeMode: judyNickSession?.data?.currentMode || null,
      suppressGaugeCharge: !!info.meta?.judyNickSuppressGaugeCharge
    };
    for (const tsum of info.targets) {
      if (!tsum || info.skillFlightQueuedIds.has(tsum.id)) {
        continue;
      }
      if (!includeUndead && !tsum.dead) {
        continue;
      }
      const resolvedType = this.board.getResolvedType(tsum);
      if (!this.game.isMyTsumTypeId(resolvedType.id)) {
        continue;
      }
      info.skillFlightQueuedIds.add(tsum.id);
      const judyNickGaugePayload = this.game.judyNickGaugeManager?.isJudyNickTsum?.(resolvedType.id)
        ? {
          typeId: resolvedType.id,
          chargeMultiplier,
          context: judyNickChargeContext
        }
        : null;
      const weightedChargeMultiplier = getTsumSkillChargeWeight(tsum, chargeMultiplier);
      if (judyNickGaugePayload) {
        judyNickGaugePayload.chargeMultiplier = weightedChargeMultiplier;
      }
      this.game.enqueueSkillChargeFlight(
        tsum.x,
        tsum.y,
        resolvedType,
        weightedChargeMultiplier,
        judyNickGaugePayload
      );
    }
  }
}

class InputRouter {
  constructor(game, board, runtime, clear) {
    this.game = game;
    this.board = board;
    this.runtime = runtime;
    this.clear = clear;
  }

  handleTap(pos) {
    const frozen = this.board.findFrozenGroupAt(pos);
    if (frozen) {
      const frozenEntry = this.board.getFrozenEntry(frozen);
      const isCoronationElsaFrozenTap = frozenEntry?.freezeKind === "coronationElsa";
      const coronationFrozenCountBeforeTap = isCoronationElsaFrozenTap
        ? this.board.getFrozenNodesByKind("coronationElsa").length
        : 0;
      const frozenInfo = this.board.getFrozenTapInfo(frozen);
      if (!frozenInfo || !frozenInfo.targets.length) {
        return false;
      }
      if (isCoronationElsaFrozenTap) {
        frozenInfo.coronationElsaPlannerPrediction = this.game.strongestModeCoronationElsaPendingTapPrediction || null;
        this.game.strongestModeCoronationElsaPendingTapPrediction = null;
        const coronationElsaIceTapLog = {
          coronationFrozenCountBeforeTap,
          collectedFrozenCount: frozenInfo.connectedFrozenCount ?? 0,
          targetsCount: frozenInfo.targetsCount ?? frozenInfo.targets.length,
          actualClearTargetsCount: frozenInfo.targets.length,
          pendingExtraFreezeTap: !!this.game.strongestModeCoronationElsaPendingExtraFreezeTap
        };
        this.game.pushCodexDebugLog("[CORONATION ELSA TEMP DEBUG] ice tap before clear", coronationElsaIceTapLog);
        this.game.logCodexCoronationPayload(
          "[CODEXLOG CORONATION ICE TAP BEFORE CLEAR]",
          coronationElsaIceTapLog
        );
        console.log("[CORONATION ELSA TEMP DEBUG] ice tap before clear", coronationElsaIceTapLog);
        this.game.recordStrongestModeCoronationElsaIceTapStats({
          frozenCountBeforeTap: coronationFrozenCountBeforeTap,
          collectedFrozenCount: frozenInfo.connectedFrozenCount ?? 0,
          actualClearTargetsCount: frozenInfo.targets.length
        });
      }
      if (this.game.coronationElsaDebug && frozenEntry?.freezeKind === "coronationElsa") {
        console.log("[CORONATION ELSA DEBUG] freeze tap clear", {
          boardAliveCount: getLiveTsums(this.game).length,
          connectedFrozenCount: frozenInfo.connectedFrozenCount ?? 0,
          splashNormalCount: frozenInfo.splashNormalCount ?? 0,
          targetsCount: frozenInfo.targetsCount ?? frozenInfo.targets.length,
          freezeLayerBonus: frozenInfo.freezeLayerBonus ?? 0,
          effectiveClearCount: calculateEffectiveClearCount(frozenInfo),
          actualClearTargetsCount: frozenInfo.targets.length,
          freezeLayerHistogramOfTappedGroup: frozenInfo.freezeLayerHistogramOfTappedGroup || {}
        });
      }
      const handled = this.clear.beginClear({
        source: "freeze",
        targets: frozenInfo.targets,
        x: pos.x,
        y: pos.y,
        allowBomb: false,
        type: frozenInfo.type || this.game.myTsum,
        correctionType: frozenInfo.correctionType,
        chargeMultiplier: frozenInfo.chargeMultiplier,
        scoreMultiplier: frozenInfo.scoreMultiplier,
        effectiveClearCountOverride: frozenInfo.effectiveClearCountOverride,
        additionalClearCount: frozenInfo.additionalClearCount,
        coronationElsaPlannerPrediction: frozenInfo.coronationElsaPlannerPrediction || null,
        coronationElsaIceTapDebug: isCoronationElsaFrozenTap
      });
      return handled;
    }

    const bubble = this.board.findBubbleAt(pos);
    if (bubble) {
      return this.clear.beginClear({
        source: "bubble",
        targets: [bubble.node],
        x: bubble.node.x,
        y: bubble.node.y,
        allowBomb: false,
        type: this.board.getResolvedType(bubble.node)
      });
    }

    return this.runtime.dispatchTap(pos);
  }

  handleChainStart(pos) {
    return this.runtime.dispatchChainStart(pos);
  }

  handleDrag(pos) {
    return this.runtime.dispatchDrag(pos);
  }

  handlePointerUp(pos) {
    return this.runtime.dispatchPointerUp(pos);
  }

  handleChainCommit(chain) {
    return this.runtime.dispatchChainCommit(chain);
  }
}

// --- BASE CLASSES LOADED ---
const strongestSkillStrategies = {
  coronationElsa(game, options = {}) {
    if (!game.getActiveSkillSession("coronationElsa")) {
      return null;
    }
    return game.findStrongestModeCoronationElsaPlannerChain();
  },
  jamilViper(game) {
    if (!game.getActiveSkillSession("jamilViper")) {
      return null;
    }
    return game.findStrongestModeBestChain({
      preferredRuleMode: "jamil",
      minLength: 3
    });
  },
  namine(game) {
    if (!game.getActiveSkillSession("namine")) {
      return null;
    }
    return game.findStrongestModeBestChain({
      requiredTypeIds: new Set(["namine", "namineSora"]),
      preferredRuleMode: "namine",
      minLength: 3
    });
  }
};

class Game {
  constructor(canvas, options = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.random = typeof options.rng === "function" ? options.rng : Math.random;
    this.largeTsumSpawnChance = Number.isFinite(options.largeTsumSpawnChance)
      ? clamp(options.largeTsumSpawnChance, 0, 1)
      : DEFAULT_LARGE_TSUM_SPAWN_CHANCE;
    this.role = options.role === "cpu" ? "cpu" : "player";
    this.inputEnabled = options.inputEnabled !== false;
    this.persistenceEnabled = options.persistenceEnabled !== false;
    this.managedLoop = !!options.managedLoop;
    this.onRunFinished = typeof options.onRunFinished === "function" ? options.onRunFinished : null;
    this.battleController = null;
    this.battleContext = null;
    this.battleStats = null;
    this.gameMode = "solo";
    this.battleDifficulty = "normal";
    this.runFinished = false;
    this.width = WIDTH;
    this.height = HEIGHT;
    this.state = "title";
    this.elapsed = 0;
    this.lastFrame = performance.now();
    this.physicsAccumulator = 0;

    this.backgroundOrbs = Array.from({ length: 16 }, () => ({
      x: rand(0, WIDTH),
      y: rand(0, HEIGHT),
      radius: rand(22, 78),
      speed: rand(3, 10),
      alpha: rand(0.1, 0.6),
      r: randInt(120, 255),
      g: randInt(140, 255),
      b: randInt(120, 255)
    }));

    const save = this.persistenceEnabled ? this.loadSave() : { coins: 0, plays: 0 };
    this.coins = save.coins;
    this.plays = save.plays;

    this.selectedMyTsumIndex = 0;
    this.selectedSkillLevel = 3;
    this.titleCharacterPage = 0;
    this.itemSelection = this.blankItemSelection();
    this.activeItems = this.blankItemSelection();

    this.ui = new UIRenderer(this);
    this.skillSystem = new SkillSystem(this);
    this.feverSystem = new FeverSystem(this);
    this.comboSystem = new ComboSystem(this);
    this.boardState = new BoardStateService(this);
    this.skillRuntime = new SkillRuntimeManager(this, this.boardState);
    this.clearPipeline = new ClearPipeline(this, this.boardState, this.skillRuntime);
    this.inputRouter = new InputRouter(this, this.boardState, this.skillRuntime, this.clearPipeline);

    this.tsums = [];
    this.bombs = [];
    this.pendingLargeTsumTypes = [];
    this.floatingTexts = [];
    this.shockwaves = [];
    this.centerMessages = [];

    this.dragging = false;
    this.dragPointer = { x: 0, y: 0 };
    this.chain = [];
    this.chainSet = new Set();
    this.chainTypeId = null;
    this.chainRule = null;
    this.strongestModeEnabled = false;
    this.strongestModeStepInterval = 0;
    this.strongestModeStepTimer = 0;
    this.strongestModeMaxChainsPerStep = 8;
    this.strongestModeJudyNickNickPendingFreezeTap = false;
    this.strongestModeJudyNickJudyPreferLowerChainOnce = false;
    this.strongestModeCoronationElsaFreezeTapDelayFrames = 10;
    this.strongestModeCoronationElsaNoChainFrames = 0;
    this.strongestModeCoronationElsaNoTraceDurationSec = 0;
    this.strongestModeCoronationElsaNoFreezeTargetWaitFrames = 0;
    this.strongestModeCoronationElsaNoFreezeTargetMaxWaitFrames = 10;
    this.strongestModeCoronationElsaEarlyFreezeTapWaitFrames = 0;
    this.strongestModeCoronationElsaEarlyFreezeTapMaxWaitFrames = 8;
    this.strongestModeCoronationElsaUnsafeFreezeTapWaitFrames = 0;
    this.strongestModeCoronationElsaUnsafeFreezeTapMaxWaitFrames = 8;
    this.strongestModeCoronationElsaMinPlayableNodesBeforeFreezeTap = 35;
    this.strongestModeCoronationElsaMinimumTraceCount = 4;
    this.strongestModeCoronationElsaMinFrozenBeforeLowPlayableTap = 25;
    this.strongestModeCoronationElsaSafePlayableYOffset = 80;
    this.strongestModeCoronationElsaStopLogged = false;
    this.strongestModeCoronationElsaAnchorSide = null;
    this.strongestModeCoronationElsaTracePlan = null;
    this.strongestModeCoronationElsaAfterChainDelay = 0.13;
    this.strongestModeCoronationElsaAfterChainTimer = 0;
    this.strongestModeCoronationElsaWaitRecentSpawnSettle = false;
    this.strongestModeCoronationElsaRecentSpawnLookbackSec = 0.5;
    this.strongestModeCoronationElsaNoRecentSpawnMinWaitSec = 0.36;
    this.strongestModeCoronationElsaNoRecentSpawnMaxWaitSec = 0.7;
    this.strongestModeCoronationElsaStableMinSpawnAgeSec = 0.18;
    this.strongestModeCoronationElsaStableVelocityThreshold = 0.1;
    this.strongestModeCoronationElsaSemiStableVelocityThreshold = 1.5;
    this.strongestModeCoronationElsaPracticalStableMinSpawnAgeSec = 0.3;
    this.strongestModeCoronationElsaPracticalStableVelocityThreshold = 1;
    this.strongestModeCoronationElsaRelaxedFallbackMaxAbsVy = 2.5;
    this.strongestModeCoronationElsaPendingExtraFreezeTap = false;
    this.strongestModeCoronationElsaSuppressRelaxedFallback = false;
    this.strongestModeCoronationElsaSuppressSpecialTapFrames = 0;
    this.strongestModeCoronationElsaSuppressSpecialTapMaxFrames = 4;
    this.strongestModeCoronationElsaLastChainStartElapsed = null;
    this.strongestModeCoronationElsaWaitStartElapsed = null;
    this.strongestModeCoronationElsaSkillSummary = null;
    this.strongestModeCoronationElsaLastTierSearchDiagnostics = null;
    this.strongestModeCoronationElsaLastSearchDiagnostics = null;
    this.strongestModeCoronationElsaPlannerProfileKey = null;
    this.strongestModeCoronationElsaPendingTapPrediction = null;
    this.aiAutoPlay = false;
    this.aiTrainingMode = false;
    this.aiLearningMode = false;
    this.aiFastTrainingMode = false;
    this.aiFastTrainingSpeed = 3;
    this.aiFastTrainingSimAccumulator = 0;
    this.aiLearningDebug = false;
    const debugQuery = typeof window !== "undefined"
      ? new URLSearchParams(window.location.search)
      : null;
    this.coronationElsaDebug = debugQuery?.get("coronationElsaDebug") === "1";
    this.judyNickDebug = debugQuery?.get("judyNickDebug") === "1";
    this.coingainDebug = debugQuery?.get("coingainDebug") === "1";
    this.liliaDebug = debugQuery?.get("liliaDebug") === "1";
    this.strongestModeJudyNickJudyBubbleDebugLastElapsed = -Infinity;
    this.strongestModeJudyNickJudyBubbleDebugLastKey = "";
    this.strongestAutoStartRequested = (
      this.coronationElsaDebug &&
      debugQuery?.get("strongestAutoStart") === "1"
    );
    if (this.coronationElsaDebug) {
      this.ensureCodexLogBuffer();
    }
    this.codexDebugOverlay = null;
    this.codexDebugOverlayLines = [];
    this.aiBombCancelDebug = false;
    this.aiBombCancelLastWindowKey = null;
    this.aiBombCancelLogSeq = 0;
    this.aiBombCancelAttemptClear = null;
    this.aiBombCancelAttemptBombId = null;
    this.aiLearningAutoRepeat = false;
    this.aiLearningRestartTimer = null;
    this.aiLearningMaxEpisodes = Infinity;
    this.aiLearningAutoRepeatStoppedLogged = false;
    this.aiAutoPlayInterval = 1;
    this.aiAutoPlayTimer = 0;
    this.aiChainAnimating = false;
    this.aiPendingChain = [];
    this.aiChainStepIndex = 0;
    this.aiChainStepTimer = 0;
    this.aiChainStepDelay = 0.1;
    this.aiChainFinishDelay = 0.2;
    this.aiChainFinishing = false;
    this.aiStrategyNames = ["longestChain", "bombFirst", "skillFirst", "fastClear"];
    this.aiCurrentStrategy = "skillFirst";
    this.aiRunIndex = 0;
    this.aiRunBombUses = 0;
    this.aiRunSkillUses = 0;
    this.aiRunMaxChain = 0;
    this.aiTrainingStorageKey = `${STORAGE_KEY}_ai_training_v1`;
    this.aiTrainingData = this.loadAiTrainingData();
    this.aiLearningObjective = "score";
    this.aiLearningStorageKey = `${STORAGE_KEY}_ai_learning_v1`;
    this.aiQTable = {};
    this.aiQTableMaxStates = 5000;
    this.aiEpisodeCount = 0;
    this.aiLastState = null;
    this.aiLastAction = null;
    this.aiLastSnapshot = null;
    this.aiLearningSkillDecisionEnabled = true;
    this.aiLearningCoronationElsaFreezeDecisionEnabled = false;
    this.aiLearningPendingSkillDecision = null;
    this.aiLearningPendingCoronationFreezeDecision = null;
    this.aiLearningEpisodeActions = this.createEmptyAiLearningActionCounts();
    this.aiLearningEpisodeSpecialTapStats = this.createEmptyAiLearningSpecialTapStats();
    this.aiLearningEpisodeRewardStart = 0;
    this.aiLearningStats = this.createDefaultAiLearningStats();
    this.aiLearningEpisodeSelectionCounts = { explore: 0, exploit: 0 };
    this.aiLearningDelayedBuffer = [];
    this.aiLearningDelayedBufferSize = 4;
    if (this.persistenceEnabled) {
      this.loadAiLearningData();
    }
    this.actionLock = false;
    this.pendingClear = null;
    this.pendingChainClearQueue = [];
    this.skillChargeFlights = [];
    this.tempLockTimer = 0;
    this.physicsAccumulator = 0;
    this.skillButtonFeedback = { mode: "idle", timer: 0, max: 0 };

    this.score = 0;
    this.displayedScore = 0;
    this.timeRemaining = 60;
    this.gameDuration = 60;
    this.timeUp = false;
    this.paused = false;
    this.fanCooldown = 0;
    this.fanPulse = 0;
    this.nextChainScoreMultiplier = 1;
    this.lastActionAt = 0;
    this.totalCleared = 0;
    this.coinBonus = 0;
    this.expBonus = 0;
    this.resultStats = {
      finalScore: 0,
      finalCoins: 0,
      coinMultiplier: 1,
      maxCombo: 0,
      feverCount: 0,
      exp: 0,
      totalCleared: 0,
      itemCost: 0,
      scoreBaseText: ""
    };

    this.myTsum = TSUM_TYPES[this.selectedMyTsumIndex];
    this.availableTypes = [];
    this.currentWeights = [];
    this.renderTsums = [];
    this.renderBodies = [];
    this.namineSkillTimer = 0;
    this.judyNickPreparedMode = "judy";
    this.judyNickGaugeManager = null;
    this.postChainCleanupSessionIds = [];
    this.manualDragPoint = null;
    this.manualDragPointerId = null;

    if (this.inputEnabled) {
      this.bindEvents();
    }
    this.skillSystem.configure(this.myTsum, this.selectedSkillLevel);
    // setup high-DPI canvas scaling
    this.updateCanvasSize();
    window.addEventListener('resize', () => this.updateCanvasSize());
    if (!this.managedLoop) {
      requestAnimationFrame((ts) => this.loop(ts));
    }
    if (this.role === "player") {
      this.startStrongestAutoStartIfRequested();
    }
  }

  blankItemSelection() {
    return {
      score: false,
      coin: false,
      exp: false,
      time: false,
      bomb: false,
      reduce: false,
      reduce3: false,
      combo: false
    };
  }

  normalizeItemSelection(selection = this.itemSelection) {
    if (!selection) {
      return this.blankItemSelection();
    }
    const normalized = { ...this.blankItemSelection(), ...selection };
    if (normalized.reduce3) {
      normalized.reduce = false;
    } else if (normalized.reduce) {
      normalized.reduce3 = false;
    }
    return normalized;
  }

  updateCanvasSize() {
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    const rect = this.canvas.getBoundingClientRect();
    // Determine CSS size (preserve aspect ratio WIDTH:HEIGHT)
    const cssWidth = rect.width || WIDTH;
    const cssHeight = rect.height && rect.height > 2 ? rect.height : cssWidth * (HEIGHT / WIDTH);
    // uniform scale from logical game size to CSS size
    const scale = cssWidth / WIDTH;
    // backing store size (physical pixels)
    this.canvas.width = Math.round(WIDTH * scale * dpr);
    this.canvas.height = Math.round(HEIGHT * scale * dpr);
    // ensure CSS size matches computed logical size
    this.canvas.style.width = Math.round(WIDTH * scale) + 'px';
    this.canvas.style.height = Math.round(HEIGHT * scale) + 'px';
    // map game logical coords (0..WIDTH, 0..HEIGHT) to device pixels
    this.ctx.setTransform(scale * dpr, 0, 0, scale * dpr, 0, 0);
  }

  bindEvents() {
    this.canvas.addEventListener("pointerdown", (event) => this.onPointerDown(event));
    this.canvas.addEventListener("pointermove", (event) => this.onPointerMove(event));
    this.canvas.addEventListener("pointerup", (event) => this.onPointerUp(event));
    this.canvas.addEventListener("pointercancel", (event) => this.onPointerUp(event));
    document.addEventListener("keydown", (event) => {
      if (event.code === "Space" || event.key === " ") {
        event.preventDefault();
        if (this.state === "playing" && !this.isCoingainInputLocked()) {
          this.attemptSkillActivation(true);
        }
      }
    });
  }

  loadSave() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        return { coins: 5000, plays: 0 };
      }
      const parsed = JSON.parse(raw);
      return {
        coins: Number.isFinite(parsed.coins) ? parsed.coins : 5000,
        plays: Number.isFinite(parsed.plays) ? parsed.plays : 0
      };
    } catch (error) {
      return { coins: 5000, plays: 0 };
    }
  }

  createDefaultAiTrainingData() {
    return {
      history: [],
      strategyStats: {},
      currentBatch: null
    };
  }

  createDefaultAiLearningStats() {
    return {
      episodes: 0,
      epsilonConfig: { start: 0.45, min: 0.05, decay: 0.997 },
      selectionTotals: { explore: 0, exploit: 0 },
      bestScore: 0,
      bestCoins: 0,
      scoreSum: 0,
      coinSum: 0,
      averageScore: 0,
      averageCoins: 0,
      totalReward: 0,
      averageReward: 0,
      lastEpisodeReward: 0,
      specialTapOpportunities: 0,
      specialTapUses: 0,
      specialTapSuccesses: 0,
      specialTapRewardSum: 0,
      averageRewardPerSpecialTapSuccess: 0,
      specialTapDeltaScoreSum: 0,
      specialTapDeltaCoinsSum: 0,
      specialTapDeltaClearedSum: 0,
      averageDeltaScorePerSpecialTapSuccess: 0,
      averageDeltaCoinsPerSpecialTapSuccess: 0,
      averageDeltaClearedPerSpecialTapSuccess: 0,
      exploreRewardSum: 0,
      exploitRewardSum: 0,
      exploreActionCount: 0,
      exploitActionCount: 0,
      averageExploreReward: 0,
      averageExploitReward: 0,
      recentExploitAdvantages: [],
      movingAverageExploitAdvantage: 0,
      actionCounts: this.createEmptyAiLearningActionCounts(),
      recentEpisodes: [],
      lastReward: 0,
      lastEpsilon: 0,
      qStateCount: 0,
      qActionCount: 0
    };
  }

  loadAiTrainingData() {
    try {
      const raw = localStorage.getItem(this.aiTrainingStorageKey);
      if (!raw) {
        return this.createDefaultAiTrainingData();
      }
      const parsed = JSON.parse(raw);
      return {
        history: Array.isArray(parsed.history) ? parsed.history : [],
        strategyStats: parsed.strategyStats && typeof parsed.strategyStats === "object" ? parsed.strategyStats : {},
        currentBatch: parsed.currentBatch && typeof parsed.currentBatch === "object" ? parsed.currentBatch : null
      };
    } catch (error) {
      return this.createDefaultAiTrainingData();
    }
  }

  saveAiTrainingData() {
    try {
      localStorage.setItem(this.aiTrainingStorageKey, JSON.stringify(this.aiTrainingData));
    } catch (error) {
      console.warn("[AI TRAINING] save failed", error);
    }
  }

  ensureAiStrategyStat(strategyName) {
    if (!this.aiTrainingData.strategyStats[strategyName]) {
      this.aiTrainingData.strategyStats[strategyName] = {
        plays: 0,
        scoreSum: 0,
        coinSum: 0
      };
    }
    return this.aiTrainingData.strategyStats[strategyName];
  }

  createAiTrainingBatch() {
    const recent = this.aiTrainingData.history.slice(-40);
    const scoreByStrategy = new Map();
    for (const row of recent) {
      if (!row || !this.aiStrategyNames.includes(row.strategy)) {
        continue;
      }
      if (!scoreByStrategy.has(row.strategy)) {
        scoreByStrategy.set(row.strategy, []);
      }
      scoreByStrategy.get(row.strategy).push(Number(row.score) || 0);
    }
    const averages = {};
    for (const strategy of this.aiStrategyNames) {
      const list = scoreByStrategy.get(strategy) || [];
      const avg = list.length ? list.reduce((sum, value) => sum + value, 0) / list.length : 0;
      averages[strategy] = avg;
    }
    const sorted = this.aiStrategyNames
      .slice()
      .sort((a, b) => averages[b] - averages[a]);
    const best = sorted[0] || "skillFirst";
    const second = sorted[1] || best;
    const others = this.aiStrategyNames.filter((name) => name !== best && name !== second);
    const sequence = [best, best, best, best, second, second, second, ...others];
    while (sequence.length < 10) {
      sequence.push(best);
    }
    return {
      sequence: sequence.slice(0, 10),
      index: 0,
      averages
    };
  }

  pickAiStrategyForNextRun() {
    if (!this.aiTrainingMode || !this.aiAutoPlay) {
      return this.aiCurrentStrategy;
    }
    if (!this.aiTrainingData.currentBatch || !Array.isArray(this.aiTrainingData.currentBatch.sequence) || this.aiTrainingData.currentBatch.sequence.length !== 10) {
      this.aiTrainingData.currentBatch = this.createAiTrainingBatch();
    }
    const batch = this.aiTrainingData.currentBatch;
    const strategy = batch.sequence[batch.index] || "skillFirst";
    batch.index += 1;
    if (batch.index >= 10) {
      batch.index = 0;
      this.aiTrainingData.currentBatch = this.createAiTrainingBatch();
    }
    this.aiCurrentStrategy = strategy;
    this.saveAiTrainingData();
    return strategy;
  }

  get aiLearningObjective() {
    return this._aiLearningObjective || "score";
  }

  set aiLearningObjective(objective) {
    this.setAiLearningObjective(objective);
  }

  getSelectedAiLearningTsumId() {
    return this.myTsum?.id || TSUM_TYPES[this.selectedMyTsumIndex]?.id || "unknown";
  }

  getAiLearningStorageKey() {
    if (this.aiLearningObjective === "coin") {
      return `${STORAGE_KEY}_ai_learning_coin_${this.getSelectedAiLearningTsumId()}_v1`;
    }
    return this.aiLearningStorageKey;
  }

  setAiLearningObjective(objective) {
    const nextObjective = objective === "coin" ? "coin" : "score";
    const currentObjective = this._aiLearningObjective || "score";
    if (currentObjective === nextObjective) {
      this._aiLearningObjective = nextObjective;
      return;
    }
    this._aiLearningObjective = nextObjective;
    if (!this.aiQTable || !this.aiLearningStats) {
      return;
    }
    this.aiQTable = {};
    this.aiEpisodeCount = 0;
    this.aiLearningStats = this.createDefaultAiLearningStats();
    this.aiLastState = null;
    this.aiLastAction = null;
    this.aiLastSnapshot = null;
    this.aiLearningPendingSkillDecision = null;
    this.aiLearningPendingCoronationFreezeDecision = null;
    this.aiLearningEpisodeActions = this.createEmptyAiLearningActionCounts();
    this.aiLearningEpisodeSpecialTapStats = this.createEmptyAiLearningSpecialTapStats();
    this.aiLearningEpisodeSelectionCounts = { explore: 0, exploit: 0 };
    this.loadAiLearningData();
  }

  loadAiLearningData() {
    try {
      const raw = localStorage.getItem(this.getAiLearningStorageKey());
      if (!raw) {
        return;
      }
      const parsed = JSON.parse(raw);
      this.aiQTable = this.normalizeAiQTable(parsed.qTable);
      this.aiEpisodeCount = Number.isFinite(parsed.episodeCount) ? Math.max(0, parsed.episodeCount) : 0;
      this.aiLearningStats = {
        ...this.aiLearningStats,
        ...this.normalizeAiLearningStats(parsed.stats)
      };
      this.aiLearningStats.episodes = Number.isFinite(this.aiLearningStats.episodes) ? this.aiLearningStats.episodes : this.aiEpisodeCount;
      this.aiLearningStats.averageScore = this.aiLearningStats.episodes > 0
        ? this.aiLearningStats.scoreSum / this.aiLearningStats.episodes
        : 0;
      this.aiLearningStats.averageCoins = this.aiLearningStats.episodes > 0
        ? (this.aiLearningStats.coinSum || 0) / this.aiLearningStats.episodes
        : 0;
      this.aiLearningStats.averageReward = this.aiLearningStats.episodes > 0
        ? (this.aiLearningStats.totalReward || 0) / this.aiLearningStats.episodes
        : 0;
      this.aiLearningStats.epsilonConfig = this.normalizeAiEpsilonConfig(this.aiLearningStats.epsilonConfig);
      this.aiLearningStats.selectionTotals = this.normalizeAiSelectionCounts(this.aiLearningStats.selectionTotals);
      this.aiLearningStats.actionCounts = this.normalizeAiActionCounts(this.aiLearningStats.actionCounts);
      this.aiLearningStats.recentEpisodes = Array.isArray(this.aiLearningStats.recentEpisodes)
        ? this.aiLearningStats.recentEpisodes.slice(-10)
        : [];
      this.aiLearningStats.qStateCount = Object.keys(this.aiQTable).length;
      this.aiLearningStats.qActionCount = this.countAiQTableActions();
      this.aiLearningEpisodeSelectionCounts = { explore: 0, exploit: 0 };
      this.aiLearningEpisodeSpecialTapStats = this.createEmptyAiLearningSpecialTapStats();
      this.pruneAiQTableIfNeeded();
    } catch (error) {
      console.warn("[AI LEARNING] load failed", error);
    }
  }

  normalizeAiQTable(rawTable) {
    if (!rawTable || typeof rawTable !== "object" || Array.isArray(rawTable)) {
      return {};
    }
    const table = {};
    for (const [stateKey, rawEntry] of Object.entries(rawTable)) {
      if (!stateKey || !rawEntry || typeof rawEntry !== "object" || Array.isArray(rawEntry)) {
        continue;
      }
      const actions = {};
      if (rawEntry.actions && typeof rawEntry.actions === "object" && !Array.isArray(rawEntry.actions)) {
        for (const [actionKey, value] of Object.entries(rawEntry.actions)) {
          if (actionKey && Number.isFinite(value)) {
            actions[actionKey] = value;
          }
        }
      }
      table[stateKey] = {
        actions,
        visits: Number.isFinite(rawEntry.visits) ? Math.max(0, rawEntry.visits) : 0,
        lastSeenEpisode: Number.isFinite(rawEntry.lastSeenEpisode) ? Math.max(0, rawEntry.lastSeenEpisode) : 0
      };
    }
    return table;
  }

  normalizeAiLearningStats(rawStats) {
    const stats = {};
    if (!rawStats || typeof rawStats !== "object" || Array.isArray(rawStats)) {
      return stats;
    }
    for (const key of [
      "episodes",
      "bestScore",
      "bestCoins",
      "scoreSum",
      "coinSum",
      "averageScore",
      "averageCoins",
      "totalReward",
      "averageReward",
      "lastEpisodeReward",
      "specialTapOpportunities",
      "specialTapUses",
      "specialTapSuccesses",
      "specialTapRewardSum",
      "averageRewardPerSpecialTapSuccess",
      "specialTapDeltaScoreSum",
      "specialTapDeltaCoinsSum",
      "specialTapDeltaClearedSum",
      "averageDeltaScorePerSpecialTapSuccess",
      "averageDeltaCoinsPerSpecialTapSuccess",
      "averageDeltaClearedPerSpecialTapSuccess",
      "exploreRewardSum",
      "exploitRewardSum",
      "exploreActionCount",
      "exploitActionCount",
      "averageExploreReward",
      "averageExploitReward",
      "movingAverageExploitAdvantage",
      "lastReward",
      "lastEpsilon",
      "qStateCount",
      "qActionCount"
    ]) {
      if (Number.isFinite(rawStats[key])) {
        stats[key] = rawStats[key];
      }
    }
    if (rawStats.epsilonConfig && typeof rawStats.epsilonConfig === "object" && !Array.isArray(rawStats.epsilonConfig)) {
      stats.epsilonConfig = this.normalizeAiEpsilonConfig(rawStats.epsilonConfig);
    }
    if (rawStats.selectionTotals && typeof rawStats.selectionTotals === "object" && !Array.isArray(rawStats.selectionTotals)) {
      stats.selectionTotals = this.normalizeAiSelectionCounts(rawStats.selectionTotals);
    }
    if (Array.isArray(rawStats.recentExploitAdvantages)) {
      stats.recentExploitAdvantages = rawStats.recentExploitAdvantages
        .filter((value) => Number.isFinite(value))
        .slice(-20);
    }
    if (rawStats.actionCounts && typeof rawStats.actionCounts === "object" && !Array.isArray(rawStats.actionCounts)) {
      stats.actionCounts = this.normalizeAiActionCounts(rawStats.actionCounts);
    }
    if (Array.isArray(rawStats.recentEpisodes)) {
      stats.recentEpisodes = rawStats.recentEpisodes
        .filter((row) => row && typeof row === "object")
        .slice(-10)
        .map((row) => ({
          episode: Number.isFinite(row.episode) ? Math.max(0, row.episode) : 0,
          score: Number.isFinite(row.score) ? row.score : 0,
          coins: Number.isFinite(row.coins) ? row.coins : 0,
          reward: Number.isFinite(row.reward) ? row.reward : 0,
          episodeReward: Number.isFinite(row.episodeReward) ? row.episodeReward : 0,
          epsilon: Number.isFinite(row.epsilon) ? row.epsilon : 0,
          exploreCount: Number.isFinite(row.exploreCount) ? Math.max(0, row.exploreCount) : 0,
          exploitCount: Number.isFinite(row.exploitCount) ? Math.max(0, row.exploitCount) : 0,
          qStates: Number.isFinite(row.qStates) ? Math.max(0, row.qStates) : 0,
          qActions: Number.isFinite(row.qActions) ? Math.max(0, row.qActions) : 0,
          specialTapOpportunities: Number.isFinite(row.specialTapOpportunities) ? Math.max(0, row.specialTapOpportunities) : 0,
          specialTapUses: Number.isFinite(row.specialTapUses) ? Math.max(0, row.specialTapUses) : 0,
          specialTapSuccesses: Number.isFinite(row.specialTapSuccesses) ? Math.max(0, row.specialTapSuccesses) : 0,
          specialTapRewardSum: Number.isFinite(row.specialTapRewardSum) ? row.specialTapRewardSum : 0,
          specialTapDeltaScoreSum: Number.isFinite(row.specialTapDeltaScoreSum) ? row.specialTapDeltaScoreSum : 0,
          specialTapDeltaCoinsSum: Number.isFinite(row.specialTapDeltaCoinsSum) ? row.specialTapDeltaCoinsSum : 0,
          specialTapDeltaClearedSum: Number.isFinite(row.specialTapDeltaClearedSum) ? row.specialTapDeltaClearedSum : 0,
          actions: this.normalizeAiActionCounts(row.actions),
          activeItemsSnapshot: this.normalizeAiActiveItemsSnapshot(row.activeItemsSnapshot)
        }));
    }
    return stats;
  }

  normalizeAiEpsilonConfig(rawConfig) {
    const base = { start: 0.45, min: 0.05, decay: 0.997 };
    if (!rawConfig || typeof rawConfig !== "object" || Array.isArray(rawConfig)) {
      return base;
    }
    const start = Number.isFinite(rawConfig.start) ? rawConfig.start : base.start;
    const min = Number.isFinite(rawConfig.min) ? rawConfig.min : base.min;
    const decay = Number.isFinite(rawConfig.decay) ? rawConfig.decay : base.decay;
    const clampedStart = Math.min(1, Math.max(0, start));
    const clampedMin = Math.min(1, Math.max(0, min));
    const clampedDecay = Math.min(1, Math.max(0.9, decay));
    return {
      start: Math.max(clampedStart, clampedMin),
      min: Math.min(clampedMin, clampedStart),
      decay: clampedDecay
    };
  }

  normalizeAiSelectionCounts(rawCounts) {
    const base = { explore: 0, exploit: 0 };
    if (!rawCounts || typeof rawCounts !== "object" || Array.isArray(rawCounts)) {
      return base;
    }
    return {
      explore: Number.isFinite(rawCounts.explore) ? Math.max(0, rawCounts.explore) : 0,
      exploit: Number.isFinite(rawCounts.exploit) ? Math.max(0, rawCounts.exploit) : 0
    };
  }

  createEmptyAiLearningActionCounts() {
    return {
      chain: 0,
      bomb: 0,
      skill: 0,
      specialTap: 0
    };
  }

  createEmptyAiLearningSpecialTapStats() {
    return {
      opportunities: 0,
      uses: 0,
      successes: 0,
      rewardSum: 0,
      deltaScoreSum: 0,
      deltaCoinsSum: 0,
      deltaClearedSum: 0
    };
  }

  recordSpecialTapDeltaFromSnapshots(before, after) {
    if (!before || !after) {
      return;
    }
    if (!this.aiLearningEpisodeSpecialTapStats || typeof this.aiLearningEpisodeSpecialTapStats !== "object") {
      this.aiLearningEpisodeSpecialTapStats = this.createEmptyAiLearningSpecialTapStats();
    }
    this.aiLearningEpisodeSpecialTapStats.deltaScoreSum = (this.aiLearningEpisodeSpecialTapStats.deltaScoreSum || 0) + (after.score - before.score);
    this.aiLearningEpisodeSpecialTapStats.deltaCoinsSum = (this.aiLearningEpisodeSpecialTapStats.deltaCoinsSum || 0) + (after.coins - before.coins);
    this.aiLearningEpisodeSpecialTapStats.deltaClearedSum = (this.aiLearningEpisodeSpecialTapStats.deltaClearedSum || 0) + (after.totalCleared - before.totalCleared);
  }

  recordAiLearningRewardBySelection(action, reward) {
    if (!action || !Number.isFinite(reward)) {
      return;
    }
    if (action.selectionMode === "explore") {
      this.aiLearningStats.exploreRewardSum = (this.aiLearningStats.exploreRewardSum || 0) + reward;
      this.aiLearningStats.exploreActionCount = (this.aiLearningStats.exploreActionCount || 0) + 1;
    } else if (action.selectionMode === "exploit") {
      this.aiLearningStats.exploitRewardSum = (this.aiLearningStats.exploitRewardSum || 0) + reward;
      this.aiLearningStats.exploitActionCount = (this.aiLearningStats.exploitActionCount || 0) + 1;
    }
    this.aiLearningStats.averageExploreReward = (this.aiLearningStats.exploreActionCount || 0) > 0
      ? this.aiLearningStats.exploreRewardSum / this.aiLearningStats.exploreActionCount
      : 0;
    this.aiLearningStats.averageExploitReward = (this.aiLearningStats.exploitActionCount || 0) > 0
      ? this.aiLearningStats.exploitRewardSum / this.aiLearningStats.exploitActionCount
      : 0;
  }

  normalizeAiActionCounts(rawCounts) {
    const base = this.createEmptyAiLearningActionCounts();
    if (!rawCounts || typeof rawCounts !== "object" || Array.isArray(rawCounts)) {
      return base;
    }
    for (const key of Object.keys(base)) {
      const value = rawCounts[key];
      base[key] = Number.isFinite(value) ? Math.max(0, value) : 0;
    }
    return base;
  }

  normalizeAiActiveItemsSnapshot(rawSnapshot) {
    const snapshot = this.blankItemSelection();
    if (!rawSnapshot || typeof rawSnapshot !== "object" || Array.isArray(rawSnapshot)) {
      return snapshot;
    }
    for (const key of Object.keys(snapshot)) {
      snapshot[key] = !!rawSnapshot[key];
    }
    return snapshot;
  }

  hasAnyActiveItem(rawSnapshot) {
    if (!rawSnapshot || typeof rawSnapshot !== "object" || Array.isArray(rawSnapshot)) {
      return false;
    }
    return Object.values(rawSnapshot).some((value) => !!value);
  }

  countAiQTableActions() {
    let actions = 0;
    for (const entry of Object.values(this.aiQTable)) {
      if (!entry || !entry.actions || typeof entry.actions !== "object") {
        continue;
      }
      actions += Object.keys(entry.actions).length;
    }
    return actions;
  }

  recordAiLearningAction(actionType, success) {
    if (!success) {
      return;
    }
    if (!this.aiLearningEpisodeActions || typeof this.aiLearningEpisodeActions !== "object") {
      this.aiLearningEpisodeActions = this.createEmptyAiLearningActionCounts();
    }
    if (!Object.prototype.hasOwnProperty.call(this.aiLearningEpisodeActions, actionType)) {
      return;
    }
    this.aiLearningEpisodeActions[actionType] += 1;
  }

  saveAiLearningData() {
    try {
      this.pruneAiQTableIfNeeded();
      // Backward-compatible guard: always persist newly added specialTap stats keys.
      this.aiLearningStats.specialTapRewardSum = Number.isFinite(this.aiLearningStats.specialTapRewardSum)
        ? this.aiLearningStats.specialTapRewardSum
        : 0;
      this.aiLearningStats.specialTapDeltaScoreSum = Number.isFinite(this.aiLearningStats.specialTapDeltaScoreSum)
        ? this.aiLearningStats.specialTapDeltaScoreSum
        : 0;
      this.aiLearningStats.specialTapDeltaCoinsSum = Number.isFinite(this.aiLearningStats.specialTapDeltaCoinsSum)
        ? this.aiLearningStats.specialTapDeltaCoinsSum
        : 0;
      this.aiLearningStats.specialTapDeltaClearedSum = Number.isFinite(this.aiLearningStats.specialTapDeltaClearedSum)
        ? this.aiLearningStats.specialTapDeltaClearedSum
        : 0;
      this.aiLearningStats.exploreRewardSum = Number.isFinite(this.aiLearningStats.exploreRewardSum)
        ? this.aiLearningStats.exploreRewardSum
        : 0;
      this.aiLearningStats.exploitRewardSum = Number.isFinite(this.aiLearningStats.exploitRewardSum)
        ? this.aiLearningStats.exploitRewardSum
        : 0;
      this.aiLearningStats.exploreActionCount = Number.isFinite(this.aiLearningStats.exploreActionCount)
        ? Math.max(0, this.aiLearningStats.exploreActionCount)
        : 0;
      this.aiLearningStats.exploitActionCount = Number.isFinite(this.aiLearningStats.exploitActionCount)
        ? Math.max(0, this.aiLearningStats.exploitActionCount)
        : 0;
      this.aiLearningStats.lastEpisodeReward = Number.isFinite(this.aiLearningStats.lastEpisodeReward)
        ? this.aiLearningStats.lastEpisodeReward
        : 0;
      const savedSpecialTapSuccesses = Number.isFinite(this.aiLearningStats.specialTapSuccesses)
        ? this.aiLearningStats.specialTapSuccesses
        : 0;
      this.aiLearningStats.averageRewardPerSpecialTapSuccess = savedSpecialTapSuccesses > 0
        ? this.aiLearningStats.specialTapRewardSum / savedSpecialTapSuccesses
        : 0;
      this.aiLearningStats.averageDeltaScorePerSpecialTapSuccess = savedSpecialTapSuccesses > 0
        ? this.aiLearningStats.specialTapDeltaScoreSum / savedSpecialTapSuccesses
        : 0;
      this.aiLearningStats.averageDeltaCoinsPerSpecialTapSuccess = savedSpecialTapSuccesses > 0
        ? this.aiLearningStats.specialTapDeltaCoinsSum / savedSpecialTapSuccesses
        : 0;
      this.aiLearningStats.averageDeltaClearedPerSpecialTapSuccess = savedSpecialTapSuccesses > 0
        ? this.aiLearningStats.specialTapDeltaClearedSum / savedSpecialTapSuccesses
        : 0;
      this.aiLearningStats.averageExploreReward = this.aiLearningStats.exploreActionCount > 0
        ? this.aiLearningStats.exploreRewardSum / this.aiLearningStats.exploreActionCount
        : 0;
      this.aiLearningStats.averageExploitReward = this.aiLearningStats.exploitActionCount > 0
        ? this.aiLearningStats.exploitRewardSum / this.aiLearningStats.exploitActionCount
        : 0;
      const recentExploitAdvantages = Array.isArray(this.aiLearningStats.recentExploitAdvantages)
        ? this.aiLearningStats.recentExploitAdvantages.filter((value) => Number.isFinite(value)).slice(-20)
        : [];
      this.aiLearningStats.recentExploitAdvantages = recentExploitAdvantages;
      this.aiLearningStats.movingAverageExploitAdvantage = recentExploitAdvantages.length > 0
        ? recentExploitAdvantages.reduce((sum, value) => sum + value, 0) / recentExploitAdvantages.length
        : 0;
      if (Array.isArray(this.aiLearningStats.recentEpisodes)) {
        this.aiLearningStats.recentEpisodes = this.aiLearningStats.recentEpisodes.map((entry) => ({
          ...entry,
          episodeReward: Number.isFinite(entry?.episodeReward) ? entry.episodeReward : 0,
          specialTapRewardSum: Number.isFinite(entry?.specialTapRewardSum) ? entry.specialTapRewardSum : 0,
          specialTapDeltaScoreSum: Number.isFinite(entry?.specialTapDeltaScoreSum) ? entry.specialTapDeltaScoreSum : 0,
          specialTapDeltaCoinsSum: Number.isFinite(entry?.specialTapDeltaCoinsSum) ? entry.specialTapDeltaCoinsSum : 0,
          specialTapDeltaClearedSum: Number.isFinite(entry?.specialTapDeltaClearedSum) ? entry.specialTapDeltaClearedSum : 0
        }));
      }
      localStorage.setItem(this.getAiLearningStorageKey(), JSON.stringify({
        qTable: this.aiQTable,
        episodeCount: this.aiEpisodeCount,
        stats: this.aiLearningStats
      }));
      this.debugAiLearning("[AI LEARNING] saved", {
        states: Object.keys(this.aiQTable).length,
        episodes: this.aiEpisodeCount
      });
    } catch (error) {
      console.warn("[AI LEARNING] save failed", error);
    }
  }

  debugAiLearning(...args) {
    if (this.aiLearningDebug) {
      console.log(...args);
    }
  }

  isAiBombCancelDebugEnabled() {
    return !!(this.aiBombCancelDebug || this.aiLearningDebug);
  }

  getAiBombCandidates() {
    return this.bombs.filter((bomb) => (
      bomb &&
      !bomb.dead &&
      !bomb.removing &&
      this.findBombAt(bomb.x, bomb.y) === bomb
    ));
  }

  getSequentialClearDebugState() {
    const info = this.pendingClear;
    return {
      hasPendingClear: !!info,
      source: info?.source || null,
      sequentialChain: !!info?.sequentialChain,
      bombCancelled: !!info?.bombCancelled,
      bombCancelPending: !!info?.bombCancelPending,
      nextRemoveIndex: info?.nextRemoveIndex ?? null,
      chainLength: info?.chainLength ?? (info?.targets ? info.targets.length : null),
      targetsRemaining: info?.targets
        ? info.targets.filter((target) => target && !target.dead).length
        : null,
      pendingBombTargets: info?.bombCancelPending?.targets
        ? info.bombCancelPending.targets.filter((target) => target && !target.dead).length
        : null,
      canBombCancel: this.canBombCancelActiveChain()
    };
  }

  describeAiBombTapFailure(bomb = null) {
    if (!bomb) {
      return "no-bomb-candidate";
    }
    if (bomb.dead) {
      return "bomb-dead";
    }
    if (bomb.removing) {
      return "bomb-removing";
    }
    if (this.findBombAt(bomb.x, bomb.y) !== bomb) {
      return "bomb-not-topmost-at-position";
    }
    if (this.actionLock && !this.canBombCancelActiveChain()) {
      return "action-lock-without-bomb-cancel-window";
    }
    return null;
  }

  logAiBombCancelDebug(event, payload = {}) {
    if (!this.aiAutoPlay || !this.isAiBombCancelDebugEnabled()) {
      return;
    }
    this.aiBombCancelLogSeq += 1;
    console.log("[AI BOMB CANCEL DEBUG]", {
      seq: this.aiBombCancelLogSeq,
      event,
      strategy: this.aiCurrentStrategy || null,
      timeRemaining: Math.round((this.timeRemaining || 0) * 100) / 100,
      actionLock: !!this.actionLock,
      dragging: !!this.dragging,
      aiChainAnimating: !!this.aiChainAnimating,
      ...payload
    });
  }

  logAiBombDecision(event, {
    actionType,
    reason,
    bombCandidates = null,
    selectedBomb = null,
    longestChain = null,
    fastChain = null,
    handleTapResult = "not-run",
    tapExecuted = false,
    explodeBombCalled = false,
    failureReason = null
  } = {}) {
    const candidates = bombCandidates || this.getAiBombCandidates();
    this.logAiBombCancelDebug(event, {
      actionType,
      bombCandidateCount: candidates.length,
      bombSelectionReason: reason,
      selectedBomb: selectedBomb ? {
        id: selectedBomb.id,
        type: selectedBomb.bombType || "normal",
        x: Math.round(selectedBomb.x),
        y: Math.round(selectedBomb.y)
      } : null,
      sequentialClear: this.getSequentialClearDebugState(),
      bombCancelPending: !!this.pendingClear?.bombCancelPending,
      handleTapResult,
      tapExecuted,
      explodeBombCalled,
      failureReason,
      longestChainLength: Array.isArray(longestChain) ? longestChain.length : null,
      fastChainLength: Array.isArray(fastChain) ? fastChain.length : null
    });
  }

  logBlockedAiBombCancelOpportunity(reason) {
    if (!this.aiAutoPlay || !this.isAiBombCancelDebugEnabled()) {
      return;
    }
    const sequentialClear = this.getSequentialClearDebugState();
    if (!sequentialClear.sequentialChain) {
      return;
    }
    const bombCandidates = this.getAiBombCandidates();
    if (!sequentialClear.bombCancelPending && bombCandidates.length === 0) {
      return;
    }
    const key = [
      reason,
      this.pendingClear?.source || "none",
      this.pendingClear?.chainLength ?? "n",
      sequentialClear.bombCancelled ? "cancelled" : "open",
      sequentialClear.bombCancelPending ? "pending" : "no-pending",
      bombCandidates.map((bomb) => bomb.id).join(",")
    ].join("|");
    if (this.aiBombCancelLastWindowKey === key) {
      return;
    }
    this.aiBombCancelLastWindowKey = key;
    const selectedBomb = bombCandidates[0] || null;
    this.logAiBombDecision("ai-step-blocked-during-sequential-clear", {
      actionType: "none",
      reason,
      bombCandidates,
      selectedBomb,
      handleTapResult: "not-run",
      tapExecuted: false,
      explodeBombCalled: false,
      failureReason: selectedBomb
        ? "ai-autoplay-step-returned-before-bomb-action"
        : "no-bomb-candidate-during-sequential-clear"
    });
  }

  tryAiBombCancelDuringSequentialClear() {
    const info = this.pendingClear;
    if (!info || info.source !== "chain" || !info.sequentialChain || info.bombCancelled || info.bombCancelPending) {
      this.aiBombCancelAttemptClear = null;
      this.aiBombCancelAttemptBombId = null;
      return false;
    }
    const bomb = this.findAiBombTarget();
    if (!bomb) {
      return false;
    }
    if (this.aiBombCancelAttemptClear !== info) {
      this.aiBombCancelAttemptClear = info;
      this.aiBombCancelAttemptBombId = null;
    }
    if (this.aiBombCancelAttemptBombId === bomb.id) {
      return false;
    }
    this.aiBombCancelAttemptBombId = bomb.id;
    const beforeBombCancelled = !!info.bombCancelled;
    const beforeBombCancelPending = !!info.bombCancelPending;
    this.explodeBomb(bomb);
    const afterInfo = this.pendingClear;
    const success = !!(
      bomb.dead ||
      afterInfo?.bombCancelled ||
      (!beforeBombCancelPending && afterInfo?.bombCancelPending) ||
      (!beforeBombCancelled && afterInfo?.bombCancelled)
    );
    this.logAiBombDecision("ai-bomb-cancel-attempt", {
      actionType: "bomb-cancel",
      reason: success ? "sequential-clear-bomb-cancel-attempted" : "sequential-clear-bomb-cancel-no-transition",
      bombCandidates: [bomb],
      selectedBomb: bomb,
      handleTapResult: "not-run-direct-explodeBomb",
      tapExecuted: false,
      explodeBombCalled: true,
      failureReason: success ? null : "explodeBomb-did-not-change-cancel-state"
    });
    return true;
  }

  shouldAiLearningAutoRepeat() {
    return !!(
      this.aiAutoPlay &&
      this.aiLearningMode &&
      this.aiLearningAutoRepeat &&
      this.aiEpisodeCount < this.aiLearningMaxEpisodes
    );
  }

  isAiFastTrainingActive() {
    return !!(this.aiFastTrainingMode && this.aiAutoPlay && this.aiLearningMode);
  }

  isAiFastTrainingSimulationActive() {
    return !!(this.isAiFastTrainingActive() && this.state === "playing" && !this.paused);
  }

  clearAiLearningRestartTimer(logStop = false) {
    if (!this.aiLearningRestartTimer) {
      return;
    }
    clearTimeout(this.aiLearningRestartTimer);
    this.aiLearningRestartTimer = null;
    if (logStop) {
      console.log("[AI LEARNING] auto repeat stopped");
    }
  }

  scheduleAiLearningNextEpisode() {
    if (this.aiLearningRestartTimer) {
      return;
    }
    if (!this.shouldAiLearningAutoRepeat()) {
      if (this.aiAutoPlay && this.aiLearningMode && this.aiLearningAutoRepeat && !this.aiLearningAutoRepeatStoppedLogged) {
        console.log("[AI LEARNING] auto repeat stopped");
        this.aiLearningAutoRepeatStoppedLogged = true;
      }
      return;
    }
    this.aiLearningAutoRepeatStoppedLogged = false;
    const restartDelayMs = this.isAiFastTrainingActive() ? 50 : 1200;
    this.aiLearningRestartTimer = setTimeout(() => {
      this.aiLearningRestartTimer = null;
      if (!this.shouldAiLearningAutoRepeat() || this.state !== "result") {
        console.log("[AI LEARNING] auto repeat stopped");
        return;
      }
      console.log("[AI LEARNING] next episode start");
      this.startGame();
    }, restartDelayMs);
    console.log("[AI LEARNING] next episode scheduled");
  }

  pruneAiQTableIfNeeded() {
    const entries = Object.entries(this.aiQTable);
    const maxStates = Math.max(1, this.aiQTableMaxStates || 5000);
    if (entries.length <= maxStates) {
      return;
    }
    const targetSize = Math.max(1, Math.floor(maxStates * 0.9));
    const sorted = entries.sort(([, a], [, b]) => {
      const visitDiff = (a.visits || 0) - (b.visits || 0);
      if (visitDiff !== 0) {
        return visitDiff;
      }
      return (a.lastSeenEpisode || 0) - (b.lastSeenEpisode || 0);
    });
    const removeCount = entries.length - targetSize;
    const removed = sorted.slice(0, removeCount).map(([key]) => key);
    removed.forEach((key) => { delete this.aiQTable[key]; });
    this.debugAiLearning("[AI LEARNING] pruned QTable", {
      before: entries.length,
      after: Object.keys(this.aiQTable).length
    });
    this.debugAiLearning("[AI LEARNING] pruned states", removed);
  }

  getAiLearningStateEntry(stateKey) {
    if (!this.aiQTable[stateKey]) {
      this.aiQTable[stateKey] = {
        actions: {},
        visits: 0,
        lastSeenEpisode: this.aiEpisodeCount
      };
    }
    const entry = this.aiQTable[stateKey];
    if (!entry.actions || typeof entry.actions !== "object") {
      entry.actions = {};
    }
    entry.visits = (entry.visits || 0) + 1;
    entry.lastSeenEpisode = this.aiEpisodeCount;
    return entry;
  }

  getAiLearningEpsilon() {
    const cfg = this.normalizeAiEpsilonConfig(this.aiLearningStats.epsilonConfig);
    this.aiLearningStats.epsilonConfig = cfg;
    const epsilon = Math.max(cfg.min, cfg.start * Math.pow(cfg.decay, this.aiEpisodeCount));
    this.aiLearningStats.lastEpsilon = epsilon;
    return epsilon;
  }

  bucketValue(value, thresholds) {
    for (let i = 0; i < thresholds.length; i += 1) {
      if (value <= thresholds[i]) {
        return i;
      }
    }
    return thresholds.length;
  }

  getAiLearningChainCandidates() {
    const best = this.findBestAiChain();
    const short = this.findFastClearChain();
    const candidates = [];
    if (best.length >= 3) {
      candidates.push({ key: "chain:best", type: "chain", chain: best });
    }
    if (short.length >= 3) {
      candidates.push({ key: "chain:short", type: "chain", chain: short });
    }
    const randomPool = [best, short].filter((chain) => chain.length >= 3);
    if (randomPool.length) {
      const chain = randomPool[Math.floor(Math.random() * randomPool.length)];
      candidates.push({ key: "chain:random", type: "chain", chain });
    }
    return candidates;
  }

  getAiLearningStateFeatures(chainCandidates = this.getAiLearningChainCandidates()) {
    const typeCounts = new Map();
    let myTsumCount = 0;
    for (const tsum of this.tsums) {
      if (tsum.dead || tsum.removing || !this.isTsumInPlayArea(tsum)) {
        continue;
      }
      const typeId = this.boardState.getResolvedType(tsum).id;
      typeCounts.set(typeId, (typeCounts.get(typeId) || 0) + 1);
      if (typeId === this.myTsum.id) {
        myTsumCount += 1;
      }
    }
    const chainLengths = chainCandidates
      .filter((candidate) => candidate.type === "chain")
      .map((candidate) => candidate.chain.length);
    const maxChain = chainLengths.length ? Math.max(...chainLengths) : 0;
    const avgChain = chainLengths.length
      ? chainLengths.reduce((sum, length) => sum + length, 0) / chainLengths.length
      : 0;
    const sortedCounts = [...typeCounts.values()]
      .sort((a, b) => b - a)
      .slice(0, 5)
      .map((count) => this.bucketValue(count, [3, 6, 10, 14]));
    const skillRatio = this.skillSystem.maxCharge > 0
      ? this.skillSystem.charge / this.skillSystem.maxCharge
      : 0;
    return {
      timeBucket: this.bucketValue(this.timeRemaining, [10, 30, 50]),
      scoreBucket: this.bucketValue(this.score, [10000, 50000, 150000, 400000]),
      coinBucket: this.bucketValue(this.coinBonus, [10, 50, 150]),
      fever: this.feverSystem.active ? 1 : 0,
      skillReady: this.skillSystem.ready ? 1 : 0,
      bombBucket: this.bucketValue(this.bombs.filter((bomb) => !bomb.dead).length, [0, 1, 3]),
      typePattern: sortedCounts.join(",") || "none",
      chainCandidateBucket: this.bucketValue(chainCandidates.length, [0, 1, 3, 6]),
      maxChainBucket: this.bucketValue(maxChain, [2, 5, 8, 12]),
      avgChainBucket: this.bucketValue(avgChain, [2, 4, 7, 10]),
      myTsumBucket: this.bucketValue(myTsumCount, [3, 6, 10, 14]),
      skillGaugeBucket: this.skillSystem.ready ? 4 : this.bucketValue(skillRatio, [0.25, 0.5, 0.75])
    };
  }

  buildAiLearningStateKey(chainCandidates = this.getAiLearningChainCandidates()) {
    const f = this.getAiLearningStateFeatures(chainCandidates);
    return [
      `t${f.timeBucket}`,
      `s${f.scoreBucket}`,
      `c${f.coinBucket}`,
      `f${f.fever}`,
      `sk${f.skillReady}`,
      `b${f.bombBucket}`,
      `types:${f.typePattern}`,
      `cc${f.chainCandidateBucket}`,
      `mc${f.maxChainBucket}`,
      `ac${f.avgChainBucket}`,
      `my${f.myTsumBucket}`,
      `g${f.skillGaugeBucket}`
    ].join("|");
  }

  getAiLearningSkillDecisionFeatures() {
    let myTsumCount = 0;
    for (const tsum of this.tsums) {
      if (tsum.dead || tsum.removing || !this.isTsumInPlayArea(tsum)) {
        continue;
      }
      if (this.isMyTsumTypeId(this.boardState.getResolvedType(tsum).id)) {
        myTsumCount += 1;
      }
    }
    return {
      timeBucket: this.bucketValue(this.timeRemaining, [10, 30]),
      fever: this.feverSystem.active ? 1 : 0,
      bombBucket: this.bucketValue(this.bombs.filter((bomb) => !bomb.dead).length, [0, 2]),
      myTsumBucket: this.bucketValue(myTsumCount, [5, 10]),
      skillReady: this.skillSystem.ready ? 1 : 0
    };
  }

  buildAiLearningSkillDecisionStateKey() {
    const f = this.getAiLearningSkillDecisionFeatures();
    return [
      "skillDecision",
      `t${f.timeBucket}`,
      `f${f.fever}`,
      `b${f.bombBucket}`,
      `my${f.myTsumBucket}`,
      `sk${f.skillReady}`
    ].join("|");
  }

  getAiLearningCoronationFreezeDecisionFeatures() {
    const frozenNodes = this.boardState.getFrozenNodesByKind("coronationElsa");
    const frozenCount = frozenNodes.length;
    let maxFreezeLayer = 0;
    for (const node of frozenNodes) {
      const layer = this.boardState.getFrozenEntriesByKind(node, "coronationElsa").length;
      if (layer > maxFreezeLayer) {
        maxFreezeLayer = layer;
      }
    }

    // Approximate connected group sizes by adjacency with the same rule used in coronation tap propagation.
    const byId = new Map(frozenNodes.map((node) => [node.id, node]));
    const seen = new Set();
    let maxConnectedGroupSize = 0;
    for (const node of frozenNodes) {
      if (!node || seen.has(node.id)) {
        continue;
      }
      const queue = [node];
      let size = 0;
      while (queue.length) {
        const current = queue.shift();
        if (!current || seen.has(current.id)) {
          continue;
        }
        seen.add(current.id);
        size += 1;
        for (const candidate of frozenNodes) {
          if (!candidate || seen.has(candidate.id) || candidate.id === current.id || !byId.has(candidate.id)) {
            continue;
          }
          const connectedDistance = Math.max(
            this.boardState.getEffectiveRadius(current) + this.boardState.getEffectiveRadius(candidate) + 3,
            CORONATION_ELSA_ICE_CONNECT_DISTANCE
          );
          if (distance(current.x, current.y, candidate.x, candidate.y) <= connectedDistance) {
            queue.push(candidate);
          }
        }
      }
      if (size > maxConnectedGroupSize) {
        maxConnectedGroupSize = size;
      }
    }

    return {
      timeBucket: this.bucketValue(this.timeRemaining, [10, 30, 50]),
      fever: this.feverSystem.active ? 1 : 0,
      frozenCountBucket: this.bucketValue(frozenCount, [3, 8, 15, 25]),
      maxGroupBucket: this.bucketValue(maxConnectedGroupSize, [2, 5, 10, 18]),
      maxLayerBucket: this.bucketValue(maxFreezeLayer, [1, 2, 3]),
      skillReady: this.skillSystem.ready ? 1 : 0
    };
  }

  buildAiLearningCoronationFreezeDecisionStateKey() {
    const f = this.getAiLearningCoronationFreezeDecisionFeatures();
    return [
      "coronationFreezeDecision",
      `t${f.timeBucket}`,
      `f${f.fever}`,
      `ice${f.frozenCountBucket}`,
      `grp${f.maxGroupBucket}`,
      `lay${f.maxLayerBucket}`,
      `sk${f.skillReady}`
    ].join("|");
  }

  selectAiLearningCoronationFreezeDecisionAction(stateKey) {
    const candidates = [
      { key: "tapFreeze", type: "coronationFreezeDecision" },
      { key: "waitFreeze", type: "coronationFreezeDecision" }
    ];
    const epsilon = this.getAiLearningEpsilon();
    const entry = this.getAiLearningStateEntry(stateKey);
    this.debugAiLearning("[AI LEARNING] coronation freeze decision candidates", candidates.map((candidate) => ({
      key: candidate.key,
      q: entry.actions[candidate.key] || 0
    })), { epsilon });
    if (Math.random() < epsilon) {
      const randomAction = candidates[Math.floor(Math.random() * candidates.length)];
      this.debugAiLearning("[AI LEARNING] coronation freeze decision selected", randomAction.key, "explore");
      return { ...randomAction, selectionMode: "explore" };
    }
    const tapQ = entry.actions.tapFreeze || 0;
    const waitQ = entry.actions.waitFreeze || 0;
    if (Math.abs(tapQ - waitQ) <= 1e-9) {
      const tied = candidates[Math.floor(Math.random() * candidates.length)];
      this.debugAiLearning("[AI LEARNING] coronation freeze decision selected", tied.key, "exploit-tie-break");
      return { ...tied, selectionMode: "exploit" };
    }
    const best = tapQ > waitQ ? candidates[0] : candidates[1];
    this.debugAiLearning("[AI LEARNING] coronation freeze decision selected", best.key, "exploit");
    return { ...best, selectionMode: "exploit" };
  }

  selectAiLearningSkillDecisionAction(stateKey) {
    const candidates = [
      { key: "useSkill", type: "skillDecision" },
      { key: "holdSkill", type: "skillDecision" }
    ];
    const epsilon = this.getAiLearningEpsilon();
    const entry = this.getAiLearningStateEntry(stateKey);
    this.debugAiLearning("[AI LEARNING] skill decision candidates", candidates.map((candidate) => ({
      key: candidate.key,
      q: entry.actions[candidate.key] || 0
    })), { epsilon });
    if (Math.random() < epsilon) {
      const randomAction = candidates[Math.floor(Math.random() * candidates.length)];
      this.debugAiLearning("[AI LEARNING] skill decision selected", randomAction.key, "explore");
      return { ...randomAction, selectionMode: "explore" };
    }
    const useQ = entry.actions.useSkill || 0;
    const holdQ = entry.actions.holdSkill || 0;
    if (Math.abs(useQ - holdQ) <= 1e-9) {
      const tied = candidates[Math.floor(Math.random() * candidates.length)];
      this.debugAiLearning("[AI LEARNING] skill decision selected", tied.key, "exploit-tie-break");
      return { ...tied, selectionMode: "exploit" };
    }
    const best = useQ > holdQ ? candidates[0] : candidates[1];
    this.debugAiLearning("[AI LEARNING] skill decision selected", best.key, "exploit");
    return { ...best, selectionMode: "exploit" };
  }

  getAiLearningActionCandidates(chainCandidates = this.getAiLearningChainCandidates(), options = {}) {
    const candidates = [...chainCandidates];
    const specialTarget = this.findAiSpecialTapTarget({
      excludeCoronationFreezeSpecialTap: !!options.excludeCoronationFreezeSpecialTap
    });
    if (specialTarget) {
      candidates.push({ key: "special:tap", type: "specialTap", specialTarget });
    }
    const bomb = this.findAiBombTarget();
    if (bomb) {
      candidates.push({ key: "bomb:first", type: "bomb", bomb });
    }
    if (this.skillSystem.ready && !options.excludeSkill) {
      candidates.push({ key: "skill", type: "skill" });
    }
    return candidates;
  }

  selectAiLearningAction(stateKey, candidates) {
    if (!candidates.length) {
      return { key: "invalid:none", type: "invalid" };
    }
    const skillSelectionBonus = 0.28;
    const bombSelectionBonus = 0.12;
    const tieTolerance = 1e-9;
    const epsilon = this.getAiLearningEpsilon();
    const entry = this.getAiLearningStateEntry(stateKey);
    const candidateQList = candidates.map((candidate) => ({
      key: candidate.key,
      q: entry.actions[candidate.key] || 0,
      adjustedQ: (entry.actions[candidate.key] || 0)
        + (candidate.type === "skill" && this.skillSystem.ready ? skillSelectionBonus : 0)
        + (candidate.type === "bomb" ? bombSelectionBonus : 0)
    }));
    this.debugAiLearning("[AI LEARNING] candidates", candidateQList, { epsilon });
    if (Math.random() < epsilon) {
      const randomAction = candidates[Math.floor(Math.random() * candidates.length)];
      this.aiLearningEpisodeSelectionCounts.explore += 1;
      this.debugAiLearning("[AI LEARNING] action selected", randomAction.key, "explore");
      return { ...randomAction, selectionMode: "explore" };
    }
    let bestQ = candidateQList[0].adjustedQ;
    let bestIndices = [0];
    let best = candidates[0];
    for (let i = 1; i < candidates.length; i += 1) {
      const q = candidateQList[i].adjustedQ;
      if (q > bestQ + tieTolerance) {
        best = candidates[i];
        bestQ = q;
        bestIndices = [i];
      } else if (Math.abs(q - bestQ) <= tieTolerance) {
        bestIndices.push(i);
      }
    }
    if (bestIndices.length > 1) {
      const pickedIndex = bestIndices[Math.floor(Math.random() * bestIndices.length)];
      best = candidates[pickedIndex];
      this.aiLearningEpisodeSelectionCounts.exploit += 1;
      this.debugAiLearning("[AI LEARNING] action selected", best.key, "exploit-tie-break", {
        adjustedQ: bestQ,
        tied: bestIndices.map((index) => candidates[index].key),
        candidateQList
      });
      return { ...best, selectionMode: "exploit" };
    }
    this.aiLearningEpisodeSelectionCounts.exploit += 1;
    this.debugAiLearning("[AI LEARNING] action selected", best.key, "exploit", { adjustedQ: bestQ, candidateQList });
    return { ...best, selectionMode: "exploit" };
  }

  captureAiLearningSnapshot() {
    return {
      score: this.score,
      coins: this.coinBonus,
      bombs: this.bombs.filter((bomb) => !bomb.dead).length,
      fever: this.feverSystem.active,
      feverGauge: this.feverSystem.gauge,
      combo: this.comboSystem.combo,
      comboTimer: this.comboSystem.timer,
      skillCharge: this.skillSystem.charge,
      skillReady: this.skillSystem.ready,
      totalCleared: this.totalCleared,
      timeRemaining: this.timeRemaining
    };
  }

  applyAiLearningDelayedReward(baseReward) {
    if (!Number.isFinite(baseReward) || !Array.isArray(this.aiLearningDelayedBuffer) || this.aiLearningDelayedBuffer.length === 0) {
      return;
    }
    const decayWeights = [0.35, 0.2, 0.1];
    const rewards = this.aiLearningDelayedBuffer.slice().reverse();
    for (let i = 0; i < rewards.length && i < decayWeights.length; i += 1) {
      const entry = rewards[i];
      if (!entry || !entry.stateKey || !entry.actionKey) {
        continue;
      }
      const delayedReward = baseReward * decayWeights[i];
      if (!Number.isFinite(delayedReward) || delayedReward === 0) {
        continue;
      }
      this.updateAiQValue(entry.stateKey, entry.actionKey, delayedReward, entry.nextStateKey || entry.stateKey);
      this.recordAiLearningRewardBySelection({ selectionMode: entry.selectionMode || null }, delayedReward);
    }
  }

  enqueueAiLearningDelayedTransition(stateKey, actionKey, nextStateKey, selectionMode = null) {
    if (!stateKey || !actionKey) {
      return;
    }
    if (!Array.isArray(this.aiLearningDelayedBuffer)) {
      this.aiLearningDelayedBuffer = [];
    }
    this.aiLearningDelayedBuffer.push({
      stateKey,
      actionKey,
      nextStateKey: nextStateKey || stateKey,
      selectionMode
    });
    const maxSize = Math.max(1, this.aiLearningDelayedBufferSize || 4);
    if (this.aiLearningDelayedBuffer.length > maxSize) {
      this.aiLearningDelayedBuffer = this.aiLearningDelayedBuffer.slice(-maxSize);
    }
  }

  calculateAiLearningReward(before, after, action) {
    if (!before || !after || !action) {
      return 0;
    }
    let reward = 0;
    if (this.aiLearningObjective === "coin") {
      reward += Math.max(0, after.coins - before.coins) * 2.0;
      reward += Math.max(0, after.score - before.score) / 50000;
      reward += Math.max(0, after.totalCleared - before.totalCleared) * 0.05;
      reward += Math.max(0, after.bombs - before.bombs) * 1.5;
      reward += Math.max(0, (after.feverGauge || 0) - (before.feverGauge || 0)) * 0.015;
      reward += Math.max(0, (after.combo || 0) - (before.combo || 0)) * 0.2;
      if (!before.fever && after.fever) {
        reward += 2;
      }
      if ((before.combo || 0) > 0 && (after.combo || 0) === 0 && !after.fever) {
        reward -= 0.4;
      }
      if (!(before.skillReady) && after.skillReady) {
        reward += 0.2;
      }
      if (before.skillReady && after.skillReady && !after.fever) {
        reward += 0.03;
      }
      if ((after.bombs || 0) > 0 && (after.bombs || 0) <= 2) {
        reward += 0.06;
      }
      if ((after.bombs || 0) >= 4) {
        reward -= 0.25 * ((after.bombs || 0) - 3);
      }
      if (action.type === "skill" && action.success) {
        reward += 3.2;
      }
      if (action.type === "bomb" && action.success) {
        reward += 0.35;
      }
      if (action.type === "chain" && action.chainLength >= 3) {
        reward += action.chainLength * 0.1;
      }
      if (action.type === "noop") {
        reward -= 1;
      }
      if (!action.success) {
        reward -= 5;
      }
      reward -= Math.max(0, before.timeRemaining - after.timeRemaining) * 0.15;
      return reward;
    }
    reward += Math.max(0, after.score - before.score) / 1000;
    reward += Math.max(0, after.coins - before.coins) * 0.5;
    reward += Math.max(0, after.totalCleared - before.totalCleared) * 0.2;
    reward += Math.max(0, after.bombs - before.bombs) * 3;
    reward += Math.max(0, (after.feverGauge || 0) - (before.feverGauge || 0)) * 0.04;
    reward += Math.max(0, (after.combo || 0) - (before.combo || 0)) * 0.45;
    if (!before.fever && after.fever) {
      reward += 8;
    }
    if ((before.combo || 0) > 0 && (after.combo || 0) === 0 && !after.fever) {
      reward -= 0.8;
    }
    if (!(before.skillReady) && after.skillReady) {
      reward += 0.5;
    }
    if (before.skillReady && after.skillReady && !after.fever) {
      reward += 0.07;
    }
    if ((after.bombs || 0) > 0 && (after.bombs || 0) <= 2) {
      reward += 0.12;
    }
    if ((after.bombs || 0) >= 4) {
      reward -= 0.5 * ((after.bombs || 0) - 3);
    }
    if (action.type === "skill" && action.success) {
      reward += 6.3;
    }
    if (action.type === "bomb" && action.success) {
      reward += 0.8;
    }
    if (action.type === "chain" && action.chainLength >= 3) {
      reward += action.chainLength;
    }
    if (action.type === "noop") {
      reward -= 1;
    }
    if (!action.success) {
      reward -= 5;
    }
    reward -= Math.max(0, before.timeRemaining - after.timeRemaining) * 0.1;
    return reward;
  }

  getMaxAiQValue(stateKey) {
    const entry = this.aiQTable[stateKey];
    if (!entry || !entry.actions) {
      return 0;
    }
    const values = Object.entries(entry.actions)
      .filter(([actionKey]) => !String(actionKey).startsWith("special:"))
      .map(([, value]) => value)
      .filter((value) => Number.isFinite(value));
    return values.length ? Math.max(...values) : 0;
  }

  updateAiQValue(stateKey, actionKey, reward, nextStateKey) {
    if (!stateKey || !actionKey) {
      return;
    }
    const alpha = 0.15;
    const gamma = 0.9;
    const entry = this.getAiLearningStateEntry(stateKey);
    const current = entry.actions[actionKey] || 0;
    const nextMax = this.getMaxAiQValue(nextStateKey);
    const updated = current + alpha * (reward + gamma * nextMax - current);
    entry.actions[actionKey] = updated;
    this.aiLearningStats.lastReward = reward;
    this.debugAiLearning("[AI LEARNING] q update", {
      stateKey,
      actionKey,
      reward,
      current,
      updated
    });
  }

  calculateAiLearningSkillDecisionReward(before, after, decision) {
    if (!before || !after || !decision) {
      return 0;
    }
    const baseReward = this.calculateAiLearningReward(before, after, {
      key: decision.actionKey,
      type: "skillDecision",
      success: true
    });
    let reward = baseReward * 0.25;
    const scoreDelta = Math.max(0, after.score - before.score);
    const coinDelta = Math.max(0, after.coins - before.coins);
    const clearedDelta = Math.max(0, after.totalCleared - before.totalCleared);
    const keptSkillReady = before.skillReady && after.skillReady;
    const lowOutcome = scoreDelta <= 0 && coinDelta <= 0 && clearedDelta <= 0;
    if (decision.actionKey === "holdSkill" && keptSkillReady && lowOutcome) {
      reward -= this.aiLearningObjective === "coin" ? 0.08 : 0.18;
    }
    if (decision.actionKey === "useSkill" && after.skillReady) {
      reward -= 0.12;
    }
    return reward;
  }

  finalizePendingAiLearningSkillDecision(nextStateKey = null) {
    const pending = this.aiLearningPendingSkillDecision;
    if (!pending || !pending.stateKey || !pending.actionKey || !pending.snapshot) {
      this.aiLearningPendingSkillDecision = null;
      return;
    }
    const after = this.captureAiLearningSnapshot();
    const resolvedNextState = nextStateKey || this.buildAiLearningSkillDecisionStateKey();
    const reward = this.calculateAiLearningSkillDecisionReward(pending.snapshot, after, pending);
    this.updateAiQValue(pending.stateKey, pending.actionKey, reward, resolvedNextState);
    this.recordAiLearningRewardBySelection({ selectionMode: pending.selectionMode || null }, reward);
    this.aiLearningStats.totalReward = (this.aiLearningStats.totalReward || 0) + reward;
    this.debugAiLearning("[AI LEARNING] skill decision reward", {
      action: pending.actionKey,
      reward
    });
    this.aiLearningPendingSkillDecision = null;
  }

  finalizePendingAiLearningCoronationFreezeDecision(nextStateKey = null) {
    const pending = this.aiLearningPendingCoronationFreezeDecision;
    if (!pending || !pending.stateKey || !pending.actionKey || !pending.snapshot) {
      this.aiLearningPendingCoronationFreezeDecision = null;
      return;
    }
    const after = this.captureAiLearningSnapshot();
    const resolvedNextState = nextStateKey || this.buildAiLearningCoronationFreezeDecisionStateKey();
    const baseReward = this.calculateAiLearningReward(pending.snapshot, after, {
      key: pending.actionKey,
      type: "coronationFreezeDecision",
      success: true
    });
    const reward = baseReward * 0.25;
    this.updateAiQValue(pending.stateKey, pending.actionKey, reward, resolvedNextState);
    this.recordAiLearningRewardBySelection({ selectionMode: pending.selectionMode || null }, reward);
    this.aiLearningStats.totalReward = (this.aiLearningStats.totalReward || 0) + reward;
    this.debugAiLearning("[AI LEARNING] coronation freeze decision reward", {
      action: pending.actionKey,
      reward
    });
    this.aiLearningPendingCoronationFreezeDecision = null;
  }

  finalizePendingAiLearningReward(nextStateKey = null) {
    if (!this.aiLastState || !this.aiLastAction || !this.aiLastSnapshot) {
      return;
    }
    const after = this.captureAiLearningSnapshot();
    const resolvedNextState = nextStateKey || this.buildAiLearningStateKey();
    const reward = this.calculateAiLearningReward(this.aiLastSnapshot, after, this.aiLastAction);
    this.updateAiQValue(this.aiLastState, this.aiLastAction.key, reward, resolvedNextState);
    this.applyAiLearningDelayedReward(reward);
    this.enqueueAiLearningDelayedTransition(
      this.aiLastState,
      this.aiLastAction.key,
      resolvedNextState,
      this.aiLastAction.selectionMode || null
    );
    this.aiLearningStats.totalReward = (this.aiLearningStats.totalReward || 0) + reward;
    this.recordAiLearningRewardBySelection(this.aiLastAction, reward);
    if (this.aiLastAction?.type === "specialTap" && this.aiLastAction?.success) {
      this.recordSpecialTapDeltaFromSnapshots(this.aiLastSnapshot, after);
      this.aiLearningEpisodeSpecialTapStats.rewardSum = (this.aiLearningEpisodeSpecialTapStats.rewardSum || 0) + reward;
    }
    this.debugAiLearning("[AI LEARNING] reward", {
      action: this.aiLastAction.key,
      reward
    });
    this.aiLastState = null;
    this.aiLastAction = null;
    this.aiLastSnapshot = null;
  }

  executeAiLearningAction(action) {
    if (!action) {
      return { key: "invalid:none", type: "invalid", success: false };
    }
    if (action.type === "chain") {
      const bombCandidates = this.getAiBombCandidates();
      if (bombCandidates.length > 0) {
        this.logAiBombDecision("ai-learning-action-selected", {
          actionType: "chain",
          reason: `learning-selected-${action.key || "chain"}`,
          bombCandidates,
          selectedBomb: bombCandidates[0],
          longestChain: action.chain || null,
          failureReason: "learning-chain-selected-before-bomb"
        });
      }
      const success = this.startAiChainAnimation(action.chain);
      this.recordAiLearningAction("chain", success);
      return {
        key: action.key,
        type: "chain",
        success,
        chainLength: action.chain ? action.chain.length : 0
      };
    }
    if (action.type === "bomb") {
      const bombCandidates = this.getAiBombCandidates();
      if (!action.bomb || action.bomb.dead) {
        this.logAiBombDecision("ai-learning-bomb-selection-failed", {
          actionType: "bomb",
          reason: `learning-selected-${action.key || "bomb"}-but-target-invalid`,
          bombCandidates,
          selectedBomb: action.bomb || bombCandidates[0] || null,
          handleTapResult: "not-run",
          tapExecuted: false,
          explodeBombCalled: false,
          failureReason: this.describeAiBombTapFailure(action.bomb || bombCandidates[0] || null)
        });
        return { key: action.key, type: "bomb", success: false };
      }
      this.logAiBombDecision("ai-learning-action-selected", {
        actionType: "bomb",
        reason: `learning-selected-${action.key || "bomb"}`,
        bombCandidates,
        selectedBomb: action.bomb,
        handleTapResult: "not-run-direct-explodeBomb",
        tapExecuted: false,
        explodeBombCalled: true
      });
      this.explodeBomb(action.bomb);
      this.aiRunBombUses += 1;
      this.recordAiLearningAction("bomb", true);
      return { key: action.key, type: "bomb", success: true };
    }
    if (action.type === "skill") {
      const success = this.attemptSkillActivation(false);
      if (success) {
        this.aiRunSkillUses += 1;
      }
      this.recordAiLearningAction("skill", success);
      return { key: action.key, type: "skill", success };
    }
    if (action.type === "specialTap") {
      const result = this.tryAiSpecialTap(null, action.specialTarget || null);
      this.recordAiLearningAction("specialTap", result.success);
      return {
        ...result,
        key: action.key || result.key || "special:tap",
        type: "specialTap"
      };
    }
    return { key: action.key || "invalid:unknown", type: "invalid", success: false };
  }

  // Persist minimal progress (coins, plays)
  saveProgress() {
    if (!this.persistenceEnabled) {
      return;
    }
    try {
      const payload = {
        coins: Number.isFinite(this.coins) ? this.coins : 0,
        plays: Number.isFinite(this.plays) ? this.plays : 0
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch (err) {
      // don't let storage errors break the game
      console.warn('saveProgress failed', err);
    }
  }

  // Compatibility convenience: load progress into instance state
  loadProgress() {
    const s = this.loadSave ? this.loadSave() : { coins: 0, plays: 0 };
    this.coins = Number.isFinite(s.coins) ? s.coins : 0;
    this.plays = Number.isFinite(s.plays) ? s.plays : 0;
    return s;
  }

  // Reset minimal game state (used by menu flows)
  resetGame() {
    this.itemSelection = this.blankItemSelection();
    this.activeItems = this.blankItemSelection();
    this.score = 0;
    this.displayedScore = 0;
    this.timeRemaining = 60;
    this.state = "title";
    this.tsums = [];
    this.bombs = [];
    this.pendingLargeTsumTypes = [];
    this.floatingTexts = [];
    this.shockwaves = [];
    this.centerMessages = [];
    this.dragging = false;
    this.chain = [];
    this.chainSet = new Set();
    this.chainRule = null;
    this.aiAutoPlayTimer = 0;
    this.resetAiChainAnimationState();
    this.aiLastState = null;
    this.aiLastAction = null;
    this.aiLastSnapshot = null;
    this.aiLearningPendingSkillDecision = null;
    this.aiLearningPendingCoronationFreezeDecision = null;
    this.aiLearningEpisodeActions = this.createEmptyAiLearningActionCounts();
    this.aiLearningEpisodeSpecialTapStats = this.createEmptyAiLearningSpecialTapStats();
    this.actionLock = false;
    this.pendingClear = null;
    this.pendingChainClearQueue = [];
    this.postChainCleanupSessionIds = [];
  }

  // Update stored high score meta (defensive)
  updateHighScore() {
    if (!this.persistenceEnabled) {
      return;
    }
    try {
      const metaKey = STORAGE_KEY + "_meta";
      const raw = localStorage.getItem(metaKey);
      const meta = raw ? JSON.parse(raw) : {};
      meta.highScore = Math.max(meta.highScore || 0, this.score || 0);
      localStorage.setItem(metaKey, JSON.stringify(meta));
    } catch (err) {
      console.warn('updateHighScore failed', err);
    }
  }


  render() {
    this.ctx.clearRect(0, 0, this.width, this.height);
    this.ui.render(this.ctx);
  }

  tick(dt, shouldRender = true) {
    if (this.isAiFastTrainingSimulationActive()) {
      const maxSubsteps = 8;
      const speed = Math.max(1, this.aiFastTrainingSpeed || 1);
      this.aiFastTrainingSimAccumulator = Math.min(
        this.aiFastTrainingSimAccumulator + dt * speed,
        FIXED_STEP * maxSubsteps
      );
      let substeps = 0;
      while (
        this.aiFastTrainingSimAccumulator >= FIXED_STEP &&
        substeps < maxSubsteps &&
        this.isAiFastTrainingSimulationActive()
      ) {
        this.update(FIXED_STEP);
        this.aiFastTrainingSimAccumulator -= FIXED_STEP;
        substeps += 1;
      }
    } else {
      this.aiFastTrainingSimAccumulator = 0;
      this.update(dt);
    }
    if (shouldRender) {
      this.render();
    }
  }

  loop(timestamp) {
    const dt = Math.min((timestamp - this.lastFrame) / 1000, 0.05);
    this.lastFrame = timestamp;
    this.tick(dt, true);
    requestAnimationFrame((ts) => this.loop(ts));
  }

// (skill helpers moved to the end of the file)

  getPointerPosition(event, rect = null) {
    const canvasRect = rect || this.canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - canvasRect.left) / canvasRect.width) * this.width,
      y: ((event.clientY - canvasRect.top) / canvasRect.height) * this.height
    };
  }

  disableAiModesForStrongestMode() {
    this.aiAutoPlay = false;
    this.aiLearningMode = false;
    this.aiLearningAutoRepeat = false;
    this.aiTrainingMode = false;
    this.aiFastTrainingMode = false;
    this.cancelAiChainAnimation();
    this.clearAiLearningRestartTimer(true);
    this.aiLearningPendingSkillDecision = null;
    this.aiLearningPendingCoronationFreezeDecision = null;
    this.aiFastTrainingSimAccumulator = 0;
  }

  disableStrongestModeForAi() {
    this.strongestModeEnabled = false;
    this.strongestModeCoronationElsaNoFreezeTargetWaitFrames = 0;
    this.strongestModeCoronationElsaEarlyFreezeTapWaitFrames = 0;
    this.strongestModeCoronationElsaUnsafeFreezeTapWaitFrames = 0;
    this.resetStrongestModeCoronationElsaTracePlan();
  }

  startStrongestAutoStartIfRequested() {
    if (!this.strongestAutoStartRequested || !this.coronationElsaDebug) {
      return;
    }
    this.strongestAutoStartRequested = false;
    const coronationElsaIndex = TSUM_TYPES.findIndex((type) => type.id === "coronationElsa");
    if (coronationElsaIndex >= 0) {
      this.selectedMyTsumIndex = coronationElsaIndex;
      this.myTsum = TSUM_TYPES[coronationElsaIndex];
      this.skillSystem.configure(this.myTsum, this.selectedSkillLevel);
    }
    this.itemSelection = this.blankItemSelection();
    this.disableAiModesForStrongestMode();
    this.strongestModeEnabled = true;
    if (this.state !== "playing") {
      this.startGame({ skipProgressSave: true });
      this.disableAiModesForStrongestMode();
      this.strongestModeEnabled = true;
    }
    this.logCodexCoronationPayload("[CODEXLOG STRONGEST AUTOSTART]", {
      enabled: this.strongestModeEnabled,
      state: this.state,
      myTsumId: this.myTsum?.id || null,
      coronationElsaDebug: this.coronationElsaDebug,
      aiAutoPlay: this.aiAutoPlay,
      aiLearningMode: this.aiLearningMode,
      aiLearningAutoRepeat: this.aiLearningAutoRepeat,
      aiTrainingMode: this.aiTrainingMode,
      aiFastTrainingMode: this.aiFastTrainingMode
    });
  }

  onPointerDown(event) {
    if (!this.inputEnabled) {
      return;
    }
    const pos = this.getPointerPosition(event);
    this.dragPointer = pos;
    if (!this.dragging) {
      this.manualDragPoint = pos;
      this.manualDragPointerId = event.pointerId;
    }
    if (this.canvas.setPointerCapture) {
      try {
        this.canvas.setPointerCapture(event.pointerId);
      } catch (error) {
      }
    }

    if (this.state === "title") {
      this.handleTitlePointer(pos);
      return;
    }
    if (this.state === "items") {
      this.handleItemsPointer(pos);
      return;
    }
    if (this.state === "result") {
      this.handleResultPointer(pos);
      return;
    }
    if (this.state !== "playing") {
      return;
    }
    if (rectContains(PAUSE_BUTTON_RECT, pos.x, pos.y)) {
      this.togglePause();
      return;
    }
    if (this.paused) {
      return;
    }
    if (rectContains(SELECT_TSUM_BUTTON_RECT, pos.x, pos.y)) {
      if (this.battleController?.active) {
        this.battleController.abortBattle();
      }
      this.itemSelection = this.blankItemSelection();
      this.state = "title";
      return;
    }
    if (rectContains(DECOR_BUTTON_RECT, pos.x, pos.y)) {
      this.triggerFan();
      return;
    }
    if (!this.battleContext?.active && rectContains(AI_AUTO_BUTTON_RECT, pos.x, pos.y)) {
      this.aiAutoPlay = !this.aiAutoPlay;
      if (this.aiAutoPlay) {
        this.disableStrongestModeForAi();
      } else {
        this.cancelAiChainAnimation();
        this.clearAiLearningRestartTimer(true);
        this.aiLearningPendingSkillDecision = null;
        this.aiLearningPendingCoronationFreezeDecision = null;
      }
      this.noteAction();
      console.log(`[AI] auto play ${this.aiAutoPlay ? "ON" : "OFF"}`);
      return;
    }
    if (!this.battleContext?.active && rectContains(STRONGEST_MODE_BUTTON_RECT, pos.x, pos.y)) {
      this.strongestModeEnabled = !this.strongestModeEnabled;
      if (this.strongestModeEnabled) {
        this.disableAiModesForStrongestMode();
      } else {
        this.strongestModeCoronationElsaNoFreezeTargetWaitFrames = 0;
        this.strongestModeCoronationElsaEarlyFreezeTapWaitFrames = 0;
        this.strongestModeCoronationElsaUnsafeFreezeTapWaitFrames = 0;
        this.resetStrongestModeCoronationElsaTracePlan();
      }
      this.noteAction();
      return;
    }
    if (!this.battleContext?.active && rectContains(AI_LEARNING_BUTTON_RECT, pos.x, pos.y)) {
      this.aiLearningMode = !this.aiLearningMode;
      this.aiLastState = null;
      this.aiLastAction = null;
      this.aiLastSnapshot = null;
      this.aiLearningPendingSkillDecision = null;
      this.aiLearningPendingCoronationFreezeDecision = null;
      this.aiLearningDelayedBuffer = [];
      if (this.aiLearningMode) {
        this.disableStrongestModeForAi();
      } else {
        this.clearAiLearningRestartTimer(true);
      }
      this.noteAction();
      console.log(`[AI LEARNING] ${this.aiLearningMode ? "ON" : "OFF"}`);
      return;
    }
    if (!this.battleContext?.active && rectContains(AI_LEARNING_REPEAT_BUTTON_RECT, pos.x, pos.y)) {
      this.aiLearningAutoRepeat = !this.aiLearningAutoRepeat;
      if (this.aiLearningAutoRepeat) {
        this.disableStrongestModeForAi();
      } else {
        this.clearAiLearningRestartTimer(true);
      }
      this.noteAction();
      console.log(`[AI LEARNING] auto repeat ${this.aiLearningAutoRepeat ? "ON" : "OFF"}`);
      return;
    }
    if (this.timeUp && !this.dragging) {
      return;
    }
    if (this.isCoingainInputLocked()) {
      this.cancelActiveInputForCoingainLock();
      return;
    }
    if (!this.actionLock && pointInCircle(SKILL_BUTTON_RECT.x + SKILL_BUTTON_RECT.w * 0.5, SKILL_BUTTON_RECT.y + SKILL_BUTTON_RECT.h * 0.5, SKILL_BUTTON_RECT.w * 0.5, pos.x, pos.y)) {
      this.noteAction();
      this.attemptSkillActivation(false);
      return;
    }
    if (!this.actionLock && this.inputRouter.handleTap(pos)) {
      this.noteAction();
      return;
    }
    if (this.actionLock && this.canBombCancelActiveChain()) {
      const activeBomb = this.findBombAt(pos.x, pos.y);
      if (activeBomb) {
        this.explodeBomb(activeBomb);
        return;
      }
    }
    if (this.actionLock && !this.canQueueChainDuringActiveClear()) {
      return;
    }
    const bomb = this.findBombAt(pos.x, pos.y);
    if (bomb) {
      this.explodeBomb(bomb);
      return;
    }
    if (this.inputRouter.handleChainStart(pos)) {
      this.noteAction();
      return;
    }
    const tsum = this.findTsumAt(pos.x, pos.y);
    if (tsum) {
      this.startChain(tsum, pos);
    }
  }

  canQueueChainDuringActiveClear() {
    return !!(
      this.actionLock &&
      this.pendingClear &&
      this.pendingClear.sequentialChain &&
      this.pendingClear.source === "chain"
    );
  }

  canBombCancelActiveChain() {
    return !!(
      this.pendingClear &&
      this.pendingClear.sequentialChain &&
      this.pendingClear.source === "chain" &&
      !this.pendingClear.bombCancelled
    );
  }

  resetAiChainAnimationState() {
    this.aiChainAnimating = false;
    this.aiPendingChain = [];
    this.aiChainStepIndex = 0;
    this.aiChainStepTimer = 0;
    this.aiChainFinishing = false;
  }

  cancelAiChainAnimation() {
    if (!this.aiChainAnimating) {
      return;
    }
    if (this.dragging) {
      this.dragging = false;
      this.chain.forEach((tsum) => { tsum.inChain = false; });
      this.chain = [];
      this.chainSet = new Set();
      this.chainTypeId = null;
      this.chainRule = null;
    }
    this.resetAiChainAnimationState();
    console.log("[AI] chain animation cancelled");
  }

  processDragPoint(pos, manualChainOnly = false, extendManualChain = true) {
    this.dragPointer = pos;
    if (this.state === "playing" && !this.paused && !this.isCoingainInputLocked()) {
      if (!manualChainOnly && this.inputRouter.handleDrag(pos)) {
        this.noteAction();
        return true;
      }
      if (extendManualChain && this.dragging) {
        this.noteAction();
        this.extendChain(pos);
      }
    }
    return false;
  }

  getManualDragPoints(event, rect) {
    const coalescedEvents = typeof event.getCoalescedEvents === "function"
      ? event.getCoalescedEvents()
      : [];
    const events = coalescedEvents.length > 0 ? coalescedEvents : [event];
    const points = events.map((sample) => this.getPointerPosition(sample, rect));
    const endPoint = this.getPointerPosition(event, rect);
    const lastPoint = points[points.length - 1];
    if (!lastPoint || lastPoint.x !== endPoint.x || lastPoint.y !== endPoint.y) {
      points.push(endPoint);
    }
    return points;
  }

  interpolateManualDragPoints(points, maxPoints = 64, step = 6) {
    const interpolated = [];
    let previous = this.manualDragPoint;
    for (const point of points) {
      if (!previous) {
        interpolated.push(point);
        previous = point;
        continue;
      }
      const segmentDistance = distance(previous.x, previous.y, point.x, point.y);
      const segmentSteps = Math.max(1, Math.ceil(segmentDistance / step));
      for (let i = 1; i <= segmentSteps; i += 1) {
        const ratio = i / segmentSteps;
        interpolated.push({
          x: lerp(previous.x, point.x, ratio),
          y: lerp(previous.y, point.y, ratio)
        });
      }
      previous = point;
    }
    if (interpolated.length <= maxPoints) {
      return interpolated;
    }
    const limited = [];
    for (let i = 0; i < maxPoints; i += 1) {
      const index = Math.round((i * (interpolated.length - 1)) / (maxPoints - 1));
      limited.push(interpolated[index]);
    }
    return limited;
  }

  onPointerMove(event) {
    const rect = this.canvas.getBoundingClientRect();
    const pos = this.getPointerPosition(event, rect);
    const isManualChain = (
      this.dragging &&
      this.manualDragPoint &&
      this.manualDragPointerId === event.pointerId
    );
    if (!isManualChain) {
      this.processDragPoint(pos);
      return;
    }
    if (this.processDragPoint(pos, false, false)) {
      this.manualDragPoint = pos;
      return;
    }
    const points = this.getManualDragPoints(event, rect);
    const interpolatedPoints = this.interpolateManualDragPoints(points);
    for (const point of interpolatedPoints) {
      this.processDragPoint(point, true);
    }
    this.manualDragPoint = pos;
  }

  onPointerUp(event) {
    if (this.manualDragPointerId !== null && event.pointerId !== this.manualDragPointerId) {
      return;
    }
    this.dragPointer = this.getPointerPosition(event);
    this.manualDragPoint = null;
    this.manualDragPointerId = null;
    if (this.state === "playing" && this.isCoingainInputLocked()) {
      return;
    }
    if (this.state === "playing" && this.inputRouter.handlePointerUp(this.dragPointer)) {
      return;
    }
    if (this.state === "playing" && this.dragging) {
      this.finishChain();
    }
  }

  handleTitlePointer(pos) {
    const pageButtons = this.getTitlePageButtonRects();
    if (rectContains(pageButtons.previous, pos.x, pos.y)) {
      this.changeTitleCharacterPage(-1);
      return;
    }
    if (rectContains(pageButtons.next, pos.x, pos.y)) {
      this.changeTitleCharacterPage(1);
      return;
    }
    const modeRects = this.getTitleModeRects();
    if (rectContains(modeRects.solo, pos.x, pos.y)) {
      this.battleController?.setMode("solo");
      return;
    }
    if (rectContains(modeRects.battle, pos.x, pos.y)) {
      this.battleController?.setMode("battle");
      return;
    }
    if (this.gameMode === "battle") {
      const difficultyRects = this.getDifficultyRects();
      for (const difficulty of ["easy", "normal", "hard"]) {
        if (rectContains(difficultyRects[difficulty], pos.x, pos.y)) {
          this.battleController?.setDifficulty(difficulty);
          return;
        }
      }
    }
    const selectable = this.getTitleCharacterPageTypes();
    const charRects = this.getTitleCharacterRects();
    for (let i = 0; i < charRects.length; i += 1) {
      if (rectContains(charRects[i], pos.x, pos.y)) {
        const selected = selectable[i];
        this.selectedMyTsumIndex = Math.max(0, TSUM_TYPES.findIndex((type) => type.id === selected.id));
        this.myTsum = TSUM_TYPES[this.selectedMyTsumIndex];
        this.skillSystem.configure(this.myTsum, this.selectedSkillLevel);
        return;
      }
    }

    const levelButtons = this.getLevelButtonRects();
    if (rectContains(levelButtons.minus, pos.x, pos.y)) {
      this.selectedSkillLevel = clamp(this.selectedSkillLevel - 1, 1, 6);
      this.skillSystem.configure(TSUM_TYPES[this.selectedMyTsumIndex], this.selectedSkillLevel);
      return;
    }
    if (rectContains(levelButtons.plus, pos.x, pos.y)) {
      this.selectedSkillLevel = clamp(this.selectedSkillLevel + 1, 1, 6);
      this.skillSystem.configure(TSUM_TYPES[this.selectedMyTsumIndex], this.selectedSkillLevel);
      return;
    }
    if (rectContains(this.getTitlePlayRect(), pos.x, pos.y)) {
      this.itemSelection = this.blankItemSelection();
      this.state = "items";
    }
  }

  handleItemsPointer(pos) {
    if (rectContains(this.getItemsBackRect(), pos.x, pos.y)) {
      if (this.battleController) {
        this.battleController.returnToTitle();
      } else {
        this.state = "title";
      }
      return;
    }
    if (rectContains(this.getItemsPlayRect(), pos.x, pos.y)) {
      if (this.getSelectedItemCost() <= this.coins) {
        console.log('プレイボタンクリック - アイテル選択:', this.itemSelection);
        if (this.battleController) {
          this.battleController.startSelectedMode();
        } else {
          this.startGame();
        }
      }
      return;
    }
    const itemRects = this.getItemRects();
    for (let i = 0; i < itemRects.length; i += 1) {
      if (!rectContains(itemRects[i], pos.x, pos.y)) {
        continue;
      }
      const item = ITEM_DEFS[i];
      const already = this.itemSelection[item.key];
      if (item.key === "reduce") {
        this.itemSelection.reduce3 = false;
      } else if (item.key === "reduce3") {
        this.itemSelection.reduce = false;
      }
      console.log(`アイテルクリック: ${item.key}, 既選択: ${already}, locked: ${this.isItemLocked(item.key)}, cost: ${item.cost}`);
      if (already) {
        this.itemSelection[item.key] = false;
        console.log(`${item.key} を未選択に`);
        return;
      }
      if (this.isItemLocked(item.key)) {
        console.log(`${item.key} はロックされています`);
        return;
      }
      if (this.getSelectedItemCost() + item.cost <= this.coins) {
        this.itemSelection[item.key] = true;
        console.log(`${item.key} を選択しました。更新後のアイテル:`, this.itemSelection);
      } else {
        console.log(`${item.key} はコストが足りません。必要: ${item.cost}, 現在のコスト: ${this.getSelectedItemCost()}, 所持: ${this.coins}`);
      }
      return;
    }
  }

  handleResultPointer(pos) {
    if (rectContains(this.getResultRetryRect(), pos.x, pos.y)) {
      if (this.battleStats && this.battleController) {
        this.battleController.prepareRematch();
      }
      this.itemSelection = this.blankItemSelection();
      this.state = "items";
      return;
    }
    if (rectContains(this.getResultTitleRect(), pos.x, pos.y)) {
      if (this.battleController) {
        this.battleController.returnToTitle();
        return;
      }
      this.itemSelection = this.blankItemSelection();
      this.state = "title";
    }
  }

  getTitleCharacterRects() {
    const count = this.getTitleCharacterPageTypes().length;
    const cols = 5;
    const w = 62;
    const h = 62;
    const gapX = 5;
    const gapY = 8;
    const totalWidth = cols * w + Math.max(0, cols - 1) * gapX;
    const startX = (WIDTH - totalWidth) * 0.5;
    const startY = 228;
    return Array.from({ length: count }, (_, i) => ({
      x: startX + (i % cols) * (w + gapX),
      y: startY + Math.floor(i / cols) * (h + gapY),
      w,
      h
    }));
  }

  getTitleCharacterPageCount() {
    return Math.max(1, Math.ceil(this.getSelectableTsumTypes().length / TITLE_TSUMS_PER_PAGE));
  }

  getTitleCharacterPage() {
    return clamp(this.titleCharacterPage || 0, 0, this.getTitleCharacterPageCount() - 1);
  }

  getTitleCharacterPageTypes() {
    const start = this.getTitleCharacterPage() * TITLE_TSUMS_PER_PAGE;
    return this.getSelectableTsumTypes().slice(start, start + TITLE_TSUMS_PER_PAGE);
  }

  getTitlePageButtonRects() {
    return {
      previous: { x: 5, y: 256, w: 31, h: 76 },
      next: { x: WIDTH - 36, y: 256, w: 31, h: 76 }
    };
  }

  changeTitleCharacterPage(delta) {
    const current = this.getTitleCharacterPage();
    this.titleCharacterPage = clamp(current + delta, 0, this.getTitleCharacterPageCount() - 1);
  }

  getLevelButtonRects() {
    return {
      minus: { x: 48, y: 374, w: 52, h: 42 },
      plus: { x: WIDTH - 100, y: 374, w: 52, h: 42 }
    };
  }

  getTitlePlayRect() {
    return { x: 93, y: 644, w: 228, h: 64 };
  }

  getTitleModeRects() {
    return {
      solo: { x: 48, y: 478, w: 150, h: 34 },
      battle: { x: 216, y: 478, w: 150, h: 34 }
    };
  }

  getDifficultyRects() {
    return {
      easy: { x: 48, y: 518, w: 96, h: 30 },
      normal: { x: 159, y: 518, w: 96, h: 30 },
      hard: { x: 270, y: 518, w: 96, h: 30 }
    };
  }

  getItemRects() {
    const rects = [];
    const startX = 27;
    const startY = 229;
    const colGap = 9;
    const rowGap = 10;
    const w = 83;
    const h = 118;
    for (let i = 0; i < ITEM_DEFS.length; i += 1) {
      const col = i % 4;
      const row = Math.floor(i / 4);
      rects.push({
        x: startX + col * (w + colGap),
        y: startY + row * (h + rowGap),
        w,
        h
      });
    }
    return rects;
  }

  getItemsBackRect() {
    return { x: 28, y: 644, w: 126, h: 64 };
  }

  getItemsPlayRect() {
    return { x: 170, y: 644, w: 216, h: 64 };
  }

  getResultRetryRect() {
    return { x: 72, y: 604, w: 270, h: 52 };
  }

  getResultTitleRect() {
    return { x: 118, y: 666, w: 178, h: 40 };
  }

  getSelectedItemCost() {
    return ITEM_DEFS.reduce((sum, item) => sum + (this.itemSelection[item.key] ? item.cost : 0), 0);
  }

  isItemLocked(key) {
    if (key === "reduce") {
      return !!this.itemSelection.reduce3;
    }
    if (key === "reduce3") {
      return !!this.itemSelection.reduce;
    }
    return false;
  }

  getNamineSkillDuration(level) {
    return 3 + clamp(level, 1, 6) * 0.5;
  }

  isNamineLinkActive() {
    return this.namineSkillTimer > 0;
  }

  getSelectableTsumTypes() {
    return TSUM_TYPES.filter((type) => type.selectable !== false && type.skillType !== "auxiliary");
  }

  getBoardTypeLimit(items = this.activeItems || this.itemSelection) {
    if (items?.reduce3) {
      return 3;
    }
    if (items?.reduce) {
      return 4;
    }
    return 5;
  }

  getPairBoardTypes(maxTypes = this.getBoardTypeLimit()) {
    const pairJudy = TSUM_TYPES.find((type) => type.id === "judyNickJudy");
    const pairNick = TSUM_TYPES.find((type) => type.id === "judyNickNickMate");
    return this.getFixedBoardTypes([pairJudy, pairNick], maxTypes);
  }

  getFixedBoardTypes(requiredTypes, maxTypes) {
    const subIds = FIXED_SUB_TSUM_IDS_BY_MY_TSUM[this.myTsum.id]?.[maxTypes];
    if (!subIds) {
      throw new Error(`No fixed sub-Tsum board selection for ${this.myTsum.id} (${maxTypes} types)`);
    }

    const subTypes = subIds.map((id) => TSUM_TYPES.find((type) => type.id === id));
    const boardTypes = [...requiredTypes, ...subTypes];
    if (subTypes.some((type) => !type) || boardTypes.length !== maxTypes || !areBoardTypesColorCompatible(boardTypes)) {
      throw new Error(`Invalid fixed sub-Tsum board selection for ${this.myTsum.id} (${maxTypes} types)`);
    }
    return boardTypes;
  }

  getBoardTypes(maxTypes = this.getBoardTypeLimit()) {
    if (this.myTsum.id === "judyNick") {
      return this.getPairBoardTypes(maxTypes);
    }
    return this.getFixedBoardTypes([this.myTsum], maxTypes);
  }

  getBoardWeights(typeCount = this.availableTypes?.length || this.getBoardTypeLimit()) {
    if (typeCount <= 0) {
      return [];
    }
    if (this.myTsum.id === "judyNick") {
      if (typeCount === 3) {
        return [0.25, 0.25, 0.5];
      }
      if (typeCount === 4) {
        return [0.2, 0.2, 0.3, 0.3];
      }
      if (typeCount === 5) {
        return [0.18, 0.18, 0.2133, 0.2133, 0.2134];
      }
    } else {
      if (typeCount === 3) {
        return [0.5, 0.25, 0.25];
      }
      if (typeCount === 4) {
        return [0.4, 0.2, 0.2, 0.2];
      }
      if (typeCount === 5) {
        return [0.3, 0.175, 0.175, 0.175, 0.175];
      }
    }
    return Array.from({ length: typeCount }, () => 1 / typeCount);
  }

  isMyTsumTypeId(typeId) {
    if (this.myTsum.id === "judyNick") {
      return typeId === "judyNickJudy" || typeId === "judyNickNickMate";
    }
    return typeId === this.myTsum.id;
  }

  getActiveSkillSession(skillId) {
    return this.skillRuntime.getSessionsByHandlerId(skillId)[0] || null;
  }

  getJudyNickSession() {
    return this.getActiveSkillSession("judyNick");
  }

  getCoingainSession() {
    return this.getActiveSkillSession("coingain");
  }

  getCoingainData() {
    return this.getCoingainSession()?.data || null;
  }

  isCoingainCountingActive() {
    const data = this.getCoingainData();
    return !!data && data.countingActive !== false && data.phase !== COINGAIN_PHASE.INTRO && data.phase !== COINGAIN_PHASE.COMPLETE;
  }

  getCoingainCoinThreshold(stage = null) {
    const currentStage = Math.max(0, Math.floor(stage ?? this.getCoingainData()?.coinStage ?? 0));
    return 10 + currentStage * 10;
  }

  getCoingainCorrectionType(stage = null) {
    const requestedStage = clamp(
      Math.floor(stage ?? this.getCoingainData()?.coinStage ?? 0),
      0,
      COINGAIN_MAX_CORRECTION_STAGE
    );
    for (let candidate = requestedStage; candidate >= 0; candidate -= 1) {
      const key = `correction_${candidate}`;
      if (COIN_CORRECTION_TABLE[key]) {
        return key;
      }
    }
    return DEFAULT_COIN_CORRECTION_TYPE;
  }

  getCoingainStatus() {
    const session = this.getCoingainSession();
    const data = session?.data;
    if (!data || data.phase === COINGAIN_PHASE.COMPLETE) {
      return null;
    }
    const coinStage = clamp(Math.floor(data.coinStage || 0), 0, COINGAIN_MAX_CORRECTION_STAGE);
    const coinThreshold = this.getCoingainCoinThreshold(coinStage);
    const initialDurationMs = Math.max(1, data.initialDurationMs || 1);
    const effectRemainingMs = Math.max(0, data.effectRemainingMs || 0);
    return {
      active: true,
      phase: data.phase,
      coinStage,
      coinCount: Math.max(0, Math.floor(data.coinCount || 0)),
      coinThreshold,
      lotteryRemainder: Math.max(0, Math.floor(data.lotteryCount || 0)) % COINGAIN_LOTTERY_CLEAR_INTERVAL,
      pendingLotteryCount: Array.isArray(data.lotteryQueue) ? data.lotteryQueue.length : 0,
      lotteryDrawCount: Math.max(0, Math.floor(data.lotteryDrawCount || 0)),
      totalCleared: Math.max(0, Math.floor(data.totalCleared || 0)),
      remainingSec: effectRemainingMs / 1000,
      initialDurationSec: initialDurationMs / 1000,
      remainingRatio: clamp(effectRemainingMs / initialDurationMs, 0, 1),
      showFloorGauge: data.phase === COINGAIN_PHASE.ACTIVE && data.effectStarted,
      coinFlashRatio: clamp((data.coinFlashMs || 0) / 450, 0, 1)
    };
  }

  isCoingainTimerPaused() {
    const data = this.getCoingainData();
    return !!data && (
      data.phase === COINGAIN_PHASE.INTRO ||
      data.phase === COINGAIN_PHASE.LOTTERY ||
      data.phase === COINGAIN_PHASE.MINI_RESTORE ||
      data.phase === COINGAIN_PHASE.RESTORE
    );
  }

  isCoingainLotteryActive() {
    return this.getCoingainData()?.phase === COINGAIN_PHASE.LOTTERY;
  }

  getCoingainLotteryDisplay() {
    const data = this.getCoingainData();
    const lottery = data?.currentLottery;
    if (!data || data.phase !== COINGAIN_PHASE.LOTTERY || !lottery) {
      return null;
    }
    const durationMs = COINGAIN_LOTTERY_DURATION_MS;
    const elapsedMs = clamp(durationMs - Math.max(0, data.phaseRemainingMs || 0), 0, durationMs);
    return {
      active: true,
      mode: lottery.resultShown ? "result" : "roulette",
      outcomeType: lottery.type,
      progress: clamp(elapsedMs / COINGAIN_LOTTERY_SPIN_MS, 0, 1),
      rotation: elapsedMs * 0.022
    };
  }

  isCoingainInputLocked() {
    return this.isCoingainTimerPaused();
  }

  isCoingainPhysicsPaused() {
    return this.getCoingainData()?.phase === COINGAIN_PHASE.INTRO;
  }

  isCoingainSpawnPaused() {
    return this.getCoingainData()?.phase === COINGAIN_PHASE.INTRO;
  }

  cancelActiveInputForCoingainLock() {
    if (!this.dragging && (!Array.isArray(this.chain) || this.chain.length === 0)) {
      return;
    }
    this.dragging = false;
    this.chain.forEach((tsum) => { tsum.inChain = false; });
    this.chain = [];
    this.chainSet = new Set();
    this.chainTypeId = null;
    this.chainRule = null;
  }

  finishActiveChainForCoingainLottery() {
    if (!this.dragging || !Array.isArray(this.chain) || this.chain.length < 2) {
      return false;
    }
    this.finishChain();
    return true;
  }

  getTargetBodyCount() {
    const data = this.getCoingainData();
    if (data?.miniActive) {
      return skillValue("coingain", "miniTargetCount", data.level || this.selectedSkillLevel) || 90;
    }
    return TARGET_TSUM_COUNT;
  }

  applyCoingainMiniScaleToBody(body, session = this.getCoingainSession()) {
    if (!body || body.dead || !session?.data?.miniActive) {
      return;
    }
    const scale = skillValue("coingain", "miniScale", session.level || this.selectedSkillLevel) || 0.8;
    this.boardState.setScaleModifier({
      sessionId: session.id,
      nodeIds: [body.id],
      scale,
      radiusScale: scale
    });
  }

  applyCoingainMiniScaleToCurrentBodies(session = this.getCoingainSession()) {
    if (!session?.data?.miniActive) {
      return;
    }
    for (const body of this.getPhysicsBodies()) {
      this.applyCoingainMiniScaleToBody(body, session);
    }
  }

  clearCoingainMiniScale(session = this.getCoingainSession()) {
    if (!session) {
      return;
    }
    this.boardState.clearScaleBySource(session.id);
  }

  applyCoingainGlowToCurrentMyTsums(session = this.getCoingainSession()) {
    if (!session) {
      return;
    }
    const ids = getLiveTsums(this, (tsum) => this.isMyTsumTypeId(this.boardState.getResolvedType(tsum).id))
      .map((tsum) => tsum.id);
    if (!ids.length) {
      return;
    }
    this.boardState.addSpecialChainNodes(ids, {
      sessionId: session.id,
      kind: COINGAIN_SPECIAL_CHAIN_KIND,
      splashRadius: NAMINE_SPLASH_RADIUS
    });
  }

  removeBombsDirectly(bombs = []) {
    const removed = [];
    const seen = new Set();
    for (const bomb of bombs) {
      if (!bomb || bomb.dead || seen.has(bomb.id)) {
        continue;
      }
      seen.add(bomb.id);
      bomb.dead = true;
      removed.push(bomb);
      this.createShockwave(bomb.x, bomb.y, "rgba(255,210,72,0.45)", 4, 8, 0.22, 145);
      this.spawnExplosionSparks(bomb.x, bomb.y, BOMB_DATA[bomb.bombType]?.color || "#ffd66e", 8);
    }
    if (removed.length) {
      this.bombs = this.bombs.filter((bomb) => !bomb.dead);
    }
    return removed;
  }

  recordCoingainClear(info = {}, resolvedClearCount = 0) {
    const session = this.getCoingainSession();
    const data = session?.data;
    if (!data || data.countingActive === false) {
      return;
    }
    const clearCount = Math.max(0, Math.floor(info.coingainCountOverride ?? resolvedClearCount ?? 0));
    if (clearCount <= 0) {
      return;
    }
    const bombCount = Math.max(0, Math.floor(info.coingainBombCount || 0));
    data.totalCleared = Math.max(0, (data.totalCleared || 0) + clearCount);
    if (bombCount > 0) {
      const extendMs = (skillValue("coingain", "bombExtendSec", session.level) || 0) * 1000 * bombCount;
      data.effectRemainingMs = Math.max(0, (data.effectRemainingMs || 0) + extendMs);
      this.addFloatingText(WIDTH * 0.5, FIELD_TOP + 112, `+${(extendMs / 1000).toFixed(1)}s`, "#ffe487", 18, 0.58);
    }

    data.lotteryCount = Math.max(0, (data.lotteryCount || 0) + clearCount);
    while (data.lotteryCount >= COINGAIN_LOTTERY_CLEAR_INTERVAL) {
      data.lotteryCount -= COINGAIN_LOTTERY_CLEAR_INTERVAL;
      data.lotteryQueue.push({ id: data.nextLotteryId++ });
    }

    data.coinCount = Math.max(0, (data.coinCount || 0) + clearCount);
    while (data.coinStage < COINGAIN_MAX_CORRECTION_STAGE) {
      const threshold = this.getCoingainCoinThreshold(data.coinStage);
      if (data.coinCount < threshold) {
        break;
      }
      data.coinCount -= threshold;
      data.coinStage += 1;
      data.coinFlashMs = 450;
    }
    if (data.coinStage >= COINGAIN_MAX_CORRECTION_STAGE) {
      data.coinStage = COINGAIN_MAX_CORRECTION_STAGE;
      data.coinCount = Math.min(data.coinCount, this.getCoingainCoinThreshold(data.coinStage));
    }
  }

  recordCoingainDirectBombOnlyClear(bombs, x = WIDTH * 0.5, y = FIELD_CENTER_Y) {
    const clearCount = Array.isArray(bombs) ? bombs.length : 0;
    if (clearCount <= 0) {
      return 0;
    }
    this.totalCleared += clearCount;
    this.feverSystem.addClears(clearCount);
    const correctionType = this.getCoingainCorrectionType();
    this.coinBonus += this.getCoinsByClearCount(clearCount, this.myTsum.id, correctionType);
    this.comboSystem.recordAction();
    this.addFloatingText(x, y + 6, `${clearCount}`, "#fff4b8", 40, 0.8);
    this.recordCoingainClear({ coingainBombCount: clearCount }, clearCount);
    this.queueNaturalLargeTsum({
      source: "coingainBombOnly",
      physicalTsumCount: 0,
      effectiveClearCount: clearCount,
      clearedTypeCandidates: []
    });
    this.spawnReplacementTsums();
    return clearCount;
  }

  getJudyNickCountStage() {
    return clamp(this.getJudyNickSession()?.data?.countStage || 1, 1, 10);
  }

  getJudyNickReadySkillMode() {
    if (this.myTsum.id !== "judyNick" || !this.judyNickGaugeManager) {
      return null;
    }
    return this.judyNickGaugeManager.activateSkill();
  }

  isSkillReadyForActivation() {
    if (this.myTsum.id === "judyNick") {
      return !!this.getJudyNickReadySkillMode();
    }
    if (this.myTsum.id === "coingain" && this.getCoingainSession()) {
      return false;
    }
    return this.skillSystem.ready;
  }

  getJudyNickSkillStatus() {
    const session = this.getJudyNickSession();
    if (!session) {
      return null;
    }
    const durationSec = skillValue("judyNick", "durationSec", session.level || this.selectedSkillLevel);
    const remainingSec = Math.max(0, session.remainingMs / 1000);
    const countStage = clamp(session.data?.countStage || 1, 1, 10);
    return {
      active: true,
      currentMode: session.data?.currentMode || "judy",
      durationSec,
      remainingSec,
      remainingRatio: durationSec > 0 ? clamp(remainingSec / durationSec, 0, 1) : 0,
      countStage,
      countLabel: countStage >= 10 ? "COUNT MAX" : `COUNT ${countStage}`
    };
  }

  isGastonLoopActive() {
    const session = this.getActiveSkillSession("gaston");
    return !!session?.data?.loopActive;
  }

  getCurrentGameplayPauseState() {
    return resolveGameplayPauseState({
      pendingClear: this.pendingClear,
      coingainClockPaused: this.isCoingainTimerPaused(),
      coingainPhysicsPaused: this.isCoingainPhysicsPaused()
    });
  }

  getCurrentGameplayDelta(dt, pauseState = this.getCurrentGameplayPauseState()) {
    return getGameplayClockDelta(dt, pauseState);
  }

  getLiliaSession() {
    return this.getActiveSkillSession(LILIA_TYPE_ID);
  }

  getLiliaController() {
    return this.getLiliaSession()?.data?.controller || null;
  }

  isLiliaBat(tsum) {
    return isLiliaBatNode(tsum, this.getLiliaController());
  }

  getLiliaRenderPosition(tsum) {
    return this.getLiliaController()?.flight?.getPosition(tsum?.id) || null;
  }

  getLiliaSkillStatus() {
    const session = this.getLiliaSession();
    const controller = session?.data?.controller;
    if (!session || !controller) {
      return null;
    }
    const durationSec = LILIA_SKILL_DURATION[session.level] || 1;
    const remainingSec = Math.max(0, session.remainingMs / 1000);
    const flying = controller.flight.snapshot();
    return {
      active: controller.active,
      durationSec,
      remainingSec,
      remainingRatio: clamp(remainingSec / durationSec, 0, 1),
      transformedBaseTypeId: controller.transformedBaseTypeId,
      activeChainType: controller.activeChainType,
      chainLength: this.dragging ? this.chain.length : 0,
      holdTime: controller.flight.holdTime,
      flyingBatCount: flying.length,
      flying,
      lineClearCount: controller.lastClearCounts.line,
      auraClearCount: controller.lastClearCounts.aura,
      unionClearCount: controller.lastClearCounts.union,
      coinCorrection: LILIA_COIN_CORRECTION[session.level],
      tuning: LILIA_TUNING,
      chainedLilia: controller.activeChainType === LILIA_CHAIN_TYPE.LILIA ? this.chain.slice() : []
    };
  }

  flushPostChainCleanup() {
    if (!this.postChainCleanupSessionIds.length || this.dragging || this.pendingClear) {
      return;
    }
    const sessionIds = this.postChainCleanupSessionIds.slice();
    this.postChainCleanupSessionIds = [];
    sessionIds.forEach((sessionId) => this.boardState.clearBySource(sessionId));
  }

  getChainBehaviorForStart(tsum) {
    const typeId = this.boardState.getResolvedType(tsum).id;
    const perfumeAliceSession = this.getActiveSkillSession("perfumeAlice");
    if (perfumeAliceSession && typeId === this.myTsum.id) {
      return null;
    }
    const namineSession = this.getActiveSkillSession("namine");
    if (namineSession && (typeId === "namine" || typeId === "namineSora")) {
      return {
        mode: "namine",
        allowedTypeIds: new Set(["namine", "namineSora"])
      };
    }
    const jamilSession = this.getActiveSkillSession("jamilViper");
    if (jamilSession) {
      const startIsSpecial = isJamilHighScoreNode(this.boardState, tsum);
      if (typeId === this.myTsum.id && !startIsSpecial) {
        return {
          mode: "jamil",
          allowedTypeIds: new Set([this.myTsum.id]),
          subtypeId: null,
          startIsSpecial: false
        };
      }
      return {
        mode: "jamil",
        allowedTypeIds: new Set([typeId, this.myTsum.id]),
        subtypeId: typeId === this.myTsum.id ? null : typeId,
        startIsSpecial
      };
    }
    if ((this.getCoingainData()?.unlimitedRemainingMs || 0) > 0) {
      return {
        mode: "coingainUnlimited",
        allowedTypeIds: new Set([typeId]),
        unlimitedDistance: true
      };
    }
    return {
      mode: "normal",
      allowedTypeIds: new Set([typeId])
    };
  }

  canExtendActiveChain(last, candidate, margin = 0) {
    return this.canConnectWithChainRule(this.chainRule, last, candidate, margin);
  }

  canConnectWithChainRule(chainRule, last, candidate, margin = 0) {
    if (!chainRule) {
      return false;
    }
    const candidateTypeId = this.boardState.getResolvedType(candidate).id;
    if (!chainRule.allowedTypeIds.has(candidateTypeId)) {
      return false;
    }
    const lastTypeId = this.boardState.getResolvedType(last).id;
    if (chainRule.mode === "jamil") {
      const lastIsSpecial = isJamilHighScoreNode(this.boardState, last);
      const candidateIsSpecial = isJamilHighScoreNode(this.boardState, candidate);
      if (chainRule.subtypeId) {
        if (candidateTypeId === this.myTsum.id && !candidateIsSpecial) {
          return false;
        }
        if (lastTypeId === this.myTsum.id && lastIsSpecial && candidateTypeId === chainRule.subtypeId) {
          return false;
        }
      }
    }
    if (
      chainRule.mode === "namine" &&
      (lastTypeId === "namineSora" || candidateTypeId === "namineSora")
    ) {
      return true;
    }
    if (chainRule.unlimitedDistance) {
      return true;
    }
    const dLast = distance(last.x, last.y, candidate.x, candidate.y);
    const maxChainDist = Math.max(MAX_CHAIN_DIST * 0.65, (this.getBodyRadius(last) + this.getBodyRadius(candidate)) * 1.6);
    return dLast <= maxChainDist + margin;
  }

  buildCoronationElsaPlannerContext(options = {}) {
    const level = options.level || this.selectedSkillLevel;
    if (options.profile) {
      return profileCoronationElsaPlanner(this, {
        ...options,
        level
      });
    }
    const snapshot = buildCoronationElsaPlannerSnapshot(this, level);
    const adjacency = buildCoronationElsaPlannerAdjacency(this, snapshot);
    return Object.freeze({
      snapshot,
      adjacency,
      initialState: snapshot.initialState,
      diagnostics: null
    });
  }

  planStrongestModeCoronationElsaAction(options = {}) {
    const context = this.buildCoronationElsaPlannerContext();
    const plan = solveCoronationElsaStrongestModePlan(
      context.snapshot,
      context.adjacency,
      options.plannerOptions || {}
    );
    this.recordStrongestModeCoronationElsaPlannerRun(plan);
    if (this.coronationElsaDebug) {
      this.logCodexCoronationPayload("[CODEXLOG CORONATION TERMINAL PLANNER]", plan.diagnostics);
    }
    const liveById = new Map(this.tsums.map((tsum) => [String(tsum.id), tsum]));
    const chain = plan.action === "trace"
      ? plan.chainIds.map((id) => liveById.get(String(id))).filter(Boolean)
      : [];
    if (chain.length === plan.chainIds.length && chain.length >= 3) {
      Object.defineProperty(chain, "strongestModeCoronationElsaSource", {
        value: "planner",
        configurable: true
      });
      Object.defineProperty(chain, "strongestModeCoronationElsaPlan", {
        value: plan,
        configurable: true
      });
    }
    const tapTarget = plan.action === "tap"
      ? liveById.get(String(plan.tapNodeId)) || null
      : null;
    return Object.freeze({ plan, chain, tapTarget });
  }

  findStrongestModeCoronationElsaPlannerChain() {
    const decision = this.planStrongestModeCoronationElsaAction();
    return decision.plan.action === "trace" ? decision.chain : [];
  }

  isStrongestModeCoronationElsaPlannedChainValid(chain) {
    if (!Array.isArray(chain) || chain.length < 3) return false;
    const liveNodes = new Set(this.getStrongestModeChainNodes());
    if (!chain.every((node) => liveNodes.has(node))) return false;
    const rule = this.getChainBehaviorForStart(chain[0]);
    if (!rule?.allowedTypeIds?.size) return false;
    for (let index = 1; index < chain.length; index += 1) {
      if (!this.canConnectWithChainRule(rule, chain[index - 1], chain[index])) return false;
    }
    return true;
  }

  maybeProfileStrongestModeCoronationElsaPlanner() {
    if (!this.coronationElsaDebug) {
      return null;
    }
    const session = this.getActiveSkillSession("coronationElsa");
    if (!session) {
      return null;
    }
    const committedTraceCount = this.getStrongestModeCoronationElsaSkillSummary()?.chainCount || 0;
    const profileKey = `${session.id}:${committedTraceCount}`;
    if (this.strongestModeCoronationElsaPlannerProfileKey === profileKey) {
      return null;
    }
    this.strongestModeCoronationElsaPlannerProfileKey = profileKey;
    try {
      return this.buildCoronationElsaPlannerContext({
        profile: true,
        log: true,
        sessionId: session.id,
        committedTraceCount
      });
    } catch (error) {
      this.logCodexCoronationPayload("[CODEXLOG CORONATION PLANNER PROFILE ERROR]", {
        sessionId: session.id,
        committedTraceCount,
        message: error instanceof Error ? error.message : String(error)
      });
      return null;
    }
  }

  updateStrongestMode(dt) {
    if (this.isStrongestModeBusy()) {
      this.strongestModeStepTimer = 0;
      return;
    }
    const isCoronationElsaSkillActive = (
      this.myTsum?.id === "coronationElsa" &&
      !!this.getActiveSkillSession("coronationElsa")
    );
    if (isCoronationElsaSkillActive) {
      this.strongestModeCoronationElsaAfterChainTimer = Math.max(
        0,
        this.strongestModeCoronationElsaAfterChainTimer - dt
      );
    } else {
      this.strongestModeCoronationElsaAfterChainTimer = 0;
    }
    this.strongestModeStepTimer = Math.min(
      this.strongestModeStepInterval,
      this.strongestModeStepTimer + dt
    );
    if (this.strongestModeStepTimer < this.strongestModeStepInterval) {
      return;
    }
    this.strongestModeStepTimer = 0;
    this.performStrongestModeStep(dt);
  }

  isStrongestModeBusy() {
    return !!(
      this.state !== "playing" ||
      this.paused ||
      this.isCoingainInputLocked() ||
      this.timeUp ||
      this.actionLock ||
      this.dragging ||
      this.pendingClear ||
      this.tempLockTimer > 0
    );
  }

  shouldLogStrongestModeJudyNickJudyBubbleDebug(key) {
    if (!this.judyNickDebug) {
      return false;
    }
    const elapsed = Number.isFinite(this.elapsed) ? this.elapsed : 0;
    if (
      key === this.strongestModeJudyNickJudyBubbleDebugLastKey &&
      elapsed - this.strongestModeJudyNickJudyBubbleDebugLastElapsed < 0.35
    ) {
      return false;
    }
    this.strongestModeJudyNickJudyBubbleDebugLastKey = key;
    this.strongestModeJudyNickJudyBubbleDebugLastElapsed = elapsed;
    return true;
  }

  tryTapStrongestModeJudyNickJudyBubble(options = {}) {
    if (!this.strongestModeEnabled || this.myTsum?.id !== "judyNick") {
      this.strongestModeJudyNickJudyPreferLowerChainOnce = false;
      return false;
    }
    const busyBlocked = !!options.busyBlocked;
    const judyNickSession = this.getJudyNickSession();
    const currentMode = judyNickSession?.data?.currentMode || null;
    if (currentMode !== "judy") {
      this.strongestModeJudyNickJudyPreferLowerChainOnce = false;
      return false;
    }
    let judyBubbleTarget = null;
    let lowerHalfBubbleTarget = null;
    let lowestBubbleY = null;
    let passedThreshold = false;
    const halfFieldY = (FIELD_TOP + FIELD_BOTTOM) / 2;
    const bubbleNodes = this.boardState.getBubbleNodesBySession(judyNickSession.id);
    for (const tsum of bubbleNodes) {
      if (Number.isFinite(tsum?.y)) {
        lowestBubbleY = lowestBubbleY == null ? tsum.y : Math.max(lowestBubbleY, tsum.y);
      }
      if (
        tsum &&
        !tsum.dead &&
        !tsum.removing &&
        !tsum.inChain &&
        this.isTsumInPlayArea(tsum) &&
        tsum.y >= STRONGEST_MODE_JUDY_NICK_JUDY_EARLY_BUBBLE_Y &&
        (
          !judyBubbleTarget ||
          tsum.y < judyBubbleTarget.y
        )
      ) {
        passedThreshold = true;
        judyBubbleTarget = tsum;
        if (
          tsum.y >= halfFieldY &&
          (
            !lowerHalfBubbleTarget ||
            tsum.y > lowerHalfBubbleTarget.y
          )
        ) {
          lowerHalfBubbleTarget = tsum;
        }
      }
    }
    if (lowerHalfBubbleTarget) {
      judyBubbleTarget = lowerHalfBubbleTarget;
    }
    if (!judyBubbleTarget) {
      if (
        this.shouldLogStrongestModeJudyNickJudyBubbleDebug(
          `${busyBlocked ? "busy" : "scan"}:${bubbleNodes.length}:${Math.round(lowestBubbleY ?? -1)}:${passedThreshold ? 1 : 0}`
        )
      ) {
        console.log("[JUDY NICK DEBUG] strongest bubble tap", {
          bubbleCount: bubbleNodes.length,
          bubbleY: lowestBubbleY,
          threshold: STRONGEST_MODE_JUDY_NICK_JUDY_EARLY_BUBBLE_Y,
          passedThreshold,
          tapAttempted: false,
          tapSucceeded: false,
          busyBlocked,
          currentMode
        });
      }
      return false;
    }
    const tapSucceeded = this.inputRouter.handleTap({ x: judyBubbleTarget.x, y: judyBubbleTarget.y });
    if (
      this.shouldLogStrongestModeJudyNickJudyBubbleDebug(
        `${busyBlocked ? "busyTap" : "tap"}:${Math.round(judyBubbleTarget.y)}:${tapSucceeded ? 1 : 0}`
      )
    ) {
      console.log("[JUDY NICK DEBUG] strongest bubble tap", {
        bubbleCount: bubbleNodes.length,
        bubbleY: judyBubbleTarget.y,
        threshold: STRONGEST_MODE_JUDY_NICK_JUDY_EARLY_BUBBLE_Y,
        passedThreshold: true,
        tapAttempted: true,
        tapSucceeded,
        busyBlocked,
        currentMode
      });
    }
    if (tapSucceeded) {
      this.strongestModeJudyNickJudyPreferLowerChainOnce = true;
    }
    return tapSucceeded;
  }

  findStrongestModeJudyNickJudyLowerChain() {
    const halfFieldY = (FIELD_TOP + FIELD_BOTTOM) / 2;
    const isLowerChain = (chain) => (
      Array.isArray(chain) &&
      chain.length >= 3 &&
      (
        chain.reduce((sum, tsum) => sum + (tsum?.y || 0), 0) / chain.length >= halfFieldY ||
        chain.filter((tsum) => tsum?.y >= halfFieldY).length >= Math.ceil(chain.length / 2)
      )
    );
    const chain = this.findStrongestModeChain();
    if (isLowerChain(chain)) {
      return chain;
    }
    return this.findStrongestModeBestChain({
      minLength: 3,
      minY: halfFieldY
    });
  }

  performStrongestModeStep(dt = 0) {
    if (this.isStrongestModeBusy()) {
      return false;
    }
    if (this.isSkillReadyForActivation()) {
      return this.attemptSkillActivation(false);
    }
    if (this.tryPerformStrongestModeFeverBombCancel()) {
      return true;
    }
    const isCoronationElsaSkillActive = (
      this.myTsum?.id === "coronationElsa" &&
      !!this.getActiveSkillSession("coronationElsa")
    );
    const judyNickSession = this.getJudyNickSession();
    const logCoronationElsaStop = (reason, specialTarget = null) => {
      if (this.strongestModeCoronationElsaStopLogged) {
        return;
      }
      const strategyChain = strongestSkillStrategies.coronationElsa(this, { track: false }) || [];
      const stableFallbackChain = this.findStrongestModeCoronationElsaBestPreviewChain({
        minLength: 3,
        maxLength: 6,
        minY: this.getStrongestModeCoronationElsaSafePlayableY(),
        filterNode: (tsum) => this.isStrongestModeCoronationElsaPracticalStableTsum(tsum)
      }) || [];
      const relaxedFallbackChain = this.findStrongestModeCoronationElsaBestPreviewChain({
        minLength: 3,
        maxLength: 6,
        minY: this.getStrongestModeCoronationElsaSafePlayableY()
      }) || [];
      const relaxedFallbackStableNodeCount = relaxedFallbackChain.filter((tsum) => (
        this.isStrongestModeCoronationElsaStableTsum(tsum)
      )).length;
      const coronationElsaStopLog = {
        reason,
        busy: this.isStrongestModeBusy(),
        actionLock: this.actionLock,
        pendingClear: !!this.pendingClear,
        dragging: this.dragging,
        tempLockTimer: this.tempLockTimer,
        noChainFrames: this.strongestModeCoronationElsaNoChainFrames,
        delayFrames: this.strongestModeCoronationElsaFreezeTapDelayFrames,
        playableCount: this.countStrongestModePlayableNodesBelowCeiling(),
        minPlayable: this.strongestModeCoronationElsaMinPlayableNodesBeforeFreezeTap,
        frozenCount: this.boardState.getFrozenNodesByKind("coronationElsa").length,
        strategyChainLength: strategyChain.length,
        stableFallbackChainLength: stableFallbackChain.length,
        relaxedFallbackChainLength: relaxedFallbackChain.length,
        relaxedFallbackStableNodeCount,
        relaxedFallbackUnstableNodeCount: Math.max(0, relaxedFallbackChain.length - relaxedFallbackStableNodeCount),
        fallbackChainLength: relaxedFallbackChain.length,
        searchDiagnostics: this.strongestModeCoronationElsaLastSearchDiagnostics || null,
        specialTargetType: specialTarget?.type || null,
        specialTargetEffect: specialTarget?.effectCount || 0
      };
      this.pushCodexDebugLog("[STRONGEST CORONATION STOP]", coronationElsaStopLog);
      this.logCodexCoronationPayload("[CODEXLOG CORONATION STOP]", coronationElsaStopLog);
      console.log("[STRONGEST CORONATION STOP]", coronationElsaStopLog);
      this.strongestModeCoronationElsaStopLogged = true;
    };
    const isJudyNickJudySkillActive = (
      this.myTsum?.id === "judyNick" &&
      judyNickSession?.data?.currentMode === "judy"
    );
    if (!isJudyNickJudySkillActive) {
      this.strongestModeJudyNickJudyPreferLowerChainOnce = false;
    }
    const performStrongestModeChainWithBombCancel = (chain) => {
      const bomb = this.findStrongestModeBombTarget(chain);
      const shouldDeferBombCancel = !!(
        bomb &&
        Array.isArray(chain) &&
        chain.length >= 7
      );
      if (shouldDeferBombCancel) {
        const stats = { performedLengths: [] };
        const chained = this.performStrongestModeChains(chain, {
          allowChainQueueDuringActiveClear: true,
          stats
        });
        if (
          chained &&
          stats.performedLengths.some((length) => length >= 7) &&
          this.isStrongestModeDeferredBombTargetValid(bomb)
        ) {
          const tapped = this.inputRouter.handleTap({ x: bomb.x, y: bomb.y });
          if (!tapped && this.actionLock && this.canBombCancelActiveChain()) {
            this.explodeBomb(bomb);
          }
        }
        return chained;
      }
      if (bomb) {
        this.explodeBomb(bomb);
        return true;
      }
      return this.performStrongestModeChains(chain);
    };
    if (!isCoronationElsaSkillActive) {
      this.strongestModeCoronationElsaStopLogged = false;
      this.strongestModeCoronationElsaNoTraceDurationSec = 0;
      this.strongestModeCoronationElsaWaitRecentSpawnSettle = false;
      this.strongestModeCoronationElsaPendingExtraFreezeTap = false;
      this.strongestModeCoronationElsaSuppressRelaxedFallback = false;
      this.strongestModeCoronationElsaSuppressSpecialTapFrames = 0;
      this.strongestModeCoronationElsaNoFreezeTargetWaitFrames = 0;
      this.strongestModeCoronationElsaEarlyFreezeTapWaitFrames = 0;
      this.strongestModeCoronationElsaUnsafeFreezeTapWaitFrames = 0;
      this.strongestModeCoronationElsaLastChainStartElapsed = null;
      this.strongestModeCoronationElsaWaitStartElapsed = null;
      this.strongestModeCoronationElsaLastTierSearchDiagnostics = null;
      this.strongestModeCoronationElsaLastSearchDiagnostics = null;
      this.strongestModeCoronationElsaPlannerProfileKey = null;
      this.resetStrongestModeCoronationElsaTracePlan();
    }
    if (this.tryTapStrongestModeJudyNickJudyBubble()) {
      return true;
    }
    if (isJudyNickJudySkillActive && this.strongestModeJudyNickJudyPreferLowerChainOnce) {
      this.strongestModeJudyNickJudyPreferLowerChainOnce = false;
      const lowerChain = this.findStrongestModeJudyNickJudyLowerChain();
      if (Array.isArray(lowerChain) && lowerChain.length >= 3) {
        const chained = performStrongestModeChainWithBombCancel(lowerChain);
        if (chained) {
          return true;
        }
      }
    }
    if (this.normalizeStrongestModeBombCount(isCoronationElsaSkillActive ? 0 : 1)) {
      return true;
    }
    if (isCoronationElsaSkillActive) {
      const executeDecision = (decision, allowReplan) => {
        if (decision.plan.action === "trace") {
          if (!this.isStrongestModeCoronationElsaPlannedChainValid(decision.chain)) {
            if (allowReplan) return executeDecision(this.planStrongestModeCoronationElsaAction(), false);
            return false;
          }
          const chained = this.performStrongestModeChains(decision.chain);
          if (!chained && allowReplan && !this.isStrongestModeBusy()) {
            return executeDecision(this.planStrongestModeCoronationElsaAction(), false);
          }
          return chained;
        }
        if (decision.plan.action !== "tap" || !decision.tapTarget) return false;

        // Absolute final guard: a fresh snapshot must still have no legal trace.
        const confirmed = this.planStrongestModeCoronationElsaAction();
        if (confirmed.plan.action === "trace") {
          return executeDecision(confirmed, false);
        }
        if (confirmed.plan.action !== "tap" || !confirmed.tapTarget) return false;
        this.strongestModeCoronationElsaPendingTapPrediction = confirmed.plan.terminal;
        return this.tryTapStrongestModeCoronationElsaFreezeTarget({
          type: "freeze",
          x: confirmed.tapTarget.x,
          y: confirmed.tapTarget.y,
          target: confirmed.tapTarget,
          effectCount: confirmed.plan.terminal?.effectiveClearCount || 0
        }, { planValidated: true });
      };
      return executeDecision(this.planStrongestModeCoronationElsaAction(), true);
    }
    const isJudyNickNickSkillActive = (
      this.myTsum?.id === "judyNick" &&
      judyNickSession?.data?.currentMode === "nick"
    );
    if (!isJudyNickNickSkillActive) {
      this.strongestModeJudyNickNickPendingFreezeTap = false;
    } else {
      const findJudyNickNickFreezeTarget = () => {
        const isNickFreezeTarget = (target) => {
          if (!target?.target) {
            return false;
          }
          const entry = this.boardState.getFrozenEntry(target.target);
          return (
            entry?.freezeKind === JUDY_NICK_MOVING_FREEZE_KIND &&
            entry?.sessionId === judyNickSession.id
          );
        };
        const specialTarget = this.findStrongestSpecialTapTarget();
        if (isNickFreezeTarget(specialTarget)) {
          return specialTarget;
        }
        let best = null;
        for (const tsum of this.boardState.getJudyNickMovingFrozenNodes(judyNickSession.id)) {
          const frozenInfo = this.boardState.getFrozenTapInfo(tsum);
          const effectCount = frozenInfo ? calculateEffectiveClearCount(frozenInfo) : 0;
          if (effectCount <= 0) {
            continue;
          }
          if (
            !best ||
            effectCount > best.effectCount ||
            (effectCount === best.effectCount && tsum.y < best.y)
          ) {
            best = {
              type: "freeze",
              x: tsum.x,
              y: tsum.y,
              target: tsum,
              effectCount
            };
          }
        }
        return best;
      };
      if (this.strongestModeJudyNickNickPendingFreezeTap) {
        const nickFreezeTarget = findJudyNickNickFreezeTarget();
        this.strongestModeJudyNickNickPendingFreezeTap = false;
        if (nickFreezeTarget) {
          return this.inputRouter.handleTap({ x: nickFreezeTarget.x, y: nickFreezeTarget.y });
        }
      }
      const chain = this.findStrongestModeChain();
      if (Array.isArray(chain) && chain.length >= 3) {
        const chained = this.performStrongestModeChain(chain);
        if (chained) {
          this.strongestModeJudyNickNickPendingFreezeTap = true;
        }
        return chained;
      }
      const nickFreezeTarget = findJudyNickNickFreezeTarget();
      if (nickFreezeTarget) {
        this.strongestModeJudyNickNickPendingFreezeTap = false;
        return this.inputRouter.handleTap({ x: nickFreezeTarget.x, y: nickFreezeTarget.y });
      }
    }
    this.strongestModeCoronationElsaNoChainFrames = 0;
    const specialTarget = this.findStrongestSpecialTapTarget();
    if (specialTarget) {
      return this.inputRouter.handleTap({ x: specialTarget.x, y: specialTarget.y });
    }
    return performStrongestModeChainWithBombCancel(this.findStrongestModeChain());
  }

  findStrongestSpecialTapTarget() {
    let best = null;
    const consider = (candidate) => {
      if (!candidate || candidate.effectCount <= 0) {
        return;
      }
      if (
        !best ||
        candidate.effectCount > best.effectCount ||
        (candidate.effectCount === best.effectCount && candidate.y < best.y)
      ) {
        best = candidate;
      }
    };
    for (const tsum of this.tsums) {
      if (!tsum || tsum.dead || tsum.removing) {
        continue;
      }
      if (this.boardState.isFrozen(tsum)) {
        const frozenInfo = this.boardState.getFrozenTapInfo(tsum);
        const effectCount = frozenInfo ? calculateEffectiveClearCount(frozenInfo) : 0;
        consider({
          type: "freeze",
          x: tsum.x,
          y: tsum.y,
          target: tsum,
          effectCount
        });
      }
      if (this.boardState.hasBubble(tsum) && this.isTsumInPlayArea(tsum)) {
        const targets = this.previewStrongestModeBubbleTargets(tsum);
        consider({
          type: "bubble",
          x: tsum.x,
          y: tsum.y,
          target: tsum,
          effectCount: targets.length
        });
      }
    }
    return best;
  }

  previewStrongestModeBubbleTargets(startNode) {
    if (!startNode || !this.boardState.hasBubble(startNode)) {
      return [];
    }
    const seen = new Set();
    const queue = [startNode];
    const targets = [];
    while (queue.length) {
      const source = queue.shift();
      if (!source || source.dead || source.removing) {
        continue;
      }
      const bubbleEntry = this.boardState.getBubbleEntry(source);
      if (!bubbleEntry) {
        continue;
      }
      for (const tsum of this.tsums) {
        if (!tsum || tsum.dead || tsum.removing || seen.has(tsum.id)) {
          continue;
        }
        if (distance(source.x, source.y, tsum.x, tsum.y) <= bubbleEntry.radius) {
          seen.add(tsum.id);
          targets.push(tsum);
          if (this.boardState.hasBubble(tsum)) {
            queue.push(tsum);
          }
        }
      }
    }
    return targets;
  }

  findStrongestModeBombTarget(nextChain = []) {
    const liveBombs = this.getStrongestModeValidBombs();
    if (liveBombs.length <= 0) {
      return null;
    }
    const nextChainCreatesBomb = Array.isArray(nextChain) &&
      nextChain.length >= 3 &&
      this.willStrongestModeChainCreateBomb(nextChain);
    if (liveBombs.length < 2 && !nextChainCreatesBomb) {
      return null;
    }
    return this.findStrongestModeBestBomb(liveBombs);
  }

  findStrongestModeBestBomb(bombs = this.getStrongestModeValidBombs()) {
    let best = null;
    for (const bomb of bombs) {
      const radius = bomb.effectRadius || BOMB_BLAST_RADIUS;
      let effectCount = 0;
      for (const tsum of this.tsums) {
        if (
          tsum &&
          !tsum.dead &&
          !tsum.removing &&
          this.isTsumInPlayArea(tsum) &&
          this.boardState.canBombAffectNode(tsum, bomb.bombType || "normal") &&
          distance(bomb.x, bomb.y, tsum.x, tsum.y) <= radius
        ) {
          effectCount += 1;
        }
      }
      if (
        !best ||
        effectCount > best.effectCount ||
        (effectCount === best.effectCount && bomb.y < best.bomb.y)
      ) {
        best = { bomb, effectCount };
      }
    }
    return best?.bomb || null;
  }

  tryPerformStrongestModeFeverBombCancel() {
    const validBombs = this.getStrongestModeValidBombs();
    if (!shouldUseStrongestModeFeverBombCancel({
      strongestModeEnabled: this.strongestModeEnabled,
      feverActive: this.feverSystem.active,
      feverGauge: this.feverSystem.gauge,
      activeSkillCount: this.skillRuntime.sessions.length,
      validBombCount: validBombs.length
    })) {
      return false;
    }

    const snapshotNodes = this.getStrongestModeChainNodes();
    if (snapshotNodes.length < 3) {
      return false;
    }
    const remainingSnapshotIds = new Set(snapshotNodes.map((tsum) => tsum.id));
    let reservedBomb = this.findStrongestModeBestBomb(validBombs);
    if (!reservedBomb) {
      return false;
    }

    const maxChains = Math.floor(snapshotNodes.length / 3);
    let performed = 0;
    const performedLengths = [];
    while (performed < maxChains) {
      const chain = this.findStrongestModeBestChain({
        minLength: 3,
        filterNode: (tsum) => remainingSnapshotIds.has(tsum.id)
      });
      if (
        !Array.isArray(chain) ||
        chain.length < 3 ||
        chain.some((tsum) => !remainingSnapshotIds.has(tsum.id))
      ) {
        break;
      }
      const chained = this.performStrongestModeChain(chain, {
        allowChainQueueDuringActiveClear: true
      });
      if (!chained) {
        break;
      }
      for (const tsum of chain) {
        remainingSnapshotIds.delete(tsum.id);
      }
      performedLengths.push(chain.length);
      performed += 1;
    }

    if (performed <= 0) {
      return false;
    }
    if (!this.isStrongestModeDeferredBombTargetValid(reservedBomb)) {
      reservedBomb = this.findStrongestModeBestBomb();
    }
    let bombCancelMethod = "unavailable";
    if (reservedBomb && this.isStrongestModeDeferredBombTargetValid(reservedBomb)) {
      const tapped = this.inputRouter.handleTap({ x: reservedBomb.x, y: reservedBomb.y });
      bombCancelMethod = tapped ? "tap" : "tap-failed";
      if (!tapped && this.canBombCancelActiveChain()) {
        this.explodeBomb(reservedBomb);
        bombCancelMethod = "direct";
      }
    }
    if (this.coronationElsaDebug || this.aiLearningDebug) {
      console.log("[STRONGEST FEVER BOMB CANCEL]", {
        feverGauge: this.feverSystem.gauge,
        snapshotNodeCount: snapshotNodes.length,
        chainCount: performed,
        chainLengths: performedLengths,
        bombId: reservedBomb?.id || null,
        bombCancelMethod
      });
    }
    return true;
  }

  isStrongestModeDeferredBombTargetValid(bomb) {
    return !!(
      bomb &&
      this.bombs.includes(bomb) &&
      !bomb.dead &&
      !bomb.removing &&
      this.findBombAt(bomb.x, bomb.y) === bomb
    );
  }

  getStrongestModeValidBombs() {
    return this.bombs.filter((bomb) => this.isStrongestModeDeferredBombTargetValid(bomb));
  }

  normalizeStrongestModeBombCount(targetBombCount = 1) {
    if (!this.strongestModeEnabled) {
      return false;
    }
    const liveBombs = this.getStrongestModeValidBombs();
    const targetCount = Math.max(0, targetBombCount);
    if (liveBombs.length <= targetCount) {
      return false;
    }
    const excessCount = liveBombs.length - targetCount;
    const bomb = liveBombs[excessCount - 1] || liveBombs[0];
    if (!bomb) {
      return false;
    }
    const tapped = this.inputRouter.handleTap({ x: bomb.x, y: bomb.y });
    if (tapped) {
      return true;
    }
    if (
      this.isStrongestModeDeferredBombTargetValid(bomb) &&
      (!this.actionLock || this.canBombCancelActiveChain())
    ) {
      this.explodeBomb(bomb);
      return true;
    }
    return false;
  }

  willStrongestModeChainCreateBomb(chain) {
    if (!Array.isArray(chain) || chain.length < 3) {
      return false;
    }
    const effectiveClearCount = calculateEffectiveClearCount({ targets: chain });
    const bombCountModifier = this.activeItems.bomb ? 1 : 0;
    const effectiveBombCount = getEffectiveBombCount(effectiveClearCount, bombCountModifier);
    const moanaSession = this.getActiveSkillSession("guidingMoana");
    if (moanaSession) {
      const threshold = skillValue("guidingMoana", "chainToSpecialBombMin", moanaSession.level);
      return effectiveBombCount >= threshold;
    }
    if (this.isGastonLoopActive()) {
      return effectiveBombCount >= 7;
    }
    return effectiveBombCount >= 7;
  }

  findStrongestModeChain() {
    const isCoronationElsaSkillActive = (
      this.myTsum?.id === "coronationElsa" &&
      !!this.getActiveSkillSession("coronationElsa")
    );
    const strategy = strongestSkillStrategies[this.myTsum?.id];
    const strategyChain = strategy ? strategy(this, { track: true }) : null;
    if (Array.isArray(strategyChain) && strategyChain.length >= 3) {
      if (isCoronationElsaSkillActive) {
        this.strongestModeCoronationElsaNoFreezeTargetWaitFrames = 0;
        this.strongestModeCoronationElsaEarlyFreezeTapWaitFrames = 0;
        if (!strategyChain.strongestModeCoronationElsaSource) {
          strategyChain.strongestModeCoronationElsaSource = "planner";
        }
      }
      return strategyChain;
    }
    if (isCoronationElsaSkillActive) {
      return [];
    }
    return this.findStrongestModeBestChain({ minLength: 3 });
  }

  findStrongestModeCoronationElsaAnyTraceChain() {
    const chain = this.findStrongestModeBestChain({
      minLength: 3,
      maxLength: 6
    });
    if (Array.isArray(chain) && chain.length >= 3) {
      chain.strongestModeCoronationElsaSource = "anyTraceFallback";
      return chain;
    }
    return [];
  }

  findStrongestModeBestChain(options = {}) {
    const minLength = options.minLength || 3;
    const maxLength = Number.isFinite(options.maxLength) ? options.maxLength : Infinity;
    const minY = Number.isFinite(options.minY) ? options.minY : -Infinity;
    const filterNode = typeof options.filterNode === "function" ? options.filterNode : null;
    const liveNodes = this.getStrongestModeChainNodes().filter((tsum) => (
      tsum.y >= minY &&
      (!filterNode || filterNode(tsum))
    ));
    let best = [];
    let bestScore = -Infinity;
    const previewCandidateLimit = 8;
    const previewCandidates = [];
    for (const start of liveNodes) {
      const rule = this.getChainBehaviorForStart(start);
      if (!rule || !rule.allowedTypeIds?.size) {
        continue;
      }
      if (options.preferredRuleMode && rule.mode !== options.preferredRuleMode) {
        continue;
      }
      if (options.requiredTypeIds && !options.requiredTypeIds.has(this.boardState.getResolvedType(start).id)) {
        continue;
      }
      const nodes = liveNodes.filter((tsum) => rule.allowedTypeIds.has(this.boardState.getResolvedType(tsum).id));
      const chain = this.findStrongestModeGreedyChain(start, nodes, rule, maxLength);
      if (chain.length < minLength) {
        continue;
      }
      const score = this.scoreStrongestModeChain(chain, options);
      if (score > bestScore) {
        best = chain;
        bestScore = score;
      }
    }
    return best;
  }

  isStrongestModeCoronationElsaEdgeStart(tsum, edgeBand = TSUM_RADIUS * 2) {
    if (!tsum || !Number.isFinite(tsum.x) || !Number.isFinite(tsum.y)) {
      return false;
    }
    return (
      Math.abs(tsum.x - FIELD_LEFT) <= edgeBand ||
      Math.abs(FIELD_RIGHT - tsum.x) <= edgeBand ||
      Math.abs(FIELD_BOTTOM - tsum.y) <= edgeBand
    );
  }

  getStrongestModeCoronationElsaStartDirections(tsum, edgeBand = TSUM_RADIUS * 2) {
    if (!this.isStrongestModeCoronationElsaEdgeStart(tsum, edgeBand)) {
      return [];
    }
    const directions = [];
    if (Math.abs(FIELD_BOTTOM - tsum.y) <= edgeBand) {
      directions.push("horizontal");
    }
    if (
      Math.abs(tsum.x - FIELD_LEFT) <= edgeBand ||
      Math.abs(FIELD_RIGHT - tsum.x) <= edgeBand
    ) {
      directions.push("vertical");
    }
    return directions;
  }

  getStrongestModeCoronationElsaDirectionalGeometry(chain, direction, options = {}) {
    if (!Array.isArray(chain) || chain.length < 2) {
      return null;
    }
    const start = chain[0];
    const end = chain[chain.length - 1];
    const endpointEdgeBand = Number.isFinite(options.endpointEdgeBand)
      ? options.endpointEdgeBand
      : TSUM_RADIUS * 2;
    const intermediateEdgeBand = Number.isFinite(options.intermediateEdgeBand)
      ? options.intermediateEdgeBand
      : TSUM_RADIUS * 4;
    const fullBoard = !!options.fullBoard;
    const startsAtLeft = Math.abs(start.x - FIELD_LEFT) <= endpointEdgeBand;
    const startsAtRight = Math.abs(FIELD_RIGHT - start.x) <= endpointEdgeBand;
    const startsAtBottom = Math.abs(FIELD_BOTTOM - start.y) <= endpointEdgeBand;
    let primarySpan = 0;
    let perpendicularSpan = 0;
    let maxPerpendicularSpan = 0;
    let lane = 0;
    let edge = null;
    let staysInEdgeLane = false;
    if (fullBoard && direction === "vertical") {
      primarySpan = Math.abs(end.y - start.y);
      perpendicularSpan = Math.abs(end.x - start.x);
      maxPerpendicularSpan = chain.reduce(
        (maximum, node) => Math.max(maximum, Math.abs(node.x - start.x)),
        0
      );
      lane = (start.x + end.x) * 0.5;
      staysInEdgeLane = true;
    } else if (fullBoard && direction === "horizontal") {
      primarySpan = Math.abs(end.x - start.x);
      perpendicularSpan = Math.abs(end.y - start.y);
      maxPerpendicularSpan = chain.reduce(
        (maximum, node) => Math.max(maximum, Math.abs(node.y - start.y)),
        0
      );
      lane = (start.y + end.y) * 0.5;
      staysInEdgeLane = true;
    } else if (direction === "vertical" && (startsAtLeft || startsAtRight)) {
      edge = startsAtLeft && startsAtRight
        ? (Math.abs(start.x - FIELD_LEFT) <= Math.abs(FIELD_RIGHT - start.x) ? "left" : "right")
        : (startsAtLeft ? "left" : "right");
      primarySpan = Math.abs(end.y - start.y);
      perpendicularSpan = Math.abs(end.x - start.x);
      maxPerpendicularSpan = chain.reduce(
        (maximum, node) => Math.max(maximum, Math.abs(node.x - start.x)),
        0
      );
      lane = (start.x + end.x) * 0.5;
      const endInEdgeLane = Math.abs(
        edge === "left" ? end.x - FIELD_LEFT : FIELD_RIGHT - end.x
      ) <= endpointEdgeBand;
      staysInEdgeLane = chain.every((node) => (
        Math.abs((edge === "left" ? node.x - FIELD_LEFT : FIELD_RIGHT - node.x)) <= intermediateEdgeBand
      )) && endInEdgeLane;
    } else if (direction === "horizontal" && startsAtBottom) {
      edge = "bottom";
      primarySpan = Math.abs(end.x - start.x);
      perpendicularSpan = Math.abs(end.y - start.y);
      maxPerpendicularSpan = chain.reduce(
        (maximum, node) => Math.max(maximum, Math.abs(node.y - start.y)),
        0
      );
      lane = (start.y + end.y) * 0.5;
      const endInEdgeLane = Math.abs(FIELD_BOTTOM - end.y) <= endpointEdgeBand;
      staysInEdgeLane = chain.every((node) => (
        Math.abs(FIELD_BOTTOM - node.y) <= intermediateEdgeBand
      )) && endInEdgeLane;
    } else {
      return null;
    }
    const alignmentRatio = primarySpan > 0 ? perpendicularSpan / primarySpan : Infinity;
    return {
      direction,
      edge,
      primarySpan,
      perpendicularSpan,
      maxPerpendicularSpan,
      alignmentRatio,
      lane,
      endpointEdgeBand,
      intermediateEdgeBand,
      fullBoard,
      staysInEdgeLane,
      valid: (
        staysInEdgeLane &&
        primarySpan >= TSUM_RADIUS * 2 &&
        alignmentRatio <= 0.35 &&
        (!fullBoard || maxPerpendicularSpan / primarySpan <= 0.35)
      )
    };
  }

  findStrongestModeCoronationElsaDirectionalChains(
    start,
    nodes,
    rule,
    maxLength,
    direction,
    adjacency = null,
    geometryOptions = {}
  ) {
    if (!start || !Array.isArray(nodes) || !rule || maxLength < 3) {
      return [];
    }
    const stateLimit = 256;
    const resultLimit = 8;
    const getNeighbors = (node) => {
      if (adjacency?.has(node.id)) {
        return adjacency.get(node.id);
      }
      return nodes.filter((candidate) => (
        candidate.id !== node.id && this.canConnectWithChainRule(rule, node, candidate)
      ));
    };
    const stack = [{ chain: [start], used: new Set([start.id]) }];
    const results = [];
    let exploredStateCount = 0;
    while (stack.length && exploredStateCount < stateLimit) {
      const state = stack.pop();
      exploredStateCount += 1;
      const current = state.chain[state.chain.length - 1];
      const geometry = this.getStrongestModeCoronationElsaDirectionalGeometry(
        state.chain,
        direction,
        geometryOptions
      );
      if (state.chain.length >= 3 && geometry?.valid) {
        const onward = getNeighbors(current).filter((candidate) => !state.used.has(candidate.id)).length;
        const searchScore = geometry.primarySpan * 2.2
          - geometry.maxPerpendicularSpan * 3.2
          + onward * 18
          + state.chain.length * 4;
        results.push({ chain: state.chain, geometry, searchScore });
      }
      if (state.chain.length >= maxLength) {
        continue;
      }
      const neighbors = getNeighbors(current)
        .filter((candidate) => !state.used.has(candidate.id))
        .sort((a, b) => String(a.id).localeCompare(String(b.id)));
      for (let index = neighbors.length - 1; index >= 0; index -= 1) {
        const candidate = neighbors[index];
        const chain = [...state.chain, candidate];
        const candidateGeometry = this.getStrongestModeCoronationElsaDirectionalGeometry(
          chain,
          direction,
          geometryOptions
        );
        if (!candidateGeometry?.staysInEdgeLane) {
          continue;
        }
        const used = new Set(state.used);
        used.add(candidate.id);
        stack.push({ chain, used });
      }
    }
    results.sort((a, b) => (
      b.searchScore - a.searchScore ||
      String(a.chain.map((tsum) => tsum.id).join("|")).localeCompare(String(b.chain.map((tsum) => tsum.id).join("|")))
    ));
    return results.slice(0, resultLimit);
  }

  findStrongestModeCoronationElsaBestPreviewChain(options = {}) {
    if (!options.searchTier) {
      const plannerSnapshot = options.plannerSnapshot || buildCoronationElsaPlannerSnapshot(
        this,
        this.selectedSkillLevel
      );
      const committedTraceCount = this.getStrongestModeCoronationElsaSkillSummary?.()?.chainCount || 0;
      const minimumTraceCount = this.strongestModeCoronationElsaMinimumTraceCount || 4;
      const needsMinimumTraces = committedTraceCount < minimumTraceCount;
      const tiers = [
        { searchTier: "primary58", endpointEdgeBand: TSUM_RADIUS * 2, intermediateEdgeBand: TSUM_RADIUS * 4 },
        { searchTier: "secondary116", endpointEdgeBand: TSUM_RADIUS * 4, intermediateEdgeBand: TSUM_RADIUS * 4 }
      ];
      if (needsMinimumTraces) {
        tiers.push(
          { searchTier: "tertiary174", endpointEdgeBand: TSUM_RADIUS * 6, intermediateEdgeBand: TSUM_RADIUS * 6 },
          { searchTier: "fullBoard", fullBoard: true }
        );
      }
      const diagnostics = {};
      let selected = [];
      let selectedTier = null;
      for (const tier of tiers) {
        const candidate = this.findStrongestModeCoronationElsaBestPreviewChain({
          ...options,
          ...tier,
          committedTraceCount,
          plannerSnapshot
        });
        diagnostics[tier.searchTier] = this.strongestModeCoronationElsaLastTierSearchDiagnostics || null;
        if (Array.isArray(candidate) && candidate.length >= (options.minLength || 3)) {
          selected = candidate;
          selectedTier = tier.searchTier;
          break;
        }
      }
      this.strongestModeCoronationElsaLastSearchDiagnostics = {
        selectedTier,
        committedTraceCount,
        needsMinimumTraces,
        primary: diagnostics.primary58 || null,
        secondary: diagnostics.secondary116 || null,
        tertiary: diagnostics.tertiary174 || null,
        fullBoard: diagnostics.fullBoard || null
      };
      return selected;
    }
    const plannerSnapshot = options.plannerSnapshot || buildCoronationElsaPlannerSnapshot(
      this,
      this.selectedSkillLevel
    );
    const searchStartedAt = typeof performance !== "undefined" ? performance.now() : Date.now();
    const searchTier = options.searchTier;
    const endpointEdgeBand = Number.isFinite(options.endpointEdgeBand)
      ? options.endpointEdgeBand
      : TSUM_RADIUS * 2;
    const intermediateEdgeBand = Number.isFinite(options.intermediateEdgeBand)
      ? options.intermediateEdgeBand
      : TSUM_RADIUS * 4;
    const fullBoard = !!options.fullBoard;
    const geometryOptions = { endpointEdgeBand, intermediateEdgeBand, fullBoard };
    const committedTraceCount = Number.isFinite(options.committedTraceCount)
      ? options.committedTraceCount
      : (this.getStrongestModeCoronationElsaSkillSummary?.()?.chainCount || 0);
    const minimumTraceCount = this.strongestModeCoronationElsaMinimumTraceCount || 4;
    const prioritizeNextCandidate = committedTraceCount + 1 < minimumTraceCount;
    const minLength = options.minLength || 3;
    const maxLength = Number.isFinite(options.maxLength) ? options.maxLength : Infinity;
    const minY = Number.isFinite(options.minY) ? options.minY : -Infinity;
    const filterNode = typeof options.filterNode === "function" ? options.filterNode : null;
    const potentialSourceNodes = this.getStrongestModeChainNodes().filter((tsum) => tsum.y >= minY);
    const liveNodes = potentialSourceNodes.filter((tsum) => (
      tsum.y >= minY &&
      (!filterNode || filterNode(tsum))
    ));
    const searchContextByRuleKey = new Map();
    const getSearchContext = (rule, sourceNodes = liveNodes) => {
      const allowedTypeKey = Array.from(rule.allowedTypeIds || []).sort().join(",");
      const ruleKey = `${rule.mode || "normal"}:${allowedTypeKey}:${rule.subtypeId || ""}:${rule.unlimitedDistance ? 1 : 0}`;
      const canReuse = sourceNodes === liveNodes;
      if (canReuse && searchContextByRuleKey.has(ruleKey)) {
        return searchContextByRuleKey.get(ruleKey);
      }
      const nodes = sourceNodes.filter((tsum) => rule.allowedTypeIds.has(this.boardState.getResolvedType(tsum).id));
      const adjacency = new Map(nodes.map((node) => [node.id, []]));
      for (let firstIndex = 0; firstIndex < nodes.length; firstIndex += 1) {
        for (let secondIndex = firstIndex + 1; secondIndex < nodes.length; secondIndex += 1) {
          const first = nodes[firstIndex];
          const second = nodes[secondIndex];
          if (this.canConnectWithChainRule(rule, first, second)) {
            adjacency.get(first.id).push(second);
          }
          if (this.canConnectWithChainRule(rule, second, first)) {
            adjacency.get(second.id).push(first);
          }
        }
      }
      for (const neighbors of adjacency.values()) {
        neighbors.sort((a, b) => String(a.id).localeCompare(String(b.id)));
      }
      const context = { nodes, adjacency };
      if (canReuse) {
        searchContextByRuleKey.set(ruleKey, context);
      }
      return context;
    };
    const candidateKeys = new Set();
    const directionalCandidates = [];
    let edgeStartCount = 0;
    for (const start of liveNodes) {
      const directions = fullBoard
        ? ["vertical", "horizontal"]
        : this.getStrongestModeCoronationElsaStartDirections(start, endpointEdgeBand);
      if (!directions.length) {
        continue;
      }
      edgeStartCount += 1;
      const rule = this.getChainBehaviorForStart(start);
      if (!rule || !rule.allowedTypeIds?.size) {
        continue;
      }
      const searchContext = getSearchContext(rule);
      for (const direction of directions) {
        const directionalChains = this.findStrongestModeCoronationElsaDirectionalChains(
          start,
          searchContext.nodes,
          rule,
          maxLength,
          direction,
          searchContext.adjacency,
          geometryOptions
        );
        for (const directionalChain of directionalChains) {
          const chain = directionalChain.chain;
          if (chain.length < minLength) {
            continue;
          }
          const pathKey = `${direction}:${chain.map((tsum) => String(tsum.id)).join("|")}`;
          if (candidateKeys.has(pathKey)) {
            continue;
          }
          candidateKeys.add(pathKey);
          directionalCandidates.push({ ...directionalChain, direction, pathKey });
        }
      }
    }
    if (!directionalCandidates.length) {
      const searchEndedAt = typeof performance !== "undefined" ? performance.now() : Date.now();
      this.strongestModeCoronationElsaLastTierSearchDiagnostics = {
        searchTier,
        filtered: !!filterNode,
        liveNodeCount: liveNodes.length,
        edgeStartCount,
        directionalCandidateCount: 0,
        previewCandidateCount: 0,
        frozenCount: this.boardState.getFrozenNodesByKind("coronationElsa").length,
        elapsedMs: searchEndedAt - searchStartedAt
      };
      return [];
    }
    directionalCandidates.sort((a, b) => b.searchScore - a.searchScore || a.pathKey.localeCompare(b.pathKey));
    const previewCandidateLimitPerDirection = 32;
    const previewCandidates = ["vertical", "horizontal"].flatMap((direction) => (
      directionalCandidates
        .filter((candidate) => candidate.direction === direction)
        .slice(0, previewCandidateLimitPerDirection)
    ));
    const lineRadius = skillValue("coronationElsa", "freezeRadius", this.selectedSkillLevel) * 0.58;
    const existingFrozenNodes = this.boardState.getFrozenNodesByKind("coronationElsa");
    const rankByIceProximity = searchTier !== "primary58" && existingFrozenNodes.length > 0;
    const getEndpointIceDistance = (chain) => {
      if (!rankByIceProximity || !chain.length) {
        return null;
      }
      const start = chain[0];
      const end = chain[chain.length - 1];
      const nearestDistance = (node) => existingFrozenNodes.reduce(
        (nearest, frozen) => Math.min(nearest, distance(node.x, node.y, frozen.x, frozen.y)),
        Infinity
      );
      return Math.round(nearestDistance(start) + nearestDistance(end));
    };
    const isBetterWithoutNextPotential = (candidate, current) => {
      if (!current) {
        return true;
      }
      if (
        rankByIceProximity &&
        candidate.iceProximityDistancePx !== current.iceProximityDistancePx
      ) {
        return candidate.iceProximityDistancePx < current.iceProximityDistancePx;
      }
      return (
        candidate.predictedClearCount > current.predictedClearCount ||
        (
          candidate.predictedClearCount === current.predictedClearCount &&
          (
            candidate.lineTargetCount > current.lineTargetCount ||
            (
              candidate.lineTargetCount === current.lineTargetCount &&
              (
                candidate.newFrozenCount > current.newFrozenCount ||
                (
                  candidate.newFrozenCount === current.newFrozenCount &&
                  candidate.pathKey < current.pathKey
                )
              )
            )
          )
        )
      );
    };
    const laneCandidates = new Map();
    const evaluatedPreviewCandidates = [];
    for (const candidate of previewCandidates) {
      const preview = computeCoronationElsaFreezePreview(
        this,
        candidate.chain,
        this.selectedSkillLevel,
        plannerSnapshot
      );
      const newFrozenCount = preview.targets.reduce((count, tsum) => (
        count + (preview.priorFrozenIds.has(tsum.id) ? 0 : 1)
      ), 0);
      const evaluated = {
        ...candidate,
        preview,
        predictedClearCount: preview.targets.length,
        lineTargetCount: preview.lineTargets.length,
        newFrozenCount,
        iceProximityDistancePx: getEndpointIceDistance(candidate.chain),
        nextChainPotential: null
      };
      evaluatedPreviewCandidates.push(evaluated);
      const laneKey = `${candidate.direction}:${Math.round(candidate.geometry.lane / Math.max(1, lineRadius))}`;
      const current = laneCandidates.get(laneKey);
      if (isBetterWithoutNextPotential(evaluated, current)) {
        laneCandidates.set(laneKey, evaluated);
      }
    }
    const candidates = prioritizeNextCandidate
      ? evaluatedPreviewCandidates
      : Array.from(laneCandidates.values());
    const getNextChainPotential = (candidate) => {
      if (candidate.nextChainPotential != null) {
        return candidate.nextChainPotential;
      }
      const frozenIds = new Set(candidate.preview.targets.map((tsum) => tsum.id));
      // Stability controls when a trace may start, not whether a route will remain
      // after this freeze. Include currently moving Tsums in this read-only lookahead.
      const remainingNodes = potentialSourceNodes.filter((tsum) => !frozenIds.has(tsum.id));
      const remainingContexts = new Map();
      const getRemainingContext = (rule) => {
        const ruleKey = `${rule.mode || "normal"}:${Array.from(rule.allowedTypeIds || []).sort().join(",")}:${rule.subtypeId || ""}:${rule.unlimitedDistance ? 1 : 0}`;
        if (!remainingContexts.has(ruleKey)) {
          remainingContexts.set(ruleKey, getSearchContext(rule, remainingNodes));
        }
        return remainingContexts.get(ruleKey);
      };
      let potential = 0;
      const nextTiers = prioritizeNextCandidate ? [
        { endpointEdgeBand: TSUM_RADIUS * 2, intermediateEdgeBand: TSUM_RADIUS * 4, fullBoard: false },
        { endpointEdgeBand: TSUM_RADIUS * 4, intermediateEdgeBand: TSUM_RADIUS * 4, fullBoard: false },
        { endpointEdgeBand: TSUM_RADIUS * 6, intermediateEdgeBand: TSUM_RADIUS * 6, fullBoard: false },
        { endpointEdgeBand, intermediateEdgeBand, fullBoard: true }
      ] : [geometryOptions];
      for (const nextTier of nextTiers) {
        for (const start of remainingNodes) {
          const directions = nextTier.fullBoard
            ? ["vertical", "horizontal"]
            : this.getStrongestModeCoronationElsaStartDirections(start, nextTier.endpointEdgeBand);
          if (!directions.length) continue;
          const rule = this.getChainBehaviorForStart(start);
          if (!rule || !rule.allowedTypeIds?.size) continue;
          const searchContext = getRemainingContext(rule);
          for (const direction of directions) {
            const nextChains = this.findStrongestModeCoronationElsaDirectionalChains(
              start, searchContext.nodes, rule, maxLength, direction, searchContext.adjacency, nextTier
            );
            for (const nextChain of nextChains) {
              potential = Math.max(potential, nextChain.chain.length);
            }
          }
          if (potential >= maxLength) break;
        }
        if (potential >= 3) break;
      }
      candidate.nextChainPotential = potential;
      return potential;
    };
    let best = candidates[0];
    for (let index = 1; index < candidates.length; index += 1) {
      const candidate = candidates[index];
      if (prioritizeNextCandidate) {
        const candidatePreservesNext = getNextChainPotential(candidate) >= 3;
        const bestPreservesNext = getNextChainPotential(best) >= 3;
        if (candidatePreservesNext !== bestPreservesNext) {
          if (candidatePreservesNext) best = candidate;
          continue;
        }
      }
      if (
        rankByIceProximity &&
        candidate.iceProximityDistancePx !== best.iceProximityDistancePx
      ) {
        if (candidate.iceProximityDistancePx < best.iceProximityDistancePx) {
          best = candidate;
        }
        continue;
      }
      if (candidate.predictedClearCount !== best.predictedClearCount) {
        if (candidate.predictedClearCount > best.predictedClearCount) {
          best = candidate;
        }
        continue;
      }
      if (candidate.lineTargetCount !== best.lineTargetCount) {
        if (candidate.lineTargetCount > best.lineTargetCount) {
          best = candidate;
        }
        continue;
      }
      if (candidate.newFrozenCount !== best.newFrozenCount) {
        if (candidate.newFrozenCount > best.newFrozenCount) {
          best = candidate;
        }
        continue;
      }
      if (prioritizeNextCandidate) {
        const candidatePotential = getNextChainPotential(candidate);
        const bestPotential = getNextChainPotential(best);
        if (candidatePotential !== bestPotential) {
          if (candidatePotential > bestPotential) best = candidate;
          continue;
        }
      }
      if (candidate.pathKey < best.pathKey) {
        best = candidate;
      }
    }
    const searchEndedAt = typeof performance !== "undefined" ? performance.now() : Date.now();
    const searchElapsedMs = searchEndedAt - searchStartedAt;
    Object.defineProperty(best.chain, "strongestModeCoronationElsaPlan", {
      configurable: true,
      value: {
        searchTier,
        direction: best.direction,
        edge: best.geometry.edge,
        lane: best.geometry.lane,
        endpointEdgeBand,
        intermediateEdgeBand,
        iceProximityDistancePx: best.iceProximityDistancePx,
        directionalCandidateCount: directionalCandidates.length,
        previewCandidateCount: previewCandidates.length,
        searchElapsedMs,
        predictedClearCount: best.predictedClearCount,
        lineTargetCount: best.lineTargetCount,
        newFrozenCount: best.newFrozenCount,
        nextChainPotential: prioritizeNextCandidate ? getNextChainPotential(best) : null,
        preservesNextTrace: prioritizeNextCandidate ? getNextChainPotential(best) >= 3 : null,
        committedTraceCountBefore: committedTraceCount
      }
    });
    this.strongestModeCoronationElsaLastTierSearchDiagnostics = {
      searchTier,
      filtered: !!filterNode,
      liveNodeCount: liveNodes.length,
      edgeStartCount,
      directionalCandidateCount: directionalCandidates.length,
      previewCandidateCount: previewCandidates.length,
      frozenCount: existingFrozenNodes.length,
      rankByIceProximity,
      prioritizeNextCandidate,
      selectedNextChainPotential: prioritizeNextCandidate ? getNextChainPotential(best) : null,
      selectedIceProximityDistancePx: best.iceProximityDistancePx,
      elapsedMs: searchElapsedMs
    };
    return best.chain;
  }

  findStrongestModeCoronationElsaProximityChain(options = {}) {
    const minLength = options.minLength || 3;
    const maxLength = Number.isFinite(options.maxLength) ? options.maxLength : Infinity;
    const minY = Number.isFinite(options.minY) ? options.minY : -Infinity;
    const frozenSampleLimit = Number.isFinite(options.frozenSampleLimit) ? options.frozenSampleLimit : 20;
    const boardCenterX = (FIELD_LEFT + FIELD_RIGHT) * 0.5;
    const anchorSide = this.strongestModeCoronationElsaAnchorSide;
    const anchorSign = anchorSide === "left" ? 1 : (anchorSide === "right" ? -1 : 0);
    const tracePlan = this.strongestModeCoronationElsaTracePlan;
    const frozenNodes = this.boardState.getFrozenNodesByKind("coronationElsa").slice(0, Math.max(1, frozenSampleLimit));
    if (!frozenNodes.length) {
      return this.findStrongestModeBestChain(options);
    }
    const liveNodes = this.getStrongestModeChainNodes().filter((tsum) => (
      tsum.y >= minY &&
      this.isStrongestModeCoronationElsaPracticalStableTsum(tsum)
    ));
    let best = [];
    let bestScore = -Infinity;
    const previewCandidateLimit = 8;
    const previewCandidates = [];
    const plannerSnapshot = buildCoronationElsaPlannerSnapshot(this, this.selectedSkillLevel);
    for (const start of liveNodes) {
      const rule = this.getChainBehaviorForStart(start);
      if (!rule || !rule.allowedTypeIds?.size) {
        continue;
      }
      const nodes = liveNodes.filter((tsum) => rule.allowedTypeIds.has(this.boardState.getResolvedType(tsum).id));
      const chain = this.findStrongestModeGreedyChain(start, nodes, rule, maxLength);
      if (chain.length < minLength) {
        continue;
      }
      let proximityScore = 0;
      let maxNearest = 0;
      for (const node of chain) {
        let nearest = Infinity;
        for (const frozen of frozenNodes) {
          const d = distance(node.x, node.y, frozen.x, frozen.y);
          if (d < nearest) {
            nearest = d;
          }
        }
        proximityScore += 1000 / (nearest + 1);
        maxNearest = Math.max(maxNearest, nearest);
      }
      const geometry = this.getStrongestModeCoronationElsaChainGeometry(chain);
      const chainCenterX = geometry?.centerX ?? boardCenterX;
      const chainCenterY = geometry?.centerY ?? FIELD_CENTER_Y;
      const anchorPenalty = anchorSign !== 0 ? ((chainCenterX - boardCenterX) * anchorSign) * 0.05 : 0;
      const verticalSpan = geometry?.verticalSpan ?? 0;
      const horizontalSpan = geometry?.horizontalSpan ?? 0;
      const anchorParallelBonus = anchorSign !== 0 && verticalSpan > horizontalSpan ? 14 : 0;
      const farIcePenalty = Math.max(0, maxNearest - 115) * 0.18;
      let tracePlanBonus = 0;
      let tracePlanPenalty = 0;
      if (tracePlan && geometry) {
        const chainLine = tracePlan.direction === "vertical" ? chainCenterX : chainCenterY;
        const sameDirection = geometry.direction === tracePlan.direction;
        const laneStep = 48;
        const shiftSign = tracePlan.anchorSide === "left" ? 1 : -1;
        const targetLine = tracePlan.direction === "vertical"
          ? Math.max(FIELD_LEFT, Math.min(FIELD_RIGHT, (tracePlan.lastLine ?? tracePlan.anchorLine) + shiftSign * laneStep))
          : Math.max(FIELD_TOP, Math.min(FIELD_BOTTOM, (tracePlan.lastLine ?? tracePlan.anchorLine) + laneStep));
        const distanceToTargetLine = Math.abs(chainLine - targetLine);
        const distanceToAnchorLine = Math.abs(chainLine - tracePlan.anchorLine);
        tracePlanBonus += sameDirection ? 22 : 0;
        tracePlanBonus += Math.max(0, 80 - distanceToTargetLine) * 0.32;
        tracePlanBonus += Math.max(0, 130 - distanceToAnchorLine) * 0.08;
        tracePlanPenalty += Math.max(0, distanceToAnchorLine - 190) * 0.12;
      }
      const score = proximityScore + chain.length * 5 + anchorParallelBonus + tracePlanBonus
        - anchorPenalty - farIcePenalty - tracePlanPenalty;
      previewCandidates.push({ chain, score });
      previewCandidates.sort((a, b) => b.score - a.score);
      if (previewCandidates.length > previewCandidateLimit) {
        previewCandidates.length = previewCandidateLimit;
      }
      if (score > bestScore) {
        best = chain;
        bestScore = score;
      }
    }
    const findRemainingPotentialChainLength = (excludedIds) => {
      const remainingNodes = liveNodes.filter((tsum) => !excludedIds.has(tsum.id));
      let bestLength = 0;
      for (const start of remainingNodes) {
        const rule = this.getChainBehaviorForStart(start);
        if (!rule || !rule.allowedTypeIds?.size) {
          continue;
        }
        const nodes = remainingNodes.filter((tsum) => rule.allowedTypeIds.has(this.boardState.getResolvedType(tsum).id));
        const chain = this.findStrongestModeGreedyChain(start, nodes, rule, maxLength);
        if (chain.length > bestLength) {
          bestLength = chain.length;
          if (bestLength >= 4) {
            break;
          }
        }
      }
      return bestLength;
    };
    for (const candidate of previewCandidates) {
      const preview = computeCoronationElsaFreezePreview(
        this,
        candidate.chain,
        this.selectedSkillLevel,
        plannerSnapshot
      );
      const priorOverlapCount = preview.targets.filter((tsum) => preview.priorFrozenIds.has(tsum.id)).length;
      const newFrozenCount = preview.targets.length - priorOverlapCount;
      const excludedIds = new Set(candidate.chain.map((tsum) => tsum.id));
      const remainingPotentialLength = findRemainingPotentialChainLength(excludedIds);
      const nextCandidatePotential = (
        remainingPotentialLength >= 3
          ? 10 + (remainingPotentialLength >= 4 ? 4 : 0)
          : 0
      );
      const previewScore = (
        preview.lineTargets.length * 0.35 +
        preview.surroundTargets.length * 0.75 +
        priorOverlapCount * 0.85 +
        newFrozenCount * 0.18 +
        nextCandidatePotential
      );
      const finalScore = candidate.score + previewScore;
      if (finalScore > bestScore) {
        best = candidate.chain;
        bestScore = finalScore;
      }
    }
    return best;
  }

  findStrongestModeCoronationElsaLowerChain(options = {}) {
    const safeLowerY = Math.max(
      Number.isFinite(options.minY) ? options.minY : -Infinity,
      FIELD_CENTER_Y
    );
    return this.findStrongestModeBestChain({
      ...options,
      minY: safeLowerY,
      filterNode: (tsum) => this.isStrongestModeCoronationElsaPracticalStableTsum(tsum)
    });
  }

  findStrongestModeCoronationElsaEdgeChain(options = {}) {
    const minLength = options.minLength || 3;
    const maxLength = Number.isFinite(options.maxLength) ? options.maxLength : Infinity;
    const minY = Number.isFinite(options.minY) ? options.minY : -Infinity;
    const boardCenterX = (FIELD_LEFT + FIELD_RIGHT) * 0.5;
    const anchorSide = this.strongestModeCoronationElsaAnchorSide;
    const anchorX = anchorSide === "left" ? FIELD_LEFT : (anchorSide === "right" ? FIELD_RIGHT : null);
    const tracePlan = this.strongestModeCoronationElsaTracePlan;
    const liveNodes = this.getStrongestModeChainNodes().filter((tsum) => (
      tsum.y >= minY &&
      this.isStrongestModeCoronationElsaPracticalStableTsum(tsum)
    ));
    let best = [];
    let bestScore = -Infinity;
    let bestCenterX = boardCenterX;
    for (const start of liveNodes) {
      const rule = this.getChainBehaviorForStart(start);
      if (!rule || !rule.allowedTypeIds?.size) {
        continue;
      }
      const nodes = liveNodes.filter((tsum) => rule.allowedTypeIds.has(this.boardState.getResolvedType(tsum).id));
      const chain = this.findStrongestModeGreedyChain(start, nodes, rule, maxLength);
      if (chain.length < minLength) {
        continue;
      }
      const geometry = this.getStrongestModeCoronationElsaChainGeometry(chain);
      const chainCenterX = geometry?.centerX ?? boardCenterX;
      const chainCenterY = geometry?.centerY ?? FIELD_CENTER_Y;
      const verticalSpan = geometry?.verticalSpan ?? 0;
      const horizontalSpan = geometry?.horizontalSpan ?? 0;
      const edgeDistance = Math.min(
        Math.abs(chainCenterX - FIELD_LEFT),
        Math.abs(FIELD_RIGHT - chainCenterX)
      );
      const startEdgeDistance = Math.min(
        Math.abs((geometry?.startX ?? chainCenterX) - FIELD_LEFT),
        Math.abs(FIELD_RIGHT - (geometry?.startX ?? chainCenterX))
      );
      const edgeBonus = Math.max(0, 150 - edgeDistance) * (tracePlan ? 0.28 : 0.48);
      const startEdgeBonus = Math.max(0, 130 - startEdgeDistance) * (tracePlan ? 0.18 : 0.42);
      const verticalEdgeBonus = verticalSpan > horizontalSpan ? (tracePlan ? 16 : 34) : 0;
      const centerCrossPenalty = (
        Math.min(geometry?.startX ?? chainCenterX, geometry?.endX ?? chainCenterX) < boardCenterX &&
        Math.max(geometry?.startX ?? chainCenterX, geometry?.endX ?? chainCenterX) > boardCenterX
      ) ? (tracePlan ? 18 : 32) : 0;
      const score = anchorX == null
        ? Math.abs(chainCenterX - boardCenterX) + chain.length * 5 + edgeBonus + startEdgeBonus + verticalEdgeBonus - centerCrossPenalty
        : -Math.abs(chainCenterX - anchorX) + chain.length * 5 + edgeBonus + startEdgeBonus + verticalEdgeBonus - centerCrossPenalty;
      if (score > bestScore) {
        best = chain;
        bestScore = score;
        bestCenterX = chainCenterX;
      }
    }
    if (best.length >= minLength && anchorX == null) {
      this.strongestModeCoronationElsaAnchorSide = bestCenterX <= boardCenterX ? "left" : "right";
    }
    return best;
  }

  isStrongestModeCoronationElsaStableTsum(tsum) {
    if (!tsum || tsum.dead || tsum.removing || tsum.clearOccupying || tsum.inChain) {
      return false;
    }
    if (!this.isTsumInPlayArea(tsum)) {
      return false;
    }
    if (tsum.y < this.getStrongestModeCoronationElsaSafePlayableY()) {
      return false;
    }
    if (
      Number.isFinite(tsum.spawnedAtElapsed) &&
      this.elapsed - tsum.spawnedAtElapsed < this.strongestModeCoronationElsaStableMinSpawnAgeSec
    ) {
      return false;
    }
    const velocityThreshold = this.strongestModeCoronationElsaStableVelocityThreshold;
    if (Math.abs(tsum.vx) > velocityThreshold || Math.abs(tsum.vy) > velocityThreshold) {
      return false;
    }
    if (typeof tsum.isSettled === "function") {
      return tsum.isSettled();
    }
    return this.isBodySettled(tsum);
  }

  isStrongestModeCoronationElsaPracticalStableTsum(tsum) {
    if (!tsum || tsum.dead || tsum.removing || tsum.clearOccupying || tsum.inChain) {
      return false;
    }
    if (this.boardState.isFrozen(tsum) || this.boardState.hasBubble(tsum)) {
      return false;
    }
    if (!this.isTsumInPlayArea(tsum)) {
      return false;
    }
    if (tsum.y < this.getStrongestModeCoronationElsaSafePlayableY()) {
      return false;
    }
    if (
      Number.isFinite(tsum.spawnedAtElapsed) &&
      this.elapsed - tsum.spawnedAtElapsed < this.strongestModeCoronationElsaPracticalStableMinSpawnAgeSec
    ) {
      return false;
    }
    const velocityThreshold = this.strongestModeCoronationElsaPracticalStableVelocityThreshold;
    return Math.abs(tsum.vx || 0) <= velocityThreshold && Math.abs(tsum.vy || 0) <= velocityThreshold;
  }

  isStrongestModeCoronationElsaSemiStableTsum(tsum) {
    if (!tsum || tsum.dead || tsum.removing || tsum.clearOccupying || tsum.inChain) {
      return false;
    }
    if (this.boardState.isFrozen(tsum) || this.boardState.hasBubble(tsum)) {
      return false;
    }
    if (!this.isTsumInPlayArea(tsum)) {
      return false;
    }
    if (tsum.y < this.getStrongestModeCoronationElsaSafePlayableY()) {
      return false;
    }
    if (
      Number.isFinite(tsum.spawnedAtElapsed) &&
      this.elapsed - tsum.spawnedAtElapsed < this.strongestModeCoronationElsaStableMinSpawnAgeSec
    ) {
      return false;
    }
    const velocityThreshold = this.strongestModeCoronationElsaSemiStableVelocityThreshold;
    return Math.abs(tsum.vx || 0) <= velocityThreshold && Math.abs(tsum.vy || 0) <= velocityThreshold;
  }

  resetStrongestModeCoronationElsaTracePlan() {
    this.strongestModeCoronationElsaTracePlan = null;
  }

  getStrongestModeCoronationElsaChainGeometry(chain) {
    if (!Array.isArray(chain) || chain.length === 0) {
      return null;
    }
    let sumX = 0;
    let sumY = 0;
    for (const node of chain) {
      sumX += node.x;
      sumY += node.y;
    }
    const centerX = sumX / chain.length;
    const centerY = sumY / chain.length;
    const start = chain[0];
    const end = chain[chain.length - 1];
    const verticalSpan = Math.abs((end?.y ?? centerY) - (start?.y ?? centerY));
    const horizontalSpan = Math.abs((end?.x ?? centerX) - (start?.x ?? centerX));
    const direction = verticalSpan >= horizontalSpan ? "vertical" : "horizontal";
    const line = direction === "vertical" ? centerX : centerY;
    return {
      centerX,
      centerY,
      startX: start?.x ?? centerX,
      startY: start?.y ?? centerY,
      endX: end?.x ?? centerX,
      endY: end?.y ?? centerY,
      verticalSpan,
      horizontalSpan,
      direction,
      line
    };
  }

  recordStrongestModeCoronationElsaTracePlanChain(chain) {
    if (!this.strongestModeEnabled || this.myTsum?.id !== "coronationElsa") {
      return;
    }
    const geometry = this.getStrongestModeCoronationElsaChainGeometry(chain);
    if (!geometry) {
      return;
    }
    if (!this.strongestModeCoronationElsaTracePlan) {
      const boardCenterX = (FIELD_LEFT + FIELD_RIGHT) * 0.5;
      const anchorSide = geometry.centerX <= boardCenterX ? "left" : "right";
      this.strongestModeCoronationElsaTracePlan = {
        direction: geometry.direction,
        anchorLine: geometry.line,
        anchorSide,
        lastLine: geometry.line
      };
      this.strongestModeCoronationElsaAnchorSide = anchorSide;
      return;
    }
    this.strongestModeCoronationElsaTracePlan.lastLine = geometry.line;
  }

  getStrongestModeCoronationElsaNoChainDiagnostics() {
    const strategyChain = strongestSkillStrategies.coronationElsa(this, { track: false }) || [];
    const stableFallbackChain = this.findStrongestModeCoronationElsaBestPreviewChain({
      minLength: 3,
      maxLength: 6,
      minY: this.getStrongestModeCoronationElsaSafePlayableY(),
      filterNode: (tsum) => this.isStrongestModeCoronationElsaPracticalStableTsum(tsum)
    }) || [];
    const relaxedFallbackChain = this.findStrongestModeCoronationElsaBestPreviewChain({
      minLength: 3,
      maxLength: 6,
      minY: this.getStrongestModeCoronationElsaSafePlayableY()
    }) || [];
    const relaxedFallbackStableNodeCount = relaxedFallbackChain.filter((tsum) => (
      this.isStrongestModeCoronationElsaStableTsum(tsum)
    )).length;
    return {
      strategyChainLength: strategyChain.length,
      stableFallbackChainLength: stableFallbackChain.length,
      relaxedFallbackChainLength: relaxedFallbackChain.length,
      relaxedFallbackStableNodeCount,
      relaxedFallbackUnstableNodeCount: Math.max(0, relaxedFallbackChain.length - relaxedFallbackStableNodeCount)
    };
  }

  shouldWaitForStrongestModeCoronationElsaNoFreezeTarget(playableCount, frozenCount, diagnostics) {
    if (frozenCount > 0) {
      this.strongestModeCoronationElsaNoFreezeTargetWaitFrames = 0;
      return false;
    }
    const canWait = !!(
      diagnostics &&
      playableCount >= this.strongestModeCoronationElsaMinPlayableNodesBeforeFreezeTap &&
      diagnostics.strategyChainLength === 0 &&
      diagnostics.stableFallbackChainLength === 0 &&
      diagnostics.relaxedFallbackChainLength >= 3 &&
      diagnostics.relaxedFallbackStableNodeCount === 0 &&
      diagnostics.relaxedFallbackUnstableNodeCount > 0 &&
      this.strongestModeCoronationElsaNoFreezeTargetWaitFrames < this.strongestModeCoronationElsaNoFreezeTargetMaxWaitFrames
    );
    if (!canWait) {
      return false;
    }
    this.strongestModeCoronationElsaNoFreezeTargetWaitFrames += 1;
    return true;
  }

  shouldWaitForStrongestModeCoronationElsaEarlyFreezeTap(playableCount, frozenCount) {
    if (this.strongestModeCoronationElsaPendingExtraFreezeTap) {
      this.strongestModeCoronationElsaEarlyFreezeTapWaitFrames = 0;
      return false;
    }
    const summary = this.getStrongestModeCoronationElsaSkillSummary();
    const chainCount = summary?.chainCount || 0;
    const freezeApplyCount = summary?.freezeApplyCount || 0;
    if (frozenCount >= 35 || chainCount >= 4 || freezeApplyCount >= 4) {
      this.strongestModeCoronationElsaEarlyFreezeTapWaitFrames = 0;
      return false;
    }
    const canWait = !!(
      frozenCount > 0 &&
      playableCount >= this.strongestModeCoronationElsaMinPlayableNodesBeforeFreezeTap &&
      this.strongestModeCoronationElsaEarlyFreezeTapWaitFrames < this.strongestModeCoronationElsaEarlyFreezeTapMaxWaitFrames
    );
    if (!canWait) {
      return false;
    }
    this.strongestModeCoronationElsaEarlyFreezeTapWaitFrames += 1;
    return true;
  }

  tryTapStrongestModeCoronationElsaFreezeTarget(specialTarget, options = {}) {
    if (!options.planValidated) {
      const decision = this.planStrongestModeCoronationElsaAction?.();
      if (decision?.plan?.action === "trace") return false;
      if (!decision) {
        const anyTraceChain = this.findStrongestModeCoronationElsaAnyTraceChain();
        if (Array.isArray(anyTraceChain) && anyTraceChain.length >= 3) return false;
      }
    }
    if (!specialTarget || specialTarget.type !== "freeze") {
      return false;
    }
    const tapped = this.inputRouter.handleTap({ x: specialTarget.x, y: specialTarget.y });
    if (!tapped) {
      if (options.planValidated) {
        this.strongestModeCoronationElsaPendingTapPrediction = null;
      }
      return false;
    }
    this.strongestModeCoronationElsaNoChainFrames = 0;
    this.strongestModeCoronationElsaNoTraceDurationSec = 0;
    this.strongestModeCoronationElsaStopLogged = false;
    this.strongestModeCoronationElsaPendingExtraFreezeTap = false;
    this.strongestModeCoronationElsaSuppressRelaxedFallback = false;
    this.strongestModeCoronationElsaSuppressSpecialTapFrames = 0;
    this.strongestModeCoronationElsaNoFreezeTargetWaitFrames = 0;
    this.strongestModeCoronationElsaEarlyFreezeTapWaitFrames = 0;
    this.strongestModeCoronationElsaUnsafeFreezeTapWaitFrames = 0;
    return true;
  }

  tryTapStrongestModeCoronationElsaCompletedIce(hasTraceCandidate = false) {
    if (this.strongestModeCoronationElsaPendingExtraFreezeTap) {
      return false;
    }
    const frozenCount = this.boardState.getFrozenNodesByKind("coronationElsa").length;
    const committedTraceCount = this.getStrongestModeCoronationElsaSkillSummary()?.chainCount || 0;
    const anyTraceChain = this.findStrongestModeCoronationElsaAnyTraceChain();
    const hasAnyTraceCandidate = (
      hasTraceCandidate ||
      (Array.isArray(anyTraceChain) && anyTraceChain.length >= 3)
    );
    if (!shouldTapStrongestModeCoronationElsaCompletedIce({
      frozenCount,
      noTraceDurationSec: this.strongestModeCoronationElsaNoTraceDurationSec,
      hasTraceCandidate: hasAnyTraceCandidate,
      committedTraceCount,
      minimumTraceCount: this.strongestModeCoronationElsaMinimumTraceCount || 4
    })) {
      return false;
    }
    const specialTarget = this.findStrongestSpecialTapTarget();
    if (!specialTarget || specialTarget.type !== "freeze") {
      return false;
    }
    return this.tryTapStrongestModeCoronationElsaFreezeTarget(specialTarget);
  }

  shouldWaitForStrongestModeCoronationElsaUnsafeFreezeTap(frozenCount, specialTarget) {
    if (this.strongestModeCoronationElsaPendingExtraFreezeTap) {
      this.strongestModeCoronationElsaUnsafeFreezeTapWaitFrames = 0;
      return false;
    }
    if (
      frozenCount < 35 ||
      frozenCount >= 38 ||
      !specialTarget ||
      specialTarget.type !== "freeze"
    ) {
      this.strongestModeCoronationElsaUnsafeFreezeTapWaitFrames = 0;
      return false;
    }
    const safeChain = this.findStrongestModeCoronationElsaSafeWaitReleaseChain();
    if (Array.isArray(safeChain) && safeChain.length >= 3) {
      this.strongestModeCoronationElsaUnsafeFreezeTapWaitFrames = 0;
      return true;
    }
    if (this.strongestModeCoronationElsaUnsafeFreezeTapWaitFrames < this.strongestModeCoronationElsaUnsafeFreezeTapMaxWaitFrames) {
      this.strongestModeCoronationElsaUnsafeFreezeTapWaitFrames += 1;
      return true;
    }
    return false;
  }

  findStrongestModeCoronationElsaSafeWaitReleaseChain() {
    return this.findStrongestModeCoronationElsaBestPreviewChain({
      minLength: 3,
      maxLength: 6,
      minY: this.getStrongestModeCoronationElsaSafePlayableY(),
      filterNode: (tsum) => this.isStrongestModeCoronationElsaPracticalStableTsum(tsum)
    }) || [];
  }

  shouldRecordStrongestModeCoronationElsaSummary() {
    return !!(
      this.coronationElsaDebug &&
      this.strongestModeEnabled &&
      this.myTsum?.id === "coronationElsa"
    );
  }

  ensureCodexLogBuffer() {
    if (typeof window === "undefined") {
      return null;
    }
    if (!Array.isArray(window.__codexLogBuffer)) {
      window.__codexLogBuffer = [];
    }
    return window.__codexLogBuffer;
  }

  pushCodexDebugLog(label, payload = {}) {
    if (!this.coronationElsaDebug) {
      return;
    }
    const buffer = this.ensureCodexLogBuffer();
    if (!buffer) {
      return;
    }
    buffer.push({
      label,
      elapsed: this.elapsed,
      payload: { ...payload }
    });
    const maxCodexLogBufferEntries = 150;
    if (buffer.length > maxCodexLogBufferEntries) {
      buffer.splice(0, buffer.length - maxCodexLogBufferEntries);
    }
  }

  ensureCodexDebugOverlay() {
    if (!this.coronationElsaDebug || typeof document === "undefined") {
      return null;
    }
    if (this.codexDebugOverlay?.isConnected) {
      return this.codexDebugOverlay;
    }
    const overlay = document.createElement("pre");
    overlay.id = "codexDebugOverlay";
    overlay.style.position = "fixed";
    overlay.style.left = "8px";
    overlay.style.right = "8px";
    overlay.style.bottom = "8px";
    overlay.style.maxHeight = "180px";
    overlay.style.margin = "0";
    overlay.style.padding = "8px";
    overlay.style.zIndex = "9998";
    overlay.style.overflow = "hidden";
    overlay.style.pointerEvents = "none";
    overlay.style.background = "rgba(0, 0, 0, 0.72)";
    overlay.style.color = "#b9f7ff";
    overlay.style.border = "1px solid rgba(185, 247, 255, 0.45)";
    overlay.style.borderRadius = "6px";
    overlay.style.font = "11px Consolas, monospace";
    overlay.style.lineHeight = "1.35";
    overlay.style.whiteSpace = "pre-wrap";
    overlay.textContent = "[CODEXLOG overlay ready]";
    document.body.appendChild(overlay);
    this.codexDebugOverlay = overlay;
    return overlay;
  }

  appendCodexDebugOverlayLog(line) {
    const overlay = this.ensureCodexDebugOverlay();
    if (!overlay) {
      return;
    }
    this.codexDebugOverlayLines.push(line);
    const maxOverlayLines = 10;
    if (this.codexDebugOverlayLines.length > maxOverlayLines) {
      this.codexDebugOverlayLines.splice(0, this.codexDebugOverlayLines.length - maxOverlayLines);
    }
    overlay.textContent = this.codexDebugOverlayLines.join("\n");
  }

  logCodexCoronationPayload(prefix, payload = {}) {
    if (!this.coronationElsaDebug) {
      return;
    }
    const line = `${prefix} ${JSON.stringify(payload)}`;
    console.log(line);
    this.appendCodexDebugOverlayLog(line);
  }

  beginStrongestModeCoronationElsaSkillSummary(sessionId) {
    if (!this.shouldRecordStrongestModeCoronationElsaSummary()) {
      return;
    }
    this.strongestModeCoronationElsaSkillSummary = {
      sessionId,
      chainCount: 0,
      totalChainLength: 0,
      maxChainLength: 0,
      freezeApplyCount: 0,
      totalFreezeTargets: 0,
      totalNewFrozenCount: 0,
      maxFrozenCountDuringSkill: 0,
      frozenCountBeforeTap: 0,
      collectedFrozenCount: 0,
      actualClearTargetsCount: 0,
      playableLowWaitCount: 0,
      noChainCandidateCount: 0,
      busyAfterChainCount: 0,
      previewStrategyPickCount: 0,
      proximityStrategyPickCount: 0,
      fallbackStrategyPickCount: 0,
      performChainsCallCount: 0,
      chainAttemptCount: 0,
      chainSuccessCount: 0,
      chainCommittedCount: 0,
      strategyChainStartCount: 0,
      stableFallbackChainStartCount: 0,
      relaxedFallbackChainStartCount: 0,
      unknownChainStartCount: 0,
      unstableChainStartCount: 0,
      strategyUnstableChainStartCount: 0,
      stableFallbackUnstableChainStartCount: 0,
      relaxedFallbackUnstableChainStartCount: 0,
      unknownUnstableChainStartCount: 0,
      maxChainStartAbsVx: 0,
      maxChainStartAbsVy: 0,
      waitReleaseNoRecentSpawnsCount: 0,
      waitReleaseRequiredSettledCount: 0,
      minRecentSpawnWaitDuration: null,
      maxRecentSpawnWaitDuration: 0,
      minSecondsBetweenChainStarts: null,
      minFirstTsumAgeAtChainStart: null,
      minNewestSpawnAgeAtChainStart: null,
      plannerRunCount: 0,
      plannerExactRunCount: 0,
      plannerBeamRunCount: 0,
      plannerTotalSearchMs: 0,
      plannerMaxSearchMs: 0,
      plannerExploredStateCount: 0,
      plannerMemoHitCount: 0,
      plannerRootCandidateCount: 0,
      plannerRootDedupedCandidateCount: 0,
      plannerCalculatedMaxAdditionalTraces: 0,
      plannerSelectedRouteProjectedTotalTraces: 0,
      plannerSelectedFirstChainLength: 0,
      plannerSelectedNextFrozenCount: 0,
      plannerTerminalEffectiveClear: 0,
      plannerTerminalPredictedRawCoins: 0,
      actualIceTapEffectiveClear: 0,
      actualIceTapRawCoins: 0,
      plannerEffectiveClearDifference: 0,
      plannerRawCoinsDifference: 0,
      endedBy: null
    };
  }

  getStrongestModeCoronationElsaSkillSummary(sessionId = null) {
    const summary = this.strongestModeCoronationElsaSkillSummary;
    if (!summary) {
      return null;
    }
    if (sessionId && summary.sessionId !== sessionId) {
      return null;
    }
    return summary;
  }

  recordStrongestModeCoronationElsaChainCommit(sessionId, chainLength, freezeTargetCount, newFrozenCount, totalFrozenCount) {
    const summary = this.getStrongestModeCoronationElsaSkillSummary(sessionId);
    if (!summary) {
      return;
    }
    summary.chainCount += 1;
    summary.totalChainLength += Math.max(0, chainLength || 0);
    summary.maxChainLength = Math.max(summary.maxChainLength, chainLength || 0);
    summary.freezeApplyCount += 1;
    summary.totalFreezeTargets += Math.max(0, freezeTargetCount || 0);
    summary.totalNewFrozenCount += Math.max(0, newFrozenCount || 0);
    summary.maxFrozenCountDuringSkill = Math.max(summary.maxFrozenCountDuringSkill, totalFrozenCount || 0);
  }

  recordStrongestModeCoronationElsaPlannerRun(plan) {
    const summary = this.getStrongestModeCoronationElsaSkillSummary();
    if (!summary || !plan?.diagnostics) return;
    const diagnostics = plan.diagnostics;
    summary.plannerRunCount += 1;
    if (plan.mode === "exact") summary.plannerExactRunCount += 1;
    if (plan.mode === "beam") summary.plannerBeamRunCount += 1;
    summary.plannerTotalSearchMs += Math.max(0, diagnostics.searchTimeMs || 0);
    summary.plannerMaxSearchMs = Math.max(summary.plannerMaxSearchMs, diagnostics.searchTimeMs || 0);
    summary.plannerExploredStateCount += Math.max(0, diagnostics.exploredStateCount || 0);
    summary.plannerMemoHitCount += Math.max(0, diagnostics.memoHitCount || 0);
    summary.plannerRootCandidateCount = diagnostics.rootCandidateCount || 0;
    summary.plannerRootDedupedCandidateCount = diagnostics.rootDedupedCandidateCount || 0;
    summary.plannerCalculatedMaxAdditionalTraces = diagnostics.calculatedMaxAdditionalTraces || 0;
    summary.plannerSelectedRouteProjectedTotalTraces = diagnostics.selectedRouteProjectedTotalTraces || 0;
    summary.plannerSelectedFirstChainLength = diagnostics.selectedFirstChainLength || 0;
    summary.plannerSelectedNextFrozenCount = diagnostics.selectedNextFrozenCount || 0;
    summary.plannerTerminalEffectiveClear = diagnostics.terminalEffectiveClear || 0;
    summary.plannerTerminalPredictedRawCoins = diagnostics.terminalPredictedRawCoins || 0;
  }

  recordStrongestModeCoronationElsaIceTapActual(stats = {}) {
    const summary = this.getStrongestModeCoronationElsaSkillSummary();
    if (!summary) return;
    const prediction = stats.prediction || {};
    summary.actualIceTapEffectiveClear = Math.max(0, stats.effectiveClearCount || 0);
    summary.actualIceTapRawCoins = Math.max(0, stats.rawCoins || 0);
    summary.plannerEffectiveClearDifference = summary.actualIceTapEffectiveClear - Math.max(0, prediction.effectiveClearCount || 0);
    summary.plannerRawCoinsDifference = summary.actualIceTapRawCoins - Math.max(0, prediction.rawCoins || 0);
  }

  recordStrongestModeCoronationElsaStrategyPick(type) {
    const summary = this.getStrongestModeCoronationElsaSkillSummary();
    if (!summary) {
      return;
    }
    if (type === "preview") {
      summary.previewStrategyPickCount += 1;
    } else if (type === "proximity") {
      summary.proximityStrategyPickCount += 1;
    } else {
      summary.fallbackStrategyPickCount += 1;
    }
  }

  recordStrongestModeCoronationElsaPlayableLowWait() {
    const summary = this.getStrongestModeCoronationElsaSkillSummary();
    if (summary) {
      summary.playableLowWaitCount += 1;
    }
  }

  recordStrongestModeCoronationElsaNoChainCandidate() {
    const summary = this.getStrongestModeCoronationElsaSkillSummary();
    if (summary) {
      summary.noChainCandidateCount += 1;
    }
  }

  recordStrongestModeCoronationElsaBusyAfterChain() {
    const summary = this.getStrongestModeCoronationElsaSkillSummary();
    if (summary) {
      summary.busyAfterChainCount += 1;
    }
  }

  recordStrongestModeCoronationElsaIceTapStats(stats = {}) {
    const summary = this.getStrongestModeCoronationElsaSkillSummary();
    if (!summary) {
      return;
    }
    summary.frozenCountBeforeTap = Math.max(0, stats.frozenCountBeforeTap || 0);
    summary.collectedFrozenCount = Math.max(0, stats.collectedFrozenCount || 0);
    summary.actualClearTargetsCount = Math.max(0, stats.actualClearTargetsCount || 0);
  }

  emitStrongestModeCoronationElsaSkillSummary(endedBy) {
    const summary = this.getStrongestModeCoronationElsaSkillSummary();
    if (!summary) {
      return;
    }
    const chainCount = summary.chainCount || 0;
    const averageChainLength = chainCount > 0 ? Number((summary.totalChainLength / chainCount).toFixed(3)) : 0;
    summary.endedBy = endedBy || summary.endedBy || "unknown";
    const summaryPayload = {
      chainCount: summary.chainCount,
      averageChainLength,
      maxChainLength: summary.maxChainLength,
      freezeApplyCount: summary.freezeApplyCount,
      totalFreezeTargets: summary.totalFreezeTargets,
      totalNewFrozenCount: summary.totalNewFrozenCount,
      maxFrozenCountDuringSkill: summary.maxFrozenCountDuringSkill,
      frozenCountBeforeTap: summary.frozenCountBeforeTap,
      collectedFrozenCount: summary.collectedFrozenCount,
      actualClearTargetsCount: summary.actualClearTargetsCount,
      playableLowWaitCount: summary.playableLowWaitCount,
      noChainCandidateCount: summary.noChainCandidateCount,
      busyAfterChainCount: summary.busyAfterChainCount,
      previewStrategyPickCount: summary.previewStrategyPickCount,
      proximityStrategyPickCount: summary.proximityStrategyPickCount,
      fallbackStrategyPickCount: summary.fallbackStrategyPickCount,
      performChainsCallCount: summary.performChainsCallCount,
      chainAttemptCount: summary.chainAttemptCount,
      chainSuccessCount: summary.chainSuccessCount,
      chainCommittedCount: summary.chainCommittedCount,
      strategyChainStartCount: summary.strategyChainStartCount,
      stableFallbackChainStartCount: summary.stableFallbackChainStartCount,
      relaxedFallbackChainStartCount: summary.relaxedFallbackChainStartCount,
      unknownChainStartCount: summary.unknownChainStartCount,
      unstableChainStartCount: summary.unstableChainStartCount,
      strategyUnstableChainStartCount: summary.strategyUnstableChainStartCount,
      stableFallbackUnstableChainStartCount: summary.stableFallbackUnstableChainStartCount,
      relaxedFallbackUnstableChainStartCount: summary.relaxedFallbackUnstableChainStartCount,
      unknownUnstableChainStartCount: summary.unknownUnstableChainStartCount,
      maxChainStartAbsVx: summary.maxChainStartAbsVx,
      maxChainStartAbsVy: summary.maxChainStartAbsVy,
      waitReleaseNoRecentSpawnsCount: summary.waitReleaseNoRecentSpawnsCount,
      waitReleaseRequiredSettledCount: summary.waitReleaseRequiredSettledCount,
      minRecentSpawnWaitDuration: summary.minRecentSpawnWaitDuration,
      maxRecentSpawnWaitDuration: summary.maxRecentSpawnWaitDuration,
      minSecondsBetweenChainStarts: summary.minSecondsBetweenChainStarts,
      minFirstTsumAgeAtChainStart: summary.minFirstTsumAgeAtChainStart,
      minNewestSpawnAgeAtChainStart: summary.minNewestSpawnAgeAtChainStart,
      plannerMode: summary.plannerBeamRunCount > 0 ? "beam" : "exact",
      plannerRunCount: summary.plannerRunCount,
      plannerExactRunCount: summary.plannerExactRunCount,
      plannerBeamRunCount: summary.plannerBeamRunCount,
      plannerAverageSearchMs: summary.plannerRunCount > 0
        ? Number((summary.plannerTotalSearchMs / summary.plannerRunCount).toFixed(3))
        : 0,
      plannerMaxSearchMs: Number(summary.plannerMaxSearchMs.toFixed(3)),
      plannerExploredStateCount: summary.plannerExploredStateCount,
      plannerMemoHitCount: summary.plannerMemoHitCount,
      plannerRootCandidateCount: summary.plannerRootCandidateCount,
      plannerRootDedupedCandidateCount: summary.plannerRootDedupedCandidateCount,
      plannerCalculatedMaxAdditionalTraces: summary.plannerCalculatedMaxAdditionalTraces,
      plannerSelectedRouteProjectedTotalTraces: summary.plannerSelectedRouteProjectedTotalTraces,
      plannerSelectedFirstChainLength: summary.plannerSelectedFirstChainLength,
      plannerSelectedNextFrozenCount: summary.plannerSelectedNextFrozenCount,
      plannerTerminalEffectiveClear: summary.plannerTerminalEffectiveClear,
      plannerTerminalPredictedRawCoins: summary.plannerTerminalPredictedRawCoins,
      actualTraceCount: summary.chainCount,
      actualIceTapEffectiveClear: summary.actualIceTapEffectiveClear,
      actualIceTapRawCoins: summary.actualIceTapRawCoins,
      plannerEffectiveClearDifference: summary.plannerEffectiveClearDifference,
      plannerRawCoinsDifference: summary.plannerRawCoinsDifference,
      afterChainDelay: this.strongestModeCoronationElsaAfterChainDelay,
      recentSpawnLookbackSec: this.strongestModeCoronationElsaRecentSpawnLookbackSec,
      noRecentSpawnMinWaitSec: this.strongestModeCoronationElsaNoRecentSpawnMinWaitSec,
      noRecentSpawnMaxWaitSec: this.strongestModeCoronationElsaNoRecentSpawnMaxWaitSec,
      suppressSpecialTapFrames: this.strongestModeCoronationElsaSuppressSpecialTapFrames,
      stableMinSpawnAgeSec: this.strongestModeCoronationElsaStableMinSpawnAgeSec,
      stableVelocityThreshold: this.strongestModeCoronationElsaStableVelocityThreshold,
      endedBy: summary.endedBy
    };
    console.log("[CORONATION ELSA STRONGEST SUMMARY]", summaryPayload);
    this.logCodexCoronationPayload("[CODEXLOG CORONATION SKILL SUMMARY]", summaryPayload);
    this.strongestModeCoronationElsaSkillSummary = null;
  }

  getStrongestModeChainNodes() {
    return this.tsums.filter((tsum) => (
      tsum &&
      !tsum.dead &&
      !tsum.removing &&
      !tsum.clearOccupying &&
      !tsum.inChain &&
      !this.boardState.isFrozen(tsum) &&
      !this.boardState.hasBubble(tsum) &&
      this.isTsumInPlayArea(tsum)
    ));
  }

  countStrongestModePlayableNodesBelowCeiling() {
    const safePlayableY = this.getStrongestModeCoronationElsaSafePlayableY();
    let count = 0;
    for (const tsum of this.tsums) {
      if (!tsum || tsum.dead || tsum.removing) {
        continue;
      }
      if (this.isTsumInPlayArea(tsum) && tsum.y >= safePlayableY) {
        count += 1;
      }
    }
    for (const bomb of this.bombs) {
      if (!bomb || bomb.dead || bomb.removing) {
        continue;
      }
      if (this.isBodyRenderable(bomb) && bomb.y >= safePlayableY) {
        count += 1;
      }
    }
    return count;
  }

  getStrongestModeCoronationElsaRecentSpawnedTsums() {
    const lookback = Math.max(0, this.strongestModeCoronationElsaRecentSpawnLookbackSec || 0);
    const now = this.elapsed;
    return this.tsums.filter((tsum) => (
      tsum &&
      !tsum.dead &&
      !tsum.removing &&
      Number.isFinite(tsum.spawnedAtElapsed) &&
      (now - tsum.spawnedAtElapsed) <= lookback
    ));
  }

  shouldWaitForCoronationElsaRecentSpawnsToSettle() {
    if (!this.strongestModeCoronationElsaWaitRecentSpawnSettle) {
      return false;
    }
    if (!Number.isFinite(this.strongestModeCoronationElsaWaitStartElapsed)) {
      this.strongestModeCoronationElsaWaitStartElapsed = this.elapsed;
    }
    const safeWaitReleaseChain = this.findStrongestModeCoronationElsaSafeWaitReleaseChain();
    if (Array.isArray(safeWaitReleaseChain) && safeWaitReleaseChain.length >= 3) {
      this.strongestModeCoronationElsaWaitRecentSpawnSettle = false;
      this.strongestModeCoronationElsaWaitStartElapsed = null;
      this.strongestModeCoronationElsaSuppressRelaxedFallback = false;
      this.strongestModeCoronationElsaSuppressSpecialTapFrames = 0;
      return false;
    }
    const recentTsums = this.getStrongestModeCoronationElsaRecentSpawnedTsums();
    const logWaitRelease = (reason, settledCount, requiredSettled) => {
      const recentCount = recentTsums.length;
      let newestSpawnedAtElapsed = null;
      for (const tsum of recentTsums) {
        if (
          Number.isFinite(tsum?.spawnedAtElapsed) &&
          (newestSpawnedAtElapsed == null || tsum.spawnedAtElapsed > newestSpawnedAtElapsed)
        ) {
          newestSpawnedAtElapsed = tsum.spawnedAtElapsed;
        }
      }
      const waitDuration = Number.isFinite(this.strongestModeCoronationElsaWaitStartElapsed)
        ? this.elapsed - this.strongestModeCoronationElsaWaitStartElapsed
        : null;
      const summary = this.getStrongestModeCoronationElsaSkillSummary();
      if (summary) {
        if (reason === "no-recent-spawns") {
          summary.waitReleaseNoRecentSpawnsCount += 1;
        } else if (reason === "required-settled") {
          summary.waitReleaseRequiredSettledCount += 1;
        }
        if (Number.isFinite(waitDuration)) {
          summary.minRecentSpawnWaitDuration = (
            summary.minRecentSpawnWaitDuration == null
              ? waitDuration
              : Math.min(summary.minRecentSpawnWaitDuration, waitDuration)
          );
          summary.maxRecentSpawnWaitDuration = Math.max(summary.maxRecentSpawnWaitDuration || 0, waitDuration);
        }
      }
      const coronationElsaWaitReleaseLog = {
        reason,
        recentCount,
        settledCount,
        requiredSettled,
        unsettledCount: Math.max(0, recentCount - settledCount),
        playableCount: this.countStrongestModePlayableNodesBelowCeiling(),
        frozenCount: this.boardState.getFrozenNodesByKind("coronationElsa").length,
        waitDuration,
        newestSpawnAge: newestSpawnedAtElapsed == null ? null : this.elapsed - newestSpawnedAtElapsed,
        noChainFrames: this.strongestModeCoronationElsaNoChainFrames,
        suppressRelaxedFallback: !!this.strongestModeCoronationElsaSuppressRelaxedFallback,
        suppressSpecialTapFrames: this.strongestModeCoronationElsaSuppressSpecialTapFrames,
        pendingExtraFreezeTap: !!this.strongestModeCoronationElsaPendingExtraFreezeTap
      };
      this.pushCodexDebugLog("[CORONATION ELSA WAIT RELEASE]", coronationElsaWaitReleaseLog);
      this.logCodexCoronationPayload("[CODEXLOG CORONATION WAIT RELEASE]", coronationElsaWaitReleaseLog);
      console.log("[CORONATION ELSA WAIT RELEASE]", coronationElsaWaitReleaseLog);
    };
    const waitDuration = Number.isFinite(this.strongestModeCoronationElsaWaitStartElapsed)
      ? this.elapsed - this.strongestModeCoronationElsaWaitStartElapsed
      : 0;
    if (recentTsums.length === 0) {
      if (this.countStrongestModePlayableNodesBelowCeiling() < this.strongestModeCoronationElsaMinPlayableNodesBeforeFreezeTap) {
        return true;
      }
      if (waitDuration < this.strongestModeCoronationElsaNoRecentSpawnMinWaitSec) {
        return true;
      }
      const stableFallbackChain = this.findStrongestModeCoronationElsaBestPreviewChain({
        minLength: 3,
        maxLength: 6,
        minY: this.getStrongestModeCoronationElsaSafePlayableY(),
        filterNode: (tsum) => this.isStrongestModeCoronationElsaPracticalStableTsum(tsum)
      });
      if (!Array.isArray(stableFallbackChain) || stableFallbackChain.length < 3) {
        if (waitDuration < this.strongestModeCoronationElsaNoRecentSpawnMaxWaitSec) {
          return true;
        }
        logWaitRelease("no-recent-spawns-max-wait", 0, 0);
        this.strongestModeCoronationElsaNoChainFrames = 0;
        this.strongestModeCoronationElsaWaitRecentSpawnSettle = false;
        this.strongestModeCoronationElsaSuppressRelaxedFallback = true;
        this.strongestModeCoronationElsaSuppressSpecialTapFrames = this.strongestModeCoronationElsaSuppressSpecialTapMaxFrames;
        this.strongestModeCoronationElsaWaitStartElapsed = null;
        return true;
      }
      logWaitRelease("no-recent-spawns", 0, 0);
      this.strongestModeCoronationElsaWaitRecentSpawnSettle = false;
      this.strongestModeCoronationElsaSuppressRelaxedFallback = false;
      this.strongestModeCoronationElsaSuppressSpecialTapFrames = 0;
      this.strongestModeCoronationElsaWaitStartElapsed = null;
      return false;
    }
    if (waitDuration >= this.strongestModeCoronationElsaNoRecentSpawnMaxWaitSec) {
      logWaitRelease("recent-spawns-max-wait", 0, Math.min(3, recentTsums.length));
      this.strongestModeCoronationElsaWaitRecentSpawnSettle = false;
      this.strongestModeCoronationElsaSuppressRelaxedFallback = false;
      this.strongestModeCoronationElsaSuppressSpecialTapFrames = 0;
      this.strongestModeCoronationElsaWaitStartElapsed = null;
      return false;
    }
    const requiredSettled = Math.min(3, recentTsums.length);
    let settledCount = 0;
    for (const tsum of recentTsums) {
      const settled = typeof tsum.isSettled === "function"
        ? tsum.isSettled()
        : this.isBodySettled(tsum);
      if (!settled) {
        continue;
      }
      settledCount += 1;
      if (settledCount >= requiredSettled) {
        logWaitRelease("required-settled", settledCount, requiredSettled);
        this.strongestModeCoronationElsaWaitRecentSpawnSettle = false;
        this.strongestModeCoronationElsaWaitStartElapsed = null;
        return false;
      }
    }
    return true;
  }

  getStrongestModeCoronationElsaSafePlayableY() {
    return FIELD_TOP + (this.strongestModeCoronationElsaSafePlayableYOffset || 80);
  }

  findStrongestModeGreedyChain(start, nodes, rule, maxLength = Infinity) {
    const nodeSet = new Set(nodes.map((node) => node.id));
    if (!nodeSet.has(start.id)) {
      return [];
    }
    const chain = [start];
    const used = new Set([start.id]);
    let current = start;
    while (chain.length < maxLength) {
      let next = null;
      let nextScore = -Infinity;
      for (const candidate of nodes) {
        if (used.has(candidate.id) || !this.canConnectWithChainRule(rule, current, candidate)) {
          continue;
        }
        const onward = this.countStrongestModeOnwardConnections(candidate, nodes, rule, used);
        const candidateScore = onward * 1000 - distance(current.x, current.y, candidate.x, candidate.y);
        if (candidateScore > nextScore) {
          next = candidate;
          nextScore = candidateScore;
        }
      }
      if (!next) {
        break;
      }
      chain.push(next);
      used.add(next.id);
      current = next;
    }
    return chain;
  }

  countStrongestModeOnwardConnections(node, nodes, rule, used) {
    let count = 0;
    for (const candidate of nodes) {
      if (!candidate || used.has(candidate.id) || candidate.id === node.id) {
        continue;
      }
      if (this.canConnectWithChainRule(rule, node, candidate)) {
        count += 1;
      }
    }
    return count;
  }

  scoreStrongestModeChain(chain, options = {}) {
    let score = chain.length * 100;
    if (Number.isFinite(options.maxLength)) {
      score -= Math.abs(options.maxLength - chain.length) * 10;
    }
    if (options.requiredTypeIds && chain.some((tsum) => options.requiredTypeIds.has(this.boardState.getResolvedType(tsum).id))) {
      score += 50;
    }
    return score;
  }

  performStrongestModeChains(initialChain = [], options = {}) {
    const allowChainQueueDuringActiveClear = !!options.allowChainQueueDuringActiveClear;
    const stats = options.stats || null;
    const canAttemptChain = () => (
      !this.isStrongestModeBusy() ||
      (allowChainQueueDuringActiveClear && this.canQueueChainDuringActiveClear())
    );
    const maxChains = Math.max(1, this.strongestModeMaxChainsPerStep || 1);
    const isCoronationElsaSkillActive = (
      this.myTsum?.id === "coronationElsa" &&
      !!this.getActiveSkillSession("coronationElsa")
    );
    const maxChainsThisStep = isCoronationElsaSkillActive ? Math.min(maxChains, 2) : maxChains;
    const canContinueCoronationElsaChainSource = (source) => (
      source === "planner"
    );
    const coronationElsaSummary = isCoronationElsaSkillActive
      ? this.getStrongestModeCoronationElsaSkillSummary()
      : null;
    if (coronationElsaSummary) {
      coronationElsaSummary.performChainsCallCount += 1;
    }
    let chain = initialChain;
    let performed = 0;
    while (performed < maxChainsThisStep) {
      if (!Array.isArray(chain) || chain.length < 3 || !canAttemptChain()) {
        break;
      }
      const coronationElsaChainSource = chain.strongestModeCoronationElsaSource || null;
      if (coronationElsaSummary) {
        coronationElsaSummary.chainAttemptCount += 1;
      }
      const chainResult = {};
      const chainSucceeded = this.performStrongestModeChain(chain, {
        allowChainQueueDuringActiveClear,
        result: chainResult
      });
      if (chainSucceeded && coronationElsaSummary) {
        coronationElsaSummary.chainSuccessCount += 1;
      }
      if (chainSucceeded && isCoronationElsaSkillActive) {
        this.strongestModeCoronationElsaWaitRecentSpawnSettle = true;
        this.strongestModeCoronationElsaSuppressRelaxedFallback = false;
        this.strongestModeCoronationElsaSuppressSpecialTapFrames = 0;
        this.strongestModeCoronationElsaWaitStartElapsed = null;
      }
      if (!chainSucceeded) {
        break;
      }
      performed += 1;
      if (stats && Array.isArray(stats.performedLengths)) {
        stats.performedLengths.push(chainResult.committedLength ?? chain.length);
      }
      if (isCoronationElsaSkillActive) {
        if (
          !canContinueCoronationElsaChainSource(coronationElsaChainSource) ||
          performed >= maxChainsThisStep ||
          this.isStrongestModeBusy()
        ) {
          this.strongestModeCoronationElsaAfterChainTimer = this.strongestModeCoronationElsaAfterChainDelay;
          break;
        }
        const nextChain = this.findStrongestModeChain();
        const nextChainSource = nextChain?.strongestModeCoronationElsaSource || null;
        if (
          !Array.isArray(nextChain) ||
          nextChain.length < 3 ||
          !canContinueCoronationElsaChainSource(nextChainSource)
        ) {
          this.strongestModeCoronationElsaAfterChainTimer = this.strongestModeCoronationElsaAfterChainDelay;
          break;
        }
        chain = nextChain;
        continue;
      }
      if (!canAttemptChain()) {
        break;
      }
      chain = this.findStrongestModeChain();
    }
    return performed > 0;
  }

  performStrongestModeChain(chain, options = {}) {
    const allowChainQueueDuringActiveClear = !!options.allowChainQueueDuringActiveClear;
    const canAttemptChain = (
      !this.isStrongestModeBusy() ||
      (allowChainQueueDuringActiveClear && this.canQueueChainDuringActiveClear())
    );
    if (!Array.isArray(chain) || chain.length < 3 || !canAttemptChain) {
      return false;
    }
    if (
      chain.strongestModeCoronationElsaSource === "planner" &&
      !this.isStrongestModeCoronationElsaPlannedChainValid(chain)
    ) {
      return false;
    }
    const coronationElsaPlan = chain.strongestModeCoronationElsaPlan || null;
    const shouldLogCoronationElsaCommit = !!(
      this.strongestModeEnabled &&
      this.coronationElsaDebug &&
      this.myTsum?.id === "coronationElsa" &&
      this.getActiveSkillSession("coronationElsa")
    );
    const committedTraceCountBefore = this.getStrongestModeCoronationElsaSkillSummary()?.chainCount || 0;
    const first = chain[0];
    if (
      this.strongestModeEnabled &&
      this.coronationElsaDebug &&
      this.myTsum?.id === "coronationElsa" &&
      this.getActiveSkillSession("coronationElsa")
    ) {
      const isSettled = typeof first?.isSettled === "function"
        ? first.isSettled()
        : this.isBodySettled(first);
      let stableNodeCount = 0;
      let maxAbsVx = 0;
      let maxAbsVy = 0;
      let newestSpawnAge = null;
      for (const node of chain) {
        if (this.isStrongestModeCoronationElsaStableTsum(node)) {
          stableNodeCount += 1;
        }
        maxAbsVx = Math.max(maxAbsVx, Math.abs(node?.vx || 0));
        maxAbsVy = Math.max(maxAbsVy, Math.abs(node?.vy || 0));
        if (Number.isFinite(node?.spawnedAtElapsed)) {
          const age = this.elapsed - node.spawnedAtElapsed;
          newestSpawnAge = newestSpawnAge == null ? age : Math.min(newestSpawnAge, age);
        }
      }
      const chainSource = chain.strongestModeCoronationElsaSource || "unknown";
      const unstableNodeCount = Math.max(0, chain.length - stableNodeCount);
      const relaxedFallbackStableNodeCount = stableNodeCount;
      const relaxedFallbackUnstableNodeCount = unstableNodeCount;
      const secondsSincePreviousChainStart = Number.isFinite(this.strongestModeCoronationElsaLastChainStartElapsed)
        ? this.elapsed - this.strongestModeCoronationElsaLastChainStartElapsed
        : null;
      const firstTsumAge = Number.isFinite(first?.spawnedAtElapsed)
        ? this.elapsed - first.spawnedAtElapsed
        : null;
      this.strongestModeCoronationElsaLastChainStartElapsed = this.elapsed;
      const coronationElsaSummary = this.getStrongestModeCoronationElsaSkillSummary();
      if (coronationElsaSummary) {
        if (chainSource === "strategy") {
          coronationElsaSummary.strategyChainStartCount += 1;
        } else if (chainSource === "stableFallback") {
          coronationElsaSummary.stableFallbackChainStartCount += 1;
        } else if (chainSource === "relaxedFallback") {
          coronationElsaSummary.relaxedFallbackChainStartCount += 1;
        } else {
          coronationElsaSummary.unknownChainStartCount += 1;
        }
        if (unstableNodeCount > 0) {
          coronationElsaSummary.unstableChainStartCount += 1;
          if (chainSource === "strategy") {
            coronationElsaSummary.strategyUnstableChainStartCount += 1;
          } else if (chainSource === "stableFallback") {
            coronationElsaSummary.stableFallbackUnstableChainStartCount += 1;
          } else if (chainSource === "relaxedFallback") {
            coronationElsaSummary.relaxedFallbackUnstableChainStartCount += 1;
          } else {
            coronationElsaSummary.unknownUnstableChainStartCount += 1;
          }
        }
        coronationElsaSummary.maxChainStartAbsVx = Math.max(
          coronationElsaSummary.maxChainStartAbsVx || 0,
          maxAbsVx
        );
        coronationElsaSummary.maxChainStartAbsVy = Math.max(
          coronationElsaSummary.maxChainStartAbsVy || 0,
          maxAbsVy
        );
        if (Number.isFinite(secondsSincePreviousChainStart)) {
          coronationElsaSummary.minSecondsBetweenChainStarts = (
            coronationElsaSummary.minSecondsBetweenChainStarts == null
              ? secondsSincePreviousChainStart
              : Math.min(coronationElsaSummary.minSecondsBetweenChainStarts, secondsSincePreviousChainStart)
          );
        }
        if (Number.isFinite(newestSpawnAge)) {
          coronationElsaSummary.minNewestSpawnAgeAtChainStart = (
            coronationElsaSummary.minNewestSpawnAgeAtChainStart == null
              ? newestSpawnAge
              : Math.min(coronationElsaSummary.minNewestSpawnAgeAtChainStart, newestSpawnAge)
          );
        }
        if (Number.isFinite(firstTsumAge)) {
          coronationElsaSummary.minFirstTsumAgeAtChainStart = (
            coronationElsaSummary.minFirstTsumAgeAtChainStart == null
              ? firstTsumAge
              : Math.min(coronationElsaSummary.minFirstTsumAgeAtChainStart, firstTsumAge)
          );
        }
      }
      const coronationElsaChainStartLog = {
        chainSource,
        chainLength: chain.length,
        plan: chain.strongestModeCoronationElsaPlan || null,
        firstTsumId: first?.id || null,
        vx: first?.vx ?? null,
        vy: first?.vy ?? null,
        isSettled,
        ageSinceSpawn: firstTsumAge,
        stableNodeCount,
        unstableNodeCount,
        relaxedFallbackStableNodeCount,
        relaxedFallbackUnstableNodeCount,
        maxAbsVx,
        maxAbsVy,
        newestSpawnAge,
        secondsSincePreviousChainStart,
        y: first?.y ?? null,
        dead: !!first?.dead,
        removing: !!first?.removing
      };
      this.pushCodexDebugLog("[CORONATION ELSA CHAIN START]", coronationElsaChainStartLog);
      this.logCodexCoronationPayload("[CODEXLOG CORONATION CHAIN START]", coronationElsaChainStartLog);
      console.log("[CORONATION ELSA CHAIN START]", coronationElsaChainStartLog);
    }
    this.startChain(chain[0], { x: chain[0].x, y: chain[0].y });
    for (let i = 1; i < chain.length; i += 1) {
      this.extendChain({ x: chain[i].x, y: chain[i].y });
    }
    const committedLength = this.chain.length;
    if (options.result) {
      options.result.committedLength = committedLength;
    }
    const coronationElsaSummary = this.getStrongestModeCoronationElsaSkillSummary();
    if (coronationElsaSummary) {
      coronationElsaSummary.chainCommittedCount += 1;
    }
    this.finishChain();
    if (shouldLogCoronationElsaCommit) {
      const commitLog = {
        plannedLength: chain.length,
        committedLength,
        committed: committedLength >= 3,
        shortened: committedLength !== chain.length,
        candidateTier: coronationElsaPlan?.searchTier || null,
        committedTraceCountBefore,
        committedTraceCountAfter: this.getStrongestModeCoronationElsaSkillSummary()?.chainCount || committedTraceCountBefore,
        nextChainPotential: coronationElsaPlan?.nextChainPotential ?? null,
        preservesNextTrace: coronationElsaPlan?.preservesNextTrace ?? null,
        iceProximityDistancePx: coronationElsaPlan?.iceProximityDistancePx ?? null
      };
      this.pushCodexDebugLog("[CORONATION ELSA CHAIN COMMIT]", commitLog);
      this.logCodexCoronationPayload("[CODEXLOG CORONATION CHAIN COMMIT]", commitLog);
      console.log("[CORONATION ELSA CHAIN COMMIT]", commitLog);
    }
    return committedLength >= 3;
  }

  startGame(options = {}) {
    this.clearAiLearningRestartTimer();
    this.itemSelection = this.normalizeItemSelection();
    const cost = options.skipCost ? 0 : this.getSelectedItemCost();
    this.activeItems = { ...this.itemSelection };
    console.log('=== startGame() 開始 ===');
    console.log('activeItems:', this.activeItems);
    console.log('itemSelection:', this.itemSelection);
    console.log('selectedアイテルコスト:', cost);
    if (this.persistenceEnabled) {
      this.coins -= cost;
    }
    if (this.persistenceEnabled && !options.skipProgressSave && this.saveProgress) this.saveProgress();

    this.tsums = [];
    this.bombs = [];
    this.pendingLargeTsumTypes = [];
    this.floatingTexts = [];
    this.shockwaves = [];
    this.centerMessages = [];
    this.dragging = false;
    this.chain = [];
    this.chainSet.clear();
    this.chainTypeId = null;
    this.chainRule = null;
    this.aiAutoPlayTimer = 0;
    this.resetAiChainAnimationState();
    this.aiLastState = null;
    this.aiLastAction = null;
    this.aiLastSnapshot = null;
    this.aiLearningPendingSkillDecision = null;
    this.aiLearningPendingCoronationFreezeDecision = null;
    this.aiLearningDelayedBuffer = [];
    this.aiLearningEpisodeActions = this.createEmptyAiLearningActionCounts();
    this.aiLearningEpisodeSpecialTapStats = this.createEmptyAiLearningSpecialTapStats();
    this.aiLearningEpisodeSelectionCounts = { explore: 0, exploit: 0 };
    this.aiLearningEpisodeRewardStart = Number.isFinite(this.aiLearningStats?.totalReward)
      ? this.aiLearningStats.totalReward
      : 0;
    this.actionLock = false;
    this.pendingClear = null;
    this.pendingChainClearQueue = [];
    this.skillChargeFlights = [];
    this.tempLockTimer = 0;
    this.runFinished = false;

    this.score = 0;
    this.displayedScore = 0;
    this.gameDuration = 60 + (this.activeItems.time ? 5 : 0);
    this.timeRemaining = this.gameDuration;
    this.timeUp = false;
    this.paused = false;
    this.fanCooldown = 0;
    this.fanPulse = 0;
    this.nextChainScoreMultiplier = 1;
    this.lastActionAt = this.elapsed;
    this.totalCleared = 0;
    this.coinBonus = 0;
    this.expBonus = 0;
    this.namineSkillTimer = 0;
    this.postChainCleanupSessionIds = [];
    this.myTsum = TSUM_TYPES[this.selectedMyTsumIndex];
    this.skillSystem.configure(this.myTsum, this.selectedSkillLevel);
    this.feverSystem.reset();
    this.comboSystem.reset();
    this.skillRuntime.reset();
    this.boardState.reset();

    // Initialize dual gauge system for Judy & Nick
    if (this.myTsum.id === "judyNick") {
      this.judyNickGaugeManager = new JudyNickGaugeManager(this);
    } else {
      this.judyNickGaugeManager = null;
    }

    const boardTypeLimit = this.getBoardTypeLimit(this.activeItems);
    this.availableTypes = this.getBoardTypes(boardTypeLimit);
    this.currentWeights = this.getBoardWeights(this.availableTypes.length);
    console.log('board types:', this.availableTypes.map((type) => type.id), 'count:', this.availableTypes.length);

    this.populateField();
    this.refreshRenderBodies();
    if (this.aiAutoPlay && this.aiTrainingMode && !this.aiLearningMode) {
      this.pickAiStrategyForNextRun();
    }
    this.aiRunBombUses = 0;
    this.aiRunSkillUses = 0;
    this.aiRunMaxChain = 0;
    this.aiRunIndex += 1;
    this.state = "playing";
    this.noteAction();
  }

  // Select a tsum by id and skill level, prepare for item selection
  selectTsum(tsumId, skillLevel) {
    const type = TSUM_TYPES.find((t) => t.id === tsumId) || TSUM_TYPES[0];
    const idx = TSUM_TYPES.findIndex((t) => t.id === type.id);
    this.selectedMyTsumIndex = idx >= 0 ? idx : 0;
    this.myTsum = TSUM_TYPES[this.selectedMyTsumIndex];
    // save chosen skill level (default to 6 if unspecified)
    const level = Number.isFinite(Number(skillLevel)) ? clamp(Number(skillLevel), 1, 6) : 6;
    this.currentSkillLevel = level;
    this.selectedSkillLevel = level;
    this.judyNickPreparedMode = "judy";
    // reset item selection for new tsum, but only if changing tsums
    this.itemSelection = this.blankItemSelection();
    // configure skill system for the new tsum using selected level
    if (this.skillSystem && typeof this.skillSystem.configure === 'function') {
      this.skillSystem.configure(this.myTsum, this.currentSkillLevel || 3);
    }
    // move to item selection screen instead of starting immediately
    this.state = "items";
  }

  populateField() {
    this.tsums.length = 0;
    const placed = [];
    const spacingX = TSUM_RADIUS * 1.86;
    const spacingY = TSUM_RADIUS * 1.92;
    const usableWidth = FIELD_RIGHT - FIELD_LEFT - TSUM_RADIUS * 2;
    const cols = Math.max(1, Math.floor(usableWidth / spacingX));
    const totalRows = Math.ceil(TARGET_TSUM_COUNT / cols);
    const boardCenterX = (FIELD_LEFT + FIELD_RIGHT) * 0.5;
    const startX = boardCenterX - ((cols - 1) * spacingX) * 0.5;
    const bottomY = FIELD_BOTTOM - TSUM_RADIUS - 10;

    for (let row = 0; row < totalRows; row += 1) {
      const rowCount = Math.min(cols, TARGET_TSUM_COUNT - placed.length);
      const rowOffset = row % 2 === 0 ? 0 : spacingX * 0.5;
      const rowStartX = startX + rowOffset;
      const y = bottomY - row * spacingY;

      for (let col = 0; col < rowCount; col += 1) {
        if (placed.length >= TARGET_TSUM_COUNT) {
          break;
        }

        let x = rowStartX + col * spacingX;
        x = clamp(x, FIELD_LEFT + TSUM_RADIUS + 6, FIELD_RIGHT - TSUM_RADIUS - 6);

        const tsum = new Tsum(
          this,
          this.randomTsumType(),
          x + rand(-2.5, 2.5),
          y + rand(-2.5, 2.5),
          0,
          0
        );
        this.boardState.applyScaleModifiersToSpawn(tsum);
        tsum.bounce = 0;
        placed.push(tsum);
      }
    }

    this.tsums = placed;
  }

  createSpawnTsum(type, index = 0, total = TARGET_TSUM_COUNT, options = {}) {
    const usableWidth = FIELD_RIGHT - FIELD_LEFT - TSUM_RADIUS * 2;
    const lanes = Math.max(4, Math.min(7, Math.ceil(Math.sqrt(total))));
    const lane = index % lanes;
    const laneCenter = FIELD_LEFT + TSUM_RADIUS + usableWidth * ((lane + 0.5) / lanes);
    const x = clamp(laneCenter + rand(-12, 12), FIELD_LEFT + TSUM_RADIUS, FIELD_RIGHT - TSUM_RADIUS);
    const row = Math.floor(index / lanes);
    const y = FIELD_TOP - TSUM_RADIUS * 1.45 - (row * TSUM_RADIUS * 2.35);
    const vx = (Math.random() - 0.5) * 2.2;
    const vy = Math.random() * 2;
    const tsum = new Tsum(this, type, x, y, vx, vy, options);
    tsum.spawnedAboveField = true;
    tsum.spawnedAtElapsed = this.elapsed;
    this.boardState.applyScaleModifiersToSpawn(tsum);
    this.tsums.push(tsum);
    const spawnResult = this.skillRuntime.dispatchSpawn(tsum);
    if (spawnResult?.replaceWithBombType) {
      this.boardState.onNodesCleared([tsum]);
      this.tsums = this.tsums.filter((entry) => entry.id !== tsum.id);
      const bomb = new Bomb(this, spawnResult.replaceWithBombType, tsum.x, tsum.y, tsum.vx, tsum.vy);
      bomb.effectRadius = spawnResult.effectRadius || bomb.effectRadius;
      bomb.correctionType = spawnResult.correctionType || null;
      this.applyCoingainMiniScaleToBody(bomb);
      return bomb;
    }
    this.applyCoingainMiniScaleToBody(tsum);
    return tsum;
  }

  getLiveBodyCount() {
    return this.tsums.filter((tsum) => !tsum.dead && !tsum.removing).length + this.bombs.filter((bomb) => !bomb.dead).length;
  }

  getLiveBodyOccupancy() {
    const tsumOccupancy = this.tsums.reduce((sum, tsum) => (
      tsum.dead || tsum.removing ? sum : sum + getTsumOccupancyWeight(tsum)
    ), 0);
    const bombOccupancy = this.bombs.filter((bomb) => !bomb.dead).length;
    return tsumOccupancy + bombOccupancy;
  }

  getLiveNaturalLargeTsumCount() {
    return this.tsums.filter((tsum) => (
      tsum
      && !tsum.dead
      && tsum.isLarge
      && tsum.largeSpawnSource === "natural"
    )).length;
  }

  queueNaturalLargeTsum(clearEvent) {
    const effectiveClearCount = clearEvent?.effectiveClearCount || 0;
    if (!shouldSpawnLargeTsum(effectiveClearCount, this.random, this.largeTsumSpawnChance)) {
      return false;
    }
    const candidates = Array.isArray(clearEvent?.clearedTypeCandidates)
      ? clearEvent.clearedTypeCandidates.filter(Boolean)
      : [];
    const eventType = clearEvent?.type?.id ? clearEvent.type : null;
    const type = eventType || candidates[0] || this.randomTsumType();
    if (!type) {
      return false;
    }
    this.pendingLargeTsumTypes.push(type);
    return true;
  }

  spawnReplacementTsums() {
    if (this.isCoingainSpawnPaused()) {
      return;
    }
    const targetOccupancy = this.getTargetBodyCount();
    let deficit = Math.max(0, targetOccupancy - this.getLiveBodyOccupancy());
    let spawnIndex = 0;
    const maxSpawns = Math.max(1, targetOccupancy * 2);
    while (deficit >= 1 && spawnIndex < maxSpawns) {
      const pendingLargeType = this.pendingLargeTsumTypes.length > 0
        ? this.pendingLargeTsumTypes.shift()
        : null;
      const canSpawnLarge = canSpawnNaturalLargeTsum({
        hasPendingReservation: !!pendingLargeType,
        liveNaturalLargeCount: this.getLiveNaturalLargeTsumCount(),
        availableBodySlots: deficit
      });
      const type = canSpawnLarge ? pendingLargeType : this.randomTsumType();
      const body = this.createSpawnTsum(type, spawnIndex, Math.ceil(deficit), {
        isLarge: canSpawnLarge,
        largeSpawnSource: canSpawnLarge ? "natural" : null
      });
      if (!body) {
        spawnIndex += 1;
        continue;
      }
      if (body.isBomb) {
        this.bombs.push(body);
      }
      spawnIndex += 1;
      deficit = Math.max(0, targetOccupancy - this.getLiveBodyOccupancy());
    }
  }

  randomTsumType() {
    return this.boardState.chooseSpawnType(
      this.availableTypes,
      this.currentWeights,
      this.availableTypes[this.availableTypes.length - 1]
    );
  }

  findTsumAt(x, y) {
    let candidate = null;
    let bestY = Infinity;
    for (const tsum of this.tsums) {
      if (tsum.dead || tsum.removing || tsum.clearOccupying || this.boardState.isFrozen(tsum) || !this.isTsumInPlayArea(tsum)) {
        continue;
      }
      if (distance(x, y, tsum.x, tsum.y) <= this.getBodyRadius(tsum) + CHAIN_INPUT_MARGIN && tsum.y < bestY) {
        bestY = tsum.y;
        candidate = tsum;
      }
    }
    return candidate;
  }

  findBombAt(x, y) {
    for (let i = this.bombs.length - 1; i >= 0; i -= 1) {
      const bomb = this.bombs[i];
      if (!bomb.dead && distance(x, y, bomb.x, bomb.y) <= this.getBodyRadius(bomb)) {
        return bomb;
      }
    }
    return null;
  }

  getSortedTsums(mode = "bottom") {
    const tsums = this.tsums.filter((tsum) => !tsum.dead);
    if (mode === "top") {
      return tsums.sort((a, b) => a.y - b.y);
    }
    return tsums.sort((a, b) => b.y - a.y);
  }

  refreshRenderTsums() {
    this.refreshRenderBodies();
  }

  getPhysicsBodies() {
    return [...this.tsums, ...this.bombs].filter(isBodyPhysicsActive);
  }

  getOccupyingBodies() {
    return [...this.tsums, ...this.bombs].filter(isBodyOccupying);
  }

  getBodyCollisionX(body) {
    return body.clearOccupying && typeof body.clearOccupyX === "number" ? body.clearOccupyX : body.x;
  }

  getBodyCollisionY(body) {
    return body.clearOccupying && typeof body.clearOccupyY === "number" ? body.clearOccupyY : body.y;
  }

  getRenderableBodies() {
    return [...this.tsums, ...this.bombs]
      .filter((body) => this.isBodyRenderable(body))
      .slice()
      .sort((a, b) => b.y - a.y);
  }

  isTsumInPlayArea(tsum) {
    if (!tsum || tsum.dead || tsum.removing) {
      return false;
    }
    return tsum.y - this.getBodyRadius(tsum) >= FIELD_TOP;
  }

  isBodyRenderable(body) {
    if (!isBodyVisible(body)) {
      return false;
    }
    if (body.isBomb) {
      return true;
    }
    return body.y + this.getBodyRadius(body) >= FIELD_TOP;
  }

  refreshRenderBodies() {
    this.renderBodies = this.getRenderableBodies();
  }

  getFieldFloorY(x) {
    const centerX = (FIELD_LEFT + FIELD_RIGHT) * 0.5;
    const halfWidth = Math.max(1, (FIELD_RIGHT - FIELD_LEFT) * 0.5);
    const normalized = clamp((x - centerX) / halfWidth, -1, 1);
    const curveDepth = 8;
    return FIELD_BOTTOM - curveDepth * normalized * normalized;
  }

  isBodySettled(body, bodies = this.getPhysicsBodies()) {
    if (Math.abs(body.vx) >= 0.1 || Math.abs(body.vy) >= 0.1) {
      return false;
    }

    const bodyRadius = this.getBodyRadius(body);
    const floorY = this.getFieldFloorY(body.x);
    if (body.y + bodyRadius >= floorY - 0.5) {
      return true;
    }

    for (const other of bodies) {
      if (other === body || other.dead || (other.removing && !other.clearOccupying) || (other.inChain && !other.clearOccupying)) {
        continue;
      }

      const bodyY = this.getBodyCollisionY(body);
      const otherY = this.getBodyCollisionY(other);
      const dx = this.getBodyCollisionX(other) - this.getBodyCollisionX(body);
      const dy = otherY - bodyY;
      const dist = Math.sqrt(dx * dx + dy * dy) || 0.001;
      const minDist = this.getBodyRadius(body) + this.getBodyRadius(other);
      const touching = dist <= minDist + 1.5;
      const supportedFromBelow = otherY > bodyY && dy > Math.abs(dx) * 0.2;

      if (touching && supportedFromBelow && Math.abs(other.vx) < 0.1 && Math.abs(other.vy) < 0.1) {
        return true;
      }
    }

    return false;
  }

  isBodyMotionLocked(body) {
    return !!(
      body &&
      !body.isBomb &&
      this.boardState &&
      this.boardState.isFreezeMovementLocked(body)
    );
  }

  attemptSkillActivation(fromKeyboard) {
    if (this.state !== "playing" || this.actionLock || this.dragging) {
      return false;
    }
    if (this.paused || this.isCoingainInputLocked()) {
      return false;
    }
    if (this.myTsum.id === "judyNick") {
      const mode = this.getJudyNickReadySkillMode();
      if (!mode) {
        this.triggerSkillButtonFeedback("not-ready");
        this.addFloatingText(SKILL_BUTTON_RECT.x + SKILL_BUTTON_RECT.w * 0.5, SKILL_BUTTON_RECT.y + SKILL_BUTTON_RECT.h + 20, "NOT READY", "#ff8787", 16, 0.55);
        return false;
      }
      this.judyNickPreparedMode = mode;
      const used = this.executeSkill(this.myTsum.id, this.selectedSkillLevel);
      if (used) {
        this.judyNickGaugeManager.consumeSkill(mode);
        this.skillSystem.consume();
        this.triggerSkillButtonFeedback("ready");
        if (fromKeyboard) {
          this.addFloatingText(SKILL_BUTTON_RECT.x + SKILL_BUTTON_RECT.w * 0.5, SKILL_BUTTON_RECT.y + SKILL_BUTTON_RECT.h + 20, "SKILL!", "#ffe8a2", 16, 0.6);
        }
      }
      return used;
    }
    if (!this.skillSystem.ready) {
      this.triggerSkillButtonFeedback("not-ready");
      this.addFloatingText(SKILL_BUTTON_RECT.x + SKILL_BUTTON_RECT.w * 0.5, SKILL_BUTTON_RECT.y + SKILL_BUTTON_RECT.h + 20, "NOT READY", "#ff8787", 16, 0.55);
      return false;
    }
    if (this.myTsum.id === "coingain" && this.getCoingainSession()) {
      this.triggerSkillButtonFeedback("not-ready");
      return false;
    }
    const used = this.skillSystem.use();
    if (used) {
      this.triggerSkillButtonFeedback("ready");
      if (fromKeyboard) {
        this.addFloatingText(SKILL_BUTTON_RECT.x + SKILL_BUTTON_RECT.w * 0.5, SKILL_BUTTON_RECT.y + SKILL_BUTTON_RECT.h + 20, "SKILL!", "#ffe8a2", 16, 0.6);
      }
    }
    return used;
  }

  triggerSkillButtonFeedback(mode) {
    this.skillButtonFeedback = {
      mode,
      timer: 0.32,
      max: 0.32
    };
  }

  togglePause() {
    if (this.state !== "playing" || this.timeUp) {
      return false;
    }
    const nextPaused = !this.paused;
    if (this.battleController?.active && this.role === "player") {
      this.battleController.setPaused(nextPaused);
    } else {
      this.paused = nextPaused;
    }
    if (this.paused) {
      this.inputRouter.handlePointerUp(this.dragPointer);
    }
    if (this.paused && this.dragging) {
      this.dragging = false;
      this.chain.forEach((tsum) => { tsum.inChain = false; });
      this.chain = [];
      this.chainSet = new Set();
      this.chainTypeId = null;
    }
    this.noteAction();
    this.addFloatingText(PAUSE_BUTTON_RECT.x + PAUSE_BUTTON_RECT.w * 0.5, PAUSE_BUTTON_RECT.y + PAUSE_BUTTON_RECT.h + 18, this.paused ? "PAUSE" : "GO!", "#ffffff", 16, 0.4);
    return true;
  }

  triggerFan() {
    if (this.state !== "playing" || this.paused || this.isCoingainInputLocked() || this.actionLock || this.fanCooldown > 0) {
      return false;
    }
    const bodies = this.getPhysicsBodies();
    for (const body of bodies) {
      if (this.isBodyMotionLocked(body)) {
        body.vx = 0;
        body.vy = 0;
        continue;
      }
      body.vx += rand(-2.8, 2.8);
      body.vy -= rand(1.2, 3.2);
      body.bounce = 1;
    }
    this.fanCooldown = 1.2;
    this.fanPulse = 0.4;
    this.noteAction();
    this.addFloatingText(DECOR_BUTTON_RECT.x + DECOR_BUTTON_RECT.w * 0.5, DECOR_BUTTON_RECT.y - 14, "FAN!", "#ffffff", 18, 0.5);
    return true;
  }

  startChain(tsum, pos) {
    const chainRule = this.getChainBehaviorForStart(tsum);
    if (!chainRule) {
      return false;
    }
    tsum.inChain = true;
    this.dragging = true;
    this.chain = [tsum];
    this.chainSet = new Set([tsum.id]);
    this.chainRule = chainRule;
    this.chainTypeId = this.boardState.getResolvedType(tsum).id;
    this.dragPointer = pos;
    this.noteAction();
    return true;
  }

  extendChain(pos) {
    if (!this.dragging || this.chain.length === 0) {
      return;
    }
    this.dragPointer = pos;
    const last = this.chain[this.chain.length - 1];
    if (this.chain.length > 1) {
      const backtrackTarget = this.chain[this.chain.length - 2];
      const dBacktrackCursor = distance(pos.x, pos.y, backtrackTarget.x, backtrackTarget.y);
      if (dBacktrackCursor <= this.getBodyRadius(backtrackTarget) * 1.3) {
        const removed = this.chain.pop();
        if (removed) {
          removed.inChain = false;
          this.chainSet.delete(removed.id);
        }
        return;
      }
    }

    let candidate = null;
    let bestCursorDist = Infinity;
    for (const tsum of this.tsums) {
      if (tsum.dead || tsum.removing || tsum.clearOccupying || tsum.inChain || this.boardState.isFrozen(tsum) || !this.isTsumInPlayArea(tsum)) {
        continue;
      }
      if (this.boardState.getResolvedType(tsum).id !== this.chainTypeId) {
        if (!this.chainRule?.allowedTypeIds?.has(this.boardState.getResolvedType(tsum).id)) {
          continue;
        }
      }
      const dCursor = distance(pos.x, pos.y, tsum.x, tsum.y);
      if (dCursor > this.getBodyRadius(tsum) * 1.3 + CHAIN_INPUT_MARGIN) {
        continue;
      }
      if (!this.canExtendActiveChain(last, tsum, CHAIN_CONNECT_MARGIN)) {
        continue;
      }
      if (dCursor < bestCursorDist) {
        bestCursorDist = dCursor;
        candidate = tsum;
      }
    }

    if (candidate) {
      candidate.inChain = true;
      this.chain.push(candidate);
      this.chainSet.add(candidate.id);
    }
  }

  finishChain() {
    const chain = this.chain.slice();
    this.dragging = false;
    this.chain = [];
    this.chainSet = new Set();
    this.chainTypeId = null;
    this.chainRule = null;
    if (chain.length < 3) {
      chain.forEach((tsum) => { tsum.inChain = false; });
      this.flushPostChainCleanup();
      return;
    }
    if (this.inputRouter.handleChainCommit(chain)) {
      chain.forEach((tsum) => { tsum.inChain = false; });
      return;
    }
    this.resolveChain(chain);
  }

  resolveChain(chain) {
    if (chain.length < 3) {
      chain.forEach((tsum) => { tsum.inChain = false; });
      return;
    }
    if (this.actionLock && !this.canQueueChainDuringActiveClear()) {
      chain.forEach((tsum) => { tsum.inChain = false; });
      return;
    }
    const last = chain[chain.length - 1];
    this.aiRunMaxChain = Math.max(this.aiRunMaxChain, chain.length);
    const handled = this.clearPipeline.beginClear({
      source: "chain",
      x: last.x,
      y: last.y,
      targets: chain,
      type: this.boardState.getResolvedType(chain[0]),
      chargeMultiplier: this.isGastonLoopActive() ? 0 : 1,
      correctionType: this.isGastonLoopActive() ? skillValue("gaston", "coinCorrectionType", this.selectedSkillLevel) : null
    });
    chain.forEach((tsum) => {
      if (!tsum.clearOccupying) {
        tsum.inChain = false;
      }
    });
    if (!handled) {
      this.actionLock = false;
    }
  }

  updateAiAutoPlay(dt) {
    if (!this.aiAutoPlay) {
      this.cancelAiChainAnimation();
      this.aiAutoPlayTimer = 0;
      return;
    }
    if (this.state !== "playing" || this.paused || this.timeUp) {
      this.cancelAiChainAnimation();
      this.aiAutoPlayTimer = 0;
      return;
    }
    if (this.aiChainAnimating) {
      this.updateAiChainAnimation(dt);
      return;
    }
    this.aiAutoPlayTimer = Math.min(this.aiAutoPlayInterval, this.aiAutoPlayTimer + dt);
    if (this.aiAutoPlayTimer < this.aiAutoPlayInterval) {
      return;
    }
    if (this.tryAiBombCancelDuringSequentialClear()) {
      this.aiAutoPlayTimer = 0;
      return;
    }
    if (this.actionLock || this.dragging || this.pendingClear) {
      if (this.actionLock || this.pendingClear) {
        this.logBlockedAiBombCancelOpportunity(
          this.pendingClear?.bombCancelPending
            ? "bombCancelPending-active"
            : "actionLock-or-pendingClear-before-ai-action"
        );
      }
      return;
    }
    this.aiAutoPlayTimer = 0;
    this.performAiAutoPlayStep();
  }

  shouldAiUseSkillNow(longestChain = []) {
    if (!this.skillSystem.ready) {
      return false;
    }
    const liveBombCount = this.bombs.filter((bomb) => bomb && !bomb.dead && !bomb.removing).length;
    const chainLength = Array.isArray(longestChain) ? longestChain.length : 0;
    if (this.timeRemaining <= 8 || this.feverSystem.active) {
      return true;
    }
    if (liveBombCount >= 2) {
      return false;
    }
    if (chainLength >= 9) {
      return false;
    }
    return true;
  }

  findAiSpecialTapTarget(options = {}) {
    const excludeCoronationFreezeSpecialTap = !!options.excludeCoronationFreezeSpecialTap;
    let frozenTarget = null;
    let bubbleTarget = null;
    let frozenCandidateCount = 0;
    let frozenBestY = Infinity;
    let bubbleBestY = Infinity;
    for (const tsum of this.tsums) {
      if (!tsum || tsum.dead || tsum.removing) {
        continue;
      }
      if (this.boardState.isFrozen(tsum)) {
        const frozenEntry = this.boardState.getFrozenEntry(tsum);
        if (excludeCoronationFreezeSpecialTap && frozenEntry?.freezeKind === "coronationElsa") {
          continue;
        }
        const frozenInfo = this.boardState.getFrozenTapInfo(tsum);
        if (frozenInfo && frozenInfo.targets && frozenInfo.targets.length > 0) {
          frozenCandidateCount += 1;
          if (tsum.y < frozenBestY) {
            frozenBestY = tsum.y;
            frozenTarget = tsum;
          }
        }
      }
      if (
        !tsum.inChain &&
        this.boardState.hasBubble(tsum) &&
        this.isTsumInPlayArea(tsum) &&
        tsum.y < bubbleBestY
      ) {
        bubbleBestY = tsum.y;
        bubbleTarget = tsum;
      }
    }
    if (frozenTarget) {
      if (this.aiLearningDebug) {
        console.log("[AI DEBUG] special target freeze candidate", {
          freezeLayerSize: this.boardState.freezeLayer?.size || 0,
          frozenCandidateCount,
          target: {
            id: frozenTarget.id,
            x: frozenTarget.x,
            y: frozenTarget.y,
            dead: frozenTarget.dead,
            removing: frozenTarget.removing,
            inChain: frozenTarget.inChain,
            isFrozen: this.boardState.isFrozen(frozenTarget)
          }
        });
      }
      return { type: "freeze", x: frozenTarget.x, y: frozenTarget.y, target: frozenTarget };
    }
    if (bubbleTarget) {
      return { type: "bubble", x: bubbleTarget.x, y: bubbleTarget.y, target: bubbleTarget };
    }
    return null;
  }

  findAiCoronationFreezeTapTarget() {
    let frozenTarget = null;
    let frozenBestY = Infinity;
    for (const tsum of this.tsums) {
      if (!tsum || tsum.dead || tsum.removing) {
        continue;
      }
      if (!this.boardState.isFrozen(tsum)) {
        continue;
      }
      const frozenEntry = this.boardState.getFrozenEntry(tsum);
      if (frozenEntry?.freezeKind !== "coronationElsa") {
        continue;
      }
      const frozenInfo = this.boardState.getFrozenTapInfo(tsum);
      if (!frozenInfo || !Array.isArray(frozenInfo.targets) || frozenInfo.targets.length <= 0) {
        continue;
      }
      if (tsum.y < frozenBestY) {
        frozenBestY = tsum.y;
        frozenTarget = tsum;
      }
    }
    if (!frozenTarget) {
      return null;
    }
    return { type: "freeze", x: frozenTarget.x, y: frozenTarget.y, target: frozenTarget };
  }

  tryAiSpecialTap(strategy = null, target = null) {
    const specialTarget = target || this.findAiSpecialTapTarget();
    if (!specialTarget) {
      return { success: false, hadOpportunity: false, used: false };
    }
    const pos = { x: specialTarget.x, y: specialTarget.y };
    const frozenAtPos = specialTarget.type === "freeze"
      ? this.boardState.findFrozenGroupAt(pos)
      : null;
    if (this.aiLearningDebug && specialTarget.type === "freeze") {
      console.log("[AI DEBUG] special tap freeze before handleTap", {
        pos,
        findFrozenGroupAt: !!frozenAtPos,
        frozenId: frozenAtPos ? frozenAtPos.id : null
      });
    }
    const handled = this.inputRouter.handleTap(pos);
    if (this.aiLearningDebug && specialTarget.type === "freeze") {
      console.log("[AI DEBUG] special tap freeze after handleTap", {
        pos,
        handled
      });
    }
    if (handled) {
      this.noteAction();
      if (strategy) {
        console.log(`[AI AutoPlay] action=special-tap strategy=${strategy}`);
      } else if (!this.aiLearningMode || this.aiLearningDebug) {
        console.log("[AI] learning action=special-tap");
      }
      return {
        success: true,
        key: "special:tap",
        type: "specialTap",
        hadOpportunity: true,
        used: true
      };
    }
    return { success: false, hadOpportunity: true, used: true };
  }

  performAiAutoPlayStep() {
    if (this.state !== "playing" || this.paused || this.isCoingainInputLocked() || this.timeUp || this.actionLock || this.dragging || this.pendingClear || this.aiChainAnimating) {
      return false;
    }
    if (this.aiLearningMode) {
      return this.performAiLearningStep();
    }
    const strategy = this.aiCurrentStrategy || "skillFirst";
    const longestChain = this.findBestAiChain();
    const fastChain = strategy === "fastClear" ? this.findFastClearChain() : [];
    const initialBombCandidates = this.getAiBombCandidates();
    const startChainWithDebug = (chain, reason) => {
      if (initialBombCandidates.length > 0) {
        this.logAiBombDecision("ai-action-selected", {
          actionType: "chain",
          reason,
          bombCandidates: initialBombCandidates,
          selectedBomb: initialBombCandidates[0],
          longestChain,
          fastChain,
          failureReason: "chain-selected-before-bomb"
        });
      }
      return this.startAiChainAnimation(chain);
    };
    const trySkill = () => {
      if (!this.shouldAiUseSkillNow(longestChain)) {
        return false;
      }
      this.noteAction();
      const used = this.attemptSkillActivation(false);
      if (used) {
        this.aiRunSkillUses += 1;
        if (initialBombCandidates.length > 0) {
          this.logAiBombDecision("ai-action-selected", {
            actionType: "skill",
            reason: "skill-priority-before-bomb",
            bombCandidates: initialBombCandidates,
            selectedBomb: initialBombCandidates[0],
            longestChain,
            fastChain,
            failureReason: "skill-selected-before-bomb"
          });
        }
        console.log(`[AI AutoPlay] action=skill strategy=${strategy}`);
      }
      return used;
    };
    const tryBomb = () => {
      const bombCandidates = this.getAiBombCandidates();
      const bomb = this.findAiBombTarget();
      if (!bomb) {
        if (bombCandidates.length > 0) {
          this.logAiBombDecision("ai-bomb-selection-failed", {
            actionType: "bomb",
            reason: "bomb-action-requested-but-no-valid-target",
            bombCandidates,
            selectedBomb: bombCandidates[0],
            longestChain,
            fastChain,
            failureReason: this.describeAiBombTapFailure(bombCandidates[0])
          });
        }
        return false;
      }
      this.logAiBombDecision("ai-action-selected", {
        actionType: "bomb",
        reason: "valid-bomb-candidate-selected",
        bombCandidates,
        selectedBomb: bomb,
        longestChain,
        fastChain,
        handleTapResult: "not-run-direct-explodeBomb",
        tapExecuted: false,
        explodeBombCalled: true
      });
      this.explodeBomb(bomb);
      this.aiRunBombUses += 1;
      console.log(`[AI AutoPlay] action=bomb type=${bomb.bombType || "normal"} strategy=${strategy}`);
      return true;
    };
    if (this.tryAiSpecialTap(strategy).success) {
      if (initialBombCandidates.length > 0) {
        this.logAiBombDecision("ai-action-selected", {
          actionType: "specialTap",
          reason: "special-tap-priority-before-bomb",
          bombCandidates: initialBombCandidates,
          selectedBomb: initialBombCandidates[0],
          longestChain,
          fastChain,
          failureReason: "special-tap-selected-before-bomb"
        });
      }
      return true;
    }
    if (strategy === "skillFirst") {
      if (trySkill()) {
        return true;
      }
      if (tryBomb()) {
        return true;
      }
      if (longestChain.length >= 3) {
        return startChainWithDebug(longestChain, "skillFirst-fallback-chain-after-bomb-check");
      }
    } else if (strategy === "bombFirst") {
      if (tryBomb()) {
        return true;
      }
      if (trySkill()) {
        return true;
      }
      if (longestChain.length >= 3) {
        return startChainWithDebug(longestChain, "bombFirst-fallback-chain-after-bomb-check");
      }
    } else if (strategy === "fastClear") {
      if (fastChain.length >= 3) {
        return startChainWithDebug(fastChain, "fastClear-priority-chain-before-bomb");
      }
      if (trySkill()) {
        return true;
      }
      if (tryBomb()) {
        return true;
      }
      if (longestChain.length >= 3) {
        return startChainWithDebug(longestChain, "fastClear-fallback-longest-chain-after-bomb-check");
      }
    } else {
      if (longestChain.length >= 3) {
        return startChainWithDebug(longestChain, "longestChain-priority-chain-before-bomb");
      }
      if (trySkill()) {
        return true;
      }
      if (tryBomb()) {
        return true;
      }
    }

    if (longestChain.length < 3) {
      console.log(`[AI AutoPlay] action=none reason=no-chain strategy=${strategy}`);
      return false;
    }
    return startChainWithDebug(longestChain, "default-fallback-chain");
  }

  performAiLearningStep() {
    const chainCandidates = this.getAiLearningChainCandidates();
    const stateKey = this.buildAiLearningStateKey(chainCandidates);
    this.finalizePendingAiLearningReward(stateKey);
    if (this.aiLearningPendingSkillDecision) {
      this.finalizePendingAiLearningSkillDecision(this.buildAiLearningSkillDecisionStateKey());
    }
    if (this.aiLearningPendingCoronationFreezeDecision) {
      this.finalizePendingAiLearningCoronationFreezeDecision(this.buildAiLearningCoronationFreezeDecisionStateKey());
    }

    if (!this.aiLearningEpisodeSpecialTapStats || typeof this.aiLearningEpisodeSpecialTapStats !== "object") {
      this.aiLearningEpisodeSpecialTapStats = this.createEmptyAiLearningSpecialTapStats();
    }
    let excludeSkillForThisStep = false;
    let excludeCoronationFreezeSpecialTap = false;
    if (this.aiLearningSkillDecisionEnabled && this.aiAutoPlay && this.aiLearningMode && this.skillSystem.ready) {
      const skillStateKey = this.buildAiLearningSkillDecisionStateKey();
      const skillDecision = this.selectAiLearningSkillDecisionAction(skillStateKey);
      const skillSnapshot = this.captureAiLearningSnapshot();
      this.aiLearningPendingSkillDecision = {
        stateKey: skillStateKey,
        actionKey: skillDecision.key,
        snapshot: skillSnapshot,
        selectionMode: skillDecision.selectionMode || null
      };
      if (skillDecision.key === "useSkill") {
        const success = this.attemptSkillActivation(false);
        if (success) {
          this.aiRunSkillUses += 1;
          this.recordAiLearningAction("skill", true);
          return true;
        }
        this.finalizePendingAiLearningSkillDecision(skillStateKey);
        return false;
      }
      excludeSkillForThisStep = true;
    }
    const canUseCoronationFreezeDecision = !!(
      this.aiLearningCoronationElsaFreezeDecisionEnabled &&
      this.aiAutoPlay &&
      this.aiLearningMode &&
      this.myTsum?.id === "coronationElsa" &&
      this.findAiCoronationFreezeTapTarget()
    );
    if (canUseCoronationFreezeDecision) {
      const freezeDecisionStateKey = this.buildAiLearningCoronationFreezeDecisionStateKey();
      const freezeDecision = this.selectAiLearningCoronationFreezeDecisionAction(freezeDecisionStateKey);
      this.aiLearningPendingCoronationFreezeDecision = {
        stateKey: freezeDecisionStateKey,
        actionKey: freezeDecision.key,
        snapshot: this.captureAiLearningSnapshot(),
        selectionMode: freezeDecision.selectionMode || null
      };
      if (freezeDecision.key === "waitFreeze") {
        excludeCoronationFreezeSpecialTap = true;
      }
    } else {
      this.aiLearningPendingCoronationFreezeDecision = null;
    }
    const candidates = this.getAiLearningActionCandidates(chainCandidates, {
      excludeSkill: excludeSkillForThisStep,
      excludeCoronationFreezeSpecialTap
    });
    const hasSpecialTapCandidate = candidates.some((candidate) => candidate.type === "specialTap");
    this.aiLearningEpisodeSpecialTapStats.opportunities += hasSpecialTapCandidate ? 1 : 0;
    const action = this.selectAiLearningAction(stateKey, candidates);
    const snapshot = this.captureAiLearningSnapshot();
    const result = this.executeAiLearningAction(action);
    if (action.type === "specialTap") {
      this.aiLearningEpisodeSpecialTapStats.uses += result.used ? 1 : 0;
      this.aiLearningEpisodeSpecialTapStats.successes += result.success ? 1 : 0;
    }

    this.aiLastState = stateKey;
    this.aiLastAction = {
      ...result,
      key: action.key,
      selectionMode: action.selectionMode || null
    };
    this.aiLastSnapshot = snapshot;

    if (!result.success) {
      const after = this.captureAiLearningSnapshot();
      const reward = this.calculateAiLearningReward(snapshot, after, this.aiLastAction);
      this.updateAiQValue(stateKey, action.key, reward, stateKey);
      this.applyAiLearningDelayedReward(reward);
      this.enqueueAiLearningDelayedTransition(
        stateKey,
        action.key,
        stateKey,
        this.aiLastAction?.selectionMode || null
      );
      this.aiLearningStats.totalReward = (this.aiLearningStats.totalReward || 0) + reward;
      this.recordAiLearningRewardBySelection(this.aiLastAction, reward);
      this.aiLastState = null;
      this.aiLastAction = null;
      this.aiLastSnapshot = null;
    }
    return result.success;
  }

  startAiChainAnimation(chain) {
    if (!Array.isArray(chain) || chain.length < 3) {
      return false;
    }
    if (this.dragging || this.actionLock || this.pendingClear || this.aiChainAnimating) {
      return false;
    }
    if (!this.startChain(chain[0], { x: chain[0].x, y: chain[0].y })) {
      return false;
    }
    this.aiPendingChain = chain.slice();
    this.aiChainAnimating = true;
    this.aiChainStepIndex = 1;
    this.aiChainStepTimer = this.aiChainStepDelay;
    this.aiChainFinishing = false;
    if (!this.aiLearningMode || this.aiLearningDebug) {
      console.log("[AI] chain animation start");
    }
    return true;
  }

  updateAiChainAnimation(dt) {
    if (!this.aiChainAnimating) {
      return;
    }
    if (!this.dragging) {
      this.resetAiChainAnimationState();
      return;
    }

    this.aiChainStepTimer -= dt;
    if (this.aiChainStepTimer > 0) {
      return;
    }

    if (!this.aiChainFinishing) {
      if (this.aiChainStepIndex < this.aiPendingChain.length) {
        const target = this.aiPendingChain[this.aiChainStepIndex];
        this.aiChainStepIndex += 1;
        this.extendChain({ x: target.x, y: target.y });
        if (!this.aiLearningMode || this.aiLearningDebug) {
          console.log("[AI] chain step");
        }
        this.aiChainStepTimer = this.aiChainStepDelay;
        if (this.aiChainStepIndex >= this.aiPendingChain.length) {
          this.aiChainFinishing = true;
          this.aiChainStepTimer = this.aiChainFinishDelay;
        }
        return;
      }
      this.aiChainFinishing = true;
      this.aiChainStepTimer = this.aiChainFinishDelay;
      return;
    }

    const committedLength = this.chain.length;
    this.finishChain();
    if (!this.aiLearningMode || this.aiLearningDebug) {
      console.log("[AI] chain finish");
    }
    if (committedLength >= 3) {
      if (!this.aiLearningMode || this.aiLearningDebug) {
        console.log(`[AI AutoPlay] action=chain length=${committedLength}`);
      }
    }
    this.resetAiChainAnimationState();
  }

  findAiBombTarget() {
    return this.bombs.find((bomb) => (
      bomb &&
      !bomb.dead &&
      !bomb.removing &&
      this.findBombAt(bomb.x, bomb.y) === bomb
    )) || null;
  }

  findBestAiChain() {
    const useCoronationIceScore = this.skillRuntime.getSessionsByHandlerId("coronationElsa").length > 0;
    const coronationPlannerSnapshot = useCoronationIceScore
      ? buildCoronationElsaPlannerSnapshot(this, this.selectedSkillLevel)
      : null;
    const scoreChain = (chain) => {
      if (!useCoronationIceScore || !Array.isArray(chain) || chain.length < 3) {
        return chain.length;
      }
      const preview = computeCoronationElsaFreezePreview(
        this,
        chain,
        this.selectedSkillLevel,
        coronationPlannerSnapshot
      );
      const predictedFreezeCount = preview.targets.length;
      const surroundExpansionCount = preview.surroundTargets.filter((tsum) => !preview.priorFrozenIds.has(tsum.id)).length;
      let overlapCount = 0;
      for (const count of preview.freezeCounts.values()) {
        if (count > 1) {
          overlapCount += (count - 1);
        }
      }
      const iceScore = predictedFreezeCount * 0.03 + surroundExpansionCount * 0.04 + overlapCount * 0.015;
      return chain.length + iceScore;
    };
    const normalBest = this.findBestAiChainNormal();
    const specialPlans = this.getAiSpecialChainSearchPlans();
    if (!specialPlans.length) {
      return normalBest;
    }
    let best = normalBest;
    let bestScore = scoreChain(best);
    for (const plan of specialPlans) {
      const adjacency = this.buildAiChainAdjacencyWithRule(plan.nodes, plan.rule);
      const chain = plan.nodes.length <= 12
        ? this.findExactAiChain(plan.nodes, adjacency)
        : this.findGreedyAiChain(plan.nodes, adjacency);
      if (!this.isAiChainConsistentWithStartRule(chain)) {
        continue;
      }
      const chainScore = scoreChain(chain);
      if (chainScore > bestScore) {
        best = chain;
        bestScore = chainScore;
      }
    }
    return best;
  }

  findBestAiChainNormal() {
    const groups = new Map();
    for (const tsum of this.tsums) {
      if (
        tsum.dead ||
        tsum.removing ||
        tsum.clearOccupying ||
        tsum.inChain ||
        this.boardState.isFrozen(tsum) ||
        this.boardState.hasBubble(tsum) ||
        !this.isTsumInPlayArea(tsum)
      ) {
        continue;
      }
      const typeId = this.boardState.getResolvedType(tsum).id;
      if (!this.getChainBehaviorForStart(tsum)) {
        continue;
      }
      if (!groups.has(typeId)) {
        groups.set(typeId, []);
      }
      groups.get(typeId).push(tsum);
    }

    let best = [];
    for (const nodes of groups.values()) {
      if (nodes.length < 3) {
        continue;
      }
      const adjacency = this.buildAiChainAdjacency(nodes);
      const chain = nodes.length <= 12
        ? this.findExactAiChain(nodes, adjacency)
        : this.findGreedyAiChain(nodes, adjacency);
      if (chain.length > best.length) {
        best = chain;
      }
    }
    return best;
  }

  getAiSpecialChainSearchPlans() {
    const liveTsums = this.tsums.filter((tsum) => !(
      tsum.dead ||
      tsum.removing ||
      tsum.clearOccupying ||
      tsum.inChain ||
      this.boardState.isFrozen(tsum) ||
      this.boardState.hasBubble(tsum) ||
      !this.isTsumInPlayArea(tsum)
    ));
    if (!liveTsums.length) {
      return [];
    }
    const byKey = new Map();
    for (const start of liveTsums) {
      const rule = this.getChainBehaviorForStart(start);
      if (!rule || rule.mode === "normal" || !rule.allowedTypeIds?.size) {
        continue;
      }
      const key = `${start.id}|${this.buildAiChainRuleKey(rule)}`;
      if (!byKey.has(key)) {
        byKey.set(key, {
          rule,
          startNode: start,
          nodes: []
        });
      }
    }
    const plans = [];
    for (const plan of byKey.values()) {
      const nodes = liveTsums.filter((tsum) => plan.rule.allowedTypeIds.has(this.boardState.getResolvedType(tsum).id));
      if (nodes.length >= 3 && nodes.some((tsum) => tsum.id === plan.startNode.id)) {
        plans.push({ ...plan, nodes });
      }
    }
    return plans;
  }

  buildAiChainRuleKey(rule) {
    if (!rule || !rule.allowedTypeIds) {
      return "invalid";
    }
    const allowed = [...rule.allowedTypeIds].sort().join(",");
    return [
      rule.mode || "normal",
      allowed,
      rule.subtypeId || "none",
      rule.startIsSpecial ? "special" : "normal"
    ].join("|");
  }

  isAiChainConsistentWithStartRule(chain) {
    if (!Array.isArray(chain) || chain.length < 2) {
      return true;
    }
    const startRule = this.getChainBehaviorForStart(chain[0]);
    if (!startRule) {
      return false;
    }
    for (let i = 1; i < chain.length; i += 1) {
      if (!this.canConnectWithChainRule(startRule, chain[i - 1], chain[i])) {
        return false;
      }
    }
    return true;
  }

  findFastClearChain() {
    const byType = new Map();
    for (const tsum of this.tsums) {
      if (
        tsum.dead ||
        tsum.removing ||
        tsum.clearOccupying ||
        tsum.inChain ||
        this.boardState.isFrozen(tsum) ||
        this.boardState.hasBubble(tsum) ||
        !this.isTsumInPlayArea(tsum)
      ) {
        continue;
      }
      const typeId = this.boardState.getResolvedType(tsum).id;
      if (!this.getChainBehaviorForStart(tsum)) {
        continue;
      }
      if (!byType.has(typeId)) {
        byType.set(typeId, []);
      }
      byType.get(typeId).push(tsum);
    }

    let best = [];
    let bestCost = Infinity;
    for (const nodes of byType.values()) {
      if (nodes.length < 3) {
        continue;
      }
      const adjacency = this.buildAiChainAdjacency(nodes);
      for (const a of nodes) {
        for (const b of adjacency.get(a.id) || []) {
          for (const c of adjacency.get(b.id) || []) {
            if (c.id === a.id) {
              continue;
            }
            const path = [a, b, c];
            const cost = distance(a.x, a.y, b.x, b.y) + distance(b.x, b.y, c.x, c.y);
            if (cost < bestCost) {
              bestCost = cost;
              best = path;
            }
          }
        }
      }
    }
    return best.length >= 3 ? best : this.findBestAiChain();
  }

  buildAiChainAdjacency(nodes) {
    const typeId = this.boardState.getResolvedType(nodes[0]).id;
    return this.buildAiChainAdjacencyWithRule(nodes, {
      mode: "normal",
      allowedTypeIds: new Set([typeId])
    });
  }

  buildAiChainAdjacencyWithRule(nodes, rule) {
    const adjacency = new Map(nodes.map((tsum) => [tsum.id, []]));
    for (let i = 0; i < nodes.length; i += 1) {
      for (let j = i + 1; j < nodes.length; j += 1) {
        if (this.canConnectWithChainRule(rule, nodes[i], nodes[j])) {
          adjacency.get(nodes[i].id).push(nodes[j]);
          adjacency.get(nodes[j].id).push(nodes[i]);
        }
      }
    }
    for (const neighbors of adjacency.values()) {
      neighbors.sort((a, b) => a.y - b.y || a.x - b.x);
    }
    return adjacency;
  }

  findExactAiChain(nodes, adjacency) {
    let best = [];
    let steps = 0;
    const maxSteps = 5000;
    const visit = (node, path, visited) => {
      steps += 1;
      if (path.length > best.length) {
        best = path.slice();
      }
      if (steps >= maxSteps || best.length === nodes.length) {
        return;
      }
      for (const next of adjacency.get(node.id) || []) {
        if (visited.has(next.id)) {
          continue;
        }
        visited.add(next.id);
        path.push(next);
        visit(next, path, visited);
        path.pop();
        visited.delete(next.id);
        if (steps >= maxSteps || best.length === nodes.length) {
          return;
        }
      }
    };

    for (const start of nodes) {
      visit(start, [start], new Set([start.id]));
      if (steps >= maxSteps || best.length === nodes.length) {
        break;
      }
    }
    return best;
  }

  findGreedyAiChain(nodes, adjacency) {
    let best = [];
    for (const start of nodes) {
      const path = [start];
      const visited = new Set([start.id]);
      let current = start;
      while (true) {
        let nextNode = null;
        let nextScore = -1;
        let nextDistance = Infinity;
        for (const candidate of adjacency.get(current.id) || []) {
          if (visited.has(candidate.id)) {
            continue;
          }
          const onward = (adjacency.get(candidate.id) || []).filter((neighbor) => !visited.has(neighbor.id)).length;
          const candidateDistance = distance(current.x, current.y, candidate.x, candidate.y);
          if (onward > nextScore || (onward === nextScore && candidateDistance < nextDistance)) {
            nextNode = candidate;
            nextScore = onward;
            nextDistance = candidateDistance;
          }
        }
        if (!nextNode) {
          break;
        }
        visited.add(nextNode.id);
        path.push(nextNode);
        current = nextNode;
      }
      if (path.length > best.length) {
        best = path;
      }
    }
    return best;
  }

  explodeBomb(bomb) {
    const canBombCancel = this.canBombCancelActiveChain();
    this.logAiBombCancelDebug("explodeBomb-called", {
      actionType: "bomb",
      bomb: bomb ? {
        id: bomb.id,
        type: bomb.bombType || "normal",
        dead: !!bomb.dead,
        removing: !!bomb.removing,
        x: Math.round(bomb.x),
        y: Math.round(bomb.y)
      } : null,
      sequentialClear: this.getSequentialClearDebugState(),
      bombCancelPending: !!this.pendingClear?.bombCancelPending,
      canBombCancel,
      explodeBombCalled: true
    });
    if (this.actionLock && !canBombCancel) {
      this.logAiBombCancelDebug("explodeBomb-blocked", {
        actionType: "bomb",
        reason: "action-lock-without-bomb-cancel-window",
        sequentialClear: this.getSequentialClearDebugState(),
        bombCancelPending: !!this.pendingClear?.bombCancelPending,
        explodeBombCalled: true,
        failureReason: "action-lock-without-bomb-cancel-window"
      });
      return;
    }
    let bombsToExplode = [bomb];
    if (bomb.bombType === "moanaSpecial") {
      bombsToExplode = this.bombs.filter((entry) => !entry.dead && entry.bombType === "moanaSpecial");
    }
    bombsToExplode.forEach((entry) => { entry.dead = true; });
    this.bombs = this.bombs.filter((entry) => !entry.dead);
    let chainRemaining = [];
    let chainRemainingIds = new Set();
    const moanaSession = this.getActiveSkillSession("guidingMoana");
    const coingainBombCountBonus = this.isCoingainCountingActive() ? bombsToExplode.length : 0;
    const bombClearCountBonus = Math.max(moanaSession ? bombsToExplode.length : 0, coingainBombCountBonus);
    if (canBombCancel) {
      chainRemaining = this.clearPipeline.cancelSequentialChainWithBomb(bombClearCountBonus, {
        coingainBombCount: coingainBombCountBonus
      });
      chainRemainingIds = new Set(chainRemaining.map((tsum) => tsum.id));
    }
    const seen = new Set();
    const affected = [];
    for (const blast of bombsToExplode) {
      for (const tsum of this.tsums) {
        if (
          tsum.dead ||
          tsum.removing ||
          (canBombCancel && (tsum.clearOccupying || tsum.inChain)) ||
          !this.isTsumInPlayArea(tsum) ||
          seen.has(tsum.id) ||
          !this.boardState.canBombAffectNode(tsum, blast.bombType)
        ) {
          continue;
        }
        if (distance(tsum.x, tsum.y, blast.x, blast.y) <= (blast.effectRadius || BOMB_BLAST_RADIUS)) {
          seen.add(tsum.id);
          affected.push(tsum);
        }
      }
    }

    const bombOnlyAffected = affected.filter((tsum) => !chainRemainingIds.has(tsum.id));

    this.applyBombEffect(bomb.bombType, bomb.x, bomb.y);
    bombsToExplode.forEach((entry) => {
      this.createShockwave(entry.x, entry.y, "rgba(255,200,0,0.6)", 6, 0, 0.3, 335);
      this.spawnExplosionSparks(entry.x, entry.y, BOMB_DATA[entry.bombType].color, 12);
    });

    if (bombOnlyAffected.length === 0 && chainRemaining.length === 0) {
      if (coingainBombCountBonus > 0) {
        this.totalCleared += coingainBombCountBonus;
        this.feverSystem.addClears(coingainBombCountBonus);
        this.coinBonus += this.getCoinsByClearCount(coingainBombCountBonus, this.myTsum.id, this.getCoingainCorrectionType());
        this.recordCoingainClear({ coingainBombCount: coingainBombCountBonus }, coingainBombCountBonus);
        this.queueNaturalLargeTsum({
          source: "bomb",
          physicalTsumCount: 0,
          effectiveClearCount: coingainBombCountBonus,
          clearedTypeCandidates: []
        });
        this.spawnReplacementTsums();
      }
      this.addFloatingText(bomb.x, bomb.y - 20, BOMB_DATA[bomb.bombType].label, BOMB_DATA[bomb.bombType].color, 18, 0.8);
      this.logAiBombCancelDebug("explodeBomb-complete", {
        actionType: "bomb",
        reason: "bomb-exploded-no-clear-targets",
        affectedCount: affected.length,
        bombOnlyAffectedCount: bombOnlyAffected.length,
        chainRemainingCount: chainRemaining.length,
        sequentialClear: this.getSequentialClearDebugState(),
        bombCancelPending: !!this.pendingClear?.bombCancelPending,
        explodeBombCalled: true
      });
      return;
    }

    if (bombOnlyAffected.length > 0) {
      const bombSpec = {
        source: "bomb",
        x: bomb.x,
        y: bomb.y,
        targets: bombOnlyAffected,
        additionalClearCount: bombClearCountBonus,
        bombType: bomb.bombType,
        coingainBombCount: coingainBombCountBonus,
        correctionType: bomb.correctionType || null
      };
      if (canBombCancel && this.pendingClear?.sequentialChain) {
        const bombPrepared = this.clearPipeline.buildPreparedClear(bombSpec);
        if (bombPrepared) {
          bombPrepared.targets = bombPrepared.targets.filter((target) => !chainRemainingIds.has(target.id));
          if (bombPrepared.targets.length > 0) {
            bombPrepared.targets.forEach((target) => target.beginRemove());
            this.pendingClear.bombCancelPending = {
              ...bombPrepared,
              chainLength: bombPrepared.targets.length
            };
          }
        }
      } else {
        this.clearPipeline.beginClear(bombSpec);
      }
    }
    this.logAiBombCancelDebug("explodeBomb-complete", {
      actionType: "bomb",
      reason: canBombCancel ? "bomb-cancel-path-complete" : "normal-bomb-path-complete",
      affectedCount: affected.length,
      bombOnlyAffectedCount: bombOnlyAffected.length,
      chainRemainingCount: chainRemaining.length,
      sequentialClear: this.getSequentialClearDebugState(),
      bombCancelPending: !!this.pendingClear?.bombCancelPending,
      explodeBombCalled: true
    });
    this.noteAction();
  }

  applyBombEffect(type, x, y) {
    if (type === "time") {
      this.timeRemaining += 2;
      this.timeUp = false;
      this.addFloatingText(x, y - 24, "+2 SEC", "#7af0ff", 24, 1);
    } else if (type === "star") {
      this.expBonus += 10;
      this.addFloatingText(x, y - 24, "EXP +10", "#ffe87e", 22, 1);
    } else if (type === "coin") {
      this.coinBonus += 10;
      this.addFloatingText(x, y - 24, "COIN +10", "#ffd56b", 22, 1);
    } else if (type === "score") {
      this.nextChainScoreMultiplier = 2;
      this.addFloatingText(x, y - 24, "NEXT x2", "#ff7db1", 24, 1);
    } else if (type === "moanaSpecial") {
      this.addFloatingText(x, y - 24, "SPECIAL!", "#58cfff", 22, 0.95);
    } else {
      this.addFloatingText(x, y - 24, "BOMB!", "#aac8ff", 20, 0.9);
    }
  }

  executeSkill(type, level) {
    if (this.actionLock) {
      return false;
    }
    this.noteAction();
    return this.skillRuntime.activate(type, level);
  }

  chooseTransformTarget(level) {
    const counts = new Map();
    for (const tsum of this.tsums) {
      if (tsum.dead || tsum.removing || tsum.type.id === this.myTsum.id) {
        continue;
      }
      counts.set(tsum.type.id, (counts.get(tsum.type.id) || 0) + 1);
    }
    const entries = Array.from(counts.entries()).map(([typeId, count]) => ({
      type: this.availableTypes.find((entry) => entry.id === typeId) || TSUM_TYPES.find((entry) => entry.id === typeId),
      count
    }));
    if (!entries.length) {
      return null;
    }
    entries.sort((a, b) => b.count - a.count);
    if (level >= 6) {
      return entries[0].type;
    }
    if (Math.random() < level / 6) {
      return entries[0].type;
    }
    return entries[randInt(0, entries.length - 1)].type;
  }

  chooseRandomPresentType(excludedTypeId) {
    const seen = new Set();
    const types = [];
    for (const tsum of this.tsums) {
      if (tsum.dead || tsum.removing || tsum.type.id === excludedTypeId || seen.has(tsum.type.id)) {
        continue;
      }
      seen.add(tsum.type.id);
      types.push(tsum.type);
    }
    if (!types.length) {
      return null;
    }
    return types[randInt(0, types.length - 1)];
  }

  expandNamineSplashTargets(targets) {
    if (!this.isNamineLinkActive() || !targets.length) {
      return targets.slice();
    }

    const expanded = targets.slice();
    const seen = new Set(expanded.map((tsum) => tsum.id));
    const sources = targets.filter((tsum) => tsum.type.id === this.myTsum.id);
    if (!sources.length) {
      return expanded;
    }

    for (const tsum of this.tsums) {
      if (tsum.dead || tsum.removing || seen.has(tsum.id)) {
        continue;
      }
      for (const source of sources) {
        if (distance(source.x, source.y, tsum.x, tsum.y) <= NAMINE_SPLASH_RADIUS) {
          seen.add(tsum.id);
          expanded.push(tsum);
          break;
        }
      }
    }

    return expanded;
  }

  stepPhysicsFrame() {
    const activeBodies = this.getPhysicsBodies();
    const occupyingBodies = this.getOccupyingBodies();

    for (const body of activeBodies) {
      const bodyLocked = body.clearOccupying || body.inChain || this.isBodyMotionLocked(body);
      if (bodyLocked) {
        body.vx = 0;
        body.vy = 0;
        this.resolveFieldBoundary(body);
        continue;
      }

      if (!this.isBodySettled(body, occupyingBodies)) {
        body.vy += GRAVITY;
        body.vx *= body.damping;
        body.vy *= body.damping;
        body.x += body.vx;
        body.y += body.vy;
      } else {
        body.vx = 0;
        body.vy = 0;
      }

      this.resolveFieldBoundary(body);
    }

    for (let iter = 0; iter < 3; iter += 1) {
      for (let i = 0; i < occupyingBodies.length; i += 1) {
        for (let j = i + 1; j < occupyingBodies.length; j += 1) {
          const a = occupyingBodies[i];
          const b = occupyingBodies[j];
          const dx = this.getBodyCollisionX(b) - this.getBodyCollisionX(a);
          const dy = this.getBodyCollisionY(b) - this.getBodyCollisionY(a);
          const dist = Math.sqrt(dx * dx + dy * dy) || 0.001;
          const minDist = this.getBodyRadius(a) + this.getBodyRadius(b);
          if (dist >= minDist) {
            continue;
          }

          const overlap = minDist - dist;
          const nx = dx / dist;
          const ny = dy / dist;
          const aLocked = a.clearOccupying || a.inChain || this.isBodyMotionLocked(a);
          const bLocked = b.clearOccupying || b.inChain || this.isBodyMotionLocked(b);

          if (aLocked && !bLocked) {
            b.x += nx * overlap;
            b.y += ny * overlap;
          } else if (!aLocked && bLocked) {
            a.x -= nx * overlap;
            a.y -= ny * overlap;
          } else if (!aLocked && !bLocked) {
            a.x -= nx * overlap * 0.5;
            a.y -= ny * overlap * 0.5;
            b.x += nx * overlap * 0.5;
            b.y += ny * overlap * 0.5;
          }

          const dvx = b.vx - a.vx;
          const dvy = b.vy - a.vy;
          const dot = dvx * nx + dvy * ny;
          if (dot < 0) {
            if (!aLocked && !bLocked) {
              const impulse = dot * (1 + TSUM_RESTITUTION) / 2;
              a.vx += impulse * nx;
              a.vy += impulse * ny;
              b.vx -= impulse * nx;
              b.vy -= impulse * ny;
            } else if (aLocked && !bLocked) {
              b.vx -= dot * (1 + TSUM_RESTITUTION) * nx;
              b.vy -= dot * (1 + TSUM_RESTITUTION) * ny;
            } else if (!aLocked && bLocked) {
              a.vx += dot * (1 + TSUM_RESTITUTION) * nx;
              a.vy += dot * (1 + TSUM_RESTITUTION) * ny;
            }
            a.bounce = 1;
            b.bounce = 1;
          }

          if (!aLocked) {
            this.resolveFieldBoundary(a);
          }
          if (!bLocked) {
            this.resolveFieldBoundary(b);
          }
        }
      }
    }

    for (const body of activeBodies) {
      if (!body.inChain) {
        this.resolveFieldBoundary(body);
      }
      if (Math.abs(body.vx) < 0.1) {
        body.vx = 0;
      }
      if (Math.abs(body.vy) < 0.1) {
        body.vy = 0;
      }
    }
  }

  resolveFieldBoundary(tsum) {
    const radius = this.getBodyRadius(tsum);
    if (tsum && tsum.spawnedAboveField && tsum.y - radius >= FIELD_TOP) {
      tsum.spawnedAboveField = false;
    }
    if (tsum.x - radius < FIELD_LEFT) {
      tsum.x = FIELD_LEFT + radius;
      tsum.vx = Math.abs(tsum.vx) * RESTITUTION;
      tsum.bounce = 1;
    }
    if (tsum.x + radius > FIELD_RIGHT) {
      tsum.x = FIELD_RIGHT - radius;
      tsum.vx = -Math.abs(tsum.vx) * RESTITUTION;
      tsum.bounce = 1;
    }
    const floorY = this.getFieldFloorY(tsum.x);
    if (tsum.y + radius > floorY) {
      tsum.y = floorY - radius;
      tsum.vy = -Math.abs(tsum.vy) * RESTITUTION;
      tsum.vx *= FRICTION;
      tsum.bounce = 1;
      if (Math.abs(tsum.vy) < 0.5) {
        tsum.vy = 0;
      }
      if (Math.abs(tsum.vx) < 0.05) {
        tsum.vx = 0;
      }
    }
    if (tsum.y - radius < FIELD_TOP && !tsum.spawnedAboveField) {
      tsum.y = FIELD_TOP + radius;
      tsum.vy = Math.abs(tsum.vy) * RESTITUTION;
      tsum.bounce = 1;
    }
  }

  finalizePendingClear(info) {
    this.clearPipeline.finalize(info);
  }

  chooseBombType(effectiveClearCount, bombCountModifier = this.activeItems.bomb ? 1 : 0) {
    return resolveBombGeneration({ effectiveClearCount, bombCountModifier }, this.random)?.bombType || null;
  }

  resolveGeneratedBombType(effectiveClearCount, clearEvent = {}) {
    const disableStandardBomb = clearEvent.allowBomb === false
      || clearEvent.disableStandardBomb === true
      || clearEvent.source === "bomb"
      || clearEvent.source === "bubble";
    if (disableStandardBomb) {
      return null;
    }
    const bombCountModifier = (this.activeItems.bomb ? 1 : 0)
      + (Number.isFinite(clearEvent.bombCountModifier) ? clearEvent.bombCountModifier : 0);
    const effectiveBombCount = getEffectiveBombCount(effectiveClearCount, bombCountModifier);
    let forcedBombType = clearEvent.forcedBombType || null;
    const moanaSession = this.getActiveSkillSession("guidingMoana");
    if (!forcedBombType && moanaSession) {
      const threshold = skillValue("guidingMoana", "chainToSpecialBombMin", moanaSession.level);
      if (effectiveBombCount >= threshold) forcedBombType = "moanaSpecial";
    }
    if (!forcedBombType && this.isGastonLoopActive() && effectiveBombCount >= 7) {
      forcedBombType = "score";
    }
    return resolveBombGeneration({
      effectiveClearCount,
      bombCountModifier,
      forcedBombType,
      disableStandardBomb
    }, this.random)?.bombType || null;
  }

  getActiveMoanaCorrectionType() {
    const moanaSession = this.getActiveSkillSession("guidingMoana");
    if (!moanaSession) {
      return null;
    }
    return skillValue("guidingMoana", "specialBombCoinCorrectionType", moanaSession.level);
  }

  calculateChainScore(tsumScore, length) {
    const chainScore = this.getChainScore(length);
    const feverChainPart = this.feverSystem.active ? chainScore * 3 : chainScore;
    const baseScore = tsumScore * length + feverChainPart;
    const comboCount = this.comboSystem.previewNextCombo();
    const comboBonus = baseScore * ((comboCount + 10) / 100);
    let total = baseScore + comboBonus;
    if (this.nextChainScoreMultiplier > 1) {
      total *= this.nextChainScoreMultiplier;
      this.nextChainScoreMultiplier = 1;
    }
    return Math.round(total);
  }

  calculateMixedClearScore(length, targets) {
    const weightedScore = targets.reduce((sum, tsum) => (
      sum + this.boardState.getResolvedType(tsum).score * getTsumClearWeight(tsum)
    ), 0);
    const avgScore = weightedScore / Math.max(1, length);
    const chainScore = this.feverSystem.active ? this.getChainScore(Math.max(3, length)) * 3 : this.getChainScore(Math.max(3, length));
    const baseScore = avgScore * length + chainScore * 0.72;
    const comboCount = this.comboSystem.previewNextCombo();
    const comboBonus = baseScore * ((comboCount + 10) / 100);
    let total = baseScore + comboBonus;
    if (this.nextChainScoreMultiplier > 1) {
      total *= this.nextChainScoreMultiplier;
      this.nextChainScoreMultiplier = 1;
    }
    return Math.round(total);
  }

  getChainScore(length) {
    if (length < 3) {
      return 0;
    }
    let score = 300;
    let increment = 400;
    for (let current = 4; current <= length; current += 1) {
      score += increment;
      increment += 200;
    }
    return score;
  }

  getCoinsByClearCount(clearCount, tsumId = null, correctionTypeOverride = null, clearEvent = null) {
    const tsumType = tsumId 
      ? TSUM_TYPES.find((t) => t.id === tsumId) 
      : this.myTsum;
    if (!tsumType) {
      console.warn(`[COIN] No tsum type found for tsumId=${tsumId}, myTsum=${this.myTsum.id}`);
      return 0;
    }
    const correctionType = correctionTypeOverride || tsumType.coinCorrectionType || DEFAULT_COIN_CORRECTION_TYPE;
    const clampedCount = clamp(clearCount, 0, 317);
    const table = COIN_CORRECTION_TABLE[correctionType];
    if (!table) {
      console.error(`[COIN] Correction table not found for type: ${correctionType}`);
      return 0;
    }
    if (!table.hasOwnProperty(clampedCount)) {
      console.error(`[COIN] No entry for clear count ${clampedCount} in table ${correctionType}`);
      return 0;
    }
    const coins = clearEvent?.applyLargeTsumCorrection
      ? calculateCorrectedClearCoins({
        coinTable: table,
        targets: clearEvent.targets || [],
        effectiveClearCountOverride: clampedCount,
        applyLargeTsumCorrection: true,
        completedLargeSteps: clearEvent.largeTsumCompletedSteps
      })
      : table[clampedCount];
    // Debug output: compare base vs corrected
    const baseCoins = COIN_CORRECTION_TABLE['correction_0'][clampedCount] || 0;
    console.log(`[COIN] Tsum=${tsumType.id} Clears=${clearCount} Type=${correctionType} → Coins=${coins} (base=${baseCoins})`);
    return coins;
  }

  addScore(amount) {
    this.score += Math.round(amount);
  }

  addFloatingText(x, y, text, color, size = 24, life = 1) {
    this.floatingTexts.push({ x, y, text, color, size, life, maxLife: life, alpha: 1 });
  }

  createShockwave(x, y, color, lineWidth = 5, radius = 18, life = 0.45, growth = 240) {
    this.shockwaves.push({ x, y, color, radius, lineWidth, growth, life, maxLife: life, alpha: 1 });
  }

  spawnExplosionSparks(x, y, color, count = 12) {
    for (let i = 0; i < count; i += 1) {
      const angle = (Math.PI * 2 * i) / count + rand(-0.18, 0.18);
      const speed = rand(60, 160);
      this.floatingTexts.push({
        x,
        y,
        text: "•",
        color,
        size: rand(12, 18),
        life: 0.42,
        maxLife: 0.42,
        alpha: 0.95,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        particle: true
      });
    }
  }

  spawnPopParticles(x, y, color) {
    for (let i = 0; i < 10; i += 1) {
      this.floatingTexts.push({
        x: x + rand(-12, 12),
        y: y + rand(-10, 10),
        text: "*",
        color,
        size: rand(10, 18),
        life: 0.45,
        maxLife: 0.45,
        alpha: 0.9,
        vx: rand(-20, 20),
        vy: rand(-60, -20),
        particle: true
      });
    }
  }

  pushCenterMessage(text, color, life = 1) {
    this.centerMessages.push({
      text,
      color,
      x: WIDTH * 0.5,
      y: 304,
      life,
      maxLife: life,
      alpha: 1,
      scale: 0.8
    });
  }

  noteAction() {
    this.lastActionAt = this.elapsed;
  }

  getBodyRadius(body) {
    return this.boardState ? this.boardState.getEffectiveRadius(body) : body.radius;
  }

  isIdleForGaugeDrain() {
    return !this.dragging && !this.actionLock && this.elapsed - this.lastActionAt > 0.45;
  }

  pendingCoinsEstimate() {
    // Return only the accurate coins from getCoinsByClearCount (stored in coinBonus)
    // No longer mix with score-based calculations
    return this.coinBonus;
  }

  rollCoinMultiplier() {
    const roll = Math.random();
    if (roll < 0.8) {
      return rand(1.1, 1.5);
    }
    if (roll < 0.98) {
      return rand(1.5, 2.4);
    }
    if (roll < 0.998) {
      return rand(2.4, 8);
    }
    return rand(10, 51);
  }

  finishRun() {
    if (this.state !== "playing" || this.runFinished) {
      return;
    }
    this.runFinished = true;
    if (this.persistenceEnabled) {
      this.plays += 1;
    }
    const baseScore = Math.round(this.score);
    const finalScore = this.activeItems.score ? Math.round(baseScore * 1.1) : baseScore;
    // Use only coinBonus (which contains getCoinsByClearCount results, not score-based calculation)
    const baseCoins = this.coinBonus;
    const coinMultiplier = this.activeItems.coin ? this.rollCoinMultiplier() : 1;
    const finalCoins = Math.max(1, Math.round(baseCoins * coinMultiplier));
    const expBase = Math.round(this.totalCleared * 1.2 + this.comboSystem.maxCombo * 0.8 + this.feverSystem.feverCount * 30 + this.expBonus);
    const exp = this.activeItems.exp ? Math.round(expBase * 1.1) : expBase;

    if (this.persistenceEnabled) {
      this.coins += finalCoins;
    }
    console.log(`[FINISH] Score=${finalScore} BaseCoins=${baseCoins} Multiplier=${coinMultiplier} Final=${finalCoins} TotalCoins=${this.coins}`);
    if (this.persistenceEnabled && this.saveProgress) this.saveProgress();
    this.resultStats = {
      finalScore,
      finalCoins,
      coinMultiplier,
      maxCombo: this.comboSystem.maxCombo,
      feverCount: this.feverSystem.feverCount,
      exp,
      totalCleared: this.totalCleared,
      itemCost: ITEM_DEFS.reduce((sum, item) => sum + (this.activeItems[item.key] ? item.cost : 0), 0),
      scoreBaseText: `Base ${formatNumber(baseScore)}`
    };

    if (this.onRunFinished && this.onRunFinished(this.resultStats, this)) {
      this.state = "battleWaiting";
      return;
    }

    if (this.aiAutoPlay && this.aiTrainingMode && !this.aiLearningMode) {
      const strategy = this.aiCurrentStrategy || "skillFirst";
      const row = {
        run: this.aiTrainingData.history.length + 1,
        score: finalScore,
        coins: finalCoins,
        maxChain: this.aiRunMaxChain,
        bombUses: this.aiRunBombUses,
        skillUses: this.aiRunSkillUses,
        strategy
      };
      this.aiTrainingData.history.push(row);
      const stat = this.ensureAiStrategyStat(strategy);
      stat.plays += 1;
      stat.scoreSum += finalScore;
      stat.coinSum += finalCoins;
      this.saveAiTrainingData();

      if (this.aiTrainingData.history.length % 10 === 0) {
        const recent = this.aiTrainingData.history.slice(-10);
        const summary = this.aiStrategyNames.map((name) => {
          const rows = recent.filter((entry) => entry.strategy === name);
          const avgScore = rows.length ? rows.reduce((sum, entry) => sum + entry.score, 0) / rows.length : 0;
          const avgCoins = rows.length ? rows.reduce((sum, entry) => sum + entry.coins, 0) / rows.length : 0;
          return {
            strategy: name,
            plays: rows.length,
            avgScore: Math.round(avgScore),
            avgCoins: Number(avgCoins.toFixed(2))
          };
        });
        console.table(summary);
      }
    }

    if (this.aiAutoPlay && this.aiLearningMode) {
      const finalState = this.buildAiLearningStateKey();
      const finalSkillDecisionState = this.buildAiLearningSkillDecisionStateKey();
      const finalFreezeDecisionState = this.buildAiLearningCoronationFreezeDecisionStateKey();
      if (this.aiLearningPendingSkillDecision) {
        this.finalizePendingAiLearningSkillDecision(finalSkillDecisionState);
      }
      if (this.aiLearningPendingCoronationFreezeDecision) {
        this.finalizePendingAiLearningCoronationFreezeDecision(finalFreezeDecisionState);
      }
      let terminalReward = 0;
      if (this.aiLastState && this.aiLastAction && this.aiLastSnapshot) {
        const after = this.captureAiLearningSnapshot();
        const terminalBonus = this.aiLearningObjective === "coin" ? finalCoins * 1.0 : finalScore / 10000;
        terminalReward = this.calculateAiLearningReward(this.aiLastSnapshot, after, this.aiLastAction) + terminalBonus;
        this.updateAiQValue(this.aiLastState, this.aiLastAction.key, terminalReward, finalState);
        this.applyAiLearningDelayedReward(terminalReward);
        this.enqueueAiLearningDelayedTransition(
          this.aiLastState,
          this.aiLastAction.key,
          finalState,
          this.aiLastAction.selectionMode || null
        );
        this.aiLearningStats.totalReward = (this.aiLearningStats.totalReward || 0) + terminalReward;
        this.recordAiLearningRewardBySelection(this.aiLastAction, terminalReward);
        if (this.aiLastAction?.type === "specialTap" && this.aiLastAction?.success) {
          this.recordSpecialTapDeltaFromSnapshots(this.aiLastSnapshot, after);
          this.aiLearningEpisodeSpecialTapStats.rewardSum = (this.aiLearningEpisodeSpecialTapStats.rewardSum || 0) + terminalReward;
        }
        this.aiLastState = null;
        this.aiLastAction = null;
        this.aiLastSnapshot = null;
      }
      this.aiEpisodeCount += 1;
      this.aiLearningStats.episodes = this.aiEpisodeCount;
      this.aiLearningStats.bestScore = Math.max(this.aiLearningStats.bestScore || 0, finalScore);
      this.aiLearningStats.bestCoins = Math.max(this.aiLearningStats.bestCoins || 0, finalCoins);
      this.aiLearningStats.scoreSum = (this.aiLearningStats.scoreSum || 0) + finalScore;
      this.aiLearningStats.coinSum = (this.aiLearningStats.coinSum || 0) + finalCoins;
      this.aiLearningStats.averageScore = this.aiLearningStats.scoreSum / Math.max(1, this.aiLearningStats.episodes);
      this.aiLearningStats.averageCoins = this.aiLearningStats.coinSum / Math.max(1, this.aiLearningStats.episodes);
      const episodeRewardStart = Number.isFinite(this.aiLearningEpisodeRewardStart)
        ? this.aiLearningEpisodeRewardStart
        : 0;
      const episodeReward = (this.aiLearningStats.totalReward || 0) - episodeRewardStart;
      this.aiLearningStats.lastEpisodeReward = episodeReward;
      this.aiLearningStats.averageReward = (this.aiLearningStats.totalReward || 0) / Math.max(1, this.aiLearningStats.episodes);
      const selectionTotals = this.normalizeAiSelectionCounts(this.aiLearningStats.selectionTotals);
      selectionTotals.explore += this.aiLearningEpisodeSelectionCounts.explore || 0;
      selectionTotals.exploit += this.aiLearningEpisodeSelectionCounts.exploit || 0;
      this.aiLearningStats.selectionTotals = selectionTotals;
      const aggregated = this.normalizeAiActionCounts(this.aiLearningStats.actionCounts);
      for (const key of Object.keys(aggregated)) {
        aggregated[key] += this.aiLearningEpisodeActions[key] || 0;
      }
      this.aiLearningStats.actionCounts = aggregated;
      this.aiLearningStats.specialTapOpportunities = (this.aiLearningStats.specialTapOpportunities || 0) + (this.aiLearningEpisodeSpecialTapStats.opportunities || 0);
      this.aiLearningStats.specialTapUses = (this.aiLearningStats.specialTapUses || 0) + (this.aiLearningEpisodeSpecialTapStats.uses || 0);
      this.aiLearningStats.specialTapSuccesses = (this.aiLearningStats.specialTapSuccesses || 0) + (this.aiLearningEpisodeSpecialTapStats.successes || 0);
      this.aiLearningStats.specialTapRewardSum = (this.aiLearningStats.specialTapRewardSum || 0) + (this.aiLearningEpisodeSpecialTapStats.rewardSum || 0);
      this.aiLearningStats.specialTapDeltaScoreSum = (this.aiLearningStats.specialTapDeltaScoreSum || 0) + (this.aiLearningEpisodeSpecialTapStats.deltaScoreSum || 0);
      this.aiLearningStats.specialTapDeltaCoinsSum = (this.aiLearningStats.specialTapDeltaCoinsSum || 0) + (this.aiLearningEpisodeSpecialTapStats.deltaCoinsSum || 0);
      this.aiLearningStats.specialTapDeltaClearedSum = (this.aiLearningStats.specialTapDeltaClearedSum || 0) + (this.aiLearningEpisodeSpecialTapStats.deltaClearedSum || 0);
      const totalSpecialTapSuccesses = this.aiLearningStats.specialTapSuccesses || 0;
      const totalSpecialTapRewardSum = this.aiLearningStats.specialTapRewardSum || 0;
      this.aiLearningStats.averageRewardPerSpecialTapSuccess = totalSpecialTapSuccesses > 0
        ? totalSpecialTapRewardSum / totalSpecialTapSuccesses
        : 0;
      this.aiLearningStats.averageDeltaScorePerSpecialTapSuccess = totalSpecialTapSuccesses > 0
        ? this.aiLearningStats.specialTapDeltaScoreSum / totalSpecialTapSuccesses
        : 0;
      this.aiLearningStats.averageDeltaCoinsPerSpecialTapSuccess = totalSpecialTapSuccesses > 0
        ? this.aiLearningStats.specialTapDeltaCoinsSum / totalSpecialTapSuccesses
        : 0;
      this.aiLearningStats.averageDeltaClearedPerSpecialTapSuccess = totalSpecialTapSuccesses > 0
        ? this.aiLearningStats.specialTapDeltaClearedSum / totalSpecialTapSuccesses
        : 0;
      const exploitAdvantage = (this.aiLearningStats.averageExploitReward || 0) - (this.aiLearningStats.averageExploreReward || 0);
      const recentExploitAdvantages = Array.isArray(this.aiLearningStats.recentExploitAdvantages)
        ? this.aiLearningStats.recentExploitAdvantages.slice(-19)
        : [];
      recentExploitAdvantages.push(exploitAdvantage);
      this.aiLearningStats.recentExploitAdvantages = recentExploitAdvantages;
      this.aiLearningStats.movingAverageExploitAdvantage = recentExploitAdvantages.length > 0
        ? recentExploitAdvantages.reduce((sum, value) => sum + value, 0) / recentExploitAdvantages.length
        : 0;
      const qStateCount = Object.keys(this.aiQTable).length;
      const qActionCount = this.countAiQTableActions();
      const activeItemsSnapshot = this.normalizeAiActiveItemsSnapshot(this.activeItems);
      this.aiLearningStats.qStateCount = qStateCount;
      this.aiLearningStats.qActionCount = qActionCount;
      const recent = Array.isArray(this.aiLearningStats.recentEpisodes) ? this.aiLearningStats.recentEpisodes.slice(-9) : [];
      recent.push({
        episode: this.aiEpisodeCount,
        score: finalScore,
        coins: finalCoins,
        reward: terminalReward,
        episodeReward,
        epsilon: this.aiLearningStats.lastEpsilon || this.getAiLearningEpsilon(),
        exploreCount: this.aiLearningEpisodeSelectionCounts.explore || 0,
        exploitCount: this.aiLearningEpisodeSelectionCounts.exploit || 0,
        specialTapOpportunities: this.aiLearningEpisodeSpecialTapStats.opportunities || 0,
        specialTapUses: this.aiLearningEpisodeSpecialTapStats.uses || 0,
        specialTapSuccesses: this.aiLearningEpisodeSpecialTapStats.successes || 0,
        specialTapRewardSum: this.aiLearningEpisodeSpecialTapStats.rewardSum || 0,
        specialTapDeltaScoreSum: this.aiLearningEpisodeSpecialTapStats.deltaScoreSum || 0,
        specialTapDeltaCoinsSum: this.aiLearningEpisodeSpecialTapStats.deltaCoinsSum || 0,
        specialTapDeltaClearedSum: this.aiLearningEpisodeSpecialTapStats.deltaClearedSum || 0,
        qStates: qStateCount,
        qActions: qActionCount,
        actions: { ...this.aiLearningEpisodeActions },
        activeItemsSnapshot
      });
      const normalizedRecent = recent.map((entry) => ({
        ...entry,
        activeItemsSnapshot: this.normalizeAiActiveItemsSnapshot(entry.activeItemsSnapshot)
      }));
      this.aiLearningStats.recentEpisodes = normalizedRecent;
      let recentItemSplit = null;
      if (this.aiLearningDebug) {
        const withItems = normalizedRecent.filter((entry) => this.hasAnyActiveItem(entry.activeItemsSnapshot));
        const withoutItems = normalizedRecent.filter((entry) => !this.hasAnyActiveItem(entry.activeItemsSnapshot));
        const averageScoreWithItems = withItems.length
          ? Math.round(withItems.reduce((sum, entry) => sum + entry.score, 0) / withItems.length)
          : null;
        const averageScoreWithoutItems = withoutItems.length
          ? Math.round(withoutItems.reduce((sum, entry) => sum + entry.score, 0) / withoutItems.length)
          : null;
        const averageRewardWithItems = withItems.length
          ? Number((withItems.reduce((sum, entry) => sum + entry.reward, 0) / withItems.length).toFixed(3))
          : null;
        const averageRewardWithoutItems = withoutItems.length
          ? Number((withoutItems.reduce((sum, entry) => sum + entry.reward, 0) / withoutItems.length).toFixed(3))
          : null;
        recentItemSplit = {
          itemEpisodeCount: withItems.length,
          nonItemEpisodeCount: withoutItems.length,
          averageScoreWithItems,
          averageScoreWithoutItems,
          averageRewardWithItems,
          averageRewardWithoutItems
        };
      }
      this.saveAiLearningData();
      this.debugAiLearning("[AI LEARNING] episode", {
        episode: this.aiEpisodeCount,
        score: finalScore,
        coins: finalCoins,
        bestScore: this.aiLearningStats.bestScore,
        bestCoins: this.aiLearningStats.bestCoins,
        averageScore: Math.round(this.aiLearningStats.averageScore),
        averageCoins: Number(this.aiLearningStats.averageCoins.toFixed(2)),
        episodeReward: Number(episodeReward.toFixed(3)),
        totalReward: Number((this.aiLearningStats.totalReward || 0).toFixed(3)),
        averageReward: Number((this.aiLearningStats.averageReward || 0).toFixed(3)),
        selectionTotals: this.aiLearningStats.selectionTotals,
        episodeSelectionCounts: this.aiLearningEpisodeSelectionCounts,
        episodeSpecialTap: this.aiLearningEpisodeSpecialTapStats,
        totalSpecialTap: {
          opportunities: this.aiLearningStats.specialTapOpportunities || 0,
          uses: this.aiLearningStats.specialTapUses || 0,
          successes: this.aiLearningStats.specialTapSuccesses || 0
        },
        episodeActions: this.aiLearningEpisodeActions,
        totalActions: this.aiLearningStats.actionCounts,
        qStates: qStateCount,
        qActions: qActionCount,
        recentEpisodes: this.aiLearningStats.recentEpisodes,
        recentItemSplit
      });
      this.aiLearningEpisodeActions = this.createEmptyAiLearningActionCounts();
      this.aiLearningEpisodeSpecialTapStats = this.createEmptyAiLearningSpecialTapStats();
      this.aiLearningEpisodeSelectionCounts = { explore: 0, exploit: 0 };
      this.aiLearningEpisodeRewardStart = Number.isFinite(this.aiLearningStats.totalReward)
        ? this.aiLearningStats.totalReward
        : 0;
      this.scheduleAiLearningNextEpisode();
    }

    this.state = "result";
    const willAutoRestart = (this.aiAutoPlay && !this.aiLearningMode) || this.shouldAiLearningAutoRepeat();
    if (!willAutoRestart) {
      this.itemSelection = this.blankItemSelection();
    }

    if (this.aiAutoPlay && !this.aiLearningMode) {
      this.clearAiLearningRestartTimer();
      this.aiLearningRestartTimer = setTimeout(() => {
        this.aiLearningRestartTimer = null;
        if (this.aiAutoPlay && !this.aiLearningMode && this.state === "result") {
          this.startGame();
        }
      }, 280);
    }
  }

  update(dt) {
    this.elapsed += dt;
    this.displayedScore = lerp(this.displayedScore, this.score, clamp(dt * 8, 0, 1));
    this.updateEffects(dt);
    if (this.skillButtonFeedback.timer > 0) {
      this.skillButtonFeedback.timer = Math.max(0, this.skillButtonFeedback.timer - dt);
      if (this.skillButtonFeedback.timer <= 0) {
        this.skillButtonFeedback.mode = "idle";
      }
    }
    if (this.state !== "playing") {
      return;
    }

    if (this.paused) {
      return;
    }

    if (this.fanCooldown > 0) {
      this.fanCooldown = Math.max(0, this.fanCooldown - dt);
    }
    this.fanPulse = Math.max(0, this.fanPulse - dt * 2.4);
    const gameplayPauseState = this.getCurrentGameplayPauseState();
    const gameplayDt = this.getCurrentGameplayDelta(dt, gameplayPauseState);
    if (this.isCoingainInputLocked()) {
      this.cancelActiveInputForCoingainLock();
    }

    if (!this.timeUp) {
      this.timeRemaining -= gameplayDt;
      if (this.timeRemaining <= 0) {
        this.timeRemaining = 0;
        this.timeUp = true;
      }
    }

    if (this.tempLockTimer > 0) {
      this.tempLockTimer -= dt;
      if (this.tempLockTimer <= 0) {
        this.tempLockTimer = 0;
        this.actionLock = false;
      }
    }

    if (this.pendingClear) {
      if (!this.clearPipeline.updateSequentialChainClear(this.pendingClear, dt)) {
        this.pendingClear.timer -= dt;
        if (this.pendingClear.timer <= 0) {
          this.finalizePendingClear(this.pendingClear);
        }
      }
    }

    if (!gameplayPauseState.physicsPaused) {
      this.physicsAccumulator += dt / FIXED_STEP;
      let steps = 0;
      while (this.physicsAccumulator >= 1 && steps < 5) {
        this.stepPhysicsFrame();
        this.physicsAccumulator -= 1;
        steps += 1;
      }
      for (const tsum of this.tsums) {
        tsum.update(dt);
      }
      for (const bomb of this.bombs) {
        bomb.update(dt);
      }
    } else {
      for (const tsum of this.tsums) {
        if (tsum.removing) {
          tsum.update(dt);
        }
      }
    }
    this.bombs = this.bombs.filter((bomb) => !bomb.dead);
    if (this.pendingClear) {
      this.clearPipeline.queueMyTsumSkillChargeFlights(this.pendingClear);
    }
    this.updateSkillChargeFlights();
    this.skillRuntime.update(gameplayDt * 1000);
    this.skillSystem.update(dt);
    this.feverSystem.update(gameplayDt);
    this.comboSystem.update(gameplayDt);
    this.refreshRenderBodies();
    if (this.strongestModeEnabled) {
      this.updateStrongestMode(gameplayDt);
    }
    this.updateAiAutoPlay(gameplayDt);

    if (this.timeRemaining > 0) {
      this.timeUp = false;
    }

    if (this.timeUp && !this.dragging && !this.actionLock && !this.pendingClear) {
      this.finishRun();
    }
  }

  updateEffects(dt) {
    this.floatingTexts = this.floatingTexts.filter((text) => {
      text.life -= dt;
      const t = clamp(text.life / text.maxLife, 0, 1);
      text.alpha = t;
      text.y -= (text.particle ? 18 : 34) * dt;
      if (text.vx) {
        text.x += text.vx * dt;
      }
      if (text.vy) {
        text.y += text.vy * dt;
      }
      return text.life > 0;
    });

    this.shockwaves = this.shockwaves.filter((wave) => {
      wave.life -= dt;
      wave.radius += (wave.growth || 240) * dt;
      wave.alpha = clamp(wave.life / wave.maxLife, 0, 1);
      return wave.life > 0;
    });

    this.centerMessages = this.centerMessages.filter((msg) => {
      msg.life -= dt;
      const t = clamp(msg.life / msg.maxLife, 0, 1);
      msg.alpha = t;
      msg.scale = 1 + (1 - t) * 0.18 + Math.sin(this.elapsed * 12) * 0.03;
      msg.y -= 10 * dt;
      return msg.life > 0;
    });
  }

  getSkillGaugeCenter() {
    return {
      x: SKILL_BUTTON_RECT.x + SKILL_BUTTON_RECT.w * 0.5,
      y: SKILL_BUTTON_RECT.y + SKILL_BUTTON_RECT.h * 0.5
    };
  }

  getFeverGaugeCenter() {
    return {
      x: WIDTH * 0.5,
      y: 648
    };
  }

  enqueueSkillChargeFlight(startX, startY, tsumType, chargeMultiplier = 1, judyNickGaugePayload = null) {
    const destination = judyNickGaugePayload ? "skill" : (this.skillSystem.ready ? "fever" : "skill");
    const target = destination === "skill" ? this.getSkillGaugeCenter() : this.getFeverGaugeCenter();
    this.skillChargeFlights.push({
      startX,
      startY,
      targetX: target.x,
      targetY: target.y,
      startTime: this.elapsed * 1000,
      duration: 700,
      destination,
      tsumType,
      chargeMultiplier,
      judyNickGaugePayload,
      applied: false
    });
  }

  updateSkillChargeFlights() {
    if (!this.skillChargeFlights.length) {
      return;
    }
    const nowMs = this.elapsed * 1000;
    this.skillChargeFlights = this.skillChargeFlights.filter((flight) => {
      const progress = clamp((nowMs - flight.startTime) / flight.duration, 0, 1);
      if (progress >= 1 && !flight.applied) {
        if (flight.destination === "skill" && !this.skillSystem.ready) {
          this.skillSystem.addCharge(flight.chargeMultiplier || 1);
        }
        if (flight.judyNickGaugePayload && this.judyNickGaugeManager) {
          const payload = flight.judyNickGaugePayload;
          this.judyNickGaugeManager.onClear(
            payload.typeId,
            1,
            payload.chargeMultiplier,
            payload.context
          );
        }
        flight.applied = true;
      }
      return progress < 1;
    });
  }
}

// --- GAME CLASS PART 1 LOADED ---

function nearestTsums(game, pos, limit, filterFn = () => true) {
  return game.tsums
    .filter((tsum) => !tsum.dead && !tsum.removing && game.isTsumInPlayArea(tsum) && filterFn(tsum))
    .sort((a, b) => distance(a.x, a.y, pos.x, pos.y) - distance(b.x, b.y, pos.x, pos.y))
    .slice(0, limit);
}

function countTypes(game, predicate = () => true) {
  const counts = new Map();
  for (const tsum of game.tsums) {
    if (tsum.dead || tsum.removing || !game.isTsumInPlayArea(tsum) || !predicate(tsum)) {
      continue;
    }
    const typeId = game.boardState.getResolvedType(tsum).id;
    counts.set(typeId, (counts.get(typeId) || 0) + 1);
  }
  return counts;
}

const SkillRegistry = {};

const skillValue = (skillId, key, level) => {
  const table = SKILL_TABLES[skillId];
  if (!table || !table[key]) {
    return 0;
  }
  return table[key][clamp(level, 1, 6) - 1];
};

function getLiveTsums(game, predicate = () => true) {
  return game.tsums.filter((tsum) => !tsum.dead && !tsum.removing && game.isTsumInPlayArea(tsum) && predicate(tsum));
}

function buildCoronationElsaFreezeLayerHistogram(board, nodes = null) {
  const histogram = {};
  const targetNodes = Array.isArray(nodes) ? nodes : board.getFrozenNodesByKind("coronationElsa");
  for (const node of targetNodes) {
    const layerCount = board.getFrozenEntriesByKind(node, "coronationElsa").length;
    if (layerCount > 0) {
      histogram[layerCount] = (histogram[layerCount] || 0) + 1;
    }
  }
  return histogram;
}

function pickRandomNodes(nodes, count) {
  const pool = nodes.slice();
  const picked = [];
  while (pool.length && picked.length < count) {
    const index = randInt(0, pool.length - 1);
    picked.push(pool.splice(index, 1)[0]);
  }
  return picked;
}

function nearestNode(game, pos, predicate = () => true) {
  let candidate = null;
  let best = Infinity;
  for (const tsum of game.tsums) {
    if (tsum.dead || tsum.removing || !game.isTsumInPlayArea(tsum) || !predicate(tsum)) {
      continue;
    }
    const d = distance(pos.x, pos.y, tsum.x, tsum.y);
    if (d < best) {
      best = d;
      candidate = tsum;
    }
  }
  return candidate;
}

function collectNodesNearCenters(game, centers, radius, predicate = () => true) {
  const seen = new Set();
  const result = [];
  for (const tsum of game.tsums) {
    if (tsum.dead || tsum.removing || !predicate(tsum)) {
      continue;
    }
    for (const center of centers) {
      if (distance(center.x, center.y, tsum.x, tsum.y) <= radius) {
        if (!seen.has(tsum.id)) {
          seen.add(tsum.id);
          result.push(tsum);
        }
        break;
      }
    }
  }
  return result;
}

function pickMostCommonType(game, excludedTypeId = null) {
  const counts = countTypes(game, (tsum) => {
    const typeId = game.boardState.getResolvedType(tsum).id;
    return !excludedTypeId || typeId !== excludedTypeId;
  });
  const entries = Array.from(counts.entries())
    .map(([typeId, count]) => ({
      type: TSUM_TYPES.find((entry) => entry.id === typeId),
      count
    }))
    .filter((entry) => entry.type);
  entries.sort((a, b) => b.count - a.count);
  return entries.length ? entries[0].type : null;
}

function computeCoronationElsaFreezePreview(game, chain, level, plannerSnapshot = null) {
  if (!game || !Array.isArray(chain) || chain.length < 1) {
    return {
      radius: 0,
      lineRadius: 0,
      priorFrozen: [],
      priorFrozenIds: new Set(),
      lineTargets: [],
      surroundTargets: [],
      targets: [],
      freezeCounts: new Map()
    };
  }
  const snapshot = plannerSnapshot || buildCoronationElsaPlannerSnapshot(game, level);
  const liveById = new Map(game.tsums.map((tsum) => [String(tsum.id), tsum]));
  const chainIndices = chain.map((tsum) => getCoronationElsaPlannerNodeIndex(snapshot, tsum.id));
  if (chainIndices.some((index) => index < 0)) {
    return {
      radius: snapshot.freezeRadius,
      lineRadius: snapshot.lineRadius,
      priorFrozen: [],
      priorFrozenIds: new Set(),
      lineTargets: [],
      surroundTargets: [],
      targets: [],
      freezeCounts: new Map()
    };
  }
  const simulation = simulateCoronationElsaFreeze(snapshot, snapshot.initialState, chainIndices);
  const mapIndicesToLiveTsums = (indices) => indices
    .map((index) => liveById.get(String(snapshot.nodes[index].id)))
    .filter(Boolean);
  const lineTargets = mapIndicesToLiveTsums(simulation.lineTargetIndices);
  const priorFrozen = mapIndicesToLiveTsums(simulation.priorFrozenIndices);
  const priorFrozenIds = new Set(priorFrozen.map((tsum) => tsum.id));
  const surroundTargets = mapIndicesToLiveTsums(simulation.surroundTargetIndices);
  const targets = mapIndicesToLiveTsums(simulation.targetIndices);
  const freezeCounts = new Map();
  for (let index = 0; index < simulation.reasonCounts.length; index += 1) {
    const count = simulation.reasonCounts[index];
    if (count > 0) {
      freezeCounts.set(snapshot.nodes[index].id, count);
    }
  }
  return {
    radius: snapshot.freezeRadius,
    lineRadius: snapshot.lineRadius,
    priorFrozen,
    priorFrozenIds,
    lineTargets,
    surroundTargets,
    targets,
    freezeCounts,
    simulation,
    plannerSnapshot: snapshot
  };
}

function freezeAroundChain(ctx, session, chain, radius, freezeKind, persist = true, extraSpec = {}) {
  const combined = new Map();
  chain.forEach((tsum) => combined.set(tsum.id, tsum));
  collectNodesNearCenters(ctx.game, chain, radius).forEach((tsum) => combined.set(tsum.id, tsum));
  const targets = Array.from(combined.values());
  if (!targets.length) {
    return [];
  }
  ctx.applyFreeze(targets.map((tsum) => tsum.id), {
    sessionId: session.id,
    groupId: ctx.board.nextGroupId(freezeKind),
    freezeKind,
    persist,
    ...extraSpec
  });
  return targets;
}

function isJamilHighScoreNode(board, node) {
  const entry = board.getSpecialChainEntry(node);
  return !!(entry && entry.kind === "jamilHighScore");
}

function createMoanaSpecialBomb(game, x, y, level) {
  const bomb = new Bomb(game, "moanaSpecial", x, y, rand(-1.2, 1.2), rand(0.3, 1.2));
  bomb.effectRadius = BOMB_BLAST_RADIUS * skillValue("guidingMoana", "specialBombRadiusMultiplier", level);
  bomb.correctionType = skillValue("guidingMoana", "specialBombCoinCorrectionType", level);
  game.applyCoingainMiniScaleToBody?.(bomb);
  return bomb;
}

function attachSequentialSplashGroups(request, primaryTargets, splashGroups, game, sourceLabel = "unknown") {
  if (!Array.isArray(primaryTargets) || !primaryTargets.length || !Array.isArray(splashGroups) || !splashGroups.length) {
    return;
  }
  request.sequentialPrimaryTargets = primaryTargets;
  request.sequentialSplashGroups = splashGroups;
  if (game?.sequentialSplashClearDebug) {
    const primaryIdSet = new Set(primaryTargets.map((tsum) => tsum.id));
    const triggerInPrimary = splashGroups.every((group) => primaryIdSet.has(group.triggerId));
    console.log("[SEQUENTIAL SPLASH DEBUG] onAugmentClear", {
      source: sourceLabel,
      primaryCount: primaryTargets.length,
      targetsCount: request.targets.length,
      groupCount: splashGroups.length,
      groupSizes: splashGroups.map((group) => group.targets.length),
      triggerInPrimary
    });
  }
}

// --- skill handlers ---
export const coronationElsaSkillHandler = {
  id: "coronationElsa",
  tables: SKILL_TABLES.coronationElsa,
  onActivate(ctx) {
    ctx.game.pushCenterMessage("FREEZE!", "#dff5ff", 0.95);
    ctx.game.strongestModeCoronationElsaAfterChainTimer = 0;
    ctx.game.strongestModeCoronationElsaNoTraceDurationSec = 0;
    ctx.game.strongestModeCoronationElsaWaitRecentSpawnSettle = false;
    ctx.game.strongestModeCoronationElsaWaitStartElapsed = null;
    ctx.game.strongestModeCoronationElsaPendingExtraFreezeTap = false;
    ctx.game.strongestModeCoronationElsaSuppressRelaxedFallback = false;
    ctx.game.strongestModeCoronationElsaSuppressSpecialTapFrames = 0;
    ctx.game.strongestModeCoronationElsaNoFreezeTargetWaitFrames = 0;
    ctx.game.strongestModeCoronationElsaEarlyFreezeTapWaitFrames = 0;
    ctx.game.strongestModeCoronationElsaUnsafeFreezeTapWaitFrames = 0;
    ctx.game.strongestModeCoronationElsaLastChainStartElapsed = null;
    ctx.game.strongestModeCoronationElsaAnchorSide = null;
    ctx.game.strongestModeCoronationElsaPlannerProfileKey = null;
    ctx.game.strongestModeCoronationElsaPendingTapPrediction = null;
    ctx.game.resetStrongestModeCoronationElsaTracePlan();
    const session = ctx.createSession({
      remainingMs: skillValue("coronationElsa", "durationSec", ctx.level) * 1000,
      cleanupOnEnd: false,
      data: {}
    });
    ctx.game.beginStrongestModeCoronationElsaSkillSummary(session.id);
    return session;
  },
  onChainCommit(ctx, session, chain) {
    const end = chain[chain.length - 1];
    const preview = computeCoronationElsaFreezePreview(ctx.game, chain, ctx.level);
    const targets = preview.targets;
    if (!targets.length) {
      return false;
    }
    const multiReasonOverlapCount = Array.from(preview.freezeCounts.values())
      .filter((count) => count > 1)
      .length;
    const newFrozenCount = targets.filter((tsum) => !preview.priorFrozenIds.has(tsum.id)).length;
    const freezeIds = targets.map((tsum) => tsum.id);
    ctx.applyFreeze(freezeIds, {
      sessionId: session.id,
      groupId: ctx.board.nextGroupId("coronationElsa"),
      freezeKind: "coronationElsa",
      persist: true,
      clearWeight: 1,
      correctionType: skillValue("coronationElsa", "coinCorrectionType", ctx.level),
      chargeMultiplier: skillValue("coronationElsa", "chargeMultiplier", ctx.level)
    });
    ctx.game.recordStrongestModeCoronationElsaChainCommit(
      session.id,
      chain.length,
      targets.length,
      newFrozenCount,
      ctx.board.getFrozenNodesByKind("coronationElsa").length
    );
    ctx.game.recordStrongestModeCoronationElsaTracePlanChain(chain);
    if (ctx.game.coronationElsaDebug) {
      console.log("[CORONATION ELSA DEBUG] chain freeze", {
        boardAliveCount: getLiveTsums(ctx.game).length,
        chainCount: chain.length,
        chainFreezeCount: chain.length,
        lineFreezeCount: preview.lineTargets.length,
        surroundFreezeCount: preview.surroundTargets.length,
        duplicatedInSameChainCount: multiReasonOverlapCount,
        newFrozenCount,
        totalFrozenCount: ctx.board.getFrozenNodesByKind("coronationElsa").length,
        freezeLayerHistogram: buildCoronationElsaFreezeLayerHistogram(ctx.board)
      });
    }
    ctx.game.createShockwave(end.x, end.y, "rgba(185,235,255,0.45)", 4, 12, 0.22, 110);
    return true;
  },
  onEnd(ctx) {
    ctx?.game?.emitStrongestModeCoronationElsaSkillSummary("skillEnd");
    if (ctx?.game) {
      ctx.game.strongestModeCoronationElsaNoFreezeTargetWaitFrames = 0;
      ctx.game.strongestModeCoronationElsaEarlyFreezeTapWaitFrames = 0;
      ctx.game.strongestModeCoronationElsaUnsafeFreezeTapWaitFrames = 0;
      ctx.game.strongestModeCoronationElsaNoTraceDurationSec = 0;
      ctx.game.strongestModeCoronationElsaPlannerProfileKey = null;
      ctx.game.strongestModeCoronationElsaPendingTapPrediction = null;
    }
    ctx?.game?.resetStrongestModeCoronationElsaTracePlan();
  },
  cleanupBySession() {
  }
};

SkillRegistry.coronationElsa = coronationElsaSkillHandler;

SkillRegistry.captainLightyear = {
  id: "captainLightyear",
  tables: SKILL_TABLES.captainLightyear,
  onActivate(ctx) {
    ctx.game.pushCenterMessage("BLAST!", "#fff1ab", 0.9);
    return ctx.createSession({
      remainingMs: skillValue("captainLightyear", "inactivitySec", ctx.level) * 1000,
      cleanupOnEnd: false,
      data: {
        remainingShots: skillValue("captainLightyear", "tapCount", ctx.level)
      }
    });
  },
  onTap(ctx, session, pos) {
    if (session.data.remainingShots <= 0 || ctx.game.actionLock) {
      return false;
    }
    const radius = skillValue("captainLightyear", "eraseRadius", ctx.level);
    const targets = getLiveTsums(ctx.game, (tsum) => distance(tsum.x, tsum.y, pos.x, pos.y) <= radius);
    session.data.remainingShots -= 1;
    ctx.game.createShockwave(pos.x, pos.y, "rgba(255,230,140,0.7)", 5, 16, 0.28, 180);
    if (targets.length) {
      ctx.clear.beginClear({
        source: "skill",
        targets,
        x: pos.x,
        y: pos.y,
        allowBomb: false,
        correctionType: skillValue("captainLightyear", "coinCorrectionType", ctx.level),
        scoreMultiplier: skillValue("captainLightyear", "scoreMultiplier", ctx.level),
        chargeMultiplier: skillValue("captainLightyear", "chargeMultiplier", ctx.level)
      });
    } else {
      ctx.game.addFloatingText(pos.x, pos.y - 18, "MISS", "#ffffff", 18, 0.45);
    }
    if (session.data.remainingShots <= 0) {
      ctx.runtime.endSession(session, "manual");
    }
    return true;
  },
  onEnd() {
  },
  cleanupBySession() {
  }
};

// finalize: expose SkillRegistry and export Game
Game.SkillRegistry = SkillRegistry;
export { Game };
// --- ensure namine skill exists and is selectable ---
SkillRegistry.namine = {
  id: "namine",
  tables: SKILL_TABLES.namine,
  onActivate(ctx) {
    const duration = skillValue("namine", "durationSec", ctx.level) || 4.0;
    const sourceType = pickMostCommonType(ctx.game, ctx.game.myTsum.id);
    ctx.game.pushCenterMessage("NAMINE!", "#ffd2ff", 0.92);
    ctx.game.namineSkillTimer = duration;
    const session = ctx.createSession({
      remainingMs: duration * 1000,
      cleanupOnEnd: false,
      data: {
        sourceTypeId: sourceType?.id || null
      }
    });
    if (sourceType) {
      const targets = getLiveTsums(ctx.game, (tsum) => ctx.board.getResolvedType(tsum).id === sourceType.id);
      if (targets.length) {
        ctx.transformNodes(targets.map((tsum) => tsum.id), {
          sessionId: session.id,
          toTypeId: "namineSora",
          kind: "namineSora"
        });
      }
    }
    return session;
  },
  onTick(ctx, session) {
    ctx.game.namineSkillTimer = Math.max(0, session.remainingMs / 1000);
  },
  onSpawn(ctx, session, node) {
    // During skill duration, always transform the most common sub-tsum type to Sora
    const mostCommon = pickMostCommonType(ctx.game, ctx.game.myTsum.id);
    if (mostCommon && node.type.id === mostCommon.id) {
      ctx.transformNodes([node.id], {
        sessionId: session.id,
        toTypeId: "namineSora",
        kind: "namineSora"
      });
    }
    return null;
  },
  onAugmentClear(ctx, session, request) {
    if (request.source !== "chain") {
      return request;
    }
    const primaryTargets = Array.isArray(request.sequentialPrimaryTargets) && request.sequentialPrimaryTargets.length
      ? request.sequentialPrimaryTargets.slice()
      : request.targets.slice();
    const familyNodes = request.targets.filter((tsum) => {
      const typeId = ctx.board.getResolvedType(tsum).id;
      return typeId === "namine" || typeId === "namineSora";
    });
    if (!familyNodes.length) {
      return request;
    }
    const seen = new Set(request.targets.map((tsum) => tsum.id));
    const splashGroups = [];
    for (const source of familyNodes) {
      const expanded = collectNodesNearCenters(
        ctx.game,
        [source],
        skillValue("namine", "splashRadius", ctx.level),
        (tsum) => !seen.has(tsum.id)
      );
      const groupTargets = [];
      for (const target of expanded) {
        seen.add(target.id);
        request.targets.push(target);
        groupTargets.push(target);
      }
      if (groupTargets.length) {
        splashGroups.push({ triggerId: source.id, targets: groupTargets });
      }
    }
    attachSequentialSplashGroups(request, primaryTargets, splashGroups, ctx.game, "namine");
    request.correctionType = skillValue("namine", "coinCorrectionType", ctx.level);
    request.chargeMultiplier = skillValue("namine", "chargeMultiplier", ctx.level);
    return request;
  },
  onEnd(ctx, session) {
    ctx.game.namineSkillTimer = 0;
    if (ctx.game.dragging && ctx.game.chainRule?.mode === "namine") {
      ctx.game.postChainCleanupSessionIds.push(session.id);
      return;
    }
    ctx.clearBySource(session.id);
  },
  cleanupBySession() {}
};

 

SkillRegistry.gaston = {
  id: "gaston",
  tables: SKILL_TABLES.gaston,
  onActivate(ctx) {
    const session = ctx.createSession({
      remainingMs: skillValue("gaston", "loopSec", ctx.level) * 1000,
      cleanupOnEnd: false,
      data: {
        spawnHandleId: null,
        loopActive: false
      }
    });
    const targets = getLiveTsums(ctx.game, (tsum) => Math.abs(tsum.y - FIELD_CENTER_Y) <= skillValue("gaston", "initialLineHalfHeight", ctx.level));
    const activateLoop = () => {
      if (session.data.loopActive) {
        return;
      }
      const handle = ctx.setSpawnModifier({
        sessionId: session.id,
        mode: "gastonLoop",
        myTypeId: ctx.game.myTsum.id,
        targetPopulation: TARGET_TSUM_COUNT,
        rate: skillValue("gaston", "myTsumSpawnRate", ctx.level)
      });
      session.data.spawnHandleId = handle.id;
      session.data.loopActive = true;
      ctx.game.pushCenterMessage("GASTON!", "#ffe6d7", 0.9);
    };
    if (targets.length) {
      ctx.clear.beginClear({
        source: "skill",
        targets,
        x: WIDTH * 0.5,
        y: FIELD_CENTER_Y,
        allowBomb: false,
        pauseClock: true,
        pausePhysics: true,
        correctionType: skillValue("gaston", "coinCorrectionType", ctx.level),
        onFinalize: activateLoop
      });
    } else {
      activateLoop();
    }
    return session;
  },
  onEnd(ctx, session) {
    session.data.loopActive = false;
    if (session.data.spawnHandleId) {
      ctx.removeSpawnModifier(session.data.spawnHandleId);
    }
  },
  cleanupBySession() {
  }
};

SkillRegistry.guidingMoana = {
  id: "guidingMoana",
  tables: SKILL_TABLES.guidingMoana,
  onActivate(ctx) {
    const session = ctx.createSession({
      remainingMs: skillValue("guidingMoana", "durationSec", ctx.level) * 1000,
      cleanupOnEnd: false,
      data: {
        blockedTypeId: null,
        spawnHandleId: null
      }
    });
    const removedType = pickMostCommonType(ctx.game, ctx.game.myTsum.id);
    const spawnCenterBomb = () => {
      const bomb = createMoanaSpecialBomb(ctx.game, WIDTH * 0.5, FIELD_CENTER_Y, ctx.level);
      bomb.vx = 0;
      bomb.vy = 0;
      ctx.game.bombs.push(bomb);
      ctx.game.addFloatingText(WIDTH * 0.5, FIELD_TOP + 42, "SPECIAL BOMB", "#8de7ff", 14, 0.55);
    };
    if (removedType) {
      session.data.blockedTypeId = removedType.id;
      if (skillValue("guidingMoana", "removedTypeSpawnBlock", ctx.level)) {
        const handle = ctx.setSpawnModifier({
          sessionId: session.id,
          blockedTypeId: removedType.id
        });
        session.data.spawnHandleId = handle.id;
      }
      const targets = getLiveTsums(ctx.game, (tsum) => ctx.board.getResolvedType(tsum).id === removedType.id);
      if (targets.length) {
        ctx.clear.beginClear({
          source: "skill",
          targets,
          x: WIDTH * 0.5,
          y: FIELD_TOP + 72,
          allowBomb: false,
          pauseClock: true,
          pausePhysics: true,
          onFinalize: spawnCenterBomb
        });
      } else {
        spawnCenterBomb();
      }
    } else {
      spawnCenterBomb();
    }
    ctx.game.pushCenterMessage("MOANA!", "#bdf5ff", 0.9);
    return session;
  },
  onSpawn(ctx, session) {
    if (Math.random() < skillValue("guidingMoana", "specialBombSpawnChance", ctx.level)) {
      return {
        replaceWithBombType: "moanaSpecial",
        effectRadius: BOMB_BLAST_RADIUS * skillValue("guidingMoana", "specialBombRadiusMultiplier", ctx.level),
        correctionType: skillValue("guidingMoana", "specialBombCoinCorrectionType", ctx.level)
      };
    }
    return null;
  },
  onEnd(ctx, session) {
    if (session.data.spawnHandleId) {
      ctx.removeSpawnModifier(session.data.spawnHandleId);
    }
  },
  cleanupBySession() {
  }
};

SkillRegistry.perfumeAlice = {
  id: "perfumeAlice",
  tables: SKILL_TABLES.perfumeAlice,
  onActivate(ctx) {
    const session = ctx.createSession({
      remainingMs: skillValue("perfumeAlice", "durationSec", ctx.level) * 1000,
      cleanupOnEnd: false,
      data: {}
    });
    ctx.setScaleModifier({
      sessionId: session.id,
      typeId: ctx.game.myTsum.id,
      scale: skillValue("perfumeAlice", "aliceScale", ctx.level),
      radiusScale: skillValue("perfumeAlice", "aliceHitRadiusScale", ctx.level)
    });
    ctx.game.pushCenterMessage("MINI!", "#ffe4ef", 0.88);
    return session;
  },
  onAugmentClear(ctx, session, request) {
    if (request.source !== "chain") {
      return request;
    }
    const clearedIds = new Set(request.targets.map((target) => target.id));
    const clearedNeighbors = request.targets.filter(
      (target) => ctx.board.getResolvedType(target).id !== ctx.game.myTsum.id
    );
    if (!clearedNeighbors.length) {
      return request;
    }
    const adjacentAlices = ctx.game.tsums.filter((tsum) => {
      if (
        tsum.dead ||
        tsum.removing ||
        tsum.clearOccupying ||
        !ctx.game.isTsumInPlayArea(tsum) ||
        clearedIds.has(tsum.id) ||
        ctx.board.getResolvedType(tsum).id !== ctx.game.myTsum.id
      ) {
        return false;
      }
      return clearedNeighbors.some((neighbor) => (
        distance(neighbor.x, neighbor.y, tsum.x, tsum.y) <=
        ctx.game.getBodyRadius(neighbor) + ctx.game.getBodyRadius(tsum) + CHAIN_CONNECT_MARGIN
      ));
    });
    if (!adjacentAlices.length) {
      return request;
    }
    request.targets = request.targets.concat(adjacentAlices);
    request.skillBonus = (request.skillBonus || 0) + adjacentAlices.length * 40;
    request.correctionType = skillValue("perfumeAlice", "coinCorrectionType", ctx.level);
    return request;
  },
  onEnd(ctx, session) {
    ctx.clearBySource(session.id);
  },
  cleanupBySession() {
  }
};

SkillRegistry.jamilViper = {
  id: "jamilViper",
  tables: SKILL_TABLES.jamilViper,
  onActivate(ctx) {
    const session = ctx.createSession({
      remainingMs: skillValue("jamilViper", "durationSec", ctx.level) * 1000,
      cleanupOnEnd: false,
      data: {}
    });
    const ids = getLiveTsums(ctx.game, (tsum) => ctx.board.getResolvedType(tsum).id === ctx.game.myTsum.id)
      .map((tsum) => tsum.id);
    ctx.addSpecialChainNodes(ids, {
      sessionId: session.id,
      kind: "jamilHighScore",
      scoreMultiplier: skillValue("jamilViper", "scoreMultiplier", ctx.level),
      correctionType: skillValue("jamilViper", "coinCorrectionType", ctx.level),
      splashRadius: skillValue("jamilViper", "splashRadius", ctx.level)
    });
    ctx.game.pushCenterMessage("JAMIL!", "#f0dbff", 0.92);
    return session;
  },
  onSpawn(ctx, session, node) {
    if (ctx.board.getResolvedType(node).id !== ctx.game.myTsum.id) {
      return null;
    }
    ctx.addSpecialChainNodes([node.id], {
      sessionId: session.id,
      kind: "jamilHighScore",
      scoreMultiplier: skillValue("jamilViper", "scoreMultiplier", ctx.level),
      correctionType: skillValue("jamilViper", "coinCorrectionType", ctx.level),
      splashRadius: skillValue("jamilViper", "splashRadius", ctx.level)
    });
    return null;
  },
  onAugmentClear(ctx, session, request) {
    if (request.source !== "chain") {
      return request;
    }
    const primaryTargets = Array.isArray(request.sequentialPrimaryTargets) && request.sequentialPrimaryTargets.length
      ? request.sequentialPrimaryTargets.slice()
      : request.targets.slice();
    const specials = request.targets
      .map((tsum) => ({ tsum, entry: ctx.board.getSpecialChainEntry(tsum) }))
      .filter(({ entry }) => entry && entry.kind === "jamilHighScore" && entry.sessionId === session.id);
    if (!specials.length) {
      return request;
    }
    const seen = new Set(request.targets.map((tsum) => tsum.id));
    let maxScoreMultiplier = 1;
    let correctionType = null;
    const sequentialSplashGroups = [];
    for (const { tsum, entry } of specials) {
      const expanded = collectNodesNearCenters(
        ctx.game,
        [tsum],
        entry.splashRadius,
        (candidate) => !seen.has(candidate.id)
      );
      const groupTargets = [];
      for (const target of expanded) {
        seen.add(target.id);
        request.targets.push(target);
        groupTargets.push(target);
      }
      if (groupTargets.length) {
        sequentialSplashGroups.push({ triggerId: tsum.id, targets: groupTargets });
      }
      maxScoreMultiplier = Math.max(maxScoreMultiplier, entry.scoreMultiplier);
      correctionType = correctionType || entry.correctionType;
    }
    attachSequentialSplashGroups(request, primaryTargets, sequentialSplashGroups, ctx.game, "jamilViper");
    request.scoreMultiplier *= maxScoreMultiplier;
    request.correctionType = correctionType;
    return request;
  },
  onEnd(ctx, session) {
    ctx.clearBySource(session.id);
  },
  cleanupBySession() {
  }
};

SkillRegistry.snowQueenElsa = {
  id: "snowQueenElsa",
  tables: SKILL_TABLES.snowQueenElsa,
  onActivate(ctx) {
    ctx.game.pushCenterMessage("ICE!", "#e1f7ff", 0.9);
    return ctx.createSession({
      remainingMs: skillValue("snowQueenElsa", "durationSec", ctx.level) * 1000,
      cleanupOnEnd: false,
      data: {}
    });
  },
  onChainCommit(ctx, session, chain) {
    const frozen = freezeAroundChain(
      ctx,
      session,
      chain,
      skillValue("snowQueenElsa", "freezeRadius", ctx.level),
      "snowQueen",
      true,
      {
        correctionType: skillValue("snowQueenElsa", "coinCorrectionType", ctx.level)
      }
    );
    if (frozen.length) {
      const last = chain[chain.length - 1];
      ctx.game.createShockwave(last.x, last.y, "rgba(205,245,255,0.7)", 5, 18, 0.26, 140);
    }
    return true;
  },
  onEnd() {
  },
  cleanupBySession() {
  }
};

function coingainActualDtMs(game, data) {
  const nowMs = game.elapsed * 1000;
  const lastMs = Number.isFinite(data.lastTickElapsedMs) ? data.lastTickElapsedMs : nowMs;
  data.lastTickElapsedMs = nowMs;
  return Math.max(0, nowMs - lastMs);
}

function coingainUniqueTypeIds(game) {
  const ids = [];
  const seen = new Set();
  for (const tsum of game.tsums) {
    if (!tsum || tsum.dead || tsum.removing) {
      continue;
    }
    const typeId = game.boardState.getResolvedType(tsum)?.id;
    if (!typeId || seen.has(typeId)) {
      continue;
    }
    seen.add(typeId);
    ids.push(typeId);
  }
  return ids;
}

function coingainPickReducedTypeId(game) {
  const candidates = coingainUniqueTypeIds(game).filter((typeId) => !game.isMyTsumTypeId(typeId));
  return candidates.length ? candidates[randInt(0, candidates.length - 1)] : null;
}

function coingainRandomTypeId(typeIds, fallbackId) {
  const pool = Array.isArray(typeIds) && typeIds.length ? typeIds : [fallbackId].filter(Boolean);
  return pool.length ? pool[randInt(0, pool.length - 1)] : fallbackId;
}

function coingainTransformNodesRandomly(ctx, session, nodes, typeIds) {
  for (const node of nodes) {
    if (!node || node.dead || node.removing) {
      continue;
    }
    ctx.transformNodes([node.id], {
      sessionId: session.id,
      toTypeId: coingainRandomTypeId(typeIds, ctx.game.myTsum.id),
      kind: "coingainTransform"
    });
  }
}

function coingainStartPhase(ctx, session, phase, durationMs) {
  session.data.phase = phase;
  session.data.phaseRemainingMs = Math.max(0, durationMs || 0);
  if (ctx.game.isCoingainInputLocked()) {
    ctx.game.cancelActiveInputForCoingainLock();
  }
}

function coingainCanStartAction(game) {
  return !game.pendingClear && (!game.actionLock || game.canQueueChainDuringActiveClear());
}

function coingainIsRandomClearOutcome(action) {
  return action?.type === "centerClear" || action?.type === "largeCenterClear";
}

function coingainIsRandomClearBusy(game) {
  return !!(
    game.pendingClear ||
    game.actionLock ||
    game.dragging ||
    game.aiChainAnimating ||
    (Array.isArray(game.pendingChainClearQueue) && game.pendingChainClearQueue.length > 0)
  );
}

function coingainRegisterRandomClearRetry(ctx, action, reason, result = null) {
  action.randomClearRetryCount = Math.max(0, Math.floor(action.randomClearRetryCount || 0)) + 1;
  if (action.randomClearRetryCount < COINGAIN_RANDOM_CLEAR_RETRY_LIMIT) {
    return false;
  }
  if (ctx.game.coingainDebug && !action.randomClearRetryLimitLogged) {
    console.log("[COINGAIN DEBUG] random clear retry limit", {
      type: action.type,
      reason,
      retryCount: action.randomClearRetryCount,
      liveTargetCount: result?.liveTargetCount || 0,
      handled: !!result?.handled
    });
    action.randomClearRetryLimitLogged = true;
  }
  return true;
}

function coingainNormalizeClearTargets(game, targets) {
  const stats = {
    candidateCount: Array.isArray(targets) ? targets.length : 0,
    validTargetCount: 0,
    duplicateCount: 0,
    missingBodyCount: 0,
    deadCount: 0,
    removingCount: 0,
    bombCount: 0,
    clearOccupyingCount: 0,
    inChainCount: 0,
    outOfPlayCount: 0
  };
  if (!Array.isArray(targets) || !game) {
    return { targets: [], stats };
  }
  const currentTsums = new Set(Array.isArray(game.tsums) ? game.tsums : []);
  const seen = new Set();
  const result = [];
  for (const tsum of targets) {
    if (!tsum || !currentTsums.has(tsum)) {
      stats.missingBodyCount += 1;
      continue;
    }
    if (seen.has(tsum.id)) {
      stats.duplicateCount += 1;
      continue;
    }
    seen.add(tsum.id);
    if (tsum.dead) {
      stats.deadCount += 1;
      continue;
    }
    if (tsum.removing) {
      stats.removingCount += 1;
      continue;
    }
    if (tsum.isBomb) {
      stats.bombCount += 1;
      continue;
    }
    if (tsum.clearOccupying) {
      stats.clearOccupyingCount += 1;
      continue;
    }
    if (tsum.inChain) {
      stats.inChainCount += 1;
      continue;
    }
    if (typeof game.isTsumInPlayArea === "function" && !game.isTsumInPlayArea(tsum)) {
      stats.outOfPlayCount += 1;
      continue;
    }
    result.push(tsum);
  }
  stats.validTargetCount = result.length;
  return { targets: result, stats };
}

function coingainDirectClear(ctx, session, targets, bombs, x, y, options = {}) {
  const normalized = coingainNormalizeClearTargets(ctx.game, targets);
  const liveTargets = normalized.targets;
  const removedBombs = ctx.game.removeBombsDirectly(Array.isArray(bombs) ? bombs : []);
  const effectiveTotalCount = calculateEffectiveClearCount({
    targets: liveTargets,
    additionalClearCount: removedBombs.length
  });
  const result = {
    candidateCount: normalized.stats.candidateCount,
    liveTargetCount: liveTargets.length,
    validTargetCount: liveTargets.length,
    invalidTargetStats: normalized.stats,
    handled: false,
    clearCount: removedBombs.length
  };
  if (liveTargets.length > 0) {
    const handled = ctx.clear.beginClear({
      source: options.source || "coingain",
      targets: liveTargets,
      x,
      y,
      allowBomb: options.allowBomb !== false,
      additionalClearCount: removedBombs.length,
      coingainCountOverride: effectiveTotalCount,
      coingainBombCount: removedBombs.length,
      correctionType: ctx.game.getCoingainCorrectionType(),
      chargeMultiplier: COINGAIN_CHARGE_MULTIPLIER
    });
    result.handled = handled;
    result.clearCount = handled ? effectiveTotalCount : removedBombs.length;
    if (!handled) {
      const postNormalize = coingainNormalizeClearTargets(ctx.game, liveTargets);
      result.postValidTargetCount = postNormalize.stats.validTargetCount;
      result.postInvalidTargetStats = postNormalize.stats;
    }
    return result;
  }
  if (removedBombs.length > 0) {
    ctx.game.recordCoingainDirectBombOnlyClear(removedBombs, x, y);
    result.handled = true;
  }
  return result;
}

function coingainRunRandomClear(ctx, session, minCount, maxCount, label) {
  const x = WIDTH * 0.5;
  const y = FIELD_CENTER_Y;
  const liveTargets = coingainNormalizeClearTargets(
    ctx.game,
    getLiveTsums(ctx.game, (tsum) => !tsum.clearOccupying && !tsum.inChain)
  ).targets;
  const targetCount = Math.min(
    liveTargets.length,
    Math.max(0, Math.floor(minCount + Math.random() * (maxCount - minCount + 1)))
  );
  for (let i = liveTargets.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [liveTargets[i], liveTargets[j]] = [liveTargets[j], liveTargets[i]];
  }
  const targets = liveTargets.slice(0, targetCount);
  const result = coingainDirectClear(ctx, session, targets, [], x, y, { source: label || "coingain" });
  const lottery = session?.data?.currentLottery;
  if (ctx.game.coingainDebug && (!lottery?.randomClearDebugLogged || result.handled || result.liveTargetCount === 0)) {
    console.log("[COINGAIN DEBUG] random clear", {
      clearType: label || "coingain",
      targetCount: result.liveTargetCount,
      handled: result.handled
    });
    if (lottery) {
      lottery.randomClearDebugLogged = true;
    }
  }
  return result;
}

function coingainRunAllClearStep(ctx, session) {
  const targets = getLiveTsums(ctx.game);
  const bombs = ctx.game.bombs.filter((bomb) => !bomb.dead);
  return coingainDirectClear(ctx, session, targets, bombs, WIDTH * 0.5, FIELD_CENTER_Y, {
    source: "coingainAllClear"
  });
}

function coingainRunNonBombClear(ctx, session) {
  const targets = getLiveTsums(ctx.game);
  return coingainDirectClear(ctx, session, targets, [], WIDTH * 0.5, FIELD_CENTER_Y, {
    source: "coingainNonBombClear"
  });
}

function coingainActivateMini(ctx, session) {
  if (session.data.miniActive) {
    return false;
  }
  session.data.miniActive = true;
  ctx.game.applyCoingainMiniScaleToCurrentBodies(session);
  ctx.game.spawnReplacementTsums();
  return true;
}

function coingainStartRestore(ctx, session) {
  const data = session.data;
  data.countingActive = false;
  data.pendingGlowOnPhaseEnd = false;
  data.pendingUnlimitedOnPhaseEnd = false;
  data.unlimitedRemainingMs = 0;
  coingainTransformNodesRandomly(ctx, session, ctx.game.tsums, data.originalTypeIds);
  coingainStartPhase(ctx, session, COINGAIN_PHASE.RESTORE, 500);
}

function coingainStartEnding(ctx, session) {
  const data = session.data;
  data.countingActive = false;
  if (data.miniActive) {
    coingainStartPhase(ctx, session, COINGAIN_PHASE.MINI_RESTORE, 500);
    return;
  }
  coingainStartRestore(ctx, session);
}

function coingainFinish(ctx, session) {
  const data = session.data;
  if (data.cleanedUp) {
    return;
  }
  data.cleanedUp = true;
  data.phase = COINGAIN_PHASE.COMPLETE;
  data.countingActive = false;
  ctx.board.commitTransforms(session.id);
  if (data.spawnHandleId) {
    ctx.removeSpawnModifier(data.spawnHandleId);
    data.spawnHandleId = null;
  }
  ctx.clearBySource(session.id);
  ctx.runtime.endSession(session, "complete");
}

function coingainPickLotteryOutcome() {
  let roll = Math.random() * 100;
  for (const outcome of COINGAIN_LOTTERY_OUTCOMES) {
    if (roll < outcome.chance) {
      return outcome;
    }
    roll -= outcome.chance;
  }
  return { type: "miss", message: "ハズレ", color: "#d8d0ba" };
}

function coingainApplyLotteryOutcome(ctx, session, outcome) {
  const data = session.data;
  switch (outcome.type) {
    case "mini":
      coingainActivateMini(ctx, session);
      break;
    case "extend":
      data.effectRemainingMs += (skillValue("coingain", "lotteryExtendSec", session.level) || session.level || 1) * 1000;
      break;
    case "glow":
      data.pendingGlowOnPhaseEnd = true;
      break;
    case "nonBombClear":
      return coingainRunNonBombClear(ctx, session);
    case "unlimitedChain":
      data.pendingUnlimitedOnPhaseEnd = true;
      break;
    case "largeCenterClear":
      return coingainRunRandomClear(ctx, session, 16, 22, "coingainLargeCenterRandom");
    case "centerClear":
      return coingainRunRandomClear(ctx, session, 8, 12, "coingainCenterRandom");
    default:
      break;
  }
  return { handled: true, liveTargetCount: 0 };
}

function coingainBeginLotteryOutcome(ctx, session, outcome) {
  const data = session.data;
  if (!outcome) {
    return false;
  }
  if (outcome.type === "mini" && data.miniActive) {
    return false;
  }
  ctx.game.finishActiveChainForCoingainLottery();
  data.lotteryDrawCount = Math.max(0, Math.floor(data.lotteryDrawCount || 0)) + 1;
  data.currentLottery = {
    type: outcome.type,
    remainingSteps: outcome.type === "allClear" ? Math.max(1, session.level || ctx.level || 1) : 0,
    waitMs: 0,
    applied: false,
    resultShown: false,
    message: outcome.message,
    color: outcome.color
  };
  coingainStartPhase(ctx, session, COINGAIN_PHASE.LOTTERY, COINGAIN_LOTTERY_DURATION_MS);
  return true;
}

function coingainProcessLotteryQueue(ctx, session) {
  const data = session.data;
  if (!coingainCanStartAction(ctx.game) || data.phase !== COINGAIN_PHASE.ACTIVE || !data.lotteryQueue.length) {
    return false;
  }
  data.lotteryQueue.shift();
  const outcome = coingainPickLotteryOutcome();
  if (!outcome) {
    return true;
  }
  coingainBeginLotteryOutcome(ctx, session, outcome);
  return true;
}

function coingainUpdateLottery(ctx, session, actualDtMs) {
  const data = session.data;
  const action = data.currentLottery || {};
  data.phaseRemainingMs = Math.max(0, (data.phaseRemainingMs || 0) - actualDtMs);
  if (!action.resultShown && data.phaseRemainingMs <= COINGAIN_LOTTERY_RESULT_MS) {
    action.resultShown = true;
    ctx.game.pushCenterMessage(action.message, action.color, 0.72);
  }
  if (!action.applied) {
    const isRandomClear = coingainIsRandomClearOutcome(action);
    if (isRandomClear && coingainIsRandomClearBusy(ctx.game)) {
      if (!coingainRegisterRandomClearRetry(ctx, action, "busy")) {
        return;
      }
      action.applied = true;
      return;
    }
    if (ctx.game.pendingClear || ctx.game.actionLock) {
      return;
    }
    const result = coingainApplyLotteryOutcome(ctx, session, action);
    if (isRandomClear && result?.liveTargetCount > 0 && !result.handled) {
      if (ctx.game.coingainDebug && !action.handledFalseDebugLogged) {
        const stats = result.postInvalidTargetStats || result.invalidTargetStats || {};
        console.log("[COINGAIN DEBUG] lottery clear not handled", {
          type: action.type,
          retryCount: action.randomClearRetryCount || 0,
          candidateCount: result.candidateCount || 0,
          liveTargetCount: result.liveTargetCount || 0,
          validTargetCount: result.postValidTargetCount ?? result.validTargetCount ?? 0,
          deadCount: stats.deadCount || 0,
          removingCount: stats.removingCount || 0,
          clearOccupyingCount: stats.clearOccupyingCount || 0,
          inChainCount: stats.inChainCount || 0
        });
        action.handledFalseDebugLogged = true;
      }
      if (!coingainRegisterRandomClearRetry(ctx, action, "beginClearFalse", result)) {
        return;
      }
    }
    action.applied = true;
  }
  if (action.type === "allClear") {
    if (!ctx.game.pendingClear && !ctx.game.actionLock) {
      action.waitMs = Math.max(0, (action.waitMs || 0) - actualDtMs);
      if (action.remainingSteps > 0 && action.waitMs <= 0) {
        coingainRunAllClearStep(ctx, session);
        action.remainingSteps -= 1;
        action.waitMs = 200;
      }
    }
    if (action.remainingSteps > 0 || ctx.game.pendingClear || ctx.game.actionLock) {
      return;
    }
  }
  if (data.phaseRemainingMs > 0 || ctx.game.pendingClear) {
    return;
  }
  if (data.pendingGlowOnPhaseEnd) {
    data.pendingGlowOnPhaseEnd = false;
    ctx.game.applyCoingainGlowToCurrentMyTsums(session);
  }
  if (data.pendingUnlimitedOnPhaseEnd) {
    data.pendingUnlimitedOnPhaseEnd = false;
    data.unlimitedRemainingMs = Math.max(0, data.unlimitedRemainingMs || 0) + (skillValue("coingain", "unlimitedChainSec", session.level) || 3) * 1000;
  }
  data.currentLottery = null;
  data.phase = COINGAIN_PHASE.ACTIVE;
}

SkillRegistry.coingain = {
  id: "coingain",
  tables: SKILL_TABLES.coingain,
  onActivate(ctx) {
    const originalTypeIds = coingainUniqueTypeIds(ctx.game);
    const reducedTypeId = coingainPickReducedTypeId(ctx.game);
    const remainingTypeIds = originalTypeIds.filter((typeId) => typeId !== reducedTypeId);
    const durationMs = (skillValue("coingain", "durationSec", ctx.level) || 6) * 1000;
    const session = ctx.createSession({
      remainingMs: Infinity,
      cleanupOnEnd: false,
      data: {
        level: ctx.level,
        phase: COINGAIN_PHASE.INTRO,
        phaseRemainingMs: 500,
        effectStarted: false,
        effectRemainingMs: durationMs,
        initialDurationMs: durationMs,
        originalTypeIds: originalTypeIds.length ? originalTypeIds : [ctx.game.myTsum.id],
        reducedTypeId,
        remainingTypeIds: remainingTypeIds.length ? remainingTypeIds : [ctx.game.myTsum.id],
        spawnHandleId: null,
        coinStage: 0,
        coinCount: 0,
        coinFlashMs: 0,
        lotteryCount: 0,
        lotteryDrawCount: 0,
        lotteryQueue: [],
        nextLotteryId: 1,
        totalCleared: 0,
        miniActive: false,
        unlimitedRemainingMs: 0,
        pendingGlowOnPhaseEnd: false,
        pendingUnlimitedOnPhaseEnd: false,
        currentLottery: null,
        countingActive: true,
        cleanedUp: false,
        lastTickElapsedMs: ctx.game.elapsed * 1000
      }
    });
    if (reducedTypeId) {
      const handle = ctx.setSpawnModifier({
        sessionId: session.id,
        blockedTypeId: reducedTypeId
      });
      session.data.spawnHandleId = handle.id;
      const targets = getLiveTsums(ctx.game, (tsum) => ctx.board.getResolvedType(tsum).id === reducedTypeId);
      coingainTransformNodesRandomly(ctx, session, targets, session.data.remainingTypeIds);
    }
    ctx.game.pushCenterMessage("COINGAIN!", "#ffe279", 0.72);
    return session;
  },
  onTick(ctx, session) {
    const data = session.data;
    const actualDtMs = coingainActualDtMs(ctx.game, data);
    data.coinFlashMs = Math.max(0, (data.coinFlashMs || 0) - actualDtMs);
    if (data.phase !== COINGAIN_PHASE.ACTIVE) {
      ctx.game.cancelActiveInputForCoingainLock();
    }
    if (data.phase === COINGAIN_PHASE.INTRO) {
      data.phaseRemainingMs = Math.max(0, (data.phaseRemainingMs || 0) - actualDtMs);
      if (data.phaseRemainingMs <= 0) {
        ctx.board.commitTransforms(session.id);
        data.effectStarted = true;
        data.phase = COINGAIN_PHASE.ACTIVE;
      }
      return;
    }
    if (data.phase === COINGAIN_PHASE.LOTTERY) {
      coingainUpdateLottery(ctx, session, actualDtMs);
      return;
    }
    if (data.phase === COINGAIN_PHASE.MINI_RESTORE) {
      data.phaseRemainingMs = Math.max(0, (data.phaseRemainingMs || 0) - actualDtMs);
      if (data.phaseRemainingMs <= 0) {
        data.miniActive = false;
        ctx.game.clearCoingainMiniScale(session);
        coingainStartRestore(ctx, session);
      }
      return;
    }
    if (data.phase === COINGAIN_PHASE.RESTORE) {
      data.phaseRemainingMs = Math.max(0, (data.phaseRemainingMs || 0) - actualDtMs);
      if (data.phaseRemainingMs <= 0) {
        coingainFinish(ctx, session);
      }
      return;
    }
    if (data.phase !== COINGAIN_PHASE.ACTIVE) {
      return;
    }
    data.unlimitedRemainingMs = Math.max(0, (data.unlimitedRemainingMs || 0) - actualDtMs);
    data.effectRemainingMs = Math.max(0, (data.effectRemainingMs || 0) - actualDtMs);
    if (coingainProcessLotteryQueue(ctx, session)) {
      return;
    }
    if (data.effectRemainingMs <= 0 && !data.lotteryQueue.length && !ctx.game.pendingClear) {
      coingainStartEnding(ctx, session);
    }
  },
  onSpawn(ctx, session, node) {
    const data = session.data;
    if (!data || !node) {
      return null;
    }
    if (data.phase === COINGAIN_PHASE.RESTORE) {
      ctx.transformNodes([node.id], {
        sessionId: session.id,
        toTypeId: coingainRandomTypeId(data.originalTypeIds, ctx.game.myTsum.id),
        kind: "coingainRestore"
      });
    } else if (data.reducedTypeId && node.type.id === data.reducedTypeId) {
      ctx.transformNodes([node.id], {
        sessionId: session.id,
        toTypeId: coingainRandomTypeId(data.remainingTypeIds, ctx.game.myTsum.id),
        kind: "coingainSpawnTransform"
      });
    }
    ctx.game.applyCoingainMiniScaleToBody(node, session);
    return null;
  },
  onAugmentClear(ctx, session, request) {
    if (!ctx.game.isCoingainCountingActive()) {
      return request;
    }
    if (request.source === "chain") {
      const primaryTargets = Array.isArray(request.sequentialPrimaryTargets) && request.sequentialPrimaryTargets.length
        ? request.sequentialPrimaryTargets.slice()
        : request.targets.slice();
      const glowingSources = request.targets
        .map((tsum) => ({ tsum, entry: ctx.board.getSpecialChainEntry(tsum) }))
        .filter(({ entry }) => entry && entry.kind === COINGAIN_SPECIAL_CHAIN_KIND && entry.sessionId === session.id);
      if (glowingSources.length) {
        const seen = new Set(request.targets.map((tsum) => tsum.id));
        const splashGroups = [];
        for (const { tsum, entry } of glowingSources) {
          const expanded = collectNodesNearCenters(
            ctx.game,
            [tsum],
            entry.splashRadius || NAMINE_SPLASH_RADIUS,
            (candidate) => !seen.has(candidate.id)
          );
          const groupTargets = [];
          for (const target of expanded) {
            seen.add(target.id);
            request.targets.push(target);
            groupTargets.push(target);
          }
          if (groupTargets.length) {
            splashGroups.push({ triggerId: tsum.id, targets: groupTargets });
          }
        }
        attachSequentialSplashGroups(request, primaryTargets, splashGroups, ctx.game, "coingain");
      }
    }
    request.correctionType = ctx.game.getCoingainCorrectionType();
    request.chargeMultiplier = COINGAIN_CHARGE_MULTIPLIER;
    return request;
  },
  onEnd(ctx, session) {
    const data = session.data || {};
    if (data.cleanedUp) {
      return;
    }
    data.cleanedUp = true;
    data.countingActive = false;
    if (data.spawnHandleId) {
      ctx.removeSpawnModifier(data.spawnHandleId);
    }
    ctx.clearBySource(session.id);
  },
  cleanupBySession() {
  }
};

registerJudyNickSkill({
  SkillRegistry,
  skillValue,
  getLiveTsums,
  movingFreezeKind: JUDY_NICK_MOVING_FREEZE_KIND
});

registerLiliaSkill({
  SkillRegistry,
  skillValue
});
