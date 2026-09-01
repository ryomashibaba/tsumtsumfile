import {
  COIN_CORRECTION_TABLE,
  DEFAULT_COIN_CORRECTION_TYPE,
  FIELD_BOTTOM,
  FIELD_CENTER_Y,
  FIELD_LEFT,
  FIELD_RIGHT,
  SKILL_TABLES,
  TSUM_RADIUS,
  clamp
} from "./config.js?v=tsum-images-5";
import {
  calculateCorrectedClearCoins,
  calculateEffectiveClearCount,
  getTsumClearWeight
} from "./bombLogic.js?v=tsum-images-5";

const CORONATION_ELSA_FREEZE_KIND = "coronationElsa";
const MIN_TRACE_LENGTH = 3;
const MAX_TRACE_LENGTH = 6;
const MAX_TRACE_DEPTH = 15;
const CORONATION_ELSA_ICE_CONNECT_DISTANCE = 78;
const LINE_SEGMENT_FALLBACK_DISTANCE_SQ = (TSUM_RADIUS * 0.75) ** 2;

export const CORONATION_ELSA_PLANNER_CONFIG = Object.freeze({
  softBudgetMs: 4,
  exactBudgetMs: 4,
  hardBudgetMs: 8,
  targetBudgetMs: 4.5,
  finalizationReserveMs: 1.25,
  rolloutTopChildren: 4,
  rolloutFourMinRemainingMs: 4,
  rolloutTwoMinRemainingMs: 2,
  rolloutOneMinRemainingMs: 1,
  opportunityWaitMaxMs: 1000 / 15,
  opportunitySecondaryWaitMaxMs: 1000 / 60,
  opportunityPreTapWaitMaxMs: 1000 / 30,
  opportunityPreTapWaitReserveMs: 1000 / 30,
  opportunityCycleWaitBudgetMs: 100,
  opportunityMinPendingAboveSelection: 1,
  opportunitySufficientTraceCount: 4,
  maxTraceDepth: MAX_TRACE_DEPTH,
  traceLengths: Object.freeze([3, 4, 5, 6]),
  beamWidths: Object.freeze([
    Object.freeze({ minDepth: 1, maxDepth: 6, width: 48 }),
    Object.freeze({ minDepth: 7, maxDepth: 10, width: 24 }),
    Object.freeze({ minDepth: 11, maxDepth: 15, width: 8 })
  ]),
  rolloutPolicies: Object.freeze([
    "min-new-frozen",
    "max-next-three-chain-nodes",
    "max-existing-ice-concentration"
  ])
});

const nowMs = () => (
  typeof performance !== "undefined" && typeof performance.now === "function"
    ? performance.now()
    : Date.now()
);

const bitForIndex = (index) => 1n << BigInt(index);
const maskHasIndex = (mask, index) => (mask & bitForIndex(index)) !== 0n;

const freezeArray = (values) => Object.freeze(Array.from(values));

const getFreezeRadius = (level) => {
  const table = SKILL_TABLES.coronationElsa?.freezeRadius || [];
  return table[clamp(level, 1, 6) - 1] || 0;
};

const distanceBetween = (first, second) => Math.hypot(
  first.x - second.x,
  first.y - second.y
);

const distanceToSegment = (point, start, end) => {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSq = dx * dx + dy * dy;
  if (lengthSq <= 0) {
    return distanceBetween(point, start);
  }
  const projection = Math.max(0, Math.min(
    1,
    ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSq
  ));
  return Math.hypot(
    point.x - (start.x + dx * projection),
    point.y - (start.y + dy * projection)
  );
};

const distanceToInfiniteLineOrSegment = (point, start, end) => {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSq = dx * dx + dy * dy;
  if (lengthSq <= LINE_SEGMENT_FALLBACK_DISTANCE_SQ) {
    return distanceToSegment(point, start, end);
  }
  return Math.abs((point.x - start.x) * dy - (point.y - start.y) * dx) / Math.sqrt(lengthSq);
};

const getIndexById = (snapshot, id) => {
  const index = snapshot.indexById[String(id)];
  return Number.isInteger(index) ? index : -1;
};

const normalizeState = (snapshot, state = snapshot.initialState) => {
  const frozenMask = typeof state?.frozenMask === "bigint"
    ? state.frozenMask
    : snapshot.initialState.frozenMask;
  const freezeLayerCounts = Array.isArray(state?.freezeLayerCounts)
    ? state.freezeLayerCounts
    : null;
  if (freezeLayerCounts && freezeLayerCounts.length !== snapshot.nodes.length) {
    throw new RangeError("freezeLayerCounts length must match the planner snapshot");
  }
  return { frozenMask, freezeLayerCounts };
};

const normalizeChainIndices = (snapshot, chainIndices) => {
  if (!Array.isArray(chainIndices) || chainIndices.length < 1) {
    throw new TypeError("chainIndices must contain at least one planner node index");
  }
  const seen = new Set();
  return chainIndices.map((rawIndex) => {
    const index = Number(rawIndex);
    if (!Number.isInteger(index) || index < 0 || index >= snapshot.nodes.length) {
      throw new RangeError(`Invalid planner node index: ${rawIndex}`);
    }
    if (seen.has(index)) {
      throw new Error(`Planner chain contains duplicate node index: ${index}`);
    }
    seen.add(index);
    return index;
  });
};

const buildRuleKey = (rule) => JSON.stringify({
  mode: rule?.mode || "normal",
  allowedTypeIds: Array.from(rule?.allowedTypeIds || []).map(String).sort(),
  subtypeId: rule?.subtypeId || null,
  startIsSpecial: !!rule?.startIsSpecial,
  unlimitedDistance: !!rule?.unlimitedDistance
});

const isReversePathLegal = (path, adjacency) => {
  const reversed = path.slice().reverse();
  const contextIndex = adjacency.startContextIndexByNode[reversed[0]];
  if (!Number.isInteger(contextIndex) || contextIndex < 0) {
    return false;
  }
  const context = adjacency.contexts[contextIndex];
  for (let index = 1; index < reversed.length; index += 1) {
    if (!context.neighborsByNode[reversed[index - 1]].includes(reversed[index])) {
      return false;
    }
  }
  return true;
};

const getPathKey = (snapshot, path) => path
  .map((index) => String(snapshot.nodes[index].id))
  .join("\u001f");

const getCanonicalPathKey = (snapshot, adjacency, path) => {
  const forwardKey = getPathKey(snapshot, path);
  if (!isReversePathLegal(path, adjacency)) {
    return forwardKey;
  }
  const reverseKey = getPathKey(snapshot, path.slice().reverse());
  return forwardKey < reverseKey ? forwardKey : reverseKey;
};

const isPreferredRepresentative = (candidate, current) => (
  !current ||
  candidate.chainIndices.length < current.chainIndices.length ||
  (
    candidate.chainIndices.length === current.chainIndices.length &&
    candidate.pathKey < current.pathKey
  )
);

export function buildCoronationElsaPlannerSnapshot(game, level = game?.selectedSkillLevel || 1, options = {}) {
  if (!game || !Array.isArray(game.tsums) || !game.boardState) {
    throw new TypeError("A live Game with tsums and boardState is required");
  }
  let anyFrozenMask = 0n;
  let coronationFrozenMask = 0n;
  let otherFrozenMask = 0n;
  let baseTraceEligibleMask = 0n;
  let activeInflowMask = 0n;
  let inflowUnsafeMask = 0n;
  let upperInflowMask = 0n;
  let recentSpawnMask = 0n;
  let unsettledMask = 0n;
  let stableSupportMask = 0n;
  let dynamicSupportMask = 0n;
  let genuineFallSpaceMask = 0n;
  let settlingOpportunityMask = 0n;
  const fallbackCoronationFrozenIds = new Set(
    (game.boardState.getFrozenNodesByKind?.(CORONATION_ELSA_FREEZE_KIND) || [])
      .map((tsum) => String(tsum?.id))
  );
  let sampledCorrectionType = null;
  const flowContext = options.flowContext || (typeof game.getStrongestModeCoronationElsaFlowSafetyContext === "function"
    ? game.getStrongestModeCoronationElsaFlowSafetyContext()
    : Object.freeze({
      safePlayableY: Number.NEGATIVE_INFINITY,
      lowerPlayableNodeCount: Number.POSITIVE_INFINITY,
      lowerBoardFilled: true
    }));
  const nodes = game.tsums.map((tsum, index) => {
    const dead = !!tsum?.dead;
    const removing = !!tsum?.removing;
    const clearOccupying = !!tsum?.clearOccupying;
    const inChain = !!tsum?.inChain;
    const inPlay = !!game.isTsumInPlayArea?.(tsum);
    const hasBubble = !!game.boardState.hasBubble?.(tsum);
    const coronationFreezeLayerCount = typeof game.boardState.getFrozenEntriesByKind === "function"
      ? game.boardState.getFrozenEntriesByKind(tsum, CORONATION_ELSA_FREEZE_KIND).length
      : (fallbackCoronationFrozenIds.has(String(tsum?.id)) ? 1 : 0);
    if (!sampledCorrectionType && coronationFreezeLayerCount > 0) {
      const entry = game.boardState.getFrozenEntriesByKind?.(tsum, CORONATION_ELSA_FREEZE_KIND)?.[0];
      sampledCorrectionType = entry?.correctionType || null;
    }
    const coronationFrozen = coronationFreezeLayerCount > 0;
    const anyFrozen = typeof game.boardState.isFrozen === "function"
      ? !!game.boardState.isFrozen(tsum)
      : coronationFrozen;
    const baseTraceEligible = !!(
      tsum &&
      !dead &&
      !removing &&
      !clearOccupying &&
      !inChain &&
      !hasBubble &&
      inPlay
    );
    if (anyFrozen) anyFrozenMask |= bitForIndex(index);
    if (coronationFrozen) coronationFrozenMask |= bitForIndex(index);
    if (anyFrozen && !coronationFrozen) otherFrozenMask |= bitForIndex(index);
    if (baseTraceEligible) baseTraceEligibleMask |= bitForIndex(index);
    const resolvedType = game.boardState.getResolvedType?.(tsum) || tsum?.type || null;
    const effectiveRadius = typeof game.getBodyRadius === "function"
      ? game.getBodyRadius(tsum)
      : game.boardState.getEffectiveRadius?.(tsum) ?? tsum?.radius ?? 0;
    const flowState = typeof game.getStrongestModeCoronationElsaFlowSafetyState === "function"
      ? game.getStrongestModeCoronationElsaFlowSafetyState(tsum, flowContext)
      : null;
    const spawnAgeSec = Number.isFinite(flowState?.spawnAgeSec)
      ? flowState.spawnAgeSec
      : (Number.isFinite(tsum?.spawnedAtElapsed) && Number.isFinite(game.elapsed)
        ? Math.max(0, game.elapsed - tsum.spawnedAtElapsed)
        : null);
    const settled = flowState?.settled !== false;
    const recentSpawn = !!flowState?.recentSpawn;
    const upperInflow = !!flowState?.upperInflow;
    const dynamicSupport = !!flowState?.dynamicSupport;
    const genuineFallSpace = !!(
      flowState?.genuineFallSpace ||
      flowState?.naturalFallSpace ||
      (flowState?.activeInflow && !dynamicSupport)
    );
    const stableSupport = flowState?.stableSupport === true || (!dynamicSupport && !genuineFallSpace);
    const supportKind = flowState?.supportKind || (
      stableSupport ? "stable" : (dynamicSupport ? "dynamic" : "fall-space")
    );
    const activeInflow = !!(baseTraceEligible && !anyFrozen && flowState?.activeInflow);
    const inflowUnsafe = !!(baseTraceEligible && !anyFrozen && flowState?.inflowUnsafe);
    // Opportunity is temporal evidence only; it must never become a hard
    // transition reject like active inflow.
    const settlingOpportunity = !!(baseTraceEligible && !anyFrozen && stableSupport && !settled);
    if (activeInflow) activeInflowMask |= bitForIndex(index);
    if (inflowUnsafe) inflowUnsafeMask |= bitForIndex(index);
    if (baseTraceEligible && !anyFrozen && upperInflow) upperInflowMask |= bitForIndex(index);
    if (baseTraceEligible && !anyFrozen && recentSpawn) recentSpawnMask |= bitForIndex(index);
    if (baseTraceEligible && !anyFrozen && !settled) unsettledMask |= bitForIndex(index);
    if (baseTraceEligible && !anyFrozen && stableSupport) stableSupportMask |= bitForIndex(index);
    if (baseTraceEligible && !anyFrozen && dynamicSupport) dynamicSupportMask |= bitForIndex(index);
    if (baseTraceEligible && !anyFrozen && genuineFallSpace) genuineFallSpaceMask |= bitForIndex(index);
    if (settlingOpportunity) settlingOpportunityMask |= bitForIndex(index);
    return Object.freeze({
      index,
      id: tsum?.id,
      x: Number(tsum?.x) || 0,
      y: Number(tsum?.y) || 0,
      vx: Number(tsum?.vx) || 0,
      vy: Number(tsum?.vy) || 0,
      spawnedAtElapsed: Number.isFinite(tsum?.spawnedAtElapsed) ? tsum.spawnedAtElapsed : null,
      spawnAgeSec,
      settled,
      recentSpawn,
      upperInflow,
      supportKind,
      stableSupport,
      dynamicSupport,
      genuineFallSpace,
      naturalFallSpace: genuineFallSpace,
      activeInflow,
      inflowUnsafe,
      settlingOpportunity,
      resolvedTypeId: resolvedType?.id || null,
      effectiveRadius: Number(effectiveRadius) || 0,
      baseRadius: Number(tsum?.baseRadius ?? tsum?.radius) || 0,
      isLarge: !!tsum?.isLarge,
      clearWeight: getTsumClearWeight(tsum),
      isMyTsum: typeof game.isMyTsumTypeId === "function"
        ? !!game.isMyTsumTypeId(resolvedType?.id)
        : resolvedType?.id === game.myTsum?.id,
      inPlay,
      dead,
      removing,
      clearOccupying,
      inChain,
      hasBubble,
      anyFrozen,
      coronationFrozen,
      coronationFreezeLayerCount,
      baseTraceEligible,
      traceEligible: baseTraceEligible && !anyFrozen
    });
  });
  const indexById = Object.freeze(Object.fromEntries(
    nodes.map((node) => [String(node.id), node.index])
  ));
  const freezeLayerCounts = freezeArray(nodes.map((node) => node.coronationFreezeLayerCount));
  const initialState = Object.freeze({
    frozenMask: coronationFrozenMask,
    freezeLayerCounts
  });
  return Object.freeze({
    level: clamp(level, 1, 6),
    freezeRadius: getFreezeRadius(level),
    lineRadius: getFreezeRadius(level) * 0.58,
    surroundRadius: getFreezeRadius(level),
    nodes: freezeArray(nodes),
    indexById,
    anyFrozenMask,
    coronationFrozenMask,
    otherFrozenMask,
    baseTraceEligibleMask,
    activeInflowMask,
    inflowUnsafeMask,
    freezeProtectedMask: inflowUnsafeMask,
    settlingOpportunityMask,
    pendingGeometryMask: activeInflowMask | settlingOpportunityMask,
    upperInflowMask,
    recentSpawnMask,
    unsettledMask,
    stableSupportMask,
    dynamicSupportMask,
    genuineFallSpaceMask,
    lowerPlayableNodeCount: Number.isFinite(flowContext?.lowerPlayableNodeCount)
      ? flowContext.lowerPlayableNodeCount
      : 0,
    safePlayableY: Number.isFinite(flowContext?.safePlayableY)
      ? flowContext.safePlayableY
      : null,
    flowDiagnostics: Object.freeze({
      activeInflowNodeCount: popcountMask(activeInflowMask),
      inflowUnsafeNodeCount: popcountMask(inflowUnsafeMask),
      upperInflowNodeCount: popcountMask(upperInflowMask),
      recentSpawnCount: popcountMask(recentSpawnMask),
      unsettledNodeCount: popcountMask(unsettledMask),
      stableSupportNodeCount: popcountMask(stableSupportMask),
      dynamicSupportNodeCount: popcountMask(dynamicSupportMask),
      genuineFallSpaceNodeCount: popcountMask(genuineFallSpaceMask),
      settlingOpportunityNodeCount: popcountMask(settlingOpportunityMask),
      pendingGeometryNodeCount: popcountMask(activeInflowMask | settlingOpportunityMask),
      stableSupportButUnsettledCount: popcountMask(settlingOpportunityMask),
      lowerPlayableNodeCount: Number.isFinite(flowContext?.lowerPlayableNodeCount)
        ? flowContext.lowerPlayableNodeCount
        : 0
    }),
    coinCorrectionType: sampledCorrectionType || (
      SKILL_TABLES.coronationElsa?.coinCorrectionType?.[clamp(level, 1, 6) - 1]
    ) || DEFAULT_COIN_CORRECTION_TYPE,
    initialState
  });
}

export function buildCoronationElsaPlannerAdjacency(game, snapshot, options = {}) {
  if (!game || typeof game.getChainBehaviorForStart !== "function" || typeof game.canConnectWithChainRule !== "function") {
    throw new TypeError("Game chain rule adapters are required to build planner adjacency");
  }
  const liveById = new Map((game.tsums || []).map((tsum) => [String(tsum?.id), tsum]));
  const shouldAbort = typeof options.shouldAbort === "function" ? options.shouldAbort : () => false;
  let aborted = false;
  const contextByKey = new Map();
  const startContextIndexByNode = Array(snapshot.nodes.length).fill(-1);
  for (const startNode of snapshot.nodes) {
    if (shouldAbort()) {
      aborted = true;
      break;
    }
    if (!startNode.baseTraceEligible) {
      continue;
    }
    const liveStart = liveById.get(String(startNode.id));
    const rule = liveStart ? game.getChainBehaviorForStart(liveStart) : null;
    if (!rule || !rule.allowedTypeIds?.size) {
      continue;
    }
    const key = buildRuleKey(rule);
    if (!contextByKey.has(key)) {
      contextByKey.set(key, { key, rule, startIndices: [] });
    }
    contextByKey.get(key).startIndices.push(startNode.index);
  }
  const contexts = [];
  for (const pendingContext of contextByKey.values()) {
    if (shouldAbort()) {
      aborted = true;
      break;
    }
    const neighborsByNode = snapshot.nodes.map(() => []);
    for (const fromNode of snapshot.nodes) {
      if (shouldAbort()) {
        aborted = true;
        break;
      }
      if (!fromNode.baseTraceEligible) continue;
      const liveFrom = liveById.get(String(fromNode.id));
      if (!liveFrom) continue;
      for (const candidateNode of snapshot.nodes) {
        if (shouldAbort()) {
          aborted = true;
          break;
        }
        if (
          !candidateNode.baseTraceEligible ||
          candidateNode.index === fromNode.index
        ) {
          continue;
        }
        const liveCandidate = liveById.get(String(candidateNode.id));
        if (
          liveCandidate &&
          game.canConnectWithChainRule(pendingContext.rule, liveFrom, liveCandidate)
        ) {
          neighborsByNode[fromNode.index].push(candidateNode.index);
        }
      }
      neighborsByNode[fromNode.index].sort((first, second) => (
        String(snapshot.nodes[first].id).localeCompare(String(snapshot.nodes[second].id))
      ));
    }
    const contextIndex = contexts.length;
    for (const startIndex of pendingContext.startIndices) {
      startContextIndexByNode[startIndex] = contextIndex;
    }
    contexts.push(Object.freeze({
      key: pendingContext.key,
      startIndices: freezeArray(pendingContext.startIndices),
      neighborsByNode: freezeArray(neighborsByNode.map(freezeArray))
    }));
  }
  return Object.freeze({
    aborted,
    nodeCount: snapshot.nodes.length,
    startContextIndexByNode: freezeArray(startContextIndexByNode),
    contexts: freezeArray(contexts)
  });
}

export function simulateCoronationElsaFreeze(snapshot, state, chainIndices) {
  const normalizedState = normalizeState(snapshot, state);
  const normalizedChain = normalizeChainIndices(snapshot, chainIndices);
  const start = snapshot.nodes[normalizedChain[0]];
  const end = snapshot.nodes[normalizedChain[normalizedChain.length - 1]];
  const lineTargetIndices = [];
  const priorFrozenIndices = [];
  const surroundTargetIndices = [];

  for (const node of snapshot.nodes) {
    if (
      !node.dead &&
      !node.removing &&
      node.inPlay &&
      distanceToInfiniteLineOrSegment(node, start, end) <= snapshot.lineRadius
    ) {
      lineTargetIndices.push(node.index);
    }
    if (
      !node.dead &&
      !node.removing &&
      maskHasIndex(normalizedState.frozenMask, node.index)
    ) {
      priorFrozenIndices.push(node.index);
    }
  }

  const surroundSeen = new Set();
  for (const centerIndex of priorFrozenIndices) {
    const center = snapshot.nodes[centerIndex];
    for (const node of snapshot.nodes) {
      if (
        node.dead ||
        node.removing ||
        node.index === centerIndex ||
        maskHasIndex(normalizedState.frozenMask, node.index) ||
        distanceBetween(center, node) > snapshot.surroundRadius
      ) {
        continue;
      }
      if (!surroundSeen.has(node.index)) {
        surroundSeen.add(node.index);
        surroundTargetIndices.push(node.index);
      }
    }
  }

  const orderedTargetIndices = [];
  const targetSeen = new Set();
  const reasonCounts = Array(snapshot.nodes.length).fill(0);
  const addFreezeReason = (indices) => {
    for (const index of indices) {
      reasonCounts[index] += 1;
      if (!targetSeen.has(index)) {
        targetSeen.add(index);
        orderedTargetIndices.push(index);
      }
    }
  };
  addFreezeReason(normalizedChain);
  addFreezeReason(lineTargetIndices);
  addFreezeReason(priorFrozenIndices);
  addFreezeReason(surroundTargetIndices);

  let targetMask = 0n;
  for (const index of orderedTargetIndices) {
    targetMask |= bitForIndex(index);
  }
  const nextFrozenMask = normalizedState.frozenMask | targetMask;
  const nextFreezeLayerCounts = normalizedState.freezeLayerCounts
    ? freezeArray(normalizedState.freezeLayerCounts.map((count, index) => (
      count + (targetSeen.has(index) ? 1 : 0)
    )))
    : null;

  return Object.freeze({
    chainIndices: freezeArray(normalizedChain),
    lineTargetIndices: freezeArray(lineTargetIndices),
    priorFrozenIndices: freezeArray(priorFrozenIndices),
    surroundTargetIndices: freezeArray(surroundTargetIndices),
    targetIndices: freezeArray(orderedTargetIndices),
    reasonCounts: freezeArray(reasonCounts),
    targetMask,
    nextFrozenMask,
    nextFreezeLayerCounts
  });
}

export function evaluateCoronationElsaFreezeTransitionSafety(
  snapshot,
  state,
  chainIndices,
  simulationOverride = null
) {
  const normalizedState = normalizeState(snapshot, state);
  const simulation = simulationOverride || simulateCoronationElsaFreeze(snapshot, normalizedState, chainIndices);
  const newlyFrozenMask = simulation.nextFrozenMask & ~normalizedState.frozenMask;
  const unsafeNewlyFrozenMask = newlyFrozenMask & (snapshot.inflowUnsafeMask || 0n);
  const activeInflowNewlyFrozenMask = newlyFrozenMask & (snapshot.activeInflowMask || 0n);
  return Object.freeze({
    simulation,
    newlyFrozenMask,
    unsafeNewlyFrozenMask,
    activeInflowNewlyFrozenMask,
    newlyFrozenCount: popcountMask(newlyFrozenMask),
    unsafeNewlyFrozenCount: popcountMask(unsafeNewlyFrozenMask),
    activeInflowNewlyFrozenCount: popcountMask(activeInflowNewlyFrozenMask),
    freezeFlowSafe: unsafeNewlyFrozenMask === 0n
  });
}

export function enumerateCoronationElsaPlannerTraces(
  snapshot,
  adjacency,
  state = snapshot.initialState,
  options = {}
) {
  const startedAt = nowMs();
  const normalizedState = normalizeState(snapshot, state);
  const requestedLengths = Array.isArray(options.lengths) && options.lengths.length
    ? options.lengths
    : [MIN_TRACE_LENGTH];
  const lengths = Array.from(new Set(requestedLengths.map(Number)))
    .filter((length) => Number.isInteger(length) && length >= MIN_TRACE_LENGTH && length <= MAX_TRACE_LENGTH)
    .sort((first, second) => first - second);
  if (!lengths.length) {
    throw new RangeError("Planner trace lengths must contain an integer from 3 through 6");
  }
  const dedupeByNextFrozenMask = options.dedupeByNextFrozenMask !== false;
  const excludeUnsafeTransitions = options.excludeUnsafeTransitions === true;
  const shouldAbort = typeof options.shouldAbort === "function" ? options.shouldAbort : () => false;
  const onSafeCandidate = typeof options.onSafeCandidate === "function"
    ? options.onSafeCandidate
    : null;
  const blockedMask = snapshot.otherFrozenMask | normalizedState.frozenMask;
  const rawPaths = [];
  let aborted = false;

  for (const targetLength of lengths) {
    if (shouldAbort()) {
      aborted = true;
      break;
    }
    for (const startNode of snapshot.nodes) {
      if (shouldAbort()) {
        aborted = true;
        break;
      }
      if (
        !startNode.baseTraceEligible ||
        maskHasIndex(blockedMask, startNode.index)
      ) {
        continue;
      }
      const contextIndex = adjacency.startContextIndexByNode[startNode.index];
      if (!Number.isInteger(contextIndex) || contextIndex < 0) {
        continue;
      }
      const context = adjacency.contexts[contextIndex];
      const path = [startNode.index];
      const used = new Set(path);
      const visit = (currentIndex) => {
        if (shouldAbort()) {
          aborted = true;
          return;
        }
        if (path.length === targetLength) {
          rawPaths.push(path.slice());
          return;
        }
        for (const candidateIndex of context.neighborsByNode[currentIndex]) {
          if (
            used.has(candidateIndex) ||
            maskHasIndex(blockedMask, candidateIndex)
          ) {
            continue;
          }
          used.add(candidateIndex);
          path.push(candidateIndex);
          visit(candidateIndex);
          if (aborted) return;
          path.pop();
          used.delete(candidateIndex);
        }
      };
      visit(startNode.index);
    }
  }

  const pathCandidatesByKey = new Map();
  for (const path of rawPaths) {
    if (shouldAbort()) {
      aborted = true;
      break;
    }
    const canonicalPathKey = getCanonicalPathKey(snapshot, adjacency, path);
    if (pathCandidatesByKey.has(canonicalPathKey)) {
      continue;
    }
    const simulation = simulateCoronationElsaFreeze(snapshot, normalizedState, path);
    const safety = evaluateCoronationElsaFreezeTransitionSafety(
      snapshot,
      normalizedState,
      path,
      simulation
    );
    const chainIds = freezeArray(path.map((index) => snapshot.nodes[index].id));
    const builtCandidate = Object.freeze({
      chainIndices: freezeArray(path),
      chainIds,
      pathKey: getPathKey(snapshot, path),
      canonicalPathKey,
      targetMask: simulation.targetMask,
      newlyFrozenMask: safety.newlyFrozenMask,
      unsafeNewlyFrozenMask: safety.unsafeNewlyFrozenMask,
      activeInflowNewlyFrozenMask: safety.activeInflowNewlyFrozenMask,
      newlyFrozenCount: safety.newlyFrozenCount,
      unsafeNewlyFrozenCount: safety.unsafeNewlyFrozenCount,
      activeInflowNewlyFrozenCount: safety.activeInflowNewlyFrozenCount,
      freezeFlowSafe: safety.freezeFlowSafe,
      rootRejectReason: safety.freezeFlowSafe ? null : "ACTIVE_INFLOW_FREEZE",
      nextFrozenMask: simulation.nextFrozenMask,
      nextFreezeLayerCounts: simulation.nextFreezeLayerCounts,
      simulation
    });
    pathCandidatesByKey.set(canonicalPathKey, builtCandidate);
    if (builtCandidate.freezeFlowSafe) onSafeCandidate?.(builtCandidate);
  }
  const pathCandidates = Array.from(pathCandidatesByKey.values()).sort((first, second) => (
    first.chainIndices.length - second.chainIndices.length ||
    first.pathKey.localeCompare(second.pathKey)
  ));
  const safeTraceCandidateCount = pathCandidates.filter((candidate) => candidate.freezeFlowSafe).length;
  const unsafeTraceCandidateCount = pathCandidates.length - safeTraceCandidateCount;
  const waitableUnsafeTraceCandidateCount = pathCandidates.filter((candidate) => (
    candidate.unsafeNewlyFrozenMask !== 0n &&
    (candidate.unsafeNewlyFrozenMask & ~(snapshot.activeInflowMask || 0n)) === 0n
  )).length;
  const eligiblePathCandidates = excludeUnsafeTransitions
    ? pathCandidates.filter((candidate) => candidate.freezeFlowSafe)
    : pathCandidates;
  let candidates = eligiblePathCandidates;
  if (dedupeByNextFrozenMask) {
    const candidateByMask = new Map();
    for (const candidate of eligiblePathCandidates) {
      const key = candidate.nextFrozenMask.toString(16);
      const current = candidateByMask.get(key);
      if (isPreferredRepresentative(candidate, current)) {
        candidateByMask.set(key, candidate);
      }
    }
    candidates = Array.from(candidateByMask.values()).sort((first, second) => (
      first.chainIndices.length - second.chainIndices.length ||
      first.pathKey.localeCompare(second.pathKey)
    ));
  }
  return Object.freeze({
    lengths: freezeArray(lengths),
    dedupeByNextFrozenMask,
    excludeUnsafeTransitions,
    candidates: freezeArray(candidates),
    rawCandidateCount: rawPaths.length,
    pathDedupedCandidateCount: pathCandidates.length,
    eligiblePathDedupedCandidateCount: eligiblePathCandidates.length,
    frozenMaskDedupedCandidateCount: candidates.length,
    safeTraceCandidateCount,
    unsafeTraceCandidateCount,
    waitableUnsafeTraceCandidateCount,
    aborted,
    elapsedMs: nowMs() - startedAt
  });
}

export function profileCoronationElsaPlanner(game, options = {}) {
  const totalStartedAt = nowMs();
  const level = options.level || game?.selectedSkillLevel || 1;
  const snapshotStartedAt = nowMs();
  const snapshot = buildCoronationElsaPlannerSnapshot(game, level);
  const snapshotBuildMs = nowMs() - snapshotStartedAt;
  const adjacencyStartedAt = nowMs();
  const adjacency = buildCoronationElsaPlannerAdjacency(game, snapshot);
  const adjacencyBuildMs = nowMs() - adjacencyStartedAt;
  const length3 = enumerateCoronationElsaPlannerTraces(
    snapshot,
    adjacency,
    snapshot.initialState,
    { lengths: [3], dedupeByNextFrozenMask: true }
  );
  const length3To6 = enumerateCoronationElsaPlannerTraces(
    snapshot,
    adjacency,
    snapshot.initialState,
    { lengths: [3, 4, 5, 6], dedupeByNextFrozenMask: true }
  );
  const diagnostics = Object.freeze({
    sessionId: options.sessionId || null,
    committedTraceCount: Math.max(0, options.committedTraceCount || 0),
    nodeCount: snapshot.nodes.length,
    snapshotBuildMs,
    adjacencyBuildMs,
    length3CandidateCount: length3.rawCandidateCount,
    length3PathDedupedCount: length3.pathDedupedCandidateCount,
    length3FrozenMaskDedupedCount: length3.frozenMaskDedupedCandidateCount,
    length3To6CandidateCount: length3To6.rawCandidateCount,
    length3To6PathDedupedCount: length3To6.pathDedupedCandidateCount,
    length3To6FrozenMaskDedupedCount: length3To6.frozenMaskDedupedCandidateCount,
    safeTraceCandidateCount: length3To6.safeTraceCandidateCount,
    unsafeTraceCandidateCount: length3To6.unsafeTraceCandidateCount,
    ...snapshot.flowDiagnostics,
    length3EnumerationMs: length3.elapsedMs,
    length3To6EnumerationMs: length3To6.elapsedMs,
    initialFrozenMaskHex: `0x${snapshot.initialState.frozenMask.toString(16)}`,
    totalProfileMs: nowMs() - totalStartedAt
  });
  if (
    options.log !== false &&
    game?.coronationElsaDebug &&
    typeof game.logCodexCoronationPayload === "function"
  ) {
    game.logCodexCoronationPayload("[CODEXLOG CORONATION PLANNER PROFILE]", diagnostics);
  }
  return Object.freeze({
    snapshot,
    adjacency,
    initialState: snapshot.initialState,
    diagnostics
  });
}

const popcountMask = (mask) => {
  let value = mask;
  let count = 0;
  while (value) {
    value &= value - 1n;
    count += 1;
  }
  return count;
};

const compareNumberTuple = (first, second) => {
  const length = Math.max(first.length, second.length);
  for (let index = 0; index < length; index += 1) {
    const delta = (first[index] || 0) - (second[index] || 0);
    if (delta !== 0) return delta;
  }
  return 0;
};

const getFrozenComponents = (snapshot, frozenMask) => {
  const frozenIndices = snapshot.nodes
    .filter((node) => maskHasIndex(frozenMask, node.index) && !node.dead && !node.removing)
    .map((node) => node.index);
  const remaining = new Set(frozenIndices);
  const components = [];
  while (remaining.size) {
    const startIndex = remaining.values().next().value;
    remaining.delete(startIndex);
    const queue = [startIndex];
    const component = [];
    while (queue.length) {
      const index = queue.shift();
      component.push(index);
      const node = snapshot.nodes[index];
      for (const candidateIndex of Array.from(remaining)) {
        const candidate = snapshot.nodes[candidateIndex];
        const connectedDistance = Math.max(
          node.effectiveRadius + candidate.effectiveRadius + 3,
          CORONATION_ELSA_ICE_CONNECT_DISTANCE
        );
        if (distanceBetween(node, candidate) <= connectedDistance) {
          remaining.delete(candidateIndex);
          queue.push(candidateIndex);
        }
      }
    }
    component.sort((a, b) => String(snapshot.nodes[a].id).localeCompare(String(snapshot.nodes[b].id)));
    components.push(component);
  }
  components.sort((a, b) => String(snapshot.nodes[a[0]]?.id).localeCompare(String(snapshot.nodes[b[0]]?.id)));
  return components;
};

/**
 * Pure counterpart of BoardStateService.getCoronationFrozenTapInfo().
 * It is shared by search, diagnostics, and the live tap adapter.
 */
export function evaluateCoronationElsaTapComponents(snapshot, state = snapshot.initialState) {
  const normalizedState = normalizeState(snapshot, state);
  const layerCounts = normalizedState.freezeLayerCounts || snapshot.initialState.freezeLayerCounts;
  const components = getFrozenComponents(snapshot, normalizedState.frozenMask);
  const coinTable = COIN_CORRECTION_TABLE[snapshot.coinCorrectionType]
    || COIN_CORRECTION_TABLE[DEFAULT_COIN_CORRECTION_TYPE];
  const evaluated = components.map((componentIndices) => {
    const componentSet = new Set(componentIndices);
    const splashIndices = [];
    for (const node of snapshot.nodes) {
      if (
        node.dead ||
        node.removing ||
        maskHasIndex(normalizedState.frozenMask, node.index)
      ) {
        continue;
      }
      let touchingCount = 0;
      for (const frozenIndex of componentIndices) {
        const frozenNode = snapshot.nodes[frozenIndex];
        const splashDistance = frozenNode.effectiveRadius + node.effectiveRadius + TSUM_RADIUS * 0.02;
        if (distanceBetween(frozenNode, node) <= splashDistance) {
          touchingCount += 1;
          if (touchingCount > 1) break;
        }
      }
      if (touchingCount === 1) splashIndices.push(node.index);
    }
    const targetIndices = componentIndices.concat(splashIndices);
    const targets = targetIndices.map((index) => snapshot.nodes[index]);
    const layerMass = componentIndices.reduce((sum, index) => sum + Math.max(0, layerCounts[index] || 0), 0);
    const additionalClearCount = Math.max(0, layerMass - componentIndices.length);
    const effectiveClearCount = calculateEffectiveClearCount({ targets, additionalClearCount });
    const clampedClearCount = clamp(effectiveClearCount, 0, 317);
    const rawCoins = calculateCorrectedClearCoins({
      coinTable,
      targets,
      additionalClearCount,
      effectiveClearCountOverride: clampedClearCount,
      applyLargeTsumCorrection: true
    });
    const physicalMyTsumCount = targetIndices.reduce((sum, index) => (
      sum + (snapshot.nodes[index].isMyTsum ? 1 : 0)
    ), 0);
    const remainingLayerMass = layerCounts.reduce((sum, count, index) => (
      sum + (componentSet.has(index) ? 0 : Math.max(0, count || 0))
    ), 0);
    return Object.freeze({
      tapNodeIndex: componentIndices[0],
      tapNodeId: snapshot.nodes[componentIndices[0]]?.id ?? null,
      componentIndices: freezeArray(componentIndices),
      splashIndices: freezeArray(splashIndices),
      targetIndices: freezeArray(targetIndices),
      connectedFrozenCount: componentIndices.length,
      splashNormalCount: splashIndices.length,
      physicalTargetCount: targetIndices.length,
      physicalMyTsumCount,
      freezeLayerBonus: additionalClearCount,
      additionalClearCount,
      effectiveClearCount,
      rawCoins,
      remainingLayerMass,
      remainingComponentCount: Math.max(0, components.length - 1)
    });
  });
  const tuple = (entry) => [
    entry.rawCoins,
    entry.effectiveClearCount,
    entry.physicalMyTsumCount,
    entry.physicalTargetCount,
    -entry.remainingLayerMass,
    -entry.remainingComponentCount
  ];
  evaluated.sort((first, second) => (
    compareNumberTuple(tuple(second), tuple(first)) ||
    String(first.tapNodeId).localeCompare(String(second.tapNodeId))
  ));
  return Object.freeze({
    components: freezeArray(evaluated),
    best: evaluated[0] || null
  });
}

const buildWeakNeighborSets = (snapshot, adjacency, frozenMask) => {
  const blockedMask = snapshot.otherFrozenMask | frozenMask;
  const neighbors = snapshot.nodes.map(() => new Set());
  for (const context of adjacency.contexts) {
    for (let fromIndex = 0; fromIndex < context.neighborsByNode.length; fromIndex += 1) {
      if (maskHasIndex(blockedMask, fromIndex)) continue;
      for (const toIndex of context.neighborsByNode[fromIndex]) {
        if (maskHasIndex(blockedMask, toIndex)) continue;
        neighbors[fromIndex].add(toIndex);
        neighbors[toIndex].add(fromIndex);
      }
    }
  }
  return neighbors;
};

const getTraceUpperBound = (snapshot, adjacency, frozenMask) => {
  const blockedMask = snapshot.otherFrozenMask | frozenMask;
  const available = snapshot.nodes.filter((node) => (
    node.baseTraceEligible && !maskHasIndex(blockedMask, node.index)
  ));
  const countBound = Math.min(MAX_TRACE_DEPTH, Math.floor(available.length / MIN_TRACE_LENGTH));
  if (countBound <= 0) return 0;
  const neighbors = buildWeakNeighborSets(snapshot, adjacency, frozenMask);
  const remaining = new Set(available.map((node) => node.index));
  let componentBound = 0;
  while (remaining.size) {
    const start = remaining.values().next().value;
    remaining.delete(start);
    const queue = [start];
    let size = 0;
    while (queue.length) {
      const index = queue.shift();
      size += 1;
      for (const candidate of neighbors[index]) {
        if (remaining.delete(candidate)) queue.push(candidate);
      }
    }
    componentBound += Math.floor(size / MIN_TRACE_LENGTH);
  }
  return Math.min(countBound, componentBound);
};

const getCandidateMetrics = (snapshot, state, candidate) => {
  const newFrozenCount = popcountMask(candidate.nextFrozenMask & ~state.frozenMask);
  const start = snapshot.nodes[candidate.chainIndices[0]];
  const end = snapshot.nodes[candidate.chainIndices[candidate.chainIndices.length - 1]];
  const dx = Math.abs(end.x - start.x);
  const dy = Math.abs(end.y - start.y);
  const parallelScore = Math.max(dx, dy) / Math.max(1, Math.hypot(dx, dy));
  const edgeDistance = Math.min(
    Math.abs(start.x - FIELD_LEFT),
    Math.abs(FIELD_RIGHT - start.x),
    Math.abs(FIELD_BOTTOM - start.y)
  );
  const frozenNodes = snapshot.nodes.filter((node) => maskHasIndex(state.frozenMask, node.index));
  let iceDistance = Number.POSITIVE_INFINITY;
  for (const index of candidate.chainIndices) {
    for (const frozen of frozenNodes) {
      iceDistance = Math.min(iceDistance, distanceBetween(snapshot.nodes[index], frozen));
    }
  }
  if (!Number.isFinite(iceDistance)) iceDistance = 1e6;
  return { newFrozenCount, parallelScore, edgeDistance, iceDistance };
};

const terminalTuple = (terminal) => terminal ? [
  terminal.rawCoins,
  terminal.effectiveClearCount,
  terminal.physicalMyTsumCount,
  terminal.physicalTargetCount,
  -terminal.remainingLayerMass,
  -terminal.remainingComponentCount
] : [0, 0, 0, 0, 0, 0];

const getYDistribution = (nodes) => {
  const ys = nodes
    .map((node) => Number(node?.y))
    .filter(Number.isFinite);
  if (ys.length === 0) {
    return Object.freeze({
      minY: null,
      maxY: null,
      meanY: null,
      upperHalfNodeCount: 0,
      lowerHalfNodeCount: 0
    });
  }
  return Object.freeze({
    minY: Math.min(...ys),
    maxY: Math.max(...ys),
    meanY: ys.reduce((sum, y) => sum + y, 0) / ys.length,
    upperHalfNodeCount: ys.filter((y) => y < FIELD_CENTER_Y).length,
    lowerHalfNodeCount: ys.filter((y) => y >= FIELD_CENTER_Y).length
  });
};

const compareRoutes = (first, second) => {
  if (!second) return 1;
  const terminalComparison = compareNumberTuple(terminalTuple(first.terminal), terminalTuple(second.terminal));
  if (terminalComparison) return terminalComparison;
  const firstAverage = first.depth ? first.chainLengthSum / first.depth : 3;
  const secondAverage = second.depth ? second.chainLengthSum / second.depth : 3;
  const routeComparison = compareNumberTuple([
    -Math.abs(firstAverage - 3),
    first.proximityScore,
    first.parallelScore,
    first.edgeScore
  ], [
    -Math.abs(secondAverage - 3),
    second.proximityScore,
    second.parallelScore,
    second.edgeScore
  ]);
  return routeComparison || -first.routeKey.localeCompare(second.routeKey);
};

const freezePlanResult = (result) => Object.freeze({
  ...result,
  chainIds: freezeArray(result.chainIds || []),
  routeChainIds: freezeArray((result.routeChainIds || []).map(freezeArray)),
  diagnostics: Object.freeze({ ...result.diagnostics })
});

export function solveCoronationElsaStrongestModePlan(snapshot, adjacency, options = {}) {
  const config = { ...CORONATION_ELSA_PLANNER_CONFIG, ...(options.config || {}) };
  const clock = typeof options.now === "function" ? options.now : nowMs;
  const startedAt = clock();
  const outerDeadline = Number.isFinite(options.deadlineMs)
    ? options.deadlineMs
    : startedAt + Math.max(0, config.hardBudgetMs);
  const configuredExactBudgetMs = Object.prototype.hasOwnProperty.call(options.config || {}, "exactBudgetMs")
    ? config.exactBudgetMs
    : (Object.prototype.hasOwnProperty.call(options.config || {}, "softBudgetMs")
      ? config.softBudgetMs
      : config.exactBudgetMs);
  const exactDeadline = Math.min(
    outerDeadline,
    Number.isFinite(options.exactDeadlineMs)
      ? options.exactDeadlineMs
      : startedAt + Math.max(0, configuredExactBudgetMs)
  );
  const qualityDeadline = Math.min(
    outerDeadline,
    Number.isFinite(options.targetDeadlineMs) ? options.targetDeadlineMs : outerDeadline
  );
  let activeDeadline = exactDeadline;
  let timeoutStage = null;
  let bestSafeRootRoute = null;
  let exploredStateCount = 0;
  let memoHitCount = 0;
  let branchPruneCount = 0;
  let rootRawCandidateCount = 0;
  let rootDedupedCandidateCount = 0;
  let rootSafeTraceCandidateCount = 0;
  let rootUnsafeTraceCandidateCount = 0;
  let rootWaitableUnsafeTraceCandidateCount = 0;
  let unsafeTransitionRejectedCount = 0;
  let futureTemporarilyUnsafeCandidateCount = 0;
  const depthMemo = new Map();
  const candidateMemo = new Map();
  const timedOut = () => clock() >= activeDeadline;
  const outerTimedOut = () => clock() >= outerDeadline;
  const beamShouldStop = () => (
    outerTimedOut() || (!!bestSafeRootRoute && clock() >= qualityDeadline)
  );
  const remainingMs = () => Math.max(0, outerDeadline - clock());
  const assertWithinBudget = (stage = "exact") => {
    if (timedOut()) {
      timeoutStage = stage;
      throw new Error("CORONATION_ELSA_PLANNER_TIMEOUT");
    }
  };
  const maskState = (mask) => Object.freeze({ frozenMask: mask, freezeLayerCounts: null });
  const rememberSafeRootCandidate = (candidate) => {
    const transition = candidate.simulation || simulateCoronationElsaFreeze(
      snapshot,
      snapshot.initialState,
      candidate.chainIndices
    );
    const metrics = getCandidateMetrics(snapshot, snapshot.initialState, candidate);
    const route = {
      terminal: null,
      route: [candidate],
      depth: 1,
      chainLengthSum: candidate.chainIndices.length,
      proximityScore: -metrics.iceDistance,
      parallelScore: metrics.parallelScore,
      edgeScore: -metrics.edgeDistance,
      routeKey: candidate.pathKey,
      state: Object.freeze({
        frozenMask: transition.nextFrozenMask,
        freezeLayerCounts: transition.nextFreezeLayerCounts
      })
    };
    if (!bestSafeRootRoute || compareRoutes(route, bestSafeRootRoute) > 0) {
      bestSafeRootRoute = route;
      options.onBestSafeCandidate?.(candidate);
    }
  };
  const getMaskCandidates = (frozenMask, exact = true) => {
    const isRoot = frozenMask === snapshot.initialState.frozenMask;
    const key = `${frozenMask.toString(16)}:${isRoot ? "root-safe" : "future-structural"}`;
    if (candidateMemo.has(key)) return candidateMemo.get(key);
    const enumeration = enumerateCoronationElsaPlannerTraces(
      snapshot,
      adjacency,
      maskState(frozenMask),
      {
        lengths: config.traceLengths,
        dedupeByNextFrozenMask: true,
        excludeUnsafeTransitions: isRoot,
        shouldAbort: timedOut,
        onSafeCandidate: isRoot ? rememberSafeRootCandidate : null
      }
    );
    if (enumeration.aborted && exact) assertWithinBudget("exact-enumeration");
    if (isRoot) {
      rootRawCandidateCount = enumeration.pathDedupedCandidateCount;
      rootDedupedCandidateCount = enumeration.frozenMaskDedupedCandidateCount;
      rootSafeTraceCandidateCount = enumeration.safeTraceCandidateCount;
      rootUnsafeTraceCandidateCount = enumeration.unsafeTraceCandidateCount;
      rootWaitableUnsafeTraceCandidateCount = enumeration.waitableUnsafeTraceCandidateCount;
      unsafeTransitionRejectedCount += enumeration.unsafeTraceCandidateCount;
    } else {
      futureTemporarilyUnsafeCandidateCount += enumeration.unsafeTraceCandidateCount;
    }
    candidateMemo.set(key, enumeration.candidates);
    return enumeration.candidates;
  };
  const solveDepth = (frozenMask) => {
    assertWithinBudget();
    const key = frozenMask.toString(16);
    if (depthMemo.has(key)) {
      memoHitCount += 1;
      return depthMemo.get(key);
    }
    exploredStateCount += 1;
    const candidates = getMaskCandidates(frozenMask, true);
    const upperBound = getTraceUpperBound(snapshot, adjacency, frozenMask);
    if (upperBound <= 0 || candidates.length === 0) {
      depthMemo.set(key, 0);
      return 0;
    }
    let best = 0;
    for (const candidate of candidates) {
      assertWithinBudget();
      const childUpper = getTraceUpperBound(snapshot, adjacency, candidate.nextFrozenMask);
      if (1 + childUpper <= best) {
        branchPruneCount += 1;
        continue;
      }
      best = Math.max(best, 1 + solveDepth(candidate.nextFrozenMask));
      if (best >= upperBound) break;
    }
    depthMemo.set(key, best);
    return best;
  };
  const evaluateTerminal = (state) => evaluateCoronationElsaTapComponents(snapshot, state).best;
  const phaseBMemo = new Map();
  const solveBestRoute = (state, remainingDepth) => {
    assertWithinBudget();
    const stateKey = `${state.frozenMask.toString(16)}:${state.freezeLayerCounts.join(",")}:${remainingDepth}`;
    if (phaseBMemo.has(stateKey)) {
      memoHitCount += 1;
      return phaseBMemo.get(stateKey);
    }
    if (remainingDepth <= 0) {
      const terminalRoute = {
        terminal: evaluateTerminal(state),
        route: [],
        depth: 0,
        chainLengthSum: 0,
        proximityScore: 0,
        parallelScore: 0,
        edgeScore: 0,
        routeKey: ""
      };
      phaseBMemo.set(stateKey, terminalRoute);
      return terminalRoute;
    }
    let bestRoute = null;
    for (const candidate of getMaskCandidates(state.frozenMask, true)) {
      assertWithinBudget();
      const childDepth = solveDepth(candidate.nextFrozenMask);
      if (1 + childDepth !== remainingDepth) continue;
      const transition = simulateCoronationElsaFreeze(snapshot, state, candidate.chainIndices);
      const nextState = Object.freeze({
        frozenMask: transition.nextFrozenMask,
        freezeLayerCounts: transition.nextFreezeLayerCounts
      });
      const suffix = solveBestRoute(nextState, remainingDepth - 1);
      const metrics = getCandidateMetrics(snapshot, state, candidate);
      const routeKey = candidate.pathKey + (suffix.routeKey ? `\u001e${suffix.routeKey}` : "");
      const route = {
        terminal: suffix.terminal,
        route: [candidate, ...suffix.route],
        depth: 1 + suffix.depth,
        chainLengthSum: candidate.chainIndices.length + suffix.chainLengthSum,
        proximityScore: -metrics.iceDistance + suffix.proximityScore,
        parallelScore: metrics.parallelScore + suffix.parallelScore,
        edgeScore: -metrics.edgeDistance + suffix.edgeScore,
        routeKey
      };
      if (compareRoutes(route, bestRoute) > 0) bestRoute = route;
    }
    phaseBMemo.set(stateKey, bestRoute);
    return bestRoute;
  };

  const buildResult = (mode, maxDepth, route, extraDiagnostics = {}) => {
    const firstCandidate = route?.route?.[0] || null;
    const budgetTimedOut = extraDiagnostics.budgetTimedOut === true;
    const terminal = route?.terminal || (budgetTimedOut ? null : evaluateTerminal(snapshot.initialState));
    const hasActiveInflow = (snapshot.activeInflowMask || 0n) !== 0n;
    const hasWaitableRootReject = (
      rootSafeTraceCandidateCount === 0 &&
      rootRawCandidateCount > 0 &&
      rootWaitableUnsafeTraceCandidateCount > 0
    );
    const action = firstCandidate
      ? "trace"
      : (budgetTimedOut
        ? "wait"
        : (hasWaitableRootReject
        ? "wait"
        : (terminal ? "tap" : (hasActiveInflow ? "wait" : "none"))));
    const waitReason = action === "wait"
      ? (budgetTimedOut
        ? "WAIT_FOR_PLANNER_BUDGET"
        : (hasWaitableRootReject ? "WAIT_FOR_INFLOW" : "WAIT_FOR_BOARD_REFILL"))
      : null;
    const metrics = firstCandidate
      ? getCandidateMetrics(snapshot, snapshot.initialState, firstCandidate)
      : null;
    const selectedCandidateY = getYDistribution(
      (firstCandidate?.chainIndices || []).map((index) => snapshot.nodes[index])
    );
    const activeInflowY = getYDistribution(
      snapshot.nodes.filter((node) => maskHasIndex(snapshot.activeInflowMask || 0n, node.index))
    );
    const coronationFrozenY = getYDistribution(
      snapshot.nodes.filter((node) => maskHasIndex(snapshot.coronationFrozenMask || 0n, node.index))
    );
    const selectionMeanY = selectedCandidateY.meanY;
    const isAboveSelection = (node) => Number.isFinite(selectionMeanY) && node.y < selectionMeanY;
    const settlingOpportunityAboveSelectionCount = snapshot.nodes.filter((node) => (
      maskHasIndex(snapshot.settlingOpportunityMask || 0n, node.index) && isAboveSelection(node)
    )).length;
    const activeInflowAboveSelectionCount = snapshot.nodes.filter((node) => (
      maskHasIndex(snapshot.activeInflowMask || 0n, node.index) && isAboveSelection(node)
    )).length;
    // TAP has no selected chain. Compare pending bodies to the actual frozen
    // region, with a small radius-derived margin to avoid pixel jitter.
    const frozenRelativeThresholdY = Number.isFinite(coronationFrozenY.meanY)
      ? coronationFrozenY.meanY - TSUM_RADIUS * 0.25
      : null;
    const frozenTopThresholdY = Number.isFinite(coronationFrozenY.minY)
      ? coronationFrozenY.minY + TSUM_RADIUS * 0.25
      : null;
    const isAboveFrozenMean = (node) => Number.isFinite(frozenRelativeThresholdY) && node.y < frozenRelativeThresholdY;
    const isAboveFrozenRegion = (node) => Number.isFinite(frozenTopThresholdY) && node.y < frozenTopThresholdY;
    const pendingNodes = snapshot.nodes.filter((node) => maskHasIndex(snapshot.pendingGeometryMask || 0n, node.index));
    const settlingNodes = snapshot.nodes.filter((node) => maskHasIndex(snapshot.settlingOpportunityMask || 0n, node.index));
    const inflowNodes = snapshot.nodes.filter((node) => maskHasIndex(snapshot.activeInflowMask || 0n, node.index));
    const elapsedMs = Math.max(0, clock() - startedAt);
    return freezePlanResult({
      mode,
      action,
      chainIds: firstCandidate?.chainIds || [],
      routeChainIds: (route?.route || []).map((candidate) => candidate.chainIds),
      tapNodeId: action === "tap" ? terminal?.tapNodeId ?? null : null,
      waitReason,
      maxAdditionalTraces: maxDepth,
      terminal,
      diagnostics: {
        plannerMode: mode,
        searchTimeMs: elapsedMs,
        softBudgetExceeded: elapsedMs >= config.softBudgetMs,
        exploredStateCount,
        memoHitCount,
        branchPruneCount,
        rootCandidateCount: rootRawCandidateCount,
        rootDedupedCandidateCount,
        safeTraceCandidateCount: rootSafeTraceCandidateCount,
        unsafeTraceCandidateCount: rootUnsafeTraceCandidateCount,
        rootLegalTraceCandidateCount: rootRawCandidateCount,
        rootSafeTraceCandidateCount,
        rootFlowBlockedTraceCandidateCount: rootWaitableUnsafeTraceCandidateCount,
        unsafeTransitionRejectedCount,
        futureTemporarilyUnsafeCandidateCount,
        activeInflowNodeCount: snapshot.flowDiagnostics?.activeInflowNodeCount || 0,
        inflowUnsafeNodeCount: snapshot.flowDiagnostics?.inflowUnsafeNodeCount || 0,
        upperInflowNodeCount: snapshot.flowDiagnostics?.upperInflowNodeCount || 0,
        recentSpawnCount: snapshot.flowDiagnostics?.recentSpawnCount || 0,
        unsettledNodeCount: snapshot.flowDiagnostics?.unsettledNodeCount || 0,
        stableSupportNodeCount: snapshot.flowDiagnostics?.stableSupportNodeCount || 0,
        dynamicSupportNodeCount: snapshot.flowDiagnostics?.dynamicSupportNodeCount || 0,
        genuineFallSpaceNodeCount: snapshot.flowDiagnostics?.genuineFallSpaceNodeCount || 0,
        settlingOpportunityNodeCount: snapshot.flowDiagnostics?.settlingOpportunityNodeCount || 0,
        pendingGeometryNodeCount: snapshot.flowDiagnostics?.pendingGeometryNodeCount || 0,
        coronationFrozenNodeCount: popcountMask(snapshot.coronationFrozenMask || 0n),
        coronationFrozenMinY: coronationFrozenY.minY,
        coronationFrozenMaxY: coronationFrozenY.maxY,
        coronationFrozenMeanY: coronationFrozenY.meanY,
        coronationFrozenUpperHalfCount: coronationFrozenY.upperHalfNodeCount,
        coronationFrozenLowerHalfCount: coronationFrozenY.lowerHalfNodeCount,
        pendingGeometryUpperHalfCount: pendingNodes.filter((node) => node.y < FIELD_CENTER_Y).length,
        settlingOpportunityUpperHalfCount: settlingNodes.filter((node) => node.y < FIELD_CENTER_Y).length,
        activeInflowUpperHalfCount: inflowNodes.filter((node) => node.y < FIELD_CENTER_Y).length,
        pendingGeometryAboveFrozenMeanCount: pendingNodes.filter(isAboveFrozenMean).length,
        pendingGeometryAboveFrozenRegionCount: pendingNodes.filter(isAboveFrozenRegion).length,
        settlingOpportunityAboveFrozenCount: settlingNodes.filter(isAboveFrozenMean).length,
        activeInflowAboveFrozenCount: inflowNodes.filter(isAboveFrozenMean).length,
        stableSupportButUnsettledCount: snapshot.flowDiagnostics?.stableSupportButUnsettledCount || 0,
        playableNodeCount: snapshot.nodes.filter((node) => node.baseTraceEligible && !node.anyFrozen).length,
        settledNodeCount: snapshot.nodes.filter((node) => node.baseTraceEligible && !node.anyFrozen && node.settled).length,
        upperHalfSettledNodeCount: snapshot.nodes.filter((node) => node.baseTraceEligible && !node.anyFrozen && node.settled && node.y < FIELD_CENTER_Y).length,
        lowerHalfSettledNodeCount: snapshot.nodes.filter((node) => node.baseTraceEligible && !node.anyFrozen && node.settled && node.y >= FIELD_CENTER_Y).length,
        upperHalfPendingNodeCount: pendingNodes.filter((node) => node.y < FIELD_CENTER_Y).length,
        lowerHalfPendingNodeCount: pendingNodes.filter((node) => node.y >= FIELD_CENTER_Y).length,
        lowerPlayableNodeCount: snapshot.flowDiagnostics?.lowerPlayableNodeCount || 0,
        calculatedMaxAdditionalTraces: maxDepth,
        selectedRouteProjectedTotalTraces: maxDepth,
        selectedFirstChainLength: firstCandidate?.chainIndices.length || 0,
        selectedNextFrozenCount: metrics?.newFrozenCount || 0,
        selectedUnsafeNewlyFrozenCount: firstCandidate?.unsafeNewlyFrozenCount || 0,
        selectedCandidateMinY: selectedCandidateY.minY,
        selectedCandidateMaxY: selectedCandidateY.maxY,
        selectedCandidateMeanY: selectedCandidateY.meanY,
        selectedCandidateUpperHalfNodeCount: selectedCandidateY.upperHalfNodeCount,
        selectedCandidateLowerHalfNodeCount: selectedCandidateY.lowerHalfNodeCount,
        selectedCandidateVerticalSpan: Number.isFinite(selectedCandidateY.minY) && Number.isFinite(selectedCandidateY.maxY)
          ? selectedCandidateY.maxY - selectedCandidateY.minY
          : 0,
        activeInflowMinY: activeInflowY.minY,
        activeInflowMaxY: activeInflowY.maxY,
        activeInflowMeanY: activeInflowY.meanY,
        activeInflowUpperHalfNodeCount: activeInflowY.upperHalfNodeCount,
        activeInflowLowerHalfNodeCount: activeInflowY.lowerHalfNodeCount,
        settlingOpportunityAboveSelectionCount,
        activeInflowAboveSelectionCount,
        pendingGeometryAboveSelectionCount: settlingOpportunityAboveSelectionCount + activeInflowAboveSelectionCount,
        terminalEffectiveClear: terminal?.effectiveClearCount || 0,
        terminalPredictedRawCoins: terminal?.rawCoins || 0,
        waitReason,
        timeoutStage,
        ...extraDiagnostics
      }
    });
  };

  const beamWidthForDepth = (depth) => (
    config.beamWidths.find((entry) => depth >= entry.minDepth && depth <= entry.maxDepth)?.width || 8
  );
  const countFutureThreeChainNodes = (state) => {
    if (beamShouldStop()) return 0;
    const enumeration = enumerateCoronationElsaPlannerTraces(snapshot, adjacency, state, {
      lengths: [3],
      dedupeByNextFrozenMask: false,
      shouldAbort: beamShouldStop
    });
    const nodes = new Set();
    enumeration.candidates.forEach((candidate) => candidate.chainIndices.forEach((index) => nodes.add(index)));
    return nodes.size;
  };
  const layerConcentration = (state) => Math.max(0, ...getFrozenComponents(snapshot, state.frozenMask).map((component) => (
    component.reduce((sum, index) => sum + Math.max(0, state.freezeLayerCounts[index] || 0), 0)
  )));
  const runRollout = (initialState, policy) => {
    let state = initialState;
    let depth = 0;
    while (depth < config.maxTraceDepth) {
      if (beamShouldStop()) {
        timeoutStage = "beam-rollout-depth";
        break;
      }
      const enumeration = enumerateCoronationElsaPlannerTraces(snapshot, adjacency, state, {
        lengths: config.traceLengths,
        dedupeByNextFrozenMask: true,
        shouldAbort: beamShouldStop
      });
      if (!enumeration.candidates.length) break;
      const ranked = [];
      for (const candidate of enumeration.candidates) {
        if (beamShouldStop()) {
          timeoutStage = "beam-rollout-candidate";
          break;
        }
        const transition = simulateCoronationElsaFreeze(snapshot, state, candidate.chainIndices);
        const nextState = Object.freeze({
          frozenMask: transition.nextFrozenMask,
          freezeLayerCounts: transition.nextFreezeLayerCounts
        });
        const metrics = getCandidateMetrics(snapshot, state, candidate);
        let policyValue = -metrics.newFrozenCount;
        if (policy === "max-next-three-chain-nodes") policyValue = countFutureThreeChainNodes(nextState);
        if (policy === "max-existing-ice-concentration") policyValue = layerConcentration(nextState);
        ranked.push({ candidate, nextState, policyValue, metrics });
      }
      ranked.sort((first, second) => (
        second.policyValue - first.policyValue ||
        first.candidate.chainIndices.length - second.candidate.chainIndices.length ||
        first.candidate.pathKey.localeCompare(second.candidate.pathKey)
      ));
      if (!ranked.length) break;
      state = ranked[0].nextState;
      depth += 1;
    }
    return { depth, state, terminal: beamShouldStop() ? null : evaluateTerminal(state) };
  };
  const rolloutChildLimit = () => {
    const remaining = remainingMs();
    if (remaining >= config.rolloutFourMinRemainingMs) return config.rolloutTopChildren;
    if (remaining >= config.rolloutTwoMinRemainingMs) return Math.min(2, config.rolloutTopChildren);
    if (remaining >= config.rolloutOneMinRemainingMs) return 1;
    return 0;
  };
  const solveBeam = () => {
    candidateMemo.clear();
    let frontier = [{
      state: snapshot.initialState,
      route: [],
      chainLengthSum: 0,
      proximityScore: 0,
      parallelScore: 0,
      edgeScore: 0,
      routeKey: "",
      depth: 0,
      lastMetrics: null
    }];
    const terminals = [];
    let beamExpandedStateCount = 0;
    let beamRolloutCount = 0;
    let beamTimedOut = false;
    for (let depth = 1; depth <= config.maxTraceDepth && frontier.length; depth += 1) {
      if (beamShouldStop()) {
        timeoutStage = "beam-depth";
        beamTimedOut = true;
        break;
      }
      const children = [];
      for (const entry of frontier) {
        if (beamShouldStop()) {
          timeoutStage = "beam-frontier";
          beamTimedOut = true;
          break;
        }
        beamExpandedStateCount += 1;
        const enumeration = enumerateCoronationElsaPlannerTraces(snapshot, adjacency, entry.state, {
          lengths: config.traceLengths,
          dedupeByNextFrozenMask: true,
          excludeUnsafeTransitions: entry.depth === 0,
          shouldAbort: beamShouldStop,
          onSafeCandidate: entry.depth === 0 ? rememberSafeRootCandidate : null
        });
        if (entry.depth === 0) {
          rootRawCandidateCount = enumeration.pathDedupedCandidateCount;
          rootDedupedCandidateCount = enumeration.frozenMaskDedupedCandidateCount;
          rootSafeTraceCandidateCount = enumeration.safeTraceCandidateCount;
          rootUnsafeTraceCandidateCount = enumeration.unsafeTraceCandidateCount;
          rootWaitableUnsafeTraceCandidateCount = enumeration.waitableUnsafeTraceCandidateCount;
          unsafeTransitionRejectedCount += enumeration.unsafeTraceCandidateCount;
        } else {
          futureTemporarilyUnsafeCandidateCount += enumeration.unsafeTraceCandidateCount;
        }
        if (!enumeration.candidates.length) {
          terminals.push(entry);
          continue;
        }
        const pendingChildren = [];
        for (const candidate of enumeration.candidates) {
          if (beamShouldStop()) {
            timeoutStage = "beam-candidate-expansion";
            beamTimedOut = true;
            break;
          }
          const transition = simulateCoronationElsaFreeze(snapshot, entry.state, candidate.chainIndices);
          const state = Object.freeze({
            frozenMask: transition.nextFrozenMask,
            freezeLayerCounts: transition.nextFreezeLayerCounts
          });
          const metrics = getCandidateMetrics(snapshot, entry.state, candidate);
          const childDepth = entry.depth + 1;
          pendingChildren.push({
            state,
            route: entry.route.concat(candidate),
            depth: childDepth,
            chainLengthSum: entry.chainLengthSum + candidate.chainIndices.length,
            proximityScore: entry.proximityScore - metrics.iceDistance,
            parallelScore: entry.parallelScore + metrics.parallelScore,
            edgeScore: entry.edgeScore - metrics.edgeDistance,
            routeKey: entry.routeKey ? `${entry.routeKey}\u001e${candidate.pathKey}` : candidate.pathKey,
            lastMetrics: metrics,
            cheapTuple: [
              childDepth + getTraceUpperBound(snapshot, adjacency, state.frozenMask),
              -metrics.newFrozenCount,
              -Math.abs(candidate.chainIndices.length - 3),
              -metrics.iceDistance,
              metrics.parallelScore,
              -metrics.edgeDistance
            ]
          });
        }
        pendingChildren.sort((first, second) => (
          compareNumberTuple(second.cheapTuple, first.cheapTuple) || first.routeKey.localeCompare(second.routeKey)
        ));
        const rolloutLimit = Math.min(rolloutChildLimit(), pendingChildren.length);
        for (let childIndex = 0; childIndex < pendingChildren.length; childIndex += 1) {
          if (beamShouldStop()) {
            timeoutStage = "beam-child-score";
            beamTimedOut = true;
            break;
          }
          const child = pendingChildren[childIndex];
          let bestRollout = { depth: 0, terminal: null };
          if (childIndex < rolloutLimit && !beamShouldStop()) {
            const rollouts = [];
            for (const policy of config.rolloutPolicies) {
              if (beamShouldStop()) {
                timeoutStage = "beam-rollout-start";
                beamTimedOut = true;
                break;
              }
              rollouts.push(runRollout(child.state, policy));
              beamRolloutCount += 1;
            }
            rollouts.sort((a, b) => (
              b.depth - a.depth || compareNumberTuple(terminalTuple(b.terminal), terminalTuple(a.terminal))
            ));
            bestRollout = rollouts[0] || bestRollout;
          }
          children.push({
            ...child,
            beamTuple: [
              child.depth + bestRollout.depth,
              ...child.cheapTuple,
              bestRollout.terminal?.rawCoins || 0,
              layerConcentration(child.state)
            ]
          });
        }
      }
      if (!children.length) break;
      children.sort((first, second) => (
        compareNumberTuple(second.beamTuple, first.beamTuple) || first.routeKey.localeCompare(second.routeKey)
      ));
      const deduped = new Map();
      for (const child of children) {
        const key = child.state.frozenMask.toString(16);
        const current = deduped.get(key);
        if (!current || compareNumberTuple(child.beamTuple, current.beamTuple) > 0 || (
          compareNumberTuple(child.beamTuple, current.beamTuple) === 0 && child.routeKey < current.routeKey
        )) deduped.set(key, child);
      }
      frontier = Array.from(deduped.values()).slice(0, beamWidthForDepth(depth));
    }
    terminals.push(...frontier);
    let best = bestSafeRootRoute;
    for (const entry of terminals) {
      if (beamShouldStop() && best) break;
      const route = {
        ...entry,
        terminal: beamShouldStop() ? null : evaluateTerminal(entry.state)
      };
      if (!best || route.depth > best.depth || (route.depth === best.depth && compareRoutes(route, best) > 0)) {
        best = route;
      }
    }
    return {
      route: best,
      expandedStateCount: beamExpandedStateCount,
      rolloutCount: beamRolloutCount,
      timedOut: outerTimedOut(),
      qualityStopped: beamTimedOut && !outerTimedOut()
    };
  };

  try {
    const maxDepth = solveDepth(snapshot.initialState.frozenMask);
    const route = solveBestRoute(snapshot.initialState, maxDepth);
    return buildResult("exact", maxDepth, route);
  } catch (error) {
    if (!(error instanceof Error) || error.message !== "CORONATION_ELSA_PLANNER_TIMEOUT") throw error;
    const exactElapsedBeforeFallbackMs = Math.max(0, clock() - startedAt);
    activeDeadline = outerDeadline;
    const beam = solveBeam();
    exploredStateCount += beam.expandedStateCount;
    return buildResult("beam", beam.route?.depth || 0, beam.route, {
      exactTimedOut: true,
      exactElapsedBeforeFallbackMs,
      beamRolloutCount: beam.rolloutCount,
      budgetTimedOut: beam.timedOut,
      qualityDeadlineStopped: beam.qualityStopped,
      bestSoFarUsed: (beam.timedOut || beam.qualityStopped) && !!beam.route
    });
  }
}

export function getCoronationElsaPlannerNodeIndex(snapshot, id) {
  return getIndexById(snapshot, id);
}
