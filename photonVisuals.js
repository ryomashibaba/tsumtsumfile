import { WIDTH, FIELD_TOP, FIELD_BOTTOM, FIELD_CENTER_X } from './config.js';
import { drawTsumArtwork } from './tsumImages.js?v=render-quality-1';
import { getLaserWeaveSession, getPhotonPreview, LASER_WEAVE_TUNING } from './laserWeave.js';

const CYAN = '#70efff', WHITE = '#f2fcff', PINK = '#ff7cdb', GOLD = '#ffe6a3';
const TAU = Math.PI * 2;
const clamp = n => Math.max(0, Math.min(1, n));
function polygon(ctx, points) {
  ctx.beginPath(); points.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)); ctx.closePath();
}
function stroke(ctx, beam, width, color, alpha = 1) {
  ctx.globalAlpha = alpha; ctx.strokeStyle = color; ctx.lineWidth = width;
  ctx.beginPath(); ctx.moveTo(beam.start.x, beam.start.y); ctx.lineTo(beam.end.x, beam.end.y); ctx.stroke();
}
function diamond(ctx, x, y, radius, color, alpha = 1) {
  ctx.globalAlpha = alpha; ctx.strokeStyle = color; ctx.lineWidth = 1;
  polygon(ctx, [{ x, y: y - radius }, { x: x + radius, y }, { x, y: y + radius }, { x: x - radius, y }]); ctx.stroke();
}
function drawZone(ctx, zone, age, detail, candidate = false, intensity = 1) {
  const points = zone.polygon;
  ctx.save(); polygon(ctx, points);
  const bounds = { x: Math.min(...points.map(p => p.x)), y: Math.min(...points.map(p => p.y)), right: Math.max(...points.map(p => p.x)), bottom: Math.max(...points.map(p => p.y)) };
  const gradient = ctx.createLinearGradient(bounds.x, bounds.y, bounds.right, bounds.bottom);
  gradient.addColorStop(0, 'rgba(113,234,255,0.08)'); gradient.addColorStop(0.55, 'rgba(181,143,255,0.19)'); gradient.addColorStop(1, 'rgba(255,127,225,0.06)');
  ctx.globalAlpha = intensity; ctx.fillStyle = gradient; ctx.fill(); ctx.clip();
  // Two fine diagonal thread families create a woven hologram rather than a
  // solid neon triangle. Everything is clipped to the actual elementary face.
  ctx.strokeStyle = CYAN; ctx.lineWidth = 0.65; ctx.globalAlpha = (candidate ? 0.18 : 0.3) * intensity;
  const spacing = detail ? 15 : 30;
  for (let x = bounds.x - 500; x < bounds.right + 500; x += spacing) {
    ctx.beginPath(); ctx.moveTo(x, bounds.y); ctx.lineTo(x + 400, bounds.bottom); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x, bounds.y); ctx.lineTo(x - 400, bounds.bottom); ctx.stroke();
  }
  if (detail) {
    const cy = (bounds.y + bounds.bottom) / 2, cx = (bounds.x + bounds.right) / 2;
    ctx.globalAlpha = 0.25 * intensity; ctx.strokeStyle = GOLD;
    for (let r = 18; r < 180; r += 26) {
      const vertices = Array.from({ length: 6 }, (_, i) => ({ x: cx + Math.cos(i * TAU / 6 + age / 12000) * r, y: cy + Math.sin(i * TAU / 6 + age / 12000) * r }));
      polygon(ctx, vertices); ctx.stroke();
    }
    const scan = bounds.y + (age / 9 % Math.max(1, bounds.bottom - bounds.y));
    ctx.globalAlpha = 0.15; ctx.fillStyle = WHITE; ctx.fillRect(bounds.x, scan, bounds.right - bounds.x, 1.5);
  }
  ctx.restore();
  ctx.save(); polygon(ctx, points); ctx.strokeStyle = candidate ? PINK : CYAN;
  ctx.globalAlpha = (candidate ? 0.5 : 0.7) * intensity; ctx.lineWidth = 1.2; if (candidate) ctx.setLineDash([4, 5]); ctx.stroke();
  if (detail && !candidate) {
    ctx.setLineDash([9, 28]); ctx.lineDashOffset = -age / 18; ctx.strokeStyle = WHITE; ctx.lineWidth = 2; ctx.stroke();
  }
  ctx.setLineDash([]);
  for (const p of points) diamond(ctx, p.x, p.y, 3, GOLD, 0.8 * intensity);
  ctx.restore();
}
function drawResidual(ctx, beam, age, detail, energized = 0) {
  stroke(ctx, beam, 3 + energized * 5, '#0a354d', 0.65);
  stroke(ctx, beam, 0.9 + energized * 1.5, CYAN, 0.48 + energized * 0.5);
  if (detail || energized) {
    const dx = beam.end.x - beam.start.x, dy = beam.end.y - beam.start.y;
    for (let i = 0; i < 3; i++) {
      const t = (age / (energized ? 700 : 2600) + i / 3) % 1;
      diamond(ctx, beam.start.x + dx * t, beam.start.y + dy * t, 2.5 + energized * 2, WHITE, 0.7);
    }
  }
}
function drawThread(ctx, beam, age, detail, force = 1) {
  const attack = clamp(1 - age / 170), fade = clamp(1 - Math.max(0, age - 150) / 430);
  const dx = beam.end.x - beam.start.x, dy = beam.end.y - beam.start.y, length = Math.hypot(dx, dy) || 1;
  const nx = -dy / length, ny = dx / length;
  ctx.save(); ctx.lineCap = 'butt';
  const gradient = ctx.createLinearGradient(beam.start.x - nx * beam.width, beam.start.y - ny * beam.width, beam.start.x + nx * beam.width, beam.start.y + ny * beam.width);
  gradient.addColorStop(0, 'rgba(44,168,255,0)'); gradient.addColorStop(0.3, 'rgba(37,170,255,0.5)'); gradient.addColorStop(0.5, CYAN); gradient.addColorStop(0.7, 'rgba(72,223,255,0.5)'); gradient.addColorStop(1, 'rgba(44,168,255,0)');
  if (detail) { ctx.shadowColor = CYAN; ctx.shadowBlur = 12; }
  stroke(ctx, beam, beam.width * 2 * force, gradient, fade * 0.75);
  ctx.shadowBlur = 0;
  stroke(ctx, beam, beam.width * force, CYAN, fade * (0.36 + attack * 0.38));
  stroke(ctx, beam, Math.max(2, beam.width * 0.23 * force), WHITE, fade);
  // Sharp perpendicular fins converge into the white cutting core.
  if (detail) for (let i = 1; i <= 12; i++) {
    const t = i / 13, x = beam.start.x + dx * t, y = beam.start.y + dy * t;
    const reach = 5 + attack * 19;
    ctx.globalAlpha = fade * attack * 0.7; ctx.strokeStyle = i % 2 ? WHITE : CYAN; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x + nx * reach - dx / length * 8, y + ny * reach - dy / length * 8);
    ctx.lineTo(x, y); ctx.lineTo(x - nx * reach - dx / length * 8, y - ny * reach - dy / length * 8); ctx.stroke();
  }
  ctx.restore();
}
function drawFragments(ctx, ghosts, age, detail, color = CYAN) {
  if (age > 440) return;
  const t = age / 440, fade = (1 - t) ** 1.5;
  for (const [index, ghost] of (ghosts || []).slice(0, detail ? 28 : 10).entries()) {
    if (detail && age < 150) {
      for (let part = 0; part < 4; part++) {
        const sx = part % 2 ? 1 : -1, sy = part < 2 ? -1 : 1;
        ctx.save(); ctx.translate(sx * t * 22, sy * t * 22); ctx.globalAlpha = fade * clamp(1 - age / 150);
        ctx.beginPath(); ctx.rect(ghost.x + (sx < 0 ? -ghost.radius : 0), ghost.y + (sy < 0 ? -ghost.radius : 0), ghost.radius, ghost.radius); ctx.clip();
        drawTsumArtwork(ctx, ghost.type, ghost.x, ghost.y, ghost.radius, { fit: 'cover' }); ctx.restore();
      }
    }
    for (let part = 0; part < (detail ? 5 : 2); part++) {
      const angle = index * 2.399 + part * TAU / 5;
      const travel = t * (17 + part * 8);
      const x = ghost.x + Math.cos(angle) * travel, y = ghost.y + Math.sin(angle) * travel;
      ctx.save(); ctx.translate(x, y); ctx.rotate(angle + t); ctx.globalAlpha = fade * 0.9;
      ctx.fillStyle = part % 2 ? WHITE : color;
      polygon(ctx, [{ x: -2, y: -7 * (1 - t) }, { x: 3, y: 0 }, { x: -1, y: 5 * (1 - t) }]); ctx.fill(); ctx.restore();
    }
  }
}
function drawCross(ctx, center, age, radius, detail, charging = false) {
  ctx.save(); ctx.translate(center.x, center.y);
  if (charging) {
    const p = clamp(age / 200), r = 22 * (1 - p) + 5;
    ctx.strokeStyle = PINK; ctx.lineWidth = 1.2; ctx.globalAlpha = 0.6;
    ctx.beginPath(); ctx.arc(0, 0, r, age / 80, age / 80 + Math.PI * 1.5); ctx.stroke();
    diamond(ctx, 0, 0, r * 0.7, WHITE, 0.5);
    ctx.restore(); return;
  }
  const p = clamp(age / 580), flash = clamp(1 - age / 100), fade = (1 - p) ** 1.3;
  const glow = ctx.createRadialGradient(-3, -5, 0, 0, 0, radius * (0.35 + p));
  glow.addColorStop(0, `rgba(255,247,255,${flash * 0.85})`); glow.addColorStop(0.22, `rgba(255,154,226,${fade * 0.4})`); glow.addColorStop(1, 'rgba(225,50,188,0)');
  ctx.globalAlpha = 1; ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(0, 0, radius * (0.35 + p), 0, TAU); ctx.fill();
  for (let layer = 0; layer < (detail ? 3 : 1); layer++) {
    ctx.save(); ctx.rotate(layer * 0.7);
    ctx.globalAlpha = fade * (0.75 - layer * 0.15); ctx.strokeStyle = layer === 0 ? WHITE : PINK; ctx.lineWidth = 2.5 - layer * 0.6;
    const r = radius * clamp(p * 2.4 - layer * 0.12);
    ctx.beginPath(); ctx.ellipse(0, 0, Math.max(1, r), Math.max(1, r * (layer ? 0.48 : 1)), 0, 0, TAU); ctx.stroke(); ctx.restore();
  }
  if (detail) for (let i = 0; i < 18; i++) {
    const angle = i * 2.399, r = (12 + p * radius) * (0.7 + i % 3 * 0.18);
    ctx.save(); ctx.translate(Math.cos(angle) * r, Math.sin(angle) * r * 0.85); ctx.rotate(angle);
    ctx.globalAlpha = fade; ctx.fillStyle = i % 3 ? PINK : WHITE;
    polygon(ctx, [{ x: -4, y: -2 }, { x: 9 * (1 - p), y: 0 }, { x: -1, y: 3 }]); ctx.fill(); ctx.restore();
  }
  ctx.restore();
}
function drawPreview(ctx, preview, age, detail, radius) {
  ctx.save();
  stroke(ctx, preview.beam, preview.beam.width, CYAN, 0.14);
  ctx.setLineDash([8, 6]); ctx.lineDashOffset = -age / 30; stroke(ctx, preview.beam, 1.2, WHITE, 0.7); ctx.setLineDash([]);
  for (const node of preview.targets) {
    ctx.globalAlpha = 0.75; ctx.lineWidth = 1.4; ctx.strokeStyle = CYAN;
    ctx.beginPath(); ctx.arc(node.x, node.y, radius(node) + 3, 0, TAU); ctx.stroke();
  }
  // Dashed blast circles deliberately communicate a delayed, moving-board
  // prediction. The solid target outlines refer to the immediate thread only.
  for (const p of preview.crossings) {
    diamond(ctx, p.x, p.y, 7, PINK, 0.9);
    ctx.setLineDash([2, 7]); ctx.globalAlpha = 0.26; ctx.strokeStyle = PINK; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(p.x, p.y, 17, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
  }
  for (const z of preview.zones) drawZone(ctx, z, age, detail, true);
  ctx.restore();
}

export function drawLaserWeave(ctx, game, profile) {
  const session = getLaserWeaveSession(game), visual = game.laserWeaveVisual;
  if (!session && !visual?.bursts.length) return;
  const decorated = game.skillVisualsEnabled !== false;
  const detail = decorated && profile.skillVisualDetail === 'full';
  const data = session?.data, age = visual?.activationAgeMs || 0;
  ctx.save(); ctx.beginPath(); ctx.rect(0, FIELD_TOP, WIDTH, FIELD_BOTTOM - FIELD_TOP); ctx.clip(); ctx.lineCap = 'round';
  const finishing = data && ['ignitionCharge', 'cascadeRefill', 'cascadeTail', 'finalRefill'].includes(data.phase);
  if (finishing && decorated) { ctx.globalAlpha = 1; ctx.fillStyle = 'rgba(4,10,34,0.18)'; ctx.fillRect(0, FIELD_TOP, WIDTH, FIELD_BOTTOM - FIELD_TOP); }
  if (data) {
    const energy = data.phase === 'ignitionCharge' ? clamp(data.phaseAgeMs / LASER_WEAVE_TUNING.ignitionChargeMs) : 0;
    for (const zone of data.zones) drawZone(ctx, zone, age, detail, false, decorated ? 1 : 0.45);
    for (const beam of data.beams) drawResidual(ctx, beam, age, detail, decorated ? energy : 0);
    if (data.phase === 'thread' && decorated) for (const p of data.crossings) drawCross(ctx, p, data.phaseAgeMs, data.blastRadius, detail, true);
    if (data.phase === 'aim') {
      const preview = getPhotonPreview(game, session);
      if (preview) {
        drawPreview(ctx, preview, age, detail, n => game.getBodyRadius?.(n) ?? n.radius ?? 0);
        if (detail) {
          const focus = game.chain.at(-1);
          ctx.save(); ctx.translate(focus.x, focus.y); ctx.strokeStyle = WHITE; ctx.lineWidth = 0.8;
          for (let i = 0; i < 3; i++) {
            const p = (age / 650 + i / 3) % 1, r = (1 - p) * 25 + 5;
            ctx.globalAlpha = Math.sin(p * Math.PI) * 0.65;
            ctx.beginPath(); ctx.arc(0, 0, r, age / 240 + i * 2, age / 240 + i * 2 + 1.4); ctx.stroke();
          }
          ctx.restore();
        }
      }
    }
  }
  if (decorated) for (const burst of visual?.bursts || []) {
    if (['thread', 'ignition', 'cascade'].includes(burst.kind)) {
      for (const beam of burst.beams) drawThread(ctx, beam, burst.ageMs, detail, burst.kind === 'thread' ? 1 : 1.5);
      drawFragments(ctx, burst.ghosts, burst.ageMs, detail, burst.kind === 'cascade' ? GOLD : CYAN);
      if (burst.kind === 'ignition') for (const zone of burst.zones || []) drawZone(ctx, zone, age, detail, false, clamp(1 - burst.ageMs / 580) * 2);
    } else if (burst.kind === 'cross') {
      for (const p of burst.centers) drawCross(ctx, p, burst.ageMs, burst.radius, detail);
      drawFragments(ctx, burst.ghosts, burst.ageMs, detail, PINK);
    } else if (burst.kind === 'zone') {
      for (const z of burst.zones) {
        ctx.save(); polygon(ctx, z.polygon); ctx.globalAlpha = clamp(1 - burst.ageMs / 850) * 0.8; ctx.strokeStyle = GOLD; ctx.lineWidth = 2; ctx.stroke(); ctx.restore();
      }
    } else if (burst.kind === 'release') {
      const p = clamp(burst.ageMs / 580);
      for (const beam of burst.beams || []) for (const endpoint of [beam.start, beam.end]) diamond(ctx, endpoint.x, endpoint.y, 10 + p * 35, GOLD, 1 - p);
    } else if (burst.kind === 'activate') {
      const p = clamp(burst.ageMs / 580);
      ctx.globalAlpha = Math.sin(p * Math.PI) * 0.65; ctx.strokeStyle = CYAN; ctx.lineWidth = 1;
      for (const sign of [-1, 1]) { ctx.beginPath(); ctx.moveTo(18, FIELD_TOP + 40 + p * 60); ctx.lineTo(18, FIELD_BOTTOM - 40 - p * 60); ctx.lineTo(18 + sign * 12, FIELD_BOTTOM - 52 - p * 60); ctx.stroke(); }
    }
  }
  if (data) {
    ctx.shadowBlur = 0; ctx.globalAlpha = 1; ctx.fillStyle = 'rgba(5,17,39,0.9)'; ctx.fillRect(FIELD_CENTER_X - 131, FIELD_TOP + 7, 262, 34);
    ctx.fillStyle = WHITE; ctx.textAlign = 'left'; ctx.font = '700 11px "Trebuchet MS",sans-serif'; ctx.fillText('PHOTON LOOM', FIELD_CENTER_X - 119, FIELD_TOP + 22);
    for (let i = 0; i < data.threadLimit; i++) {
      diamond(ctx, FIELD_CENTER_X + 13 + i * 19, FIELD_TOP + 20, 5, i < data.beams.length ? WHITE : '#476281');
      if (i < data.beams.length) { ctx.globalAlpha = 0.8; ctx.fillStyle = CYAN; ctx.fill(); }
    }
    ctx.globalAlpha = 1; ctx.textAlign = 'center'; ctx.fillStyle = finishing ? GOLD : '#a4c5db'; ctx.font = '9px sans-serif';
    const label = data.phase === 'aim' ? '3個以上をなぞって光糸を織る' : data.phase.startsWith('thread') ? (data.crossings.length ? 'CROSS BURST · RESONANCE' : 'PHOTON THREAD') : data.phase.startsWith('cascade') ? 'REFILL CASCADE' : 'NETWORK IGNITION';
    ctx.fillText(label, FIELD_CENTER_X, FIELD_TOP + 35);
  }
  ctx.restore();
}
