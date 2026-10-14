import test from 'node:test';
import assert from 'node:assert/strict';
import { Game, ClearPipeline, InputRouter, SkillRuntimeManager } from './game.js';
import { TSUM_TYPES, SKILL_TABLES, COIN_CORRECTION_TABLE } from './config.js';
import { getRenderQualityProfile } from './renderQuality.js';
import { LaserWeaveAudio } from './laserWeaveAudio.js';
import {
  getLaserWeaveSession, getLaserWeaveWidth, resetLaserWeave,
  drawLaserWeave, getPhotonPreview, finishLaserWeaveAtTimeUp, PHOTON_SL6_TUNING
} from './laserWeave.js';
import { photonThread, photonLineTargets, photonCrossings, photonZones, photonZoneTargets, photonBestCombination } from './photonGeometry.js';

const type = TSUM_TYPES.find(type => type.id === 'laserWeave');
const other = TSUM_TYPES.find(type => type.id === 'perfumeAlice');
function node(id, x, y, tsumType = type, radius = 10) {
  return { id, x, y, vx: 2, vy: 1, radius, baseRadius: radius, type: tsumType,
    inChain: false, dead: false, removing: false,
    beginRemove() { this.removing = true; this.inChain = false; this.clearOccupying = false; } };
}
function harness(nodes = [], level = 3) {
  const game = Object.create(Game.prototype);
  Object.assign(game, {
    state: 'playing', role: 'player', paused: false, actionLock: false, timeUp: false,
    myTsum: type, selectedSkillLevel: level, skillVisualsEnabled: true,
    tsums: nodes, bombs: [], pendingClear: null, pendingChainClearQueue: [],
    chain: [], chainSet: new Set(), chainSelectedAt: new Map(), dragging: false,
    score: 0, coinBonus: 0, totalCleared: 0, aiRunMaxChain: 0,
    activeItems: { bomb: false }, random: () => 0.5,
    feverSystem: { clears: 0, addClears(n) { this.clears += n; } },
    comboSystem: { combo: 0, recordAction() { this.combo += 1; } },
    boardState: {
      getResolvedType: n => n.type, getEffectiveRadius: n => n.radius,
      hasBubble: () => false, isFrozen: () => false, isFreezeMovementLocked: () => false,
      onNodesCleared() {}, clearBySource() {}
    },
    getCheatCoinCorrection: (category, route, value) => value,
    isCheatActive: () => false, isTsumInPlayArea: () => true,
    addScore(n) { this.score += n; }, addCoinBonus(n) { this.coinBonus += n; },
    calculateMixedClearScore: (count) => count * 150,
    calculateChainScore: (base, count) => base * count,
    enqueueCoinFlights() {}, enqueueSkillChargeFlight(x, y, t, weight) { this.charge += weight; },
    charge: 0, spawnPopParticles() {}, addFloatingText() {}, queueNaturalLargeTsum() {},
    recordCoingainClear() {}, flushPostChainCleanup() {}, noteAction() {},
    spawnReplacementTsums() { this.refills += 1; }, refills: 0,
    refreshRenderBodies() {},
    gameFeel: { emit() {}, setChain() {} }
  });
  game.skillRuntime = new SkillRuntimeManager(game, game.boardState);
  game.clearPipeline = new ClearPipeline(game, game.boardState, game.skillRuntime);
  game.inputRouter = new InputRouter(game, game.boardState, game.skillRuntime, game.clearPipeline);
  return game;
}
function activate(game) {
  return Game.SkillRegistry.laserWeave.onActivate(game.skillRuntime.createContext(Game.SkillRegistry.laserWeave, game.selectedSkillLevel));
}
function commit(game, nodes) {
  game.chain = nodes;
  game.dragging = true;
  nodes.forEach(n => { n.inChain = true; });
  game.finishChain();
}
function enableUpdates(game) {
  Object.assign(game, {
    elapsed: 0, displayedScore: 0, timeRemaining: 20, fanCooldown: 0, fanPulse: 0,
    tempLockTimer: 0, physicsAccumulator: 0, strongestModeEnabled: false,
    skillButtonFeedback: { timer: 0 }, expBonus: 0, persistenceEnabled: false,
    onRunFinished: () => true,
    coinFlights: [], updateCoinFlights() {}, updateEffects() {}, updateSkillChargeFlights() {}, updateAiAutoPlay() {},
    skillSystem: { ready: false, update() {} }, isSkillReadyForActivation: () => false,
    physicsSteps: 0,
    stepPhysicsFrame() { this.physicsSteps++; for (const n of this.tsums) n.y += 0.1; }
  });
  game.gameFeel.enabled = true; game.gameFeel.update = () => {}; game.gameFeel.syncSkillReady = () => {};
  game.feverSystem.update = () => {}; game.comboSystem.update = () => {};
  game.comboSystem.maxCombo = 0; game.feverSystem.feverCount = 0;
  for (const n of game.tsums) n.update = () => {};
}
function advance(game, ms, frameMs = 1000 / 60) {
  let left = ms;
  while (left > 1e-7) { const step = Math.min(left, frameMs); game.update(step / 1000); left -= step; }
}
let nextNode = 0;
function trace(game, a, b) {
  const chain = [0, 0.5, 1].map(t => node(`trace-${nextNode++}`, a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t));
  for (const n of chain) n.update = () => {};
  game.tsums.push(...chain); commit(game, chain); return chain;
}
const triangle = [[{x:100,y:450},{x:314,y:450}], [{x:100,y:450},{x:207,y:250}], [{x:207,y:250},{x:314,y:450}]];
const beam = (a, b) => photonThread([a, { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, b], 24);

test('PHOTON LOOM retains save ID, exact six levels, 17 cost and 50% gauge', () => {
  assert.equal(type.name, 'PHOTON LOOM'); assert.equal(type.id, 'laserWeave');
  const table = SKILL_TABLES.laserWeave;
  for (const [key, values] of Object.entries({cost:[17,17,17,17,17,17],threadCount:[3,3,4,4,5,5],laserWidth:[14,16,18,20,22,54],crossRadius:[42,46,50,54,58,80],crossLimit:[1,1,2,2,3,3],zoneLimit:[1,1,1,2,2,2],chargeMultiplier:[.5,.5,.5,.5,.5,.5]})) assert.deepEqual(table[key], values);
  assert.deepEqual(table.coinCorrectionType, ['correction_-5','correction_-4','correction_-4','correction_-3','correction_-3','correction_-2']);
  for (let level = 1; level <= 6; level++) {
    const game = harness([], level), session = activate(game);
    assert.equal(session.remainingMs, Infinity); assert.equal(session.data.threadLimit, table.threadCount[level - 1]);
    assert.equal(getLaserWeaveWidth(session), table.laserWidth[level - 1]); assert.equal(session.data.cascade, level >= 4);
    assert.equal(game.isGameplayInputLocked(), false);
  }
});

test('one release fires one full-board thread, circle contacts and chain nodes clear once with half gauge', () => {
  const chain = [node('a', 100, 300), node('b', 150, 350), node('c', 200, 300)];
  const edge = node('edge', 414, 319, type, 10), miss = node('miss', 300, 320.01, other, 10);
  const game = harness([...chain, edge, miss], 4); enableUpdates(game); const session = activate(game);
  commit(game, chain);
  assert.equal(session.data.beams.length, 1); assert.equal(game.totalCleared, 4);
  assert.equal(game.comboSystem.combo, 1); assert.equal(game.charge, 2);
  assert.equal(game.coinBonus, COIN_CORRECTION_TABLE['correction_-3'][4]);
  assert.deepEqual(game.tsums, [miss]); assert.equal(game.pendingClear, null);
  commit(game, chain); assert.equal(session.data.beams.length, 1); assert.equal(game.totalCleared, 4);
  assert.deepEqual(game.getCurrentGameplayPauseState(), {clockPaused:true,physicsPaused:false});
  advance(game, 400); assert.equal(game.isGameplayInputLocked(), false); assert.equal(game.timeRemaining, 20);
  assert.ok(game.physicsSteps > 0); advance(game, 50); assert.ok(game.timeRemaining < 20);
});

test('short endpoints use farthest chain pair, coincident anchors remain finite, off-board nodes are excluded', () => {
  const line = photonThread([{x:100,y:300},{x:100,y:500},{x:102,y:300}], 14);
  assert.ok(Math.abs(line.start.x - line.end.x) < 5);
  const same = photonThread(Array(3).fill({x:100,y:300}),14);
  assert.equal(same.start.x,0); assert.equal(same.end.x,414);
  const target = node('contact', 200, 317, type, 10);
  assert.deepEqual(photonLineTargets([target, node('above', 100, 100)], [same]), [target]);
});

test('crossings enforce 20 degrees and merge nearby vertices; best combination maximizes distinct hits', () => {
  const line = beam({x:0,y:350},{x:414,y:350});
  const shallow = beam({x:0,y:340},{x:414,y:370});
  const vertical = beam({x:200,y:150},{x:200,y:550});
  const nearby = beam({x:205,y:150},{x:205,y:550});
  const crosses = photonCrossings(line,[shallow,vertical,nearby],20,20);
  assert.equal(crosses.length,1); assert.equal(crosses[0].x,202.5);
  const items = [{hits:[1,2,3,4]},{hits:[1,2,3]},{hits:[5,6,7]}];
  assert.deepEqual(photonBestCombination(items,2,i=>i.hits.map(id=>({id}))), [items[0],items[2]]);
});

test('zones require laser-only bounded faces, split consistently and reject small/degenerate regions', () => {
  const beams = triangle.map(([a,b])=>beam(a,b));
  const zones = photonZones(beams); assert.equal(zones.length,1); assert.ok(zones[0].area > 21000);
  assert.equal(photonZones(beams.slice(0,2)).length,0);
  assert.equal(photonZones([...beams,beam({x:0,y:350},{x:414,y:350})]).length,1,'small top face below 3% is dropped');
  const square = [beam({x:100,y:250},{x:100,y:500}),beam({x:314,y:250},{x:314,y:500}),beam({x:100,y:250},{x:314,y:250}),beam({x:100,y:500},{x:314,y:500})];
  assert.equal(photonZones(square).length,1);
  const split=photonZones([...square,beam({x:207,y:150},{x:207,y:550})]); assert.equal(split.length,2);
  assert.equal(photonZoneTargets([node('left',150,350),node('right',250,350)],split).length,2);
  assert.equal(photonZones([beams[0],beams[0],beams[0]]).length,0);
});

test('preview shares thread/cross/zone geometry with the actual release', () => {
  const game=harness([],5); enableUpdates(game); const session=activate(game);
  for (const [a,b] of triangle.slice(0,2)) { trace(game,a,b); advance(game,400); }
  const [a,b]=triangle[2], chain=[node('p1',a.x,a.y),node('p2',(a.x+b.x)/2,(a.y+b.y)/2),node('p3',b.x,b.y)];
  game.tsums.push(...chain); game.chain=chain; game.dragging=true;
  const preview=getPhotonPreview(game); assert.ok(preview); assert.equal(preview.zones.length,1);
  commit(game,chain); assert.deepEqual(session.data.beams.at(-1),preview.beam);
  assert.equal(session.data.zones[0].key,preview.zones[0].key);
});

test('SL5 regression: 200ms bursts, ignition and optimal two-thread cascade retain their original timing', () => {
  const game=harness([],5); enableUpdates(game); const session=activate(game);
  const events=[]; const begin=game.clearPipeline.beginClear.bind(game.clearPipeline);
  game.clearPipeline.beginClear=spec=>{ events.push({kind:spec.meta?.photonAttack,ids:spec.targets.map(n=>n.id)}); return begin(spec); };
  trace(game,...triangle[0]); advance(game,400);
  trace(game,...triangle[1]);
  const refill=node('cross-refill',100,450); refill.update=()=>{}; game.tsums.push(refill);
  advance(game,183); assert.ok(game.tsums.includes(refill)); advance(game,17);
  assert.ok(!game.tsums.includes(refill)); assert.equal(events.filter(e=>e.kind==='cross').length,1);
  advance(game,200); trace(game,...triangle[2]); advance(game,400);
  assert.equal(session.data.zones.length,1);
  trace(game,{x:150,y:200},{x:150,y:550}); advance(game,400);
  trace(game,{x:264,y:200},{x:264,y:550}); advance(game,400);
  assert.equal(session.data.beams.length,5); assert.equal(session.data.phase,'ignitionCharge');
  const center=node('zone-only',207,390); center.update=()=>{}; game.tsums.push(center);
  advance(game,267); assert.ok(!game.tsums.includes(center)); assert.equal(events.filter(e=>e.kind==='ignition').length,1);
  const follow=[node('cascade-a',150,320),node('cascade-b',264,330),node('cascade-overlap',150,450)];
  follow.forEach(n=>n.update=()=>{}); game.tsums.push(...follow);
  advance(game,450); assert.equal(events.filter(e=>e.kind==='cascade').length,1);
  const cascade=events.find(e=>e.kind==='cascade'); assert.equal(new Set(cascade.ids).size,cascade.ids.length);
  assert.ok(cascade.ids.includes('cascade-a')&&cascade.ids.includes('cascade-b'));
  assert.equal(game.isGameplayInputLocked(),true); advance(game,650);
  assert.equal(getLaserWeaveSession(game),null); assert.equal(game.isGameplayInputLocked(),false);
  assert.deepEqual(game.getCurrentGameplayPauseState(),{clockPaused:false,physicsPaused:false});
});

test('all SLs finish at the fixed thread count; no manual early finish or low-level cascade', () => {
  for(let level=1;level<=6;level++) {
    const game=harness([],level); enableUpdates(game); const session=activate(game);
    for(let i=0;i<session.data.threadLimit;i++) { trace(game,{x:100,y:230+i*50},{x:280,y:230+i*50}); advance(game,400); }
    assert.equal(session.data.phase,'ignitionCharge');
    advance(game,level===6?2200:1600); assert.equal(getLaserWeaveSession(game),null);
  }
});

test('empty cross explosions are visual-only: no extra combo, score or charge', () => {
  const game=harness([],6); enableUpdates(game); activate(game);
  trace(game,{x:100,y:350},{x:300,y:350}); advance(game,400);
  trace(game,{x:200,y:200},{x:200,y:500}); const before=[game.score,game.coinBonus,game.charge,game.comboSystem.combo];
  advance(game,500); assert.deepEqual([game.score,game.coinBonus,game.charge,game.comboSystem.combo],before);
  assert.ok(game.laserWeaveVisual.bursts.some(b=>b.kind==='cross'));
});

test('SL6 waits for refill and selects the strongest live intersection at detonation', () => {
  const game=harness([],6);enableUpdates(game);const session=activate(game);
  trace(game,{x:100,y:300},{x:300,y:300});advance(game,400);
  trace(game,{x:100,y:450},{x:300,y:450});advance(game,400);
  session.data.blastLimit=1;
  trace(game,{x:200,y:250},{x:200,y:500});
  assert.equal(session.data.crossings[0].y,300);
  const fresh=node('fresh-cross',250,450), incoming=node('incoming-cross',20,140);
  incoming.spawnedAboveField=true;fresh.update=incoming.update=()=>{};game.tsums.push(fresh,incoming);
  advance(game,500);assert.ok(game.tsums.includes(fresh));assert.equal(session.data.phase,'thread');
  assert.equal(game.getCurrentGameplayPauseState().clockPaused,true);
  incoming.y=160;const before=game.totalCleared;advance(game,150);
  assert.equal(session.data.crossings[0].y,450);assert.ok(!game.tsums.includes(fresh));
  assert.equal(game.totalCleared-before,1);assert.equal(game.charge,5);
  assert.equal(session.data.phase,'threadRecovery');
});

test('SL6 formed-zone energy expands real finish hits without synthetic clears or extra coin/score rules', () => {
  const bigTriangle=[[{x:40,y:500},{x:374,y:500}],[{x:40,y:500},{x:207,y:210}],[{x:207,y:210},{x:374,y:500}]];
  function ignite(level, woven) {
    const target=node('zone-halo',20,350),game=harness([target],level);enableUpdates(game);const session=activate(game);
    session.data.beams=bigTriangle.map(([a,b])=>photonThread([a,{x:(a.x+b.x)/2,y:(a.y+b.y)/2},b],session.data.width));
    session.data.zones=woven?photonZones(session.data.beams):[];
    if(woven) session.data.maxWovenCoverage=session.data.zones.reduce((sum,z)=>sum+z.area,0)/(414*440);
    session.data.phase='ignitionCharge';session.data.phaseRemainingMs=260;session.data.phaseAgeMs=0;
    let request;const begin=game.clearPipeline.beginClear.bind(game.clearPipeline);
    game.clearPipeline.beginClear=spec=>{request=spec;return begin(spec);};
    advance(game,450);return {game,target,request};
  }
  for(const [level,woven] of [[5,true],[6,false]]) assert.equal(ignite(level,woven).game.totalCleared,0);
  const {game,target,request}=ignite(6,true);
  assert.equal(game.totalCleared,1);assert.ok(!game.tsums.includes(target));assert.equal(game.charge,.5);
  assert.equal(game.score,150);assert.equal(request.correctionType,'correction_-2');
  assert.equal(request.targets.length,1);assert.equal(request.effectiveClearCountOverride,undefined);
  assert.equal(request.additionalClearCount,undefined);assert.equal(request.scoreMultiplier,undefined);
  assert.ok(request.beams===undefined);assert.ok(PHOTON_SL6_TUNING.zoneWidthCap>SKILL_TABLES.laserWeave.laserWidth[5]);
});

test('SL6 cascade waits for fully entered, settled refill before one optimal two-line clear', () => {
  const game=harness([],6);enableUpdates(game);const session=activate(game);
  session.data.beams=[beam({x:100,y:200},{x:100,y:550}),beam({x:300,y:200},{x:300,y:550})];
  session.data.phase='cascadeRefill';session.data.phaseRemainingMs=450;session.data.phaseAgeMs=0;
  const incoming=node('late-refill',100,130);incoming.spawnedAboveField=true;incoming.update=()=>{};game.tsums.push(incoming);
  advance(game,700);assert.equal(game.totalCleared,0);assert.equal(session.data.phase,'cascadeRefill');
  incoming.y=200;advance(game,100);assert.equal(game.totalCleared,0);advance(game,100);
  assert.equal(game.totalCleared,1);assert.equal(game.comboSystem.combo,1);assert.equal(game.charge,.5);
  assert.equal(session.data.cascadeBeams.length,2);assert.equal(session.data.phase,'cascadeTail');
});

test('existing bombs are retained, blocked during gestures/attacks, preserve correction and charge half', () => {
  const nodes=Array.from({length:8},(_,i)=>node(`bomb-${i}`,170+i*4,350));
  const game=harness(nodes,6); enableUpdates(game);
  const bomb={id:'old-bomb',bombType:'coin',correctionType:'correction_2',x:200,y:350,update(){}};
  game.bombs=[bomb]; const session=activate(game); assert.deepEqual(game.bombs,[bomb]);
  game.chain=nodes.slice(0,3);game.dragging=true;assert.equal(game.explodeBomb(bomb),false);assert.equal(bomb.dead,undefined);
  game.dragging=false; game.chain=[];
  game.boardState.canBombAffectNode=()=>true; game.logAiBombCancelDebug=()=>{};
  game.getSequentialClearDebugState=()=>null; game.createShockwave=()=>{};game.spawnExplosionSparks=()=>{};
  game.explodeBomb(bomb); assert.ok(bomb.dead); assert.equal(session.data.beams.length,0);
  assert.equal(game.pendingClear.source,'bomb'); assert.equal(game.pendingClear.correctionType,'correction_2');
  assert.equal(game.pendingClear.chargeMultiplier,.5); assert.equal(game.pendingClear.allowBomb,false);
  advance(game,167); assert.equal(game.pendingClear,null); assert.equal(game.totalCleared,8);assert.equal(game.charge,4);
  assert.equal(game.coinBonus,10+COIN_CORRECTION_TABLE.correction_2[8]); assert.ok(game.timeRemaining<20);
  assert.equal(game.resolveGeneratedBombType(40),null);
});

test('time-up auto-commits 3+ once, drops 2-, and allows fever extension only after complete finish', () => {
  for(const level of [5,6]) for(const length of [2,3]) {
    const game=harness([],level);enableUpdates(game);const session=activate(game);
    trace(game,{x:100,y:450},{x:300,y:450});advance(game,400);
    const chain=Array.from({length},(_,i)=>node(`expiry-${i}`,180,240+i*50));chain.forEach(n=>n.update=()=>{});
    game.tsums.push(...chain);game.chain=chain;game.dragging=true; game.timeRemaining=.005;
    let extended=false;game.feverSystem.addClears=n=>{if(!extended&&session.data.phase==='ignitionCharge'){game.timeRemaining+=5;extended=true;}};
    advance(game,17);assert.equal(game.dragging,false);assert.equal(session.data.beams.length,length===3?2:1);
    game.finishChain(); assert.equal(session.data.beams.length,length===3?2:1);
    const ignitionTarget=node('fever-hit',300,450);ignitionTarget.update=()=>{};game.tsums.push(ignitionTarget);
    game.finishRun();assert.equal(game.runFinished,undefined);
    advance(game,level===6?3000:2000);assert.equal(getLaserWeaveSession(game),null);assert.ok(game.timeRemaining>0);assert.equal(game.timeUp,false);assert.equal(game.runFinished,undefined);
  }
});

test('time-up waits for a pending bomb reward, then performs partial finish before results', () => {
  const chain=[node('a',100,450),node('b',200,450),node('c',300,450)], reward=node('reward',200,300);
  const game=harness([...chain,reward],1);enableUpdates(game);activate(game);commit(game,chain);advance(game,400);
  game.clearPipeline.beginClear({source:'bomb',targets:[reward],timer:.16,allowBomb:false});
  game.timeRemaining=.005;advance(game,17);assert.equal(game.runFinished,undefined);assert.equal(game.totalCleared,3);
  advance(game,1000);assert.equal(game.totalCleared,4);assert.equal(game.charge,2);assert.equal(getLaserWeaveSession(game),null);assert.equal(game.runFinished,true);
});

test('manual pause freezes everything, VFX toggles retain attack timing, 10fps matches 60fps', () => {
  function run(frameMs, visuals) {
    const game=harness([],6);enableUpdates(game);game.skillVisualsEnabled=visuals;game.saveProgress=()=>{};const session=activate(game);
    trace(game,{x:100,y:350},{x:300,y:350});advance(game,400,frameMs);
    trace(game,{x:200,y:200},{x:200,y:500});
    const refill=node('refilled',200,350);refill.update=()=>{};game.tsums.push(refill);
    game.paused=true;const before=[game.elapsed,refill.y,session.data.phaseRemainingMs,game.laserWeaveVisual.activationAgeMs];advance(game,100,frameMs);
    assert.deepEqual([game.elapsed,refill.y,session.data.phaseRemainingMs,game.laserWeaveVisual.activationAgeMs],before);
    game.toggleSkillVisuals();assert.equal(game.isGameplayInputLocked(),true);game.paused=false;
    advance(game,700,frameMs);
    return [game.totalCleared,game.coinBonus,game.charge,session.data.beams.length,session.data.phase,game.physicsSteps,game.timeRemaining];
  }
  assert.deepEqual(run(100,true),run(1000/60,true));assert.deepEqual(run(100,true),run(100,false));
});

test('final refill keeps the clock/input/result locked until incoming bodies enter the field', () => {
  const game=harness([],1);enableUpdates(game);const session=activate(game);
  trace(game,{x:100,y:350},{x:300,y:350});advance(game,400);
  const incoming=node('incoming',400,140);incoming.spawnedAboveField=true;incoming.update=()=>{};game.tsums.push(incoming);
  game.timeRemaining=0;game.timeUp=true;finishLaserWeaveAtTimeUp(game);advance(game,700);
  assert.equal(session.data.phase,'finalRefill');assert.equal(game.isGameplayInputLocked(),true);assert.equal(game.runFinished,undefined);
  incoming.y=160;advance(game,17);assert.equal(getLaserWeaveSession(game),null);assert.equal(game.runFinished,true);
});

test('drawing renders previews/threads/zones/finish at full and minimal quality, even with VFX disabled', () => {
  const game=harness([],5);enableUpdates(game);const session=activate(game);
  for(const [a,b] of triangle){trace(game,a,b);advance(game,400);}
  const labels=[];const ctx=new Proxy({}, {get:(target,key)=>target[key]??(key==='fillText'?text=>labels.push(text):key.startsWith('create')?()=>({addColorStop(){}}):()=>{}),set:(target,key,value)=>{target[key]=value;return true;}});
  for(const quality of ['normal','minimal'])for(const visuals of [true,false]) {
    game.skillVisualsEnabled=visuals; assert.doesNotThrow(()=>drawLaserWeave(ctx,game,getRenderQualityProfile(quality)));
  }
  assert.ok(labels.includes('PHOTON LOOM'));resetLaserWeave(game);assert.equal(getLaserWeaveSession(game),null);assert.equal(game.laserWeaveVisual,null);
});

test('missing audio and failed devices cannot interrupt gameplay; CPU stays silent', () => {
  const audio=new LaserWeaveAudio({role:'player',skillVisualsEnabled:true});
  assert.doesNotThrow(()=>{audio.unlock();for(const cue of ['thread','cross','zone','charge','ignition','cascade','release'])audio.play(cue);audio.stop();});
  const cpu=new LaserWeaveAudio({role:'cpu',skillVisualsEnabled:true});cpu.unlock();assert.equal(cpu.context,null);
});
