import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
const files = readdirSync(new URL('../tsums/', import.meta.url), { withFileTypes: true }).filter(d => d.isDirectory()).map(d => `tsums/${d.name}/skill.test.mjs`);
const result = spawnSync(process.execPath, ['--test', 'tdk.test.mjs', ...files], { stdio: 'inherit', cwd: new URL('../', import.meta.url) });
process.exitCode = result.status ?? 1;
