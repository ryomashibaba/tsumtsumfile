import assert from "node:assert/strict";
import test from "node:test";

import { SKILL_BUTTON_RECT, SKILL_TABLES } from "./config.js";
import { ClearPipeline, Game, InputRouter } from "./game.js";
import { DualGaugeSystem, JudyNickGaugeManager } from "./judyNick.js";

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

function createJudyBubbleInputHarness(nodes) {
  const clearRequests = [];
  const board = {
    findBubbleAt: (pos) => {
      const node = nodes.find((entry) => Math.hypot(entry.x - pos.x, entry.y - pos.y) <= 25);
      return node ? { node, entry: { bubbleId: `bubble-${node.id}` } } : null;
    },
    getResolvedType: (node) => node.type,
    findFrozenGroupAt: () => null,
    isFrozen: () => false
  };
  const game = {
    actionLock: false,
    pendingClear: null,
    dragging: false,
    chain: [],
    chainSet: new Set(),
    chainTypeId: null,
    chainRule: null,
    tsums: nodes,
    boardState: board,
    gameFeel: { setChain() {} },
    isGameplayInputLocked: () => false,
    canQueueChainDuringActiveClear: () => false,
    getChainBehaviorForStart: () => ({ mode: "normal" }),
    getBodyRadius: () => 29,
    isTsumInPlayArea: () => true,
    canExtendActiveChain: () => true,
    noteAction() {},
    startChain(tsum, pos) { return Game.prototype.startChain.call(this, tsum, pos); },
    cancelActiveChain() { return Game.prototype.cancelActiveChain.call(this); }
  };
  const router = new InputRouter(game, board, { dispatchTap: () => false }, {
    beginClear(spec) { clearRequests.push(spec); return true; }
  });
  return { game, router, clearRequests };
}

test("a tapped Judy bubble uses the existing bubble clear path", () => {
  const judyType = { id: "judyNickJudy", score: 170 };
  const node = { id: "judy-1", x: 100, y: 200, type: judyType, dead: false, removing: false, inChain: false };
  const { game, router, clearRequests } = createJudyBubbleInputHarness([node]);

  assert.equal(router.beginBubbleGesture({ x: 100, y: 200 }, 1), true);
  assert.equal(game.dragging, true);
  assert.equal(router.finishBubbleGesture({ x: 102, y: 201 }, 1), true);
  assert.equal(game.dragging, false);
  assert.equal(clearRequests.length, 1);
  assert.equal(clearRequests[0].source, "bubble");
  assert.deepEqual(clearRequests[0].targets, [node]);
});

test("dragging from a Judy bubble keeps it in the normal chain instead of bursting", () => {
  const judyType = { id: "judyNickJudy", score: 170 };
  const node = { id: "judy-1", x: 100, y: 200, type: judyType, dead: false, removing: false, inChain: false };
  const { game, router, clearRequests } = createJudyBubbleInputHarness([node]);

  assert.equal(router.beginBubbleGesture({ x: 100, y: 200 }, 2), true);
  assert.equal(router.trackBubbleGesture({ x: 112, y: 200 }, 2), true);
  assert.equal(router.finishBubbleGesture({ x: 112, y: 200 }, 2), false);
  assert.equal(game.dragging, true);
  assert.deepEqual(game.chain, [node]);
  assert.equal(clearRequests.length, 0);
});

test("multiple bubbled Judy Tsums can use the ordinary chain extension", () => {
  const judyType = { id: "judyNickJudy", score: 170 };
  const nodes = [
    { id: "judy-1", x: 100, y: 200, type: judyType, dead: false, removing: false, inChain: false },
    { id: "judy-2", x: 140, y: 200, type: judyType, dead: false, removing: false, inChain: false },
    { id: "judy-3", x: 180, y: 200, type: judyType, dead: false, removing: false, inChain: false }
  ];
  const { game, router } = createJudyBubbleInputHarness(nodes);

  assert.equal(router.beginBubbleGesture({ x: 100, y: 200 }, 3), true);
  Game.prototype.extendChain.call(game, { x: 140, y: 200 });
  Game.prototype.extendChain.call(game, { x: 180, y: 200 });
  router.trackBubbleGesture({ x: 180, y: 200 }, 3);

  assert.deepEqual(game.chain.map((node) => node.id), ["judy-1", "judy-2", "judy-3"]);
  assert.equal(router.finishBubbleGesture({ x: 180, y: 200 }, 3), false);
});

test("dual READY gauges honor the side selected by the player", () => {
  const gauges = new DualGaugeSystem();
  gauges.judy.isReady = true;
  gauges.nick.isReady = true;

  assert.equal(gauges.activateSkill("judy"), "judy");
  assert.equal(gauges.activateSkill("nick"), "nick");
});

test("the diagonal JudyNick button maps its Judy and Nick halves", () => {
  const game = { myTsum: { id: "judyNick" } };
  assert.equal(Game.prototype.getJudyNickSkillButtonModeAt.call(game, {
    x: SKILL_BUTTON_RECT.x + 12,
    y: SKILL_BUTTON_RECT.y + 12
  }), "judy");
  assert.equal(Game.prototype.getJudyNickSkillButtonModeAt.call(game, {
    x: SKILL_BUTTON_RECT.x + SKILL_BUTTON_RECT.w - 12,
    y: SKILL_BUTTON_RECT.y + SKILL_BUTTON_RECT.h - 12
  }), "nick");
});

test("selecting an unready JudyNick side does not activate the other ready side", () => {
  const gauges = new DualGaugeSystem();
  gauges.judy.isReady = true;
  gauges.nick.isReady = false;

  assert.equal(gauges.activateSkill("nick"), null);
  assert.equal(gauges.activateSkill("judy"), "judy");
});

test("JudyNick COUNT score data is carried through ClearPipeline augmentation", () => {
  const countScoreTable = Game.SkillRegistry.judyNick.tables.countScoreMultiplier;
  const original = countScoreTable[3];
  countScoreTable[3] = 1.75;
  try {
    const target = { id: "judy-1", dead: false, removing: false, isBomb: false };
    const handler = Game.SkillRegistry.judyNick;
    const pipeline = new ClearPipeline({}, { hasBubble: () => false }, {
      augmentClear(request) {
        return handler.onAugmentClear(
          { level: 1 },
          { data: { countStage: 4 } },
          request
        );
      }
    });
    const prepared = pipeline.buildPreparedClear({
      source: "chain",
      targets: [target],
      scoreMultiplier: 2,
      chargeMultiplier: 1
    });
    assert.equal(prepared.scoreMultiplier, 3.5);
  } finally {
    countScoreTable[3] = original;
  }
});

test("ordinary Tsum skill activation ignores JudyNick side selection", () => {
  let uses = 0;
  const game = {
    state: "playing",
    dragging: false,
    paused: false,
    myTsum: { id: "namine" },
    skillSystem: { ready: true, use() { uses += 1; return true; } },
    gameFeel: { emit() {} },
    isGameplayInputLocked: () => false,
    isCoingainInputLocked: () => false,
    triggerSkillButtonFeedback() {},
    addFloatingText() {}
  };

  assert.equal(Game.prototype.attemptSkillActivation.call(game, false, "nick"), true);
  assert.equal(uses, 1);
});
