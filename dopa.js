import { FIELD_LEFT, FIELD_RIGHT, FIELD_TOP, FIELD_BOTTOM, FIELD_CENTER_X, FIELD_CENTER_Y } from './config.js';

export const DOPA_TUNING = Object.freeze({
  speed: 1550,
  speedPerTsum: 65,
  maxSpeed: 3400,
  launchInterval: 0.105,
  minLaunchInterval: 0.008,
  launchAcceleration: 0.86,
  earlyLaunchMultiplier: 5,
  earlyLaunchFraction: 0.65,
  simulationStep: 1 / 240,
  distancePerOrder: 100,
  growth: 1.1,
  maxVisualDiameter: 80,
  trailLife: 0.16,
  maxTrails: 360,
  maxSparks: 100,
  clearDuration: 0.20
});

const EPS = 1e-7;
const bounds = { left: FIELD_LEFT, right: FIELD_RIGHT, top: FIELD_TOP, bottom: FIELD_BOTTOM };

// Relative swept circles also catch two flyers crossing between displayed frames.
function sweptTouch(a, b, starts, radius) {
  const sa = starts.get(a.id) || a;
  const sb = starts.get(b.id) || b;
  const x = sa.x - sb.x;
  const y = sa.y - sb.y;
  const dx = (a.x - sa.x) - (b.x - sb.x);
  const dy = (a.y - sa.y) - (b.y - sb.y);
  const length2 = dx * dx + dy * dy;
  const t = length2 > EPS ? Math.max(0, Math.min(1, -(x * dx + y * dy) / length2)) : 0;
  return (x + dx * t) ** 2 + (y + dy * t) ** 2 <= radius ** 2 + EPS;
}

export class DopaFlight {
  constructor(game, chain, tuning = {}) {
    this.game = game;
    this.tuning = { ...DOPA_TUNING, ...tuning };
    this.chain = chain.slice();
    this.nodes = game.tsums.filter(node => !node.dead && !node.removing);
    this.targets = new Map(chain.map(node => [node.id, node]));
    this.hits = new Map();
    this.additionalCount = 0;
    this.elapsed = 0;
    this.trails = [];
    this.sparks = [];
    this.finished = false;
    let launchAt = 0;
    const positions = chain.map(node => ({ x: node.x, y: node.y }));
    this.flyers = chain.slice(1).map((node, i) => {
      const index = i + 1;
      const dx = positions[index - 1].x - positions[index].x;
      const dy = positions[index - 1].y - positions[index].y;
      const length = Math.hypot(dx, dy) || 1;
      const flyer = {
        node, order: index + 1, launchAt, launched: false, done: false,
        ux: length === 1 && dx === 0 && dy === 0 ? -1 : dx / length,
        uy: dy / length,
        speed: Math.min(this.tuning.maxSpeed, this.tuning.speed + index * this.tuning.speedPerTsum),
        remaining: this.tuning.distancePerOrder * (index + 1),
        traveled: 0, contacts: new Set()
      };
      const earlyProgress = Math.min(1, i / Math.max(1, (chain.length - 2) * this.tuning.earlyLaunchFraction));
      const earlyMultiplier = 1 + (this.tuning.earlyLaunchMultiplier - 1) * (1 - earlyProgress) ** 2;
      launchAt += Math.max(this.tuning.minLaunchInterval,
        this.tuning.launchInterval / Math.sqrt(chain.length / 3) * this.tuning.launchAcceleration ** i * earlyMultiplier);
      return flyer;
    });
    // First shot starts on release, with no frame of ordinary board movement.
    this.launchReady();
  }

  get effectiveCount() { return this.chain.length + this.additionalCount; }

  spark(x, y, kind, hue = 170) {
    if (this.sparks.length >= this.tuning.maxSparks) this.sparks.shift();
    this.sparks.push({ x, y, kind, hue, life: 0.24, maxLife: 0.24 });
  }

  launchReady() {
    for (const flyer of this.flyers) {
      if (!flyer.launched && flyer.launchAt <= this.elapsed + EPS) {
        flyer.launched = true;
        flyer.node.vx = flyer.node.vy = 0;
        this.spark(flyer.node.x, flyer.node.y, 'launch', 170 + flyer.order * 9);
      }
    }
  }

  recordHit(flyer, target) {
    flyer.contacts.add(target.id);
    this.targets.set(target.id, target);
    this.hits.set(target.id, (this.hits.get(target.id) || 0) + 1);
    this.additionalCount += 1;
    target.dopaScale = (target.dopaScale || 1) * this.tuning.growth;
    this.spark(target.x, target.y, 'hit', 170 + flyer.order * 9);
  }

  resolveContacts(active, starts) {
    // Release only on real separation, using the current grown radius.
    for (const flyer of active) {
      const a = flyer.node;
      const sa = starts.get(a.id) || a;
      for (const b of this.nodes) {
        if (!flyer.contacts.has(b.id)) continue;
        const sb = starts.get(b.id) || b;
        const radius = this.game.getBodyRadius(a) + this.game.getBodyRadius(b);
        if (Math.hypot(sa.x - sb.x, sa.y - sb.y) > radius + EPS) flyer.contacts.delete(b.id);
      }
    }
    // Growth may introduce a contact already visited in this step. Each directed
    // pair can enter only once per step, so this settles without a hit-count cap.
    let changed;
    let firstPass = true;
    do {
      changed = false;
      for (const flyer of active) {
        for (const target of this.nodes) {
          if (target === flyer.node || flyer.contacts.has(target.id)) continue;
          const radius = this.game.getBodyRadius(flyer.node) + this.game.getBodyRadius(target);
          const touching = firstPass ? sweptTouch(flyer.node, target, starts, radius)
            : Math.hypot(flyer.node.x - target.x, flyer.node.y - target.y) <= radius + EPS;
          if (touching) {
            this.recordHit(flyer, target);
            changed = true;
          }
        }
      }
      firstPass = false;
    } while (changed);
    for (const flyer of active) {
      for (const target of this.nodes) {
        if (!flyer.contacts.has(target.id)) continue;
        const radius = this.game.getBodyRadius(flyer.node) + this.game.getBodyRadius(target);
        if (Math.hypot(flyer.node.x - target.x, flyer.node.y - target.y) > radius + EPS) {
          flyer.contacts.delete(target.id);
        }
      }
    }
  }

  update(dt) {
    if (this.finished) return;
    let remainingTime = Math.max(0, dt);
    this.trails = this.trails.filter(trail => (trail.life -= remainingTime) > 0);
    this.sparks = this.sparks.filter(spark => (spark.life -= remainingTime) > 0);
    while (remainingTime > EPS) {
      this.launchReady();
      const active = this.flyers.filter(flyer => flyer.launched && !flyer.done);
      let step = Math.min(remainingTime, this.tuning.simulationStep);
      for (const flyer of this.flyers) {
        if (!flyer.launched) step = Math.min(step, Math.max(EPS, flyer.launchAt - this.elapsed));
      }
      for (const flyer of active) {
        const node = flyer.node;
        // Reflect the trajectory at field edges. An arbitrarily grown circle can
        // exceed the board; its center still travels, with no radius/count cap.
        node.x = Math.max(bounds.left, Math.min(bounds.right, node.x));
        node.y = Math.max(bounds.top, Math.min(bounds.bottom, node.y));
        if ((node.x <= bounds.left + EPS && flyer.ux < 0) || (node.x >= bounds.right - EPS && flyer.ux > 0)) flyer.ux *= -1;
        if ((node.y <= bounds.top + EPS && flyer.uy < 0) || (node.y >= bounds.bottom - EPS && flyer.uy > 0)) flyer.uy *= -1;
        const wallX = flyer.ux > EPS ? (bounds.right - node.x) / flyer.ux : flyer.ux < -EPS ? (bounds.left - node.x) / flyer.ux : Infinity;
        const wallY = flyer.uy > EPS ? (bounds.bottom - node.y) / flyer.uy : flyer.uy < -EPS ? (bounds.top - node.y) / flyer.uy : Infinity;
        step = Math.min(step, Math.max(EPS, Math.min(wallX, wallY, flyer.remaining) / flyer.speed));
      }
      const starts = new Map(active.map(flyer => [flyer.node.id, { x: flyer.node.x, y: flyer.node.y }]));
      for (const flyer of active) {
        const node = flyer.node;
        const start = starts.get(node.id);
        const travel = Math.min(flyer.remaining, flyer.speed * step);
        node.x += flyer.ux * travel;
        node.y += flyer.uy * travel;
        flyer.traveled += travel;
        flyer.remaining = Math.max(0, flyer.remaining - travel);
        this.trails.push({ x1: start.x, y1: start.y, x2: node.x, y2: node.y,
          hue: 170 + flyer.order * 9, life: this.tuning.trailLife });
        let reflected = false;
        if (node.x <= bounds.left + EPS || node.x >= bounds.right - EPS) { flyer.ux *= -1; reflected = true; }
        if (node.y <= bounds.top + EPS || node.y >= bounds.bottom - EPS) { flyer.uy *= -1; reflected = true; }
        if (reflected) this.spark(node.x, node.y, 'wall', 45);
      }
      this.resolveContacts(active, starts);
      for (const flyer of active) {
        if (flyer.remaining <= EPS) {
          flyer.done = true;
          flyer.node.vx = flyer.node.vy = 0;
          this.spark(flyer.node.x, flyer.node.y, 'stop');
        }
      }
      this.elapsed += step;
      remainingTime -= step;
      if (this.flyers.every(flyer => flyer.done)) {
        this.finished = true;
        break;
      }
    }
    if (this.trails.length > this.tuning.maxTrails) this.trails.splice(0, this.trails.length - this.tuning.maxTrails);
  }

  clearSpec() {
    return {
      source: 'skill', scoreMode: 'chain', type: this.game.boardState.getResolvedType(this.chain[0]),
      targets: [...this.targets.values()], x: FIELD_CENTER_X, y: FIELD_CENTER_Y,
      effectiveClearCountOverride: this.effectiveCount,
      applyLargeTsumCorrection: false,
      correctionType: 'correction_-2',
      timer: this.tuning.clearDuration, pauseClock: true, pausePhysics: true,
      meta: { dopa: true }
    };
  }
}

// Keep existing correction tables intact; DOPA extends their last marginal rate.
export function getDopaCoinTable(table) {
  return new Proxy(table, {
    get(target, key, receiver) {
      const count = typeof key === 'string' && /^\d+$/.test(key) ? Number(key) : NaN;
      if (count > 317) return target[317] + (count - 317) * (target[317] - target[316]);
      return Reflect.get(target, key, receiver);
    }
  });
}

export function completeDopaFlight(game) {
  const flight = game.dopaFlight;
  if (!flight?.finished) return;
  game.dopaFlight = null;
  game.dopaVisual = { count: flight.effectiveCount, life: 1.25, maxLife: 1.25 };
  const previousClear = game.pendingClear;
  const previousQueue = game.pendingChainClearQueue;
  game.pendingClear = null;
  game.pendingChainClearQueue = [];
  const spec = flight.clearSpec();
  spec.onFinalize = () => {
    for (const node of flight.nodes) delete node.dopaScale;
    if (previousClear) {
      game.pendingClear = previousClear;
      game.pendingChainClearQueue = previousQueue;
      game.actionLock = true;
      return;
    }
    // The release pointer has already committed this chain. Drop any stale
    // pointer/bubble gesture ownership so the next pointer can start a fresh trace.
    game.dragging = false;
    for (const node of game.chain || []) node.inChain = false;
    game.chain = [];
    game.chainSet = new Set();
    game.chainTypeId = null;
    game.chainRule = null;
    game.chainBacktrackArmed = false;
    game.chainSelectedAt?.clear();
    if (game.inputRouter) game.inputRouter.pendingBubbleGesture = null;
    game.manualDragPointerId = null;
    game.manualDragPoint = null;
    game.actionLock = false;
  };
  if (!game.clearPipeline.beginClear(spec)) {
    spec.onFinalize();
    game.actionLock = !!previousClear;
  }
}

export function resetDopa(game) {
  for (const node of game.dopaFlight?.nodes || game.tsums || []) delete node.dopaScale;
  game.dopaFlight = null;
  game.dopaVisual = null;
}

export function registerDopaSkill({ SkillRegistry, skillValue }) {
  SkillRegistry.dopa = {
    id: 'dopa',
    onActivate(ctx) {
      for (const previous of ctx.runtime.getSessionsByHandlerId('dopa')) {
        ctx.runtime.endSession(previous, 'replaced', { skipEndPause: true });
      }
      ctx.game.pushCenterMessage('DOPA! つないで飛ばそう', '#75ffe4', 0.9);
      return ctx.createSession({ remainingMs: skillValue('dopa', 'durationSec', ctx.level) * 1000 });
    },
    onChainCommit(ctx, session, chain) {
      if (ctx.game.dopaFlight) return true;
      ctx.game.dopaFlight = new DopaFlight(ctx.game, chain);
      ctx.game.dopaVisual = null;
      ctx.game.centerMessages = (ctx.game.centerMessages || []).filter(message => !message.text.startsWith('DOPA!'));
      ctx.game.actionLock = true;
      // Clear any retained hit-stop snapshot so the flying board is visible.
      ctx.game.gameFeel?.reset({ skillReady: ctx.game.isSkillReadyForActivation() });
      return true;
    }
  };
}

export function drawDopaBackdrop(ctx, game) {
  if (!game.dopaFlight && !game.getActiveSkillSession?.('dopa')) return;
  ctx.save();
  ctx.fillStyle = game.dopaFlight ? 'rgba(2,12,31,0.48)' : 'rgba(3,32,49,0.22)';
  ctx.fillRect(FIELD_LEFT, FIELD_TOP, FIELD_RIGHT - FIELD_LEFT, FIELD_BOTTOM - FIELD_TOP);
  const time = game.dopaFlight?.elapsed ?? game.elapsed;
  ctx.strokeStyle = 'rgba(75,255,213,0.16)';
  ctx.lineWidth = 1;
  for (let i = 0; i < 9; i++) {
    const y = FIELD_TOP + ((i * 57 + time * 90) % (FIELD_BOTTOM - FIELD_TOP));
    ctx.beginPath(); ctx.moveTo(FIELD_LEFT, y); ctx.lineTo(FIELD_RIGHT, y - 65); ctx.stroke();
  }
  ctx.restore();
}

export function drawDopaForeground(ctx, game, { resultOnly = false, hideResult = false } = {}) {
  const flight = resultOnly ? null : game.dopaFlight;
  const session = resultOnly ? null : game.getActiveSkillSession?.('dopa');
  const result = hideResult ? null : game.dopaVisual;
  if (!flight && !session && !result) return;
  ctx.save();
  if (flight) {
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    // Trail/spark budgets limit drawing work without limiting actual contacts.
    for (const trail of flight.trails) {
      ctx.strokeStyle = `hsla(${trail.hue},100%,65%,${Math.min(0.65, trail.life / DOPA_TUNING.trailLife * 0.65)})`;
      ctx.lineWidth = 7;
      ctx.beginPath(); ctx.moveTo(trail.x1, trail.y1); ctx.lineTo(trail.x2, trail.y2); ctx.stroke();
      ctx.strokeStyle = 'rgba(230,255,255,0.8)'; ctx.lineWidth = 1.5; ctx.stroke();
    }
    for (const spark of flight.sparks) {
      const progress = 1 - spark.life / spark.maxLife;
      const radius = 7 + progress * (spark.kind === 'wall' ? 37 : 23);
      ctx.globalAlpha = 1 - progress;
      ctx.strokeStyle = `hsl(${spark.hue},100%,75%)`;
      ctx.lineWidth = 3 * (1 - progress) + 0.5;
      ctx.beginPath(); ctx.arc(spark.x, spark.y, radius, 0, Math.PI * 2); ctx.stroke();
      for (let ray = 0; ray < 6; ray++) {
        const angle = ray * Math.PI / 3 + progress;
        ctx.beginPath();
        ctx.moveTo(spark.x + Math.cos(angle) * radius, spark.y + Math.sin(angle) * radius);
        ctx.lineTo(spark.x + Math.cos(angle) * (radius + 10), spark.y + Math.sin(angle) * (radius + 10));
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }
  const count = flight?.effectiveCount ?? result?.count;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  if (count != null) {
    const burst = result ? 1 - result.life / result.maxLife : 0;
    const scale = result ? 1 + 0.18 * Math.exp(-burst * 12) : 1;
    ctx.translate(FIELD_CENTER_X, result ? FIELD_CENTER_Y : FIELD_TOP + 72);
    ctx.scale(scale, scale);
    ctx.globalAlpha = result ? Math.min(1, result.life / 0.3) : 1;
    ctx.shadowColor = '#1efcd3'; ctx.shadowBlur = 18;
    ctx.font = `900 ${result ? 68 : 39}px "Trebuchet MS", sans-serif`;
    ctx.lineWidth = 7; ctx.strokeStyle = '#082239';
    const label = `${count.toLocaleString()} CLEAR`;
    // Fit arbitrarily large counts instead of clipping them at the field edge.
    const width = ctx.measureText(label).width;
    if (width > 370) ctx.scale(370 / width, 370 / width);
    ctx.strokeText(label, 0, 0); ctx.fillStyle = '#e5fff3'; ctx.fillText(label, 0, 0);
    ctx.shadowBlur = 0; ctx.font = '800 12px "Trebuchet MS", sans-serif';
    ctx.fillStyle = '#72ffe3';
    ctx.fillText(result ? 'DOPA • BURST!' : 'DOPA • TIME FREEZE', 0, result ? -51 : -31);
  } else if (session) {
    ctx.fillStyle = 'rgba(3,20,40,0.8)';
    ctx.fillRect(FIELD_CENTER_X - 87, FIELD_TOP + 10, 174, 28);
    ctx.fillStyle = '#8affdf'; ctx.font = '800 14px "Trebuchet MS", sans-serif';
    ctx.fillText(`DOPA  ${(Math.max(0, session.remainingMs) / 1000).toFixed(1)}s`, FIELD_CENTER_X, FIELD_TOP + 24);
    ctx.fillStyle = '#41f7c5';
    ctx.fillRect(FIELD_CENTER_X - 87, FIELD_TOP + 38, 174 * Math.max(0, session.remainingMs) / ((4 + session.level) * 1000), 3);
  }
  ctx.restore();
}
