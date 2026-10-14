// Natural-board balance sample. No added Tsums, forced geometry, coin items,
// score multipliers or charge cheats. Uses the production Game and physics.
import { createRequire } from 'node:module';
import { writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
const packageRoot = process.env.PLAYWRIGHT_PACKAGE_ROOT || join(process.env.USERPROFILE || '', '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules');
const { chromium } = createRequire(join(packageRoot, 'playwright/package.json'))('playwright');
const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  const page = await browser.newPage();
  await page.goto(process.env.PHOTON_BENCH_URL || 'http://127.0.0.1:8765');
  await page.waitForFunction(() => !!window.game);
  const rows = await page.evaluate(async ({ seeds, levels, gameModule }) => {
    window.battleController.loop = () => {};
    const geometry = await import('/photonGeometry.js');
    const { photonThread, photonLineTargets, photonCrossings, photonZones } = geometry;
    const { Game } = await import(`/${gameModule}`);
    const g = new Game(document.createElement('canvas'), {persistenceEnabled:false,inputEnabled:false,managedLoop:true,role:'cpu'});
    g.persistenceEnabled = false; g.role = 'cpu'; g.skillVisualsEnabled = false;
    g.setRenderQualityMode('minimal', {persist:false});
    const originalRandom = Math.random;
    const originalClear = g.clearPipeline.beginClear.bind(g.clearPipeline);
    const originalCharge = g.enqueueSkillChargeFlight.bind(g);
    let attacks = [], rawCharge = 0, seen = new Set();
    g.clearPipeline.beginClear = spec => {
      const coin = g.coinBonus, physical = spec.targets.length, effective = g.totalCleared;
      const duplicate = spec.targets.some(n => seen.has(n.id));
      spec.targets.forEach(n => seen.add(n.id));
      const result = originalClear(spec);
      if (spec.meta?.photonAttack && result) attacks.push({kind:spec.meta.photonAttack, physical, effective:g.totalCleared-effective, coins:g.coinBonus-coin, duplicate});
      return result;
    };
    g.enqueueSkillChargeFlight = (...args) => { rawCharge += args[3] ?? 1; return originalCharge(...args); };
    function frames(n) { for(let i=0;i<n;i++) g.update(1/60); }
    function candidates() {
      const nodes = g.tsums.filter(n => g.isTsumInPlayArea(n) && !n.removing);
      const found = new Map();
      for(const start of nodes) {
        const rule = g.getChainBehaviorForStart(start);
        function visit(path) {
          if(path.length>=3) {
            const key = [path[0].id,path.at(-1).id].sort().join('|');
            if(!found.has(key) || found.get(key).length<path.length) found.set(key,path.slice());
          }
          if(path.length>=7 || found.size>3500) return;
          for(const next of nodes) if(!path.includes(next) && g.canConnectWithChainRule(rule,path.at(-1),next)) visit([...path,next]);
        }
        visit([start]);
      }
      return [...found.values()];
    }
    function choose(paths, strategy, session) {
      const data = session.data, radius=n=>g.getBodyRadius(n);
      const ranked = paths.map(chain => {
        const line=photonThread(chain,data.width), hits=photonLineTargets(g.tsums,[line],new Set(chain.map(n=>n.id)),radius).length;
        const crossings=photonCrossings(line,data.beams,20,data.blastRadius*.4);
        const zones=photonZones([...data.beams,line]);
        const area=zones.reduce((sum,z)=>sum+z.area,0)/182160;
        const separation=data.beams.reduce((sum,b)=>sum+Math.abs(line.direction.x*(b.end.y-b.start.y)-line.direction.y*(b.end.x-b.start.x))/Math.hypot(b.end.x-b.start.x,b.end.y-b.start.y),0);
        let merit;
        if(strategy==='ordinary') merit=chain.length*3+hits*.35;
        else if(strategy==='cross') merit=hits+Math.min(crossings.length,3)*9+separation*2;
        else merit=hits+Math.min(crossings.length,3)*10+area*180+separation*4;
        return {chain,merit};
      });
      ranked.sort((a,b)=>b.merit-a.merit);
      return ranked[0]?.chain;
    }
    const output=[];
    try {
      for(const level of levels) for(const strategy of ['ordinary','cross','advanced']) for(const seed of seeds) {
        let state=seed;
        const random=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296;};
        Math.random=random;g.random=random;g.selectTsum('laserWeave',level);g.startGame({skipCost:true,skipProgressSave:true});
        frames(90);g.timeRemaining=60;g.timeUp=false;
        g.skillSystem.charge=17;
        attacks=[];rawCharge=0;seen=new Set();
        if(!g.skillSystem.use()) throw new Error('skill did not activate');
        const startTime=g.elapsed, startCoins=g.coinBonus; let searches=0, zonesAtFinish=0, coverage=0;
        for(let tick=0;tick<1800 && g.skillRuntime.sessions.some(s=>s.handlerId==='laserWeave');tick++) {
          const session=g.skillRuntime.sessions.find(s=>s.handlerId==='laserWeave');
          if(session.data.phase==='aim') {
            frames(strategy==='ordinary'?30:45);
            let chain=choose(candidates(),strategy,session);
            if(!chain){frames(15);searches++;continue;}
            // Trace only currently legal production nodes. The sampled chain
            // is committed through the same start/finish path as manual input.
            if(!g.startChain(chain[0],chain[0])) throw new Error('chain start rejected');
            g.chain=chain;g.chainSet=new Set(chain.map(n=>n.id));chain.forEach(n=>n.inChain=true);
            g.finishChain();searches++;
          } else { zonesAtFinish=Math.max(zonesAtFinish,session.data.zones.length);coverage=Math.max(coverage,session.data.zones.reduce((sum,z)=>sum+z.area,0)/182160);frames(1); }
        }
        if(g.skillRuntime.sessions.some(s=>s.handlerId==='laserWeave')) throw new Error('skill did not finish');
        if(attacks.some(a=>a.duplicate)) throw new Error('a target was cleared twice');
        if(g.coinBonus-startCoins!==attacks.reduce((s,a)=>s+a.coins,0)) throw new Error('coins outside real attack groups');
        output.push({level,strategy,seed,coins:g.coinBonus-startCoins,physical:attacks.reduce((s,a)=>s+a.physical,0),effective:attacks.reduce((s,a)=>s+a.effective,0),seconds:+(g.elapsed-startTime).toFixed(3),rawCharge:+rawCharge.toFixed(2),endGauge:g.skillSystem.charge,coverage:+coverage.toFixed(3),zones:zonesAtFinish,searches,attacks});
      }
    } finally { Math.random=originalRandom; }
    return output;
  }, {seeds:Array.from({length:Number(process.env.PHOTON_BENCH_SEEDS||12)},(_,i)=>Number(process.env.PHOTON_BENCH_SEED_START||101)+i*7919),levels:(process.env.PHOTON_BENCH_LEVELS||'6').split(',').map(Number),gameModule:process.env.PHOTON_BENCH_GAME||'game.js'});
  const summary=[];
  for(const level of [...new Set(rows.map(r=>r.level))]) for(const strategy of ['ordinary','cross','advanced']) {
    const selected=rows.filter(r=>r.level===level&&r.strategy===strategy), average=key=>+(selected.reduce((s,r)=>s+r[key],0)/selected.length).toFixed(2);
    const stages=Object.fromEntries(['thread','cross','ignition','cascade'].map(kind=>[kind,{coins:+(selected.reduce((s,r)=>s+r.attacks.filter(a=>a.kind===kind).reduce((v,a)=>v+a.coins,0),0)/selected.length).toFixed(1),physical:+(selected.reduce((s,r)=>s+r.attacks.filter(a=>a.kind===kind).reduce((v,a)=>v+a.physical,0),0)/selected.length).toFixed(1)}]));
    summary.push({level,strategy,samples:selected.length,coins:average('coins'),min:Math.min(...selected.map(r=>r.coins)),max:Math.max(...selected.map(r=>r.coins)),over1500:selected.filter(r=>r.coins>=1500).length,physical:average('physical'),seconds:average('seconds'),rawCharge:average('rawCharge'),endGauge:average('endGauge'),zones:average('zones'),stages});
  }
  const output=resolve(process.argv[2]||'photon-sl6-bench.json');
  await writeFile(output,JSON.stringify({method:'Natural seeded production boards; no items/cheats; legal same-type chains length 3–7; fixed 60Hz physics.',summary,rows},null,2)+'\n');
  console.log(JSON.stringify(summary,null,2));
  console.log(`Saved ${output}`);
} finally { await browser.close(); }
