import {
  WIDTH,
  HEIGHT,
  HUD_HEIGHT,
  FIELD_CENTER_X,
  FIELD_TOP,
  FIELD_BOTTOM,
  FIELD_LEFT,
  FIELD_RIGHT,
  FIELD_HEIGHT,
  TSUM_RADIUS,
  PAUSE_BUTTON_RECT,
  SELECT_TSUM_BUTTON_RECT,
  SKILL_BUTTON_RECT,
  DECOR_BUTTON_RECT,
  AI_AUTO_BUTTON_RECT,
  STRONGEST_MODE_BUTTON_RECT,
  AI_LEARNING_BUTTON_RECT,
  AI_LEARNING_REPEAT_BUTTON_RECT,
  TSUM_TYPES,
  ITEM_DEFS,
  clamp,
  lerp,
  rand,
  randInt,
  distance,
  formatNumber,
  rectContains,
  easeOutCubic,
  easeOutBack,
  pointInCircle,
  makeRoundedRectPath,
  makeEllipsePath,
  drawGlossButton,
  drawStarPath
} from './config.js?v=tsum-images-5';
import { drawLiliaBat } from './lilia.js?v=tsum-images-5';
import { drawTsumArtwork, preloadTsumImages } from './tsumImages.js?v=tsum-images-5';

let sharedFeltTexture = null;

export class UIRenderer {
  constructor(game) {
    this.game = game;
    this.feltTexture = sharedFeltTexture || (sharedFeltTexture = this.createFeltTexture());
    preloadTsumImages(TSUM_TYPES);
  }

  render(ctx) {
    this.drawBackdrop(ctx);
    if (this.game.state === "title") {
      this.drawTitleScreen(ctx);
    } else if (this.game.state === "items") {
      this.drawItemScreen(ctx);
    } else if (this.game.state === "playing" || this.game.state === "battleWaiting") {
      this.drawGameScreen(ctx);
    } else if (this.game.state === "result") {
      this.drawResultScreen(ctx);
    }
  }

  createFeltTexture() {
    const texture = document.createElement("canvas");
    texture.width = WIDTH;
    texture.height = HEIGHT;
    const tctx = texture.getContext("2d");
    tctx.clearRect(0, 0, WIDTH, HEIGHT);
    for (let i = 0; i < 5200; i += 1) {
      const bright = i % 3 !== 0;
      tctx.fillStyle = bright ? "rgba(224,255,255,0.038)" : "rgba(0,70,126,0.032)";
      tctx.beginPath();
      tctx.arc(rand(0, WIDTH), rand(0, HEIGHT), rand(0.35, 1.2), 0, Math.PI * 2);
      tctx.fill();
    }
    for (let i = 0; i < 520; i += 1) {
      const x = rand(0, WIDTH);
      const y = rand(0, HEIGHT);
      tctx.strokeStyle = i % 4 === 0
        ? "rgba(0,64,114,0.032)"
        : "rgba(225,255,255,0.034)";
      tctx.lineWidth = rand(0.35, 0.85);
      tctx.beginPath();
      tctx.moveTo(x, y);
      tctx.lineTo(x + rand(-10, 10), y + rand(-2.5, 2.5));
      tctx.stroke();
    }
    return texture;
  }

  drawStitchedRoundedRect(ctx, x, y, w, h, radius, alpha = 0.62) {
    ctx.save();
    ctx.setLineDash([1.5, 3.2]);
    ctx.lineCap = "round";
    ctx.lineWidth = 1.25;
    ctx.strokeStyle = `rgba(226,255,255,${alpha})`;
    ctx.shadowBlur = 2;
    ctx.shadowColor = "rgba(116,244,255,0.45)";
    makeRoundedRectPath(ctx, x, y, w, h, radius);
    ctx.stroke();
    ctx.restore();
  }

  drawBackdrop(ctx) {
    const g = ctx.createLinearGradient(0, 0, 0, HEIGHT);
    g.addColorStop(0, "#6DEAF5");
    g.addColorStop(0.16, "#27C7DE");
    g.addColorStop(0.48, "#079FC8");
    g.addColorStop(0.78, "#078CB9");
    g.addColorStop(1, "#056A9E");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    ctx.save();
    ctx.globalAlpha = 0.2;
    const topGlow = ctx.createLinearGradient(0, 0, 0, 190);
    topGlow.addColorStop(0, "rgba(255,255,255,0.82)");
    topGlow.addColorStop(0.55, "rgba(255,255,255,0.16)");
    topGlow.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = topGlow;
    ctx.fillRect(0, 0, WIDTH, 190);
    ctx.globalAlpha = 0.3;
    const sideShade = ctx.createLinearGradient(0, 0, WIDTH, 0);
    sideShade.addColorStop(0, "rgba(0,72,140,0.58)");
    sideShade.addColorStop(0.22, "rgba(255,255,255,0)");
    sideShade.addColorStop(0.78, "rgba(255,255,255,0)");
    sideShade.addColorStop(1, "rgba(0,72,140,0.56)");
    ctx.fillStyle = sideShade;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    ctx.restore();

    ctx.save();
    ctx.globalCompositeOperation = "soft-light";
    ctx.globalAlpha = 1;
    ctx.drawImage(this.feltTexture, 0, 0);
    ctx.restore();

    ctx.save();
    ctx.shadowBlur = 10;
    ctx.shadowColor = "rgba(121,255,255,0.38)";
    ctx.strokeStyle = "rgba(226,255,255,0.48)";
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.arc(WIDTH * 0.5, -80, 306, 0.12, Math.PI - 0.12);
    ctx.stroke();
    ctx.setLineDash([1.5, 4]);
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = "rgba(234,255,255,0.62)";
    ctx.beginPath();
    ctx.arc(WIDTH * 0.5, -76, 302, 0.12, Math.PI - 0.12);
    ctx.stroke();
    ctx.restore();
  }

  drawDisneyLogo(ctx) {
    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#ffffff";
    ctx.shadowBlur = 6;
    ctx.shadowColor = "rgba(255,255,255,0.35)";
    ctx.font = 'italic 18px "Brush Script MT", "Segoe Script", cursive';
    ctx.fillText("Disney", WIDTH * 0.5, 22);
    ctx.restore();
  }

  drawTsumTsumLogo(ctx) {
    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    ctx.font = '900 22px "Trebuchet MS", sans-serif';
    ctx.lineJoin = "round";
    ctx.lineWidth = 3;
    ctx.strokeStyle = "#ffffff";
    const grad = ctx.createLinearGradient(WIDTH * 0.5 - 56, 0, WIDTH * 0.5 + 56, 0);
    grad.addColorStop(0, "#ff5b5b");
    grad.addColorStop(0.2, "#ff9f47");
    grad.addColorStop(0.4, "#ffe95f");
    grad.addColorStop(0.6, "#7df07d");
    grad.addColorStop(0.8, "#6ab9ff");
    grad.addColorStop(1, "#af73ff");
    ctx.strokeText("TsumTsum", WIDTH * 0.5, HEIGHT - 12);
    ctx.fillStyle = grad;
    ctx.fillText("TsumTsum", WIDTH * 0.5, HEIGHT - 12);
    ctx.restore();
  }

  drawFieldShell(ctx) {
    const shellTop = FIELD_TOP - 12;
    const shellBottom = FIELD_BOTTOM + 10;
    const topLipY = FIELD_TOP + 8;
    const bottomLipY = FIELD_BOTTOM - 7;

    ctx.save();
    ctx.shadowBlur = 22;
    ctx.shadowOffsetY = 5;
    ctx.shadowColor = "rgba(0,38,92,0.58)";
    const shellGrad = ctx.createLinearGradient(0, shellTop, 0, shellBottom);
    shellGrad.addColorStop(0, "rgba(176,255,255,0.4)");
    shellGrad.addColorStop(0.12, "rgba(24,203,225,0.34)");
    shellGrad.addColorStop(0.54, "rgba(0,96,163,0.2)");
    shellGrad.addColorStop(1, "rgba(0,52,124,0.54)");
    ctx.fillStyle = shellGrad;
    ctx.beginPath();
    ctx.moveTo(-12, topLipY);
    ctx.quadraticCurveTo(FIELD_CENTER_X, shellTop, WIDTH + 12, topLipY);
    ctx.lineTo(WIDTH + 12, bottomLipY);
    ctx.quadraticCurveTo(FIELD_CENTER_X, shellBottom, -12, bottomLipY);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    ctx.save();
    const topGradient = ctx.createLinearGradient(0, FIELD_TOP, WIDTH, FIELD_TOP);
    if (this.game.feverSystem.active) {
      const shift = (this.game.elapsed * 120) % 360;
      topGradient.addColorStop(0, `hsl(${shift}, 100%, 72%)`);
      topGradient.addColorStop(0.5, `hsl(${(shift + 90) % 360}, 100%, 75%)`);
      topGradient.addColorStop(1, `hsl(${(shift + 180) % 360}, 100%, 72%)`);
    } else {
      topGradient.addColorStop(0, "rgba(221,255,255,0.76)");
      topGradient.addColorStop(0.5, "rgba(88,247,255,0.86)");
      topGradient.addColorStop(1, "rgba(13,173,216,0.68)");
    }
    ctx.shadowBlur = 14;
    ctx.shadowColor = "rgba(109,250,255,0.58)";
    ctx.lineCap = "round";
    ctx.lineWidth = 9;
    ctx.strokeStyle = topGradient;
    ctx.beginPath();
    ctx.moveTo(-8, topLipY);
    ctx.quadraticCurveTo(FIELD_CENTER_X, FIELD_TOP - 13, WIDTH + 8, topLipY);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-8, bottomLipY);
    ctx.quadraticCurveTo(FIELD_CENTER_X, FIELD_BOTTOM + 12, WIDTH + 8, bottomLipY);
    ctx.stroke();
    ctx.restore();

    ctx.save();
    ctx.lineCap = "round";
    ctx.setLineDash([1.5, 4]);
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = "rgba(235,255,255,0.7)";
    ctx.beginPath();
    ctx.moveTo(8, FIELD_TOP + 20);
    ctx.quadraticCurveTo(FIELD_CENTER_X, FIELD_TOP + 4, WIDTH - 8, FIELD_TOP + 20);
    ctx.stroke();
    ctx.strokeStyle = "rgba(169,250,255,0.5)";
    ctx.beginPath();
    ctx.moveTo(8, FIELD_BOTTOM - 18);
    ctx.quadraticCurveTo(FIELD_CENTER_X, FIELD_BOTTOM - 2, WIDTH - 8, FIELD_BOTTOM - 18);
    ctx.stroke();
    ctx.restore();
  }

  drawCoingainFloorGauge(ctx, bottomLipY) {
    const status = this.game.getCoingainStatus?.();
    if (!status?.active) {
      return;
    }

    const progress = clamp(status.lotteryRemainder / 30, 0, 1);
    const pendingCount = Math.max(0, Math.floor(status.pendingLotteryCount || 0));
    const gauge = { x: 8, y: FIELD_TOP + 116, w: 16, h: 116 };
    const fillH = gauge.h * progress;
    ctx.save();
    ctx.shadowBlur = 8;
    ctx.shadowColor = "rgba(255,210,72,0.34)";
    makeRoundedRectPath(ctx, gauge.x, gauge.y, gauge.w, gauge.h, 7);
    ctx.fillStyle = "rgba(70,48,8,0.62)";
    ctx.fill();
    const grad = ctx.createLinearGradient(gauge.x, gauge.y + gauge.h, gauge.x, gauge.y);
    grad.addColorStop(0, "#ff9f1a");
    grad.addColorStop(0.55, "#ffd645");
    grad.addColorStop(1, "#fff6b8");
    makeRoundedRectPath(ctx, gauge.x + 3, gauge.y + gauge.h - fillH + 3, gauge.w - 6, Math.max(0, fillH - 6), 4);
    ctx.fillStyle = grad;
    ctx.fill();
    makeRoundedRectPath(ctx, gauge.x, gauge.y, gauge.w, gauge.h, 7);
    ctx.strokeStyle = "rgba(255,234,144,0.58)";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    if (pendingCount > 0) {
      ctx.fillStyle = "#fff7c7";
      ctx.font = '900 11px "Trebuchet MS", sans-serif';
      ctx.fillText(`待×${pendingCount}`, gauge.x + gauge.w * 0.5, gauge.y - 12);
    }
    ctx.fillStyle = "#fff7c7";
    ctx.font = '900 12px "Trebuchet MS", sans-serif';
    ctx.fillText(`×${Math.max(0, Math.floor(status.lotteryDrawCount || 0))}`, gauge.x + gauge.w * 0.5, gauge.y + gauge.h + 15);
    ctx.restore();
  }

  drawFieldContents(ctx) {
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(-14, FIELD_TOP + 18);
    ctx.quadraticCurveTo(FIELD_CENTER_X, FIELD_TOP - 4, WIDTH + 14, FIELD_TOP + 18);
    ctx.lineTo(WIDTH + 14, FIELD_BOTTOM - 16);
    ctx.quadraticCurveTo(FIELD_CENTER_X, FIELD_BOTTOM + 7, -14, FIELD_BOTTOM - 16);
    ctx.closePath();
    ctx.clip();
    const fillGrad = ctx.createLinearGradient(0, FIELD_TOP - 8, 0, FIELD_BOTTOM + 10);
    fillGrad.addColorStop(0, "#315E91");
    fillGrad.addColorStop(0.14, "#183F74");
    fillGrad.addColorStop(0.48, "#0B285E");
    fillGrad.addColorStop(0.84, "#071E50");
    fillGrad.addColorStop(1, "#092C67");
    ctx.fillStyle = fillGrad;
    ctx.fillRect(0, FIELD_TOP - 10, WIDTH, FIELD_HEIGHT + 22);

    ctx.save();
    const innerShade = ctx.createRadialGradient(FIELD_CENTER_X, FIELD_TOP + 70, 18, FIELD_CENTER_X, (FIELD_TOP + FIELD_BOTTOM) * 0.54, FIELD_HEIGHT * 0.82);
    innerShade.addColorStop(0, "rgba(144,235,255,0.16)");
    innerShade.addColorStop(0.34, "rgba(68,183,230,0.03)");
    innerShade.addColorStop(1, "rgba(0,5,34,0.42)");
    ctx.fillStyle = innerShade;
    ctx.fillRect(0, FIELD_TOP - 10, WIDTH, FIELD_HEIGHT + 22);
    ctx.restore();

    ctx.save();
    ctx.globalCompositeOperation = "soft-light";
    ctx.globalAlpha = 0.24;
    ctx.drawImage(this.feltTexture, 0, FIELD_TOP - 10, WIDTH, FIELD_HEIGHT + 22, 0, FIELD_TOP - 10, WIDTH, FIELD_HEIGHT + 22);
    ctx.restore();

    ctx.save();
    const sideShade = ctx.createLinearGradient(0, 0, WIDTH, 0);
    sideShade.addColorStop(0, "rgba(0,8,34,0.24)");
    sideShade.addColorStop(0.16, "rgba(0,40,92,0.04)");
    sideShade.addColorStop(0.84, "rgba(0,40,92,0.04)");
    sideShade.addColorStop(1, "rgba(0,8,34,0.24)");
    ctx.fillStyle = sideShade;
    ctx.fillRect(0, FIELD_TOP - 10, WIDTH, FIELD_HEIGHT + 22);
    ctx.restore();

    ctx.save();
    ctx.globalAlpha = 0.065;
    for (let i = 0; i < 18; i += 1) {
      ctx.fillStyle = "rgba(143,238,255,0.13)";
      ctx.beginPath();
      ctx.arc(10 + i * 24, FIELD_TOP + 24 + (i % 5) * 70, 8 + (i % 3) * 5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    const bodies = this.game.renderBodies.length ? this.game.renderBodies : this.game.getRenderableBodies();
    for (const body of bodies) {
      if (body.isBomb) {
        body.draw(ctx);
      } else {
        body.draw(ctx, this.game.chainSet.has(body.id), this.game.elapsed);
      }
    }
    this.drawSkillChargeFlights(ctx);

    this.drawLiliaSkillOverlay(ctx);
    this.drawChain(ctx);

    ctx.save();
    const rimHighlight = ctx.createLinearGradient(0, FIELD_TOP, 0, FIELD_TOP + 120);
    rimHighlight.addColorStop(0, "rgba(255,255,255,0.2)");
    rimHighlight.addColorStop(0.42, "rgba(101,230,255,0.06)");
    rimHighlight.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = rimHighlight;
    ctx.fillRect(0, FIELD_TOP - 2, WIDTH, 104);
    ctx.restore();

    ctx.restore();
  }

  drawTopHUDReal(ctx) {
    const timerX = 50;
    const timerY = 64;
    const timerRadius = 42;
    const timerRatio = clamp(this.game.timeRemaining / this.game.gameDuration, 0, 1);
    ctx.save();
    ctx.shadowBlur = 14;
    ctx.shadowOffsetY = 5;
    ctx.shadowColor = "rgba(0,74,135,0.36)";
    const timerGrad = ctx.createRadialGradient(timerX - 10, timerY - 12, 4, timerX, timerY, timerRadius);
    timerGrad.addColorStop(0, "#F8FFFF");
    timerGrad.addColorStop(0.25, "#89F7FF");
    timerGrad.addColorStop(0.7, "#19B9DE");
    timerGrad.addColorStop(1, "#0572B4");
    ctx.fillStyle = timerGrad;
    ctx.beginPath();
    ctx.arc(timerX, timerY, timerRadius, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.lineWidth = 7;
    ctx.strokeStyle = "rgba(255,255,255,0.24)";
    ctx.beginPath();
    ctx.arc(timerX, timerY, timerRadius - 12, -Math.PI * 0.5, Math.PI * 1.5);
    ctx.stroke();
    ctx.strokeStyle = this.game.timeRemaining <= 10 ? "#ff816e" : "#fff176";
    ctx.shadowBlur = 5;
    ctx.shadowColor = ctx.strokeStyle;
    ctx.beginPath();
    ctx.arc(timerX, timerY, timerRadius - 12, -Math.PI * 0.5, -Math.PI * 0.5 + Math.PI * 2 * timerRatio);
    ctx.stroke();
    ctx.shadowBlur = 2;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#ffffff";
    ctx.shadowBlur = 2;
    ctx.shadowColor = "rgba(0,0,0,0.4)";
    ctx.font = '900 31px "Trebuchet MS", sans-serif';
    ctx.fillText(`${Math.ceil(this.game.timeRemaining)}`, timerX, timerY - 3);
    ctx.font = '800 9px "Trebuchet MS", sans-serif';
    ctx.fillText("TIME", timerX, timerY + 22);
    ctx.restore();

    const scoreX = 108;
    const scoreY = 26;
    const scoreW = 218;
    const scoreH = 37;
    ctx.save();
    ctx.shadowBlur = 11;
    ctx.shadowOffsetY = 3;
    ctx.shadowColor = "rgba(0,49,112,0.34)";
    makeRoundedRectPath(ctx, scoreX, scoreY, scoreW, scoreH, scoreH * 0.5);
    const scoreGrad = ctx.createLinearGradient(scoreX, scoreY, scoreX, scoreY + scoreH);
    scoreGrad.addColorStop(0, "rgba(88,151,220,0.92)");
    scoreGrad.addColorStop(0.45, "rgba(25,78,162,0.9)");
    scoreGrad.addColorStop(1, "rgba(16,46,116,0.94)");
    ctx.fillStyle = scoreGrad;
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.lineWidth = 2;
    ctx.strokeStyle = "rgba(220,252,255,0.36)";
    makeRoundedRectPath(ctx, scoreX, scoreY, scoreW, scoreH, scoreH * 0.5);
    ctx.stroke();
    this.drawStitchedRoundedRect(ctx, scoreX + 5, scoreY + 4, scoreW - 10, scoreH - 8, (scoreH - 8) * 0.5, 0.5);
    ctx.strokeStyle = "rgba(0,42,103,0.24)";
    ctx.lineWidth = 1;
    makeRoundedRectPath(ctx, scoreX + 2, scoreY + scoreH - 8, scoreW - 4, 5, 3);
    ctx.stroke();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "rgba(255,255,255,0.88)";
    ctx.shadowBlur = 2;
    ctx.shadowColor = "rgba(0,0,0,0.5)";
    ctx.font = '800 9px "Trebuchet MS", sans-serif';
    ctx.fillText("SCORE", scoreX + scoreW * 0.5, scoreY + 9);
    ctx.fillStyle = "#fffce3";
    ctx.font = '900 21px "Trebuchet MS", sans-serif';
    ctx.fillText(formatNumber(this.game.displayedScore), scoreX + scoreW * 0.5, scoreY + 26);
    ctx.restore();

    const coinX = 147;
    const coinY = 68;
    const coinW = 154;
    const coinH = 27;
    ctx.save();
    ctx.shadowBlur = 7;
    ctx.shadowOffsetY = 2;
    ctx.shadowColor = "rgba(0,61,118,0.24)";
    makeRoundedRectPath(ctx, coinX, coinY, coinW, coinH, coinH * 0.5);
    const coinPanelGrad = ctx.createLinearGradient(coinX, coinY, coinX, coinY + coinH);
    coinPanelGrad.addColorStop(0, "rgba(58,174,213,0.84)");
    coinPanelGrad.addColorStop(0.55, "rgba(14,114,166,0.9)");
    coinPanelGrad.addColorStop(1, "rgba(6,76,128,0.94)");
    ctx.fillStyle = coinPanelGrad;
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = "rgba(204,252,255,0.3)";
    ctx.lineWidth = 1;
    ctx.stroke();
    this.drawStitchedRoundedRect(ctx, coinX + 4, coinY + 3, coinW - 8, coinH - 6, (coinH - 6) * 0.5, 0.38);
    const coinGrad = ctx.createRadialGradient(coinX + 19, coinY + 14, 2, coinX + 19, coinY + 14, 11);
    coinGrad.addColorStop(0, "#fff4a8");
    coinGrad.addColorStop(0.55, "#FFD700");
    coinGrad.addColorStop(1, "#FFA500");
    ctx.fillStyle = coinGrad;
    ctx.beginPath();
    ctx.arc(coinX + 19, coinY + 14, 11, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.9)";
    ctx.font = '700 11px "Trebuchet MS", sans-serif';
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("$", coinX + 19, coinY + 14);
    ctx.fillStyle = "#ffffff";
    ctx.font = '900 17px "Trebuchet MS", sans-serif';
    ctx.textAlign = "left";
    ctx.fillText(formatNumber(this.game.pendingCoinsEstimate()), coinX + 42, coinY + 14);
    ctx.restore();

    if (this.game.role !== "cpu") {
      drawGlossButton(ctx, PAUSE_BUTTON_RECT.x - 2, PAUSE_BUTTON_RECT.y - 1, PAUSE_BUTTON_RECT.w + 4, PAUSE_BUTTON_RECT.h + 4, 16, "#FFF27A", "#F0A000", "rgba(255,255,255,0.68)", "rgba(155,100,0,0.28)");
      ctx.save();
      if (this.game.paused) {
        ctx.globalAlpha = 0.8;
      }
      ctx.fillStyle = "#ffffff";
      ctx.shadowBlur = 3;
      ctx.shadowColor = "rgba(125,78,0,0.34)";
      makeRoundedRectPath(ctx, PAUSE_BUTTON_RECT.x + 15, PAUSE_BUTTON_RECT.y + 13, 7, 22, 3);
      ctx.fill();
      makeRoundedRectPath(ctx, PAUSE_BUTTON_RECT.x + 29, PAUSE_BUTTON_RECT.y + 13, 7, 22, 3);
      ctx.fill();
      ctx.restore();

      this.drawButton(ctx, SELECT_TSUM_BUTTON_RECT, "TSUM", {
        fill: "#1f8cbe",
        glow: "#8beaff",
        subtitle: "",
        size: 9,
        alpha: 0.52
      });
    }
    this.drawCoingainStatusPanel(ctx);
    this.drawBattleStatusPanel(ctx);
  }

  drawBattleStatusPanel(ctx) {
    const battle = this.game.battleContext;
    if (!battle?.active || this.game.role !== "player" || !battle.opponent) {
      return;
    }
    const opponentScore = Math.max(0, battle.opponent.displayedScore || battle.opponent.score || 0);
    const playerScore = Math.max(0, this.game.displayedScore || this.game.score || 0);
    const difference = Math.round(playerScore - opponentScore);
    const maxScore = Math.max(1, playerScore, opponentScore);
    const playerRatio = clamp(playerScore / maxScore, 0, 1);
    const panel = { x: 91, y: 101, w: 232, h: 34 };
    ctx.save();
    makeRoundedRectPath(ctx, panel.x, panel.y, panel.w, panel.h, 12);
    ctx.fillStyle = "rgba(5,35,83,0.9)";
    ctx.fill();
    ctx.strokeStyle = difference >= 0 ? "rgba(130,255,210,0.8)" : "rgba(255,139,152,0.8)";
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.textBaseline = "middle";
    ctx.font = '800 10px "Trebuchet MS", sans-serif';
    ctx.textAlign = "left";
    ctx.fillStyle = "#ffffff";
    ctx.fillText(`CPU ${formatNumber(opponentScore)}`, panel.x + 10, panel.y + 11);
    ctx.textAlign = "right";
    ctx.fillStyle = difference >= 0 ? "#8dffd3" : "#ff9ba8";
    ctx.fillText(`${difference >= 0 ? "+" : "-"}${formatNumber(Math.abs(difference))}`, panel.x + panel.w - 10, panel.y + 11);
    ctx.fillStyle = "rgba(255,255,255,0.14)";
    makeRoundedRectPath(ctx, panel.x + 10, panel.y + 22, panel.w - 20, 6, 3);
    ctx.fill();
    ctx.fillStyle = difference >= 0 ? "#65e8b5" : "#ff8797";
    makeRoundedRectPath(ctx, panel.x + 10, panel.y + 22, (panel.w - 20) * playerRatio, 6, 3);
    ctx.fill();
    ctx.restore();
  }

  drawCoingainStatusPanel(ctx) {
    const status = this.game.getCoingainStatus?.();
    if (!status) {
      return;
    }

    const panel = { x: 95, y: 101, w: 224, h: 30 };
    const flash = clamp(status.coinFlashRatio || 0, 0, 1);
    const scale = 1 + flash * 0.09;
    const cx = panel.x + panel.w * 0.5;
    const cy = panel.y + panel.h * 0.5;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(scale, scale);
    ctx.translate(-cx, -cy);
    ctx.shadowBlur = 9 + flash * 18;
    ctx.shadowColor = "rgba(255,211,72,0.68)";
    makeRoundedRectPath(ctx, panel.x, panel.y, panel.w, panel.h, 15);
    const panelGrad = ctx.createLinearGradient(panel.x, panel.y, panel.x, panel.y + panel.h);
    panelGrad.addColorStop(0, "rgba(88,60,8,0.92)");
    panelGrad.addColorStop(0.55, "rgba(148,97,6,0.9)");
    panelGrad.addColorStop(1, "rgba(79,49,0,0.94)");
    ctx.fillStyle = panelGrad;
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = flash > 0 ? "rgba(255,246,174,0.88)" : "rgba(255,234,144,0.34)";
    ctx.lineWidth = 1.4;
    ctx.stroke();

    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#fff7c7";
    ctx.font = '900 14px "Trebuchet MS", sans-serif';
    ctx.fillText(`COIN補正:+${status.coinStage}`, panel.x + 13, panel.y + 12);

    ctx.fillStyle = "rgba(255,255,255,0.78)";
    ctx.font = '700 9px "Trebuchet MS", sans-serif';
    ctx.fillText(`${status.coinCount}/${status.coinThreshold}`, panel.x + 142, panel.y + 22);

    ctx.textAlign = "right";
    ctx.fillStyle = "#ffffff";
    ctx.font = '900 13px "Trebuchet MS", sans-serif';
    ctx.fillText(`${status.remainingSec.toFixed(1)}s`, panel.x + panel.w - 12, panel.y + 12);
    ctx.restore();
  }

  getJudyNickGaugeInfo() {
    if (this.game.myTsum?.id !== "judyNick") {
      return null;
    }
    return this.game.judyNickGaugeManager?.getGaugeInfo?.() || null;
  }

  drawJudyNickSkillButtonGauge(ctx, radius) {
    const gaugeInfo = this.getJudyNickGaugeInfo();
    if (!gaugeInfo) {
      return false;
    }
    const judyRatio = clamp(gaugeInfo.judy?.ratio || 0, 0, 1);
    const nickRatio = clamp(gaugeInfo.nick?.ratio || 0, 0, 1);
    const drawDiagonalClip = (side) => {
      ctx.beginPath();
      if (side === "judy") {
        ctx.moveTo(-radius, -radius);
        ctx.lineTo(radius, -radius);
        ctx.lineTo(-radius, radius);
      } else {
        ctx.moveTo(radius, radius);
        ctx.lineTo(radius, -radius);
        ctx.lineTo(-radius, radius);
      }
      ctx.closePath();
      ctx.clip();
    };
    const drawDiagonalGauge = (side, ratio, colorA, colorB, ready) => {
      if (ratio <= 0) {
        return;
      }
      const fillSize = radius * 2 * ratio;
      const grad = ctx.createLinearGradient(-radius, -radius, radius, radius);
      grad.addColorStop(0, ready ? "#fff5a8" : colorA);
      grad.addColorStop(1, ready ? "#ffbf3d" : colorB);
      ctx.save();
      drawDiagonalClip(side);
      ctx.fillStyle = grad;
      ctx.fillRect(-radius, radius - fillSize, fillSize, fillSize);
      ctx.restore();
    };
    const drawPairBadge = (label, x, y, fill, stroke) => {
      ctx.save();
      ctx.shadowBlur = 5;
      ctx.shadowColor = stroke;
      const badgeGrad = ctx.createRadialGradient(x - 3, y - 4, 2, x, y, 11);
      badgeGrad.addColorStop(0, "#ffffff");
      badgeGrad.addColorStop(1, fill);
      ctx.fillStyle = badgeGrad;
      ctx.strokeStyle = stroke;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y, 10.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.fillStyle = "#1c2240";
      ctx.font = '800 8.5px "Trebuchet MS", sans-serif';
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(label, x, y + 0.5);
      ctx.restore();
    };

    ctx.save();
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.clip();
    drawDiagonalGauge("judy", judyRatio, "#84c4ff", "#366ca8", !!gaugeInfo.judy?.isReady);
    drawDiagonalGauge("nick", nickRatio, "#ffb26a", "#b46221", !!gaugeInfo.nick?.isReady);
    ctx.restore();

    ctx.save();
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.clip();
    const diagonalEdge = radius / Math.SQRT2 - 1;
    ctx.strokeStyle = "rgba(12,14,36,0.72)";
    ctx.lineWidth = 5;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(-diagonalEdge, diagonalEdge);
    ctx.lineTo(diagonalEdge, -diagonalEdge);
    ctx.stroke();
    ctx.strokeStyle = "rgba(255,255,255,0.58)";
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(-diagonalEdge, diagonalEdge);
    ctx.lineTo(diagonalEdge, -diagonalEdge);
    ctx.stroke();
    ctx.restore();

    drawPairBadge("JU", -11, -11, "#9ed4ff", "#4f9dd8");
    drawPairBadge("NI", 11, 11, "#ffc078", "#c57930");
    return true;
  }

  drawBottomHUDReal(ctx) {
    const skillReady = this.game.isSkillReadyForActivation();
    const judyNickGaugeInfo = this.getJudyNickGaugeInfo();
    const skillProgress = !judyNickGaugeInfo && this.game.skillSystem.maxCharge > 0
      ? clamp(this.game.skillSystem.charge / this.game.skillSystem.maxCharge, 0, 1)
      : 0;
    const skillCenterX = SKILL_BUTTON_RECT.x + SKILL_BUTTON_RECT.w * 0.5;
    const skillCenterY = SKILL_BUTTON_RECT.y + SKILL_BUTTON_RECT.h * 0.5;
    const fanCenterX = DECOR_BUTTON_RECT.x + DECOR_BUTTON_RECT.w * 0.5;
    const fanCenterY = DECOR_BUTTON_RECT.y + DECOR_BUTTON_RECT.h * 0.5;
    const skillRadius = SKILL_BUTTON_RECT.w * 0.5;
    const fanRadius = DECOR_BUTTON_RECT.w * 0.5;
    const pulse = skillReady ? 22 + Math.sin(Date.now() * 0.005) * 9 : 12;

    ctx.save();
    const trayGrad = ctx.createLinearGradient(0, 592, 0, HEIGHT);
    trayGrad.addColorStop(0, "rgba(255,255,255,0)");
    trayGrad.addColorStop(0.25, "rgba(111,244,255,0.1)");
    trayGrad.addColorStop(0.56, "rgba(0,128,188,0.26)");
    trayGrad.addColorStop(1, "rgba(0,67,132,0.44)");
    ctx.fillStyle = trayGrad;
    ctx.fillRect(0, 592, WIDTH, HEIGHT - 592);
    ctx.strokeStyle = "rgba(203,255,255,0.24)";
    ctx.lineWidth = 2;
    ctx.shadowBlur = 5;
    ctx.shadowColor = "rgba(131,255,255,0.2)";
    ctx.beginPath();
    ctx.moveTo(-6, 612);
    ctx.quadraticCurveTo(WIDTH * 0.5, 626, WIDTH + 6, 612);
    ctx.stroke();
    ctx.restore();

    ctx.save();
    ctx.translate(skillCenterX, skillCenterY);
    ctx.shadowBlur = skillReady ? pulse : 10;
    ctx.shadowColor = skillReady ? "#fff06f" : "rgba(0,51,113,0.44)";
    const skillGrad = ctx.createLinearGradient(0, -skillRadius, 0, skillRadius);
    skillGrad.addColorStop(0, "#5C92DA");
    skillGrad.addColorStop(0.34, "#2D63B4");
    skillGrad.addColorStop(0.72, "#173D8E");
    skillGrad.addColorStop(1, "#10245E");
    ctx.fillStyle = skillGrad;
    ctx.beginPath();
    ctx.arc(0, 0, skillRadius, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    if (judyNickGaugeInfo) {
      this.drawJudyNickSkillButtonGauge(ctx, skillRadius - 4);
    } else if (skillProgress > 0) {
      const gaugeGrad = ctx.createRadialGradient(-8, -10, 4, 0, 0, skillRadius);
      gaugeGrad.addColorStop(0, skillReady ? "#fff5a8" : "#e8ffff");
      gaugeGrad.addColorStop(1, skillReady ? "#ffbf3d" : "#4fc8ff");
      ctx.fillStyle = gaugeGrad;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, skillRadius - 4, -Math.PI / 2, -Math.PI / 2 + skillProgress * Math.PI * 2);
      ctx.lineTo(0, 0);
      ctx.closePath();
      ctx.fill();
    }
    ctx.strokeStyle = "rgba(255,255,255,0.38)";
    ctx.lineWidth = 3.2;
    ctx.beginPath();
    ctx.arc(0, -skillRadius * 0.36, skillRadius * 0.48, Math.PI * 1.08, Math.PI * 1.92);
    ctx.stroke();
    if (!judyNickGaugeInfo) {
      this.drawCharacterBubble(ctx, this.game.myTsum, 0, 1, skillRadius * 0.64, false);
    }
    ctx.strokeStyle = skillReady ? "rgba(255,242,120,0.72)" : "rgba(203,247,255,0.42)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, 0, skillRadius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([1.5, 3.5]);
    ctx.lineWidth = 1.3;
    ctx.strokeStyle = "rgba(229,255,255,0.65)";
    ctx.beginPath();
    ctx.arc(0, 0, skillRadius - 5, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "rgba(255,255,255,0.46)";
    ctx.font = '700 9px "Trebuchet MS", sans-serif';
    ctx.fillText("[SPACE]", skillCenterX, Math.min(704, skillCenterY + skillRadius + 8));
    if (this.game.namineSkillTimer > 0) {
      ctx.fillStyle = "#fff3dc";
      ctx.font = '700 9px "Trebuchet MS", sans-serif';
      ctx.fillText(`LINK ${this.game.namineSkillTimer.toFixed(1)}s`, skillCenterX, skillCenterY - skillRadius - 10);
    }
    ctx.restore();

    this.drawJudyNickStatusPanel(ctx);

    const feverRect = { x: 99, y: 646, w: 216, h: 34 };
    ctx.save();
    ctx.shadowBlur = 10;
    ctx.shadowOffsetY = 3;
    ctx.shadowColor = this.game.feverSystem.active ? "rgba(255,220,80,0.54)" : "rgba(0,48,105,0.34)";
    makeRoundedRectPath(ctx, feverRect.x, feverRect.y, feverRect.w, feverRect.h, feverRect.h * 0.5);
    const feverBase = ctx.createLinearGradient(feverRect.x, feverRect.y, feverRect.x, feverRect.y + feverRect.h);
    feverBase.addColorStop(0, "rgba(29,119,176,0.96)");
    feverBase.addColorStop(0.42, "rgba(7,71,137,0.96)");
    feverBase.addColorStop(1, "rgba(3,38,88,0.98)");
    ctx.fillStyle = feverBase;
    ctx.fill();
    ctx.shadowBlur = 0;
    const fillWidth = feverRect.w * clamp(this.game.feverSystem.gauge / 100, 0, 1);
    if (fillWidth > 1) {
      const shift = (Date.now() * 0.001) % 1;
      const feverGrad = ctx.createLinearGradient(feverRect.x + shift * 90, feverRect.y, feverRect.x + feverRect.w + shift * 90, feverRect.y);
      feverGrad.addColorStop(0, "#FF7948");
      feverGrad.addColorStop(0.5, "#FFE967");
      feverGrad.addColorStop(1, "#FFA24A");
      makeRoundedRectPath(ctx, feverRect.x, feverRect.y, fillWidth, feverRect.h, feverRect.h * 0.5);
      ctx.fillStyle = feverGrad;
      ctx.fill();
    }
    ctx.strokeStyle = "rgba(193,249,255,0.4)";
    ctx.lineWidth = 2.4;
    makeRoundedRectPath(ctx, feverRect.x, feverRect.y, feverRect.w, feverRect.h, feverRect.h * 0.5);
    ctx.stroke();
    this.drawStitchedRoundedRect(ctx, feverRect.x + 5, feverRect.y + 4, feverRect.w - 10, feverRect.h - 8, (feverRect.h - 8) * 0.5, 0.46);
    ctx.strokeStyle = "rgba(0,32,82,0.3)";
    ctx.lineWidth = 1;
    makeRoundedRectPath(ctx, feverRect.x + 5, feverRect.y + feverRect.h - 9, feverRect.w - 10, 5, 3);
    ctx.stroke();
    const feverScale = this.game.feverSystem.active ? 1 + Math.sin(this.game.elapsed * 8) * 0.06 : 1;
    ctx.translate(WIDTH * 0.5, feverRect.y + feverRect.h * 0.5);
    ctx.scale(feverScale, feverScale);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.shadowBlur = 4;
    ctx.shadowColor = "rgba(0,0,0,0.4)";
    ctx.fillStyle = this.game.feverSystem.active ? "#ffe57a" : "#ffffff";
    ctx.font = '900 15px "Trebuchet MS", sans-serif';
    ctx.fillText("FEVER", 0, 0);
    ctx.restore();

    ctx.save();
    ctx.globalAlpha = this.game.fanCooldown > 0 ? 0.88 : 1;
    drawGlossButton(ctx, fanCenterX - fanRadius, fanCenterY - fanRadius, fanRadius * 2, fanRadius * 2, 24, "#FFF06C", "#EDA000", "rgba(255,255,255,0.68)", this.game.fanPulse > 0 ? "rgba(255,230,128,0.54)" : "rgba(150,80,0,0.26)");
    ctx.restore();
    ctx.save();
    ctx.translate(fanCenterX, fanCenterY);
    ctx.scale(1.14, 1.14);
    ctx.fillStyle = "#ffffff";
    for (let i = 0; i < 4; i += 1) {
      ctx.save();
      ctx.rotate((Math.PI * 0.5 * i) + Math.PI * 0.25);
      ctx.beginPath();
      ctx.moveTo(0, -2);
      ctx.quadraticCurveTo(10, -8, 8, -18);
      ctx.quadraticCurveTo(0, -13, -8, -18);
      ctx.quadraticCurveTo(-10, -8, 0, -2);
      ctx.fill();
      ctx.restore();
    }
    ctx.beginPath();
    ctx.arc(0, 0, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    if (this.game.battleContext?.active || this.game.role === "cpu") {
      return;
    }

    const aiOn = !!this.game.aiAutoPlay;
    this.drawButton(ctx, AI_AUTO_BUTTON_RECT, `AI ${aiOn ? "ON" : "OFF"}`, {
      fill: aiOn ? "#35c987" : "#4d5d76",
      glow: aiOn ? "#8dffd3" : "#6f7f98",
      subtitle: "",
      size: 8,
      alpha: aiOn ? 0.3 : 0.08
    });

    const learningOn = !!this.game.aiLearningMode;
    this.drawButton(ctx, AI_LEARNING_BUTTON_RECT, `LRN ${learningOn ? "ON" : "OFF"}`, {
      fill: learningOn ? "#2b9fd8" : "#435269",
      glow: learningOn ? "#7ee4ff" : "#66748a",
      subtitle: "",
      size: 8,
      alpha: learningOn ? 0.3 : 0.08
    });

    const repeatOn = !!this.game.aiLearningAutoRepeat;
    this.drawButton(ctx, AI_LEARNING_REPEAT_BUTTON_RECT, `REP ${repeatOn ? "ON" : "OFF"}`, {
      fill: repeatOn ? "#38b07b" : "#46556a",
      glow: repeatOn ? "#9fffd3" : "#68778c",
      subtitle: "",
      size: 8,
      alpha: repeatOn ? 0.3 : 0.08
    });

    const strongestOn = !!this.game.strongestModeEnabled;
    this.drawButton(ctx, STRONGEST_MODE_BUTTON_RECT, `最強 ${strongestOn ? "ON" : "OFF"}`, {
      fill: strongestOn ? "#b14dd8" : "#4f4c6d",
      glow: strongestOn ? "#efb8ff" : "#757191",
      subtitle: "",
      size: 8,
      alpha: strongestOn ? 0.3 : 0.08
    });

    ctx.save();
    const stats = this.game.aiLearningStats || {};
    const epsilon = typeof this.game.getAiLearningEpsilon === "function" ? this.game.getAiLearningEpsilon() : 0;
    const qSize = this.game.aiQTable ? Object.keys(this.game.aiQTable).length : 0;
    const autoRepeat = this.game.aiLearningAutoRepeat ? "ON" : "OFF";
    const maxEpisodes = Number.isFinite(this.game.aiLearningMaxEpisodes) ? this.game.aiLearningMaxEpisodes : "INF";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "rgba(255,255,255,0.08)";
    ctx.font = '700 8px "Trebuchet MS", sans-serif';
    ctx.fillText(`EP ${stats.episodes || 0}/${maxEpisodes}  Q ${qSize}  EPS ${epsilon.toFixed(2)}  BEST ${formatNumber(stats.bestScore || 0)}  AUTO ${autoRepeat}`, WIDTH * 0.5, 696);
    ctx.restore();
  }

  drawJudyNickStatusPanel(ctx) {
    const status = this.game.getJudyNickSkillStatus();
    if (!status) {
      return;
    }

    const panel = { x: 88, y: 584, w: 238, h: 34 };
    const countPill = { x: panel.x + panel.w - 74, y: panel.y + 5, w: 64, h: 24 };
    const gauge = { x: panel.x + 12, y: panel.y + 18, w: 138, h: 8 };
    const gaugeFill = gauge.w * clamp(status.remainingRatio, 0, 1);
    const modeColor = status.currentMode === "nick" ? "#8fe7ff" : "#7ce8d9";
    const modeColorDark = status.currentMode === "nick" ? "#5fa7ff" : "#47b7ff";

    ctx.save();
    makeRoundedRectPath(ctx, panel.x, panel.y, panel.w, panel.h, 17);
    ctx.fillStyle = "rgba(18,32,72,0.9)";
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.24)";
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "rgba(255,255,255,0.78)";
    ctx.font = '700 9px "Trebuchet MS", sans-serif';
    ctx.fillText("PAIR TIME", gauge.x, panel.y + 9);

    makeRoundedRectPath(ctx, gauge.x, gauge.y, gauge.w, gauge.h, 4);
    ctx.fillStyle = "rgba(255,255,255,0.12)";
    ctx.fill();
    if (gaugeFill > 1) {
      const grad = ctx.createLinearGradient(gauge.x, gauge.y, gauge.x + gauge.w, gauge.y);
      grad.addColorStop(0, modeColor);
      grad.addColorStop(1, modeColorDark);
      makeRoundedRectPath(ctx, gauge.x, gauge.y, gaugeFill, gauge.h, 4);
      ctx.fillStyle = grad;
      ctx.fill();
    }
    ctx.strokeStyle = "rgba(255,255,255,0.18)";
    ctx.lineWidth = 1;
    makeRoundedRectPath(ctx, gauge.x, gauge.y, gauge.w, gauge.h, 4);
    ctx.stroke();

    ctx.textAlign = "right";
    ctx.fillStyle = "#f3fbff";
    ctx.font = '700 10px "Trebuchet MS", sans-serif';
    ctx.fillText(`${status.remainingSec.toFixed(1)}s`, panel.x + panel.w - 84, panel.y + 9);

    makeRoundedRectPath(ctx, countPill.x, countPill.y, countPill.w, countPill.h, 12);
    ctx.fillStyle = "rgba(255,255,255,0.14)";
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.22)";
    ctx.lineWidth = 1.2;
    ctx.stroke();
    ctx.textAlign = "center";
    ctx.fillStyle = "#fff7d6";
    ctx.font = '800 11px "Trebuchet MS", sans-serif';
    ctx.fillText(status.countLabel, countPill.x + countPill.w * 0.5, countPill.y + countPill.h * 0.5 + 0.5);
    ctx.restore();
  }

  drawComboDisplay(ctx) {
    if (this.game.comboSystem.combo <= 0) {
      return;
    }
    const window = this.game.comboSystem.comboWindowFor(this.game.comboSystem.combo);
    const timerRatio = window > 0 ? clamp(this.game.comboSystem.timer / window, 0, 1) : 1;
    const alpha = this.game.activeItems.combo || this.game.feverSystem.active ? 1 : 0.35 + timerRatio * 0.65;
    const scale = 1 + this.game.comboSystem.pulse * 0.4;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(WIDTH * 0.5, 145);
    ctx.scale(scale, scale);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineJoin = "round";
    ctx.lineWidth = 4;
    ctx.strokeStyle = "rgba(0,0,0,0.82)";
    ctx.fillStyle = "#ffffff";
    ctx.font = '900 32px "Trebuchet MS", sans-serif';
    const text = `COMBO x${this.game.comboSystem.combo}`;
    ctx.strokeText(text, 0, 0);
    ctx.fillText(text, 0, 0);
    ctx.restore();
  }

  drawFeverBanner(ctx) {
    if (this.game.feverSystem.flash > 0) {
      ctx.save();
      ctx.globalAlpha = Math.min(0.4, this.game.feverSystem.flash * 0.4);
      ctx.fillStyle = "rgba(255,220,0,0.4)";
      ctx.fillRect(0, 0, WIDTH, HEIGHT);
      ctx.restore();
    }

    if (this.game.feverSystem.bannerTimer <= 0) {
      return;
    }

    const total = 1.3;
    const elapsed = total - this.game.feverSystem.bannerTimer;
    let y = 350;
    let alpha = 1;
    if (elapsed < 0.4) {
      const t = easeOutBack(elapsed / 0.4);
      y = lerp(500, 350, t);
    } else {
      const t = clamp((elapsed - 0.4) / 0.6, 0, 1);
      alpha = 1 - t;
    }

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(WIDTH * 0.5, y);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = '900 56px "Trebuchet MS", sans-serif';
    ctx.lineJoin = "round";
    ctx.lineWidth = 5;
    ctx.strokeStyle = "#ffffff";
    const grad = ctx.createLinearGradient(-110, 0, 110, 0);
    grad.addColorStop(0, "#ff5b5b");
    grad.addColorStop(0.2, "#ff9f47");
    grad.addColorStop(0.4, "#ffe95f");
    grad.addColorStop(0.6, "#7df07d");
    grad.addColorStop(0.8, "#6ab9ff");
    grad.addColorStop(1, "#af73ff");
    ctx.strokeText("FEVER!", 0, 0);
    ctx.fillStyle = grad;
    ctx.fillText("FEVER!", 0, 0);
    ctx.restore();
  }

  drawGlassPanel(ctx, x, y, w, h, radius = 24, alpha = 0.68) {
    ctx.save();
    makeRoundedRectPath(ctx, x, y, w, h, radius);
    const panelGradient = ctx.createLinearGradient(x, y, x, y + h);
    panelGradient.addColorStop(0, `rgba(255,255,255,${(alpha * 0.22).toFixed(3)})`);
    panelGradient.addColorStop(1, `rgba(7,18,34,${alpha.toFixed(3)})`);
    ctx.fillStyle = panelGradient;
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.16)";
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();
  }

  drawButton(ctx, rect, label, options = {}) {
    const {
      fill = "#4c8ef7",
      glow = fill,
      textColor = "#ffffff",
      alpha = 1,
      subtitle = "",
      disabled = false,
      size = 22
    } = options;

    ctx.save();
    ctx.globalAlpha = disabled ? 0.4 : alpha;
    ctx.shadowBlur = disabled ? 0 : 18;
    ctx.shadowColor = glow;
    const grad = ctx.createLinearGradient(rect.x, rect.y, rect.x, rect.y + rect.h);
    grad.addColorStop(0, "rgba(255,255,255,0.24)");
    grad.addColorStop(0.15, fill);
    grad.addColorStop(1, "rgba(6,17,30,0.9)");
    makeRoundedRectPath(ctx, rect.x, rect.y, rect.w, rect.h, 20);
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = "rgba(255,255,255,0.28)";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = textColor;
    ctx.font = `700 ${size}px "Trebuchet MS", sans-serif`;
    ctx.fillText(label, rect.x + rect.w * 0.5, rect.y + rect.h * 0.47);
    if (subtitle) {
      ctx.globalAlpha *= 0.82;
      ctx.font = '600 11px "Trebuchet MS", sans-serif';
      ctx.fillText(subtitle, rect.x + rect.w * 0.5, rect.y + rect.h - 12);
    }
    ctx.restore();
  }

  drawCharacterBubble(ctx, type, x, y, r, selected, level) {
    ctx.save();
    const pulse = selected ? 1 + Math.sin(this.game.elapsed * 6) * 0.02 : 1;
    const rr = r * pulse;
    ctx.translate(x, y);
    ctx.shadowBlur = selected ? 22 : 10;
    ctx.shadowColor = selected ? type.accent : "rgba(0,0,0,0.22)";
    const grad = ctx.createRadialGradient(-rr * 0.38, -rr * 0.4, rr * 0.18, 0, 0, rr * 1.06);
    grad.addColorStop(0, type.light);
    grad.addColorStop(0.48, type.color);
    grad.addColorStop(1, type.dark);
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(0, 0, rr, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.lineWidth = selected ? 4 : 2;
    ctx.strokeStyle = selected ? "rgba(255,255,255,0.98)" : "rgba(255,255,255,0.24)";
    ctx.stroke();
    const hasArtwork = drawTsumArtwork(ctx, type, 0, 0, rr * 0.92);
    if (!hasArtwork) {
      ctx.font = `${Math.round(rr * 0.98)}px "Segoe UI Emoji", "Apple Color Emoji", sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = "#ffffff";
      ctx.fillText(type.emoji, 0, rr * 0.12);
    }
    if (level != null) {
      ctx.fillStyle = "rgba(7,16,30,0.84)";
      makeRoundedRectPath(ctx, -rr * 0.6, rr * 0.62, rr * 1.2, 18, 9);
      ctx.fill();
      ctx.fillStyle = "#fff2cb";
      ctx.font = '700 11px "Trebuchet MS", sans-serif';
      ctx.fillText(`Lv${level}`, 0, rr * 0.62 + 9.5);
    }
    ctx.restore();
  }

  drawSkillChargeFlights(ctx) {
    if (!Array.isArray(this.game.skillChargeFlights) || this.game.skillChargeFlights.length === 0) {
      return;
    }
    const nowMs = this.game.elapsed * 1000;
    for (const flight of this.game.skillChargeFlights) {
      const t = clamp((nowMs - flight.startTime) / flight.duration, 0, 1);
      const eased = 1 - ((1 - t) ** 3);
      const x = lerp(flight.startX, flight.targetX, eased);
      const y = lerp(flight.startY, flight.targetY, eased) - Math.sin(t * Math.PI) * 18;
      const alpha = 0.95 - t * 0.25;
      ctx.save();
      ctx.globalAlpha = clamp(alpha, 0, 1);
      this.drawCharacterBubble(ctx, flight.tsumType, x, y, 0.4 * 22, false);
      ctx.restore();
    }
  }

  drawSelectionTopBar(ctx) {
    const pills = [
      { x: 16, w: 98, kind: "level", value: "0%" },
      { x: 121, w: 170, kind: "coin", value: formatNumber(this.game.coins) },
      { x: 298, w: 100, kind: "ruby", value: "0" }
    ];

    for (const pill of pills) {
      ctx.save();
      ctx.shadowBlur = 10;
      ctx.shadowOffsetY = 4;
      ctx.shadowColor = "rgba(0,32,76,0.58)";
      makeRoundedRectPath(ctx, pill.x, 14, pill.w, 46, 23);
      const g = ctx.createLinearGradient(0, 14, 0, 60);
      g.addColorStop(0, "#174f7d");
      g.addColorStop(1, "#08355f");
      ctx.fillStyle = g;
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.lineWidth = 4;
      ctx.strokeStyle = "#69eaff";
      ctx.stroke();
      this.drawStitchedRoundedRect(ctx, pill.x + 5, 19, pill.w - 10, 36, 18, 0.66);

      const iconX = pill.x + 23;
      const iconY = 37;
      if (pill.kind === "level") {
        ctx.save();
        ctx.translate(iconX, iconY);
        ctx.fillStyle = "#ffc42e";
        ctx.strokeStyle = "#fff0a3";
        ctx.lineWidth = 2;
        drawStarPath(ctx, 5, 16, 7.5);
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      } else {
        const iconGrad = ctx.createRadialGradient(iconX - 5, iconY - 6, 2, iconX, iconY, 17);
        if (pill.kind === "coin") {
          iconGrad.addColorStop(0, "#fff1a6");
          iconGrad.addColorStop(0.5, "#ffc11f");
          iconGrad.addColorStop(1, "#ec8b00");
        } else {
          iconGrad.addColorStop(0, "#ffc8d5");
          iconGrad.addColorStop(0.48, "#ff6285");
          iconGrad.addColorStop(1, "#d9255c");
        }
        ctx.fillStyle = iconGrad;
        ctx.beginPath();
        ctx.arc(iconX, iconY, 17, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "rgba(255,255,255,0.8)";
        ctx.lineWidth = 2;
        ctx.stroke();
      }

      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = pill.kind === "ruby" ? "#ffffff" : "#7b4300";
      ctx.font = `900 ${pill.kind === "ruby" ? 17 : 15}px "Trebuchet MS", sans-serif`;
      if (pill.kind === "level") {
        ctx.fillText("0", iconX, iconY + 1);
      } else if (pill.kind === "coin") {
        ctx.fillText("C", iconX, iconY + 1);
      } else {
        ctx.fillText("◆", iconX, iconY);
      }

      ctx.textAlign = "left";
      ctx.fillStyle = "#ffffff";
      ctx.font = `900 ${pill.kind === "coin" ? 20 : 18}px "Trebuchet MS", sans-serif`;
      ctx.fillText(pill.value, pill.x + 47, iconY + 1);
      ctx.restore();
    }
  }

  drawSelectionShell(ctx, title, instruction, height = 552) {
    ctx.save();
    ctx.shadowBlur = 18;
    ctx.shadowOffsetY = 8;
    ctx.shadowColor = "rgba(0,36,84,0.58)";
    makeRoundedRectPath(ctx, 14, 74, 386, height, 31);
    const shell = ctx.createLinearGradient(14, 74, 400, 626);
    shell.addColorStop(0, "#16c8ec");
    shell.addColorStop(0.5, "#079dcc");
    shell.addColorStop(1, "#0478af");
    ctx.fillStyle = shell;
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = "#59edff";
    ctx.lineWidth = 5;
    ctx.stroke();
    this.drawStitchedRoundedRect(ctx, 21, 82, 372, height - 15, 25, 0.74);

    ctx.fillStyle = "rgba(248,253,255,0.97)";
    ctx.fillRect(18, 102, 378, 58);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#07527e";
    ctx.font = '900 29px "Trebuchet MS", "Yu Gothic", sans-serif';
    ctx.fillText(title, WIDTH * 0.5, 131);

    makeRoundedRectPath(ctx, 42, 171, 330, 48, 24);
    ctx.fillStyle = "#073b66";
    ctx.fill();
    this.drawStitchedRoundedRect(ctx, 47, 176, 320, 38, 19, 0.6);
    ctx.fillStyle = "#46e5ff";
    ctx.font = '800 18px "Trebuchet MS", "Yu Gothic", sans-serif';
    ctx.fillText(instruction, WIDTH * 0.5, 195);
    ctx.restore();
  }

  drawTitleScreen(ctx) {
    this.drawSelectionTopBar(ctx);
    this.drawSelectionShell(ctx, "キャラ選択", "マイツムを選んでね！", 550);

    const featured = TSUM_TYPES[this.game.selectedMyTsumIndex];

    const charRects = this.game.getTitleCharacterRects();
    const selectable = this.game.getTitleCharacterPageTypes();
    for (let i = 0; i < charRects.length; i += 1) {
      const rect = charRects[i];
      const type = selectable[i];
      const selected = type.id === featured.id;
      this.drawGlassPanel(ctx, rect.x, rect.y, rect.w, rect.h, 18, selected ? 0.34 : 0.72);
      this.drawStitchedRoundedRect(ctx, rect.x + 4, rect.y + 4, rect.w - 8, rect.h - 8, 14, selected ? 0.92 : 0.48);
      if (selected) {
        ctx.save();
        ctx.strokeStyle = "#ffe55e";
        ctx.lineWidth = 3;
        makeRoundedRectPath(ctx, rect.x, rect.y, rect.w, rect.h, 18);
        ctx.stroke();
        ctx.restore();
      }
      this.drawCharacterBubble(ctx, type, rect.x + rect.w * 0.5, rect.y + 25, 20, selected);
      ctx.save();
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = selected ? "#fff49b" : "#ffffff";
      ctx.font = '800 8px "Trebuchet MS", "Yu Gothic", sans-serif';
      const shortName = type.name.length > 8 ? `${type.name.slice(0, 7)}…` : type.name;
      ctx.fillText(shortName, rect.x + rect.w * 0.5, rect.y + 53);
      ctx.restore();
    }

    const page = this.game.getTitleCharacterPage();
    const pageCount = this.game.getTitleCharacterPageCount();
    const pageButtons = this.game.getTitlePageButtonRects();
    this.drawTitlePageArrow(ctx, pageButtons.previous, "left", page > 0);
    this.drawTitlePageArrow(ctx, pageButtons.next, "right", page < pageCount - 1);

    const { minus, plus } = this.game.getLevelButtonRects();
    this.drawGlassPanel(ctx, 34, 366, 346, 58, 20, 0.7);
    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#ffffff";
    ctx.font = '800 14px "Trebuchet MS", "Yu Gothic", sans-serif';
    ctx.fillText("スキルレベル", WIDTH * 0.5, 382);
    ctx.font = '900 23px "Trebuchet MS", sans-serif';
    ctx.fillStyle = "#fff7cb";
    ctx.fillText(`Lv ${this.game.selectedSkillLevel}`, WIDTH * 0.5, 405);
    ctx.restore();
    this.drawButton(ctx, minus, "−", { fill: "#146ca1", size: 25 });
    this.drawButton(ctx, plus, "+", { fill: "#f3a515", glow: "#ffd04a", textColor: "#6e3d00", size: 25 });

    this.drawGlassPanel(ctx, 34, 434, 346, 105, 20, 0.7);
    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#ffffff";
    ctx.font = '900 15px "Trebuchet MS", "Yu Gothic", sans-serif';
    ctx.fillText(featured.name, WIDTH * 0.5, 451);
    ctx.fillStyle = "#53e8ff";
    ctx.font = '700 11px "Trebuchet MS", "Yu Gothic", sans-serif';
    ctx.fillText(`${featured.skillName} ・ ツムスコア ${featured.score}`, WIDTH * 0.5, 468);
    ctx.restore();
    const modeRects = this.game.getTitleModeRects();
    const battleMode = this.game.gameMode === "battle";
    this.drawButton(ctx, modeRects.solo, "ひとりで", {
      fill: battleMode ? "#425b78" : "#168dc4",
      glow: battleMode ? "#5f7894" : "#82ebff",
      size: 13
    });
    this.drawButton(ctx, modeRects.battle, "CPUと対戦", {
      fill: battleMode ? "#e54e75" : "#425b78",
      glow: battleMode ? "#ff9cb0" : "#5f7894",
      size: 13
    });
    if (battleMode) {
      const difficultyRects = this.game.getDifficultyRects();
      const selectedDifficulty = this.game.battleDifficulty || "normal";
      const difficultyLabels = { easy: "かんたん", normal: "ふつう", hard: "むずかしい" };
      for (const difficulty of ["easy", "normal", "hard"]) {
        const selected = difficulty === selectedDifficulty;
        this.drawButton(ctx, difficultyRects[difficulty], difficultyLabels[difficulty], {
          fill: selected ? "#ef9c36" : "#3e5878",
          glow: selected ? "#ffd074" : "#607694",
          size: 10
        });
      }
    }
    ctx.save();
    ctx.fillStyle = "#fff0a0";
    ctx.font = '800 12px "Trebuchet MS", "Yu Gothic", sans-serif';
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(battleMode ? "対戦モードを選択中" : "選んだキャラでアイテム画面へ", WIDTH * 0.5, 600);
    ctx.restore();

    this.drawButton(ctx, this.game.getTitlePlayRect(), "決定", {
      fill: "#f24e70",
      glow: "#ff93a8",
      subtitle: "アイテム選択へ",
      size: 25
    });
    this.drawTsumTsumLogo(ctx);
  }

  drawTitlePageArrow(ctx, rect, direction, enabled) {
    const centerX = rect.x + rect.w * 0.5;
    const centerY = rect.y + rect.h * 0.5;
    ctx.save();
    ctx.globalAlpha = enabled ? 1 : 0.34;
    ctx.shadowBlur = enabled ? 10 : 0;
    ctx.shadowColor = "#fff27a";
    const gradient = ctx.createLinearGradient(rect.x, rect.y, rect.x, rect.y + rect.h);
    gradient.addColorStop(0, enabled ? "#fff26b" : "#78a7bc");
    gradient.addColorStop(0.52, enabled ? "#ffb52f" : "#527a91");
    gradient.addColorStop(1, enabled ? "#e9791c" : "#35566d");
    makeRoundedRectPath(ctx, rect.x, rect.y, rect.w, rect.h, 15);
    ctx.fillStyle = gradient;
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = enabled ? "#fff8ad" : "#a2c3d0";
    ctx.lineWidth = 2.5;
    ctx.stroke();

    ctx.beginPath();
    if (direction === "left") {
      ctx.moveTo(centerX + 6, centerY - 12);
      ctx.lineTo(centerX - 7, centerY);
      ctx.lineTo(centerX + 6, centerY + 12);
    } else {
      ctx.moveTo(centerX - 6, centerY - 12);
      ctx.lineTo(centerX + 7, centerY);
      ctx.lineTo(centerX - 6, centerY + 12);
    }
    ctx.closePath();
    ctx.fillStyle = "#ffffff";
    ctx.fill();
    ctx.strokeStyle = "rgba(113,68,0,0.42)";
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();
  }

  drawItemScreen(ctx) {
    this.drawSelectionTopBar(ctx);
    this.drawSelectionShell(ctx, "アイテムセット", "使用するアイテムを選んでね！", 550);

    const itemRects = this.game.getItemRects();
    const selectedCost = this.game.getSelectedItemCost();
    for (let i = 0; i < itemRects.length; i += 1) {
      const item = ITEM_DEFS[i];
      const rect = itemRects[i];
      const selected = !!this.game.itemSelection[item.key];
      const locked = this.game.isItemLocked(item.key) && !selected;
      const affordable = !locked && (selected || selectedCost + item.cost <= this.game.coins);
      this.drawGlassPanel(ctx, rect.x, rect.y, rect.w, rect.h, 19, affordable ? 0.72 : 0.88);
      this.drawStitchedRoundedRect(ctx, rect.x + 4, rect.y + 4, rect.w - 8, rect.h - 8, 15, selected ? 0.95 : 0.52);
      if (selected) {
        ctx.save();
        ctx.strokeStyle = "#ffe65b";
        ctx.lineWidth = 4;
        makeRoundedRectPath(ctx, rect.x, rect.y, rect.w, rect.h, 19);
        ctx.stroke();
        ctx.restore();
      }
      ctx.save();
      ctx.globalAlpha = affordable ? 1 : locked ? 0.35 : 0.45;
      ctx.font = '700 28px "Segoe UI Emoji", "Apple Color Emoji", sans-serif';
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(item.icon, rect.x + rect.w * 0.5, rect.y + 35);
      ctx.fillStyle = selected ? "#fff39a" : "#ffffff";
      ctx.font = '900 15px "Trebuchet MS", sans-serif';
      ctx.fillText(item.label, rect.x + rect.w * 0.5, rect.y + 70);
      ctx.fillStyle = "#ffdd55";
      ctx.font = '900 11px "Trebuchet MS", sans-serif';
      ctx.fillText(item.cost === 0 ? "FREE" : `${formatNumber(item.cost)} COIN`, rect.x + rect.w * 0.5, rect.y + 92);
      if (selected) {
        ctx.fillStyle = "#ffe55e";
        ctx.font = '900 10px "Trebuchet MS", sans-serif';
        ctx.fillText("選択中", rect.x + rect.w * 0.5, rect.y + 112);
      } else if (locked) {
        ctx.fillStyle = "rgba(255,255,255,0.58)";
        ctx.font = '800 10px "Trebuchet MS", "Yu Gothic", sans-serif';
        ctx.fillText("同時選択不可", rect.x + rect.w * 0.5, rect.y + 112);
      } else if (!affordable) {
        ctx.fillStyle = "rgba(255,255,255,0.55)";
        ctx.font = '800 10px "Trebuchet MS", "Yu Gothic", sans-serif';
        ctx.fillText("コイン不足", rect.x + rect.w * 0.5, rect.y + 112);
      }
      ctx.restore();
    }

    const selectedType = TSUM_TYPES[this.game.selectedMyTsumIndex];
    this.drawGlassPanel(ctx, 34, 486, 346, 70, 20, 0.68);
    this.drawCharacterBubble(ctx, selectedType, 69, 521, 24, true, this.game.selectedSkillLevel);
    ctx.save();
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#ffffff";
    ctx.font = '900 13px "Trebuchet MS", "Yu Gothic", sans-serif';
    ctx.fillText(selectedType.name, 105, 508);
    ctx.fillStyle = "#56e9ff";
    ctx.font = '700 10px "Trebuchet MS", "Yu Gothic", sans-serif';
    ctx.fillText(`スキルLv ${this.game.selectedSkillLevel} ・ ${selectedType.skillName}`, 105, 527);
    ctx.fillStyle = "#fff0a0";
    ctx.font = '800 11px "Trebuchet MS", "Yu Gothic", sans-serif';
    ctx.fillText(`選択中 ${formatNumber(selectedCost)} コイン`, 105, 545);
    ctx.restore();

    this.drawButton(ctx, this.game.getItemsBackRect(), "もどる", {
      fill: "#f0a516",
      glow: "#ffd34e",
      textColor: "#6c3d00",
      subtitle: "キャラ選択",
      size: 19
    });

    this.drawButton(ctx, this.game.getItemsPlayRect(), "スタート", {
      fill: "#f24e70",
      glow: "#ff93a8",
      subtitle: "ゲームをはじめる",
      size: 25,
      disabled: this.game.getSelectedItemCost() > this.game.coins
    });
    this.drawTsumTsumLogo(ctx);
  }

  drawGameScreen(ctx) {
    this.drawDisneyLogo(ctx);
    this.drawFieldShell(ctx);
    this.drawFieldContents(ctx);
    if (this.game.role === "cpu") {
      this.drawCpuStatusFooter(ctx);
    } else {
      this.drawBottomHUDReal(ctx);
    }
    this.drawTopHUDReal(ctx);
    this.drawComboDisplay(ctx);
    this.drawShockwaves(ctx);
    this.drawFloatingTexts(ctx);
    this.drawFeverBanner(ctx);
    this.drawCenterMessages(ctx);
    this.drawCoingainLotteryOverlay(ctx);
    this.drawCoingainLotteryRoulette(ctx);
    this.drawCoingainFloorGauge(ctx);
    this.drawPauseOverlay(ctx);
    this.drawGameOverOverlay(ctx);
  }

  drawCpuStatusFooter(ctx) {
    const skillProgress = this.game.skillSystem.maxCharge > 0
      ? clamp(this.game.skillSystem.charge / this.game.skillSystem.maxCharge, 0, 1)
      : 0;
    const feverProgress = clamp(this.game.feverSystem.gauge / 100, 0, 1);
    this.drawGlassPanel(ctx, 30, 614, WIDTH - 60, 92, 22, 0.58);
    const rows = [
      { label: "SKILL", value: skillProgress, color: "#74cfff", y: 642 },
      { label: "FEVER", value: feverProgress, color: "#ffd95d", y: 679 }
    ];
    for (const row of rows) {
      ctx.save();
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillStyle = "#ffffff";
      ctx.font = '800 11px "Trebuchet MS", sans-serif';
      ctx.fillText(row.label, 48, row.y);
      makeRoundedRectPath(ctx, 104, row.y - 7, 250, 14, 7);
      ctx.fillStyle = "rgba(255,255,255,0.13)";
      ctx.fill();
      if (row.value > 0) {
        makeRoundedRectPath(ctx, 104, row.y - 7, 250 * row.value, 14, 7);
        ctx.fillStyle = row.color;
        ctx.fill();
      }
      ctx.restore();
    }
  }

  drawCoingainLotteryOverlay(ctx) {
    if (!this.game.isCoingainLotteryActive?.()) {
      return;
    }
    ctx.save();
    ctx.fillStyle = "rgba(0,0,0,0.34)";
    ctx.fillRect(FIELD_LEFT, FIELD_TOP, FIELD_RIGHT - FIELD_LEFT, FIELD_HEIGHT);
    ctx.restore();
  }

  drawCoingainLotteryRoulette(ctx) {
    const display = this.game.getCoingainLotteryDisplay?.();
    if (!display || (display.mode !== "roulette" && display.mode !== "result")) {
      return;
    }
    const segments = [
      { type: "allClear", chance: 1, tone: "rainbow" },
      { type: "mini", chance: 3, tone: "gold" },
      { type: "extend", chance: 3, tone: "gold" },
      { type: "glow", chance: 3, tone: "gold" },
      { type: "nonBombClear", chance: 3, tone: "gold" },
      { type: "unlimitedChain", chance: 5, tone: "silver" },
      { type: "largeCenterClear", chance: 5, tone: "silver" },
      { type: "centerClear", chance: 10, tone: "copper" },
      { type: "miss", chance: 67, tone: "gray" }
    ];
    const cx = FIELD_CENTER_X;
    const cy = FIELD_TOP + FIELD_HEIGHT * 0.48;
    const radius = 76;
    const pointerAngle = -Math.PI * 0.5;
    const target = segments.find((segment) => segment.type === display.outcomeType) || segments[segments.length - 1];
    let chanceStart = 0;
    for (const segment of segments) {
      if (segment === target) {
        break;
      }
      chanceStart += segment.chance;
    }
    const targetCenterAngle = pointerAngle + ((chanceStart + target.chance * 0.5) / 100) * Math.PI * 2;
    const finalRotation = pointerAngle - targetCenterAngle;
    const spin = display.mode === "roulette" ? Math.PI * 2 * 4.65 * (1 - easeOutCubic(display.progress)) : 0;
    const rotation = finalRotation + spin;
    const toneColors = {
      gold: ["#fff3a0", "#f4c33d", "#ad7213"],
      silver: ["#f8fbff", "#cbd3df", "#7d8795"],
      copper: ["#ffd39b", "#b87237", "#70411f"],
      gray: ["#c7ccd4", "#818892", "#4e5560"]
    };

    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.38)";
    ctx.shadowBlur = 18;
    ctx.shadowOffsetY = 6;
    const outerGlow = ctx.createRadialGradient(cx, cy, radius * 0.62, cx, cy, radius + 16);
    outerGlow.addColorStop(0, "rgba(255,248,198,0.12)");
    outerGlow.addColorStop(0.72, "rgba(255,224,97,0.34)");
    outerGlow.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = outerGlow;
    ctx.beginPath();
    ctx.arc(cx, cy, radius + 16, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowColor = "transparent";
    ctx.translate(cx, cy);
    ctx.rotate(rotation);

    let start = pointerAngle;
    for (const segment of segments) {
      const end = start + (segment.chance / 100) * Math.PI * 2;
      const gradient = ctx.createRadialGradient(0, 0, radius * 0.18, 0, 0, radius);
      if (segment.tone === "rainbow") {
        gradient.addColorStop(0, "#fff7bd");
        gradient.addColorStop(0.18, "#ff5874");
        gradient.addColorStop(0.36, "#ffd64f");
        gradient.addColorStop(0.54, "#58e27f");
        gradient.addColorStop(0.72, "#4fa5ff");
        gradient.addColorStop(1, "#b55cff");
      } else {
        const colors = toneColors[segment.tone];
        gradient.addColorStop(0, colors[0]);
        gradient.addColorStop(0.58, colors[1]);
        gradient.addColorStop(1, colors[2]);
      }
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, radius, start, end);
      ctx.closePath();
      ctx.fillStyle = gradient;
      ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.54)";
      ctx.lineWidth = 1.5;
      ctx.stroke();
      start = end;
    }

    ctx.beginPath();
    ctx.arc(0, 0, radius + 1, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(255,248,196,0.95)";
    ctx.lineWidth = 5;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 0, radius - 8, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(255,255,255,0.22)";
    ctx.lineWidth = 3;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(0, 0, 23, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(54,40,20,0.9)";
    ctx.fill();
    ctx.strokeStyle = "rgba(255,241,171,0.86)";
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.restore();

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(cx, cy - radius - 18);
    ctx.lineTo(cx - 13, cy - radius + 7);
    ctx.lineTo(cx + 13, cy - radius + 7);
    ctx.closePath();
    ctx.fillStyle = "#fff8c5";
    ctx.fill();
    ctx.strokeStyle = "rgba(88,43,0,0.9)";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx, cy - radius - 14);
    ctx.lineTo(cx, cy - radius + 19);
    ctx.strokeStyle = "#fff8c5";
    ctx.lineWidth = 5;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx, cy - radius - 14);
    ctx.lineTo(cx, cy - radius + 19);
    ctx.strokeStyle = "rgba(88,43,0,0.9)";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
  }

  drawPauseOverlay(ctx) {
    if (!this.game.paused) {
      return;
    }
    ctx.save();
    ctx.fillStyle = "rgba(8,16,36,0.34)";
    ctx.fillRect(FIELD_LEFT, FIELD_TOP, FIELD_RIGHT - FIELD_LEFT, FIELD_HEIGHT);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineJoin = "round";
    ctx.lineWidth = 5;
    ctx.strokeStyle = "rgba(0,0,0,0.72)";
    ctx.fillStyle = "#ffffff";
    ctx.font = '900 34px "Trebuchet MS", sans-serif';
    ctx.strokeText("PAUSED", WIDTH * 0.5, FIELD_CENTER_X - 8);
    ctx.fillText("PAUSED", WIDTH * 0.5, FIELD_CENTER_X - 8);
    ctx.font = '700 14px "Trebuchet MS", sans-serif';
    ctx.lineWidth = 3;
    ctx.strokeText("Tap the pause button to resume", WIDTH * 0.5, FIELD_CENTER_X + 28);
    ctx.fillText("Tap the pause button to resume", WIDTH * 0.5, FIELD_CENTER_X + 28);
    ctx.restore();
  }

  drawGameBoard(ctx) {
    ctx.save();
    const fieldGradient = ctx.createLinearGradient(0, FIELD_TOP, 0, HEIGHT);
    fieldGradient.addColorStop(0, "#183a61");
    fieldGradient.addColorStop(0.46, "#102c4f");
    fieldGradient.addColorStop(1, "#0b1e39");
    makeRoundedRectPath(ctx, 10, FIELD_TOP - 2, WIDTH - 20, HEIGHT - FIELD_TOP - 8, 28);
    ctx.fillStyle = fieldGradient;
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.14)";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();

    ctx.save();
    ctx.globalAlpha = 0.07;
    for (let i = 0; i < 9; i += 1) {
      ctx.beginPath();
      ctx.fillStyle = "rgba(255,255,255,0.16)";
      ctx.arc(46 + i * 42, FIELD_TOP + 48 + (i % 3) * 108, 18 + (i % 2) * 8, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    const orderedTsums = this.game.renderTsums.length ? this.game.renderTsums : this.game.getSortedTsums("bottom");
    for (const tsum of orderedTsums) {
      tsum.draw(ctx, this.game.chainSet.has(tsum.id), this.game.elapsed);
    }
  }

  drawBombs(ctx) {
    for (const bomb of this.game.bombs) {
      bomb.draw(ctx);
    }
  }

  drawChain(ctx) {
    if (!this.game.dragging || this.game.chain.length === 0) {
      return;
    }

    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    if (this.game.chain.length >= 2) {
      ctx.beginPath();
      ctx.moveTo(this.game.chain[0].x, this.game.chain[0].y);
      for (let i = 1; i < this.game.chain.length; i += 1) {
        ctx.lineTo(this.game.chain[i].x, this.game.chain[i].y);
      }
      ctx.strokeStyle = "rgba(255,255,200,0.3)";
      ctx.lineWidth = 14;
      ctx.shadowBlur = 12;
      ctx.shadowColor = "#FFFF88";
      ctx.stroke();

      ctx.shadowBlur = 0;
      ctx.strokeStyle = "rgba(255,255,255,0.9)";
      ctx.lineWidth = 6;
      ctx.stroke();
    }

    ctx.shadowBlur = 10;
    ctx.shadowColor = "rgba(255,255,255,0.95)";
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 3;
    for (const tsum of this.game.chain) {
      ctx.beginPath();
      ctx.arc(tsum.x, tsum.y, tsum.radius + 4, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  drawLiliaSkillOverlay(ctx) {
    const status = this.game.getLiliaSkillStatus?.();
    if (!status?.active) {
      return;
    }
    const bats = status.flying || [];
    ctx.save();

    if (this.game.liliaDebug && bats.length >= 2) {
      ctx.beginPath();
      ctx.moveTo(bats[0].x, bats[0].y);
      for (let index = 1; index < bats.length; index += 1) {
        ctx.lineTo(bats[index].x, bats[index].y);
      }
      if (status.tuning.closeBatLoop && bats.length > 2) {
        ctx.closePath();
      }
      ctx.strokeStyle = "rgba(255,94,194,0.16)";
      ctx.lineWidth = status.tuning.batLineRadius * 2;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.stroke();
    }

    if (bats.length >= 2) {
      ctx.beginPath();
      ctx.moveTo(bats[0].x, bats[0].y);
      for (let index = 1; index < bats.length; index += 1) {
        ctx.lineTo(bats[index].x, bats[index].y);
      }
      if (status.tuning.closeBatLoop && bats.length > 2) {
        ctx.closePath();
      }
      ctx.strokeStyle = "rgba(255,167,226,0.92)";
      ctx.shadowColor = "#ff58be";
      ctx.shadowBlur = 12;
      ctx.lineWidth = 4;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.stroke();
      ctx.shadowBlur = 0;
    }

    for (const bat of bats) {
      if (!bat.virtual) {
        continue;
      }
      ctx.save();
      ctx.translate(bat.x, bat.y);
      ctx.shadowColor = "rgba(255,88,190,0.72)";
      ctx.shadowBlur = 10;
      drawLiliaBat(ctx, TSUM_RADIUS * 0.78, false);
      ctx.restore();
    }

    if (this.game.liliaDebug) {
      ctx.strokeStyle = "rgba(126,255,243,0.7)";
      ctx.fillStyle = "#d8fffb";
      ctx.lineWidth = 1.5;
      ctx.font = '700 10px Consolas, monospace';
      ctx.textAlign = "center";
      for (const bat of bats) {
        ctx.beginPath();
        ctx.moveTo(bat.x, bat.y);
        ctx.lineTo(bat.x + bat.vx * 0.18, bat.y + bat.vy * 0.18);
        ctx.stroke();
        ctx.fillText(String(bat.chainIndex), bat.x, bat.y - 20);
      }
      ctx.strokeStyle = "rgba(255,224,116,0.6)";
      for (const node of status.chainedLilia || []) {
        ctx.beginPath();
        ctx.arc(node.x, node.y, status.tuning.liliaAuraRadius, 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    const gauge = { x: 116, y: FIELD_TOP + 7, w: 182, h: 8 };
    ctx.fillStyle = "rgba(27,12,41,0.7)";
    makeRoundedRectPath(ctx, gauge.x, gauge.y, gauge.w, gauge.h, 4);
    ctx.fill();
    ctx.fillStyle = "#ff78c7";
    makeRoundedRectPath(ctx, gauge.x, gauge.y, gauge.w * status.remainingRatio, gauge.h, 4);
    ctx.fill();

    if (this.game.liliaDebug) {
      const lines = [
        `Lilia Skill Active  ${status.remainingSec.toFixed(2)}s`,
        `Bat Base  ${status.transformedBaseTypeId || "none"}`,
        `Chain  ${status.activeChainType}  len=${status.chainLength}`,
        `Hold ${status.holdTime.toFixed(2)}s  Flying=${status.flyingBatCount}`,
        `Clear line=${status.lineClearCount} aura=${status.auraClearCount} union=${status.unionClearCount}`,
        `Coin correction ${status.coinCorrection >= 0 ? "+" : ""}${status.coinCorrection}`
      ];
      ctx.fillStyle = "rgba(15,7,25,0.78)";
      makeRoundedRectPath(ctx, 8, FIELD_TOP + 20, 284, 78, 7);
      ctx.fill();
      ctx.fillStyle = "#ffd8f0";
      ctx.font = '10px Consolas, monospace';
      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      lines.forEach((line, index) => ctx.fillText(line, 14, FIELD_TOP + 25 + index * 12));
    }
    ctx.restore();
  }

  drawHUD(ctx) {
    this.drawGlassPanel(ctx, 10, 10, WIDTH - 20, HUD_HEIGHT - 18, 28, 0.78);

    ctx.save();
    const feverGlow = this.game.feverSystem.active ? this.game.feverSystem.flash * 0.5 : 0;
    if (feverGlow > 0) {
      ctx.fillStyle = `rgba(255, 236, 132, ${feverGlow.toFixed(3)})`;
      makeRoundedRectPath(ctx, 10, 10, WIDTH - 20, HUD_HEIGHT - 18, 28);
      ctx.fill();
    }
    ctx.restore();

    const myTsum = TSUM_TYPES[this.game.selectedMyTsumIndex];
    this.drawCharacterBubble(ctx, myTsum, 56, 62, 28, true, this.game.selectedSkillLevel);
    ctx.save();
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "rgba(255,255,255,0.88)";
    ctx.font = '700 12px "Trebuchet MS", sans-serif';
    ctx.fillText("SKILL", 18, 30);
    ctx.restore();

    const pipsX = 95;
    const pipsY = 43;
    const pipGap = 11;
    if (!this.getJudyNickGaugeInfo()) {
      for (let i = 0; i < this.game.skillSystem.maxCharge; i += 1) {
        const filled = i < this.game.skillSystem.charge;
        ctx.save();
        ctx.fillStyle = filled ? "#ffe07d" : "rgba(255,255,255,0.18)";
        ctx.beginPath();
        ctx.arc(pipsX + i * pipGap, pipsY, 4.2, 0, Math.PI * 2);
        ctx.fill();
        if (filled) {
          ctx.shadowBlur = 10;
          ctx.shadowColor = "#ffe07d";
          ctx.fill();
        }
        ctx.restore();
      }
    }

    const feedback = this.game.skillButtonFeedback;
    const feedbackStrength = feedback.max > 0 ? feedback.timer / feedback.max : 0;
    const skillRect = { ...SKILL_BUTTON_RECT };
    if (feedback.mode === "not-ready" && feedback.timer > 0) {
      skillRect.x += Math.sin(this.game.elapsed * 60) * 4 * feedbackStrength;
    }
    const skillReady = this.game.isSkillReadyForActivation();
    let skillFill = skillReady ? "#ff8f6b" : "#516888";
    let skillGlow = skillReady ? "#ffc663" : "#516888";
    if (feedback.mode === "ready" && feedback.timer > 0) {
      skillFill = "#f2c861";
      skillGlow = "#ffe7a0";
    } else if (feedback.mode === "not-ready" && feedback.timer > 0) {
      skillFill = "#d65d65";
      skillGlow = "#ff9d9d";
    }

    this.drawButton(ctx, skillRect, "SKILL", {
      fill: skillFill,
      glow: skillGlow,
      subtitle: this.game.skillSystem.displayName,
      size: 22,
      alpha: skillReady ? 1 : 0.84
    });
    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "rgba(255,255,255,0.72)";
    ctx.font = '700 11px "Trebuchet MS", sans-serif';
    ctx.fillText("[SPACE]", skillRect.x + skillRect.w * 0.5, skillRect.y + skillRect.h + 14);
    if (this.game.namineSkillTimer > 0) {
      ctx.fillStyle = "#fff0d5";
      ctx.font = '700 10px "Trebuchet MS", sans-serif';
      ctx.fillText(`LINK ${this.game.namineSkillTimer.toFixed(1)}s`, skillRect.x + skillRect.w * 0.5, skillRect.y - 10);
    }
    ctx.restore();

    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#ffffff";
    ctx.font = '700 12px "Trebuchet MS", sans-serif';
    ctx.fillText("SCORE", WIDTH * 0.5, 24);
    ctx.font = '800 28px "Trebuchet MS", sans-serif';
    ctx.fillStyle = "#fff6d1";
    ctx.fillText(formatNumber(this.game.displayedScore), WIDTH * 0.5, 54);
    const comboScale = 1 + this.game.comboSystem.pulse * 0.18;
    ctx.translate(WIDTH * 0.5, 96);
    ctx.scale(comboScale, comboScale);
    ctx.fillStyle = "#ffffff";
    ctx.font = '800 24px "Trebuchet MS", sans-serif';
    ctx.fillText(`COMBO x ${this.game.comboSystem.combo}`, 0, 0);
    ctx.restore();

    ctx.save();
    const timerX = WIDTH - 62;
    const timerY = 76;
    const timerRadius = 36;
    const timerRatio = clamp(this.game.timeRemaining / this.game.gameDuration, 0, 1);
    ctx.lineWidth = 8;
    ctx.strokeStyle = "rgba(255,255,255,0.12)";
    ctx.beginPath();
    ctx.arc(timerX, timerY, timerRadius, -Math.PI * 0.5, Math.PI * 1.5);
    ctx.stroke();
    const timerColor = this.game.timeRemaining <= 10 ? "#ff7a6d" : "#7ae1ff";
    ctx.strokeStyle = timerColor;
    ctx.shadowBlur = 16;
    ctx.shadowColor = timerColor;
    ctx.beginPath();
    ctx.arc(timerX, timerY, timerRadius, -Math.PI * 0.5, -Math.PI * 0.5 + Math.PI * 2 * timerRatio);
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.fillStyle = "#ffffff";
    ctx.font = '800 14px "Trebuchet MS", sans-serif';
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(`${Math.ceil(this.game.timeRemaining)}`, timerX, timerY - 2);
    ctx.font = '600 11px "Trebuchet MS", sans-serif';
    ctx.fillText("TIME", timerX, timerY + 18);
    ctx.restore();

    ctx.save();
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#ffd66e";
    ctx.font = '700 16px "Trebuchet MS", sans-serif';
    ctx.fillText(`COIN ${formatNumber(this.game.coins + this.game.pendingCoinsEstimate())}`, WIDTH - 18, 28);
    ctx.restore();

    const gaugeRect = { x: 20, y: 176, w: WIDTH - 40, h: 22 };
    ctx.save();
    makeRoundedRectPath(ctx, gaugeRect.x, gaugeRect.y, gaugeRect.w, gaugeRect.h, 11);
    ctx.fillStyle = "rgba(255,255,255,0.13)";
    ctx.fill();
    const fillW = gaugeRect.w * clamp(this.game.feverSystem.gauge / 100, 0, 1);
    if (fillW > 2) {
      const feverGradient = ctx.createLinearGradient(gaugeRect.x, gaugeRect.y, gaugeRect.x + gaugeRect.w, gaugeRect.y);
      feverGradient.addColorStop(0, this.game.feverSystem.active ? "#ffe77f" : "#53e4ff");
      feverGradient.addColorStop(0.4, this.game.feverSystem.active ? "#ff9d5f" : "#7fe99a");
      feverGradient.addColorStop(0.7, this.game.feverSystem.active ? "#ff6fc8" : "#f5db77");
      feverGradient.addColorStop(1, this.game.feverSystem.active ? "#8d7dff" : "#ff9966");
      makeRoundedRectPath(ctx, gaugeRect.x, gaugeRect.y, fillW, gaugeRect.h, 11);
      ctx.fillStyle = feverGradient;
      ctx.fill();
    }
    ctx.strokeStyle = "rgba(255,255,255,0.24)";
    ctx.lineWidth = 2;
    makeRoundedRectPath(ctx, gaugeRect.x, gaugeRect.y, gaugeRect.w, gaugeRect.h, 11);
    ctx.stroke();
    ctx.fillStyle = "#ffffff";
    ctx.font = '700 11px "Trebuchet MS", sans-serif';
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(this.game.feverSystem.active ? "FEVER TIME" : "FEVER GAUGE", gaugeRect.x + 10, gaugeRect.y + gaugeRect.h * 0.5);
    ctx.restore();
  }

  drawFloatingTexts(ctx) {
    for (const text of this.game.floatingTexts) {
      ctx.save();
      ctx.globalAlpha = text.alpha;
      ctx.fillStyle = text.color;
      ctx.font = `900 ${text.size}px "Trebuchet MS", sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.lineJoin = "round";
      ctx.lineWidth = Math.max(2, text.size * 0.16);
      ctx.strokeStyle = "rgba(0,0,0,0.82)";
      ctx.strokeText(text.text, text.x, text.y);
      ctx.fillText(text.text, text.x, text.y);
      ctx.restore();
    }
  }

  drawShockwaves(ctx) {
    for (const wave of this.game.shockwaves) {
      ctx.save();
      ctx.globalAlpha = wave.alpha;
      ctx.strokeStyle = wave.color;
      ctx.lineWidth = wave.lineWidth;
      ctx.shadowBlur = 18;
      ctx.shadowColor = wave.color;
      ctx.beginPath();
      ctx.arc(wave.x, wave.y, wave.radius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }

  drawCenterMessages(ctx) {
    for (const msg of this.game.centerMessages) {
      ctx.save();
      ctx.globalAlpha = msg.alpha;
      ctx.translate(msg.x, msg.y);
      ctx.scale(msg.scale, msg.scale);
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.shadowBlur = 24;
      ctx.shadowColor = msg.color;
      ctx.fillStyle = msg.color;
      ctx.font = '900 46px "Trebuchet MS", sans-serif';
      ctx.fillText(msg.text, 0, 0);
      ctx.restore();
    }
  }

  drawGameOverOverlay(ctx) {
    if (!this.game.timeUp || this.game.state !== "playing") {
      return;
    }
    ctx.save();
    ctx.globalAlpha = 0.18 + Math.sin(this.game.elapsed * 8) * 0.04;
    ctx.fillStyle = "#ffffff";
    ctx.font = '900 44px "Trebuchet MS", sans-serif';
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("TIME UP", WIDTH * 0.5, FIELD_TOP + FIELD_HEIGHT * 0.5);
    ctx.restore();
  }

  drawResultScreen(ctx) {
    if (this.game.battleStats && this.game.role === "player") {
      this.drawBattleResultScreen(ctx);
      return;
    }
    this.drawGlassPanel(ctx, 18, 16, 378, 704, 30, 0.76);
    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#ffffff";
    ctx.font = '900 34px "Trebuchet MS", sans-serif';
    ctx.fillText("RESULT", WIDTH * 0.5, 56);
    ctx.font = '600 13px "Trebuchet MS", sans-serif';
    ctx.fillStyle = "rgba(255,255,255,0.76)";
    ctx.fillText("One more run is only a tap away", WIDTH * 0.5, 84);
    ctx.restore();

    this.drawGlassPanel(ctx, 38, 110, 338, 134, 26, 0.52);
    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#fff4c9";
    ctx.font = '700 14px "Trebuchet MS", sans-serif';
    ctx.fillText("FINAL SCORE", WIDTH * 0.5, 138);
    ctx.font = '900 38px "Trebuchet MS", sans-serif';
    ctx.fillStyle = "#ffffff";
    ctx.fillText(formatNumber(this.game.resultStats.finalScore), WIDTH * 0.5, 186);
    ctx.font = '600 12px "Trebuchet MS", sans-serif';
    ctx.fillStyle = "rgba(255,255,255,0.72)";
    const scoreBoostText = this.game.activeItems.score ? " (+Score item applied)" : "";
    ctx.fillText(`${this.game.resultStats.scoreBaseText}${scoreBoostText}`, WIDTH * 0.5, 220);
    ctx.restore();

    this.drawGlassPanel(ctx, 38, 266, 338, 256, 26, 0.58);
    const stats = [
      { label: "Coins Earned", value: `${formatNumber(this.game.resultStats.finalCoins)}${this.game.resultStats.coinMultiplier > 1 ? `  x${this.game.resultStats.coinMultiplier.toFixed(1)}` : ""}`, color: "#ffd66e" },
      { label: "Max Combo", value: `x${formatNumber(this.game.resultStats.maxCombo)}`, color: "#ffffff" },
      { label: "Fever Count", value: String(this.game.resultStats.feverCount), color: "#ffef99" },
      { label: "EXP Gained", value: formatNumber(this.game.resultStats.exp), color: "#9fd5ff" },
      { label: "Tsums Cleared", value: formatNumber(this.game.resultStats.totalCleared), color: "#c6ffcf" }
    ];
    for (let i = 0; i < stats.length; i += 1) {
      const y = 304 + i * 44;
      ctx.save();
      ctx.fillStyle = "rgba(255,255,255,0.08)";
      ctx.fillRect(62, y - 16, 290, 32);
      ctx.fillStyle = "rgba(255,255,255,0.8)";
      ctx.font = '700 14px "Trebuchet MS", sans-serif';
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillText(stats[i].label, 76, y);
      ctx.fillStyle = stats[i].color;
      ctx.font = '800 20px "Trebuchet MS", sans-serif';
      ctx.textAlign = "right";
      ctx.fillText(stats[i].value, 338, y);
      ctx.restore();
    }

    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "rgba(255,255,255,0.76)";
    ctx.font = '600 12px "Trebuchet MS", sans-serif';
    ctx.fillText(`Coin Bank: ${formatNumber(this.game.coins)}`, WIDTH * 0.5, 546);
    ctx.fillText(`Selected items cost: ${formatNumber(this.game.resultStats.itemCost)}`, WIDTH * 0.5, 566);
    ctx.restore();

    this.drawButton(ctx, this.game.getResultRetryRect(), "PLAY AGAIN", {
      fill: "#ff7f67",
      glow: "#ffba5b",
      subtitle: "Back to items"
    });
    this.drawButton(ctx, this.game.getResultTitleRect(), "TITLE", {
      fill: "#3e618f",
      subtitle: "Character select",
      size: 22
    });
  }

  drawBattleResultScreen(ctx) {
    const battle = this.game.battleStats;
    const outcomeLabels = {
      win: { title: "VICTORY!", color: "#8dffd3" },
      loss: { title: "DEFEAT", color: "#ff9baa" },
      draw: { title: "DRAW", color: "#fff09a" }
    };
    const outcome = outcomeLabels[battle.outcome] || outcomeLabels.draw;
    const difficulty = String(battle.difficulty || "normal").toUpperCase();
    const adjustment = battle.adaptiveMultiplier < 1
      ? "CPU SPEED +10%"
      : battle.adaptiveMultiplier > 1
        ? "CPU SPEED -10%"
        : "NO ADJUSTMENT";

    this.drawGlassPanel(ctx, 18, 16, 378, 704, 30, 0.78);
    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.shadowBlur = 20;
    ctx.shadowColor = outcome.color;
    ctx.fillStyle = outcome.color;
    ctx.font = '900 42px "Trebuchet MS", sans-serif';
    ctx.fillText(outcome.title, WIDTH * 0.5, 72);
    ctx.shadowBlur = 0;
    ctx.fillStyle = "rgba(255,255,255,0.78)";
    ctx.font = '700 13px "Trebuchet MS", sans-serif';
    ctx.fillText(`VS CPU / ${difficulty} / ${adjustment}`, WIDTH * 0.5, 108);
    ctx.restore();

    this.drawGlassPanel(ctx, 38, 138, 338, 178, 26, 0.54);
    const scoreRows = [
      { label: "PLAYER", value: battle.playerScore, color: "#8dffd3", y: 184 },
      { label: "CPU", value: battle.cpuScore, color: "#ffb0bc", y: 246 }
    ];
    for (const row of scoreRows) {
      ctx.save();
      ctx.textBaseline = "middle";
      ctx.textAlign = "left";
      ctx.fillStyle = "rgba(255,255,255,0.74)";
      ctx.font = '800 15px "Trebuchet MS", sans-serif';
      ctx.fillText(row.label, 68, row.y);
      ctx.textAlign = "right";
      ctx.fillStyle = row.color;
      ctx.font = '900 30px "Trebuchet MS", sans-serif';
      ctx.fillText(formatNumber(row.value), 346, row.y);
      ctx.restore();
    }
    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#ffffff";
    ctx.font = '800 14px "Trebuchet MS", sans-serif';
    const diff = battle.scoreDifference || 0;
    ctx.fillText(`SCORE DIFF ${diff >= 0 ? "+" : "-"}${formatNumber(Math.abs(diff))}`, WIDTH * 0.5, 292);
    ctx.restore();

    this.drawGlassPanel(ctx, 38, 340, 338, 178, 26, 0.56);
    const record = battle.record || {};
    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#ffd974";
    ctx.font = '800 15px "Trebuchet MS", sans-serif';
    ctx.fillText("WIN BONUS", WIDTH * 0.5, 376);
    ctx.fillStyle = battle.bonus > 0 ? "#fff5a8" : "rgba(255,255,255,0.65)";
    ctx.font = '900 34px "Trebuchet MS", sans-serif';
    ctx.fillText(`+${formatNumber(battle.bonus)} COINS`, WIDTH * 0.5, 416);
    ctx.fillStyle = "rgba(255,255,255,0.78)";
    ctx.font = '700 14px "Trebuchet MS", sans-serif';
    ctx.fillText(`Record  ${record.wins || 0}W  ${record.losses || 0}L  ${record.draws || 0}D`, WIDTH * 0.5, 464);
    ctx.fillText(`Win streak: ${record.streak || 0}   Coin Bank: ${formatNumber(this.game.coins)}`, WIDTH * 0.5, 492);
    ctx.restore();

    this.drawButton(ctx, this.game.getResultRetryRect(), "REMATCH", {
      fill: "#ff7f67",
      glow: "#ffba5b",
      subtitle: "Back to items"
    });
    this.drawButton(ctx, this.game.getResultTitleRect(), "TITLE", {
      fill: "#3e618f",
      subtitle: "Character select",
      size: 22
    });
  }
}
