export function resolveGameplayPauseState({
  pendingClear = null,
  coingainClockPaused = false,
  coingainPhysicsPaused = false
} = {}) {
  return {
    clockPaused: pendingClear?.pauseClock === true || coingainClockPaused === true,
    physicsPaused: pendingClear?.pausePhysics === true || coingainPhysicsPaused === true
  };
}

export function getGameplayClockDelta(dt, pauseState) {
  return pauseState?.clockPaused ? 0 : dt;
}
