import test from 'node:test';
import assert from 'node:assert/strict';
import { Game, ClearPipeline, SkillRuntimeManager } from './game.js';
import { TSUM_TYPES, SKILL_TABLES, COIN_CORRECTION_TABLE } from './config.js';
import { DopaFlight, DOPA_TUNING, completeDopaFlight, resetDopa } from './dopa.js';
import { calculateEffectiveClearCount } from './bombLogic.js';

const type = TSUM_TYPES.find(type => type.id === 'dopa');
const node = (id, x, y, radius = 5) => ({ id, x, y, radius, baseRadius: radius, type,
  beginRemove() { this.removing = true; }, dead: false, removing: false });
function harness(nodes) {
  const game = Object.create(Game.prototype);
  Object.assign(game, {
    tsums: nodes, state: 'playing', paused: false, actionLock: false,
    elapsed: 8, timeRemaining: 0.1, selectedSkillLevel: 6, myTsum: type,
    pendingClear: null, pendingChainClearQueue: [],
    boardState: { getEffectiveRadius: node => node.radius, getResolvedType: node => node.type,
      hasBubble: () => false, onNodesCleared() {} },
    getCheatCoinCorrection: (category, route, value) => value,
    refreshRenderBodies() {}, pushCenterMessage() {}, isSkillReadyForActivation: () => false
  });
  game.skillRuntime = new SkillRuntimeManager(game, game.boardState);
  game.clearPipeline = new ClearPipeline(game, game.boardState, game.skillRuntime);
  return game;
}
function run(flight, dt = 1 / 60) {
  for (let frame = 0; frame < 1000 && !flight.finished; frame++) flight.update(dt);
  assert.equal(flight.finished, true, 'all flights finish');
}

test('SL6 release snapshots directions, accelerates overlapping launches, spends exact reflected distances', () => {
  const chain = Array.from({ length: 12 }, (_, i) => node(`c${i}`, 30 + i * 28, 200 + (i % 2) * 35));
  const game = harness(chain);
  assert.ok(Game.prototype.getSelectableTsumTypes.call(game).some(candidate => candidate.id === type.id));
  assert.equal(SKILL_TABLES.dopa.cost[5], 20);
  assert.equal(SKILL_TABLES.dopa.coinCorrectionType[5], 'correction_-2');
  const session = Game.SkillRegistry.dopa.onActivate(game.skillRuntime.createContext(Game.SkillRegistry.dopa, 6));
  assert.equal(session.remainingMs, 10000);
  game.skillRuntime.sessions.push(session);
  game.skillRuntime.dispatchChainCommit(chain);
  const flight = game.dopaFlight;
  const snapshotDirection = { x: flight.flyers[1].ux, y: flight.flyers[1].uy };
  assert.equal(flight.flyers[0].launched, true);
  assert.equal(flight.flyers[1].launched, false);
  assert.ok(flight.flyers.at(-1).launchAt - flight.flyers.at(-2).launchAt < flight.flyers[1].launchAt);
  flight.update(flight.flyers[1].launchAt + 0.001);
  assert.equal(flight.flyers[1].launched, true);
  assert.equal(flight.flyers[1].ux, snapshotDirection.x);
  assert.equal(flight.flyers[1].uy, snapshotDirection.y);
  flight.update(flight.flyers.at(-1).launchAt - flight.elapsed + 0.001);
  assert.ok(flight.flyers.filter(flyer => flyer.launched && !flyer.done).length >= 2, 'later launches still overlap');
  run(flight);
  assert.equal(chain[0].x, 30);
  for (const flyer of flight.flyers) {
    assert.ok(Math.abs(flyer.traveled - 100 * flyer.order) < 1e-6);
    assert.equal(flyer.node.vx, 0);
    assert.equal(flyer.node.vy, 0);
    assert.ok(flyer.node.x >= 0 && flyer.node.x <= 414);
    assert.ok(flyer.node.y >= 140 && flyer.node.y <= 580);
  }
});

test('SL6 swept contacts count re-entry, sustained overlap once, moving flyers and immediate growth', () => {
  const chain = [node('a', 30, 200), node('b', 60, 200), node('c', 90, 200)];
  const target = node('target', 10, 200, 1);
  const game = harness([...chain, target]);
  const flight = new DopaFlight(game, chain, { speed: 100000, speedPerTsum: 0, maxSpeed: 100000 });
  run(flight, 0.1);
  assert.ok(flight.hits.get(target.id) >= 2, 'separate wall return contacts count again');
  assert.ok(flight.hits.get('b') >= 1, 'a flying Tsum is also a contact target');
  assert.equal(flight.effectiveCount, chain.length + [...flight.hits.values()].reduce((sum, hits) => sum + hits, 0));
  assert.ok(Math.abs(target.dopaScale - 1.1 ** flight.hits.get(target.id)) < 1e-8);
  const flyer = flight.flyers[0];
  target.x = flyer.node.x; target.y = flyer.node.y;
  const before = flight.additionalCount;
  flyer.contacts.clear();
  flight.resolveContacts([flyer], new Map());
  const afterEntry = flight.additionalCount;
  flight.resolveContacts([flyer], new Map());
  assert.ok(afterEntry > before);
  assert.equal(flight.additionalCount, afterEntry, 'continuous overlap does not repeat');

  const growing = node('grow', 100, 300, 10);
  const edge = node('edge', 120.5, 300, 10);
  const source = node('source', 100, 300, 10);
  const g = harness([source, growing, edge]);
  const growthFlight = new DopaFlight(g, [edge, growing, source]);
  growthFlight.resolveContacts(growthFlight.flyers, new Map());
  assert.ok(growthFlight.hits.get('edge') >= 1, 'growth expands into the next contact');
});

test('SL6 near-expiry flights freeze all ordinary updates, pause safely, clear once and unlock', () => {
  const chain = [node('a', 30, 210), node('b', 80, 210), node('c', 130, 210)];
  const game = harness(chain);
  const session = { id: 'dopa_1', handlerId: 'dopa', level: 6, remainingMs: 0.01, data: {} };
  game.skillRuntime.sessions.push(session);
  game.skillRuntime.dispatchChainCommit(chain);
  const flight = game.dopaFlight;
  assert.equal(game.isGameplayInputLocked({ ignoreActionLock: true }), true);
  assert.deepEqual(game.getCurrentGameplayPauseState(), { clockPaused: true, physicsPaused: true });
  game.paused = true;
  game.update(1);
  assert.equal(flight.elapsed, 0);
  game.paused = false;
  for (let i = 0; i < 200 && game.dopaFlight; i++) game.update(1 / 60);
  assert.equal(game.dopaFlight, null);
  assert.equal(game.elapsed, 8);
  assert.equal(game.timeRemaining, 0.1);
  assert.equal(session.remainingMs, 0.01);
  assert.equal(game.pendingClear.meta.dopa, true);
  const info = game.pendingClear;
  assert.equal(new Set(info.targets.map(node => node.id)).size, info.targets.length);
  assert.equal(calculateEffectiveClearCount(info), flight.effectiveCount);
  assert.equal(game.dopaVisual.count, flight.effectiveCount);
  info.onFinalize();
  game.pendingClear = null; game.actionLock = false;
  assert.equal(game.isGameplayInputLocked(), false);
  game.skillRuntime.update(1);
  assert.equal(game.skillRuntime.sessions.length, 0);
  resetDopa(game);
  assert.equal(game.dopaVisual, null);
  assert.ok(chain.every(node => node.dopaScale === undefined));
});

test('SL6 repeated clears have no 317 cap in score, coin awards or display plan', () => {
  const chain = [node('a', 30, 210), node('b', 80, 210), node('c', 130, 210)];
  const game = harness(chain);
  const flight = new DopaFlight(game, chain);
  flight.additionalCount = 1000;
  flight.finished = true;
  game.dopaFlight = flight;
  completeDopaFlight(game);
  const info = game.pendingClear;
  const table = COIN_CORRECTION_TABLE['correction_-2'];
  const expectedCoins = table[317] + (1003 - 317) * (table[317] - table[316]);
  assert.equal(calculateEffectiveClearCount(info), 1003);
  assert.equal(game.getCoinsByClearCount(1003, 'dopa', info.correctionType, info), expectedCoins);
  assert.equal(info.coinFlightPlan.totalCoins, expectedCoins);
  assert.equal(game.dopaVisual.count, 1003);
  assert.ok(game.getChainScore(1003) > game.getChainScore(317));
  assert.ok(DOPA_TUNING.speed > 1000);
});
