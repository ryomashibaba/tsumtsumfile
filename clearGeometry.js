export function distancePointToSegment(point, start, end) {
  const abX = end.x - start.x;
  const abY = end.y - start.y;
  const lengthSquared = abX * abX + abY * abY;
  if (lengthSquared <= 0.000001) {
    return Math.hypot(point.x - start.x, point.y - start.y);
  }
  const projection = ((point.x - start.x) * abX + (point.y - start.y) * abY) / lengthSquared;
  const t = Math.max(0, Math.min(1, projection));
  return Math.hypot(point.x - (start.x + abX * t), point.y - (start.y + abY * t));
}

export function collectIdsInCircles(nodes, centers, radius) {
  const result = new Set();
  const safeRadius = Math.max(0, radius || 0);
  for (const node of nodes || []) {
    if (!node || node.dead || node.removing || node.isBomb) {
      continue;
    }
    if ((centers || []).some((center) => Math.hypot(node.x - center.x, node.y - center.y) <= safeRadius)) {
      result.add(node.id);
    }
  }
  return result;
}

export function collectIdsAlongPolyline(nodes, positions, radius, closeLoop = false) {
  const result = new Set();
  const points = Array.isArray(positions) ? positions : [];
  if (points.length < 2) {
    return result;
  }
  const segmentCount = closeLoop && points.length > 2 ? points.length : points.length - 1;
  for (const node of nodes || []) {
    if (!node || node.dead || node.removing || node.isBomb) {
      continue;
    }
    for (let index = 0; index < segmentCount; index += 1) {
      const start = points[index];
      const end = points[(index + 1) % points.length];
      if (distancePointToSegment(node, start, end) <= radius) {
        result.add(node.id);
        break;
      }
    }
  }
  return result;
}
