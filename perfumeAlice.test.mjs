import assert from "node:assert/strict";
import test from "node:test";

import { Game } from "./game.js";
import { PERFUME_ALICE_TARGET_TSUM_BONUS, TARGET_TSUM_COUNT } from "./config.js";
import { DEFAULT_CHEAT_SETTINGS } from "./cheatSettings.js";

test("Perfume Alice raises the current board target by 25 only while active", () => {
  const game = {
    isCheatActive: () => false,
    getCoingainData: () => null,
    selectedSkillLevel: 1,
    getActiveSkillSession: (skillId) => skillId === "perfumeAlice" ? { id: "perfumeAlice_1" } : null
  };

  assert.equal(Game.prototype.getTargetBodyCount.call(game), TARGET_TSUM_COUNT + PERFUME_ALICE_TARGET_TSUM_BONUS);

  game.getActiveSkillSession = () => null;
  assert.equal(Game.prototype.getTargetBodyCount.call(game), TARGET_TSUM_COUNT);
});

test("Perfume Alice adds 25 to the cheat board target and preserves an unlimited target", () => {
  const game = {
    isCheatActive: () => true,
    cheatSettings: { boardTarget: 60 },
    getActiveSkillSession: () => ({ id: "perfumeAlice_1" })
  };

  assert.equal(Game.prototype.getTargetBodyCount.call(game), 60 + PERFUME_ALICE_TARGET_TSUM_BONUS);

  game.cheatSettings.boardTarget = "unlimited";
  assert.equal(Game.prototype.getTargetBodyCount.call(game), Infinity);
});

test("Perfume Alice's cheat refill also uses the raised board target", () => {
  const game = {
    isCheatActive: () => true,
    isCoingainSpawnPaused: () => false,
    timeUp: false,
    cheatSettings: { ...DEFAULT_CHEAT_SETTINGS, enabled: true, boardTarget: 60, spawnRate: "instant" },
    cheatSpawnAccumulator: 0,
    getTargetBodyCount: () => 60 + PERFUME_ALICE_TARGET_TSUM_BONUS,
    getLiveBodyOccupancy: () => 60,
    spawnTsumBatch: (count, targetHint) => ({ count, targetHint })
  };

  assert.deepEqual(Game.prototype.updateCheatSpawnScheduler.call(game, 0), {
    count: PERFUME_ALICE_TARGET_TSUM_BONUS,
    targetHint: 60 + PERFUME_ALICE_TARGET_TSUM_BONUS
  });
});

test("Perfume Alice clears each adjacent Alice simultaneously with its triggering chain Tsum", () => {
  const neighborA = { id: "neighbor-a", typeId: "blue", x: 0, y: 100, dead: false, removing: false };
  const neighborB = { id: "neighbor-b", typeId: "blue", x: 100, y: 100, dead: false, removing: false };
  const aliceA = { id: "alice-a", typeId: "perfumeAlice", x: 20, y: 100, dead: false, removing: false };
  const aliceB = { id: "alice-b", typeId: "perfumeAlice", x: 80, y: 100, dead: false, removing: false };
  const aliceC = { id: "alice-c", typeId: "perfumeAlice", x: -20, y: 100, dead: false, removing: false };
  const request = {
    source: "chain",
    targets: [neighborA, neighborB],
    scoreMultiplier: 1
  };
  const ctx = {
    level: 1,
    board: {
      getResolvedType: (tsum) => ({ id: tsum.typeId })
    },
    game: {
      myTsum: { id: "perfumeAlice" },
      tsums: [neighborA, neighborB, aliceA, aliceB, aliceC],
      isTsumInPlayArea: () => true,
      getBodyRadius: () => 10,
      sequentialSplashClearDebug: false
    }
  };

  const result = Game.SkillRegistry.perfumeAlice.onAugmentClear(ctx, { id: "skill-1" }, request);

  assert.deepEqual(result.sequentialPrimaryTargets.map((tsum) => tsum.id), ["neighbor-a", "neighbor-b"]);
  assert.deepEqual(
    result.sequentialSplashGroups.map((group) => ({
      triggerId: group.triggerId,
      targetIds: group.targets.map((tsum) => tsum.id)
    })),
    [
      { triggerId: "neighbor-a", targetIds: ["alice-a", "alice-c"] },
      { triggerId: "neighbor-b", targetIds: ["alice-b"] }
    ]
  );
  assert.deepEqual(result.targets.map((tsum) => tsum.id), [
    "neighbor-a",
    "neighbor-b",
    "alice-a",
    "alice-b",
    "alice-c"
  ]);
  assert.equal(result.skillBonus, 120);
});

test("Perfume Alice does not alter non-chain clears", () => {
  const target = { id: "target" };
  const request = { source: "bomb", targets: [target] };

  assert.equal(Game.SkillRegistry.perfumeAlice.onAugmentClear({}, {}, request), request);
  assert.equal(request.sequentialPrimaryTargets, undefined);
  assert.equal(request.sequentialSplashGroups, undefined);
});
