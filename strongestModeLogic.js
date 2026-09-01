export const FEVER_ENTRY_CLEAR_COUNT = 29;
export const STRONGEST_MODE_FEVER_BOMB_CANCEL_MIN_REMAINING = 5;
export const STRONGEST_MODE_CORONATION_ELSA_NO_TRACE_TAP_DELAY_SEC = 0.15;
export const STRONGEST_MODE_CORONATION_ELSA_SETTLE_OPPORTUNITY_WAIT_REASON = "WAIT_FOR_SETTLE_OPPORTUNITY";
export const STRONGEST_MODE_CORONATION_ELSA_PRE_TAP_SETTLE_WAIT_REASON = "WAIT_FOR_PRE_TAP_SETTLE";

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
    opportunityWaitBaselineRootCandidateCount: episode.baselineRootCandidateCount,
    opportunityWaitBaselineRootSafeCandidateCount: episode.baselineRootSafeCandidateCount,
    opportunityWaitBaselineMaxAdditionalTraces: episode.baselineMaxAdditionalTraces,
    opportunityWaitKind: episode.kind,
    settlingOpportunityAboveSelectionCount: Math.max(0, plan?.diagnostics?.settlingOpportunityAboveSelectionCount || 0),
    activeInflowAboveSelectionCount: Math.max(0, plan?.diagnostics?.activeInflowAboveSelectionCount || 0),
    pendingGeometryAboveSelectionCount: Math.max(0, plan?.diagnostics?.pendingGeometryAboveSelectionCount || 0),
    waitBudgetRemainingMs: Math.max(0, cycle.totalBudgetMs - cycle.totalWaitMs - elapsedMs)
  })
});

export function evaluateCoronationElsaSettleOpportunity({
  plan,
  episode = null,
  waveId = 0,
  consumedWaveId = null,
  nowMs = 0,
  maxWaitMs = 0,
  secondaryWaitMs = 0,
  preTapWaitMs = 0,
  preTapWaitReserveMs = 0,
  totalWaitBudgetMs = 0,
  sufficientTraceCount = 4,
  minPendingAboveSelection = 1,
  cycle = null
} = {}) {
  const normalizedCycle = Object.freeze({
    totalWaitMs: Math.max(0, cycle?.totalWaitMs || 0),
    totalBudgetMs: Math.max(0, totalWaitBudgetMs || maxWaitMs || 0),
    primaryUsed: !!cycle?.primaryUsed,
    secondaryUsed: !!cycle?.secondaryUsed,
    preTapUsed: !!cycle?.preTapUsed,
    traceCount: Math.max(0, cycle?.traceCount || 0)
  });
  if (!plan) {
    return Object.freeze({ plan, episode, consumedWaveId, cycle: normalizedCycle, event: null, suppressedSameWave: false });
  }
  const diagnostics = plan.diagnostics || {};
  const currentRootCandidateCount = Math.max(0, diagnostics.rootLegalTraceCandidateCount || 0);
  const currentRootSafeCandidateCount = Math.max(0, diagnostics.rootSafeTraceCandidateCount || 0);
  const currentMaxAdditionalTraces = Math.max(0, plan.maxAdditionalTraces || 0);
  const pendingAbove = Math.max(0, diagnostics.pendingGeometryAboveSelectionCount || 0);
  const preTapPending = Math.max(0, diagnostics.pendingGeometryAboveFrozenMeanCount || 0);
  const routeImproved = (baseline) => (
    currentMaxAdditionalTraces >= baseline.baselineMaxAdditionalTraces && (
      Math.max(0, diagnostics.selectedCandidateVerticalSpan || 0) >= Math.max(0, baseline.selectedCandidateVerticalSpan || 0) + 20 ||
      (
        Math.max(0, diagnostics.terminalPredictedRawCoins || 0) >= Math.max(0, baseline.terminalPredictedRawCoins || 0) + 2 &&
        pendingAbove < baseline.pendingRelevantCount
      )
    )
  );

  if (episode) {
    const elapsedMs = Math.max(0, nowMs - episode.startedAtMs);
    let releaseReason = null;
    if (currentMaxAdditionalTraces > episode.baselineMaxAdditionalTraces) {
      releaseReason = "MAX_ADDITIONAL_TRACES_IMPROVED";
    } else if ((episode.kind === "pre-tap" ? preTapPending : pendingAbove) === 0) {
      releaseReason = "PENDING_GEOMETRY_RESOLVED";
    } else if (episode.kind !== "pre-tap" && routeImproved(episode)) {
      releaseReason = "SELECTED_ROUTE_IMPROVED";
    } else if (elapsedMs >= episode.maxWaitMs) {
      releaseReason = "MAX_WAIT_REACHED";
    }
    if (!releaseReason) {
      return Object.freeze({
        plan: buildOpportunityWaitPlan(plan, episode, elapsedMs, normalizedCycle),
        episode,
        consumedWaveId,
        cycle: normalizedCycle,
        event: null,
        suppressedSameWave: false
      });
    }
    const event = Object.freeze({
      type: "release",
      releaseReason,
      waveId: episode.waveId,
      durationMs: elapsedMs,
      baselineRootCandidateCount: episode.baselineRootCandidateCount,
      currentRootCandidateCount,
      baselineRootSafeCandidateCount: episode.baselineRootSafeCandidateCount,
      currentRootSafeCandidateCount,
      baselineMaxAdditionalTraces: episode.baselineMaxAdditionalTraces,
      currentMaxAdditionalTraces,
      rootCandidateCountIncreased: currentRootCandidateCount > episode.baselineRootCandidateCount,
      rootSafeCandidateCountIncreased: currentRootSafeCandidateCount > episode.baselineRootSafeCandidateCount,
      maxAdditionalTracesIncreased: currentMaxAdditionalTraces > episode.baselineMaxAdditionalTraces
    });
    const nextCycle = Object.freeze({
      ...normalizedCycle,
      totalWaitMs: normalizedCycle.totalWaitMs + elapsedMs,
      primaryUsed: normalizedCycle.primaryUsed || episode.kind === "primary",
      secondaryUsed: normalizedCycle.secondaryUsed || episode.kind === "secondary",
      preTapUsed: normalizedCycle.preTapUsed || episode.kind === "pre-tap"
    });
    return Object.freeze({ plan, episode: null, consumedWaveId, cycle: nextCycle, event, suppressedSameWave: false });
  }

  const budgetRemainingMs = Math.max(0, normalizedCycle.totalBudgetMs - normalizedCycle.totalWaitMs);
  const hasPendingAbove = pendingAbove >= Math.max(1, minPendingAboveSelection || 1);
  const hasPreTapPending = preTapPending >= 1;
  const traceCapacityLow = currentMaxAdditionalTraces < Math.max(1, sufficientTraceCount || 4);
  const traceKind = !normalizedCycle.primaryUsed
    ? "primary"
    : (!normalizedCycle.secondaryUsed && normalizedCycle.traceCount >= 1 ? "secondary" : null);
  const traceRequestedWaitMs = traceKind === "primary" ? maxWaitMs : secondaryWaitMs;
  const traceWaitLimitMs = Math.min(
    Math.max(0, traceRequestedWaitMs || 0),
    Math.max(0, budgetRemainingMs - Math.max(0, preTapWaitReserveMs || 0))
  );
  const traceEligible = !!(
    plan.action === "trace"
    && currentRootSafeCandidateCount > 0
    && Math.max(0, diagnostics.selectedUnsafeNewlyFrozenCount || 0) === 0
    && traceKind
    && traceWaitLimitMs > 0
    && traceCapacityLow
    && hasPendingAbove
  );
  const preTapWaitLimitMs = Math.min(Math.max(0, preTapWaitMs || 0), budgetRemainingMs);
  const preTapEligible = !!(
    plan.action === "tap"
    && currentRootSafeCandidateCount === 0
    && normalizedCycle.traceCount <= 3
    && !normalizedCycle.preTapUsed
    && preTapWaitLimitMs > 0
    && hasPreTapPending
  );
  if (!traceEligible && !preTapEligible) {
    return Object.freeze({ plan, episode: null, consumedWaveId, cycle: normalizedCycle, event: null, suppressedSameWave: false });
  }

  const kind = preTapEligible ? "pre-tap" : traceKind;
  const nextEpisode = Object.freeze({
    waveId,
    startedAtMs: nowMs,
    baselineRootCandidateCount: currentRootCandidateCount,
    baselineRootSafeCandidateCount: currentRootSafeCandidateCount,
    baselineMaxAdditionalTraces: currentMaxAdditionalTraces,
    kind,
    maxWaitMs: preTapEligible ? preTapWaitLimitMs : traceWaitLimitMs,
    waitReason: preTapEligible
      ? STRONGEST_MODE_CORONATION_ELSA_PRE_TAP_SETTLE_WAIT_REASON
      : STRONGEST_MODE_CORONATION_ELSA_SETTLE_OPPORTUNITY_WAIT_REASON,
    selectedCandidateMinY: diagnostics.selectedCandidateMinY ?? null,
    selectedCandidateMaxY: diagnostics.selectedCandidateMaxY ?? null,
    selectedCandidateMeanY: diagnostics.selectedCandidateMeanY ?? null,
    selectedCandidateVerticalSpan: diagnostics.selectedCandidateVerticalSpan || 0,
    selectedCandidateUpperHalfNodeCount: diagnostics.selectedCandidateUpperHalfNodeCount || 0,
    terminalPredictedRawCoins: diagnostics.terminalPredictedRawCoins || 0,
    pendingRelevantCount: preTapEligible ? preTapPending : pendingAbove
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
