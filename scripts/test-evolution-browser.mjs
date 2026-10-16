import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
const { chromium } = await import(process.env.TDK_PLAYWRIGHT_PATH ? pathToFileURL(process.env.TDK_PLAYWRIGHT_PATH).href : 'playwright');
const browser = await chromium.launch({ headless: true,
  ...(process.env.TDK_BROWSER_PATH ? { executablePath: process.env.TDK_BROWSER_PATH } : {}) });
const context = await browser.newContext({ viewport: { width: 1100, height: 900 }, hasTouch: true });
const page = await context.newPage(), errors = [], checks = [];
await page.addInitScript(() => {
  let seed = 926;
  Math.random = () => ((seed = (1664525 * seed + 1013904223) >>> 0) / 4294967296);
});
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
const base = process.env.TDK_BASE_URL || 'http://127.0.0.1:8765';
const out = 'docs/qa/evolution-v1'; await mkdir(out, { recursive: true });
async function open() {
  await page.goto(`${base}/?tdk=1&tsum=evolutionTsum&sl=6&types=3`);
  await page.waitForFunction(() => window.game?.state === 'playing' && !game.centerMessages.length);
}
async function activate() {
  await page.getByRole('button', { name: 'スキル充填', exact: true }).click();
  await page.keyboard.press('Space');
  await page.waitForFunction(() => game.getActiveSkillSession('evolutionTsum'));
}
const point = id => page.evaluate(id => {
  const n = game.tsums.find(n => n.id === id), r = game.canvas.getBoundingClientRect();
  return { x: r.left + n.x * r.width / 414, y: r.top + n.y * r.height / 736 };
}, id);
async function trace(ids, touch = false) {
  const cdp = touch ? await context.newCDPSession(page) : null;
  for (let i = 0; i < ids.length; i++) {
    const p = await point(ids[i]);
    if (touch) await cdp.send('Input.dispatchTouchEvent', { type: i ? 'touchMove' : 'touchStart', touchPoints: [{ ...p, id: 1 }] });
    else { await page.mouse.move(p.x, p.y); if (!i) await page.mouse.down(); }
  }
  if (touch) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await cdp.detach(); }
  else await page.mouse.up();
}
try {
  await open(); await activate();
  // A board fixture tests real mouse/touch routes; progression itself remains real.
  async function fixture() {
    return page.evaluate(() => {
      const nodes = game.tsums.slice(0, 6);
      for (const [i, n] of nodes.entries()) { n.type = game.myTsum; n.x = 65 + i * 56; n.y = 520; n.vx = n.vy = 0; n.spawnedAboveField = false; }
      game.tsums = nodes; game.bombs = [];
      return nodes.map(n => n.id);
    });
  }
  await trace(await fixture());
  await page.waitForFunction(() => !game.pendingClear && !game.skillChargeFlights.length);
  assert.equal(await page.evaluate(() => game.totalCleared), 6);
  assert.equal(await page.evaluate(() => game.coinBonus), 5);
  checks.push('real mouse chain: six physical clears, five coins');
  await trace(await fixture(), true);
  await page.waitForFunction(() => !game.pendingClear);
  assert.equal(await page.evaluate(() => game.totalCleared), 12);
  checks.push('real touch chain');
  // Hold a chain over the actual timeout: no interruption and no lost clear.
  const ids = await fixture(), p = await point(ids[0]);
  await page.mouse.move(p.x, p.y); await page.mouse.down();
  await page.evaluate(() => { game.getActiveSkillSession('evolutionTsum').remainingMs = 30; });
  await page.waitForFunction(() => game.getActiveSkillSession('evolutionTsum')?.data.expired);
  assert.equal(await page.evaluate(() => game.dragging), true);
  for (const id of ids.slice(1, 3)) { const p = await point(id); await page.mouse.move(p.x, p.y); }
  await page.mouse.up();
  await page.waitForFunction(() => !game.getActiveSkillSession('evolutionTsum'));
  assert.ok(await page.evaluate(() => game.evolutionLastMetrics.events.includes('line')));
  checks.push('pointer held across expiry completes chain and queued line');
  await open(); await activate();
  // Natural board, real mouse input and real wall time. Select legal greedy
  // chains using existing helpers, without editing the board or progression.
  const shots = new Set();
  const deadline = Date.now() + 60000;
  while (Date.now() < deadline && await page.evaluate(() => !!game.getActiveSkillSession('evolutionTsum'))) {
    const state = await page.evaluate(() => {
      const s = game.getActiveSkillSession('evolutionTsum');
      if (!s) return null;
      return { phase: s.data.phase, locked: game.isGameplayInputLocked(),
        ids: game.pendingClear ? [] : game.findStrongestModeBestChain({ minLength: 3, maxLength: 16 }).map(n => n.id) };
    });
    if (!state) break;
    if (!shots.has(state.phase)) { shots.add(state.phase); await page.screenshot({ path: `${out}/phase${state.phase}.png` }); }
    if (!state.locked && state.ids.length >= 3) await trace(state.ids);
    else await page.waitForTimeout(45);
  }
  const metrics = await page.evaluate(() => game.evolutionLastMetrics);
  assert.ok(metrics, 'natural run must end');
  assert.equal(metrics.watchdogRecoveries, 0);
  assert.ok(metrics.phase2AtSec !== null && metrics.phase3AtSec !== null, 'natural real mouse play reaches both evolutions');
  checks.push('natural SL6 mouse run reaches PHASE 2/3 and restores normal state');
  const normal = await page.evaluate(() => ({ locked: game.isGameplayInputLocked(), scale: game.tsums.every(n => game.getBodyRadius(n) === n.baseRadius) }));
  assert.deepEqual(normal, { locked: false, scale: true });
  const downloadEvent = page.waitForEvent('download');
  await page.getByRole('button', { name: '進化ツム計測JSONを保存' }).click();
  await (await downloadEvent).saveAs(`${out}/browser-export.json`);
  checks.push('metrics JSON download');
  assert.deepEqual(errors, []);
  await writeFile(`${out}/browser.json`, JSON.stringify({ checks, metrics, errors, method: 'natural 3-type SL6, greedy automated real mouse input; no reaction delay; not human play or a fun verdict' }, null, 2));
  console.log(JSON.stringify({ checks, metrics, errors }, null, 2));
} finally { await browser.close(); }
