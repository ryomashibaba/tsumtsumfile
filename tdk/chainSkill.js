// One successful chain per activation. Keep pointer tracing and awards in the engine.
export function createChainSkill(id, tables, visuals) {
  const live = (ctx, session) => !session._ending && session.remainingMs > 0 && ctx.runtime.sessions.includes(session);
  const eligible = (ctx, node) => !!node && ctx.game.tsums.includes(node)
    && !node.dead && !node.removing && !node.isBomb && !node.clearOccupying
    && !ctx.board.isFrozen(node) && ctx.game.isTsumInPlayArea(node);
  return {
    id,
    onActivate(ctx) {
      visuals.activate?.(ctx.game);
      return ctx.createSession({ remainingMs: tables.durationSec[ctx.level - 1] * 1000,
        data: { start: null, rule: null, committed: false } });
    },
    onTick(ctx, session) {
      if (ctx.game.timeUp || ctx.game.state !== 'playing') ctx.runtime.endSession(session, 'gameOver');
    },
    onChainStart(ctx, session, pos) {
      if (!live(ctx, session)) return false;
      if (ctx.game.dragging) return true; // Duplicate down cannot replace an owned gesture.
      // Consume starts but let Game own tracing, backtracking and pointer cancellation.
      session.data.start = null;
      session.data.rule = null;
      if (ctx.game.actionLock || ctx.game.timeUp || ctx.game.paused || session.data.committed
        || !pos || !Number.isFinite(pos.x) || !Number.isFinite(pos.y)) return true;
      const node = ctx.game.findChainStartTsumAt(pos.x, pos.y);
      if (eligible(ctx, node) && ctx.game.startChain(node, pos)) {
        session.data.start = node;
        session.data.rule = ctx.game.chainRule;
      }
      return true;
    },
    onChainCommit(ctx, session, chain) {
      if (!live(ctx, session)) return false;
      const { start, rule } = session.data;
      session.data.start = null;
      session.data.rule = null;
      const level = ctx.level - 1;
      // Every commit during this session is consumed, including rejected/busy commits.
      // Returning false here would also run the ordinary chain clear in Game.finishChain.
      if (session.data.committed || ctx.game.actionLock || ctx.game.paused || ctx.game.timeUp
        || !start || !Array.isArray(chain) || chain[0] !== start
        || chain.length < tables.minChainLength[level]
        || new Set(chain.map(node => node?.id)).size !== chain.length
        || chain.some(node => !eligible(ctx, node) || !node.inChain)) return true;
      if (chain.some((node, index) => index > 0
        && !ctx.game.canConnectWithChainRule(rule, chain[index - 1], node, 4))) return true;
      const last = chain[chain.length - 1];
      const radius = tables.eraseRadius[level];
      const targets = ctx.game.tsums.filter(node => eligible(ctx, node)
        && (chain.includes(node) || (radius > 0 && chain.some(origin => Math.hypot(node.x - origin.x, node.y - origin.y) <= radius))));
      session.data.committed = true; // Guard re-entrant and repeated delivery before clearing.
      const result = ctx.clear.beginClear({ source: 'skill', targets, x: last.x, y: last.y,
        allowBomb: false, correctionType: tables.coinCorrectionType[level],
        chargeMultiplier: tables.chargeMultiplier[level], timer: 0.16,
        pauseClock: true, pausePhysics: false });
      if (!result) { session.data.committed = false; return true; }
      visuals.clear?.(ctx.game, last);
      ctx.runtime.endSession(session, 'timeout');
      return true;
    },
    onEnd(ctx, session) {
      // Expiring/resetting an unfinished gesture must never release it as a normal clear.
      if (session.data.start && ctx.game.chain[0] === session.data.start) ctx.game.cancelActiveChain();
      session.data.start = null;
      session.data.rule = null;
      session.data.committed = true;
      visuals.end?.(ctx.game);
    },
    cleanupBySession(ctx, sessionId) { ctx.clearBySource(sessionId); }
  };
}
