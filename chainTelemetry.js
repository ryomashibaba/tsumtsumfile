const SAMPLE_LIMIT = 256;

export class ChainTelemetry {
  constructor() {
    this.overlay = null;
    this.reset();
  }

  reset() {
    this.startedAt = performance.now();
    this.metrics = Object.create(null);
    this.counts = Object.create(null);
    this.lastFrameAt = null;
    this.lastMoveAt = null;
  }

  sample(key, value) {
    const samples = this.metrics[key] ||= [];
    samples.push(value);
    if (samples.length > SAMPLE_LIMIT) samples.shift();
  }

  count(key, value = 1) {
    this.counts[key] = (this.counts[key] || 0) + value;
  }

  frame(timestamp) {
    if (this.lastFrameAt !== null) {
      const ms = timestamp - this.lastFrameAt;
      this.sample("frameMs", ms);
      if (ms > 25) this.count("longFrames");
    }
    this.lastFrameAt = timestamp;
  }

  move(timestamp, samples, distance, processingMs, examined, added, crossed, rejected) {
    if (this.lastMoveAt !== null) this.sample("moveIntervalMs", timestamp - this.lastMoveAt);
    this.lastMoveAt = timestamp;
    this.sample("coalescedPerEvent", samples);
    this.sample("moveDistance", distance);
    this.sample("moveProcessingMs", processingMs);
    this.sample("candidatesPerMove", examined);
    this.sample("addedPerMove", added);
    this.count("crossed", crossed);
    this.count("rejected", rejected);
    this.count("accepted", added);
    if (added > 1) this.count("multiAddMoves");
  }

  snapshot() {
    const result = { ...this.counts };
    for (const [key, values] of Object.entries(this.metrics)) {
      if (!values.length) continue;
      const sorted = values.slice().sort((a, b) => a - b);
      result[key] = {
        average: values.reduce((sum, value) => sum + value, 0) / values.length,
        p95: sorted[Math.ceil(sorted.length * 0.95) - 1],
        max: sorted[sorted.length - 1],
        samples: values.length
      };
    }
    result.rafHz = result.frameMs ? 1000 / result.frameMs.average : 0;
    result.pointerMoveHz = result.moveIntervalMs ? 1000 / result.moveIntervalMs.average : 0;
    return result;
  }

  show() {
    if (this.overlay || typeof document === "undefined") return;
    const panel = document.createElement("pre");
    panel.style.cssText = "position:fixed;z-index:9999;top:4px;top:max(4px,env(safe-area-inset-top,0px));right:3px;max-width:215px;max-height:180px;overflow:hidden;margin:0;padding:6px 8px;border:1px solid #8deaff99;border-radius:9px;background:#06263de8;color:#fff;font:10px/1.28 monospace;pointer-events:none;white-space:pre-wrap;box-shadow:0 3px 12px #0018";
    document.body.append(panel);
    this.overlay = panel;
    const update = () => {
      if (!panel.isConnected) return;
      const s = this.snapshot();
      panel.textContent = `CHAIN TELEMETRY\nFPS ${s.rafHz.toFixed(0)}  pointer ${s.pointerMoveHz.toFixed(0)}Hz\ncoalesced/event ${s.coalescedPerEvent?.average.toFixed(1) || '-'}\nframe avg/p95 ${s.frameMs?.average.toFixed(1) || '-'} / ${s.frameMs?.p95.toFixed(1) || '-'}ms\ninput ${s.moveProcessingMs?.average.toFixed(2) || '-'}ms  render ${s.renderMs?.average.toFixed(1) || '-'}ms\nphysics ${s.physicsMs?.average.toFixed(1) || '-'}ms\nsegment hit ${s.crossed || 0}  accepted ${s.accepted || 0}\nrejected ${s.rejected || 0}  multi-add ${s.multiAddMoves || 0}\nbacktrack ${s.backtracks || 0}  start fail ${s.startFailures || 0}`;
      setTimeout(update, 1000);
    };
    update();
  }

  hide() {
    this.overlay?.remove();
    this.overlay = null;
  }
}
