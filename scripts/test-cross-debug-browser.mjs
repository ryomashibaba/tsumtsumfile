import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { fileURLToPath, pathToFileURL } from 'node:url';

const { chromium } = await import(process.env.TDK_PLAYWRIGHT_PATH
  ? pathToFileURL(process.env.TDK_PLAYWRIGHT_PATH).href : 'playwright');
const reservation = createServer();
await new Promise((resolve, reject) => {
  reservation.once('error', reject);
  reservation.listen(0, '127.0.0.1', resolve);
});
const port = reservation.address().port;
await new Promise((resolve, reject) => reservation.close(error => error ? reject(error) : resolve()));
const server = spawn(process.execPath, [fileURLToPath(new URL('./serve.mjs', import.meta.url))], {
  env: { ...process.env, PORT: String(port) }, stdio: ['ignore', 'pipe', 'pipe']
});
const base = await new Promise((resolve, reject) => {
  server.once('error', reject);
  server.once('exit', code => reject(new Error(`Server exited: ${code}`)));
  server.stdout.on('data', chunk => {
    const match = String(chunk).match(/http:\/\/127\.0\.0\.1:(\d+)/);
    if (match) resolve(match[0]);
  });
});
let browser;
const checks = [], errors = [];
try {
  browser = await chromium.launch({ headless: true,
    ...(process.env.TDK_BROWSER_PATH ? { executablePath: process.env.TDK_BROWSER_PATH } : {}) });
  const page = await browser.newPage({ viewport: { width: 1100, height: 900 } });
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(base);
  await page.waitForFunction(() => window.game?.state === 'title');
  const ids = await page.evaluate(() => game.getSelectableTsumTypes().map(t => t.id));
  for (const id of ids) {
    const state = await page.evaluate(id => {
      game.selectTsum(id, 6);
      game.skillVisualsEnabled = false;
      game.startGame({ skipCost: true, skipProgressSave: true });
      game.skillSystem.addCharge(game.skillSystem.maxCharge);
      if (game.judyNickGaugeManager) {
        const dual = game.judyNickGaugeManager.dualGauge;
        dual.addCharge('judyNickJudy', dual.judy.maxCharge);
        dual.addCharge('judyNickNickMate', dual.nick.maxCharge);
      }
      const activated = game.attemptSkillActivation(false);
      for (let i = 0; i < 120; i++) game.update(1 / 60);
      game.render();
      const finite = game.tsums.every(n => Number.isFinite(n.x) && Number.isFinite(n.y))
        && Number.isFinite(game.score) && Number.isFinite(game.coinBonus);
      game.resetGame();
      return { activated, finite, sessions: game.skillRuntime.sessions.length, pending: !!game.pendingClear };
    }, id);
    assert.deepEqual(state, { activated: true, finite: true, sessions: 0, pending: false }, id);
    checks.push({ case: 'skill-activation-update-render-reset', id });
  }
  await page.evaluate(() => {
    game.selectTsum('perfumeAlice', 6);
    battleController.setMode('battle');
    battleController.startSelectedMode();
    game.togglePause();
  });
  assert.deepEqual(await page.evaluate(() => [game.paused, cpuGame.paused]), [true, true]);
  await page.evaluate(() => {
    game.togglePause();
    game.timeRemaining = cpuGame.timeRemaining = 0.001;
  });
  await page.waitForFunction(() => game.state === 'result' && !battleController.active);
  assert.equal(await page.evaluate(() => game.battleContext.complete && cpuGame.battleContext.complete), true);
  await page.evaluate(() => battleController.returnToTitle());
  assert.equal(await page.evaluate(() => game.state), 'title');
  checks.push({ case: 'battle-start-pause-resume-results-title' });

  const restricted = await browser.newContext();
  await restricted.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', {
      get() { throw new DOMException('Storage access denied', 'SecurityError'); }
    });
  });
  const restrictedPage = await restricted.newPage();
  restrictedPage.on('pageerror', error => errors.push(error.message));
  await restrictedPage.goto(base);
  await restrictedPage.waitForFunction(() => window.game?.state === 'title');
  assert.equal(await restrictedPage.evaluate(() => game.advancedSettingsStorage), null);
  assert.equal(await restrictedPage.locator('#bootError').count(), 0);
  checks.push({ case: 'boot-with-denied-storage' });
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ checks, errors }, null, 2));
} finally {
  await mkdir('artifacts', { recursive: true });
  await writeFile('artifacts/cross-debug-browser.json', JSON.stringify({ checks, errors }, null, 2) + '\n');
  await browser?.close();
  server.kill();
}
