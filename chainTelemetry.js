const SAMPLE_LIMIT = 256;

export class ChainTelemetry {
  constructor() {
    this.startedAt = performance.now();
    this.metrics = Object.create(null);
    this.counts = Object.create(null);
    this.lastFrameAt = null;
    this.lastMoveAt = null;
    this.overlay = null;
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
    if (typeof document === "undefined") return;
    const panel = document.createElement("pre");
    panel.style.cssText = "position:fixed;z-index:9999;top:env(safe-area-inset-top);right:2px;max-width:55vw;max-height:38vh;overflow:auto;margin:0;padding:5px;background:#001b; color:#fff;font:10px/1.3 monospace;pointer-events:none;white-space:pre-wrap";
    document.body.append(panel);
    this.overlay = panel;
    const update = () => {
      if (!panel.isConnected) return;
      const s = this.snapshot();
      const fmt = (name) => s[name] ? `${s[name].average.toFixed(1)}/${s[name].p95.toFixed(1)}/${s[name].max.toFixed(1)}` : "-";
      panel.textContent = `rAF ${s.rafHz.toFixed(0)}Hz  frame avg/p95/max ${fmt("frameMs")} long ${s.longFrames || 0}\nmove ${s.pointerMoveHz.toFixed(0)}Hz  coalesced ${fmt("coalescedPerEvent")}\ndistance ${fmt("moveDistance")} process ${fmt("moveProcessingMs")}\ncandidates ${fmt("candidatesPerMove")} added ${fmt("addedPerMove")}\ncrossed ${s.crossed || 0} rejected ${s.rejected || 0} backtrack ${s.backtracks || 0} startFail ${s.startFailures || 0}\nrender ${fmt("renderMs")} physics ${fmt("physicsMs")}`;
      setTimeout(update, 1000);
    };
    update();
  }
}
