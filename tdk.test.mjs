import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, cp, readFile, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import definition from './tsums/testTsum/definition.js';
import { TSUM_TYPES, SKILL_TABLES, FIXED_SUB_TSUM_IDS_BY_MY_TSUM } from './config.js';
import { Game } from './game.js';
import { adaptDefinitions, validateDefinition, validateSubTsums, suggestSubTsums, toTsumType, registerDefinitions } from './tdk/core.js';
import { resolveDevelopmentLaunch, applyDevelopmentLaunch } from './tdk/development.js';
import { generateTsum } from './scripts/tsum-new.mjs';
import { validateCatalog } from './scripts/tsum-validate.mjs';

test('normal catalog, registry and selectable list exclude development Tsum', () => {
  assert.equal(TSUM_TYPES.some(t => t.id === definition.id), false);
  assert.equal(Object.hasOwn(SKILL_TABLES, definition.id), false);
  assert.equal(Object.hasOwn(Game.SkillRegistry, definition.id), false);
  assert.equal(Object.hasOwn(FIXED_SUB_TSUM_IDS_BY_MY_TSUM, definition.id), false);
  assert.equal(resolveDevelopmentLaunch(new URLSearchParams('tsum=testTsum')), null);
  assert.throws(() => resolveDevelopmentLaunch(new URLSearchParams('tdk=1&sl=7')), /sl=/);
  assert.throws(() => resolveDevelopmentLaunch(new URLSearchParams('tdk=1&tsum=missing')), /unknown/);
  assert.throws(() => applyDevelopmentLaunch({ persistenceEnabled: true }, { definition }), /persistence/);
});

test('definition validation rejects missing SL, invalid IDs, absent hooks, modes and visuals', () => {
  for (const id of [undefined, null, '../x', '', '1bad', 'bad-id', 'constructor']) assert.throws(() => validateDefinition({ ...definition, id }));
  assert.throws(() => validateDefinition({ ...definition, tables: { ...definition.tables, cost: Array(6) } }), /numeric/);
  for (const key of ['cost', 'chargeMultiplier', 'coinCorrectionType', 'durationSec', 'eraseRadius']) {
    assert.throws(() => validateDefinition({ ...definition, tables: { ...definition.tables, [key]: [1] } }), /SL1/);
  }
  assert.throws(() => validateDefinition({ ...definition, handler: {} }), /registration/);
  assert.throws(() => validateDefinition({ ...definition, modes: {} }), /modes/);
  assert.throws(() => validateDefinition({ ...definition, visuals: {} }), /visuals/);
  assert.throws(() => validateDefinition({ ...definition, capabilities: { ...definition.capabilities, drag: true } }), /mismatch/);
});

test('adapter adds production and development definitions without changing legacy entries', () => {
  const types = TSUM_TYPES.map(t => ({ ...t }));
  const tables = { ...SKILL_TABLES };
  const before = JSON.stringify({ types, tables, fixed: FIXED_SUB_TSUM_IDS_BY_MY_TSUM });
  const fixed = adaptDefinitions([definition], { types, tables, fixedSubTsums: FIXED_SUB_TSUM_IDS_BY_MY_TSUM, development: true });
  assert.equal(JSON.stringify({ types: types.slice(0, -1), tables: Object.fromEntries(Object.entries(tables).filter(([id]) => id !== definition.id)), fixed: FIXED_SUB_TSUM_IDS_BY_MY_TSUM }), before);
  const registry = {};
  registerDefinitions([definition], registry, types);
  assert.equal(registry.testTsum.onActivate, definition.handler.onActivate);
  assert.throws(() => registerDefinitions([definition], registry, types), /duplicate/);
  validateSubTsums(definition, types, fixed.testTsum);
  assert.throws(() => adaptDefinitions([definition], { types, tables, fixedSubTsums: fixed }), /duplicate/);
  const formalTypes = TSUM_TYPES.slice();
  adaptDefinitions([{ ...definition, developmentOnly: false }], { types: formalTypes, tables: { ...SKILL_TABLES }, fixedSubTsums: FIXED_SUB_TSUM_IDS_BY_MY_TSUM });
  assert.equal(formalTypes.at(-1).selectable, true);
});

test('sub-Tsum validation rejects missing, duplicate, ineligible and indistinguishable lineups for 3/4/5', () => {
  const valid = suggestSubTsums(toTsumType(definition), TSUM_TYPES);
  for (const count of [3, 4, 5]) {
    assert.throws(() => validateSubTsums(definition, TSUM_TYPES, { ...valid, [count]: [] }));
    assert.throws(() => validateSubTsums(definition, TSUM_TYPES, { ...valid, [count]: Array(count - 1).fill('missing') }));
  }
  const same = TSUM_TYPES.map(t => ({ ...t, boardColor: definition.boardColor }));
  assert.throws(() => validateSubTsums(definition, same, valid), /incompatible/);
  assert.throws(() => suggestSubTsums(toTsumType(definition), []), /no compatible/);
});

test('catalog validator checks all files, registration, coin corrections and lineups', async () => {
  assert.ok(await validateCatalog() >= 1);
});

test('generator creates an importable registered definition, refuses collisions and preserves files', async () => {
  const root = await mkdtemp(join(tmpdir(), 'tsum-tdk-'));
  try {
    await mkdir(join(root, 'tsums'));
    await cp('tsums/testTsum', join(root, 'tsums/testTsum'), { recursive: true });
    await cp('tdk', join(root, 'tdk'), { recursive: true });
    await writeFile(join(root, 'package.json'), '{"type":"module"}');
    await writeFile(join(root, 'tsums/catalog.js'), "import testTsum from './testTsum/definition.js';\nexport const tsumDefinitions = [testTsum];\n");
    for (const id of ['testTsum', 'TESTTSUM', 'gaston', '../unsafe', 'constructor']) await assert.rejects(generateTsum(id, root));
    await generateTsum('sampleTsum', root);
    const generated = (await import(pathToFileURL(join(root, 'tsums/sampleTsum/definition.js')))).default;
    validateDefinition(generated);
    assert.equal(generated.id, 'sampleTsum');
    assert.equal(generated.developmentOnly, true);
    const catalog = (await import(pathToFileURL(join(root, 'tsums/catalog.js')))).tsumDefinitions;
    assert.equal(catalog.length, 2);
    const snapshot = await readFile(join(root, 'tsums/sampleTsum/skill.js'), 'utf8');
    await assert.rejects(generateTsum('sampleTsum', root));
    assert.equal(await readFile(join(root, 'tsums/sampleTsum/skill.js'), 'utf8'), snapshot);
    assert.match(await readFile(join(root, 'tsums/sampleTsum/skill.test.mjs'), 'utf8'), /testTsumContract/);
    await generateTsum('class', root);
    const reservedCatalog = await import(pathToFileURL(join(root, 'tsums/catalog.js')).href + '?reserved');
    assert.ok(reservedCatalog.tsumDefinitions.some(d => d.id === 'class'));
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('development launch writes no progress, learning, settings or battle storage', () => {
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', `
    let storageReads = 0, storageWrites = 0;
    globalThis.localStorage = { getItem() { storageReads++; return null; }, setItem() { storageWrites++; } };
    const { makeTdkGame } = await import('./tdk/testing.mjs');
    const { default: d } = await import('./tsums/testTsum/definition.js');
    const { BattleController } = await import('./battle.js');
    const game = makeTdkGame(d);
    game.render = () => {};
    game.saveProgress(); game.saveAiTrainingData(); game.saveAiLearningData();
    game.setRenderQualityMode('minimal'); game.toggleSkillVisuals();
    const controller = Object.create(BattleController.prototype); controller.player = game;
    controller.loadRecords(); controller.saveRecords(); controller.startBattle();
    if (controller.active) throw Error('unsupported CPU started');
    game.finishRun();
    if (storageReads || storageWrites) throw Error('storage accessed: reads=' + storageReads + ' writes=' + storageWrites);
  `], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
});
