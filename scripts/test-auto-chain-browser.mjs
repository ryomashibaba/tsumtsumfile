import { pathToFileURL } from 'node:url';
const { chromium } = await import(process.env.TDK_PLAYWRIGHT_PATH ? pathToFileURL(process.env.TDK_PLAYWRIGHT_PATH).href : 'playwright');
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
const out = 'docs/qa/auto-chain';
await mkdir(out, {recursive:true});
const browser = await chromium.launch({headless:true, ...(process.env.TDK_BROWSER_PATH ? {executablePath:process.env.TDK_BROWSER_PATH} : {})});
const context = await browser.newContext({viewport:{width:1100,height:900},hasTouch:true});
const page = await context.newPage(), errors=[], results=[];
page.on('pageerror',e=>errors.push(e.message));
page.on('console',m=>{if(m.type()==='error') errors.push(m.text());});
async function open(types=5) {
  await page.goto(`${process.env.TDK_BASE_URL || 'http://127.0.0.1:8766'}/?tdk=1&tsum=autoChain&sl=6&types=${types}`);
  await page.waitForFunction(()=>window.game?.state==='playing');
  await page.waitForTimeout(250);
}
async function activate() {
  await page.getByRole('button',{name:'スキル充填',exact:true}).click();
  await page.keyboard.press('Space');
  await page.waitForFunction(()=>game.skillRuntime.sessions.some(s=>s.handlerId==='autoChain'));
}
async function forceFinish(count) {
  await page.evaluate(count=>{
    game.skillSystem.addCharge(game.skillSystem.maxCharge);game.attemptSkillActivation(false);
    game.centerMessages=[];window.qaClock=performance.now();game.autoChainNow=()=>qaClock;
    const s=game.skillRuntime.sessions[0];s.data.count=count;s.data.deadline=qaClock;
  },count);
}
async function fixture(length) {
  await page.evaluate(length=>{
    game.tsums=game.tsums.slice(0,length);
    for(const [i,n] of game.tsums.entries()) {
      const col=i<5?i:8-i;
      n.type=game.myTsum;n.x=65+col*57;n.y=i<5?400:457;n.vx=n.vy=0;n.isLarge=false;
    }
    game.centerMessages=[];
  },length);
}
try {
  await open(); await fixture(9); await activate();
  const initial=await page.evaluate(()=>game.totalCleared);
  for(let i=0;i<9;i++) {
    const pos=await page.evaluate(i=>{
      const n=game.tsums[i],r=game.canvas.getBoundingClientRect();
      return {x:r.left+n.x*r.width/414,y:r.top+n.y*r.height/736};
    },i);
    await page.mouse.move(pos.x,pos.y);if(i===0)await page.mouse.down();
  }
  await page.mouse.up();
  await page.waitForFunction(()=>game.totalCleared>=9);
  const manual=await page.evaluate(()=>({cleared:game.totalCleared,count:game.skillRuntime.sessions[0]?.data.count,bombs:game.bombs.length,pending:!!game.pendingClear}));
  assert.equal(manual.cleared-initial,9);assert.equal(manual.count,0);assert.equal(manual.bombs,0);assert.equal(manual.pending,false);
  results.push({case:'manual-real-mouse-9',...manual});
  await page.screenshot({path:`${out}/manual.png`});

  await open();
  await page.evaluate(()=>{
    window.qaClock=performance.now();game.autoChainNow=()=>qaClock;
    game.tsums=game.tsums.slice(0,12);game.centerMessages=[];
    for(const[i,n]of game.tsums.entries()){n.type=game.myTsum;n.x=115+(i%4)*57;n.y=330+Math.floor(i/4)*57;n.vx=0;n.vy=4;n.isLarge=false;}
  });
  await activate();
  await page.waitForFunction(()=>game.totalCleared===12);
  assert.equal(await page.evaluate(()=>game.skillRuntime.sessions[0].data.count),1);
  await page.evaluate(()=>window.qaClock+=90);await page.waitForTimeout(40);
  await page.screenshot({path:`${out}/auto-sparkles.png`});
  results.push({case:'falling-auto-12',...await page.evaluate(()=>({cleared:game.totalCleared,count:game.skillRuntime.sessions[0].data.count}))});

  for(const limit of [45,53]) {
    await open();
    if(limit===53)await page.evaluate(()=>game.updateCheatSettings({enabled:true,boardTarget:53}));
    await forceFinish(11);
    await page.waitForFunction(()=>game.autoChainCapacity);
    await page.evaluate(()=>window.qaClock+=200);
    await page.waitForTimeout(40);
    await page.screenshot({path:`${out}/finish-${limit}-travel.png`});
    await page.evaluate(()=>window.qaClock+=560);
    await page.waitForTimeout(40);
    await page.screenshot({path:`${out}/finish-${limit}-55.png`});
    await page.evaluate(()=>window.qaClock+=220);
    await page.waitForFunction(()=>game.autoChainLastResult?.finishCount===55);
    const finish=await page.evaluate(()=>({result:game.autoChainLastResult,limit:game.getTargetBodyCount(),radius:game.getConfiguredTsumRadius(),cleared:game.totalCleared,capacity:!!game.autoChainCapacity}));
    assert.equal(finish.limit,limit);assert.equal(finish.capacity,false);assert.ok(finish.result.containedWaitMs>=200);
    results.push({case:`finish-55-from-${limit}`, ...finish});
    await page.screenshot({path:`${out}/finish-${limit}-burst.png`});
  }

  for(const count of [0,20,60]) {
    await open();await forceFinish(count);
    await page.waitForFunction(()=>!!game.autoChainCapacity);
    await page.evaluate(()=>window.qaClock+=760);await page.waitForTimeout(40);
    await page.evaluate(()=>window.qaClock+=220);
    await page.waitForFunction(()=>!!game.autoChainLastResult);
    const state=await page.evaluate(()=>({result:game.autoChainLastResult,limit:game.getTargetBodyCount(),radius:game.getConfiguredTsumRadius(),bodies:game.tsums.length}));
    assert.equal(state.result.finishCount,count*5);assert.equal(state.limit,45);assert.equal(state.radius,29);assert.ok(state.bodies<=45);
    results.push({case:`expanded-finish-${count*5}`, ...state});
  }
  await open();await forceFinish(20);
  await page.waitForFunction(()=>!!game.autoChainCapacity);
  await page.getByRole('button',{name:'再試験',exact:true}).click();
  const reset=await page.evaluate(()=>({bodies:game.tsums.length,limit:game.getTargetBodyCount(),radius:game.getConfiguredTsumRadius(),capacity:!!game.autoChainCapacity,sessions:game.skillRuntime.sessions.length}));
  assert.deepEqual(reset,{bodies:45,limit:45,radius:29,capacity:false,sessions:0});
  results.push({case:'reset-during-finish', ...reset});

  await open(3);
  await page.evaluate(()=>{
    window.manualSizes=[];window.autoSizes=[];window.aiSizes=[];window.clockAdvanced=0;
    const delta=game.getCurrentGameplayDelta.bind(game);
    game.getCurrentGameplayDelta=(...args)=>{const dt=delta(...args);if(game.skillRuntime.sessions[0]?.data.phase==='active')clockAdvanced+=dt;return dt;};
    const clear=game.clearPipeline.beginClear.bind(game.clearPipeline);
    game.clearPipeline.beginClear=spec=>{if(game.skillRuntime.sessions[0]?.data.phase==='active')(spec.meta?.automatic?autoSizes:manualSizes).push(spec.targets.length);return clear(spec);};
    const plan=game.findStrongestModeBestChain.bind(game);
    game.findStrongestModeBestChain=opts=>{const chain=plan(opts);if(game.skillRuntime.sessions[0]?.data.phase==='active')aiSizes.push(chain.length);return chain;};
  });
  await activate();
  // The visible strongest-mode button, with ordinary runtime/physics/rendering.
  const pos=await page.evaluate(()=>{const r=game.canvas.getBoundingClientRect();return{x:r.left+145*r.width/414,y:r.top+719*r.height/736};});
  await page.mouse.click(pos.x,pos.y);
  assert.equal(await page.evaluate(()=>game.strongestModeEnabled),true);
  const started=Date.now();
  await page.waitForFunction(()=>!!game.autoChainLastResult,{},{timeout:16000});
  const strongest=await page.evaluate(()=>({manualSizes,autoSizes,aiSizes,clockAdvanced,cleared:game.totalCleared,remaining:game.timeRemaining,result:game.autoChainLastResult}));
  assert.ok(strongest.aiSizes.length>0);assert.ok(strongest.aiSizes.every(n=>n<=9));
  // Inspect only active-session manual commits; post-skill AI may already resume.
  assert.ok(strongest.manualSizes.some(n=>n>=3&&n<=9));
  assert.ok(strongest.manualSizes.every(n=>n<=9));
  assert.ok(strongest.clockAdvanced>8);
  results.push({case:'strongest-natural-ten-seconds',wallMs:Date.now()-started,...strongest});
  await page.screenshot({path:`${out}/strongest.png`});

  await open(3);
  await page.evaluate(()=>{
    game.tsums=game.tsums.slice(0,12);window.strongestFixtureClears=[];
    for(const[i,n]of game.tsums.entries()){n.type=game.myTsum;n.x=115+(i%4)*57;n.y=330+Math.floor(i/4)*57;n.vx=0;n.vy=4;n.isLarge=false;}
    const clear=game.clearPipeline.beginClear.bind(game.clearPipeline);
    game.clearPipeline.beginClear=spec=>{strongestFixtureClears.push({count:spec.targets.length,automatic:!!spec.meta?.automatic,strongest:game.strongestModeEnabled});return clear(spec);};
    game.strongestModeEnabled=true;game.skillSystem.addCharge(game.skillSystem.maxCharge);game.attemptSkillActivation(false);
    game.skillRuntime.sessions[0].data.deadline=performance.now()+1500;
  });
  await page.waitForFunction(()=>!!game.autoChainLastResult,{},{timeout:5000});
  const combined=await page.evaluate(()=>({clears:strongestFixtureClears,result:game.autoChainLastResult}));
  assert.ok(combined.clears.some(c=>c.automatic&&c.strongest&&c.count===12));
  assert.ok(combined.result.autoCount>=1);assert.equal(combined.result.finishCount,combined.result.autoCount*5);
  results.push({case:'strongest-falling-auto-and-finish',...combined});

  await open();await activate();
  await page.evaluate(()=>{game.skillRuntime.sessions[0].data.count=11;game.timeRemaining=.01;});
  await page.waitForFunction(()=>game.autoChainCapacity);
  assert.equal(await page.evaluate(()=>game.state),'playing');
  await page.waitForFunction(()=>game.runFinished,{},{timeout:8000});
  results.push({case:'time-up',...await page.evaluate(()=>({state:game.state,cleared:game.totalCleared,result:game.autoChainLastResult}))});
  await page.screenshot({path:`${out}/time-up.png`});
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({results,errors},null,2));
  await writeFile(`${out}/browser-results.json`,JSON.stringify({results,errors},null,2));
} finally {await browser.close();}
