import assert from "node:assert/strict";
import test from "node:test";

import {
  COIN_FLIGHT_CHASE_SEC,
  COIN_FLIGHT_DIAMETER_RATIO,
  advanceCoinFlight,
  buildCoinFlightAwardPlan,
  createCoinFlight,
  sampleCoinFlight
} from "./coinFlights.js";
import { ClearPipeline, Game } from "./game.js";

const coinTable = { 0: 0, 1: 0, 2: 0, 3: 1, 4: 3, 5: 6, 6: 10 };

test("coin awards map every positive marginal coin to its physical Tsum", () => {
  const targets = [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }];
  const plan = buildCoinFlightAwardPlan({ coinTable, targets });
  assert.equal(plan.totalCoins, 3);
  assert.deepEqual(plan.targetAwards, [
    { targetId: "c", count: 1 },
    { targetId: "d", count: 2 }
  ]);
  assert.equal(plan.syntheticCoins, 0);
});

test("large Tsum coins stay bundled and synthetic clears use the event origin", () => {
  const plan = buildCoinFlightAwardPlan({
    coinTable,
    targets: [{ id: "large", clearWeight: 5 }],
    additionalClearCount: 1,
    applyLargeTsumCorrection: true,
    completedLargeSteps: new Map([["large", 5]])
  });
  assert.equal(plan.totalCoins, 10);
  assert.deepEqual(plan.targetAwards, [{ targetId: "large", count: 6 }]);
  assert.equal(plan.syntheticCoins, 4);
});

test("zero coin clears create no awards", () => {
  const plan = buildCoinFlightAwardPlan({ coinTable, targets: [{ id: "a" }, { id: "b" }] });
  assert.deepEqual(plan, { totalCoins: 0, targetAwards: [], syntheticCoins: 0 });
});

test("coin flight lingers, follows the exponential chase, flips, and lands exactly", () => {
  const values = [0, 0.25, 0.75, 0.2, 0.8, 0.4, 0.6, 0];
  let index = 0;
  const flight = createCoinFlight({
    startX: 100,
    startY: 300,
    targetX: 166,
    targetY: 82,
    radius: 29 * COIN_FLIGHT_DIAMETER_RATIO,
    rng: () => values[index++ % values.length]
  });
  const start = sampleCoinFlight(flight);
  assert.equal(start.arrived, false);
  assert.notEqual(flight.startX, 100);
  advanceCoinFlight(flight, flight.holdDuration);
  const chaseStart = sampleCoinFlight(flight);
  assert.equal(chaseStart.x, flight.holdEndX);
  assert.equal(chaseStart.y, flight.holdEndY);
  advanceCoinFlight(flight, COIN_FLIGHT_CHASE_SEC * 0.5);
  const middle = sampleCoinFlight(flight);
  assert.ok(middle.x > Math.min(flight.holdEndX, flight.targetX));
  assert.ok(middle.scaleX >= 0.12 && middle.scaleX <= 1);
  advanceCoinFlight(flight, COIN_FLIGHT_CHASE_SEC * 0.5);
  const arrived = sampleCoinFlight(flight);
  assert.equal(arrived.arrived, true);
  assert.equal(arrived.x, 166);
  assert.equal(arrived.y, 82);
  assert.ok(flight.holdDuration + flight.chaseDuration >= 0.65);
  assert.ok(flight.holdDuration + flight.chaseDuration <= 0.75);
});

test("ClearPipeline emits each disappeared Tsum and synthetic bundle exactly once", () => {
  const emitted = [];
  const pipeline = new ClearPipeline({
    enqueueCoinFlights(x, y, count) { emitted.push({ x, y, count }); }
  }, {}, {});
  const first = { id: "first", x: 10, y: 20, dead: false };
  const second = { id: "second", x: 30, y: 40, dead: false };
  const info = {
    targets: [first, second],
    coinFlightPlan: {
      targetAwards: [
        { targetId: "first", count: 2 },
        { targetId: "second", count: 1 }
      ],
      syntheticCoins: 3
    },
    coinFlightEmittedTargetIds: new Set(),
    coinFlightSyntheticEmitted: false
  };
  pipeline.emitCoinFlightsForDisappearedTargets(info);
  assert.deepEqual(emitted, []);
  first.dead = true;
  pipeline.emitCoinFlightsForDisappearedTargets(info);
  pipeline.emitCoinFlightsForDisappearedTargets(info);
  pipeline.emitCoinFlightsForDisappearedTargets(info, { includeAll: true });
  pipeline.emitSyntheticCoinFlights(info, 50, 60);
  pipeline.emitSyntheticCoinFlights(info, 50, 60);
  assert.deepEqual(emitted, [
    { x: 10, y: 20, count: 2 },
    { x: 30, y: 40, count: 1 },
    { x: 50, y: 60, count: 3 }
  ]);
});

test("arrivals increment only the displayed run coins and direct awards update both values", () => {
  const flight = createCoinFlight({ startX: 0, startY: 0, targetX: 1, targetY: 1, radius: 10, rng: () => 0.5 });
  const game = {
    coinFlights: [flight],
    displayedCoinBonus: 0,
    coinBonus: 4
  };
  Game.prototype.updateCoinFlights.call(game, 1);
  assert.equal(game.displayedCoinBonus, 1);
  assert.equal(game.coinBonus, 4);
  assert.equal(game.coinFlights.length, 0);
  Game.prototype.addCoinBonus.call(game, 10);
  assert.equal(game.coinBonus, 14);
  assert.equal(game.displayedCoinBonus, 11);
});

test("finishRun waits while a flying coin is still collecting", () => {
  const game = { state: "playing", runFinished: false, coinFlights: [{}] };
  assert.equal(Game.prototype.finishRun.call(game), undefined);
  assert.equal(game.runFinished, false);
});
