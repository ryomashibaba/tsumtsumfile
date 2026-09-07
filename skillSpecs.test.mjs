import assert from "node:assert/strict";
import test from "node:test";

import { SKILL_TABLES } from "./config.js";
import { Game } from "./game.js";
import { JudyNickGaugeManager } from "./judyNick.js";

const namine = { id: "namine" };
const alpha = { id: "alpha" };
const beta = { id: "beta" };
const gamma = { id: "gamma" };

function createNamineHarness(random = () => 0) {
  const transformed = [];
  let session = null;
  const ctx = {
    level: 1,
    game: {
      myTsum: namine,
      random,
      tsums: [
        { id: "alpha-1", type: alpha },
        { id: "alpha-2", type: alpha },
        { id: "alpha-3", type: alpha },
        { id: "beta-1", type: beta },
        { id: "gamma-1", type: gamma }
      ],
      getBoardTypes: () => [namine, alpha, beta, gamma],
      isTsumInPlayArea: () => true,
      pushCenterMessage() {},
      namineSkillTimer: 0
    },
    board: { getResolvedType: (node) => node.type },
    createSession(spec) {
      session = { id: "namine-1", ...spec };
      return session;
    },
    transformNodes(ids, spec) { transformed.push({ ids, spec }); }
  };
  return { ctx, transformed, get session() { return session; } };
}

test("Namine randomly fixes one board sub-Tsum type for its full session", () => {
  const harness = createNamineHarness(() => 0.8);
  const session = Game.SkillRegistry.namine.onActivate(harness.ctx);

  assert.equal(session.data.sourceTypeId, "gamma");
  assert.deepEqual(harness.transformed[0].ids, ["gamma-1"]);

  Game.SkillRegistry.namine.onSpawn(harness.ctx, session, { id: "alpha-new", type: alpha });
  Game.SkillRegistry.namine.onSpawn(harness.ctx, session, { id: "gamma-new", type: gamma });
  assert.deepEqual(harness.transformed.map((entry) => entry.ids), [["gamma-1"], ["gamma-new"]]);
});

test("Namine, Perfume Alice, and Jamil use the required skill-time gauge rates at every level", () => {
  assert.deepEqual(SKILL_TABLES.namine.chargeMultiplier, Array(6).fill(1 / 3));
  assert.deepEqual(SKILL_TABLES.perfumeAlice.chargeMultiplier, Array(6).fill(0.4));
  assert.deepEqual(SKILL_TABLES.jamilViper.chargeMultiplier, Array(6).fill(0.4));
});

test("Perfume Alice and Jamil carry only the configured gauge rate into skill clears", () => {
  const aliceRequest = { source: "chain", targets: [] };
  const aliceResult = Game.SkillRegistry.perfumeAlice.onAugmentClear({
    level: 1,
    game: { myTsum: { id: "perfumeAlice" }, tsums: [] },
    board: { getResolvedType: () => ({ id: "other" }) }
  }, {}, aliceRequest);
  assert.equal(aliceResult.chargeMultiplier, 0.4);

  const jamil = { id: "jamil", dead: false, removing: false };
  const jamilRequest = { source: "chain", targets: [jamil], scoreMultiplier: 1, chargeMultiplier: 1 };
  const jamilResult = Game.SkillRegistry.jamilViper.onAugmentClear({
    game: { tsums: [jamil] },
    board: {
      getSpecialChainEntry: () => ({ kind: "jamilHighScore", sessionId: "jamil-1", scoreMultiplier: 2, chargeMultiplier: 0.4, correctionType: "correction_1", splashRadius: 0 })
    }
  }, { id: "jamil-1" }, jamilRequest);
  assert.equal(jamilResult.scoreMultiplier, 2);
  assert.equal(jamilResult.chargeMultiplier, 0.4);
});

test("Judy and Nick charge only the opposite gauge while a skill is active", () => {
  const manager = new JudyNickGaugeManager({ selectedSkillLevel: 1 });
  manager.startSkill("judy");
  manager.onClear("judyNickJudy", 3, 1, { activeMode: "judy" });
  manager.onClear("judyNickNickMate", 3, 1, { activeMode: "judy" });
  assert.equal(manager.dualGauge.getJudyGauge().charge, 0);
  assert.equal(manager.dualGauge.getNickGauge().charge, 1);

  manager.endSkill("judy");
  manager.startSkill("nick");
  manager.onClear("judyNickJudy", 3, 1, { activeMode: "nick" });
  manager.onClear("judyNickNickMate", 3, 1, { activeMode: "nick" });
  assert.equal(manager.dualGauge.getJudyGauge().charge, 1);
  assert.equal(manager.dualGauge.getNickGauge().charge, 0);
});
