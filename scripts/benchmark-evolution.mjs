// Synthetic input timing on unmodified real boards. This measures the prototype,
// not human skill or fun. All clears, coins, physics and clocks are real Game code.
import { writeFile, mkdir } from 'node:fs/promises';
import { makeTdkGame } from '../tdk/testing.mjs';
import definition from '../tsums/evolutionTsum/definition.js';
const originalLog = console.log;
console.log = () => {};
const results = [];
for (const types of [3, 5]) for (const strategy of ['short', 'long', 'top']) for (const seed of [125, 926]) {
  let state = seed;
  const rng = () => ((state = (1664525 * state + 1013904223) >>> 0) / 4294967296);
  const originalRandom = Math.random;
  Math.random = rng;
  try {
    const game = makeTdkGame(definition, 6, types);
    game.random = rng; game.skillVisualsEnabled = false;
    for (let i = 0; i < 180; i++) game.update(1 / 60);
    game.skillRuntime.activateNow('evolutionTsum', 6);
    let trace = null, cursor = 0, delay = 0;
    for (let frame = 0; frame < 3600 && game.getActiveSkillSession('evolutionTsum'); frame++) {
      game.update(1 / 60); delay -= 1 / 60;
      if (trace && delay <= 0) {
        if (cursor < trace.length && !trace[cursor].dead && !trace[cursor].removing) {
          game.extendChain(trace[cursor++]); delay = 0.055;
        } else { game.finishChain(); trace = null; delay = 0.12; }
      } else if (!trace && delay <= 0 && !game.isGameplayInputLocked() && !game.pendingClear) {
        const live = game.getStrongestModeChainNodes();
        let best = [], bestScore = -Infinity;
        for (const start of live) {
          const rule = game.getChainBehaviorForStart(start);
          if (!rule) continue;
          const same = live.filter(n => rule.allowedTypeIds.has(game.boardState.getResolvedType(n).id));
          const chain = game.findStrongestModeGreedyChain(start, same, rule, strategy === 'short' ? 3 : 18);
          if (chain.length < 3) continue;
          const top = Math.min(...chain.map(n => n.y));
          const score = chain.length + (strategy === 'top' ? (580 - top) / 30 : 0);
          if (score > bestScore) { best = chain; bestScore = score; }
        }
        if (best.length >= 3 && game.startChain(best[0], best[0])) { trace = best; cursor = 1; delay = 0.055; }
        else delay = 0.12;
      }
    }
    if (!game.evolutionLastMetrics) throw new Error('benchmark did not finish');
    results.push({ strategy, types, seed, ...game.evolutionLastMetrics });
  } finally { Math.random = originalRandom; }
}
console.log = originalLog;
await mkdir('docs/qa/evolution-v1', { recursive: true });
await writeFile('docs/qa/evolution-v1/simulation.json', JSON.stringify({
  method: 'SL6 real Game simulation, 60Hz, seeded board, 55ms/node + 120ms decisions; no bombs, no board edits, no ability shortcuts. short=3 nodes; long<=18; top favors upper chains. Not human measurements.', results
}, null, 2));
console.table(results.map(r => ({ types: r.types, strategy: r.strategy, seed: r.seed,
  P2: r.phase2AtSec?.toFixed(2), P3: r.phase3AtSec?.toFixed(2), ODinput: r.phase3PlayableSec.toFixed(2),
  clears: r.realClears, coins: r.coins, lines: r.lines, stop: r.stoppedSec.toFixed(2), gauge: r.gauge.toFixed(2) })));
