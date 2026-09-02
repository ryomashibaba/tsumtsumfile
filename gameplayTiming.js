export const SKILL_TIMING_TABLE = Object.freeze({
  coronationElsa: Object.freeze({
    presentation: Object.freeze({ durationMs: 1750, pauseClock: true, pausePhysics: true })
  }),
  captainLightyear: Object.freeze({
    presentation: Object.freeze({ durationMs: 2080, pauseClock: true, pausePhysics: true }),
    finalClear: Object.freeze({ durationMs: 570, pauseClock: true, pausePhysics: true })
  }),
  namine: Object.freeze({
    presentation: Object.freeze({ durationMs: 3170, pauseClock: true, pausePhysics: true }),
    endPause: Object.freeze({ durationMs: 270, pauseClock: true, pausePhysics: true })
  }),
  gaston: Object.freeze({
    presentation: Object.freeze({ durationMs: 3560, pauseClock: true, pausePhysics: true }),
    initialClear: Object.freeze({ pauseClock: false, pausePhysics: true })
  }),
  guidingMoana: Object.freeze({
    presentation: Object.freeze({ durationMs: 2380, pauseClock: true, pausePhysics: true }),
    initialClear: Object.freeze({ durationMs: 790, pauseClock: true, pausePhysics: true }),
    specialBombClear: Object.freeze({ durationMs: 670, pauseClock: true, pausePhysics: true })
  }),
  perfumeAlice: Object.freeze({
    presentation: Object.freeze({ durationMs: 3090, pauseClock: true, pausePhysics: true }),
    endPause: Object.freeze({ durationMs: 770, pauseClock: true, pausePhysics: true })
  }),
  jamilViper: Object.freeze({
    presentation: Object.freeze({ durationMs: 2820, pauseClock: true, pausePhysics: true }),
    endPause: Object.freeze({ durationMs: 770, pauseClock: true, pausePhysics: true })
  }),
  snowQueenElsa: Object.freeze({
    presentation: Object.freeze({ durationMs: 3160, pauseClock: true, pausePhysics: true })
  }),
  liliaVanrouge: Object.freeze({
    presentation: Object.freeze({ durationMs: 3360, pauseClock: true, pausePhysics: true }),
    endPause: Object.freeze({ durationMs: 520, pauseClock: true, pausePhysics: true })
  }),
  judyNick: Object.freeze({
    presentation: Object.freeze({ durationMs: 2920, pauseClock: true, pausePhysics: true })
  })
});

export function resolveGameplayPauseState({
  pendingClear = null,
  coingainClockPaused = false,
  coingainPhysicsPaused = false,
  skillTimingState = null
} = {}) {
  return {
    clockPaused:
      pendingClear?.pauseClock === true ||
      coingainClockPaused === true ||
      skillTimingState?.pauseClock === true,
    physicsPaused:
      pendingClear?.pausePhysics === true ||
      coingainPhysicsPaused === true ||
      skillTimingState?.pausePhysics === true
  };
}

export function getGameplayClockDelta(dt, pauseState) {
  return pauseState?.clockPaused ? 0 : dt;
}
