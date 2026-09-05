import test from "node:test";
import assert from "node:assert/strict";
import {
  RENDER_QUALITY_MODES,
  clampDevicePixelRatio,
  getNextRenderQualityMode,
  getRenderQualityProfile,
  normalizeRenderQualityMode,
  shouldRenderForQuality
} from "./renderQuality.js";

test("render quality modes normalize and cycle in display order", () => {
  assert.deepEqual(RENDER_QUALITY_MODES, ["normal", "light", "minimal"]);
  assert.equal(normalizeRenderQualityMode(undefined), "normal");
  assert.equal(normalizeRenderQualityMode("invalid"), "normal");
  assert.equal(getNextRenderQualityMode("normal"), "light");
  assert.equal(getNextRenderQualityMode("light"), "minimal");
  assert.equal(getNextRenderQualityMode("minimal"), "normal");
});

test("quality profiles progressively reduce expensive drawing", () => {
  const normal = getRenderQualityProfile("normal");
  const light = getRenderQualityProfile("light");
  const minimal = getRenderQualityProfile("minimal");
  assert.equal(normal.drawArtwork, true);
  assert.equal(light.drawArtwork, true);
  assert.equal(minimal.drawArtwork, false);
  assert.ok(normal.particleScale > light.particleScale);
  assert.ok(light.particleScale > minimal.particleScale);
  assert.equal(minimal.renderIntervalMs, 1000 / 30);
});

test("quality profiles cap backing resolution without reducing logical updates", () => {
  assert.equal(clampDevicePixelRatio(3, "normal"), 3);
  assert.equal(clampDevicePixelRatio(3, "light"), 1.5);
  assert.equal(clampDevicePixelRatio(3, "minimal"), 1);
  assert.equal(shouldRenderForQuality(16, "minimal"), false);
  assert.equal(shouldRenderForQuality(34, "minimal"), true);
  assert.equal(shouldRenderForQuality(0, "normal"), true);
});
