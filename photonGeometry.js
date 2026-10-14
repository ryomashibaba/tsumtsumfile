import { WIDTH, FIELD_TOP, FIELD_BOTTOM } from './config.js';
import { distancePointToSegment } from './clearGeometry.js';

const EPS = 1e-5;
const cross = (a, b) => a.x * b.y - a.y * b.x;
const subtract = (a, b) => ({ x: a.x - b.x, y: a.y - b.y });
export const insidePhotonBoard = p => p.x >= -EPS && p.x <= WIDTH + EPS && p.y >= FIELD_TOP - EPS && p.y <= FIELD_BOTTOM + EPS;
const live = n => n && !n.dead && !n.removing && !n.isBomb && insidePhotonBoard(n);

export function photonThread(chain, width) {
  if (chain.length < 3) return null;
  let a = chain[0], b = chain.at(-1);
  if (Math.hypot(b.x - a.x, b.y - a.y) < 40) {
    let longest = 0;
    for (let i = 0; i < chain.length; i++) for (let j = i + 1; j < chain.length; j++) {
      const d = Math.hypot(chain[j].x - chain[i].x, chain[j].y - chain[i].y);
      if (d > longest) { longest = d; a = chain[i]; b = chain[j]; }
    }
  }
  const length = Math.hypot(b.x - a.x, b.y - a.y);
  const direction = length > EPS ? { x: (b.x - a.x) / length, y: (b.y - a.y) / length } : { x: 1, y: 0 };
  const cuts = [];
  if (Math.abs(direction.x) > EPS) for (const x of [0, WIDTH]) {
    const t = (x - a.x) / direction.x;
    const p = { x, y: a.y + t * direction.y, t };
    if (insidePhotonBoard(p)) cuts.push(p);
  }
  if (Math.abs(direction.y) > EPS) for (const y of [FIELD_TOP, FIELD_BOTTOM]) {
    const t = (y - a.y) / direction.y;
    const p = { x: a.x + t * direction.x, y, t };
    if (insidePhotonBoard(p)) cuts.push(p);
  }
  cuts.sort((p, q) => p.t - q.t);
  if (cuts.length < 2) return null;
  return { start: { x: cuts[0].x, y: cuts[0].y }, end: { x: cuts.at(-1).x, y: cuts.at(-1).y }, width, direction };
}

export function photonIntersection(a, b, minimumAngle = 0) {
  const u = subtract(a.end, a.start), v = subtract(b.end, b.start);
  const determinant = cross(u, v);
  if (Math.abs(determinant) < EPS) return null;
  const angle = Math.acos(Math.min(1, Math.abs((u.x * v.x + u.y * v.y) / (Math.hypot(u.x, u.y) * Math.hypot(v.x, v.y))))) * 180 / Math.PI;
  if (angle + EPS < minimumAngle) return null;
  const t = cross(subtract(b.start, a.start), v) / determinant;
  const p = { x: a.start.x + u.x * t, y: a.start.y + u.y * t };
  return insidePhotonBoard(p) ? p : null;
}

export function photonCrossings(thread, previous, minimumAngle, mergeDistance) {
  const points = previous.map(beam => photonIntersection(thread, beam, minimumAngle)).filter(Boolean);
  points.sort((a, b) => a.x - b.x || a.y - b.y);
  const groups = [];
  for (const p of points) {
    const group = groups.find(g => Math.hypot(g.x - p.x, g.y - p.y) <= mergeDistance);
    if (group) { group.x = (group.x * group.count + p.x) / (group.count + 1); group.y = (group.y * group.count + p.y) / (group.count + 1); group.count++; }
    else groups.push({ ...p, count: 1 });
  }
  return groups;
}

export function photonLineTargets(nodes, beams, tracedIds = new Set(), radius = n => n.radius || 0) {
  return nodes.filter(n => n && !n.dead && !n.removing && !n.isBomb &&
    (tracedIds.has(n.id) || (insidePhotonBoard(n) && beams.some(b => distancePointToSegment(n, b.start, b.end) <= b.width / 2 + radius(n)))));
}
export function photonCircleTargets(nodes, centers, blastRadius, radius = n => n.radius || 0) {
  return nodes.filter(n => live(n) && centers.some(c => Math.hypot(n.x - c.x, n.y - c.y) <= blastRadius + radius(n)));
}
export function photonInPolygon(p, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i], b = polygon[j];
    if (distancePointToSegment(p, a, b) < EPS) return true;
    if ((a.y > p.y) !== (b.y > p.y) && p.x < (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

// The planar graph contains only laser-to-laser edges. No field-wall edge is
// ever inserted. Walking left-hand faces yields disjoint, elementary regions;
// another thread divides an old face instead of retaining overlapping unions.
export function photonZones(beams, minimumAreaFraction = 0.03) {
  const vertices = [], lineVertices = beams.map(() => []);
  function vertex(p) {
    let index = vertices.findIndex(v => Math.hypot(v.x - p.x, v.y - p.y) < 0.01);
    if (index < 0) { index = vertices.length; vertices.push({ ...p, neighbors: new Set() }); }
    return index;
  }
  for (let i = 0; i < beams.length; i++) for (let j = i + 1; j < beams.length; j++) {
    const p = photonIntersection(beams[i], beams[j]);
    if (!p) continue;
    const id = vertex(p); lineVertices[i].push(id); lineVertices[j].push(id);
  }
  for (let i = 0; i < beams.length; i++) {
    const beam = beams[i], direction = subtract(beam.end, beam.start);
    const ids = [...new Set(lineVertices[i])].sort((a, b) =>
      (vertices[a].x - vertices[b].x) * direction.x + (vertices[a].y - vertices[b].y) * direction.y);
    for (let j = 1; j < ids.length; j++) { vertices[ids[j - 1]].neighbors.add(ids[j]); vertices[ids[j]].neighbors.add(ids[j - 1]); }
  }
  const ordered = vertices.map(v => [...v.neighbors].sort((a, b) => Math.atan2(vertices[a].y - v.y, vertices[a].x - v.x) - Math.atan2(vertices[b].y - v.y, vertices[b].x - v.x)));
  const visited = new Set(), zones = [];
  for (let a = 0; a < vertices.length; a++) for (const b of ordered[a]) {
    if (visited.has(`${a}:${b}`)) continue;
    let from = a, to = b; const ids = [];
    for (let step = 0; step < 100; step++) {
      const key = `${from}:${to}`;
      if (visited.has(key)) break;
      visited.add(key); ids.push(from);
      const neighbors = ordered[to];
      const next = neighbors[(neighbors.indexOf(from) + neighbors.length - 1) % neighbors.length];
      from = to; to = next;
      if (from === a && to === b) break;
    }
    if (from !== a || to !== b || ids.length < 3 || new Set(ids).size !== ids.length) continue;
    const polygon = ids.map(id => ({ x: vertices[id].x, y: vertices[id].y }));
    const area = polygon.reduce((sum, p, i) => { const q = polygon[(i + 1) % polygon.length]; return sum + p.x * q.y - p.y * q.x; }, 0) / 2;
    if (area + EPS < WIDTH * (FIELD_BOTTOM - FIELD_TOP) * minimumAreaFraction) continue;
    zones.push({ polygon, area, key: polygon.map(p => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).sort().join('|') });
  }
  return zones.sort((a, b) => b.area - a.area || a.key.localeCompare(b.key));
}

// Tiny search spaces (<=5 threads, <=4 crossings) allow exhaustive union
// maximization, including cases where the individually largest pair overlaps.
export function photonBestCombination(items, limit, targetsFor, excluded = new Set()) {
  let best = [], bestCount = -1;
  const targetIds = items.map(item => new Set(targetsFor(item).map(n => n.id).filter(id => !excluded.has(id))));
  function search(start, chosen, ids) {
    if (ids.size > bestCount || (ids.size === bestCount && chosen.length > best.length)) { best = chosen.slice(); bestCount = ids.size; }
    if (chosen.length >= limit) return;
    for (let i = start; i < items.length; i++) search(i + 1, [...chosen, items[i]], new Set([...ids, ...targetIds[i]]));
  }
  search(0, [], new Set());
  return best;
}
export function photonZoneTargets(nodes, zones) { return nodes.filter(n => live(n) && zones.some(z => photonInPolygon(n, z.polygon))); }
