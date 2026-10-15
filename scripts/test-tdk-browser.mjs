// Run scripts/serve.mjs first. Supply TDK_PLAYWRIGHT_PATH for a bundled Playwright.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
const { chromium } = await import(process.env.TDK_PLAYWRIGHT_PATH
  ? pathToFileURL(process.env.TDK_PLAYWRIGHT_PATH).href : 'playwright');
const out = resolve(process.env.TDK_QA_OUTPUT || 'artifacts/tdk-v1-1');
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true,
  ...(process.env.TDK_BROWSER_PATH ? { executablePath: process.env.TDK_BROWSER_PATH } : {}) });
const base = process.env.TDK_BASE_URL || 'http://127.0.0.1:8765';
const context = await browser.newContext({ viewport: { width: 1100, height: 900 }, hasTouch: true });
await context.addInitScript(() => {
  window.tdkStorage = { reads: 0, writes: 0 };
  for (const [name, counter] of [['getItem', 'reads'], ['setItem', 'writes'], ['removeItem', 'writes'], ['clear', 'writes']]) {
    const original = Storage.prototype[name];
    Storage.prototype[name] = function (...args) { window.tdkStorage[counter]++; return original.apply(this, args); };
  }
});
const page = await context.newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.message));
page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
const results = [];
async function open(level, count, id = 'chainTestTsum') {
  await page.goto(`${base}/?tdk=1&tsum=${id}&sl=${level}&types=${count}`);
  await page.waitForFunction(() => window.game?.state === 'playing');
  await page.waitForFunction(() => game.centerMessages.length === 0);
  assert.equal(await page.evaluate(() => game.availableTypes.length), count);
}
async function fillAndActivate() {
  await page.getByRole('button', { name: 'スキル充填', exact: true }).click();
  await page.keyboard.press('Space');
  await page.waitForFunction(() => game.skillRuntime.sessions.length === 1);
}
async function fixture() {
  // Deterministic board only; real input, physics, runtime, clear and rendering stay enabled.
  await page.evaluate(() => {
    game.tsums = game.tsums.slice(0, 6);
    for (const [index, node] of game.tsums.entries()) {
      node.type = game.myTsum; node.x = 65 + index * 57; node.y = 520;
      node.vx = 0; node.vy = 0; node.isLarge = false;
    }
    window.tdkClearSources = [];
    const original = game.clearPipeline.tdkOriginalBeginClear ||= game.clearPipeline.beginClear.bind(game.clearPipeline);
    game.clearPipeline.beginClear = spec => { tdkClearSources.push(spec.source); return original(spec); };
  });
}
async function point(index) {
  return page.evaluate(index => {
    const node = game.tsums[index];
    const rect = game.canvas.getBoundingClientRect();
    return { x: rect.left + node.x * rect.width / 414, y: rect.top + node.y * rect.height / 736 };
  }, index);
}
async function trace(touch = false, cancel = false) {
  const cdp = touch ? await context.newCDPSession(page) : null;
  for (let index = 0; index < 6; index++) {
    const pos = await point(index);
    if (touch) await cdp.send('Input.dispatchTouchEvent', { type: index === 0 ? 'touchStart' : 'touchMove', touchPoints: [{ ...pos, id: 1 }] });
    else { await page.mouse.move(pos.x, pos.y); if (index === 0) await page.mouse.down(); }
  }
  if (touch) { await cdp.send('Input.dispatchTouchEvent', { type: cancel ? 'touchCancel' : 'touchEnd', touchPoints: [] }); await cdp.detach(); }
  else await page.mouse.up();
}
async function settled(source, level, normal = false) {
  await page.waitForFunction(() => game.totalCleared === 6 && !game.pendingClear && game.skillChargeFlights.length === 0);
  const state = await page.evaluate(() => ({ cleared: game.totalCleared, coins: game.coinBonus,
    gauge: game.skillSystem.charge, sources: tdkClearSources, storage: tdkStorage,
    pause: game.getCurrentGameplayPauseState(), dragging: game.dragging }));
  assert.deepEqual(state.sources, [source]);
  assert.equal(state.coins, 5);
  assert.equal(state.gauge, normal ? 6 : 3);
  assert.deepEqual(state.storage, { reads: 0, writes: 0 });
  assert.equal(state.dragging, false);
  assert.deepEqual(state.pause, { clockPaused: false, physicsPaused: false });
  return { level, ...state };
}
try {
  for (let level = 1; level <= 6; level++) {
    const count = [3, 3, 4, 4, 5, 5][level - 1];
    await open(level, count);
    await fillAndActivate();
    await fixture();
    if (level === 1) {
      const pos = await point(0);
      await page.mouse.click(pos.x, pos.y);
      assert.equal(await page.evaluate(() => game.pendingClear), null);
      await page.waitForTimeout(300); // Let the active visual fade in and status panel refresh.
      await page.screenshot({ path: join(out, 'chain-active.png') });
    }
    await trace(level % 2 === 0);
    results.push({ case: 'skill', types: count, input: level % 2 === 0 ? 'touch' : 'mouse', ...await settled('skill', level) });
    await page.screenshot({ path: join(out, `chain-sl${level}.png`) });
    await page.getByRole('button', { name: '再試験', exact: true }).click();
    assert.equal(await page.evaluate(() => game.totalCleared), 0);
    await fixture(); await trace();
    results.push({ case: 'normal-chain', types: count, ...await settled('chain', level, true) });
  }

  await open(3, 4); await fillAndActivate(); await fixture();
  await trace(true, true);
  assert.equal(await page.evaluate(() => game.dragging), false);
  assert.equal(await page.evaluate(() => game.pendingClear), null);
  // Actual session countdown; no accelerated timer or replaced runtime.
  await page.waitForFunction(() => game.skillRuntime.sessions.length === 0, null, { timeout: 12000 });
  assert.equal(await page.evaluate(() => game.tsums.some(node => node.inChain)), false);
  results.push({ case: 'touch-cancel-and-natural-timeout', pass: true });

  await page.getByRole('button', { name: '再試験', exact: true }).click();
  await fillAndActivate(); await fixture();
  const first = await point(0); await page.mouse.move(first.x, first.y); await page.mouse.down();
  await page.waitForFunction(() => game.skillRuntime.sessions.length === 0, null, { timeout: 12000 });
  await page.mouse.up();
  assert.equal(await page.evaluate(() => game.pendingClear), null);
  assert.equal(await page.evaluate(() => game.dragging), false);
  results.push({ case: 'natural-timeout-during-drag', pass: true });

  await page.getByRole('button', { name: '再試験', exact: true }).click();
  await fillAndActivate(); await fixture();
  await page.mouse.move((await point(0)).x, (await point(0)).y); await page.mouse.down();
  // Pointer capture keeps mouse gestures on the canvas; keyboard activation can restart mid-drag.
  await page.getByRole('button', { name: '再試験', exact: true }).focus();
  await page.keyboard.press('Enter'); await page.mouse.up();
  assert.equal(await page.evaluate(() => game.skillRuntime.sessions.length), 0);
  assert.equal(await page.evaluate(() => game.chain.length), 0);
  results.push({ case: 'restart-during-drag', pass: true });

  await fillAndActivate(); await fixture();
  const expiryStart = await point(0); await page.mouse.move(expiryStart.x, expiryStart.y); await page.mouse.down();
  await page.evaluate(() => { game.timeRemaining = 0.03; }); // Boundary setup; normal update performs expiry.
  await page.waitForFunction(() => game.state === 'result'); await page.mouse.up();
  assert.equal(await page.evaluate(() => game.skillRuntime.sessions.length), 0);
  assert.equal(await page.evaluate(() => game.chain.length), 0);
  assert.equal(await page.evaluate(() => game.pendingClear), null);
  assert.deepEqual(await page.evaluate(() => tdkStorage), { reads: 0, writes: 0 });
  results.push({ case: 'game-clock-expiry-during-drag', boundaryTimerSetup: true, pass: true });

  await open(1, 3, 'testTsum'); await fillAndActivate(); await fixture();
  const tap = await point(2); await page.mouse.click(tap.x, tap.y);
  await page.waitForFunction(() => game.totalCleared > 0 && !game.pendingClear);
  results.push({ case: 'legacy-tap-template', pass: true });

  await page.goto(base);
  await page.waitForFunction(() => window.game?.state === 'title');
  const normal = await page.evaluate(() => ({ development: game.tdkDevelopment, persistence: game.persistenceEnabled,
    leaked: game.getSelectableTsumTypes().filter(type => ['testTsum', 'chainTestTsum'].includes(type.id)).length }));
  assert.deepEqual(normal, { development: false, persistence: true, leaked: 0 });
  results.push({ case: 'return-to-normal', ...normal });
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ results, errors }, null, 2));
} finally {
  await writeFile(join(out, 'browser-results.json'), JSON.stringify({ results, errors }, null, 2) + '\n');
  await browser.close();
}
