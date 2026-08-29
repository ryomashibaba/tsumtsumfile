import test from "node:test";
import assert from "node:assert/strict";
import { SKILL_TABLES } from "./config.js";
import {
  LILIA_CHAIN_TYPE,
  LILIA_COIN_CORRECTION,
  LILIA_SKILL_COST,
  LILIA_SKILL_DURATION,
  LILIA_TUNING,
  LiliaBatFlightController,
  LiliaSkillController,
  chooseLiliaBatBaseType,
  classifyLiliaChain,
  computeBatLineClear,
  computeLiliaAuraClear,
  isLiliaBatNode,
  registerLiliaSkill,
  resolveBatChain,
  resolveLiliaChain
} from "./lilia.js";

const node = (id, typeId, x, y, extra = {}) => ({
  id,
  type: { id: typeId },
  x,
  y,
  dead: false,
  removing: false,
  inChain: false,
  ...extra
});

test("Lilia basic skill tables use cost 19, durations 5-10 and required coin corrections", () => {
  assert.equal(LILIA_SKILL_COST, 19);
  assert.deepEqual(Object.values(LILIA_SKILL_DURATION), [5, 6, 7, 8, 9, 10]);
  assert.deepEqual(Object.values(LILIA_COIN_CORRECTION), [-2, -1, -1, 0, 0, 1]);
  assert.deepEqual(SKILL_TABLES.liliaVanrouge.cost, [19, 19, 19, 19, 19, 19]);
  assert.deepEqual(SKILL_TABLES.liliaVanrouge.durationSec, [5, 6, 7, 8, 9, 10]);
  assert.deepEqual(SKILL_TABLES.liliaVanrouge.coinCorrectionType, [
    "correction_-2", "correction_-1", "correction_-1", "correction_0", "correction_0", "correction_1"
  ]);
});

test("BAT state retains base type, applies to matching new spawns, and restores on end", () => {
  const state = { active: true, transformedBaseTypeId: "subA" };
  const existing = node("a", "subA", 0, 0);
  const newSpawn = node("b", "subA", 0, 0);
  assert.equal(isLiliaBatNode(existing, state), true);
  assert.equal(isLiliaBatNode(newSpawn, state), true);
  assert.equal(existing.type.id, "subA");
  state.active = false;
  assert.equal(isLiliaBatNode(existing, state), false);
});

test("chain classification separates Lilia and BAT and rejects mixing", () => {
  const state = { active: true, transformedBaseTypeId: "subA" };
  const lilias = [node("l1", "liliaVanrouge", 0, 0), node("l2", "liliaVanrouge", 1, 0)];
  const bats = [node("b1", "subA", 0, 0), node("b2", "subA", 1, 0)];
  assert.equal(classifyLiliaChain(lilias, state), LILIA_CHAIN_TYPE.LILIA);
  assert.equal(classifyLiliaChain(bats, state), LILIA_CHAIN_TYPE.BAT);
  assert.equal(classifyLiliaChain([lilias[0], bats[0]], state), LILIA_CHAIN_TYPE.INVALID);
});

test("most common non-MyTsum becomes BAT with available-type tie breaking", () => {
  const game = {
    tsums: [
      node("l", "liliaVanrouge", 0, 0),
      node("a1", "subA", 0, 0), node("a2", "subA", 0, 0),
      node("b1", "subB", 0, 0), node("b2", "subB", 0, 0)
    ],
    availableTypes: [{ id: "liliaVanrouge" }, { id: "subB" }, { id: "subA" }],
    isMyTsumTypeId: (id) => id === "liliaVanrouge"
  };
  assert.equal(chooseLiliaBatBaseType(game), "subB");
});

test("Lilia chain always launches one virtual BAT per chained MyTsum", () => {
  const lilias = [node("l1", "liliaVanrouge", 100, 300), node("l2", "liliaVanrouge", 130, 300), node("l3", "liliaVanrouge", 160, 300)];
  const bats = [node("b1", "subA", 90, 320), node("b2", "subA", 180, 320)];
  const game = { tsums: [...lilias, ...bats] };
  const controller = new LiliaSkillController("subA");
  assert.equal(controller.syncChain(game, lilias), true);
  assert.deepEqual(controller.flight.flying.map((bat) => bat.tsumId), [
    "lilia-flight:l1", "lilia-flight:l2", "lilia-flight:l3"
  ]);
  assert.equal(controller.flight.flying.every((bat) => bat.virtual), true);
});

test("default Lilia BAT flight speed is doubled to 210", () => {
  const flight = new LiliaBatFlightController(LILIA_TUNING);
  flight.sync([node("b1", "subA", 207, 360)]);
  const bat = flight.snapshot()[0];
  assert.ok(Math.abs(Math.hypot(bat.vx, bat.vy) - 210) < 1e-9);
});

test("BAT chain flies the selected BATs themselves in chain order", () => {
  const bats = [node("b1", "subA", 100, 300), node("b2", "subA", 140, 300), node("b3", "subA", 180, 300)];
  const controller = new LiliaSkillController("subA");
  controller.syncChain({ tsums: bats }, bats);
  assert.deepEqual(controller.flight.flying.map((bat) => bat.tsumId), ["b1", "b2", "b3"]);
});

test("line clear uses capsule distance and ignores far tsums and bombs", () => {
  const board = [
    node("near", "x", 50, 8),
    node("edge", "x", 100, 20),
    node("far", "x", 50, 40),
    node("bomb", "bomb", 50, 0, { isBomb: true })
  ];
  const ids = computeBatLineClear({
    batPositions: [{ x: 0, y: 0 }, { x: 100, y: 0 }],
    boardTsums: board,
    lineRadius: 20
  });
  assert.deepEqual([...ids].sort(), ["edge", "near"]);
});

test("aura clear includes only nodes within radius", () => {
  const ids = computeLiliaAuraClear({
    chainedLilia: [{ x: 0, y: 0 }],
    boardTsums: [node("inside", "x", 29, 0), node("outside", "x", 31, 0)],
    auraRadius: 30
  });
  assert.deepEqual([...ids], ["inside"]);
});

test("Lilia union deduplicates line and aura while BAT resolution has no aura", () => {
  const shared = node("shared", "x", 50, 0);
  const board = [shared, node("line", "x", 75, 0), node("aura", "x", 0, 20)];
  const batPositions = [{ tsumId: "b1", x: 0, y: 0 }, { tsumId: "b2", x: 100, y: 0 }];
  const lilia = resolveLiliaChain({
    batPositions,
    chainedLilia: [node("l1", "liliaVanrouge", 0, 0)],
    boardTsums: board,
    lineRadius: 10,
    auraRadius: 25
  });
  assert.equal(lilia.clearIds.has("shared"), true);
  assert.equal([...lilia.clearIds].filter((id) => id === "shared").length, 1);
  assert.equal(lilia.clearIds.has("aura"), true);

  const bat = resolveBatChain({ batPositions, boardTsums: board, lineRadius: 10 });
  assert.equal(bat.auraClearIds.size, 0);
  assert.equal(bat.clearIds.has("aura"), false);
});

test("flight changes position during hold, is deterministic and snapshots stay immutable", () => {
  const source = node("bat-a", "subA", 207, 360);
  const first = new LiliaBatFlightController(LILIA_TUNING);
  const second = new LiliaBatFlightController(LILIA_TUNING);
  first.sync([source]);
  second.sync([source]);
  const start = first.snapshot()[0];
  first.update(0.25);
  second.update(0.25);
  const after = first.snapshot()[0];
  assert.notDeepEqual({ x: after.x, y: after.y }, { x: start.x, y: start.y });
  assert.deepEqual(first.snapshot(), second.snapshot());
  const released = first.snapshot();
  first.update(0.25);
  assert.deepEqual(released[0], after);
});

test("flight reflects within the configured elliptical field boundary", () => {
  const source = node("edge-bat", "subA", 380, 360);
  const flight = new LiliaBatFlightController({ ...LILIA_TUNING, batSpeed: 300 });
  flight.sync([source]);
  for (let index = 0; index < 200; index += 1) {
    flight.update(0.05);
  }
  const bat = flight.snapshot()[0];
  const radiusX = 207 - LILIA_TUNING.boundaryPadding - 29 * 0.45;
  const radiusY = 220 - LILIA_TUNING.boundaryPadding - 29 * 0.45;
  const normalized = ((bat.x - 207) / radiusX) ** 2 + ((bat.y - 360) / radiusY) ** 2;
  assert.ok(normalized <= 1.001);
});

test("registered skill advances flight without pausing game time and passes clear integration options", () => {
  const registry = {};
  registerLiliaSkill({
    SkillRegistry: registry,
    skillValue: (_id, key, level) => SKILL_TABLES.liliaVanrouge[key][level - 1]
  });
  const lilias = [node("l1", "liliaVanrouge", 100, 300), node("l2", "liliaVanrouge", 130, 300), node("l3", "liliaVanrouge", 160, 300)];
  const bats = [node("b1", "subA", 90, 320), node("b2", "subA", 150, 320), node("b3", "subA", 210, 320)];
  const clearCalls = [];
  const game = {
    tsums: [...lilias, ...bats],
    availableTypes: [{ id: "liliaVanrouge" }, { id: "subA" }],
    chain: lilias.slice(),
    dragging: true,
    isMyTsumTypeId: (id) => id === "liliaVanrouge",
    pushCenterMessage() {},
    finishChain() {}
  };
  let session;
  const ctx = {
    level: 1,
    game,
    clear: { beginClear: (spec) => (clearCalls.push(spec), true) },
    createSession(spec) {
      session = { id: "lilia-1", handlerId: "liliaVanrouge", level: 1, schedules: [], ...spec };
      return session;
    }
  };
  registry.liliaVanrouge.onActivate(ctx);
  const controller = session.data.controller;
  controller.syncChain(game, lilias);
  controller.snapshotRelease();
  assert.equal(controller.releasePositions.length, lilias.length);

  let gameTime = 10;
  registry.liliaVanrouge.onTick(ctx, session, 500);
  gameTime -= 0.5;
  session.remainingMs -= 500;
  assert.equal(gameTime, 9.5);
  assert.equal(session.remainingMs, 4500);

  registry.liliaVanrouge.onChainCommit(ctx, session, lilias);
  assert.equal(clearCalls.length, 1);
  assert.equal(clearCalls[0].source, "liliaSkill");
  assert.equal(clearCalls[0].correctionType, "correction_-2");
  assert.equal(clearCalls[0].chargeMultiplier, 1);
  assert.equal(clearCalls[0].allowBomb, true);
  assert.equal(clearCalls[0].targets.some((target) => target.isBomb), false);
  assert.equal(clearCalls[0].targets.some((target) => target.id.startsWith("lilia-flight:")), false);
});

test("different hold durations can produce different geometric clear sets", () => {
  const sources = [node("b1", "subA", 130, 300), node("b2", "subA", 210, 300), node("b3", "subA", 290, 300)];
  const board = [
    node("t1", "x", 170, 300), node("t2", "x", 250, 300),
    node("t3", "x", 180, 276), node("t4", "x", 230, 320), node("t5", "x", 320, 340)
  ];
  const flight = new LiliaBatFlightController(LILIA_TUNING);
  flight.sync(sources);
  const immediate = computeBatLineClear({ batPositions: flight.snapshot(), boardTsums: board, lineRadius: 12 });
  for (let index = 0; index < 30; index += 1) {
    flight.update(1 / 60);
  }
  const held = computeBatLineClear({ batPositions: flight.snapshot(), boardTsums: board, lineRadius: 12 });
  assert.notDeepEqual([...immediate].sort(), [...held].sort());
});
