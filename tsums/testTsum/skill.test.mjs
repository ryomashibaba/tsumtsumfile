import definition from './definition.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { testTsumContract, makeTdkGame } from '../../tdk/testing.mjs';
testTsumContract(definition);

test('TDK zero recovery never becomes the legacy flight default of one', () => {
  const game = makeTdkGame(definition);
  game.enqueueSkillChargeFlight(100, 300, game.myTsum, 0);
  game.updateSkillChargeFlights(1000);
  assert.equal(game.skillSystem.charge, 0);
  assert.equal(game.skillChargeFlights.length, 0);
});
