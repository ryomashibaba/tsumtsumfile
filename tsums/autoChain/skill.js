// Exact simple paths, with a hard work budget. An unproven result is never cleared.
// Components below the current best length cannot win. Traversal order breaks ties.
export function longestPath(nodes, connected, { minimum = 10, maxSteps = 120000, maxMs = 4 } = {}) {
  const startedAt = performance.now();
  const adjacency = nodes.map((a, i) => nodes.flatMap((b, j) => i !== j && connected(a, b) ? [j] : []));
  const seen = new Set();
  let best = [], steps = 0, complete = true;
  const walkComponent = root => {
    const component = [], todo = [root]; seen.add(root);
    while (todo.length) {
      const i = todo.pop(); component.push(i);
      for (const j of adjacency[i]) if (!seen.has(j)) { seen.add(j); todo.push(j); }
    }
    return component.sort((a, b) => a - b);
  };
  for (let root = 0; root < nodes.length; root++) {
    if (seen.has(root)) continue;
    const component = walkComponent(root);
    if (component.length < Math.max(minimum, best.length + 1)) continue;
    const used = new Set(), path = [];
    let solved = false;
    const visit = i => {
      if (++steps > maxSteps || (steps % 128 === 0 && performance.now() - startedAt > maxMs)) { complete = false; return; }
      used.add(i); path.push(i);
      if (path.length > best.length) best = path.slice();
      if (best.length === component.length) solved = true;
      // Reachability is a safe upper bound, including at articulation points.
      if (!solved) {
        const reachable = new Set([i]), todo = [i];
        while (todo.length) for (const j of adjacency[todo.pop()]) {
          if (!used.has(j) && !reachable.has(j)) { reachable.add(j); todo.push(j); }
        }
        // A remaining degree-one node can only be the final endpoint. If there
        // are several, a path starting at i must leave all but one behind.
        let leaves = 0;
        for (const j of reachable) if (j !== i && adjacency[j].filter(k => reachable.has(k)).length <= 1) leaves++;
        const upper = path.length + reachable.size - 1 - Math.max(0, leaves - 1);
        if (upper > best.length) {
          for (const j of adjacency[i]) {
            if (!used.has(j)) visit(j);
            if (solved || !complete) break;
          }
        }
      }
      path.pop(); used.delete(i);
    };
    for (const start of component) { visit(start); if (solved || !complete) break; }
    if (!complete) break;
  }
  return { chain: complete && best.length >= minimum ? best.map(i => nodes[i]) : [], complete, steps };
}

export const getAutoChainSession = game => game.skillRuntime?.sessions?.find(s => s.handlerId === 'autoChain');
const now = game => game.autoChainNow?.() ?? performance.now();
const eligible = (game, n) => n && !n.dead && !n.removing && !n.clearOccupying && !n.isBomb
  && !game.boardState.isFrozen(n) && game.isTsumInPlayArea(n);

function beginFinish(game, session) {
  const d = session.data;
  if (d.phase !== 'active') return;
  d.phase = 'finish'; d.finishAt = now(game); d.finishCount = d.count * 5;
  game.cancelActiveChain(); game.cancelAiChainAnimation?.();
  d.originalRadius = game.getConfiguredTsumRadius(); d.originalLimit = game.getTargetBodyCount();
  d.originals = new Map(game.tsums.map(n => [n, { radius: n.radius, baseRadius: n.baseRadius }]));
  // A temporary ellipse-packed container owns movement during the flourish.
  // Cheat settings are never written. Every added body is a real Tsum.
  const count = Math.max(d.finishCount, game.tsums.length, 1);
  const cols = Math.ceil(Math.sqrt(count * 0.85)), rows = Math.ceil(count / cols);
  const radius = Math.min(d.originalRadius, 118 / cols, 130 / rows);
  game.autoChainCapacity = { count: Math.max(d.finishCount, Number.isFinite(d.originalLimit) ? d.originalLimit : count), radius };
  for (let i = game.tsums.length; i < d.finishCount; i++) game.createSpawnTsum(game.randomTsumType(), i, count, { isLarge: false });
  d.slots = game.tsums.filter(n => !n.dead && !n.removing).map((node, i) => {
    node.radius = node.baseRadius = radius;
    return { node, x: node.x, y: node.y,
      targetX: 207 + ((i % cols) - (cols - 1) / 2) * radius * 2.05,
      targetY: 370 + (Math.floor(i / cols) - (rows - 1) / 2) * radius * 2.05 };
  });
}

export function updateAutoChainClock(game) {
  const session = getAutoChainSession(game);
  if (session?.data.phase === 'active' && (game.timeUp || now(game) >= session.data.deadline)) beginFinish(game, session);
}

function restore(game, session) {
  const d = session.data;
  if (d.originals) {
    for (const node of game.tsums) {
      const original = d.originals.get(node);
      node.radius = original?.radius ?? d.originalRadius * (node.isLarge ? 1.6 : 1);
      node.baseRadius = original?.baseRadius ?? node.radius;
      node.vx = node.vy = 0;
    }
  }
  if (game.autoChainCapacity && Number.isFinite(d.originalLimit) && game.tsums.length > d.originalLimit) {
    const excess = game.tsums.slice(d.originalLimit);
    game.boardState.onNodesCleared(excess);
    game.tsums = game.tsums.slice(0, d.originalLimit);
  }
  delete game.autoChainCapacity;
  game.cancelActiveChain(); game.cancelAiChainAnimation?.();
  game.refreshRenderBodies?.();
}

export default function createSkill(tables, visuals) {
  const clear = (ctx, chain, finish = false, automatic = false) => {
    const game = ctx.game;
    if (!chain.length || chain.some(n => !game.tsums.includes(n) || !eligible(game, n))) return false;
    if (game.chain.some(n => chain.includes(n))) { game.cancelActiveChain(); game.cancelAiChainAnimation?.(); }
    const last = chain[chain.length - 1];
    visuals.burst(game, chain, finish);
    return ctx.clear.beginClear({ source: 'chain', scoreMode: 'chain', clearMode: 'simultaneous',
      targets: chain, type: game.boardState.getResolvedType(chain[0]), x: last.x, y: last.y,
      allowBomb: false, chargeMultiplier: 0.1, correctionType: tables.coinCorrectionType[5],
      applyLargeTsumCorrection: false, meta: { autoChain: true, finish, automatic } });
  };
  return {
    id: 'autoChain',
    onActivate(ctx) {
      if (ctx.level !== 6) return null;
      const game = ctx.game;
      game.cancelActiveChain(); game.cancelAiChainAnimation?.();
      game.bombs = [];
      game.autoChainVisual = { particles: [], pulseAt: now(game) };
      return ctx.createSession({ remainingMs: Infinity, data: { phase: 'active', count: 0,
        deadline: now(game) + 10000, searchOverruns: 0 } });
    },
    onTick(ctx, session) {
      const game = ctx.game, d = session.data;
      if (game.state !== 'playing') { ctx.runtime.endSession(session, 'cancelled'); return; }
      updateAutoChainClock(game);
      if (d.phase === 'finish') {
        const age = now(game) - d.finishAt;
        const t = Math.min(1, Math.max(0, (age - 240) / 520));
        const ease = 1 - (1 - t) ** 3;
        for (const s of d.slots) {
          s.node.x = s.x + (s.targetX - s.x) * ease;
          s.node.y = s.y + (s.targetY - s.y) * ease;
          s.node.vx = s.node.vy = 0;
        }
        if (t < 1) return;
        d.containedAt ??= now(game);
        if (now(game) - d.containedAt < 200) return;
        const available = game.tsums.filter(n => eligible(game, n));
        if (available.length < d.finishCount || !d.slots.every(s => game.isTsumInPlayArea(s.node))) return;
        // Fisher-Yates: every normal body has equal probability, without replacement.
        for (let i = available.length - 1; i > 0; i--) {
          const j = ctx.rng.int(0, i); [available[i], available[j]] = [available[j], available[i]];
        }
        const targets = available.slice(0, d.finishCount);
        if (targets.length && !clear(ctx, targets, true)) return;
        game.autoChainLastResult = { autoCount: d.count, finishCount: targets.length,
          containedWaitMs: now(game) - d.containedAt, originalLimit: d.originalLimit,
          searchOverruns: d.searchOverruns };
        restore(game, session);
        ctx.runtime.endSession(session, 'complete');
        game.spawnReplacementTsums();
        return;
      }
      // Rebuild after each clear; above-ceiling spawn bodies never enter the graph.
      const nodes = game.tsums.filter(n => eligible(game, n));
      const rules = new Map(nodes.map(n => [n, game.getChainBehaviorForStart(n)]));
      const result = longestPath(nodes, (a, b) => game.boardState.getResolvedType(a).id === game.boardState.getResolvedType(b).id
        && game.canConnectWithChainRule(rules.get(a), a, b, 4));
      if (!result.complete) { d.searchOverruns++; return; }
      if (now(game) >= d.deadline) { beginFinish(game, session); return; }
      if (result.chain.length && clear(ctx, result.chain, false, true)) {
        d.count++; game.autoChainVisual.pulseAt = now(game);
      }
    },
    onChainCommit(ctx, session, chain) {
      this.onTick(ctx, session); // Automatic paths own matching nodes before manual awards.
      if (session.data.phase === 'active' && now(ctx.game) < session.data.deadline && chain.length >= 3) clear(ctx, chain);
      return true;
    },
    onEnd(ctx, session, reason) {
      restore(ctx.game, session);
      if (reason !== 'complete') delete ctx.game.autoChainVisual;
    },
    cleanupBySession(ctx, id) { ctx.clearBySource(id); }
  };
}
