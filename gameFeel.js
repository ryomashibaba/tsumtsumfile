const CLEAR_LEVEL_THRESHOLDS = Object.freeze([3, 6, 10, 15, 25]);
const CHAIN_THRESHOLDS = Object.freeze([6, 10, 15, 20]);

const QUALITY_DEFAULTS = Object.freeze({
  gameFeelScale: 1,
  shakeScale: 1,
  flashScale: 1,
  maxGameFeelParticles: 80,
  maxGameFeelRings: 8,
  visualHitStop: true,
  drawTransientEffects: true,
  particleScale: 1
});

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, Number(value) || 0));
}

function easeOutCubic(value) {
  const t = clamp(value, 0, 1);
  return 1 - ((1 - t) ** 3);
}

export function resolveClearLevel(count) {
  const value = Math.max(0, Number(count) || 0);
  let level = 0;
  for (const threshold of CLEAR_LEVEL_THRESHOLDS) {
    if (value < threshold) break;
    level += 1;
  }
  return level;
}

export function resolveChainAnticipationLevel(count) {
  const value = Math.max(0, Number(count) || 0);
  let level = 0;
  for (const threshold of CHAIN_THRESHOLDS) {
    if (value < threshold) break;
    level += 1;
  }
  return level;
}

export function calculateVisualChainCount(targets = []) {
  return targets.reduce((sum, target) => {
    const weight = Number(target?.clearWeight);
    return sum + (Number.isFinite(weight) && weight > 0 ? weight : 1);
  }, 0);
}

export function resolveComboMilestone(combo) {
  const value = Math.max(0, Math.floor(Number(combo) || 0));
  if (value >= 100 && value % 100 === 0) return 5;
  if (value === 50) return 4;
  if (value === 30) return 3;
  if (value === 20) return 2;
  if (value === 10) return 1;
  return 0;
}

export function resolveFeverAnticipation(gauge, active = false) {
  if (active) return 4;
  const value = clamp(gauge, 0, 100);
  if (value >= 100) return 4;
  if (value >= 95) return 3;
  if (value >= 85) return 2;
  if (value >= 70) return 1;
  return 0;
}

export function resolveGameFeelQuality(profile = {}) {
  return {
    ...QUALITY_DEFAULTS,
    ...profile,
    gameFeelScale: clamp(profile.gameFeelScale ?? QUALITY_DEFAULTS.gameFeelScale, 0, 1),
    shakeScale: clamp(profile.shakeScale ?? QUALITY_DEFAULTS.shakeScale, 0, 1),
    flashScale: clamp(profile.flashScale ?? QUALITY_DEFAULTS.flashScale, 0, 1),
    particleScale: clamp(profile.particleScale ?? QUALITY_DEFAULTS.particleScale, 0, 1),
    maxGameFeelParticles: Math.max(0, Math.floor(profile.maxGameFeelParticles ?? QUALITY_DEFAULTS.maxGameFeelParticles)),
    maxGameFeelRings: Math.max(0, Math.floor(profile.maxGameFeelRings ?? QUALITY_DEFAULTS.maxGameFeelRings)),
    visualHitStop: profile.visualHitStop ?? QUALITY_DEFAULTS.visualHitStop,
    drawTransientEffects: profile.drawTransientEffects ?? QUALITY_DEFAULTS.drawTransientEffects
  };
}

function getResultScoreProgress(elapsedSec) {
  const progress = clamp(elapsedSec / 0.75, 0, 1);
  if (progress <= 0.82) {
    return (progress / 0.82) * 0.9;
  }
  return 0.9 + easeOutCubic((progress - 0.82) / 0.18) * 0.1;
}

export class GameFeelController {
  constructor(options = {}) {
    this.enabled = options.enabled !== false;
    this.getQualityProfile = typeof options.getQualityProfile === 'function'
      ? options.getQualityProfile
      : () => QUALITY_DEFAULTS;
    this.getExternalParticleCount = typeof options.getExternalParticleCount === 'function'
      ? options.getExternalParticleCount
      : () => 0;
    this._snapshotCanvas = this._snapshotCanvas || null;
    this.reset();
  }

  quality() {
    return resolveGameFeelQuality(this.getQualityProfile?.() || QUALITY_DEFAULTS);
  }

  reset(options = {}) {
    this.revision = (this.revision || 0) + 1;
    this._cachedRenderState = null;
    this._cachedRenderRevision = -1;
    this.elapsed = 0;
    this.sequence = 0;
    this.particles = [];
    this.rings = [];
    this.chain = { count: 0, level: 0, peakLevel: 0, x: 0, y: 0, pulse: 0 };
    this.shake = { life: 0, maxLife: 0, amount: 0, seed: 0 };
    this.flash = { life: 0, maxLife: 0, alpha: 0, color: '#ffffff' };
    this.afterglow = { life: 0, maxLife: 0, x: 0, y: 0, level: 0 };
    this.edgeGlow = { life: 0, maxLife: 0, color: '#ffffff' };
    this.combo = { life: 0, maxLife: 0, value: 0, level: 0 };
    this.skillReady = { life: 0, maxLife: 0 };
    this.skillActivate = { life: 0, maxLife: 0 };
    this.feverStart = { life: 0, maxLife: 0 };
    this.hitStop = { life: 0, maxLife: 0, pendingCapture: false, captured: false };
    this.recentBombChainLife = 0;
    this.result = null;
    this.lastSkillReady = !!options.skillReady;
    this._snapshotCanvas = null;
  }

  addParticles(x, y, count, color = '#ffffff', speed = 100) {
    const quality = this.quality();
    if (!quality.drawTransientEffects || quality.maxGameFeelParticles <= 0) return;
    const desired = Math.max(0, Math.round(count * quality.particleScale));
    const externalCount = Math.max(0, Number(this.getExternalParticleCount?.()) || 0);
    const available = Math.max(0, quality.maxGameFeelParticles - this.particles.length - externalCount);
    const total = Math.min(desired, available);
    for (let i = 0; i < total; i += 1) {
      const seed = this.sequence * 37 + i * 17 + 11;
      const angle = ((seed % 360) / 360) * Math.PI * 2;
      const velocity = speed * (0.55 + ((seed * 13) % 41) / 100);
      const life = 0.28 + ((seed * 7) % 12) / 100;
      this.particles.push({
        x, y,
        vx: Math.cos(angle) * velocity,
        vy: Math.sin(angle) * velocity,
        radius: 1.4 + (seed % 3) * 0.55,
        color,
        life,
        maxLife: life
      });
    }
  }

  addRing(x, y, level, color = 'rgba(255,245,165,0.9)', delay = 0) {
    const quality = this.quality();
    if (!quality.drawTransientEffects || this.rings.length >= quality.maxGameFeelRings) return;
    this.rings.push({
      x, y, level, color, delay,
      radius: 12 + level * 2,
      growth: 130 + level * 34,
      life: 0.22 + level * 0.045,
      maxLife: 0.22 + level * 0.045
    });
  }

  requestHitStop(durationSec) {
    const quality = this.quality();
    if (!quality.visualHitStop || durationSec <= 0) return;
    if (durationSec >= this.hitStop.life) {
      this.hitStop = {
        life: durationSec,
        maxLife: durationSec,
        pendingCapture: true,
        captured: false
      };
    }
  }

  emit(type, payload = {}) {
    if (!this.enabled) return false;
    const quality = this.quality();
    this.revision += 1;
    this.sequence += 1;

    if (type === 'clear') {
      const count = Math.max(0, Number(payload.effectiveClearCount ?? payload.count) || 0);
      const level = resolveClearLevel(count);
      const x = Number(payload.x) || 0;
      const y = Number(payload.y) || 0;
      const color = payload.color || '#fff2a0';
      if (level >= 2) this.addRing(x, y, level, color);
      if (level >= 3) this.addRing(x, y, level, 'rgba(255,255,255,0.78)', 0.035);
      const particleCounts = [0, 0, 8, 12, 18, 28];
      this.addParticles(x, y, payload.source === 'bomb' ? Math.ceil(particleCounts[level] * 0.45) : particleCounts[level], color, 90 + level * 22);
      if (level >= 4) {
        const amount = level >= 5 ? 3.5 : 1.5;
        this.shake = { life: level >= 5 ? 0.12 : 0.09, maxLife: level >= 5 ? 0.12 : 0.09, amount, seed: this.sequence };
        this.flash = { life: 0.09, maxLife: 0.09, alpha: level >= 5 ? 0.16 : 0.08, color: '#ffffff' };
      }
      if (level >= 5) {
        this.afterglow = { life: 0.3, maxLife: 0.3, x, y, level };
      }
      if (count >= 20 && !(payload.source === 'bomb' && this.recentBombChainLife > 0)) {
        this.requestHitStop(count >= 25 ? 0.035 : 0.028);
      }
      return true;
    }

    if (type === 'bomb') {
      const centers = Array.isArray(payload.centers) ? payload.centers : [];
      const chainLength = Math.max(1, centers.length || Number(payload.chainLength) || 1);
      centers.slice(0, quality.maxGameFeelRings).forEach((center, index) => {
        const escalation = Math.min(4, 1 + index);
        this.addRing(center.x, center.y, escalation, payload.color || '#ffd868', index * 0.025);
        this.addParticles(center.x, center.y, 5 + escalation * 2, payload.color || '#ffd868', 105 + escalation * 18);
      });
      if (chainLength >= 3) {
        this.recentBombChainLife = 0.3;
        this.requestHitStop(0.035);
      }
      return true;
    }

    if (type === 'combo') {
      const value = Math.max(0, Math.floor(Number(payload.combo) || 0));
      const level = resolveComboMilestone(value);
      if (!level) return false;
      this.combo = { life: level >= 5 ? 0.85 : 0.55, maxLife: level >= 5 ? 0.85 : 0.55, value, level };
      if (level >= 2) this.addRing(Number(payload.x) || 207, Number(payload.y) || 145, level, '#fff29a');
      if (level >= 4) this.edgeGlow = { life: 0.38, maxLife: 0.38, color: level >= 5 ? '#fff5a8' : '#8de8ff' };
      return true;
    }

    if (type === 'skill-ready') {
      this.skillReady = { life: 0.32, maxLife: 0.32 };
      return true;
    }
    if (type === 'skill-activate') {
      this.skillActivate = { life: 0.14, maxLife: 0.14 };
      return true;
    }
    if (type === 'fever-start') {
      this.feverStart = { life: 0.46, maxLife: 0.46 };
      this.flash = { life: 0.14, maxLife: 0.14, alpha: 0.22, color: '#fff0a0' };
      this.edgeGlow = { life: 0.5, maxLife: 0.5, color: '#ffe477' };
      return true;
    }
    if (type === 'result') {
      this.result = { elapsed: 0, stats: { ...(payload.stats || payload) }, completed: false };
      return true;
    }
    return false;
  }

  syncSkillReady(ready) {
    const value = !!ready;
    if (value && !this.lastSkillReady) this.emit('skill-ready');
    this.lastSkillReady = value;
  }

  setChain(count, x = 0, y = 0) {
    if (!this.enabled) return;
    this.revision += 1;
    const nextLevel = resolveChainAnticipationLevel(count);
    if (nextLevel > this.chain.peakLevel) {
      this.chain.pulse = 0.24;
      this.addParticles(x, y, nextLevel >= 3 ? 5 : 3, '#fff5a8', 55 + nextLevel * 12);
    }
    this.chain.count = Math.max(0, Number(count) || 0);
    this.chain.level = nextLevel;
    this.chain.peakLevel = Math.max(this.chain.peakLevel, nextLevel);
    this.chain.x = x;
    this.chain.y = y;
    if (this.chain.count <= 0) {
      this.chain.pulse = 0;
      this.chain.peakLevel = 0;
    }
  }

  update(dt) {
    const step = Math.max(0, Number(dt) || 0);
    this.revision += 1;
    this.elapsed += step;
    this.chain.pulse = Math.max(0, this.chain.pulse - step);
    for (const key of ['shake', 'flash', 'afterglow', 'edgeGlow', 'combo', 'skillReady', 'skillActivate', 'feverStart']) {
      this[key].life = Math.max(0, this[key].life - step);
    }
    this.hitStop.life = Math.max(0, this.hitStop.life - step);
    this.recentBombChainLife = Math.max(0, this.recentBombChainLife - step);
    if (this.hitStop.life <= 0) {
      this.hitStop.pendingCapture = false;
      this.hitStop.captured = false;
    }
    for (let i = this.particles.length - 1; i >= 0; i -= 1) {
      const particle = this.particles[i];
      particle.life -= step;
      particle.x += particle.vx * step;
      particle.y += particle.vy * step;
      particle.vy += 90 * step;
      if (particle.life <= 0) this.particles.splice(i, 1);
    }
    for (let i = this.rings.length - 1; i >= 0; i -= 1) {
      const ring = this.rings[i];
      if (ring.delay > 0) {
        ring.delay -= step;
        continue;
      }
      ring.life -= step;
      ring.radius += ring.growth * step;
      if (ring.life <= 0) this.rings.splice(i, 1);
    }
    if (this.result) {
      this.result.elapsed += step;
      this.result.completed = this.result.elapsed >= 1;
    }
  }

  capturePendingFrame(sourceCanvas) {
    if (!this.hitStop.pendingCapture || !sourceCanvas || typeof document === 'undefined') return false;
    const snapshot = this._snapshotCanvas || document.createElement('canvas');
    if (snapshot.width !== sourceCanvas.width) snapshot.width = sourceCanvas.width;
    if (snapshot.height !== sourceCanvas.height) snapshot.height = sourceCanvas.height;
    const context = snapshot.getContext('2d');
    if (!context) return false;
    context.drawImage(sourceCanvas, 0, 0);
    this._snapshotCanvas = snapshot;
    this.hitStop.pendingCapture = false;
    this.hitStop.captured = true;
    this.revision += 1;
    return true;
  }

  getResultPresentation(fallbackStats = {}) {
    if (!this.result) {
      return { score: Number(fallbackStats.finalScore) || 0, scoreScale: 1, revealedStats: 5, completed: true };
    }
    const elapsed = this.result.elapsed;
    const stats = this.result.stats;
    const finalScore = Number(stats.finalScore) || 0;
    const score = Math.round(finalScore * getResultScoreProgress(elapsed));
    const popProgress = clamp((elapsed - 0.75) / 0.18, 0, 1);
    const scoreScale = popProgress > 0 ? 1 + Math.sin(popProgress * Math.PI) * 0.12 : 1;
    const revealedStats = clamp(Math.floor((elapsed - 0.16) / 0.11) + 1, 0, 5);
    return { score, scoreScale, revealedStats, completed: this.result.completed, elapsed };
  }

  getRenderState() {
    if (this._cachedRenderState && this._cachedRenderRevision === this.revision) {
      return this._cachedRenderState;
    }
    const quality = this.quality();
    const shakeRatio = this.shake.maxLife > 0 ? this.shake.life / this.shake.maxLife : 0;
    const shakeAmount = this.shake.amount * shakeRatio * quality.shakeScale;
    const phase = this.elapsed * 73 + this.shake.seed * 1.7;
    this._cachedRenderState = {
      elapsed: this.elapsed,
      chain: { ...this.chain },
      particles: this.particles,
      rings: this.rings,
      flash: { ...this.flash, alpha: this.flash.alpha * quality.flashScale },
      afterglow: this.afterglow,
      edgeGlow: this.edgeGlow,
      combo: this.combo,
      skillReady: this.skillReady,
      skillActivate: this.skillActivate,
      feverStart: this.feverStart,
      shakeX: Math.sin(phase) * shakeAmount,
      shakeY: Math.cos(phase * 1.31) * shakeAmount * 0.75,
      hitStopActive: this.hitStop.life > 0 && this.hitStop.captured,
      snapshotCanvas: this._snapshotCanvas,
      quality
    };
    this._cachedRenderRevision = this.revision;
    return this._cachedRenderState;
  }
}

export function drawGameFeelField(ctx, state, bounds) {
  if (!state || !bounds) return;
  const { top, bottom, left = 0, right } = bounds;
  ctx.save();
  ctx.beginPath();
  ctx.rect(left, top, right - left, bottom - top);
  ctx.clip();

  if (state.afterglow.life > 0) {
    const ratio = state.afterglow.life / state.afterglow.maxLife;
    const gradient = ctx.createRadialGradient(state.afterglow.x, state.afterglow.y, 8, state.afterglow.x, state.afterglow.y, 175);
    gradient.addColorStop(0, `rgba(255,250,190,${(0.18 * ratio * state.quality.gameFeelScale).toFixed(3)})`);
    gradient.addColorStop(1, 'rgba(255,220,90,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(left, top, right - left, bottom - top);
  }
  for (const ring of state.rings) {
    if (ring.delay > 0) continue;
    ctx.save();
    ctx.globalAlpha = clamp(ring.life / ring.maxLife, 0, 1) * state.quality.gameFeelScale;
    ctx.strokeStyle = ring.color;
    ctx.lineWidth = 1.5 + ring.level * 0.65;
    ctx.beginPath();
    ctx.arc(ring.x, ring.y, ring.radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
  for (const particle of state.particles) {
    ctx.save();
    ctx.globalAlpha = clamp(particle.life / particle.maxLife, 0, 1);
    ctx.fillStyle = particle.color;
    ctx.beginPath();
    ctx.arc(particle.x, particle.y, particle.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  if (state.flash.life > 0) {
    const ratio = state.flash.life / state.flash.maxLife;
    ctx.globalAlpha = state.flash.alpha * ratio;
    ctx.fillStyle = state.flash.color;
    ctx.fillRect(left, top, right - left, bottom - top);
  }
  ctx.restore();
}

export function drawGameFeelHud(ctx, state, options = {}) {
  if (!state) return;
  const { width = 414, height = 736, skillRect, feverRect, feverGauge = 0, feverActive = false } = options;
  const feverLevel = resolveFeverAnticipation(feverGauge, feverActive);
  if (feverRect && feverLevel > 0 && !feverActive) {
    const pulseSpeed = feverLevel >= 3 ? 5 : feverLevel >= 2 ? 3 : 0;
    const pulse = pulseSpeed ? 0.7 + Math.sin(state.elapsed * pulseSpeed) * 0.3 : 0.55;
    ctx.save();
    ctx.globalAlpha = (0.16 + feverLevel * 0.05) * pulse * state.quality.gameFeelScale;
    ctx.strokeStyle = feverLevel >= 3 ? '#fff3a0' : '#75edff';
    ctx.lineWidth = 3 + feverLevel;
    ctx.shadowBlur = 8 + feverLevel * 5;
    ctx.shadowColor = ctx.strokeStyle;
    ctx.strokeRect(feverRect.x - 3, feverRect.y - 3, feverRect.w + 6, feverRect.h + 6);
    ctx.restore();
  }
  if (skillRect && (state.skillReady.life > 0 || state.skillActivate.life > 0)) {
    const effect = state.skillActivate.life > 0 ? state.skillActivate : state.skillReady;
    const ratio = effect.life / effect.maxLife;
    ctx.save();
    ctx.globalAlpha = ratio * state.quality.gameFeelScale;
    ctx.strokeStyle = '#fff19a';
    ctx.lineWidth = 3;
    ctx.shadowBlur = 16;
    ctx.shadowColor = '#ffd65c';
    const pad = 5 + (1 - ratio) * 12;
    ctx.beginPath();
    ctx.arc(skillRect.x + skillRect.w * 0.5, skillRect.y + skillRect.h * 0.5, Math.max(skillRect.w, skillRect.h) * 0.5 + pad, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
  if (state.combo.life > 0 && state.combo.level >= 2) {
    const ratio = state.combo.life / state.combo.maxLife;
    ctx.save();
    ctx.globalAlpha = ratio * state.quality.gameFeelScale;
    ctx.strokeStyle = state.combo.level >= 4 ? '#8de8ff' : '#fff29a';
    ctx.lineWidth = 2 + state.combo.level * 0.7;
    ctx.shadowBlur = 8 + state.combo.level * 3;
    ctx.shadowColor = ctx.strokeStyle;
    ctx.beginPath();
    ctx.arc(width * 0.5, 145, 54 + (1 - ratio) * (20 + state.combo.level * 5), 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
  if (feverRect && state.feverStart.life > 0) {
    const elapsed = state.feverStart.maxLife - state.feverStart.life;
    const contraction = elapsed < 0.07 ? 1 - (elapsed / 0.07) * 0.06 : 1;
    ctx.save();
    ctx.translate(feverRect.x + feverRect.w * 0.5, feverRect.y + feverRect.h * 0.5);
    ctx.scale(contraction, contraction);
    ctx.globalAlpha = clamp(state.feverStart.life / state.feverStart.maxLife, 0, 1) * state.quality.gameFeelScale;
    ctx.strokeStyle = '#fff2a0';
    ctx.lineWidth = 4;
    ctx.shadowBlur = 18;
    ctx.shadowColor = '#ffd95d';
    ctx.strokeRect(-feverRect.w * 0.5 - 4, -feverRect.h * 0.5 - 4, feverRect.w + 8, feverRect.h + 8);
    ctx.restore();
  }
  if (state.edgeGlow.life > 0) {
    const ratio = state.edgeGlow.life / state.edgeGlow.maxLife;
    ctx.save();
    ctx.globalAlpha = ratio * 0.32 * state.quality.gameFeelScale;
    ctx.strokeStyle = state.edgeGlow.color;
    ctx.lineWidth = 10;
    ctx.shadowBlur = 18;
    ctx.shadowColor = state.edgeGlow.color;
    ctx.strokeRect(4, 4, width - 8, height - 8);
    ctx.restore();
  }
}
