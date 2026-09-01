export const FEVER_ENTRY_CLEAR_COUNT = 29;
export const STRONGEST_MODE_FEVER_BOMB_CANCEL_MIN_REMAINING = 5;
export const STRONGEST_MODE_CORONATION_ELSA_NO_TRACE_TAP_DELAY_SEC = 0.15;
export const STRONGEST_MODE_CORONATION_ELSA_SETTLE_OPPORTUNITY_WAIT_REASON = "WAIT_FOR_SETTLE_OPPORTUNITY";

const buildOpportunityWaitPlan = (plan, episode, elapsedMs) => Object.freeze({
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
    opportunityWaitEvidenceActiveUpperInflow: true,
    opportunityWaitEvidenceFlowBlockedCandidate: episode.flowBlockedCandidateCount > 0,
    opportunityWaitEvidenceRecentSpawn: episode.recentSpawnCount > 0,
    opportunityWaitEvidenceSelectedLowerBiased: true,
    opportunityWaitEvidenceInflowAboveSelection: true
  })
});

export function evaluateCoronationElsaSettleOpportunity({
  plan,
  episode = null,
  waveId = 0,
  consumedWaveId = null,
  nowMs = 0,
  maxWaitMs = 0
} = {}) {
  if (!plan) {
    return Object.freeze({ plan, episode, consumedWaveId, event: null, suppressedSameWave: false });
  }
  const diagnostics = plan.diagnostics || {};
  const currentRootCandidateCount = Math.max(0, diagnostics.rootLegalTraceCandidateCount || 0);
  const currentRootSafeCandidateCount = Math.max(0, diagnostics.rootSafeTraceCandidateCount || 0);
  const currentMaxAdditionalTraces = Math.max(0, plan.maxAdditionalTraces || 0);

  if (episode) {
    const elapsedMs = Math.max(0, nowMs - episode.startedAtMs);
    let releaseReason = null;
    if (Math.max(0, diagnostics.activeInflowNodeCount || 0) === 0) {
      releaseReason = "ACTIVE_INFLOW_RESOLVED";
    } else if (currentRootSafeCandidateCount > episode.baselineRootSafeCandidateCount) {
      releaseReason = "ROOT_SAFE_CANDIDATES_IMPROVED";
    } else if (currentMaxAdditionalTraces > episode.baselineMaxAdditionalTraces) {
      releaseReason = "MAX_ADDITIONAL_TRACES_IMPROVED";
    } else if (elapsedMs >= maxWaitMs) {
      releaseReason = "MAX_WAIT_REACHED";
    }
    if (!releaseReason) {
      return Object.freeze({
        plan: buildOpportunityWaitPlan(plan, episode, elapsedMs),
        episode,
        consumedWaveId,
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
    return Object.freeze({ plan, episode: null, consumedWaveId, event, suppressedSameWave: false });
  }

  const selectedLowerCount = Math.max(0, diagnostics.selectedCandidateLowerHalfNodeCount || 0);
  const selectedUpperCount = Math.max(0, diagnostics.selectedCandidateUpperHalfNodeCount || 0);
  const hasYOpportunity = Number.isFinite(diagnostics.activeInflowMeanY)
    && Number.isFinite(diagnostics.selectedCandidateMeanY)
    && diagnostics.activeInflowMeanY < diagnostics.selectedCandidateMeanY;
  const hasSettleEvidence = Math.max(0, diagnostics.rootFlowBlockedTraceCandidateCount || 0) > 0
    || Math.max(0, diagnostics.recentSpawnCount || 0) > 0;
  const eligible = !!(
    plan.action === "trace"
    && currentRootSafeCandidateCount > 0
    && Math.max(0, diagnostics.selectedUnsafeNewlyFrozenCount || 0) === 0
    && Number.isFinite(waveId)
    && waveId > 0
    && consumedWaveId !== waveId
    && Math.max(0, diagnostics.activeInflowNodeCount || 0) > 0
    && Math.max(0, diagnostics.upperInflowNodeCount || 0) > 0
    && hasSettleEvidence
    && selectedLowerCount > selectedUpperCount
    && hasYOpportunity
  );
  if (!eligible) {
    const suppressedSameWave = !!(
      plan.action === "trace"
      && waveId > 0
      && consumedWaveId === waveId
      && Math.max(0, diagnostics.activeInflowNodeCount || 0) > 0
      && hasSettleEvidence
      && selectedLowerCount > selectedUpperCount
      && hasYOpportunity
    );
    return Object.freeze({ plan, episode: null, consumedWaveId, event: null, suppressedSameWave });
  }

  const nextEpisode = Object.freeze({
    waveId,
    startedAtMs: nowMs,
    baselineRootCandidateCount: currentRootCandidateCount,
    baselineRootSafeCandidateCount: currentRootSafeCandidateCount,
    baselineMaxAdditionalTraces: currentMaxAdditionalTraces,
    selectedCandidateMinY: diagnostics.selectedCandidateMinY ?? null,
    selectedCandidateMaxY: diagnostics.selectedCandidateMaxY ?? null,
    selectedCandidateMeanY: diagnostics.selectedCandidateMeanY ?? null,
    activeInflowMinY: diagnostics.activeInflowMinY ?? null,
    activeInflowMaxY: diagnostics.activeInflowMaxY ?? null,
    activeInflowMeanY: diagnostics.activeInflowMeanY ?? null,
    flowBlockedCandidateCount: Math.max(0, diagnostics.rootFlowBlockedTraceCandidateCount || 0),
    recentSpawnCount: Math.max(0, diagnostics.recentSpawnCount || 0)
  });
  const event = Object.freeze({ type: "start", ...nextEpisode });
  return Object.freeze({
    plan: buildOpportunityWaitPlan(plan, nextEpisode, 0),
    episode: nextEpisode,
    consumedWaveId: waveId,
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
