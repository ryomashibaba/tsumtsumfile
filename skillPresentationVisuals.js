import {
  WIDTH,
  FIELD_TOP,
  FIELD_BOTTOM,
  FIELD_CENTER_X,
  FIELD_CENTER_Y,
  TSUM_TYPES,
  clamp,
  lerp,
  easeOutCubic,
  easeOutBack,
  drawStarPath
} from './config.js?v=skill-visuals-1';
import { drawTsumArtwork } from './tsumImages.js?v=render-quality-1';
import { drawLiliaBat } from './lilia.js?v=skill-visuals-1';

const FIELD_HEIGHT = FIELD_BOTTOM - FIELD_TOP;
const CENTER_Y = (FIELD_TOP + FIELD_BOTTOM) * 0.5;
let activeParticleScale = 1;

function scaledEffectCount(count, minimum = 1) {
  return Math.max(minimum, Math.round(count * activeParticleScale));
}

export const SKILL_VISUAL_TIMELINES = Object.freeze({
  coronationElsa: Object.freeze({ presentation: [[100, 'dim'], [700, 'hero'], [850, 'crossfade'], [1500, 'coronation'], [1750, 'finish']] }),
  captainLightyear: Object.freeze({ presentation: [[150, 'dim'], [850, 'hero'], [1050, 'flash'], [1850, 'aim'], [2080, 'finish']], finalClear: [[120, 'laser'], [350, 'blast'], [570, 'fragments']] }),
  namine: Object.freeze({ presentation: [[200, 'softFade'], [900, 'hero'], [1400, 'whiteout'], [2400, 'whiteRoom'], [2900, 'diamonds'], [3170, 'finish']], skillEnd: [[90, 'silhouetteIn'], [160, 'hold'], [270, 'restore']] }),
  gaston: Object.freeze({ presentation: [[150, 'dim'], [900, 'hero'], [1200, 'stage'], [1800, 'poseA'], [2400, 'poseB'], [3000, 'poseC'], [3560, 'finish']], initialClear: [[55, 'line'], [110, 'flash'], [160, 'shockwave']] }),
  guidingMoana: Object.freeze({ presentation: [[150, 'waterDim'], [850, 'hero'], [1100, 'crossfade'], [1650, 'pose'], [2050, 'hair'], [2380, 'whiteout']], initialClear: [[180, 'circle'], [420, 'targets'], [620, 'shockwave'], [790, 'particles']], specialBombClear: [[150, 'circle'], [330, 'targets'], [500, 'shockwave'], [670, 'particles']] }),
  perfumeAlice: Object.freeze({ presentation: [[200, 'zoom'], [750, 'hero'], [1000, 'slide'], [1700, 'bottle'], [2050, 'glow'], [2750, 'garden'], [3090, 'finish']], skillEnd: [[180, 'targets'], [520, 'smoke'], [770, 'particles']] }),
  jamilViper: Object.freeze({ presentation: [[150, 'dim'], [750, 'hero'], [1050, 'palace'], [2100, 'sway'], [2550, 'afterimages'], [2820, 'finish']], skillEnd: [[150, 'centerGlow'], [360, 'blast'], [770, 'particles']] }),
  snowQueenElsa: Object.freeze({ presentation: [[150, 'snowDim'], [850, 'hero'], [1100, 'dissolve'], [1800, 'landscape'], [2200, 'centerTower'], [2650, 'sideTowers'], [2950, 'aura'], [3160, 'finish']] }),
  liliaVanrouge: Object.freeze({ presentation: [[200, 'dim'], [850, 'hero'], [1100, 'castle'], [2200, 'bats'], [2500, 'colorShift'], [2850, 'rings'], [3150, 'dissolve'], [3360, 'burst']], skillEnd: [[160, 'flash'], [380, 'orbs'], [520, 'fragments']] }),
  judyNick: Object.freeze({ presentation: [[100, 'dim'], [900, 'hero'], [1200, 'board'], [2350, 'pair'], [2720, 'wave'], [2920, 'finish']] })
});

function timelineFor(skillId, kind) {
  return SKILL_VISUAL_TIMELINES[skillId]?.[kind] || null;
}

export function resolveSkillVisualPhase(skillId, kind, elapsedMs, durationMs) {
  const duration = Math.max(0, Number(durationMs) || 0);
  const elapsed = clamp(Number(elapsedMs) || 0, 0, duration);
  const timeline = timelineFor(skillId, kind);
  if (!timeline?.length) {
    return { name: 'unknown', index: 0, startMs: 0, endMs: duration, progress: duration ? elapsed / duration : 1, overallProgress: duration ? elapsed / duration : 1 };
  }
  let startMs = 0;
  for (let index = 0; index < timeline.length; index += 1) {
    const [rawEndMs, name] = timeline[index];
    const endMs = index === timeline.length - 1 ? duration : Math.min(duration, rawEndMs);
    if (elapsed < endMs || index === timeline.length - 1) {
      return {
        name,
        index,
        startMs,
        endMs,
        progress: endMs > startMs ? clamp((elapsed - startMs) / (endMs - startMs), 0, 1) : 1,
        overallProgress: duration ? elapsed / duration : 1
      };
    }
    startMs = endMs;
  }
  return { name: timeline.at(-1)[1], index: timeline.length - 1, startMs: duration, endMs: duration, progress: 1, overallProgress: 1 };
}

function smooth(value) {
  const t = clamp(value, 0, 1);
  return t * t * (3 - 2 * t);
}

function fadeWindow(elapsedMs, inStart, inEnd, outStart, outEnd) {
  return smooth((elapsedMs - inStart) / Math.max(1, inEnd - inStart)) * (1 - smooth((elapsedMs - outStart) / Math.max(1, outEnd - outStart)));
}

function hashString(value) {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function seededUnit(seed, index, salt = 0) {
  let value = (seed + Math.imul(index + 1, 0x9e3779b1) + Math.imul(salt + 1, 0x85ebca6b)) >>> 0;
  value ^= value >>> 16;
  value = Math.imul(value, 0x7feb352d);
  value ^= value >>> 15;
  value = Math.imul(value, 0x846ca68b);
  value ^= value >>> 16;
  return (value >>> 0) / 4294967296;
}

function visualSeed(state) {
  return hashString(`${state.skillId}|${state.kind}|${state.sequenceId || 0}`);
}

function getType(id) {
  return TSUM_TYPES.find((entry) => entry.id === id) || null;
}

function colorWithAlpha(color, alpha) {
  if (/^#[0-9a-f]{6}$/i.test(color)) {
    const value = Number.parseInt(color.slice(1), 16);
    return `rgba(${(value >> 16) & 255},${(value >> 8) & 255},${value & 255},${alpha})`;
  }
  const channels = String(color).match(/[\d.]+/g);
  if (channels?.length >= 3) {
    return `rgba(${channels[0]},${channels[1]},${channels[2]},${alpha})`;
  }
  return `rgba(255,255,255,${alpha})`;
}

function clipField(ctx) {
  ctx.beginPath();
  ctx.rect(0, FIELD_TOP, WIDTH, FIELD_HEIGHT);
  ctx.clip();
}

export function drawScreenDim(ctx, color = 'rgba(3,8,25,0.82)', alpha = 1) {
  ctx.save();
  ctx.globalAlpha = clamp(alpha, 0, 1);
  ctx.fillStyle = color;
  ctx.fillRect(0, FIELD_TOP, WIDTH, FIELD_HEIGHT);
  ctx.restore();
}

export function drawBoardTint(ctx, color, alpha = 0.5) {
  ctx.save();
  ctx.globalAlpha = clamp(alpha, 0, 1);
  ctx.fillStyle = color;
  ctx.fillRect(0, FIELD_TOP, WIDTH, FIELD_HEIGHT);
  ctx.restore();
}

export function drawRadialGlow(ctx, x, y, radius, color, alpha = 1) {
  ctx.save();
  ctx.globalAlpha = clamp(alpha, 0, 1);
  const gradient = ctx.createRadialGradient(x, y, 0, x, y, Math.max(1, radius));
  gradient.addColorStop(0, color);
  gradient.addColorStop(0.42, colorWithAlpha(color, 0.35));
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

export function drawRainbowBurst(ctx, x, y, radius, colors, rotation = 0, alpha = 1) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rotation);
  ctx.globalAlpha = clamp(alpha, 0, 1);
  const count = scaledEffectCount(28);
  for (let index = 0; index < count; index += 1) {
    const angle = (index / count) * Math.PI * 2;
    const half = Math.PI / count * 0.72;
    ctx.fillStyle = colors[index % colors.length];
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, radius, angle - half, angle + half);
    ctx.closePath();
    ctx.fill();
  }
  const core = ctx.createRadialGradient(0, 0, 0, 0, 0, radius * 0.65);
  core.addColorStop(0, 'rgba(255,255,255,0.95)');
  core.addColorStop(0.3, 'rgba(255,255,255,0.35)');
  core.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = core;
  ctx.beginPath();
  ctx.arc(0, 0, radius * 0.68, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

export function drawCharacterZoom(ctx, type, x, y, radius, progress, options = {}) {
  const p = clamp(progress, 0, 1);
  const scale = p < 0.72
    ? lerp(options.startScale ?? 0.55, options.overshootScale ?? 1.1, easeOutBack(p / 0.72))
    : lerp(options.overshootScale ?? 1.1, options.endScale ?? 1, smooth((p - 0.72) / 0.28));
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  ctx.globalAlpha = options.alpha ?? 1;
  ctx.shadowBlur = options.shadowBlur ?? 24;
  ctx.shadowColor = options.glow || type?.accent || '#ffffff';
  drawTsumArtwork(ctx, type, 0, 0, radius, { fit: 'contain' });
  ctx.restore();
}

export function drawWhiteFlash(ctx, alpha) {
  ctx.save();
  ctx.globalAlpha = clamp(alpha, 0, 1);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, FIELD_TOP, WIDTH, FIELD_HEIGHT);
  ctx.restore();
}

export function drawParticleField(ctx, state, options = {}) {
  const count = scaledEffectCount(clamp(options.count ?? 42, 0, 80), 0);
  const seed = visualSeed(state) ^ hashString(options.key || 'particles');
  const elapsedSec = state.elapsedMs / 1000;
  const colors = options.colors || ['#ffffff'];
  ctx.save();
  ctx.globalCompositeOperation = options.composite || 'source-over';
  for (let index = 0; index < count; index += 1) {
    const unitX = seededUnit(seed, index, 1);
    const unitY = seededUnit(seed, index, 2);
    const speed = lerp(options.minSpeed ?? 12, options.maxSpeed ?? 52, seededUnit(seed, index, 3));
    const direction = options.direction || 'up';
    const travel = elapsedSec * speed + seededUnit(seed, index, 4) * FIELD_HEIGHT;
    const x = options.centerX == null
      ? unitX * WIDTH
      : options.centerX + (unitX - 0.5) * (options.spreadX ?? WIDTH);
    let y = options.centerY == null ? FIELD_TOP + unitY * FIELD_HEIGHT : options.centerY + (unitY - 0.5) * (options.spreadY ?? FIELD_HEIGHT);
    let px = x;
    if (direction === 'up') y = FIELD_BOTTOM - (travel % FIELD_HEIGHT);
    if (direction === 'down') y = FIELD_TOP + (travel % FIELD_HEIGHT);
    if (direction === 'burst') {
      const angle = seededUnit(seed, index, 5) * Math.PI * 2;
      const distance = (options.radius ?? 150) * clamp(options.progress ?? 1, 0, 1) * lerp(0.45, 1, seededUnit(seed, index, 6));
      px = (options.centerX ?? FIELD_CENTER_X) + Math.cos(angle) * distance;
      y = (options.centerY ?? FIELD_CENTER_Y) + Math.sin(angle) * distance;
    }
    const radius = lerp(options.minRadius ?? 1.2, options.maxRadius ?? 4.2, seededUnit(seed, index, 7));
    ctx.globalAlpha = (options.alpha ?? 0.8) * lerp(0.45, 1, seededUnit(seed, index, 8));
    ctx.fillStyle = colors[index % colors.length];
    if (options.shape === 'diamond') {
      ctx.save();
      ctx.translate(px, y);
      ctx.rotate(Math.PI * 0.25);
      ctx.fillRect(-radius, -radius, radius * 2, radius * 2);
      ctx.restore();
    } else if (options.shape === 'star') {
      ctx.save();
      ctx.translate(px, y);
      drawStarPath(ctx, 5, radius * 2, radius * 0.75);
      ctx.fill();
      ctx.restore();
    } else {
      ctx.beginPath();
      ctx.arc(px, y, radius, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

export function drawSoftSmoke(ctx, state, x, y, progress, colors = ['rgba(255,255,255,0.7)'], count = 24) {
  const seed = visualSeed(state) ^ hashString('smoke');
  ctx.save();
  for (let index = 0; index < scaledEffectCount(Math.min(48, count), 0); index += 1) {
    const angle = seededUnit(seed, index, 1) * Math.PI * 2;
    const spread = lerp(12, 110, progress) * lerp(0.35, 1, seededUnit(seed, index, 2));
    const radius = lerp(8, 26, seededUnit(seed, index, 3)) * lerp(0.55, 1.2, progress);
    ctx.globalAlpha = (1 - progress * 0.55) * lerp(0.25, 0.7, seededUnit(seed, index, 4));
    ctx.fillStyle = colors[index % colors.length];
    ctx.beginPath();
    ctx.arc(x + Math.cos(angle) * spread, y + Math.sin(angle) * spread - progress * 28, radius, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

export function drawSpeedLines(ctx, color, progress, count = 24) {
  count = scaledEffectCount(count, 0);
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineCap = 'round';
  for (let index = 0; index < count; index += 1) {
    const y = FIELD_TOP + 18 + (index / count) * (FIELD_HEIGHT - 36);
    const offset = ((progress * 480 + index * 47) % (WIDTH + 180)) - 180;
    ctx.globalAlpha = 0.24 + (index % 4) * 0.1;
    ctx.lineWidth = 1 + (index % 3);
    ctx.beginPath();
    ctx.moveTo(offset, y);
    ctx.lineTo(offset + 92 + (index % 5) * 18, y);
    ctx.stroke();
  }
  ctx.restore();
}

export function drawScreenWipe(ctx, color, progress, reverse = false) {
  ctx.save();
  ctx.fillStyle = color;
  const width = WIDTH * easeOutCubic(clamp(progress, 0, 1));
  ctx.fillRect(reverse ? WIDTH - width : 0, FIELD_TOP, width, FIELD_HEIGHT);
  ctx.restore();
}

export function drawVisualOnlyTsumSilhouettes(ctx, game, options = {}) {
  const targets = new Set(options.targetIds || []);
  const nodes = game?.renderBodies?.length ? game.renderBodies : game?.tsums || [];
  ctx.save();
  ctx.fillStyle = options.color || '#ffffff';
  ctx.strokeStyle = options.stroke || 'rgba(255,255,255,0.75)';
  ctx.lineWidth = 2;
  for (const node of nodes) {
    if (!node || node.isBomb || node.dead || (targets.size && !targets.has(node.id))) continue;
    const radius = Math.max(5, (node.radius || 25) * (options.scale || 1));
    ctx.globalAlpha = options.alpha ?? 0.68;
    ctx.beginPath();
    ctx.arc(node.x, node.y, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
}

export function drawSceneSilhouette(ctx, painter, alpha = 1) {
  ctx.save();
  ctx.globalAlpha = clamp(alpha, 0, 1);
  painter(ctx);
  ctx.restore();
}

function drawHero(ctx, state, typeId, colors, phase, options = {}) {
  const alpha = fadeWindow(state.elapsedMs, options.inStart ?? 60, options.inEnd ?? 180, options.outStart ?? phase.endMs - 140, options.outEnd ?? phase.endMs + 80);
  drawScreenDim(ctx, options.background || 'rgba(3,8,28,0.88)', Math.max(0.72, alpha));
  drawRainbowBurst(ctx, FIELD_CENTER_X, CENTER_Y, 330, colors, state.elapsedMs * 0.00012, alpha);
  drawCharacterZoom(ctx, getType(typeId), FIELD_CENTER_X, CENTER_Y, options.radius || 112, phase.progress, { alpha, glow: options.glow });
}

function drawSimpleBody(ctx, typeId, x, y, scale, pose, colors) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  ctx.fillStyle = colors.body;
  ctx.strokeStyle = colors.trim;
  ctx.lineWidth = 7;
  ctx.beginPath();
  ctx.moveTo(-48, 20);
  ctx.quadraticCurveTo(-72, 105, -58, 155);
  ctx.lineTo(58, 155);
  ctx.quadraticCurveTo(72, 105, 48, 20);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.lineCap = 'round';
  const armY = pose === 2 ? -8 : pose === 1 ? 42 : 72;
  ctx.lineWidth = 24;
  ctx.beginPath();
  ctx.moveTo(-42, 54);
  ctx.lineTo(pose === 0 ? -98 : -72, armY);
  ctx.moveTo(42, 54);
  ctx.lineTo(pose === 1 ? 78 : 98, pose === 2 ? -8 : 70);
  ctx.stroke();
  drawTsumArtwork(ctx, getType(typeId), 0, 0, 54, { fit: 'contain' });
  ctx.restore();
}

function drawCoronationElsa(ctx, state, phase) {
  if (state.elapsedMs < 850) {
    drawHero(ctx, state, 'coronationElsa', ['#309cff', '#9b5de5', '#ff69b4', '#ffd65a'], phase, { glow: '#dff8ff' });
    return;
  }
  const sceneAlpha = smooth((state.elapsedMs - 700) / 240) * (1 - smooth((state.elapsedMs - 1500) / 250));
  drawBoardTint(ctx, '#390b18', 0.93 * sceneAlpha);
  drawSceneSilhouette(ctx, (scene) => {
    const carpet = scene.createLinearGradient(FIELD_CENTER_X, FIELD_TOP + 120, FIELD_CENTER_X, FIELD_BOTTOM);
    carpet.addColorStop(0, '#9e1835');
    carpet.addColorStop(1, '#e94b67');
    scene.fillStyle = carpet;
    scene.beginPath();
    scene.moveTo(174, FIELD_TOP + 150);
    scene.lineTo(240, FIELD_TOP + 150);
    scene.lineTo(330, FIELD_BOTTOM);
    scene.lineTo(84, FIELD_BOTTOM);
    scene.closePath();
    scene.fill();
    scene.fillStyle = '#6d1523';
    for (let index = 0; index < 7; index += 1) scene.fillRect(116 - index * 8, FIELD_TOP + 230 + index * 36, 182 + index * 16, 10);
    for (const side of [-1, 1]) {
      for (let index = 0; index < 4; index += 1) {
        const x = FIELD_CENTER_X + side * (105 + index * 24);
        drawRadialGlow(scene, x, FIELD_TOP + 175 + index * 70, 48, 'rgba(255,174,69,1)', 0.8);
      }
    }
    drawTsumArtwork(scene, getType('coronationElsa'), FIELD_CENTER_X, FIELD_TOP + 245, 50, { fit: 'contain' });
  }, sceneAlpha);
  if (state.elapsedMs >= 1500) {
    const p = (state.elapsedMs - 1500) / 250;
    drawScreenWipe(ctx, 'rgba(77,198,255,0.45)', p);
    drawScreenWipe(ctx, 'rgba(255,90,195,0.38)', p, true);
    drawWhiteFlash(ctx, Math.sin(p * Math.PI) * 0.72);
  }
}

function drawCaptain(ctx, state, phase) {
  if (state.elapsedMs < 850) {
    drawHero(ctx, state, 'captainLightyear', ['#27d7d2', '#1e8cff', '#8b5cf6', '#f5ff70'], phase, { glow: '#baffff' });
    return;
  }
  drawBoardTint(ctx, '#063f53', 0.9);
  if (state.elapsedMs < 1050) {
    const p = (state.elapsedMs - 850) / 200;
    drawRadialGlow(ctx, FIELD_CENTER_X, CENTER_Y, lerp(10, 390, easeOutCubic(p)), 'rgba(255,255,255,1)', 1);
    drawWhiteFlash(ctx, Math.sin(p * Math.PI) * 0.88);
    return;
  }
  const p = clamp((state.elapsedMs - 1050) / 800, 0, 1);
  drawSpeedLines(ctx, 'rgba(125,255,246,0.8)', p, 28);
  drawSimpleBody(ctx, 'captainLightyear', 158, CENTER_Y - 10, 1.12, 1, { body: '#f4f7f3', trim: '#67d26e' });
  ctx.save();
  ctx.strokeStyle = '#bfffff';
  ctx.shadowColor = '#48ffff';
  ctx.shadowBlur = 18;
  ctx.lineWidth = 7;
  ctx.beginPath();
  ctx.moveTo(234, CENTER_Y + 15);
  ctx.lineTo(WIDTH + 40, CENTER_Y - 92);
  ctx.stroke();
  ctx.restore();
  if (state.elapsedMs >= 1850) drawWhiteFlash(ctx, phase.progress * 0.42);
}

function drawNamine(ctx, state, phase) {
  drawBoardTint(ctx, '#ffffff', clamp(state.elapsedMs / 900, 0.35, 0.98));
  if (state.elapsedMs < 900) {
    drawRainbowBurst(ctx, FIELD_CENTER_X, CENTER_Y, 320, ['#b9ffd8', '#d8b8ff', '#b9efff'], state.elapsedMs * 0.00008, 0.72);
    drawCharacterZoom(ctx, getType('namine'), FIELD_CENTER_X, CENTER_Y, 110, phase.progress, { glow: '#ffffff' });
  } else if (state.elapsedMs < 2900) {
    const floatY = Math.sin(state.elapsedMs * 0.003) * 7;
    drawTsumArtwork(ctx, getType('namine'), FIELD_CENTER_X, CENTER_Y - 20 + floatY, 62 + Math.sin(state.elapsedMs * 0.002) * 2, { fit: 'contain' });
    drawParticleField(ctx, state, { key: 'namine-light', count: 46, colors: ['#ffffff', '#c8ffe8', '#e1d1ff'], direction: 'up', minSpeed: 8, maxSpeed: 24, alpha: 0.66 });
  }
  if (state.elapsedMs >= 2400) {
    drawParticleField(ctx, state, { key: 'diamonds', count: 34, colors: ['#d7f4ee', '#ddd4ef'], direction: 'down', minSpeed: 2, maxSpeed: 8, shape: 'diamond', minRadius: 3, maxRadius: 7, alpha: 0.35 });
    drawVisualOnlyTsumSilhouettes(ctx, state.game, { color: '#dfe3e5', stroke: '#626a73', alpha: 0.74 });
  }
  if (state.elapsedMs >= 2900) drawWhiteFlash(ctx, Math.sin(phase.progress * Math.PI) * 0.9);
}

function drawStage(ctx, colorA, colorB) {
  const gradient = ctx.createLinearGradient(0, FIELD_TOP, 0, FIELD_BOTTOM);
  gradient.addColorStop(0, colorA);
  gradient.addColorStop(1, colorB);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, FIELD_TOP, WIDTH, FIELD_HEIGHT);
  ctx.fillStyle = 'rgba(180,20,25,0.75)';
  ctx.beginPath();
  ctx.moveTo(135, FIELD_BOTTOM);
  ctx.lineTo(185, FIELD_TOP + 150);
  ctx.lineTo(230, FIELD_TOP + 150);
  ctx.lineTo(295, FIELD_BOTTOM);
  ctx.closePath();
  ctx.fill();
}

function drawGaston(ctx, state, phase) {
  if (state.elapsedMs < 900) {
    drawHero(ctx, state, 'gaston', ['#ff392e', '#ff8a24', '#ffd23f'], phase, { glow: '#ffdc9c' });
    return;
  }
  drawSceneSilhouette(ctx, (scene) => drawStage(scene, '#44100d', '#8f2d15'));
  drawRadialGlow(ctx, FIELD_CENTER_X, FIELD_TOP + 190, 240, 'rgba(255,142,48,1)', 0.58);
  const pose = state.elapsedMs < 1800 ? 0 : state.elapsedMs < 2400 ? 1 : 2;
  const bodyAlpha = 1 - smooth((state.elapsedMs - 3000) / 560);
  ctx.save();
  ctx.globalAlpha = bodyAlpha;
  drawSimpleBody(ctx, 'gaston', FIELD_CENTER_X, CENTER_Y - 72, 1.35, pose, { body: '#9f2226', trim: '#e8b343' });
  ctx.restore();
  if (state.elapsedMs >= 3000) drawRadialGlow(ctx, FIELD_CENTER_X, CENTER_Y, 330, 'rgba(255,184,69,1)', phase.progress * 0.75);
}

function drawMoana(ctx, state, phase) {
  if (state.elapsedMs < 850) {
    drawBoardTint(ctx, '#075b70', 0.82);
    drawParticleField(ctx, state, { key: 'water-drops', count: 36, colors: ['#bdf8ff', '#5bd9ff'], direction: 'down', minSpeed: 18, maxSpeed: 54, alpha: 0.65 });
    drawRainbowBurst(ctx, FIELD_CENTER_X, CENTER_Y, 320, ['#36d7dc', '#39a8ff', '#f5df75'], state.elapsedMs * 0.0001, 0.78);
    drawCharacterZoom(ctx, getType('guidingMoana'), FIELD_CENTER_X, CENTER_Y, 108, phase.progress, { glow: '#b9ffff' });
    return;
  }
  drawBoardTint(ctx, '#1a9eaa', 0.9);
  drawRadialGlow(ctx, FIELD_CENTER_X, CENTER_Y, 300, 'rgba(132,255,245,1)', 0.45);
  drawSimpleBody(ctx, 'guidingMoana', FIELD_CENTER_X, CENTER_Y - 70, 1.08, 1, { body: '#d95b40', trim: '#fff0b5' });
  if (state.elapsedMs >= 1650) {
    const sway = Math.sin(state.elapsedMs * 0.006) * 18;
    ctx.save();
    ctx.strokeStyle = '#21120f';
    ctx.lineWidth = 18;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(FIELD_CENTER_X - 35, CENTER_Y - 118);
    ctx.bezierCurveTo(125 + sway, CENTER_Y - 72, 126 - sway, CENTER_Y + 50, 105, CENTER_Y + 118);
    ctx.stroke();
    ctx.restore();
  }
  if (state.elapsedMs >= 2050) {
    const p = phase.progress;
    drawRadialGlow(ctx, FIELD_CENTER_X, CENTER_Y, lerp(30, 430, easeOutCubic(p)), 'rgba(255,255,255,1)', 1);
    drawWhiteFlash(ctx, p * 0.86);
  }
}

function drawPerfumeBottle(ctx, x, y, scale, glow = 0.5) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  ctx.shadowColor = '#fff27a';
  ctx.shadowBlur = 24 * glow;
  ctx.fillStyle = 'rgba(255,247,194,0.42)';
  ctx.strokeStyle = '#fff6ba';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.roundRect(-44, -36, 88, 104, 18);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#f6d94a';
  ctx.fillRect(-38, 20, 76, 42);
  ctx.fillStyle = '#f7ecbe';
  ctx.fillRect(-22, -55, 44, 22);
  ctx.fillStyle = '#cfae2e';
  ctx.fillRect(-16, -72, 32, 18);
  ctx.restore();
}

function drawPerfumeAlice(ctx, state, phase) {
  if (state.elapsedMs < 1000) {
    drawBoardTint(ctx, '#4d3a51', 0.78);
    drawRainbowBurst(ctx, FIELD_CENTER_X, CENTER_Y, 330, ['#ffe85b', '#ff91c6', '#7fdcff'], state.elapsedMs * 0.00012, 0.84);
    const x = state.elapsedMs < 750 ? FIELD_CENTER_X : lerp(FIELD_CENTER_X, 104, phase.progress);
    const y = state.elapsedMs < 750 ? CENTER_Y : lerp(CENTER_Y, FIELD_BOTTOM - 90, phase.progress);
    drawCharacterZoom(ctx, getType('perfumeAlice'), x, y, state.elapsedMs < 750 ? 110 : 70, state.elapsedMs < 750 ? phase.progress : 1, { glow: '#fff4a0' });
    drawParticleField(ctx, state, { key: 'flowers', count: 38, colors: ['#ffe251', '#fff4a1', '#ffb9d7'], direction: 'down', minSpeed: 8, maxSpeed: 28, shape: 'star', alpha: 0.72 });
    return;
  }
  drawBoardTint(ctx, '#b7dfb9', 0.86);
  const bottleP = clamp((state.elapsedMs - 1000) / 700, 0, 1);
  drawPerfumeBottle(ctx, 268, lerp(FIELD_BOTTOM + 80, CENTER_Y, easeOutCubic(bottleP)), lerp(0.65, 1, bottleP), state.elapsedMs >= 1700 ? 1 : 0.45);
  if (state.elapsedMs >= 1700) drawRadialGlow(ctx, 268, CENTER_Y, 230, 'rgba(255,245,118,1)', clamp((state.elapsedMs - 1700) / 350, 0, 1));
  if (state.elapsedMs >= 2050) {
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,221,0.72)';
    ctx.lineWidth = 6;
    for (let index = 0; index < 5; index += 1) {
      ctx.beginPath();
      ctx.moveTo(255, CENTER_Y + 35);
      ctx.bezierCurveTo(330 + index * 8, CENTER_Y - 50 - index * 22, 85, CENTER_Y - 95 + index * 32, 160, FIELD_TOP + 70);
      ctx.stroke();
    }
    ctx.restore();
    drawVisualOnlyTsumSilhouettes(ctx, state.game, { color: '#ffffff', stroke: '#d9f5e2', alpha: 0.66, scale: 1.06 });
  }
  if (state.elapsedMs >= 2750) drawWhiteFlash(ctx, Math.sin(phase.progress * Math.PI) * 0.82);
}

function drawSnakeCurves(ctx, alpha) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = '#ffd45a';
  ctx.lineWidth = 5;
  for (let index = 0; index < 4; index += 1) {
    ctx.beginPath();
    ctx.moveTo(40 + index * 105, FIELD_BOTTOM);
    ctx.bezierCurveTo(120 + index * 80, CENTER_Y + 50, 20 + index * 90, CENTER_Y - 100, 88 + index * 90, FIELD_TOP + 25);
    ctx.stroke();
  }
  ctx.restore();
}

function drawJamil(ctx, state, phase) {
  if (state.elapsedMs < 750) {
    drawHero(ctx, state, 'jamilViper', ['#ce1f2f', '#ff792e', '#ffd35a'], phase, { background: 'rgba(35,0,8,0.92)', glow: '#ffc452' });
    drawSnakeCurves(ctx, 0.65);
    return;
  }
  drawStage(ctx, '#22020a', '#74111a');
  ctx.save();
  ctx.fillStyle = '#2b1118';
  for (const x of [36, 330]) {
    ctx.fillRect(x, FIELD_TOP + 55, 48, FIELD_HEIGHT - 95);
    ctx.fillRect(x - 10, FIELD_TOP + 45, 68, 18);
  }
  ctx.restore();
  drawSnakeCurves(ctx, 0.55);
  const angle = Math.sin(state.elapsedMs * 0.006) * 0.17;
  const y = CENTER_Y + Math.sin(state.elapsedMs * 0.004) * 8;
  if (state.elapsedMs >= 2100) {
    ctx.save();
    for (let index = 0; index < 8; index += 1) {
      const a = (index / 8) * Math.PI * 2;
      ctx.globalAlpha = 0.13 + phase.progress * 0.12;
      drawTsumArtwork(ctx, getType('jamilViper'), FIELD_CENTER_X + Math.cos(a) * 100, y + Math.sin(a) * 82, 58, { fit: 'contain' });
    }
    ctx.restore();
  }
  ctx.save();
  ctx.translate(FIELD_CENTER_X, y);
  ctx.rotate(angle);
  drawTsumArtwork(ctx, getType('jamilViper'), 0, 0, 88, { fit: 'contain' });
  ctx.restore();
  if (state.elapsedMs >= 2550) drawWhiteFlash(ctx, phase.progress * 0.82);
}

function drawIceTower(ctx, x, baseY, width, height, progress, color) {
  const h = height * easeOutCubic(clamp(progress, 0, 1));
  ctx.save();
  ctx.fillStyle = color;
  ctx.strokeStyle = 'rgba(220,250,255,0.85)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x - width * 0.5, baseY);
  ctx.lineTo(x - width * 0.42, baseY - h * 0.72);
  ctx.lineTo(x, baseY - h);
  ctx.lineTo(x + width * 0.42, baseY - h * 0.72);
  ctx.lineTo(x + width * 0.5, baseY);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function drawSnowQueen(ctx, state, phase) {
  drawBoardTint(ctx, '#041b45', 0.92);
  drawParticleField(ctx, state, { key: 'snow', count: state.elapsedMs > 2650 ? 72 : 38, colors: ['#ffffff', '#b8eaff', '#d8d0ff'], direction: 'down', minSpeed: 8, maxSpeed: 28, alpha: 0.72 });
  if (state.elapsedMs < 1100) {
    drawRainbowBurst(ctx, FIELD_CENTER_X, CENTER_Y, 330, ['#268cff', '#7655d9', '#e8fbff'], state.elapsedMs * 0.00008, state.elapsedMs < 850 ? 0.8 : 1 - phase.progress);
    ctx.save();
    ctx.globalAlpha = state.elapsedMs < 850 ? 1 : 1 - phase.progress;
    drawCharacterZoom(ctx, getType('snowQueenElsa'), FIELD_CENTER_X, CENTER_Y, 112, state.elapsedMs < 850 ? phase.progress : 1, { glow: '#dff9ff' });
    ctx.restore();
    return;
  }
  ctx.save();
  ctx.fillStyle = '#06142e';
  ctx.beginPath();
  ctx.moveTo(0, FIELD_BOTTOM - 135);
  ctx.lineTo(74, FIELD_BOTTOM - 265);
  ctx.lineTo(135, FIELD_BOTTOM - 160);
  ctx.lineTo(216, FIELD_BOTTOM - 300);
  ctx.lineTo(310, FIELD_BOTTOM - 150);
  ctx.lineTo(WIDTH, FIELD_BOTTOM - 245);
  ctx.lineTo(WIDTH, FIELD_BOTTOM);
  ctx.lineTo(0, FIELD_BOTTOM);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  if (state.elapsedMs >= 1800) {
    drawIceTower(ctx, FIELD_CENTER_X, FIELD_BOTTOM - 42, 94, 285, (state.elapsedMs - 1800) / 400, 'rgba(84,178,238,0.72)');
  }
  if (state.elapsedMs >= 2200) {
    const towers = [[112, 62, 205], [302, 58, 222], [62, 44, 150], [350, 42, 170]];
    towers.forEach(([x, width, height], index) => drawIceTower(ctx, x, FIELD_BOTTOM - 42, width, height, (state.elapsedMs - 2200 - index * 80) / 300, 'rgba(102,198,244,0.68)'));
  }
  if (state.elapsedMs >= 2650) drawRadialGlow(ctx, FIELD_CENTER_X, CENTER_Y, 360, 'rgba(77,180,255,1)', phase.progress * 0.72);
  if (state.elapsedMs >= 2950) drawWhiteFlash(ctx, phase.progress * 0.42);
}

function drawGothicCastle(ctx) {
  ctx.save();
  ctx.fillStyle = '#120d1c';
  ctx.fillRect(70, FIELD_BOTTOM - 220, 274, 180);
  for (const [x, height] of [[78, 250], [140, 205], [207, 292], [274, 220], [334, 255]]) {
    ctx.fillRect(x - 22, FIELD_BOTTOM - height, 44, height - 40);
    ctx.beginPath();
    ctx.moveTo(x - 32, FIELD_BOTTOM - height);
    ctx.lineTo(x, FIELD_BOTTOM - height - 55);
    ctx.lineTo(x + 32, FIELD_BOTTOM - height);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

function drawBats(ctx, state, progress, burst = false, count = 18) {
  count = scaledEffectCount(count, 0);
  const seed = visualSeed(state) ^ hashString(burst ? 'bat-burst' : 'bats');
  ctx.save();
  for (let index = 0; index < count; index += 1) {
    const angle = seededUnit(seed, index, 1) * Math.PI * 2;
    const baseX = seededUnit(seed, index, 2) * WIDTH;
    const baseY = FIELD_TOP + seededUnit(seed, index, 3) * FIELD_HEIGHT;
    const distance = burst ? progress * lerp(40, 260, seededUnit(seed, index, 4)) : 0;
    const x = burst ? FIELD_CENTER_X + Math.cos(angle) * distance : (baseX + state.elapsedMs * 0.04 * (index % 2 ? 1 : -1) + WIDTH) % WIDTH;
    const y = burst ? CENTER_Y + Math.sin(angle) * distance : baseY + Math.sin(state.elapsedMs * 0.006 + index) * 16;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(0.35 + seededUnit(seed, index, 5) * 0.35, 0.35 + seededUnit(seed, index, 5) * 0.35);
    ctx.rotate(Math.sin(state.elapsedMs * 0.008 + index) * 0.25);
    drawLiliaBat(ctx, 22, index % 4 === 0);
    ctx.restore();
  }
  ctx.restore();
}

function drawLilia(ctx, state, phase) {
  const shift = smooth((state.elapsedMs - 2200) / 300);
  const base = ctx.createLinearGradient(0, FIELD_TOP, 0, FIELD_BOTTOM);
  base.addColorStop(0, shift < 0.5 ? '#071b13' : '#35102f');
  base.addColorStop(1, shift < 0.5 ? '#163a24' : '#461452');
  ctx.fillStyle = base;
  ctx.fillRect(0, FIELD_TOP, WIDTH, FIELD_HEIGHT);
  if (state.elapsedMs < 850) {
    drawRainbowBurst(ctx, FIELD_CENTER_X, CENTER_Y, 330, ['#44ef73', '#9b55e8', '#ff67bd'], state.elapsedMs * 0.0001, 0.86);
    drawCharacterZoom(ctx, getType('liliaVanrouge'), FIELD_CENTER_X, CENTER_Y, 112, phase.progress, { glow: '#72ff9e' });
    return;
  }
  drawGothicCastle(ctx);
  if (state.elapsedMs >= 1100) {
    drawSoftSmoke(ctx, state, FIELD_CENTER_X, CENTER_Y, clamp((state.elapsedMs - 1100) / 1100, 0, 1), ['rgba(60,255,115,0.45)', 'rgba(117,55,155,0.5)'], 30);
    drawBats(ctx, state, phase.overallProgress, false, 20);
    if (state.elapsedMs < 3150) {
      ctx.save();
      ctx.globalAlpha = state.elapsedMs < 2850 ? 0.9 : 1 - phase.progress;
      ctx.shadowColor = '#a65cff';
      ctx.shadowBlur = 20;
      drawTsumArtwork(ctx, getType('liliaVanrouge'), FIELD_CENTER_X, CENTER_Y - 35, 78, { fit: 'contain' });
      ctx.restore();
    }
  }
  if (state.elapsedMs >= 2500 && state.elapsedMs < 2850) {
    const p = phase.progress;
    ctx.save();
    ctx.strokeStyle = 'rgba(255,93,210,0.82)';
    ctx.lineWidth = 8;
    for (let index = 0; index < 4; index += 1) {
      ctx.beginPath();
      ctx.arc(FIELD_CENTER_X, CENTER_Y, lerp(190 - index * 28, 20, p), 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }
  if (state.elapsedMs >= 2850 && state.elapsedMs < 3150) drawSoftSmoke(ctx, state, FIELD_CENTER_X, CENTER_Y, phase.progress, ['rgba(182,67,212,0.7)', 'rgba(255,88,184,0.5)'], 36);
  if (state.elapsedMs >= 3150) drawBats(ctx, state, phase.progress, true, 30);
}

function drawJudyNick(ctx, state, phase) {
  const mode = state.activationData?.judyNickMode === 'nick' ? 'nick' : 'judy';
  const activeType = mode === 'nick' ? 'judyNickNickMate' : 'judyNickJudy';
  const nextColor = mode === 'nick' ? '#ffad62' : '#78c9ff';
  if (state.elapsedMs < 900) {
    drawHero(ctx, state, activeType, ['#5cdcff', '#8d7cff', '#ffdc6e', '#ff8bb4'], phase, { glow: '#c8f8ff' });
    return;
  }
  drawBoardTint(ctx, '#13768a', 0.36);
  if (state.elapsedMs < 2350) {
    drawParticleField(ctx, state, { key: mode === 'judy' ? 'bubbles' : 'ice', count: 52, colors: mode === 'judy' ? ['#b9faff', '#ffffff'] : ['#d7f7ff', '#8edcff'], direction: 'up', minSpeed: 7, maxSpeed: 22, alpha: 0.55, minRadius: 2, maxRadius: mode === 'judy' ? 8 : 5 });
    const existingMode = state.activationData?.judyNickExistingMode;
    if (existingMode) {
      drawTsumArtwork(ctx, getType('judyNickJudy'), FIELD_CENTER_X - 62, CENTER_Y, 62, { fit: 'contain' });
      drawTsumArtwork(ctx, getType('judyNickNickMate'), FIELD_CENTER_X + 62, CENTER_Y, 62, { fit: 'contain' });
      ctx.save();
      ctx.strokeStyle = existingMode === 'judy' ? '#b9faff' : '#b7e8ff';
      ctx.lineWidth = 7;
      ctx.beginPath();
      ctx.arc(FIELD_CENTER_X, CENTER_Y, 118, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
    drawRadialGlow(ctx, FIELD_CENTER_X, CENTER_Y, 250, `rgba(${mode === 'nick' ? '255,153,76' : '87,198,255'},1)`, 0.35);
  }
  if (state.elapsedMs >= 2350) {
    const p = phase.name === 'wave' ? phase.progress : 1;
    ctx.save();
    ctx.strokeStyle = nextColor;
    ctx.shadowColor = nextColor;
    ctx.shadowBlur = 18;
    ctx.lineWidth = lerp(12, 2, p);
    ctx.globalAlpha = 1 - p * 0.35;
    ctx.beginPath();
    ctx.arc(FIELD_CENTER_X, CENTER_Y, lerp(20, 300, easeOutCubic(p)), 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
    drawWhiteFlash(ctx, Math.sin(p * Math.PI) * 0.65);
  }
}

function withGame(state, game) {
  return { ...state, game };
}

function drawSkillPresentationFull(ctx, game, rawState) {
  if (!rawState || rawState.kind !== 'presentation') return false;
  const state = withGame(rawState, game);
  const phase = resolveSkillVisualPhase(state.skillId, state.kind, state.elapsedMs, state.durationMs);
  ctx.save();
  clipField(ctx);
  const painters = {
    coronationElsa: drawCoronationElsa,
    captainLightyear: drawCaptain,
    namine: drawNamine,
    gaston: drawGaston,
    guidingMoana: drawMoana,
    perfumeAlice: drawPerfumeAlice,
    jamilViper: drawJamil,
    snowQueenElsa: drawSnowQueen,
    liliaVanrouge: drawLilia,
    judyNick: drawJudyNick
  };
  painters[state.skillId]?.(ctx, state, phase);
  ctx.restore();
  return !!painters[state.skillId];
}

function centerFor(state) {
  return state.centers?.[0] || { x: FIELD_CENTER_X, y: FIELD_CENTER_Y };
}

function drawClearBurst(ctx, state, phase, colors) {
  const center = centerFor(state);
  if (phase.name === 'circle' || phase.name === 'laser' || phase.name === 'line') {
    drawRadialGlow(ctx, center.x, center.y, lerp(18, 220, easeOutCubic(phase.progress)), colors[0], 0.82);
  }
  if (phase.name === 'targets') {
    drawVisualOnlyTsumSilhouettes(ctx, state.game, { targetIds: state.targetIds, color: '#f4fdff', stroke: colors[1], alpha: 0.82, scale: 1.08 });
  }
  if (phase.name === 'shockwave' || phase.name === 'blast') {
    ctx.save();
    ctx.strokeStyle = colors[1];
    ctx.shadowColor = colors[0];
    ctx.shadowBlur = 20;
    ctx.lineWidth = lerp(14, 2, phase.progress);
    ctx.globalAlpha = 1 - phase.progress * 0.45;
    ctx.beginPath();
    ctx.arc(center.x, center.y, lerp(20, 260, easeOutCubic(phase.progress)), 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
    drawWhiteFlash(ctx, Math.sin(phase.progress * Math.PI) * 0.62);
  }
  if (phase.name === 'particles' || phase.name === 'fragments') {
    drawParticleField(ctx, state, { key: 'clear-burst', count: 54, colors, direction: 'burst', centerX: center.x, centerY: center.y, radius: 250, progress: phase.progress, shape: 'star', composite: 'lighter', alpha: 0.9 });
  }
}

function drawSkillSecondaryVisualFull(ctx, game, rawState) {
  if (!rawState || rawState.kind === 'presentation') return false;
  const state = withGame(rawState, game);
  const phase = resolveSkillVisualPhase(state.skillId, state.kind, state.elapsedMs, state.durationMs);
  ctx.save();
  clipField(ctx);
  if (state.skillId === 'captainLightyear') {
    const center = centerFor(state);
    if (phase.name === 'laser') {
      ctx.save();
      ctx.strokeStyle = '#dfffff';
      ctx.shadowColor = '#43eaff';
      ctx.shadowBlur = 18;
      ctx.lineWidth = lerp(2, 10, phase.progress);
      ctx.beginPath();
      ctx.moveTo(0, center.y + 110);
      ctx.lineTo(center.x, center.y);
      ctx.stroke();
      ctx.restore();
    } else if (phase.name === 'blast') {
      ctx.save();
      ctx.fillStyle = '#c9ffff';
      ctx.translate(center.x, center.y);
      ctx.rotate(state.elapsedMs * 0.003);
      drawStarPath(ctx, 12, lerp(20, 170, easeOutCubic(phase.progress)), lerp(8, 56, phase.progress));
      ctx.fill();
      ctx.restore();
      drawWhiteFlash(ctx, Math.sin(phase.progress * Math.PI) * 0.78);
    } else drawClearBurst(ctx, state, phase, ['#bfffff', '#55dfff', '#fff19b']);
  } else if (state.skillId === 'namine') {
    const alpha = phase.name === 'restore' ? 1 - phase.progress : 0.78;
    drawVisualOnlyTsumSilhouettes(ctx, game, { color: '#30343b', stroke: '#eef4f5', alpha });
    drawBoardTint(ctx, '#eef2f4', alpha * 0.42);
  } else if (state.skillId === 'gaston') {
    const y = centerFor(state).y;
    ctx.save();
    ctx.strokeStyle = '#ffd861';
    ctx.shadowColor = '#fff0a0';
    ctx.shadowBlur = 20;
    ctx.lineWidth = phase.name === 'line' ? lerp(2, 12, phase.progress) : lerp(16, 2, phase.progress);
    ctx.globalAlpha = 1 - phase.progress * 0.35;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(WIDTH, y);
    ctx.stroke();
    ctx.restore();
    if (phase.name === 'flash') drawWhiteFlash(ctx, Math.sin(phase.progress * Math.PI) * 0.72);
  } else if (state.skillId === 'guidingMoana') {
    const centers = state.centers?.length ? state.centers : [centerFor(state)];
    for (const center of centers) {
      drawClearBurst(ctx, { ...state, centers: [center] }, phase, ['rgba(255,255,255,1)', '#78eaff', '#ffe88d']);
    }
  } else if (state.skillId === 'perfumeAlice') {
    const center = centerFor(state);
    if (phase.name === 'targets') drawVisualOnlyTsumSilhouettes(ctx, game, { targetIds: state.targetIds, color: '#ffffff', stroke: '#fff3a1', alpha: 0.9, scale: lerp(1, 1.12, phase.progress) });
    if (phase.name === 'smoke') drawSoftSmoke(ctx, state, center.x, center.y, phase.progress, ['rgba(255,255,255,0.82)', 'rgba(255,245,170,0.65)'], 38);
    if (phase.name === 'particles') drawClearBurst(ctx, state, phase, ['#ffffff', '#fff07b', '#ffd49a']);
  } else if (state.skillId === 'jamilViper') {
    if (phase.name === 'centerGlow') {
      const center = centerFor(state);
      drawRadialGlow(ctx, center.x, center.y, lerp(30, 190, easeOutCubic(phase.progress)), 'rgba(255,133,42,1)', 0.86);
    }
    drawClearBurst(ctx, state, phase, ['rgba(255,145,55,1)', '#fff09a', '#d83228']);
  } else if (state.skillId === 'liliaVanrouge') {
    if (phase.name === 'flash') drawWhiteFlash(ctx, 1 - phase.progress * 0.55);
    if (phase.name === 'orbs') {
      for (const [index, color] of ['#64ff8e', '#bd72ff', '#62c8ff'].entries()) drawRadialGlow(ctx, FIELD_CENTER_X + (index - 1) * 82, CENTER_Y + Math.sin(state.elapsedMs * 0.01 + index) * 35, 82, color, 0.72);
      drawBats(ctx, state, phase.progress, false, 12);
    }
    if (phase.name === 'fragments') {
      drawBats(ctx, state, phase.progress, true, 18);
      drawParticleField(ctx, state, { key: 'lilia-end', count: 40, colors: ['#6dff94', '#c276ff', '#ffd56c'], direction: 'burst', centerX: FIELD_CENTER_X, centerY: CENTER_Y, radius: 250, progress: phase.progress, shape: 'star' });
    }
  } else {
    ctx.restore();
    return false;
  }
  ctx.restore();
  return true;
}

function withParticleScale(options, draw) {
  const previousScale = activeParticleScale;
  activeParticleScale = clamp(Number(options?.particleScale) || 0, 0, 1);
  try {
    return draw();
  } finally {
    activeParticleScale = previousScale;
  }
}

export function drawSkillPresentation(ctx, game, rawState, options = {}) {
  return withParticleScale(
    { particleScale: options.particleScale ?? 1 },
    () => drawSkillPresentationFull(ctx, game, rawState)
  );
}

export function drawSkillSecondaryVisual(ctx, game, rawState, options = {}) {
  return withParticleScale(
    { particleScale: options.particleScale ?? 1 },
    () => drawSkillSecondaryVisualFull(ctx, game, rawState)
  );
}
