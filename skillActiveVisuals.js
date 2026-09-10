import {
  WIDTH,
  HEIGHT,
  FIELD_TOP,
  FIELD_BOTTOM,
  FIELD_CENTER_X,
  FIELD_CENTER_Y,
  clamp
} from './config.js?v=skill-active-1';

const FIELD_HEIGHT = FIELD_BOTTOM - FIELD_TOP;
export const SKILL_ACTIVE_FADE_IN_MS = 150;
export const SKILL_ACTIVE_FADE_OUT_MS = 100;
export const JUDY_NICK_WORLD_SWITCH_MS = 100;

const SUPPORTED_SKILLS = new Set([
  'coronationElsa',
  'captainLightyear',
  'namine',
  'gaston',
  'guidingMoana',
  'perfumeAlice',
  'jamilViper',
  'snowQueenElsa',
  'liliaVanrouge',
  'finalBattleHook',
  'judyNick'
]);

const THEMES = Object.freeze({
  coronationElsa: Object.freeze({ outer: ['#61D3E7', '#209FC4'], field: ['#172331', '#101A2B'], accent: '#D9FBFF', secondary: '#D8A7E8', tint: 0.5, outerAlpha: 0.84, motif: 'frost' }),
  captainLightyear: Object.freeze({ outer: ['#79D8EB', '#3AAFD8'], field: ['#0B5368', '#062D48'], accent: '#C9FAFF', secondary: '#75E7FF', tint: 0.46, outerAlpha: 0.8, motif: 'reticles' }),
  namine: Object.freeze({ outer: ['#E8F4F6', '#BFD7DF'], field: ['#E8E1F3', '#AFCBD5'], accent: '#FFFFFF', secondary: '#D8CFF1', tint: 0.34, outerAlpha: 0.78, motif: 'diamonds' }),
  gaston: Object.freeze({ outer: ['#7A2924', '#3B1015'], field: ['#7D2420', '#5B1717'], accent: '#E9A57F', secondary: '#B85A4B', tint: 0.61, outerAlpha: 0.84, motif: 'none' }),
  guidingMoana: Object.freeze({ outer: ['#8E84C9', '#4FB9C9'], field: ['#83D7DB', '#247F9A'], accent: '#E4FFFF', secondary: '#F75AB8', tint: 0.46, outerAlpha: 0.82, motif: 'waves' }),
  perfumeAlice: Object.freeze({ outer: ['#183B78', '#0F2B5F'], field: ['#183B78', '#0F2B5F'], accent: '#EDFF9B', secondary: '#A8B84B', dark: '#07172F', tint: 0.56, outerAlpha: 0.86, motif: 'garden' }),
  // TODO/calibration: public reference material for the active board is limited.
  jamilViper: Object.freeze({ outer: ['#4A173C', '#2A102B'], field: ['#4A173C', '#2A102B'], accent: '#D7AE45', secondary: '#78314C', tint: 0.51, outerAlpha: 0.82, motif: 'arabesque' }),
  snowQueenElsa: Object.freeze({ outer: ['#28455B', '#162536'], field: ['#28455B', '#162536'], accent: '#CFF8FF', secondary: '#A9DCE8', tint: 0.5, outerAlpha: 0.82, motif: 'ice' }),
  liliaVanrouge: Object.freeze({ outer: ['#214328', '#0D2118'], field: ['#610C45', '#3A0B2D'], accent: '#A4FF48', secondary: '#FF2FBA', tertiary: '#64ECFF', tint: 0.56, outerAlpha: 0.88, motif: 'bats' }),
  finalBattleHook: Object.freeze({ outer: ['#25102E', '#2A0D19'], field: ['#5B1730', '#2A0D19'], accent: '#F4B35B', secondary: '#EA5A3F', tint: 0.46, outerAlpha: 0.78, motif: 'slash' }),
  judyNickJudy: Object.freeze({ outer: ['#8ADB70', '#4DBA5D'], field: ['#76CF68', '#2D8E4F'], accent: '#FFF9C8', secondary: '#C8F5FF', tint: 0.46, outerAlpha: 0.82, motif: 'bubbles' }),
  judyNickNick: Object.freeze({ outer: ['#79DDEB', '#36B9D4'], field: ['#36B9D4', '#197EAC'], accent: '#E1FFFF', secondary: '#9CEEFF', tint: 0.48, outerAlpha: 0.84, motif: 'ice' })
});

export function isSkillActiveVisualSupported(skillId) {
  return SUPPORTED_SKILLS.has(skillId);
}

export function getSkillActiveThemeId(state) {
  if (!state || !isSkillActiveVisualSupported(state.skillId)) return null;
  if (state.skillId === 'gaston' && state.phase !== 'active') return null;
  if (state.skillId === 'judyNick') {
    return state.mode === 'nick' ? 'judyNickNick' : 'judyNickJudy';
  }
  return state.skillId;
}

export function getCaptainLightyearReticleCount(state) {
  if (state?.skillId !== 'captainLightyear') return 0;
  return Math.max(0, Math.floor(Number(state.remainingShots) || 0));
}

function smooth(value) {
  const t = clamp(value, 0, 1);
  return t * t * (3 - 2 * t);
}

export function resolveSkillActiveVisualFrame(state, options = {}) {
  const themeId = getSkillActiveThemeId(state);
  if (!themeId) return null;
  const detail = ['full', 'reduced', 'minimal'].includes(options.detail) ? options.detail : 'full';
  const visibleElapsedMs = Math.max(0, Number(options.visibleElapsedMs) || 0);
  const entryAlpha = smooth(visibleElapsedMs / SKILL_ACTIVE_FADE_IN_MS);
  const remainingMs = Number(state.remainingMs);
  const exitAlpha = Number.isFinite(remainingMs)
    ? smooth(Math.max(0, remainingMs) / SKILL_ACTIVE_FADE_OUT_MS)
    : 1;
  const switchElapsedMs = Math.max(0, Number(options.modeSwitchElapsedMs) || 0);
  const previousThemeId = options.previousThemeId;
  const switching = (
    state.skillId === 'judyNick' &&
    previousThemeId &&
    previousThemeId !== themeId &&
    switchElapsedMs < JUDY_NICK_WORLD_SWITCH_MS
  );
  const firstHalf = switchElapsedMs < JUDY_NICK_WORLD_SWITCH_MS * 0.5;
  const resolvedThemeId = switching && firstHalf ? previousThemeId : themeId;
  const switchProgress = clamp(switchElapsedMs / JUDY_NICK_WORLD_SWITCH_MS, 0, 1);
  return {
    ...state,
    themeId: resolvedThemeId,
    nextThemeId: themeId,
    detail,
    alpha: entryAlpha * exitAlpha,
    whiteFlashAlpha: switching ? Math.sin(switchProgress * Math.PI) * 0.88 : 0,
    reticleCount: getCaptainLightyearReticleCount(state),
    animationMs: Math.max(0, Number(options.animationMs) || 0)
  };
}

function themeFor(frame) {
  return frame ? THEMES[frame.themeId] || null : null;
}

function colorWithAlpha(color, alpha) {
  const value = Number.parseInt(String(color).slice(1), 16);
  if (!Number.isFinite(value)) return `rgba(255,255,255,${alpha})`;
  return `rgba(${(value >> 16) & 255},${(value >> 8) & 255},${value & 255},${alpha})`;
}

function applyFrameAlpha(ctx, frame, multiplier = 1) {
  ctx.globalAlpha *= clamp((frame?.alpha || 0) * multiplier, 0, 1);
}

export function drawSkillActiveBackdrop(ctx, frame) {
  const theme = themeFor(frame);
  if (!theme || !(frame.alpha > 0)) return false;
  ctx.save();
  applyFrameAlpha(ctx, frame, theme.outerAlpha);
  if (frame.detail === 'minimal') {
    ctx.fillStyle = theme.outer[1];
  } else {
    const gradient = ctx.createLinearGradient(0, 0, 0, HEIGHT);
    gradient.addColorStop(0, theme.outer[0]);
    gradient.addColorStop(0.55, theme.outer[1]);
    gradient.addColorStop(1, theme.outer[0]);
    ctx.fillStyle = gradient;
  }
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  if (frame.detail !== 'minimal') {
    const glow = ctx.createRadialGradient(FIELD_CENTER_X, 32, 4, FIELD_CENTER_X, 32, WIDTH * 0.72);
    glow.addColorStop(0, colorWithAlpha(theme.accent, 0.36));
    glow.addColorStop(1, colorWithAlpha(theme.accent, 0));
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, WIDTH, 170);
  } else {
    ctx.fillStyle = colorWithAlpha(theme.accent, 0.18);
    ctx.fillRect(0, 0, WIDTH, 18);
    ctx.fillRect(0, HEIGHT - 18, WIDTH, 18);
  }
  ctx.restore();
  return true;
}

export function drawSkillActiveFieldBackground(ctx, frame) {
  const theme = themeFor(frame);
  if (!theme || !(frame.alpha > 0)) return false;
  ctx.save();
  applyFrameAlpha(ctx, frame, theme.tint);
  if (frame.detail === 'minimal') {
    ctx.fillStyle = theme.field[1];
  } else {
    const gradient = ctx.createLinearGradient(0, FIELD_TOP, 0, FIELD_BOTTOM);
    gradient.addColorStop(0, theme.field[0]);
    gradient.addColorStop(1, theme.field[1]);
    ctx.fillStyle = gradient;
  }
  ctx.fillRect(0, FIELD_TOP - 10, WIDTH, FIELD_HEIGHT + 20);
  if (frame.detail === 'full') {
    const pulse = 0.12 + Math.sin(frame.animationMs * 0.0017) * 0.025;
    const glow = ctx.createRadialGradient(FIELD_CENTER_X, FIELD_CENTER_Y, 16, FIELD_CENTER_X, FIELD_CENTER_Y, FIELD_HEIGHT * 0.58);
    glow.addColorStop(0, colorWithAlpha(theme.accent, pulse));
    glow.addColorStop(1, colorWithAlpha(theme.accent, 0));
    ctx.fillStyle = glow;
    ctx.fillRect(0, FIELD_TOP, WIDTH, FIELD_HEIGHT);
  }
  ctx.restore();
  return true;
}

function drawDiamond(ctx, x, y, radius) {
  ctx.beginPath();
  ctx.moveTo(x, y - radius);
  ctx.lineTo(x + radius * 0.72, y);
  ctx.lineTo(x, y + radius);
  ctx.lineTo(x - radius * 0.72, y);
  ctx.closePath();
  ctx.stroke();
}

function drawIceCorners(ctx, theme) {
  ctx.strokeStyle = colorWithAlpha(theme.accent, 0.25);
  ctx.lineWidth = 2;
  for (const side of [-1, 1]) {
    const x = side < 0 ? 12 : WIDTH - 12;
    for (let index = 0; index < 4; index += 1) {
      const y = FIELD_TOP + 58 + index * 112;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x - side * (18 + index % 2 * 8), y - 19);
      ctx.lineTo(x - side * (11 + index % 2 * 5), y + 21);
      ctx.stroke();
    }
  }
}

function drawReticles(ctx, frame, theme) {
  const count = frame.reticleCount;
  if (!count) return;
  const gap = Math.min(54, (WIDTH - 64) / Math.max(1, count));
  const startX = FIELD_CENTER_X - gap * (count - 1) * 0.5;
  ctx.strokeStyle = colorWithAlpha(theme.accent, 0.86);
  ctx.fillStyle = colorWithAlpha(theme.field[1], 0.52);
  ctx.lineWidth = frame.detail === 'minimal' ? 2 : 2.5;
  for (let index = 0; index < count; index += 1) {
    const x = startX + gap * index;
    const y = FIELD_TOP + 32;
    ctx.beginPath();
    ctx.arc(x, y, 13, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x - 18, y); ctx.lineTo(x - 8, y);
    ctx.moveTo(x + 8, y); ctx.lineTo(x + 18, y);
    ctx.moveTo(x, y - 18); ctx.lineTo(x, y - 8);
    ctx.moveTo(x, y + 8); ctx.lineTo(x, y + 18);
    ctx.stroke();
  }
}

function drawWaves(ctx, theme, detail) {
  ctx.strokeStyle = colorWithAlpha(theme.accent, 0.22);
  ctx.lineWidth = 3;
  const rows = detail === 'full' ? 4 : 3;
  for (let row = 0; row < rows; row += 1) {
    const y = FIELD_TOP + 92 + row * 118;
    ctx.beginPath();
    ctx.moveTo(-12, y);
    ctx.bezierCurveTo(WIDTH * 0.25, y - 22, WIDTH * 0.32, y + 22, WIDTH * 0.5, y);
    ctx.bezierCurveTo(WIDTH * 0.68, y - 22, WIDTH * 0.76, y + 22, WIDTH + 12, y);
    ctx.stroke();
  }
}

function drawGarden(ctx, theme) {
  ctx.strokeStyle = colorWithAlpha(theme.dark, 0.48);
  ctx.fillStyle = colorWithAlpha(theme.secondary, 0.24);
  ctx.lineWidth = 8;
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(side < 0 ? -5 : WIDTH + 5, FIELD_BOTTOM);
    ctx.bezierCurveTo(FIELD_CENTER_X + side * 130, FIELD_CENTER_Y + 110, FIELD_CENTER_X + side * 190, FIELD_CENTER_Y - 70, FIELD_CENTER_X + side * 155, FIELD_TOP + 20);
    ctx.stroke();
    for (let index = 0; index < 4; index += 1) {
      ctx.beginPath();
      ctx.arc(side < 0 ? 22 + index * 5 : WIDTH - 22 - index * 5, FIELD_TOP + 110 + index * 105, 6 + index, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function drawArabesque(ctx, theme) {
  ctx.strokeStyle = colorWithAlpha(theme.accent, 0.24);
  ctx.lineWidth = 2;
  for (const side of [-1, 1]) {
    const x = side < 0 ? 8 : WIDTH - 8;
    ctx.beginPath();
    ctx.moveTo(x, FIELD_TOP + 30);
    ctx.bezierCurveTo(x - side * 56, FIELD_TOP + 135, x + side * 45, FIELD_TOP + 230, x, FIELD_TOP + 335);
    ctx.bezierCurveTo(x - side * 48, FIELD_TOP + 430, x + side * 30, FIELD_BOTTOM - 50, x, FIELD_BOTTOM - 18);
    ctx.stroke();
  }
}

function drawBatsAndThorns(ctx, theme) {
  ctx.strokeStyle = colorWithAlpha(theme.accent, 0.22);
  ctx.fillStyle = colorWithAlpha(theme.tertiary, 0.17);
  ctx.lineWidth = 2;
  const bats = [[42, FIELD_TOP + 55], [WIDTH - 55, FIELD_TOP + 94], [28, FIELD_TOP + 174]];
  for (const [x, y] of bats) {
    ctx.beginPath();
    ctx.moveTo(x - 13, y);
    ctx.quadraticCurveTo(x - 7, y - 10, x, y - 2);
    ctx.quadraticCurveTo(x + 7, y - 10, x + 13, y);
    ctx.quadraticCurveTo(x + 6, y - 3, x, y + 5);
    ctx.quadraticCurveTo(x - 6, y - 3, x - 13, y);
    ctx.fill();
  }
  for (const side of [-1, 1]) {
    const x = side < 0 ? 5 : WIDTH - 5;
    ctx.beginPath();
    ctx.moveTo(x, FIELD_BOTTOM);
    ctx.lineTo(x - side * 26, FIELD_CENTER_Y + 100);
    ctx.lineTo(x - side * 7, FIELD_CENTER_Y + 34);
    ctx.lineTo(x - side * 28, FIELD_CENTER_Y - 38);
    ctx.stroke();
  }
}

function drawBubbles(ctx, theme) {
  ctx.strokeStyle = colorWithAlpha(theme.secondary, 0.3);
  ctx.lineWidth = 2;
  const bubbles = [[34, 72, 11], [78, 168, 7], [WIDTH - 42, 112, 14], [WIDTH - 76, 292, 8]];
  for (const [x, offsetY, radius] of bubbles) {
    ctx.beginPath();
    ctx.arc(x, FIELD_TOP + offsetY, radius, 0, Math.PI * 2);
    ctx.stroke();
  }
}

export function drawSkillActiveForeground(ctx, frame) {
  const theme = themeFor(frame);
  if (!theme || !(frame.alpha > 0)) return false;
  ctx.save();
  applyFrameAlpha(ctx, frame, frame.detail === 'minimal' ? 0.9 : 1);
  if (theme.motif === 'reticles') {
    drawReticles(ctx, frame, theme);
  } else if (frame.detail !== 'minimal') {
    if (theme.motif === 'frost' || theme.motif === 'ice') drawIceCorners(ctx, theme);
    if (theme.motif === 'waves') drawWaves(ctx, theme, frame.detail);
    if (theme.motif === 'garden') drawGarden(ctx, theme);
    if (theme.motif === 'arabesque') drawArabesque(ctx, theme);
    if (theme.motif === 'bats') drawBatsAndThorns(ctx, theme);
    if (theme.motif === 'bubbles') drawBubbles(ctx, theme);
    if (theme.motif === 'diamonds') {
      ctx.strokeStyle = colorWithAlpha(theme.accent, 0.26);
      ctx.lineWidth = 2;
      [[38, 70, 8], [WIDTH - 45, 145, 11], [62, 330, 7], [WIDTH - 66, 430, 9]].forEach(([x, offsetY, radius]) => drawDiamond(ctx, x, FIELD_TOP + offsetY, radius));
    }
    if (theme.motif === 'slash') {
      ctx.strokeStyle = colorWithAlpha(theme.secondary, 0.18);
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(10, FIELD_BOTTOM - 70);
      ctx.lineTo(WIDTH - 24, FIELD_TOP + 92);
      ctx.stroke();
    }
  }
  if (frame.whiteFlashAlpha > 0) {
    ctx.globalAlpha = frame.whiteFlashAlpha;
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, FIELD_TOP, WIDTH, FIELD_HEIGHT);
  }
  ctx.restore();
  return true;
}
