export const FEVER_ENTRY_CLEAR_COUNT = 29;
export const STRONGEST_MODE_FEVER_BOMB_CANCEL_MIN_REMAINING = 5;
export const STRONGEST_MODE_CORONATION_ELSA_NO_TRACE_TAP_DELAY_SEC = 0.15;
export const STRONGEST_MODE_CORONATION_ELSA_SETTLE_OPPORTUNITY_WAIT_REASON = "WAIT_FOR_SETTLE_OPPORTUNITY";
export const STRONGEST_MODE_CORONATION_ELSA_PRE_TAP_SETTLE_WAIT_REASON = "WAIT_FOR_PRE_TAP_SETTLE";
export const STRONGEST_MODE_CORONATION_ELSA_BOARD_TRACE_READINESS_WAIT_REASON = "WAIT_FOR_BOARD_TRACE_READINESS";
export const STRONGEST_MODE_CORONATION_ELSA_TRACE_RECOVERY_WAIT_REASON = "WAIT_FOR_TRACE_RECOVERY";

const buildOpportunityWaitPlan = (plan, episode, elapsedMs, cycle) => Object.freeze({
  ...plan,
  action: "wait",
  chainIds: Object.freeze([]),
  tapNodeId: null,
  waitReason: episode.waitReason,
  diagnostics: Object.freeze({
    ...(plan?.diagnostics || {}),
    waitReason: episode.waitReason,
    opportunityWaitWaveId: episode.waveId,
    opportunityWaitElapsedMs: elapsedMs,
    opportunityWaitBaselineRootSafeCandidateCount: episode.baselineRootSafeCandidateCount,
    opportunityWaitBaselineMaxAdditionalTraces: episode.baselineMaxAdditionalTraces,
    opportunityWaitKind: episode.kind,
    settlingOpportunityAboveSelectionCount: Math.max(0, plan?.diagnostics?.settlingOpportunityAboveSelectionCount || 0),
    activeInflowAboveSelectionCount: Math.max(0, plan?.diagnostics?.activeInflowAboveSelectionCount || 0),
    pendingGeometryAboveSelectionCount: Math.max(0, plan?.diagnostics?.pendingGeometryAboveSelectionCount || 0),
    futureTraceRelevantPendingCount: Math.max(0, plan?.diagnostics?.futureTraceRelevantPendingCount || 0)
  })
});

export function evaluateCoronationElsaSettleOpportunity({
  plan,
  episode = null,
  waveId = 0,
  consumedWaveId = null,
  nowMs = 0,
  physicsStepCount = 0,
  maxWaitMs = 0,
  readinessWaitMs = null,
  recoveryWaitMs = 50,
  stablePhysicsTicks = 2,
  cycle = null
} = {}) {
  const normalizedCycle = Object.freeze({
    readinessUsed: !!cycle?.readinessUsed,
    recoveryUsed: !!cycle?.recoveryUsed,
    finalTraceWaitUsed: !!cycle?.finalTraceWaitUsed,
    traceCount: Math.max(0, cycle?.traceCount || 0)
  });
  const resolvedReadinessWaitMs = Number.isFinite(readinessWaitMs)
    ? Math.max(0, readinessWaitMs)
    : (maxWaitMs > 0 ? maxWaitMs : 100);
  if (!plan) {
    return Object.freeze({ plan, episode, consumedWaveId, cycle: normalizedCycle, event: null, suppressedSameWave: false });
  }
  const diagnostics = plan.diagnostics || {};
  const currentRootSafeCandidateCount = Math.max(0, diagnostics.rootSafeTraceCandidateCount || 0);
  const currentMaxAdditionalTraces = Math.max(0, plan.maxAdditionalTraces || 0);
  const relevantPendingCount = Math.max(0, diagnostics.futureTraceRelevantPendingCount || 0);
  const relevantMotionSignature = String(diagnostics.futureTraceRelevantMotionSignature || "");

  if (episode) {
    const elapsedMs = Math.max(0, nowMs - episode.startedAtMs);
    const advancedPhysics = physicsStepCount > episode.lastPhysicsStepCount;
    const potentialStable = advancedPhysics && (
      currentMaxAdditionalTraces === episode.lastMaxAdditionalTraces &&
      relevantPendingCount === episode.lastRelevantPendingCount &&
      relevantMotionSignature === episode.lastRelevantMotionSignature
    );
    const stableTickCount = potentialStable ? episode.stableTickCount + 1 : 0;
    let releaseReason = null;
    if (currentMaxAdditionalTraces > episode.baselineMaxAdditionalTraces) {
      releaseReason = "MAX_ADDITIONAL_TRACES_IMPROVED";
    } else if (relevantPendingCount === 0) {
      releaseReason = "FUTURE_TRACE_PENDING_RESOLVED";
    } else if (stableTickCount >= stablePhysicsTicks) {
      releaseReason = "TRACE_POTENTIAL_STABLE";
    } else if (elapsedMs >= episode.maxWaitMs) {
      releaseReason = "MAX_WAIT_REACHED";
    }
    if (!releaseReason) {
      return Object.freeze({
        plan: buildOpportunityWaitPlan(plan, episode, elapsedMs, normalizedCycle),
        episode: Object.freeze({ ...episode, stableTickCount, lastPhysicsStepCount: physicsStepCount, lastMaxAdditionalTraces: currentMaxAdditionalTraces, lastRelevantPendingCount: relevantPendingCount, lastRelevantMotionSignature: relevantMotionSignature }),
        consumedWaveId,
        cycle: normalizedCycle,
        event: null,
        suppressedSameWave: false
      });
    }
    const event = Object.freeze({
      type: "release",
      kind: episode.kind,
      releaseReason,
      waveId: episode.waveId,
      durationMs: elapsedMs,
      baselineRootSafeCandidateCount: episode.baselineRootSafeCandidateCount,
      currentRootSafeCandidateCount,
      baselineMaxAdditionalTraces: episode.baselineMaxAdditionalTraces,
      currentMaxAdditionalTraces,
      rootSafeCandidateCountIncreased: currentRootSafeCandidateCount > episode.baselineRootSafeCandidateCount,
      maxAdditionalTracesIncreased: currentMaxAdditionalTraces > episode.baselineMaxAdditionalTraces
    });
    const nextCycle = Object.freeze({
      ...normalizedCycle,
      readinessUsed: normalizedCycle.readinessUsed || episode.kind === "readiness",
      recoveryUsed: normalizedCycle.recoveryUsed || episode.kind === "recovery"
    });
    return Object.freeze({ plan, episode: null, consumedWaveId, cycle: nextCycle, event, suppressedSameWave: false });
  }

  const readinessEligible = !!(
    plan.action === "trace"
    && currentRootSafeCandidateCount > 0
    && normalizedCycle.traceCount === 0
    && !normalizedCycle.readinessUsed
    && relevantPendingCount > 0
    && resolvedReadinessWaitMs > 0
  );
  const recoveryEligible = !!(
    normalizedCycle.traceCount >= 1
    && normalizedCycle.traceCount <= 3
    && !normalizedCycle.recoveryUsed
    && relevantPendingCount > 0
    && recoveryWaitMs > 0
    && plan.action === "tap"
  );
  if (!readinessEligible && !recoveryEligible) {
    return Object.freeze({ plan, episode: null, consumedWaveId, cycle: normalizedCycle, event: null, suppressedSameWave: false });
  }

  const kind = readinessEligible ? "readiness" : "recovery";
  const nextEpisode = Object.freeze({
    waveId,
    startedAtMs: nowMs,
    baselineRootSafeCandidateCount: currentRootSafeCandidateCount,
    baselineMaxAdditionalTraces: currentMaxAdditionalTraces,
    kind,
    maxWaitMs: readinessEligible ? resolvedReadinessWaitMs : recoveryWaitMs,
    waitReason: readinessEligible
      ? STRONGEST_MODE_CORONATION_ELSA_BOARD_TRACE_READINESS_WAIT_REASON
      : STRONGEST_MODE_CORONATION_ELSA_TRACE_RECOVERY_WAIT_REASON,
    stableTickCount: 0,
    lastPhysicsStepCount: physicsStepCount,
    lastMaxAdditionalTraces: currentMaxAdditionalTraces,
    lastRelevantPendingCount: relevantPendingCount,
    lastRelevantMotionSignature: relevantMotionSignature
  });
  const event = Object.freeze({ type: "start", ...nextEpisode });
  return Object.freeze({
    plan: buildOpportunityWaitPlan(plan, nextEpisode, 0, normalizedCycle),
    episode: nextEpisode,
    consumedWaveId: waveId,
    cycle: normalizedCycle,
    event,
    suppressedSameWave: false
  });
}

export function getFeverClearsRemaining(gauge) {
  const normalizedGauge = Number.isFinite(gauge)
    ? Math.min(100, Math.max(0, gauge))
    : 0;
  const remaining = ((100 - normalizedGauge) / 100) * FEVER_ENTRY_CLEAR_COUNT;
  return Math.max(0, Math.ceil(remaining - 1e-9));
}

export function shouldUseStrongestModeFeverBombCancel({
  strongestModeEnabled,
  feverActive,
  feverGauge,
  activeSkillCount,
  validBombCount
} = {}) {
  return !!(
    strongestModeEnabled &&
    !feverActive &&
    Math.max(0, activeSkillCount || 0) === 0 &&
    Math.max(0, validBombCount || 0) >= 1 &&
    getFeverClearsRemaining(feverGauge) >= STRONGEST_MODE_FEVER_BOMB_CANCEL_MIN_REMAINING
  );
}

export function shouldTapStrongestModeCoronationElsaCompletedIce({
  frozenCount,
  noTraceDurationSec,
  hasTraceCandidate,
  committedTraceCount,
  minimumTraceCount = 4
} = {}) {
  if (
    hasTraceCandidate ||
    Math.max(0, committedTraceCount || 0) < Math.max(0, minimumTraceCount || 0)
  ) {
    return false;
  }
  return (
    Math.max(0, frozenCount || 0) >= 38 ||
    Math.max(0, noTraceDurationSec || 0) >= STRONGEST_MODE_CORONATION_ELSA_NO_TRACE_TAP_DELAY_SEC
  );
}
