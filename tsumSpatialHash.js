export const HIGH_BODY_COUNT_BROADPHASE_THRESHOLD = 81;

const cellKey = (x, y) => `${x},${y}`;

export function shouldUseHighBodyCountBroadphase({
  cheatActive = false,
  bodyCount = 0,
  threshold = HIGH_BODY_COUNT_BROADPHASE_THRESHOLD
} = {}) {
  return cheatActive === true && Number(bodyCount) >= Number(threshold);
}

export class StableTsumSpatialHash {
  constructor() {
    this.grid = new Map();
    this.bucketPool = [];
    this.pairs = [];
    this.nearbyIndices = [];
    this.xs = [];
    this.ys = [];
    this.radii = [];
    this.lastBodyCount = 0;
    this.lastFullPairCount = 0;
    this.lastCandidatePairCount = 0;
    this.lastCellSize = 0;
    this.lastFallbackReason = null;
  }

  resetGrid() {
    let poolIndex = 0;
    for (const bucket of this.grid.values()) {
      bucket.length = 0;
      this.bucketPool[poolIndex] = bucket;
      poolIndex += 1;
    }
    this.bucketPool.length = poolIndex;
    this.grid.clear();
    this.pairs.length = 0;
    this.nearbyIndices.length = 0;
  }

  takeBucket() {
    return this.bucketPool.pop() || [];
  }

  build(bodies, options = {}) {
    this.resetGrid();
    const getX = options.getX || ((body) => body?.x);
    const getY = options.getY || ((body) => body?.y);
    const getRadius = options.getRadius || ((body) => body?.radius);
    const bodyCount = Array.isArray(bodies) ? bodies.length : 0;
    this.lastBodyCount = bodyCount;
    this.lastFullPairCount = bodyCount > 1 ? bodyCount * (bodyCount - 1) / 2 : 0;
    this.lastCandidatePairCount = 0;
    this.lastCellSize = 0;
    this.lastFallbackReason = null;

    let maxRadius = 0;
    for (let index = 0; index < bodyCount; index += 1) {
      const body = bodies[index];
      const x = Number(getX(body, index));
      const y = Number(getY(body, index));
      const radius = Number(getRadius(body, index));
      if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(radius) || radius <= 0) {
        this.lastFallbackReason = "invalid-body-geometry";
        return null;
      }
      this.xs[index] = x;
      this.ys[index] = y;
      this.radii[index] = radius;
      maxRadius = Math.max(maxRadius, radius);
    }
    this.xs.length = bodyCount;
    this.ys.length = bodyCount;
    this.radii.length = bodyCount;

    if (!(maxRadius > 0)) {
      this.lastFallbackReason = "empty-or-invalid-radius";
      return null;
    }

    // Since the cell is as wide as the largest possible radius sum, every
    // touching center is in the same cell or one of its eight neighbours.
    const cellSize = Math.max(1, maxRadius * 2);
    this.lastCellSize = cellSize;

    for (let index = 0; index < bodyCount; index += 1) {
      const cellX = Math.floor(this.xs[index] / cellSize);
      const cellY = Math.floor(this.ys[index] / cellSize);
      const key = cellKey(cellX, cellY);
      let bucket = this.grid.get(key);
      if (!bucket) {
        bucket = this.takeBucket();
        this.grid.set(key, bucket);
      }
      bucket.push(index);
    }

    for (let first = 0; first < bodyCount; first += 1) {
      const firstX = this.xs[first];
      const firstY = this.ys[first];
      const firstRadius = this.radii[first];
      const cellX = Math.floor(firstX / cellSize);
      const cellY = Math.floor(firstY / cellSize);
      const nearby = this.nearbyIndices;
      nearby.length = 0;
      for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
        for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
          const bucket = this.grid.get(cellKey(cellX + offsetX, cellY + offsetY));
          if (!bucket) continue;
          for (const second of bucket) {
            if (second <= first) continue;
            const radiusSum = firstRadius + this.radii[second];
            if (
              Math.abs(this.xs[second] - firstX) < radiusSum
              && Math.abs(this.ys[second] - firstY) < radiusSum
            ) {
              nearby.push(second);
            }
          }
        }
      }
      nearby.sort((a, b) => a - b);
      for (const second of nearby) this.pairs.push(first, second);
    }

    this.lastCandidatePairCount = this.pairs.length / 2;
    return this.pairs;
  }

  getStats() {
    return Object.freeze({
      bodyCount: this.lastBodyCount,
      fullPairCount: this.lastFullPairCount,
      candidatePairCount: this.lastCandidatePairCount,
      cellSize: this.lastCellSize,
      fallbackReason: this.lastFallbackReason
    });
  }
}
