const TAU = Math.PI * 2;

const freezeMaterial = (material) => Object.freeze({ ...material });

export const TSUM_PHYSICS_TUNING = Object.freeze({
  gravity: Object.freeze({ x: 0, y: 0.45 }),
  solverIterations: 4,
  emergencyProjectionIterations: 32,
  emergencyProjectionMarginRatio: 0.01,
  contactRadiusScale: 1,
  angularDamping: 0.92,
  maxAngularVelocity: 0.075,
  angularImpulseScale: 0.42,
  initialAngleRange: Math.PI,
  contactNormalBlend: 0.24,
  contactNormalStrongBlend: 0.58,
  contactNormalSwitchRatio: 1.25,
  sleepTicksRequired: 8,
  sleepLinearThreshold: 0.1,
  sleepAngularThreshold: 0.004,
  sleepCorrectionThreshold: 0.9,
  sleepImpulseThreshold: 2.5,
  supportedVelocityRetention: 0.35,
  supportedVelocityImpulseLimit: 1.2,
  // One gravity tick is 0.45, so waking below that level makes a resting
  // support oscillate between awake/sleeping as its neighbour settles.
  wakeRelativeSpeed: 0.75,
  wakeCorrectionThreshold: 0.22,
  visualNormalContactMax: 0.038,
  visualStrongContactMax: 0.05,
  visualImpulseThreshold: 0.5,
  visualStrongImpulse: 2.7,
  visualCompressionGain: 0.018,
  visualCompressionAttack: 0.68,
  visualRecoveryMs: 140,
  motionStretchMax: 0.05,
  motionStretchSpeed: 9,
  fan: Object.freeze({
    cooldownSec: 0.18,
    comboWindowSec: 0.75,
    maxStack: 4,
    strengthPerStack: 0.15,
    angularKick: 0.012
  }),
  materials: Object.freeze({
    tsumTsum: freezeMaterial({
      kind: "tsum-tsum",
      targetDistanceRatio: 0.985,
      emergencyDistanceRatio: 0.91,
      positionCorrection: 0.3,
      restitution: 0.04,
      friction: 0.16,
      softenA: true,
      softenB: true
    }),
    tsumBomb: freezeMaterial({
      kind: "tsum-bomb",
      targetDistanceRatio: 0.99,
      emergencyDistanceRatio: 0.92,
      positionCorrection: 0.42,
      restitution: 0.08,
      friction: 0.14,
      softenA: true,
      softenB: false
    }),
    bombBomb: freezeMaterial({
      kind: "bomb-bomb",
      targetDistanceRatio: 1,
      emergencyDistanceRatio: 0.98,
      positionCorrection: 0.9,
      restitution: 0.2,
      friction: 0.08,
      softenA: false,
      softenB: false
    }),
    tsumBoundary: freezeMaterial({
      kind: "tsum-boundary",
      targetDistanceRatio: 0.99,
      emergencyDistanceRatio: 0.91,
      positionCorrection: 0.3,
      restitution: 0.07,
      friction: 0.18,
      softenA: true,
      softenB: false
    }),
    bombBoundary: freezeMaterial({
      kind: "bomb-boundary",
      targetDistanceRatio: 1,
      emergencyDistanceRatio: 0.98,
      positionCorrection: 1,
      restitution: 0.35,
      friction: 0.2,
      softenA: false,
      softenB: false
    })
  })
});

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const hashUnit = (value) => {
  const text = String(value || "tsum");
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 4294967295;
};

const normalize = (x, y, fallbackX = 0, fallbackY = -1) => {
  const length = Math.hypot(x, y);
  if (!Number.isFinite(length) || length < 1e-8) {
    return { x: fallbackX, y: fallbackY };
  }
  return { x: x / length, y: y / length };
};

export function initializeTsumPhysicsState(body, options = {}) {
  if (!body) return null;
  if (body.physicsState) return body.physicsState;
  const tuning = options.tuning || TSUM_PHYSICS_TUNING;
  const unit = hashUnit(options.seed ?? body.id);
  const angle = body.isBomb ? 0 : (unit * 2 - 1) * tuning.initialAngleRange;
  body.physicsState = {
    angle,
    angularVelocity: 0,
    compression: 0,
    dominantContactNormal: { x: 0, y: -1 },
    normalImpulse: 0,
    tangentImpulse: 0,
    penetrationCorrection: 0,
    sleepTicks: 0,
    sleeping: false,
    supported: false,
    lockedLastStep: false,
    _normalX: 0,
    _normalY: 0,
    _normalWeight: 0,
    _strongestNormalX: 0,
    _strongestNormalY: -1,
    _strongestWeight: 0,
    _normalImpulseAccum: 0,
    _tangentImpulseAccum: 0,
    _penetrationCorrectionAccum: 0,
    _visualCompressionTarget: 0
  };
  return body.physicsState;
}

export function getPhysicsContactRadius(body, getGameplayRadius = (entry) => entry?.radius || 0, tuning = TSUM_PHYSICS_TUNING) {
  const radius = Number(getGameplayRadius(body));
  return Math.max(0, Number.isFinite(radius) ? radius * tuning.contactRadiusScale : 0);
}

export function getContactMaterial(a, b, tuning = TSUM_PHYSICS_TUNING) {
  if (a?.isBomb && b?.isBomb) return tuning.materials.bombBomb;
  if (a?.isBomb || b?.isBomb) {
    const base = tuning.materials.tsumBomb;
    return a?.isBomb ? { ...base, softenA: false, softenB: true } : base;
  }
  return tuning.materials.tsumTsum;
}

export function getBoundaryMaterial(body, tuning = TSUM_PHYSICS_TUNING) {
  return body?.isBomb ? tuning.materials.bombBoundary : tuning.materials.tsumBoundary;
}

export function wakePhysicsBody(body) {
  const state = initializeTsumPhysicsState(body);
  if (!state) return false;
  const changed = state.sleeping || state.sleepTicks > 0;
  state.sleeping = false;
  state.sleepTicks = 0;
  return changed;
}

export function beginTsumPhysicsStep(bodies, tuning = TSUM_PHYSICS_TUNING) {
  for (const body of bodies) {
    const state = initializeTsumPhysicsState(body, { tuning });
    state.supported = false;
    state._normalX = 0;
    state._normalY = 0;
    state._normalWeight = 0;
    state._strongestWeight = 0;
    state._normalImpulseAccum = 0;
    state._tangentImpulseAccum = 0;
    state._penetrationCorrectionAccum = 0;
    state._visualCompressionTarget = 0;
  }
}

export function integrateTsumPhysicsBody(body, options = {}) {
  const tuning = options.tuning || TSUM_PHYSICS_TUNING;
  const state = initializeTsumPhysicsState(body, { tuning });
  const locked = options.locked === true;
  if (locked) {
    body.vx = 0;
    body.vy = 0;
    state.angularVelocity = 0;
    state.sleeping = true;
    state.sleepTicks = tuning.sleepTicksRequired;
    state.lockedLastStep = true;
    return;
  }
  if (state.lockedLastStep) {
    wakePhysicsBody(body);
    state.lockedLastStep = false;
  }
  if (state.sleeping) return;

  const gravity = options.gravity || tuning.gravity;
  body.vx += Number(gravity.x) || 0;
  body.vy += Number(gravity.y) || 0;
  const damping = Number.isFinite(body.damping) ? body.damping : 0.995;
  body.vx *= damping;
  body.vy *= damping;
  body.x += body.vx;
  body.y += body.vy;
  state.angularVelocity = clamp(
    state.angularVelocity * tuning.angularDamping,
    -tuning.maxAngularVelocity,
    tuning.maxAngularVelocity
  );
  state.angle = ((state.angle + state.angularVelocity + Math.PI) % TAU + TAU) % TAU - Math.PI;
}

const bodyMass = (body, radius) => {
  if (body?.isBomb) return 1.25;
  return Math.max(0.2, (radius / 29) ** 2);
};

const recordContact = (body, normalX, normalY, normalImpulse, tangentImpulse, correction, soften, tuning) => {
  const state = initializeTsumPhysicsState(body, { tuning });
  if (!state) return;
  const weight = Math.max(normalImpulse, correction * 0.45);
  if (weight > 0) {
    state._normalX += normalX * weight;
    state._normalY += normalY * weight;
    state._normalWeight += weight;
    if (weight > state._strongestWeight) {
      state._strongestWeight = weight;
      state._strongestNormalX = normalX;
      state._strongestNormalY = normalY;
    }
  }
  state._normalImpulseAccum = Math.max(state._normalImpulseAccum, Math.max(0, normalImpulse));
  state._tangentImpulseAccum += Math.abs(tangentImpulse);
  state._penetrationCorrectionAccum = Math.max(state._penetrationCorrectionAccum, Math.max(0, correction));
  if (soften) {
    const excess = Math.max(0, normalImpulse - tuning.visualImpulseThreshold);
    let visualCompression = Math.min(tuning.visualNormalContactMax, excess * tuning.visualCompressionGain);
    if (normalImpulse >= tuning.visualStrongImpulse) {
      const strongProgress = clamp((normalImpulse - tuning.visualStrongImpulse) / 2, 0, 1);
      visualCompression += (tuning.visualStrongContactMax - visualCompression) * strongProgress;
    }
    state._visualCompressionTarget = Math.max(state._visualCompressionTarget, visualCompression);
  }
};

export function resolveTsumContactPair(a, b, options = {}) {
  const tuning = options.tuning || TSUM_PHYSICS_TUNING;
  const getRadius = options.getRadius || ((body) => getPhysicsContactRadius(body));
  const getPosition = options.getPosition || ((body) => ({ x: body.x, y: body.y }));
  const isLocked = options.isLocked || (() => false);
  const material = options.material || getContactMaterial(a, b, tuning);
  const radiusA = getRadius(a);
  const radiusB = getRadius(b);
  const positionA = getPosition(a);
  const positionB = getPosition(b);
  const dx = positionB.x - positionA.x;
  const dy = positionB.y - positionA.y;
  const dist = Math.hypot(dx, dy) || 0.001;
  const radiusSum = radiusA + radiusB;
  const targetDistance = radiusSum * material.targetDistanceRatio;
  if (dist >= targetDistance) return null;

  const nx = dx / dist;
  const ny = dy / dist;
  const tx = -ny;
  const ty = nx;
  const relativeVx = (b.vx || 0) - (a.vx || 0);
  const relativeVy = (b.vy || 0) - (a.vy || 0);
  const relativeNormalVelocity = relativeVx * nx + relativeVy * ny;
  const stateA = initializeTsumPhysicsState(a, { tuning });
  const stateB = initializeTsumPhysicsState(b, { tuning });
  const emergencyDistance = radiusSum * material.emergencyDistanceRatio;
  const requestedCorrection = targetDistance - dist;

  const movingA = Math.hypot(a.vx || 0, a.vy || 0) > tuning.wakeRelativeSpeed
    || Math.abs(stateA.angularVelocity) > tuning.sleepAngularThreshold * 2;
  const movingB = Math.hypot(b.vx || 0, b.vy || 0) > tuning.wakeRelativeSpeed
    || Math.abs(stateB.angularVelocity) > tuning.sleepAngularThreshold * 2;
  if (stateA.sleeping && (movingB || Math.abs(relativeNormalVelocity) > tuning.wakeRelativeSpeed || dist < emergencyDistance)) {
    wakePhysicsBody(a);
  }
  if (stateB.sleeping && (movingA || Math.abs(relativeNormalVelocity) > tuning.wakeRelativeSpeed || dist < emergencyDistance)) {
    wakePhysicsBody(b);
  }

  const lockedA = isLocked(a) || stateA.sleeping;
  const lockedB = isLocked(b) || stateB.sleeping;
  const inverseMassA = lockedA ? 0 : 1 / bodyMass(a, radiusA);
  const inverseMassB = lockedB ? 0 : 1 / bodyMass(b, radiusB);
  const inverseMassSum = inverseMassA + inverseMassB;
  if (inverseMassSum <= 0) {
    recordContact(a, nx, ny, 0, 0, 0, material.softenA, tuning);
    recordContact(b, -nx, -ny, 0, 0, 0, material.softenB, tuning);
    if (ny > 0.25) stateA.supported = true;
    if (ny < -0.25) stateB.supported = true;
    return { material, correction: 0, normalImpulse: 0, tangentImpulse: 0 };
  }

  const emergencyCorrection = Math.max(0, emergencyDistance - dist);
  const correction = Math.max(requestedCorrection * material.positionCorrection, emergencyCorrection);
  const correctionA = correction * inverseMassA / inverseMassSum;
  const correctionB = correction * inverseMassB / inverseMassSum;
  if (!lockedA) {
    a.x -= nx * correctionA;
    a.y -= ny * correctionA;
  }
  if (!lockedB) {
    b.x += nx * correctionB;
    b.y += ny * correctionB;
  }

  let normalImpulse = 0;
  let tangentImpulse = 0;
  if (relativeNormalVelocity < 0) {
    normalImpulse = -(1 + material.restitution) * relativeNormalVelocity / inverseMassSum;
    if (!lockedA) {
      a.vx -= normalImpulse * nx * inverseMassA;
      a.vy -= normalImpulse * ny * inverseMassA;
    }
    if (!lockedB) {
      b.vx += normalImpulse * nx * inverseMassB;
      b.vy += normalImpulse * ny * inverseMassB;
    }

    const inverseInertiaA = lockedA ? 0 : 2 * inverseMassA / Math.max(1, radiusA * radiusA);
    const inverseInertiaB = lockedB ? 0 : 2 * inverseMassB / Math.max(1, radiusB * radiusB);
    const relativeTangentVelocity = relativeVx * tx + relativeVy * ty
      - stateA.angularVelocity * radiusA
      - stateB.angularVelocity * radiusB;
    const tangentDenominator = inverseMassSum
      + radiusA * radiusA * inverseInertiaA
      + radiusB * radiusB * inverseInertiaB;
    const unclampedTangentImpulse = tangentDenominator > 0 ? -relativeTangentVelocity / tangentDenominator : 0;
    const tangentLimit = material.friction * Math.abs(normalImpulse);
    tangentImpulse = clamp(unclampedTangentImpulse, -tangentLimit, tangentLimit);
    if (!lockedA) {
      a.vx -= tangentImpulse * tx * inverseMassA;
      a.vy -= tangentImpulse * ty * inverseMassA;
      stateA.angularVelocity -= radiusA * tangentImpulse * inverseInertiaA * tuning.angularImpulseScale;
    }
    if (!lockedB) {
      b.vx += tangentImpulse * tx * inverseMassB;
      b.vy += tangentImpulse * ty * inverseMassB;
      stateB.angularVelocity -= radiusB * tangentImpulse * inverseInertiaB * tuning.angularImpulseScale;
    }
  }

  if (ny > 0.25) stateA.supported = true;
  if (ny < -0.25) stateB.supported = true;
  recordContact(a, nx, ny, normalImpulse, tangentImpulse, correctionA, material.softenA, tuning);
  recordContact(b, -nx, -ny, normalImpulse, tangentImpulse, correctionB, material.softenB, tuning);
  return { material, correction, normalImpulse, tangentImpulse };
}

export function enforceEmergencyContactMinimum(a, b, options = {}) {
  const tuning = options.tuning || TSUM_PHYSICS_TUNING;
  const getRadius = options.getRadius || ((body) => getPhysicsContactRadius(body));
  const getPosition = options.getPosition || ((body) => ({ x: body.x, y: body.y }));
  const isLocked = options.isLocked || (() => false);
  const material = options.material || getContactMaterial(a, b, tuning);
  const radiusA = getRadius(a);
  const radiusB = getRadius(b);
  const positionA = getPosition(a);
  const positionB = getPosition(b);
  const dx = positionB.x - positionA.x;
  const dy = positionB.y - positionA.y;
  const dist = Math.hypot(dx, dy) || 0.001;
  const minimumDistance = (radiusA + radiusB) * Math.min(
    material.targetDistanceRatio,
    material.emergencyDistanceRatio + tuning.emergencyProjectionMarginRatio
  );
  if (dist >= minimumDistance) return 0;
  const normal = normalize(dx, dy, 1, 0);
  const stateA = initializeTsumPhysicsState(a, { tuning });
  const stateB = initializeTsumPhysicsState(b, { tuning });
  const correction = minimumDistance - dist;
  if (stateA.sleeping && correction > tuning.wakeCorrectionThreshold) wakePhysicsBody(a);
  if (stateB.sleeping && correction > tuning.wakeCorrectionThreshold) wakePhysicsBody(b);
  const lockedA = isLocked(a) || stateA.sleeping;
  const lockedB = isLocked(b) || stateB.sleeping;
  const inverseMassA = lockedA ? 0 : 1 / bodyMass(a, radiusA);
  const inverseMassB = lockedB ? 0 : 1 / bodyMass(b, radiusB);
  const inverseMassSum = inverseMassA + inverseMassB;
  if (inverseMassSum <= 0) return 0;
  const correctionA = correction * inverseMassA / inverseMassSum;
  const correctionB = correction * inverseMassB / inverseMassSum;
  if (!lockedA) {
    a.x -= normal.x * correctionA;
    a.y -= normal.y * correctionA;
  }
  if (!lockedB) {
    b.x += normal.x * correctionB;
    b.y += normal.y * correctionB;
  }
  stateA._penetrationCorrectionAccum = Math.max(stateA._penetrationCorrectionAccum, correctionA);
  stateB._penetrationCorrectionAccum = Math.max(stateB._penetrationCorrectionAccum, correctionB);
  return correction;
}

export function resolveTsumBoundaryContact(body, options = {}) {
  const tuning = options.tuning || TSUM_PHYSICS_TUNING;
  const state = initializeTsumPhysicsState(body, { tuning });
  const material = options.material || getBoundaryMaterial(body, tuning);
  const normal = normalize(options.normal?.x || 0, options.normal?.y || 0);
  const penetration = Math.max(0, Number(options.penetration) || 0);
  if (penetration <= 0) return null;
  const radius = Math.max(1, Number(options.radius) || body.radius || 1);
  const emergencyDepth = radius * (material.targetDistanceRatio - material.emergencyDistanceRatio);
  const normalVelocity = (body.vx || 0) * normal.x + (body.vy || 0) * normal.y;
  // A resting body is expected to retain a small amount of soft-contact depth.
  // Only an actual inward impact or emergency-depth violation should wake it;
  // otherwise the floor correction itself would wake every sleeping stack.
  if (state.sleeping && (
    normalVelocity < -tuning.wakeRelativeSpeed
    || penetration > emergencyDepth + tuning.wakeCorrectionThreshold
  )) {
    wakePhysicsBody(body);
  }
  const locked = options.locked === true || state.sleeping;
  const correction = locked ? 0 : Math.max(penetration * material.positionCorrection, penetration - emergencyDepth);
  if (!locked) {
    body.x += normal.x * correction;
    body.y += normal.y * correction;
  }

  let normalImpulse = 0;
  let tangentImpulse = 0;
  if (!locked && normalVelocity < 0) {
    const mass = bodyMass(body, radius);
    normalImpulse = -(1 + material.restitution) * normalVelocity * mass;
    body.vx += normalImpulse * normal.x / mass;
    body.vy += normalImpulse * normal.y / mass;
    const tx = -normal.y;
    const ty = normal.x;
    const tangentVelocity = body.vx * tx + body.vy * ty - state.angularVelocity * radius;
    const inverseMass = 1 / mass;
    const inverseInertia = 2 * inverseMass / (radius * radius);
    const denominator = inverseMass + radius * radius * inverseInertia;
    const unclamped = denominator > 0 ? -tangentVelocity / denominator : 0;
    tangentImpulse = clamp(unclamped, -material.friction * normalImpulse, material.friction * normalImpulse);
    body.vx += tangentImpulse * tx * inverseMass;
    body.vy += tangentImpulse * ty * inverseMass;
    state.angularVelocity -= radius * tangentImpulse * inverseInertia * tuning.angularImpulseScale;
  }
  if (normal.y < -0.5) state.supported = true;
  recordContact(body, -normal.x, -normal.y, normalImpulse, tangentImpulse, correction, material.softenA, tuning);
  return { material, correction, normalImpulse, tangentImpulse };
}

const updateDominantNormal = (state, tuning) => {
  let nextX = state._normalX;
  let nextY = state._normalY;
  if (Math.hypot(nextX, nextY) < state._normalWeight * 0.15) {
    nextX = state._strongestNormalX;
    nextY = state._strongestNormalY;
  }
  const next = normalize(nextX, nextY, state.dominantContactNormal.x, state.dominantContactNormal.y);
  const previous = state.dominantContactNormal;
  if (next.x * previous.x + next.y * previous.y < 0) {
    next.x *= -1;
    next.y *= -1;
  }
  const strongSwitch = state._strongestWeight > Math.max(0.001, state.normalImpulse) * tuning.contactNormalSwitchRatio;
  const blend = strongSwitch ? tuning.contactNormalStrongBlend : tuning.contactNormalBlend;
  state.dominantContactNormal = normalize(
    previous.x + (next.x - previous.x) * blend,
    previous.y + (next.y - previous.y) * blend,
    previous.x,
    previous.y
  );
};

export function finalizeTsumPhysicsBody(body, options = {}) {
  const tuning = options.tuning || TSUM_PHYSICS_TUNING;
  const state = initializeTsumPhysicsState(body, { tuning });
  const locked = options.locked === true;
  updateDominantNormal(state, tuning);
  state.normalImpulse = state._normalImpulseAccum;
  state.tangentImpulse = state._tangentImpulseAccum;
  state.penetrationCorrection = state._penetrationCorrectionAccum;
  if (locked) {
    state.sleeping = true;
    state.sleepTicks = tuning.sleepTicksRequired;
    return state;
  }

  // Four sequential-impulse iterations intentionally keep the solver cheap,
  // but a tall resting pile can retain a small shared downward drift because
  // only relative velocity is resolved. Relax that gravity-aligned drift only
  // for already-supported, non-impacting bodies; strong collisions remain
  // fully impulse-driven.
  if (state.supported && state.normalImpulse < tuning.supportedVelocityImpulseLimit) {
    const gravityDirection = normalize(tuning.gravity.x, tuning.gravity.y, 0, 1);
    const alongGravity = (body.vx || 0) * gravityDirection.x + (body.vy || 0) * gravityDirection.y;
    if (alongGravity > 0) {
      const removed = alongGravity * (1 - tuning.supportedVelocityRetention);
      body.vx -= gravityDirection.x * removed;
      body.vy -= gravityDirection.y * removed;
    }
  }

  const quiet = state.supported
    && Math.abs(body.vx || 0) < tuning.sleepLinearThreshold
    && Math.abs(body.vy || 0) < tuning.sleepLinearThreshold
    && Math.abs(state.angularVelocity) < tuning.sleepAngularThreshold
    && state.penetrationCorrection < tuning.sleepCorrectionThreshold
    && state.normalImpulse < tuning.sleepImpulseThreshold;
  if (quiet) {
    state.sleepTicks += 1;
    if (state.sleepTicks >= tuning.sleepTicksRequired) {
      state.sleeping = true;
      body.vx = 0;
      body.vy = 0;
      state.angularVelocity = 0;
    }
  } else {
    state.sleepTicks = 0;
    state.sleeping = false;
  }
  return state;
}

export function updateTsumVisualPhysicsState(body, dt, tuning = TSUM_PHYSICS_TUNING) {
  const state = initializeTsumPhysicsState(body, { tuning });
  const target = state._visualCompressionTarget || 0;
  if (target > state.compression) {
    state.compression += (target - state.compression) * tuning.visualCompressionAttack;
  } else {
    const recovery = 1 - Math.exp(-Math.max(0, dt) * 1000 / tuning.visualRecoveryMs);
    state.compression += (target - state.compression) * recovery;
  }
  if (state.compression < 0.0001) state.compression = 0;
  return state;
}

export function getTsumRenderDeformation(body, tuning = TSUM_PHYSICS_TUNING) {
  const state = initializeTsumPhysicsState(body, { tuning });
  const speed = Math.hypot(body?.vx || 0, body?.vy || 0);
  return Object.freeze({
    angle: body?.isBomb ? 0 : state.angle,
    compression: body?.isBomb ? 0 : clamp(state.compression, 0, tuning.visualStrongContactMax),
    contactAngle: Math.atan2(state.dominantContactNormal.y, state.dominantContactNormal.x),
    motionStretch: body?.isBomb ? 0 : clamp(speed / tuning.motionStretchSpeed, 0, 1) * tuning.motionStretchMax,
    motionAngle: Math.atan2(body?.vy || 0, body?.vx || 0) - Math.PI * 0.5
  });
}

export function getFrozenOverlayRenderGeometry(body, effectiveRadius) {
  const x = Number(body?.x);
  const y = Number(body?.y);
  const radius = Number(effectiveRadius);
  return Object.freeze({
    x: Number.isFinite(x) ? x : 0,
    y: Number.isFinite(y) ? y : 0,
    radius: Number.isFinite(radius) ? Math.max(0, radius) : 0
  });
}

export function wakeSupportedBodies(removedBody, bodies, options = {}) {
  if (!removedBody) return [];
  const getRadius = options.getRadius || ((body) => getPhysicsContactRadius(body));
  const margin = Number.isFinite(options.margin) ? options.margin : 2.5;
  const queue = [removedBody];
  const visited = new Set([removedBody]);
  const woken = [];
  while (queue.length) {
    const support = queue.shift();
    const supportRadius = getRadius(support);
    for (const body of bodies) {
      if (!body || visited.has(body) || body.dead || body.removing) continue;
      if ((body.y || 0) >= (support.y || 0)) continue;
      const maxDistance = supportRadius + getRadius(body) + margin;
      if (Math.hypot((body.x || 0) - (support.x || 0), (body.y || 0) - (support.y || 0)) > maxDistance) continue;
      visited.add(body);
      queue.push(body);
      wakePhysicsBody(body);
      woken.push(body);
    }
  }
  return woken;
}

export function getNextFanResponse(previous = {}, nowSec = 0, tuning = TSUM_PHYSICS_TUNING) {
  const lastAt = Number(previous.lastAt);
  const continuing = Number.isFinite(lastAt) && nowSec - lastAt <= tuning.fan.comboWindowSec;
  const stack = continuing ? Math.min(tuning.fan.maxStack, (previous.stack || 0) + 1) : 0;
  return Object.freeze({
    lastAt: nowSec,
    stack,
    strength: 1 + stack * tuning.fan.strengthPerStack,
    cooldownSec: tuning.fan.cooldownSec
  });
}
