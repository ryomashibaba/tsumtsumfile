// Optional small starter. Complex skills can supply their own handler instead.
export function createTapSkill(id, tables, visuals) {
  return {
    id,
    onActivate(ctx) {
      return ctx.createSession({ remainingMs: tables.durationSec[ctx.level - 1] * 1000, data: { remainingShots: 1 } });
    },
    onTap(ctx, session, pos) {
      if (ctx.game.actionLock || session.data.remainingShots <= 0) return false;
      const level = ctx.level - 1;
      const targets = ctx.game.tsums.filter(t => !t.dead && !t.removing && !t.isBomb && ctx.game.isTsumInPlayArea(t) && Math.hypot(t.x - pos.x, t.y - pos.y) <= tables.eraseRadius[level]);
      if (!targets.length) return true;
      const result = ctx.clear.beginClear({ source: 'skill', targets, x: pos.x, y: pos.y, allowBomb: false, correctionType: tables.coinCorrectionType[level], chargeMultiplier: tables.chargeMultiplier[level], timer: 0.16, pauseClock: true, pausePhysics: false });
      if (!result) return true;
      visuals.clear?.(ctx.game, pos);
      session.data.remainingShots = 0;
      ctx.runtime.endSession(session, 'timeout');
      return true;
    },
    onEnd(ctx) { visuals.end?.(ctx.game); },
    cleanupBySession(ctx, sessionId) { ctx.clearBySource(sessionId); }
  };
}
