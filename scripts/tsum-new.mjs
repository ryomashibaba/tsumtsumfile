import { readFile, writeFile, mkdir, readdir, rm } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ID_PATTERN } from '../tdk/core.js';
import { TSUM_TYPES } from '../config.js';
import { tsumDefinitions } from '../tsums/catalog.js';

export async function generateTsum(id, root = fileURLToPath(new URL('../', import.meta.url)), { template = 'tap' } = {}) {
  if (!['tap', 'chain'].includes(template)) throw new Error('template must be tap or chain');
  if (!ID_PATTERN.test(id || '') || ['constructor', 'prototype', '__proto__'].includes(id)) throw new Error('IDは英小文字で始まる英数字2〜48文字です');
  if ([...TSUM_TYPES, ...tsumDefinitions].some(t => t.id.toLowerCase() === id.toLowerCase())) throw new Error(`ID重複: ${id}`);
  const directory = join(root, 'tsums', id);
  const existing = await readdir(join(root, 'tsums'));
  if (existing.some(name => name.toLowerCase() === id.toLowerCase())) throw new Error(`既存ファイルを保護: ${id}`);
  const catalogPath = join(root, 'tsums/catalog.js');
  const catalog = await readFile(catalogPath, 'utf8');
  if (!catalog.includes('export const tsumDefinitions = [')) throw new Error('カタログ形式を確認してください');

  const templateId = template === 'chain' ? 'chainTestTsum' : 'testTsum';
  const templates = {};
  for (const name of ['definition.js', 'skill.js', 'visuals.js', 'image.svg']) {
    templates[name] = (await readFile(join(root, 'tsums', templateId, name), 'utf8'))
      .replaceAll(templateId, id)
      .replaceAll('TDK試験ツム', id).replaceAll('試験タップ消去', 'タップ消去').replaceAll('TDK TAP TEST', id)
      .replaceAll('TDKチェーン試験ツム', id).replaceAll('チェーン消去テスト', 'チェーン型消去').replaceAll('TDK CHAIN TEST', id);
  }
  const contract = template === 'chain' ? 'testChainTsumContract' : 'testTapTsumContract';
  templates['skill.test.mjs'] = `import definition from './definition.js';\nimport { testTsumCommonContract, ${contract} } from '../../tdk/testing.mjs';\ntestTsumCommonContract(definition);\n${contract}(definition);\n`;

  await mkdir(directory); // exclusive: never overwrite an existing directory
  try {
    for (const [name, content] of Object.entries(templates)) await writeFile(join(directory, name), content, { flag: 'wx' });
    const binding = `tdk_${id}`;
    const next = `import ${binding} from './${id}/definition.js';\n` + catalog.replace('export const tsumDefinitions = [', `export const tsumDefinitions = [${binding}, `);
    if (await readFile(catalogPath, 'utf8') !== catalog) throw new Error('カタログが同時更新されました。再実行してください');
    await writeFile(catalogPath, next);
  } catch (error) {
    await rm(directory, { recursive: true, force: true });
    throw error;
  }
  return directory;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2);
    if (args.length < 1 || args.length > 2 || (args.length === 2 && !/^--template=(tap|chain)$/.test(args[1]))) {
      throw new Error('使用法: npm run tsum:new -- newTsum [--template=tap|chain]');
    }
    const template = args[1]?.split('=')[1] || 'tap';
    console.log(`生成: ${await generateTsum(args[0], undefined, { template })}`);
    console.log(`使用テンプレート: ${template}`);
    console.log('definition.js / skill.js / visuals.js を編集 → npm run tsum:validate → npm run test:tdk');
    console.log(`node scripts/serve.mjs → http://localhost:8765/?tdk=1&tsum=${args[0]}&sl=1&types=5`);
    console.log('初期状態は開発専用・手動操作のみ。正式化は別途明示的に行ってください。');
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
