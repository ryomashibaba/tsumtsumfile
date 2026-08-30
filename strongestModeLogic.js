export const FEVER_ENTRY_CLEAR_COUNT = 29;
export const STRONGEST_MODE_FEVER_BOMB_CANCEL_MIN_REMAINING = 5;

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
