export const FEVER_ENTRY_CLEAR_COUNT = 29;
export const STRONGEST_MODE_FEVER_BOMB_CANCEL_MIN_REMAINING = 5;
export const STRONGEST_MODE_CORONATION_ELSA_NO_TRACE_TAP_DELAY_SEC = 0.15;
export const STRONGEST_MODE_CORONATION_ELSA_SETTLE_OPPORTUNITY_WAIT_REASON = "WAIT_FOR_SETTLE_OPPORTUNITY";

const buildOpportunityWaitPlan = (plan, episode, elapsedMs, cycle) => Object.freeze({
  ...plan,
  action: "wait",
  chainIds: Object.freeze([]),
  tapNodeId: null,
  waitReason: STRONGEST_MODE_CORONATION_ELSA_SETTLE_OPPORTUNITY_WAIT_REASON,
  diagnostics: Object.freeze({
    ...(plan?.diagnostics || {}),
    waitReason: STRONGEST_MODE_CORONATION_ELSA_SETTLE_OPPORTUNITY_WAIT_REASON,
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
  const settlingAbove = Math.max(0, diagnostics.settlingOpportunityAboveSelectionCount || 0);
  const routeImproved = (baseline) => (
    (Number.isFinite(diagnostics.selectedCandidateMeanY) && Number.isFinite(baseline.selectedCandidateMeanY) && diagnostics.selectedCandidateMeanY < baseline.selectedCandidateMeanY) ||
    Math.max(0, diagnostics.selectedCandidateVerticalSpan || 0) > Math.max(0, baseline.selectedCandidateVerticalSpan || 0) ||
    Math.max(0, diagnostics.selectedCandidateUpperHalfNodeCount || 0) > Math.max(0, baseline.selectedCandidateUpperHalfNodeCount || 0) ||
    Math.max(0, diagnostics.terminalPredictedRawCoins || 0) > Math.max(0, baseline.terminalPredictedRawCoins || 0)
  );

  if (episode) {
    const elapsedMs = Math.max(0, nowMs - episode.startedAtMs);
    let releaseReason = null;
    if (currentMaxAdditionalTraces > episode.baselineMaxAdditionalTraces) {
      releaseReason = "MAX_ADDITIONAL_TRACES_IMPROVED";
    } else if (pendingAbove === 0) {
      releaseReason = "PENDING_GEOMETRY_RESOLVED";
    } else if (settlingAbove === 0) {
      releaseReason = "SETTLING_OPPORTUNITY_RESOLVED";
    } else if (routeImproved(episode)) {
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
      secondaryUsed: normalizedCycle.secondaryUsed || episode.kind !== "primary"
    });
    return Object.freeze({ plan, episode: null, consumedWaveId, cycle: nextCycle, event, suppressedSameWave: false });
  }

  const budgetRemainingMs = Math.max(0, normalizedCycle.totalBudgetMs - normalizedCycle.totalWaitMs);
  const hasPendingAbove = pendingAbove >= Math.max(1, minPendingAboveSelection || 1);
  const traceCapacityLow = currentMaxAdditionalTraces < Math.max(1, sufficientTraceCount || 4);
  const kind = !normalizedCycle.primaryUsed
    ? "primary"
    : (!normalizedCycle.secondaryUsed && normalizedCycle.traceCount >= 1 ? "secondary" : null);
  const requestedWaitMs = kind === "primary" ? maxWaitMs : secondaryWaitMs;
  const waitLimitMs = Math.min(Math.max(0, requestedWaitMs || 0), budgetRemainingMs);
  const eligible = !!(
    (plan.action === "trace" || (
      plan.action === "tap" && kind === "secondary" && normalizedCycle.traceCount <= 2
    ))
    && currentRootSafeCandidateCount > 0
    && Math.max(0, diagnostics.selectedUnsafeNewlyFrozenCount || 0) === 0
    && kind
    && waitLimitMs > 0
    && traceCapacityLow
    && hasPendingAbove
  );
  if (!eligible) {
    return Object.freeze({ plan, episode: null, consumedWaveId, cycle: normalizedCycle, event: null, suppressedSameWave: false });
  }

  const nextEpisode = Object.freeze({
    waveId,
    startedAtMs: nowMs,
    baselineRootCandidateCount: currentRootCandidateCount,
    baselineRootSafeCandidateCount: currentRootSafeCandidateCount,
    baselineMaxAdditionalTraces: currentMaxAdditionalTraces,
    kind,
    maxWaitMs: waitLimitMs,
    selectedCandidateMinY: diagnostics.selectedCandidateMinY ?? null,
    selectedCandidateMaxY: diagnostics.selectedCandidateMaxY ?? null,
    selectedCandidateMeanY: diagnostics.selectedCandidateMeanY ?? null,
    selectedCandidateVerticalSpan: diagnostics.selectedCandidateVerticalSpan || 0,
    selectedCandidateUpperHalfNodeCount: diagnostics.selectedCandidateUpperHalfNodeCount || 0,
    terminalPredictedRawCoins: diagnostics.terminalPredictedRawCoins || 0
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
