// Input geometry is deliberately independent of rendering and physics radii.
export const CHAIN_INPUT_TUNING = Object.freeze({
  startRadiusScale: 1.2,
  extensionRadiusScale: 1.27,
  backtrackArmRadiusScale: 0.72,
  backtrackPreviousRadiusScale: 0.9,
  backtrackDirectionDot: 0.25,
  selectionPulseScale: 1.065,
  selectionPulseMs: 85
});

export function segmentCircleEntry(from, to, center, radius) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const lengthSquared = dx * dx + dy * dy;
  const fx = from.x - center.x;
  const fy = from.y - center.y;
  const radiusSquared = radius * radius;
  if (fx * fx + fy * fy <= radiusSquared) return 0;
  if (lengthSquared <= 1e-9) return null;
  const projection = -(fx * dx + fy * dy) / lengthSquared;
  const closest = Math.max(0, Math.min(1, projection));
  const cx = fx + closest * dx;
  const cy = fy + closest * dy;
  if (cx * cx + cy * cy > radiusSquared) return null;
  const discriminant = Math.max(0, (fx * dx + fy * dy) ** 2 - lengthSquared * (fx * fx + fy * fy - radiusSquared));
  const entry = (-(fx * dx + fy * dy) - Math.sqrt(discriminant)) / lengthSquared;
  return Math.max(0, Math.min(1, entry));
}

export function collectSegmentCandidates(from, to, nodes, getRadius, isEligible) {
  const hits = [];
  let examined = 0;
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const lengthSquared = dx * dx + dy * dy;
  for (const node of nodes) {
    if (!isEligible(node)) continue;
    examined += 1;
    const entry = segmentCircleEntry(from, to, node, getRadius(node));
    if (entry !== null) {
      const progress = lengthSquared > 1e-9
        ? Math.max(0, Math.min(1, ((node.x - from.x) * dx + (node.y - from.y) * dy) / lengthSquared))
        : 0;
      hits.push({ node, entry, progress });
    }
  }
  hits.sort((a, b) => a.entry - b.entry || a.progress - b.progress);
  return { hits, examined };
}

export function shouldArmBacktrack(from, to, current, currentRadius, tuning = CHAIN_INPUT_TUNING) {
  return Math.hypot(to.x - current.x, to.y - current.y) >= currentRadius * tuning.backtrackArmRadiusScale &&
    Math.hypot(to.x - from.x, to.y - from.y) > 0;
}

export function shouldBacktrack(from, to, current, previous, previousRadius, tuning = CHAIN_INPUT_TUNING) {
  const motionX = to.x - from.x;
  const motionY = to.y - from.y;
  const towardX = previous.x - current.x;
  const towardY = previous.y - current.y;
  const lengths = Math.hypot(motionX, motionY) * Math.hypot(towardX, towardY);
  if (lengths < 1e-9 || (motionX * towardX + motionY * towardY) / lengths < tuning.backtrackDirectionDot) return false;
  const toPrevious = Math.hypot(to.x - previous.x, to.y - previous.y);
  const toCurrent = Math.hypot(to.x - current.x, to.y - current.y);
  return toPrevious <= previousRadius * tuning.backtrackPreviousRadiusScale && toPrevious < toCurrent;
}
