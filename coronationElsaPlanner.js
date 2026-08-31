import {
  SKILL_TABLES,
  TSUM_RADIUS,
  clamp
} from "./config.js?v=tsum-images-5";
import { getTsumClearWeight } from "./bombLogic.js?v=tsum-images-5";

const CORONATION_ELSA_FREEZE_KIND = "coronationElsa";
const MIN_TRACE_LENGTH = 3;
const MAX_TRACE_LENGTH = 6;
const LINE_SEGMENT_FALLBACK_DISTANCE_SQ = (TSUM_RADIUS * 0.75) ** 2;

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

export function buildCoronationElsaPlannerSnapshot(game, level = game?.selectedSkillLevel || 1) {
  if (!game || !Array.isArray(game.tsums) || !game.boardState) {
    throw new TypeError("A live Game with tsums and boardState is required");
  }
  let anyFrozenMask = 0n;
  let coronationFrozenMask = 0n;
  let otherFrozenMask = 0n;
  let baseTraceEligibleMask = 0n;
  const fallbackCoronationFrozenIds = new Set(
    (game.boardState.getFrozenNodesByKind?.(CORONATION_ELSA_FREEZE_KIND) || [])
      .map((tsum) => String(tsum?.id))
  );
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
    return Object.freeze({
      index,
      id: tsum?.id,
      x: Number(tsum?.x) || 0,
      y: Number(tsum?.y) || 0,
      vx: Number(tsum?.vx) || 0,
      vy: Number(tsum?.vy) || 0,
      spawnedAtElapsed: Number.isFinite(tsum?.spawnedAtElapsed) ? tsum.spawnedAtElapsed : null,
      resolvedTypeId: resolvedType?.id || null,
      effectiveRadius: Number(effectiveRadius) || 0,
      baseRadius: Number(tsum?.baseRadius ?? tsum?.radius) || 0,
      isLarge: !!tsum?.isLarge,
      clearWeight: getTsumClearWeight(tsum),
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
    initialState
  });
}

export function buildCoronationElsaPlannerAdjacency(game, snapshot) {
  if (!game || typeof game.getChainBehaviorForStart !== "function" || typeof game.canConnectWithChainRule !== "function") {
    throw new TypeError("Game chain rule adapters are required to build planner adjacency");
  }
  const liveById = new Map((game.tsums || []).map((tsum) => [String(tsum?.id), tsum]));
  const contextByKey = new Map();
  const startContextIndexByNode = Array(snapshot.nodes.length).fill(-1);
  for (const startNode of snapshot.nodes) {
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
    const neighborsByNode = snapshot.nodes.map(() => []);
    for (const fromNode of snapshot.nodes) {
      if (!fromNode.baseTraceEligible) continue;
      const liveFrom = liveById.get(String(fromNode.id));
      if (!liveFrom) continue;
      for (const candidateNode of snapshot.nodes) {
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
  const blockedMask = snapshot.otherFrozenMask | normalizedState.frozenMask;
  const rawPaths = [];

  for (const targetLength of lengths) {
    for (const startNode of snapshot.nodes) {
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
          path.pop();
          used.delete(candidateIndex);
        }
      };
      visit(startNode.index);
    }
  }

  const pathCandidatesByKey = new Map();
  for (const path of rawPaths) {
    const canonicalPathKey = getCanonicalPathKey(snapshot, adjacency, path);
    if (pathCandidatesByKey.has(canonicalPathKey)) {
      continue;
    }
    const simulation = simulateCoronationElsaFreeze(snapshot, normalizedState, path);
    const chainIds = freezeArray(path.map((index) => snapshot.nodes[index].id));
    pathCandidatesByKey.set(canonicalPathKey, Object.freeze({
      chainIndices: freezeArray(path),
      chainIds,
      pathKey: getPathKey(snapshot, path),
      canonicalPathKey,
      targetMask: simulation.targetMask,
      nextFrozenMask: simulation.nextFrozenMask,
      nextFreezeLayerCounts: simulation.nextFreezeLayerCounts,
      simulation
    }));
  }
  const pathCandidates = Array.from(pathCandidatesByKey.values()).sort((first, second) => (
    first.chainIndices.length - second.chainIndices.length ||
    first.pathKey.localeCompare(second.pathKey)
  ));
  let candidates = pathCandidates;
  if (dedupeByNextFrozenMask) {
    const candidateByMask = new Map();
    for (const candidate of pathCandidates) {
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
    candidates: freezeArray(candidates),
    rawCandidateCount: rawPaths.length,
    pathDedupedCandidateCount: pathCandidates.length,
    frozenMaskDedupedCandidateCount: candidates.length,
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

export function getCoronationElsaPlannerNodeIndex(snapshot, id) {
  return getIndexById(snapshot, id);
}
