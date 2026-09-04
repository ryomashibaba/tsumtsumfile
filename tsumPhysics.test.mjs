import test from "node:test";
import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";

import {
  TSUM_PHYSICS_TUNING,
  beginTsumPhysicsStep,
  enforceEmergencyContactMinimum,
  finalizeTsumPhysicsBody,
  getBoundaryMaterial,
  getContactMaterial,
  getFrozenOverlayRenderGeometry,
  getNextFanResponse,
  getPhysicsContactRadius,
  getTsumRenderDeformation,
  initializeTsumPhysicsState,
  integrateTsumPhysicsBody,
  resolveTsumBoundaryContact,
  resolveTsumContactPair,
  updateTsumVisualPhysicsState,
  wakePhysicsBody,
  wakeSupportedBodies
} from "./tsumPhysics.js";

const FIELD = Object.freeze({ left: 0, right: 414, top: 140, bottom: 580 });

function makeBody(id, x, y, options = {}) {
  const body = {
    id,
    x,
    y,
    vx: options.vx || 0,
    vy: options.vy || 0,
    radius: options.radius || 29,
    damping: options.damping ?? 0.995,
    isBomb: options.isBomb === true,
    dead: false,
    removing: false,
    inChain: options.inChain === true,
    clearOccupying: options.clearOccupying === true,
    frozen: options.frozen === true
  };
  initializeTsumPhysicsState(body, { seed: id });
  return body;
}

const isLocked = (body) => body.inChain || body.clearOccupying || body.frozen;
const radiusOf = (body) => getPhysicsContactRadius(body, (entry) => entry.radius);

function resolveBoundary(body) {
  const radius = radiusOf(body);
  const material = getBoundaryMaterial(body);
  const target = radius * material.targetDistanceRatio;
  const contacts = [
    { normal: { x: 1, y: 0 }, penetration: FIELD.left + target - body.x },
    { normal: { x: -1, y: 0 }, penetration: body.x - (FIELD.right - target) },
    { normal: { x: 0, y: -1 }, penetration: body.y - (FIELD.bottom - target) },
    { normal: { x: 0, y: 1 }, penetration: FIELD.top + target - body.y }
  ];
  for (const contact of contacts) {
    if (contact.penetration > 0) {
      resolveTsumBoundaryContact(body, {
        ...contact,
        radius,
        material,
        locked: isLocked(body)
      });
    }
  }
}

function stepBodies(bodies, gravity = TSUM_PHYSICS_TUNING.gravity) {
  beginTsumPhysicsStep(bodies);
  for (const body of bodies) {
    integrateTsumPhysicsBody(body, { gravity, locked: isLocked(body) });
    resolveBoundary(body);
  }
  for (let iteration = 0; iteration < TSUM_PHYSICS_TUNING.solverIterations; iteration += 1) {
    for (let first = 0; first < bodies.length; first += 1) {
      for (let second = first + 1; second < bodies.length; second += 1) {
        resolveTsumContactPair(bodies[first], bodies[second], {
          getRadius: radiusOf,
          isLocked
        });
      }
    }
    for (const body of bodies) resolveBoundary(body);
  }
  for (let iteration = 0; iteration < TSUM_PHYSICS_TUNING.emergencyProjectionIterations; iteration += 1) {
    for (let first = 0; first < bodies.length; first += 1) {
      for (let second = first + 1; second < bodies.length; second += 1) {
        enforceEmergencyContactMinimum(bodies[first], bodies[second], { getRadius: radiusOf, isLocked });
      }
    }
    for (const body of bodies) resolveBoundary(body);
  }
  for (const body of bodies) finalizeTsumPhysicsBody(body, { locked: isLocked(body) });
}

test("contact tuning starts with subtle compression and an emergency floor", () => {
  const material = TSUM_PHYSICS_TUNING.materials.tsumTsum;
  assert.ok(material.targetDistanceRatio >= 0.97 && material.targetDistanceRatio <= 0.99);
  assert.ok(material.emergencyDistanceRatio >= 0.9 && material.emergencyDistanceRatio <= 0.92);
  assert.ok(material.positionCorrection >= 0.25 && material.positionCorrection <= 0.35);
  assert.ok(material.restitution >= 0.03 && material.restitution <= 0.05);
  assert.equal(TSUM_PHYSICS_TUNING.solverIterations, 4);
});

test("low-speed contact does not create visible squash", () => {
  const a = makeBody("slow-a", 100, 300, { vx: 0.2 });
  const b = makeBody("slow-b", 157, 300, { vx: -0.2 });
  beginTsumPhysicsStep([a, b]);
  const result = resolveTsumContactPair(a, b, { getRadius: radiusOf, isLocked });
  finalizeTsumPhysicsBody(a);
  updateTsumVisualPhysicsState(a, 1 / 60);
  assert.ok(result.normalImpulse > 0);
  assert.equal(a.physicsState.compression, 0);
});

test("high-speed contact is low-rebound and produces bounded impulse-driven squash", () => {
  const a = makeBody("fast-a", 100, 300, { vx: 3 });
  const b = makeBody("fast-b", 156, 300, { vx: -3 });
  beginTsumPhysicsStep([a, b]);
  const result = resolveTsumContactPair(a, b, { getRadius: radiusOf, isLocked });
  finalizeTsumPhysicsBody(a);
  updateTsumVisualPhysicsState(a, 1 / 60);
  const relativeAfter = b.vx - a.vx;
  assert.ok(relativeAfter > 0 && relativeAfter < 0.4);
  assert.ok(result.normalImpulse > TSUM_PHYSICS_TUNING.visualStrongImpulse);
  assert.ok(a.physicsState.compression > 0.02);
  assert.ok(a.physicsState.compression <= TSUM_PHYSICS_TUNING.visualStrongContactMax);
});

test("Coulomb friction limits tangent impulse and creates gentle rotation", () => {
  const a = makeBody("friction-a", 100, 300, { vx: 2, vy: 2 });
  const b = makeBody("friction-b", 156, 300, { vx: -2, vy: -2 });
  beginTsumPhysicsStep([a, b]);
  const result = resolveTsumContactPair(a, b, { getRadius: radiusOf, isLocked });
  assert.ok(Math.abs(result.tangentImpulse) <= result.material.friction * Math.abs(result.normalImpulse) + 1e-9);
  assert.notEqual(a.physicsState.angularVelocity, 0);
  assert.ok(Math.abs(a.physicsState.angularVelocity) < TSUM_PHYSICS_TUNING.maxAngularVelocity);
});

test("multi-contact normals are weighted and interpolated instead of taking the last pair", () => {
  const center = makeBody("center", 200, 300);
  const weak = makeBody("weak", 144, 300, { vx: 0.5 });
  const strong = makeBody("strong", 256, 300, { vx: -3 });
  beginTsumPhysicsStep([center, weak, strong]);
  resolveTsumContactPair(center, weak, { getRadius: radiusOf, isLocked });
  resolveTsumContactPair(center, strong, { getRadius: radiusOf, isLocked });
  finalizeTsumPhysicsBody(center);
  assert.ok(center.physicsState.dominantContactNormal.x > 0.25);
  const previousX = center.physicsState.dominantContactNormal.x;
  beginTsumPhysicsStep([center, weak, strong]);
  resolveTsumContactPair(center, weak, { getRadius: radiusOf, isLocked });
  finalizeTsumPhysicsBody(center);
  assert.ok(Math.abs(center.physicsState.dominantContactNormal.x - previousX) < 1.25);
});

test("Tsum/Bomb and Bomb/Bomb contacts select explicit materials", () => {
  const tsum = makeBody("tsum", 100, 300, { vx: 3 });
  const bomb = makeBody("bomb", 156, 300, { vx: -3, isBomb: true });
  const bomb2 = makeBody("bomb-2", 212, 300, { vx: -3, isBomb: true });
  assert.equal(getContactMaterial(tsum, bomb).kind, "tsum-bomb");
  assert.equal(getContactMaterial(bomb, bomb2).kind, "bomb-bomb");
  beginTsumPhysicsStep([tsum, bomb]);
  resolveTsumContactPair(tsum, bomb, { getRadius: radiusOf, isLocked });
  assert.ok(tsum.physicsState._visualCompressionTarget > 0);
  assert.equal(bomb.physicsState._visualCompressionTarget, 0);
});

test("large Tsums retain their gameplay radius while contact radius uses a separate adapter", () => {
  const large = makeBody("large", 200, 300, { radius: 43.5 });
  assert.equal(large.radius, 43.5);
  assert.equal(radiusOf(large), 43.5 * TSUM_PHYSICS_TUNING.contactRadiusScale);
});

test("Coronation Elsa frozen overlay geometry stays on the logical hit area", () => {
  const body = makeBody("coronation-frozen", 173, 412, { radius: 40, vx: 7, vy: -5 });
  body.physicsState.angle = 0.72;
  body.physicsState.compression = 0.11;
  body.physicsState.dominantContactNormal = { x: 0.6, y: -0.8 };

  const deformation = getTsumRenderDeformation(body);
  const geometry = getFrozenOverlayRenderGeometry(body, 31.5);

  assert.notEqual(deformation.angle, 0);
  assert.ok(deformation.compression > 0);
  assert.deepEqual(geometry, { x: 173, y: 412, radius: 31.5 });
});

test("frozen overlay geometry supports large and cheat-scaled effective radii", () => {
  const body = makeBody("scaled-frozen", 240, 360, { radius: 43.5 });
  assert.deepEqual(
    getFrozenOverlayRenderGeometry(body, body.radius * 0.72),
    { x: 240, y: 360, radius: 31.32 }
  );
});

test("fixed, frozen, chained, and clear-occupying Tsums keep position and angle", () => {
  for (const flag of ["frozen", "inChain", "clearOccupying"]) {
    const body = makeBody(`locked-${flag}`, 200, 300, { [flag]: true, vx: 4, vy: 4 });
    const angle = body.physicsState.angle;
    stepBodies([body]);
    assert.equal(body.x, 200);
    assert.equal(body.y, 300);
    assert.equal(body.physicsState.angle, angle);
    assert.equal(body.physicsState.angularVelocity, 0);
  }
});

test("FAN response supports quick repeated strengthening and wakes bodies", () => {
  const first = getNextFanResponse({}, 10);
  const second = getNextFanResponse(first, 10.2);
  const reset = getNextFanResponse(second, 12);
  assert.ok(first.cooldownSec < 1.2);
  assert.ok(second.strength > first.strength);
  assert.equal(reset.strength, 1);
  const body = makeBody("fan-sleeper", 200, 300);
  body.physicsState.sleeping = true;
  body.physicsState.sleepTicks = 10;
  assert.equal(wakePhysicsBody(body), true);
  assert.equal(body.physicsState.sleeping, false);
});

test("removing a support wakes every Tsum above it", () => {
  const bottom = makeBody("bottom", 200, 520);
  const middle = makeBody("middle", 200, 463);
  const top = makeBody("top", 200, 406);
  for (const body of [middle, top]) {
    body.physicsState.sleeping = true;
    body.physicsState.sleepTicks = 10;
  }
  const woken = wakeSupportedBodies(bottom, [bottom, middle, top], { getRadius: radiusOf });
  assert.deepEqual(woken.map((body) => body.id), ["middle", "top"]);
  assert.equal(middle.physicsState.sleeping, false);
  assert.equal(top.physicsState.sleeping, false);
});

test("wall and floor contacts are low-rebound and respect the emergency minimum", () => {
  const body = makeBody("boundary", 200, 579, { vy: 8 });
  beginTsumPhysicsStep([body]);
  for (let iteration = 0; iteration < 4; iteration += 1) resolveBoundary(body);
  finalizeTsumPhysicsBody(body);
  const material = getBoundaryMaterial(body);
  assert.ok(body.y <= FIELD.bottom - body.radius * material.emergencyDistanceRatio + 1e-9);
  assert.ok(body.vy <= 0.8);
});

test("three-body stacks and long idle runs settle without invalid values", () => {
  const bodies = [
    makeBody("stack-bottom", 207, 550),
    makeBody("stack-middle", 207, 493),
    makeBody("stack-top", 207, 436)
  ];
  for (let index = 0; index < 600; index += 1) stepBodies(bodies);
  for (const body of bodies) {
    assert.ok(Number.isFinite(body.x) && Number.isFinite(body.y));
    assert.ok(Number.isFinite(body.vx) && Number.isFinite(body.vy));
    assert.equal(body.physicsState.sleeping, true, JSON.stringify({ id: body.id, vx: body.vx, vy: body.vy, ...body.physicsState }));
  }
});

test("45-body ten-second simulation stays bounded, finite, and performant", () => {
  const bodies = [];
  for (let row = 0; bodies.length < 45; row += 1) {
    for (let column = 0; column < 7 && bodies.length < 45; column += 1) {
      bodies.push(makeBody(`body-${row}-${column}`, 31 + column * 58, 540 - row * 56));
    }
  }
  const samples = [];
  for (let index = 0; index < 600; index += 1) {
    const started = performance.now();
    stepBodies(bodies);
    samples.push(performance.now() - started);
  }
  const p95 = samples.slice().sort((a, b) => a - b)[Math.floor(samples.length * 0.95)];
  const emergencyRatio = TSUM_PHYSICS_TUNING.materials.tsumTsum.emergencyDistanceRatio;
  for (const body of bodies) {
    assert.ok(Object.values({ x: body.x, y: body.y, vx: body.vx, vy: body.vy }).every(Number.isFinite));
    assert.ok(body.x >= FIELD.left + body.radius * 0.9 - 0.01);
    assert.ok(body.x <= FIELD.right - body.radius * 0.9 + 0.01);
    assert.ok(body.y >= FIELD.top + body.radius * 0.9 - 0.01);
    assert.ok(body.y <= FIELD.bottom - body.radius * 0.9 + 0.01);
  }
  for (let first = 0; first < bodies.length; first += 1) {
    for (let second = first + 1; second < bodies.length; second += 1) {
      const a = bodies[first];
      const b = bodies[second];
      const actualDistance = Math.hypot(b.x - a.x, b.y - a.y);
      assert.ok(actualDistance >= (a.radius + b.radius) * emergencyRatio - 0.02, JSON.stringify({ a: a.id, b: b.id, actualDistance }));
    }
  }
  assert.ok(
    bodies.every((body) => body.physicsState.sleeping),
    JSON.stringify(bodies.filter((body) => !body.physicsState.sleeping).map((body) => ({ id: body.id, vx: body.vx, vy: body.vy, ...body.physicsState })))
  );
  assert.ok(p95 < 4, `physics p95 ${p95.toFixed(3)}ms exceeded 4ms`);
});

test("visual deformation stays subtle, preserves varied angles, and recovers", () => {
  const first = makeBody("angle-a", 100, 300);
  const second = makeBody("angle-b", 160, 300);
  assert.notEqual(first.physicsState.angle, second.physicsState.angle);
  assert.ok(Math.abs(first.physicsState.angle) <= TSUM_PHYSICS_TUNING.initialAngleRange);
  first.physicsState.compression = TSUM_PHYSICS_TUNING.visualStrongContactMax;
  first.physicsState._visualCompressionTarget = 0;
  updateTsumVisualPhysicsState(first, 0.14);
  const deformation = getTsumRenderDeformation(first);
  assert.ok(deformation.compression > 0);
  assert.ok(deformation.compression < TSUM_PHYSICS_TUNING.visualStrongContactMax);
  first.vy = 100;
  assert.ok(getTsumRenderDeformation(first).motionStretch <= 0.06);
});
