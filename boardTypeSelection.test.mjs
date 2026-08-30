import test from "node:test";
import assert from "node:assert/strict";

import { FIXED_SUB_TSUM_IDS_BY_MY_TSUM, TSUM_TYPES } from "./config.js";
import {
  MIN_BOARD_COLOR_DISTANCE,
  areBoardTypesColorCompatible,
  findValidBoardTypeLineups,
  getBoardColorDistance,
  getSubTsumCandidates,
  hasTsumArtwork,
  selectBoardTypes
} from "./boardTypeSelection.js";

const SUB_ONLY_IDS = ["jafarGenie", "genie", "pumbaa", "grogu", "mandalorian", "grim"];

function byId(id) {
  return TSUM_TYPES.find((type) => type.id === id);
}

function requiredTypesFor(myTsum) {
  return myTsum.id === "judyNick"
    ? [byId("judyNickJudy"), byId("judyNickNickMate")]
    : [myTsum];
}

test("sub Tsum candidates require artwork and explicit eligibility", () => {
  const candidates = getSubTsumCandidates(TSUM_TYPES);
  const candidateIds = new Set(candidates.map((type) => type.id));

  assert.equal(candidateIds.has("coingain"), false);
  assert.equal(candidateIds.has("namineSora"), false);
  assert.equal(candidateIds.has("judyNick"), false);
  assert.equal(candidateIds.has("judyNickJudy"), false);
  assert.equal(candidateIds.has("judyNickNickMate"), false);
  for (const id of SUB_ONLY_IDS) {
    const type = byId(id);
    assert.ok(type, `missing sub-only type: ${id}`);
    assert.equal(type.selectable, false, id);
    assert.equal(type.subOnly, true, id);
    assert.equal(candidateIds.has(id), true, id);
    assert.equal(hasTsumArtwork(type), true, id);
  }
  assert.ok(candidates.every(hasTsumArtwork));
});

test("every selectable my Tsum has color-safe 3, 4, and 5-type lineups", () => {
  const candidates = getSubTsumCandidates(TSUM_TYPES);
  const selectable = TSUM_TYPES.filter((type) => type.selectable !== false && type.skillType !== "auxiliary");

  for (const myTsum of selectable) {
    for (const targetCount of [3, 4, 5]) {
      const lineups = findValidBoardTypeLineups({
        requiredTypes: requiredTypesFor(myTsum),
        candidates,
        targetCount
      });
      assert.ok(lineups.length > 0, `${myTsum.id} has no ${targetCount}-type lineup`);
      for (const lineup of lineups) {
        assert.equal(lineup.length, targetCount);
        assert.equal(new Set(lineup.map((type) => type.id)).size, targetCount);
        assert.equal(areBoardTypesColorCompatible(lineup, MIN_BOARD_COLOR_DISTANCE), true);
        const subs = lineup.filter((type) => !requiredTypesFor(myTsum).includes(type));
        assert.ok(subs.every(hasTsumArtwork), `${myTsum.id} has an image-less sub Tsum`);
      }
    }
  }
});

test("fixed sub-Tsum selections maximize board color separation for every board size", () => {
  const candidates = getSubTsumCandidates(TSUM_TYPES);
  const selectable = TSUM_TYPES.filter((type) => type.selectable !== false && type.skillType !== "auxiliary");

  for (const myTsum of selectable) {
    const required = requiredTypesFor(myTsum);
    for (const targetCount of [3, 4, 5]) {
      const subIds = FIXED_SUB_TSUM_IDS_BY_MY_TSUM[myTsum.id]?.[targetCount];
      assert.ok(subIds, `${myTsum.id} is missing a fixed ${targetCount}-type selection`);
      const lineup = [...required, ...subIds.map(byId)];
      assert.equal(lineup.length, targetCount);
      assert.equal(areBoardTypesColorCompatible(lineup), true);

      const minimumDistance = (types) => Math.min(...types.flatMap((type, index) => (
        types.slice(index + 1).map((other) => getBoardColorDistance(type, other))
      )));
      const bestMinimumDistance = Math.max(...findValidBoardTypeLineups({
        requiredTypes: required,
        candidates,
        targetCount
      }).map(minimumDistance));
      assert.equal(minimumDistance(lineup), bestMinimumDistance, `${myTsum.id} ${targetCount}-type selection is not farthest`);
    }
  }
});

test("pair Tsum keeps Judy and Nick as the first two board types", () => {
  const lineup = selectBoardTypes({
    requiredTypes: requiredTypesFor(byId("judyNick")),
    candidates: getSubTsumCandidates(TSUM_TYPES),
    targetCount: 5,
    random: () => 0.5
  });

  assert.deepEqual(lineup.slice(0, 2).map((type) => type.id), ["judyNickJudy", "judyNickNickMate"]);
  assert.equal(areBoardTypesColorCompatible(lineup), true);
});

test("injected randomness can select different valid lineups reproducibly", () => {
  const options = {
    requiredTypes: [byId("coronationElsa")],
    candidates: getSubTsumCandidates(TSUM_TYPES),
    targetCount: 5
  };
  const first = selectBoardTypes({ ...options, random: () => 0 });
  const firstAgain = selectBoardTypes({ ...options, random: () => 0 });
  const last = selectBoardTypes({ ...options, random: () => 0.999999 });

  assert.deepEqual(first.map((type) => type.id), firstAgain.map((type) => type.id));
  assert.notDeepEqual(first.map((type) => type.id), last.map((type) => type.id));
  assert.equal(areBoardTypesColorCompatible(first), true);
  assert.equal(areBoardTypesColorCompatible(last), true);
});

test("an impossible color-safe lineup fails explicitly", () => {
  assert.throws(() => selectBoardTypes({
    requiredTypes: [byId("coronationElsa")],
    candidates: [byId("guidingMoana")],
    targetCount: 2,
    random: () => 0
  }), /No color-safe 2-type board lineup/);
});
