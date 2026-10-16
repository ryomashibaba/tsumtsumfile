import { createStandardVisuals } from '../../tdk/standardVisuals.js';
const time = game => game.autoChainNow?.() ?? performance.now();
export default {
  ...createStandardVisuals('#38e5cf', 'AUTO CHAIN'),
  burst(game, nodes, finish) {
    const v = game.autoChainVisual;
    const perNode = finish ? 9 : 5;
    const budget = 480;
    const chosen = nodes.filter((_, i) => i % Math.max(1, Math.ceil(nodes.length * perNode / budget)) === 0);
    for (const n of chosen) for (let i = 0; i < perNode; i++) {
      const angle = i * Math.PI * 2 / perNode + Math.random() * 0.8;
      v.particles.push({ x: n.x, y: n.y, vx: Math.cos(angle) * (30 + Math.random() * 120),
        vy: Math.sin(angle) * (30 + Math.random() * 120), at: time(game),
        life: finish ? 750 : 420, size: finish ? 4 : 2.5, gold: i % 3 === 0 });
    }
    v.particles = v.particles.slice(-budget);
    if (finish) game.createShockwave?.(207, 360, '#fff1b1', 8, 30, 0.6, 600);
  }
};
export function drawAutoChain(ctx, game) {
  const v = game.autoChainVisual;
  if (!v) return;
  const now = time(game);
  v.particles = v.particles.filter(p => now - p.at < p.life);
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  for (const p of v.particles) {
    const age = (now - p.at) / 1000, t = (now - p.at) / p.life;
    const x = p.x + p.vx * age, y = p.y + p.vy * age;
    const r = p.size * (1 - t);
    ctx.globalAlpha = (1 - t) ** 2;
    ctx.fillStyle = p.gold ? '#ffe6a0' : '#86fff5';
    ctx.beginPath(); ctx.moveTo(x, y - r * 2.8); ctx.lineTo(x + r * 0.6, y - r * 0.6);
    ctx.lineTo(x + r * 2.8, y); ctx.lineTo(x + r * 0.6, y + r * 0.6);
    ctx.lineTo(x, y + r * 2.8); ctx.lineTo(x - r * 0.6, y + r * 0.6);
    ctx.lineTo(x - r * 2.8, y); ctx.lineTo(x - r * 0.6, y - r * 0.6); ctx.closePath(); ctx.fill();
  }
  ctx.restore();
  const session = game.skillRuntime?.sessions?.find(s => s.handlerId === 'autoChain');
  if (!session) return;
  const d = session.data, finish = d.phase === 'finish';
  const progress = finish ? Math.min(1, (now - d.finishAt) / 360) : 0;
  const ease = 1 - (1 - progress) ** 4;
  const x = 337 + (207 - 337) * ease, y = 185 + (335 - 185) * ease;
  const pulse = Math.max(0, 1 - (now - v.pulseAt) / 210);
  ctx.save(); ctx.translate(x, y); ctx.scale(1 + ease * 1.4 + pulse * 0.17, 1 + ease * 1.4 + pulse * 0.17);
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.shadowColor = '#38ffeb'; ctx.shadowBlur = 16 + pulse * 14;
  ctx.fillStyle = '#082e42'; ctx.beginPath(); ctx.roundRect(-65, -28, 130, 78, 16); ctx.fill();
  ctx.strokeStyle = '#78fff1'; ctx.lineWidth = 1; ctx.stroke();
  ctx.fillStyle = '#a6fff4'; ctx.font = '700 10px "Segoe UI", sans-serif'; ctx.fillText(finish && progress >= 0.8 ? 'FINAL BURST' : 'AUTO CHAIN', 0, -12);
  ctx.fillStyle = '#ffffff'; ctx.font = '900 36px "Segoe UI", sans-serif';
  ctx.fillText(finish && progress >= 0.8 ? String(d.finishCount) : `×${d.count}`, 0, 17);
  if (!finish) {
    ctx.shadowBlur = 0; ctx.fillStyle = '#38e5cf';
    ctx.fillRect(-48, 42, 96 * Math.max(0, (d.deadline - now) / 10000), 2);
  }
  ctx.restore();
}
