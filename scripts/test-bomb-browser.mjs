import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
const { chromium } = await import(process.env.TDK_PLAYWRIGHT_PATH
  ? pathToFileURL(process.env.TDK_PLAYWRIGHT_PATH).href : 'playwright');
const browser = await chromium.launch({ headless: true,
  ...(process.env.TDK_BROWSER_PATH ? { executablePath: process.env.TDK_BROWSER_PATH } : {}) });
try {
  const context = await browser.newContext({ viewport: { width: 1100, height: 900 }, hasTouch: true });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(`${process.env.TDK_BASE_URL || 'http://127.0.0.1:8765'}/?tdk=1&tsum=testTsum&sl=1&types=4`);
  await page.waitForFunction(() => window.game?.state === 'playing');
  await page.waitForFunction(() => game.centerMessages.length === 0);
  // Seed real Bomb instances through the production clear pipeline.
  await page.evaluate(() => {
    const targets = game.tsums.slice(0, 7);
    game.clearPipeline.beginClear({ source: 'chain', targets, forcedBombType: 'normal', x: 200, y: 420 });
    game.clearPipeline.finalize(game.pendingClear);
    window.bombClass = game.bombs[0].constructor;
    window.savedNodes = game.tsums.slice(0, 12);
    game.stepPhysicsFrame = () => {}; // deterministic hit positions; input and clears remain real
  });
  const cdp = await context.newCDPSession(page);
  await page.evaluate(() => {
    window.inputEvents = [];
    for (const kind of ['pointerdown','pointerup','pointercancel']) game.canvas.addEventListener(kind, e => {
      inputEvents.push({kind,id:e.pointerId,held:game.heldBombInput?.pointerId,dragging:game.dragging,locked:game.isGameplayInputLocked({ignoreActionLock:true}),paused:game.paused});
    });
  });
  let touches = [];
  async function touch(kind, id, x = 200, y = 420) {
    const released = touches.find(t => t.id === id);
    if (kind === 'touchStart') {
      const pos = await page.evaluate(({x,y}) => {
        const r = game.canvas.getBoundingClientRect();
        return { x: r.left + x * r.width / 414, y: r.top + y * r.height / 736 };
      }, {x,y});
      touches.push({id,...pos});
    } else touches = touches.filter(t => t.id !== id);
    await cdp.send('Input.dispatchTouchEvent', { type: kind, touchPoints: kind === 'touchEnd' ? [released] : touches });
  }
  async function fixture(source = null) {
    await page.evaluate(source => {
      game.pendingClear = null; game.pendingChainClearQueue = []; game.actionLock = false;
      game.dragging = false; game.chain = []; game.chainSet.clear();
      game.heldBombInput = null; game.manualDragPointerId = null; game.manualDragPoint = null;
      game.consumedPointerIds.clear(); game.timeUp = false; game.timeRemaining = 60;
      game.tsums = savedNodes.slice(0, 9);
      game.tsums.forEach((n,i) => {
        n.dead = n.removing = n.clearOccupying = n.inChain = false;
        n.x = i < 3 ? 40 : i < 6 ? 200 : 370;
        n.y = 420 + i % 3; n.vx = n.vy = 0;
      });
      game.bombs = [new bombClass(game,'normal',200,420),new bombClass(game,'normal',370,420)];
      if (source) game.clearPipeline.beginClear({source,targets:game.tsums.slice(0,3),x:40,y:420});
    }, source);
  }
  await fixture();
  await touch('touchStart',1,390,165); // contact without tracing
  await touch('touchStart',2);
  assert.equal(await page.evaluate(() => !!game.heldBombInput),true);
  await touch('touchEnd',2);
  await page.waitForFunction(() => game.bombs.length === 1, null, { timeout: 2000 }).catch(async e => {
    console.log(await page.evaluate(() => ({events:inputEvents,state:game.state,held:game.heldBombInput,accept:game.canAcceptBombInput(),owner:game.manualDragPointerId})));
    throw e;
  });
  assert.equal(await page.evaluate(() => game.bombs.length),1);
  await touch('touchEnd',1);
  console.log('PASS: stationary contact + second-finger bomb release');

  await fixture();
  await touch('touchStart',1,40,420); // real chain start
  assert.equal(await page.evaluate(() => game.dragging),true);
  await touch('touchStart',2);
  await touch('touchEnd',2);
  assert.equal(await page.evaluate(() => game.bombs.length),2);
  await touch('touchEnd',1);
  await touch('touchStart',2); await touch('touchEnd',2);
  assert.equal(await page.evaluate(() => game.bombs.length),1);
  console.log('PASS: trace blocks second finger, trace release restores bomb input');

  for (const source of ['chain','bomb','freeze','bubble']) {
    await fixture(source);
    await touch('touchStart',1); await touch('touchEnd',1);
    await touch('touchStart',2,370,420); await touch('touchEnd',2);
    assert.equal(await page.evaluate(() => game.bombs.length),0,source);
    await page.waitForFunction(() => !game.pendingClear);
    console.log(`PASS: two consecutive bombs during ${source} clear`);
  }
  await fixture();
  await touch('touchStart',1);
  await cdp.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]}); touches=[];
  assert.equal(await page.evaluate(() => game.bombs.length),2);
  assert.equal(await page.evaluate(() => game.heldBombInput),null);
  console.log('PASS: touch cancellation does not explode');
  assert.deepEqual(errors,[]);
} finally {
  await browser.close();
}
