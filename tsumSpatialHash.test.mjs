import test from "node:test";
import assert from "node:assert/strict";

import {
  HIGH_BODY_COUNT_BROADPHASE_THRESHOLD,
  StableTsumSpatialHash,
  shouldUseHighBodyCountBroadphase
} from "./tsumSpatialHash.js";

const collidingPairsByBruteForce = (bodies) => {
  const pairs = [];
  for (let first = 0; first < bodies.length; first += 1) {
    for (let second = first + 1; second < bodies.length; second += 1) {
      const a = bodies[first];
      const b = bodies[second];
      if (Math.hypot(b.x - a.x, b.y - a.y) < a.radius + b.radius) pairs.push(first, second);
    }
  }
  return pairs;
};

test("high-body broadphase is restricted to cheat play above 80 bodies", () => {
  assert.equal(HIGH_BODY_COUNT_BROADPHASE_THRESHOLD, 81);
  assert.equal(shouldUseHighBodyCountBroadphase({ cheatActive: false, bodyCount: 999 }), false);
  assert.equal(shouldUseHighBodyCountBroadphase({ cheatActive: true, bodyCount: 80 }), false);
  assert.equal(shouldUseHighBodyCountBroadphase({ cheatActive: true, bodyCount: 81 }), true);
});

test("spatial hash retains every touching variable-radius pair in stable brute-force order", () => {
  const bodies = [];
  let seed = 0x12345678;
  const random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 0x100000000;
  };
  for (let index = 0; index < 300; index += 1) {
    bodies.push({
      id: `body-${index}`,
      x: -400 + random() * 1200,
      y: -1800 + random() * 2500,
      radius: index % 47 === 0 ? 75 : 0.5 + random() * 49.5
    });
  }
  const spatialHash = new StableTsumSpatialHash();
  const candidates = spatialHash.build(bodies);
  const candidateKeys = new Set();
  for (let index = 0; index < candidates.length; index += 2) {
    candidateKeys.add(`${candidates[index]}:${candidates[index + 1]}`);
  }
  const collisions = collidingPairsByBruteForce(bodies);
  for (let index = 0; index < collisions.length; index += 2) {
    assert.equal(candidateKeys.has(`${collisions[index]}:${collisions[index + 1]}`), true);
  }
  for (let index = 2; index < candidates.length; index += 2) {
    const previousFirst = candidates[index - 2];
    const previousSecond = candidates[index - 1];
    const first = candidates[index];
    const second = candidates[index + 1];
    assert.ok(first > previousFirst || (first === previousFirst && second > previousSecond));
  }
  assert.ok(spatialHash.getStats().candidatePairCount < spatialHash.getStats().fullPairCount * 0.2);
});

test("spatial hash supports collision-position accessors and fails closed on invalid geometry", () => {
  const bodies = [
    { x: 0, y: 0, clearOccupyX: 200, clearOccupyY: -500, radius: 29 },
    { x: 1000, y: 1000, clearOccupyX: 250, clearOccupyY: -500, radius: 29 }
  ];
  const spatialHash = new StableTsumSpatialHash();
  const accessors = {
    getX: (body) => body.clearOccupyX,
    getY: (body) => body.clearOccupyY
  };
  assert.deepEqual(spatialHash.build(bodies, accessors), [0, 1]);
  bodies[1].clearOccupyX = Number.NaN;
  assert.equal(spatialHash.build(bodies, accessors), null);
  assert.equal(spatialHash.getStats().fallbackReason, "invalid-body-geometry");
});

test("999 sparse bodies reduce narrow-phase candidates by more than 80 percent", () => {
  const bodies = Array.from({ length: 999 }, (_, index) => ({
    x: (index % 27) * 6,
    y: Math.floor(index / 27) * 6 - 900,
    radius: 0.5
  }));
  const spatialHash = new StableTsumSpatialHash();
  spatialHash.build(bodies);
  const stats = spatialHash.getStats();
  assert.equal(stats.bodyCount, 999);
  assert.ok(stats.candidatePairCount <= stats.fullPairCount * 0.2, JSON.stringify(stats));
});

test("999 standard-diameter bodies in a packed board still remove more than 80 percent", () => {
  let seed = 0x9e3779b9;
  const random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 0x100000000;
  };
  const radius = 29;
  const bodies = Array.from({ length: 999 }, () => ({
    x: radius + random() * (414 - radius * 2),
    y: 140 + radius + random() * (440 - radius * 2),
    radius
  }));
  const spatialHash = new StableTsumSpatialHash();
  spatialHash.build(bodies);
  const stats = spatialHash.getStats();
  assert.ok(stats.candidatePairCount <= stats.fullPairCount * 0.2, JSON.stringify(stats));
});
