import { mkdtemp, cp, readdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import { generateTsum } from './tsum-new.mjs';

// Each measurement gets its own disposable source copy; the working catalog stays intact.
const source = fileURLToPath(new URL('../', import.meta.url));
const root = await mkdtemp(join(tmpdir(), 'tdk-benchmark-'));
const results = [];
try {
  for (const template of ['tap', 'chain']) {
    const fixture = join(root, template);
    await cp(source, fixture, { recursive: true, filter: path => {
      const relative = path.slice(source.length).replaceAll('\\', '/');
      return !relative || /^\/?(tdk|tsums|scripts)(\/|$)/.test(relative)
        || /^\/?[^/]+\.(js|mjs|json)$/.test(relative);
    } });
    const id = template === 'tap' ? 'benchmarkTapTsum' : 'benchmarkChainTsum';
    const beforeCatalog = await readFile(join(fixture, 'tsums/catalog.js'), 'utf8');
    const start = performance.now();
    const directory = await generateTsum(id, fixture, { template });
    const generatedMs = performance.now() - start;
    const checkStart = performance.now();
    for (const args of [['scripts/tsum-validate.mjs'], ['--test', `tsums/${id}/skill.test.mjs`]]) {
      const check = spawnSync(process.execPath, args, { cwd: fixture, encoding: 'utf8' });
      if (check.status !== 0) throw new Error(check.stdout + check.stderr);
    }
    results.push({ template, generatedFiles: (await readdir(directory)).length,
      automaticCommonFiles: beforeCatalog !== await readFile(join(fixture, 'tsums/catalog.js'), 'utf8') ? 1 : 0,
      manualCommonFiles: 0, generationAndRegistrationMs: +generatedMs.toFixed(2),
      validationAndBasicTestsMs: +(performance.now() - checkStart).toFixed(2),
      totalMs: +(performance.now() - start).toFixed(2) });
  }
  console.log(JSON.stringify({ sourceCopyExcluded: true, samplesPerTemplate: 1, results }, null, 2));
  if (process.argv[2]) await writeFile(process.argv[2], JSON.stringify(results, null, 2) + '\n');
} finally { await rm(root, { recursive: true, force: true }); }
