export const ADVANCED_SETTINGS_STORAGE_KEY = 'canvas_tsum_clone_advanced_settings_v1';

export const DEBUG_ENTRIES = Object.freeze([
  Object.freeze({
    id: 'chainTelemetry',
    label: 'Chain Input Telemetry',
    description: 'なぞり入力・描画・物理の動きを計測',
    category: 'input',
    priority: 100,
    current: true
  })
]);

export const ADVANCED_SETTINGS_RECTS = Object.freeze({
  entry: { x: 326, y: 650, w: 78, h: 52 },
  close: { x: 331, y: 109, w: 55, h: 50 },
  game: { x: 32, y: 173, w: 109, h: 52 },
  display: { x: 152, y: 173, w: 109, h: 52 },
  developer: { x: 272, y: 173, w: 109, h: 52 },
  renderQuality: { x: 53, y: 285, w: 308, h: 50 },
  telemetry: { x: 53, y: 349, w: 145, h: 50 },
  overlay: { x: 215, y: 349, w: 145, h: 50 },
  reset: { x: 53, y: 415, w: 308, h: 46 },
  other: { x: 53, y: 488, w: 308, h: 48 }
});

export function normalizeAdvancedSettings(value) {
  return {
    chainTelemetryEnabled: value?.chainTelemetryEnabled === true,
    chainTelemetryOverlay: value?.chainTelemetryOverlay !== false
  };
}

export function loadAdvancedSettings(storage) {
  try {
    return normalizeAdvancedSettings(JSON.parse(storage?.getItem(ADVANCED_SETTINGS_STORAGE_KEY) || 'null'));
  } catch {
    return normalizeAdvancedSettings(null);
  }
}

export function saveAdvancedSettings(storage, value) {
  try {
    storage?.setItem(ADVANCED_SETTINGS_STORAGE_KEY, JSON.stringify(normalizeAdvancedSettings(value)));
  } catch {
    // Storage may be unavailable in private browsing; keep the in-memory setting.
  }
}

export function isChainTelemetryEnabled(settings, queryForced = false) {
  return queryForced || settings?.chainTelemetryEnabled === true;
}

export function orderDebugEntries(entries = DEBUG_ENTRIES) {
  return [...entries].sort((a, b) => Number(b.current) - Number(a.current) || b.priority - a.priority || a.label.localeCompare(b.label));
}
