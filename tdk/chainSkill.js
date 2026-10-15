// A single successful ordinary chain triggers one skill clear. Complex skills
// can replace this handler without changing the existing runtime.
export function createChainSkill(id, tables, visuals) {
  return {
    id,
    onActivate(ctx) {
      return ctx.createSession({ remainingMs: tables.durationSec[ctx.level - 1] * 1000,
        data: { remainingChains: 1 } });
    },
    onChainCommit(ctx, session, chain) {
      const level = ctx.level - 1;
      if (!Array.isArray(chain) || chain.length < (tables.minChainLength?.[level] ?? 3)) return false;
      if (session.data.remainingChains <= 0 || ctx.game.actionLock || ctx.game.pendingClear) return true;
      const game = ctx.game, seen = new Set();
      for (const node of chain) {
        if (!node || !node.id || seen.has(node.id) || node.dead || node.removing ||
            node.clearOccupying || node.isBomb || !game.tsums.includes(node) ||
            !game.isTsumInPlayArea(node)) return false;
        seen.add(node.id);
      }
      const end = chain.at(-1), targets = chain.slice();
      const radius = tables.splashRadius?.[level] ?? 0;
      if (radius > 0) {
        for (const node of game.tsums) {
          if (!node || !node.id || seen.has(node.id) || node.dead || node.removing ||
              node.clearOccupying || node.isBomb || !game.isTsumInPlayArea(node)) continue;
          if (Math.hypot(node.x - end.x, node.y - end.y) <= radius) {
            seen.add(node.id); targets.push(node);
          }
        }
      }
      const started = ctx.clear.beginClear({
        source: 'skill', targets, x: end.x, y: end.y, allowBomb: false,
        correctionType: tables.coinCorrectionType[level],
        chargeMultiplier: tables.chargeMultiplier[level],
        timer: 0.16, pauseClock: true, pausePhysics: false
      });
      // Do not send a legal committed chain to normal clear as a second attempt.
      if (!started) return true;
      session.data.remainingChains = 0;
      visuals.clear?.(game, end);
      ctx.runtime.endSession(session, 'timeout');
      return true;
    },
    onEnd(ctx) { visuals.end?.(ctx.game); },
    cleanupBySession(ctx, sessionId) { ctx.clearBySource(sessionId); }
  };
}
