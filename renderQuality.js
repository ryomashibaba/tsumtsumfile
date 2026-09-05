export const RENDER_QUALITY_MODES = Object.freeze(["normal", "light", "minimal"]);

export const RENDER_QUALITY_PROFILES = Object.freeze({
  normal: Object.freeze({
    id: "normal",
    label: "通常",
    maxDevicePixelRatio: Infinity,
    renderIntervalMs: 0,
    drawArtwork: true,
    drawTextures: true,
    drawDecorations: true,
    drawBodyShadows: true,
    drawTransientEffects: true,
    useRichSurfaces: true,
    useBodyDeformation: true,
    particleScale: 1,
    skillVisualDetail: "full"
  }),
  light: Object.freeze({
    id: "light",
    label: "軽量",
    maxDevicePixelRatio: 1.5,
    renderIntervalMs: 0,
    drawArtwork: true,
    drawTextures: false,
    drawDecorations: false,
    drawBodyShadows: false,
    drawTransientEffects: true,
    useRichSurfaces: true,
    useBodyDeformation: true,
    particleScale: 0.5,
    skillVisualDetail: "reduced"
  }),
  minimal: Object.freeze({
    id: "minimal",
    label: "最軽量",
    maxDevicePixelRatio: 1,
    renderIntervalMs: 1000 / 30,
    drawArtwork: false,
    drawTextures: false,
    drawDecorations: false,
    drawBodyShadows: false,
    drawTransientEffects: false,
    useRichSurfaces: false,
    useBodyDeformation: false,
    particleScale: 0,
    skillVisualDetail: "minimal"
  })
});

export function normalizeRenderQualityMode(value) {
  return RENDER_QUALITY_MODES.includes(value) ? value : "normal";
}

export function getRenderQualityProfile(value) {
  return RENDER_QUALITY_PROFILES[normalizeRenderQualityMode(value)];
}

export function getNextRenderQualityMode(value) {
  const normalized = normalizeRenderQualityMode(value);
  const index = RENDER_QUALITY_MODES.indexOf(normalized);
  return RENDER_QUALITY_MODES[(index + 1) % RENDER_QUALITY_MODES.length];
}

export function clampDevicePixelRatio(devicePixelRatio, mode) {
  const safeRatio = Math.max(1, Number(devicePixelRatio) || 1);
  return Math.min(safeRatio, getRenderQualityProfile(mode).maxDevicePixelRatio);
}

export function shouldRenderForQuality(accumulatorMs, mode) {
  const intervalMs = getRenderQualityProfile(mode).renderIntervalMs;
  return intervalMs <= 0 || accumulatorMs + 1e-6 >= intervalMs;
}
