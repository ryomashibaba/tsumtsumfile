# iPhone chain input QA

Open the local game on the iPhone with `?chainTelemetry` appended to the URL. The small panel is display only and does not capture touches. For detailed values, Safari Web Inspector can evaluate `window.chainTelemetry.snapshot()`. Remove the query parameter for ordinary play.

The panel shows recent average / p95 / maximum values for frame time, coalesced samples per pointermove, event distance, input processing time, candidates examined, Tsums added, rendering time, and physics time. It also shows rAF and pointermove frequency, long frames (over 25 ms), input-circle crossings, rejected crossings, backtracks, and chain start failures. Counters accumulate since page load; sampled timing values retain the latest 256 observations.

Use the same iPhone, browser orientation, and board density for each comparison with the native game. Capture a screen recording and a telemetry snapshot for each pass. Start with the default radius and backtrack values in `chainInput.js`; adjust only after comparing recordings.

| Pass | Check |
| --- | --- |
| Slow center, normal speed | Each touched Tsum selects promptly and the trailing line follows the finger. |
| Fast, very fast, 2–4 Tsums in one move | Tsums are added in travel order with no skipped valid node. Watch `addedPerMove`. |
| Outer edge only | A grazing path selects the intended Tsum without selecting adjacent colors. |
| Arc, S curve, sharp zigzag | The chain follows the actual finger path, including coalesced samples. |
| Dense same color, touching different colors | Valid neighbors connect; invalid colors are skipped. |
| Falling board, long moving chain | Selected Tsums continue moving under physics and the line follows their live positions. |
| Intentional one-node return, small finger shake | A clear return removes one node; a small shake does not. |
| Namine, Jamil, Perfume Alice, other active skill rules | Character-specific chain restrictions and distance exceptions still apply. |
| Skill button with a second finger, bomb hold | The tracing finger keeps control; the other action works as before. |
| Pointer cancel / interrupted gesture | No chain is committed after cancellation. |

The automated `chainInput.test.mjs` covers ordered multi-selection, grazing, invalid candidate skipping, long segments, coalesced curves, a missing coalesced API, backtracking, and cancellation. The existing physics, skill, and multi-touch tests cover their related invariants.
