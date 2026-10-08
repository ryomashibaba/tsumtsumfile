import test from "node:test";
import assert from "node:assert/strict";

import {
  CHEAT_SPECIAL,
  advanceSpawnSchedule,
  getSkillCostKey,
  normalizeCheatSettings,
  reconcileGaugeCharge,
  resolveCoronationElsaFreezeRadii,
  resolveSkillCost,
  settingValueFromSlider
} from "./cheatSettings.js";
import { DualGaugeSystem } from "./judyNick.js";
import { Game } from "./game.js";

test("cheat settings normalize old, invalid, boundary, and special values", () => {
  assert.deepEqual(normalizeCheatSettings(), {
    enabled: false,
    boardTarget: 45,
    spawnRate: "instant",
    largeTsumChance: 1,
    gravityMultiplier: 1,
    tsumDiameter: 58,
    chainDistanceMultiplier: 1,
    allowMixedChains: false,
    myTsumChance: null,
    coronationElsaLineRadius: null,
    coronationElsaSurroundRadius: null,
    autoSkill: false,
    skillCosts: {},
    coinCorrections: {}
  });
  assert.deepEqual(normalizeCheatSettings({
    enabled: true,
    boardTarget: "unlimited",
    spawnRate: 5000,
    largeTsumChance: 500,
    gravityMultiplier: 0,
    tsumDiameter: 500,
    autoSkill: true,
    skillCosts: { alice: -2, bad: "oops", "judyNick:nick": "unlimited" },
    coinCorrections: { "coingain:skill:coingainBase": -15, bad: "oops", huge: 5000 }
  }), {
    enabled: true,
    boardTarget: "unlimited",
    spawnRate: 999,
    largeTsumChance: 100,
    gravityMultiplier: 0.1,
    tsumDiameter: 100,
    chainDistanceMultiplier: 1,
    allowMixedChains: false,
    myTsumChance: null,
    coronationElsaLineRadius: null,
    coronationElsaSurroundRadius: null,
    autoSkill: true,
    skillCosts: { alice: 0, "judyNick:nick": "unlimited" },
    coinCorrections: { "coingain:skill:coingainBase": -15, huge: 999 }
  });
  assert.equal(settingValueFromSlider(999, CHEAT_SPECIAL.UNLIMITED), 999);
  assert.equal(settingValueFromSlider(1000, CHEAT_SPECIAL.UNLIMITED), "unlimited");
});

test("Coronation Elsa freeze radii keep level defaults and normalize independent cheat overrides", () => {
  const oldSave = normalizeCheatSettings({ enabled: true });
  assert.deepEqual(resolveCoronationElsaFreezeRadii(oldSave, 78), {
    lineRadius: 78 * 0.58,
    surroundRadius: 78
  });
  const overrides = normalizeCheatSettings({
    enabled: true,
    coronationElsaLineRadius: 12.345,
    coronationElsaSurroundRadius: 1200
  });
  assert.equal(overrides.coronationElsaLineRadius, 12.35);
  assert.equal(overrides.coronationElsaSurroundRadius, 999);
  assert.deepEqual(resolveCoronationElsaFreezeRadii(overrides, 78), {
    lineRadius: 12.35,
    surroundRadius: 999
  });
  assert.deepEqual(resolveCoronationElsaFreezeRadii({ ...overrides, enabled: false }, 78), {
    lineRadius: 78 * 0.58,
    surroundRadius: 78
  });
  assert.deepEqual(resolveCoronationElsaFreezeRadii(normalizeCheatSettings(), 78), {
    lineRadius: 78 * 0.58,
    surroundRadius: 78
  });
  assert.equal(normalizeCheatSettings({ coronationElsaLineRadius: "bad" }).coronationElsaLineRadius, null);
});

test("skill cost overrides are character-specific and keep Judy and Nick separate", () => {
  const settings = normalizeCheatSettings({
    enabled: true,
    skillCosts: { alice: 0, "judyNick:judy": 7, "judyNick:nick": "unlimited" }
  });
  assert.equal(getSkillCostKey("judyNick", "judy"), "judyNick:judy");
  assert.equal(resolveSkillCost(settings, "alice", null, 25), 0);
  assert.equal(resolveSkillCost(settings, "judyNick", "judy", 25), 7);
  assert.equal(resolveSkillCost(settings, "judyNick", "nick", 25), Infinity);
  assert.equal(resolveSkillCost({ ...settings, enabled: false }, "alice", null, 25), 25);
});

test("finite spawn scheduling is deterministic and does not bank tokens while full", () => {
  const settings = normalizeCheatSettings({ enabled: true, boardTarget: 10, spawnRate: 4 });
  assert.deepEqual(advanceSpawnSchedule({ settings, occupancy: 0, accumulator: 0, dt: 0.5 }), {
    spawnCount: 2,
    accumulator: 0
  });
  assert.deepEqual(advanceSpawnSchedule({ settings, occupancy: 10, accumulator: 0.75, dt: 20 }), {
    spawnCount: 0,
    accumulator: 0
  });
  assert.deepEqual(advanceSpawnSchedule({
    settings: { ...settings, boardTarget: 0 }, occupancy: 4, accumulator: 0, dt: 1
  }), { spawnCount: 0, accumulator: 0 });
});

test("instant finite fill and unlimited instant use the safe 999 per second rate", () => {
  const finite = normalizeCheatSettings({ enabled: true, boardTarget: 45, spawnRate: "instant" });
  assert.equal(advanceSpawnSchedule({ settings: finite, occupancy: 12, dt: 0 }).spawnCount, 33);
  const unlimited = normalizeCheatSettings({ enabled: true, boardTarget: "unlimited", spawnRate: "instant" });
  assert.deepEqual(advanceSpawnSchedule({ settings: unlimited, occupancy: 45, dt: 0.1 }), {
    spawnCount: 99,
    accumulator: 0.9000000000000057
  });
});

test("gauge reconciliation preserves ratio across finite, zero, and unlimited costs", () => {
  const half = reconcileGaugeCharge({ charge: 10, maxCharge: 20, lastFiniteRatio: 0 }, 8, true);
  assert.equal(half.charge, 4);
  const unlimited = reconcileGaugeCharge(half, Infinity, true);
  assert.equal(unlimited.isReady, false);
  assert.equal(unlimited.lastFiniteRatio, 0.5);
  const restored = reconcileGaugeCharge(unlimited, 30, true);
  assert.equal(restored.charge, 15);
  const zero = reconcileGaugeCharge(restored, 0, true);
  assert.equal(zero.isReady, true);
  assert.equal(reconcileGaugeCharge(zero, 9, true).charge, 9);
});

test("Judy and Nick support independent zero and unlimited thresholds", () => {
  const gauges = new DualGaugeSystem();
  gauges.setMaxCharges(0, Infinity, true);
  assert.equal(gauges.getJudyGauge().isReady, true);
  assert.equal(gauges.getNickGauge().isReady, false);
  gauges.addCharge("judyNickNickMate", 500);
  assert.equal(gauges.getNickGauge().charge, 0);
  gauges.consumeSkill("judy");
  assert.equal(gauges.getJudyGauge().isReady, true);
});

test("auto skill waits for locks and active sessions, then uses the normal activation entry", () => {
  let attempts = 0;
  const game = {
    cheatSettings: { enabled: true, autoSkill: true },
    role: "player",
    state: "playing",
    paused: false,
    timeUp: false,
    actionLock: false,
    pendingClear: null,
    skillRuntime: { sessions: [], timingPauses: [], isPresentationActive: () => false },
    isCheatActive: Game.prototype.isCheatActive,
    isSkillReadyForActivation: () => true,
    attemptSkillActivation: () => { attempts += 1; return true; }
  };
  assert.equal(Game.prototype.updateCheatAutoSkill.call(game), true);
  game.skillRuntime.sessions.push({ id: "active" });
  assert.equal(Game.prototype.updateCheatAutoSkill.call(game), false);
  assert.equal(attempts, 1);
});

test("coin correction supports values outside the built-in table and shifts coingain stages", () => {
  const game = {
    role: "player",
    myTsum: { id: "coingain", coinCorrectionType: "correction_0" },
    cheatSettings: normalizeCheatSettings({
      enabled: true,
      coinCorrections: { "coingain:skill:coingainBase": -15 }
    }),
    isCheatActive: Game.prototype.isCheatActive,
    getCheatCoinCorrection: Game.prototype.getCheatCoinCorrection,
    createCoinCorrectionTable: Game.prototype.createCoinCorrectionTable
  };
  const minus15 = Game.prototype.getCoinsByClearCount.call(game, 20, "coingain", "correction_0");
  game.cheatSettings.coinCorrections["coingain:skill:coingainBase"] = 100;
  const plus100 = Game.prototype.getCoinsByClearCount.call(game, 20, "coingain", "correction_0");
  game.cheatSettings.coinCorrections["coingain:skill:coingainBase"] = -15;
  const shiftedTop = Game.prototype.getCoinsByClearCount.call(game, 20, "coingain", "correction_30");
  assert.ok(plus100 > minus15);
  assert.equal(shiftedTop, Game.prototype.createCoinCorrectionTable.call(game, 15)[20]);
});

test("Judy and Nick expose ten independent count corrections plus the overlay", () => {
  const controls = Game.prototype.getCoinCorrectionControls.call({
    myTsum: { id: "judyNick", skillType: "judyNick" },
    selectedSkillLevel: 4
  });
  assert.deepEqual(controls.map((entry) => entry.route), [
    "count1", "count2", "count3", "count4", "count5", "count6",
    "count7", "count8", "count9", "count10", "overlay"
  ]);
  assert.deepEqual(controls.map((entry) => entry.defaultValue), [-9, -8, -7, -6, -5, -4, -3, -2, -1, 0, 0]);
});

test("Final Battle Hook exposes one skill coin correction for both manual and diagonal clears", () => {
  const controls = Game.prototype.getCoinCorrectionControls.call({
    myTsum: { id: "finalBattleHook", skillType: "finalBattleHook" },
    selectedSkillLevel: 5
  });
  assert.deepEqual(controls, [{
    route: "default",
    label: "スキル中（既定 -1）",
    defaultValue: -1
  }]);

  const game = {
    role: "player",
    myTsum: { id: "finalBattleHook", coinCorrectionType: "correction_0" },
    cheatSettings: normalizeCheatSettings({
      enabled: true,
      coinCorrections: { "finalBattleHook:skill:default": 4 }
    }),
    isCheatActive: Game.prototype.isCheatActive,
    getCheatCoinCorrection: Game.prototype.getCheatCoinCorrection,
    createCoinCorrectionTable: Game.prototype.createCoinCorrectionTable
  };
  for (const correctionType of ["correction_-1", "correction_-2"]) {
    assert.equal(
      Game.prototype.getCoinCalculationContext.call(game, null, correctionType).correctionType,
      "correction_4"
    );
  }
  assert.equal(Game.prototype.getCoinCalculationContext.call(game).correctionType, "correction_0");
});

test("Tsum diameter is clamped and updates normal and large live bodies", () => {
  assert.equal(normalizeCheatSettings({ tsumDiameter: 0 }).tsumDiameter, 1);
  assert.equal(normalizeCheatSettings({ tsumDiameter: 101 }).tsumDiameter, 100);
  const normal = { radius: 29, baseRadius: 29, isLarge: false };
  const large = { radius: 43.5, baseRadius: 43.5, isLarge: true };
  const game = {
    role: "player",
    cheatSettings: normalizeCheatSettings({ enabled: true, tsumDiameter: 80 }),
    tsums: [normal, large],
    isCheatActive: Game.prototype.isCheatActive,
    getConfiguredTsumRadius: Game.prototype.getConfiguredTsumRadius
  };
  Game.prototype.refreshCheatTsumSizes.call(game);
  assert.equal(normal.baseRadius, 40);
  assert.equal(large.baseRadius, 60);
});


test("common cheat ranges normalize, round-trip and reset old saves", () => {
  const settings = normalizeCheatSettings({ enabled: true, chainDistanceMultiplier: 99, allowMixedChains: true, myTsumChance: -1 });
  assert.equal(settings.chainDistanceMultiplier, 10);
  assert.equal(settings.myTsumChance, 0);
  assert.equal(normalizeCheatSettings({ chainDistanceMultiplier: 0 }).chainDistanceMultiplier, 0.5);
  assert.equal(normalizeCheatSettings({ myTsumChance: 101 }).myTsumChance, 100);
  assert.equal(normalizeCheatSettings({ myTsumChance: 'invalid' }).myTsumChance, null);
  assert.deepEqual(normalizeCheatSettings(JSON.parse(JSON.stringify(settings))), settings);
});

test("spawn percentage endpoints and sub-Tsum distribution override only player cheats", () => {
  const game = Object.create(Game.prototype);
  game.role = 'player';
  game.myTsum = { id: 'my' };
  game.availableTypes = [game.myTsum, { id: 'a' }, { id: 'b' }];
  const original = { id: 'original' };
  game.boardState = { chooseSpawnType: () => original };
  game.cheatSettings = normalizeCheatSettings({ enabled: true, myTsumChance: 100 });
  game.random = () => 0.999;
  assert.equal(game.randomTsumType(), game.myTsum);
  game.cheatSettings.myTsumChance = 0;
  game.random = () => 0;
  assert.equal(game.randomTsumType().id, 'a');
  game.random = () => 0.999;
  assert.equal(game.randomTsumType().id, 'b');
  game.cheatSettings.myTsumChance = 40;
  for (const [roll, id] of [[0.399, 'my'], [0.4, 'a'], [0.699, 'a'], [0.701, 'b']]) {
    game.random = () => roll;
    assert.equal(game.randomTsumType().id, id);
  }
  game.cheatSettings.enabled = false;
  assert.equal(game.randomTsumType(), original);
  game.cheatSettings.enabled = true;
  game.role = 'cpu';
  assert.equal(game.randomTsumType(), original);
  game.role = 'player';
  game.cheatSettings.myTsumChance = null;
  assert.equal(game.randomTsumType(), original);
});

test("board conversion keeps geometry and bombs, cancels input and rejects unsafe states", () => {
  const game = Object.create(Game.prototype);
  game.role = 'player';
  game.cheatSettings = normalizeCheatSettings({ enabled: true });
  game.state = 'playing';
  game.myTsum = { id: 'my' };
  const live = { id: 'live', type: { id: 'sub' }, x: 5, radius: 42, isLarge: true, inChain: true };
  const dead = { id: 'dead', dead: true, type: { id: 'sub' } };
  const clearing = { id: 'clearing', clearOccupying: true, type: { id: 'sub' } };
  const bomb = { id: 'bomb', isBomb: true, type: { id: 'bomb' } };
  game.tsums = [live, dead, clearing, bomb];
  game.chain = [live];
  game.boardState = { transformLayer: new Map([['live', [{}]]]) };
  game.skillRuntime = { sessions: [] };
  game.skillRuntime.sessions.push({});
  assert.equal(game.convertBoardToMyTsum(), 0);
  game.skillRuntime.sessions = [];
  game.pendingClear = {};
  assert.equal(game.convertBoardToMyTsum(), 0);
  game.pendingClear = null;
  game.cheatSettings.enabled = false;
  assert.equal(game.convertBoardToMyTsum(), 0);
  game.cheatSettings.enabled = true;
  assert.equal(game.convertBoardToMyTsum(), 1);
  assert.equal(live.type, game.myTsum);
  assert.equal(live.radius, 42);
  assert.equal(live.x, 5);
  assert.equal(live.inChain, false);
  assert.equal(game.boardState.transformLayer.size, 0);
  assert.equal(dead.type.id, 'sub');
  assert.equal(clearing.type.id, 'sub');
  assert.equal(bomb.type.id, 'bomb');
});


test("pair My-Tsums split the configured probability and conversion between Judy and Nick", () => {
  const game = Object.create(Game.prototype);
  game.role = 'player';
  game.state = 'playing';
  game.myTsum = { id: 'judyNick' };
  const myTypes = game.getCheatMyTsumTypes();
  game.availableTypes = [...myTypes, { id: 'sub' }];
  game.cheatSettings = normalizeCheatSettings({ enabled: true, myTsumChance: 100 });
  for (const [roll, expected] of [[0, 'judyNickJudy'], [0.999, 'judyNickNickMate']]) {
    game.random = () => roll;
    assert.equal(game.randomTsumType().id, expected);
  }
  game.cheatSettings.myTsumChance = 0;
  assert.equal(game.randomTsumType().id, 'sub');
  game.tsums = [{ id: 'a' }, { id: 'b' }];
  game.boardState = { transformLayer: new Map() };
  assert.equal(game.convertBoardToMyTsum(), 2);
  assert.deepEqual(game.tsums.map((tsum) => tsum.type.id), ['judyNickJudy', 'judyNickNickMate']);
});


test("settings panel exposes all common controls and their updates persist through save/load", async () => {
  const { CheatSettingsPanel } = await import('./cheatSettingsPanel.js');
  const previousDocument = globalThis.document;
  const previousStorage = globalThis.localStorage;
  class Element {
    constructor(tag) { this.tag = tag; this.children = []; this.listeners = {}; this.attributes = {}; }
    append(...nodes) { this.children.push(...nodes); }
    appendChild(node) { this.children.push(node); }
    replaceChildren() { this.children = []; }
    setAttribute(key, value) { this.attributes[key] = value; }
    addEventListener(event, handler) { this.listeners[event] = handler; }
  }
  const saved = new Map();
  globalThis.document = { createElement: (tag) => new Element(tag), body: new Element('body') };
  globalThis.localStorage = { setItem: (key, value) => saved.set(key, value), getItem: (key) => saved.get(key) };
  try {
    const game = Object.create(Game.prototype);
    game.role = 'player';
    game.persistenceEnabled = true;
    game.cheatSettings = normalizeCheatSettings({ enabled: true });
    game.myTsum = { id: 'alice' };
    game.tsums = [];
    game.getDefaultSkillCost = () => 20;
    game.getCoinCorrectionControls = () => [];
    let conversions = 0;
    game.convertBoardToMyTsum = () => { conversions++; return 3; };
    const panel = new CheatSettingsPanel(game);
    panel.render();
    const flatten = (node) => [node, ...node.children.flatMap(flatten)];
    const nodes = flatten(panel.dialog);
    const distance = nodes.find((node) => node.attributes['aria-label'] === 'チェーン接続距離 スライダー');
    assert.equal(distance.min, '0.5');
    assert.equal(distance.max, '10');
    distance.value = '2.5';
    distance.listeners.input();
    const mixed = nodes.find((node) => node.tag === 'label' && node.children.some((child) => child.textContent === '異なる種類のツム同士のチェーン')).children[0];
    mixed.checked = true;
    mixed.listeners.change();
    const chance = nodes.find((node) => node.attributes['aria-label'] === 'マイツム出現率 数値');
    chance.value = '75';
    chance.listeners.input();
    nodes.find((node) => node.textContent === '全ツムをマイツムに変換').listeners.click();
    assert.equal(conversions, 1);
    const restored = game.loadSave();
    assert.equal(restored.cheatSettings.chainDistanceMultiplier, 2.5);
    assert.equal(restored.cheatSettings.allowMixedChains, true);
    assert.equal(restored.cheatSettings.myTsumChance, 75);
    nodes.find((node) => node.textContent === '標準に戻す').listeners.click();
    assert.equal(game.loadSave().cheatSettings.myTsumChance, null);
    game.resetCheatSettings();
    assert.equal(game.cheatSettings.chainDistanceMultiplier, 1);
    assert.equal(game.cheatSettings.allowMixedChains, false);
  } finally {
    globalThis.document = previousDocument;
    globalThis.localStorage = previousStorage;
  }
});
