// Read-only source comparison; only disposable test copies gain post-sampling diagnostics.
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir, cpus, platform, release } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';

const repo = fileURLToPath(new URL('../../../', import.meta.url));
const output = process.argv[2] || fileURLToPath(new URL('./physics-results.json', import.meta.url));
const git = (...args) => execFileSync('git', args, { cwd: repo, encoding: 'utf8' }).trim();
const snapshot = () => {
  try {
    return JSON.parse(execFileSync('powershell.exe', ['-NoProfile', '-Command',
      'Get-Process | Where-Object { $null -ne $_.CPU } | Select-Object Id,ProcessName,CPU | ConvertTo-Json -Compress'], { encoding: 'utf8' }));
  } catch (error) { return { unavailable: error.message }; }
};
const root = mkdtempSync(join(tmpdir(), 'tdk-v12-physics-'));
if (!resolve(root).startsWith(resolve(tmpdir()) + sep) || !root.includes('tdk-v12-physics-')) throw new Error('Unsafe temporary path');
const sources = {};
const results = [];
const environment = { utc: new Date().toISOString(), platform: platform(), release: release(),
  node: process.version, cpu: cpus()[0]?.model, logicalCpus: cpus().length,
  thresholdMs: 4, steps: 600, bodies: 45, explicitWarmupSteps: 0,
  concurrency: 'one child Node process at a time; no concurrent test/benchmark jobs from this task',
  processSnapshotScope: 'Get-Process accessible CPU counters; not a complete system utilization trace',
  startProcesses: snapshot() };
try {
  for (const [label, ref] of [['v1.0', '170c737'], ['v1.1', 'ab66ad3']]) {
    const test = git('show', `${ref}:tsumPhysics.test.mjs`) + '\n';
    const physics = git('show', `${ref}:tsumPhysics.js`) + '\n';
    sources[label] = { commit: git('rev-parse', ref), test, physics,
      testSha256: createHash('sha256').update(test).digest('hex'),
      physicsSha256: createHash('sha256').update(physics).digest('hex') };
  }
  for (const mode of ['original', 'diagnostic']) {
    const repetitions = mode === 'original' ? 1 : 3;
    for (let repetition = 1; repetition <= repetitions; repetition++) {
      const order = repetition % 2 ? ['v1.0', 'v1.1'] : ['v1.1', 'v1.0'];
      for (const label of order) {
        const source = sources[label];
        writeFileSync(join(root, 'tsumPhysics.js'), source.physics);
        const marker = '  const emergencyRatio = TSUM_PHYSICS_TUNING.materials.tsumTsum.emergencyDistanceRatio;';
        if (!source.test.includes(marker)) throw new Error('Diagnostic insertion marker missing');
        const diagnostic = "  console.log('PHYSICS_SAMPLE ' + JSON.stringify({ p95, first60P95: samples.slice(0, 60).sort((a,b)=>a-b)[57], last540P95: samples.slice(60).sort((a,b)=>a-b)[513] }));\n";
        writeFileSync(join(root, 'tsumPhysics.test.mjs'), mode === 'original' ? source.test : source.test.replace(marker, diagnostic + marker));
        const before = snapshot();
        const utc = new Date().toISOString();
        const start = performance.now();
        const run = spawnSync(process.execPath, ['--test', '--test-name-pattern=45-body ten-second', 'tsumPhysics.test.mjs'], { cwd: root, encoding: 'utf8' });
        const wallMs = performance.now() - start;
        const after = snapshot();
        const combined = run.stdout + run.stderr;
        const match = combined.match(/PHYSICS_SAMPLE (\{[^\r\n]+\})/);
        const cpuDeltas = Array.isArray(before) && Array.isArray(after) ? after.map(p => {
          const old = before.find(b => b.Id === p.Id && b.ProcessName === p.ProcessName);
          return { process: p.ProcessName, cpuSecondsDelta: old ? +(p.CPU - old.CPU).toFixed(3) : null };
        }).filter(p => p.cpuSecondsDelta > 0).sort((a,b)=>b.cpuSecondsDelta-a.cpuSecondsDelta).slice(0, 10) : null;
        const entry = { label, mode, repetition, utc, wallMs: +wallMs.toFixed(2), status: run.status,
          ...(match ? JSON.parse(match[1]) : {}), cpuDeltas, stdout: run.stdout, stderr: run.stderr };
        results.push(entry);
        console.log(JSON.stringify({ label, mode, repetition, status: entry.status, p95: entry.p95, wallMs: entry.wallMs }));
      }
    }
  }
  const metadata = Object.fromEntries(Object.entries(sources).map(([label, { test, physics, ...rest }]) => [label, rest]));
  writeFileSync(output, JSON.stringify({ environment, sources: metadata,
    identicalTest: sources['v1.0'].test === sources['v1.1'].test,
    identicalPhysics: sources['v1.0'].physics === sources['v1.1'].physics,
    instrumentation: 'diagnostic copies print p95 and first60/last540 p95 after sampling; all assertions and the 4ms threshold remain unchanged; original mode adds no diagnostics',
    results, endProcesses: snapshot() }, null, 2) + '\n');
} finally { rmSync(root, { recursive: true, force: true }); }
