import { readdir, access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { tsumDefinitions } from '../tsums/catalog.js';
import { TSUM_TYPES, SKILL_TABLES, FIXED_SUB_TSUM_IDS_BY_MY_TSUM, COIN_CORRECTION_TABLE } from '../config.js';
import { adaptDefinitions, registerDefinitions } from '../tdk/core.js';

export async function validateCatalog() {
  const types = TSUM_TYPES.filter(t => !tsumDefinitions.some(d => d.id === t.id));
  const tables = Object.fromEntries(Object.entries(SKILL_TABLES).filter(([id]) => !tsumDefinitions.some(d => d.id === id)));
  const fixed = Object.fromEntries(Object.entries(FIXED_SUB_TSUM_IDS_BY_MY_TSUM).filter(([id]) => !tsumDefinitions.some(d => d.id === id)));
  adaptDefinitions(tsumDefinitions, { types, tables, fixedSubTsums: fixed, development: true });
  const registry = {};
  registerDefinitions(tsumDefinitions, registry, types);
  const root = new URL('../', import.meta.url);
  for (const entry of await readdir(new URL('tsums/', root), { withFileTypes: true })) {
    if (entry.isDirectory() && !tsumDefinitions.some(d => d.id === entry.name)) throw new Error(`カタログ登録漏れ: ${entry.name}`);
  }
  for (const d of tsumDefinitions) {
    if (!registry[d.id]) throw new Error(`スキル登録漏れ: ${d.id}`);
    for (const correction of d.tables.coinCorrectionType) if (!Object.hasOwn(COIN_CORRECTION_TABLE, correction)) throw new Error(`不明なコイン補正: ${correction}`);
    if (!/^\.\/[\w/.-]+\.(svg|png|webp)$/.test(d.imageSrc) || d.imageSrc.includes('..')) throw new Error(`ローカル画像パスが必要: ${d.id}`);
    await access(new URL(d.imageSrc, root));
    await access(new URL(`tsums/${d.id}/skill.test.mjs`, root));
  }
  return tsumDefinitions.length;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try { console.log(`TDK: ${await validateCatalog()}定義、SL1〜6、登録、画像、サブツム3/4/5種類 OK`); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
