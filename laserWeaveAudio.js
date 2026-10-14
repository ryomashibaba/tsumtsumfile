// Short synthesized cues; no network assets or audio work before user input.
export class LaserWeaveAudio {
  constructor(game) {
    this.game = game;
    this.context = null;
    this.failed = false;
    this.voices = new Set();
  }

  unlock() {
    if (this.failed || this.game.role === 'cpu' || this.game.skillVisualsEnabled === false) return;
    try {
      const AudioContextClass = globalThis.AudioContext || globalThis.webkitAudioContext;
      if (!AudioContextClass) return;
      this.context ||= new AudioContextClass();
      if (!this.output) {
        const limiter = this.context.createDynamicsCompressor();
        limiter.threshold.value = -16; limiter.knee.value = 10; limiter.ratio.value = 8;
        limiter.attack.value = 0.003; limiter.release.value = 0.12;
        const master = this.context.createGain(); master.gain.value = 0.65;
        master.connect(limiter); limiter.connect(this.context.destination);
        this.output = master;
      }
      if (this.context.state === 'suspended') this.context.resume()?.catch(() => {});
    } catch {
      this.failed = true;
    }
  }

  tone(frequency, duration, gain, endFrequency = frequency, shape = 'sine', delay = 0) {
    const ctx = this.context;
    if (!ctx || ctx.state !== 'running' || this.voices.size >= 12) return;
    const oscillator = ctx.createOscillator();
    const envelope = ctx.createGain();
    const now = ctx.currentTime + delay;
    oscillator.type = shape;
    oscillator.frequency.setValueAtTime(frequency, now);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, endFrequency), now + duration);
    envelope.gain.setValueAtTime(0, now);
    envelope.gain.linearRampToValueAtTime(gain, now + 0.004);
    envelope.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    oscillator.connect(envelope);
    envelope.connect(this.output || ctx.destination);
    this.voices.add(oscillator);
    oscillator.onended = () => {
      this.voices.delete(oscillator);
      oscillator.disconnect();
      envelope.disconnect();
    };
    oscillator.start(now);
    oscillator.stop(now + duration + 0.01);
  }

  impact(duration = 0.2, gain = 0.035) {
    const ctx = this.context;
    if (!ctx || ctx.state !== 'running' || this.voices.size >= 12) return;
    const buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * duration), ctx.sampleRate);
    const samples = buffer.getChannelData(0);
    for (let i = 0; i < samples.length; i++) samples[i] = (Math.random() * 2 - 1) * (1 - i / samples.length) ** 2;
    const source = ctx.createBufferSource(), filter = ctx.createBiquadFilter(), envelope = ctx.createGain();
    source.buffer = buffer; filter.type = 'lowpass'; filter.frequency.setValueAtTime(1900, ctx.currentTime);
    filter.frequency.exponentialRampToValueAtTime(140, ctx.currentTime + duration); envelope.gain.value = gain;
    source.connect(filter); filter.connect(envelope); envelope.connect(this.output || ctx.destination);
    this.voices.add(source);
    source.onended = () => { this.voices.delete(source); source.disconnect(); filter.disconnect(); envelope.disconnect(); };
    source.start();
  }

  play(cue) {
    if (this.game.skillVisualsEnabled === false || this.game.paused || this.game.role === 'cpu') return;
    try {
      if (cue === 'activate') {
        this.tone(740, 0.17, 0.025, 1110, 'triangle');
        this.tone(1480, 0.12, 0.012, 1110);
      } else if (cue === 'thread' || cue === 'fire') {
        this.tone(2100, 0.11, 0.026, 340, 'triangle');
        this.tone(3500, 0.045, 0.008, 1050, 'sawtooth');
        this.tone(140, 0.17, 0.045, 58);
      } else if (cue === 'cross') {
        this.tone(95, 0.28, 0.075, 32);
        this.tone(480, 0.1, 0.025, 110, 'triangle'); this.impact(0.23, 0.055);
      } else if (cue === 'zone') {
        [660, 990, 1320].forEach((f, i) => this.tone(f, 0.22, 0.014, f * 1.015, 'sine', i * 0.04));
      } else if (cue === 'charge') {
        this.tone(220, 0.26, 0.026, 1760, 'triangle'); this.tone(55, 0.26, 0.04, 100);
      } else if (cue === 'ignition') {
        this.impact(0.35, 0.065); this.tone(110, 0.42, 0.08, 30);
        this.tone(2600, 0.17, 0.025, 380, 'triangle');
        this.tone(660, 0.38, 0.018, 330); this.tone(990, 0.38, 0.012, 495);
      } else if (cue === 'cascade') {
        this.tone(2600, 0.13, 0.025, 400, 'triangle');
        this.tone(2100, 0.15, 0.022, 260, 'triangle', 0.045);
        this.tone(85, 0.28, 0.065, 35); this.impact(0.18, 0.04);
      } else if (cue === 'release') {
        this.tone(1320, 0.3, 0.018, 660); this.tone(660, 0.38, 0.016, 330);
      }
    } catch {
      // An unavailable/closed audio device must never interrupt a trace.
      this.failed = true;
    }
  }

  stop() {
    for (const voice of this.voices) {
      try { voice.stop(); } catch { /* Already stopped. */ }
    }
    this.voices.clear();
  }
}
