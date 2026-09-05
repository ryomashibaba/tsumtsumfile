import assert from "node:assert/strict";
import test from "node:test";

import { Game } from "./game.js";
import { PERFUME_ALICE_TARGET_TSUM_COUNT, TARGET_TSUM_COUNT } from "./config.js";

test("Perfume Alice raises the natural board target to 70 only while active", () => {
  const game = {
    isCheatActive: () => false,
    getCoingainData: () => null,
    selectedSkillLevel: 1,
    getActiveSkillSession: (skillId) => skillId === "perfumeAlice" ? { id: "perfumeAlice_1" } : null
  };

  assert.equal(Game.prototype.getTargetBodyCount.call(game), PERFUME_ALICE_TARGET_TSUM_COUNT);

  game.getActiveSkillSession = () => null;
  assert.equal(Game.prototype.getTargetBodyCount.call(game), TARGET_TSUM_COUNT);
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
