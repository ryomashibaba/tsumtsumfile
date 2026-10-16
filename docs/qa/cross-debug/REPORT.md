# Cross-repository debug — 2026-10-16

Baseline: `fe91fc4` on `origin/main`. Existing `.worktrees/` content was preserved.

## Fixed runtime defects

1. **Startup with blocked storage:** accessing the `localStorage` property can itself throw a SecurityError. Advanced settings accessed it outside the existing load/save guards, aborting Game construction. Storage acquisition now falls back to in-memory settings. A constructor regression and real Chrome startup test reproduce this boundary.
2. **Pause/resume input:** held bombs, bubble gestures and held Hook input survived pause. Releasing an old bomb contact after resuming could explode it; the CPU chain also remained selected during battle pause because its pointer-up handler rejected paused input. Solo and battle pause now cancel pointer state and active selection consistently, retaining any clear already in progress. Regression tests cover both modes and fresh input after resuming.
3. **Menu reset:** `resetGame()` left skill sessions, presentation pauses, board modifiers and paused/time-up flags behind. Reset now runs the existing runtime, board and input cleanup before discarding the old board. A regression checks all of those states, and the browser sweep checks every selectable character.

## Corrected an existing test assumption

The evolution time-up test expected immediate results after reserved work. Its automatic clear can legitimately trigger fever and add five seconds, and coin collection also delays the result. The test now starts in fever to isolate expiry and waits for the last coin to arrive. Gameplay fever and reward behavior remain intact.

## Validation

- `npm test`: **510 passed, 0 failed** (baseline: 505 passed, 1 failed outside the sandbox).
- `node scripts/tsum-validate.mjs`: four TDK definitions, all levels and 3/4/5-type lineups passed.
- `node scripts/test-tdk.mjs`: **130 passed, 0 failed**.
- JavaScript syntax checks and `git diff --check`: passed. No separate build/lint command is configured.
- Chrome cross-debug sweep: **16 selectable characters at SL6**; activation, two seconds of updates, rendering and reset; battle start/pause/resume/results/title; startup with denied storage. No page errors. See `browser-results.json`.
- Existing bomb browser suite: all seven touch interaction cases passed.
- Existing TDK browser suite: SL1–6, 3/4/5 types, mouse/touch chains, ordinary chains, touch cancellation, natural timeout, restart and clock expiry during drag, tap template and return to normal mode passed. No browser errors. See `input-results.json`.

Browser commands require Playwright. The scripts accept `TDK_PLAYWRIGHT_PATH` and `TDK_BROWSER_PATH` when using bundled dependencies. `npm run test:cross-debug:browser` starts and stops its own local server. Local-network tests were run outside the sandbox because sandboxed loopback access returned EACCES.

The sweep is a smoke test of every SL6 character and the named lifecycle boundaries; it does not exhaust every character/level/item/cheat combination or establish performance guarantees.
