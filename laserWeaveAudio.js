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
      if (this.context.state === 'suspended') this.context.resume()?.catch(() => {});
    } catch {
      this.failed = true;
    }
  }

  tone(frequency, duration, gain, endFrequency = frequency, shape = 'sine') {
    const ctx = this.context;
    if (!ctx || ctx.state !== 'running' || this.voices.size >= 12) return;
    const oscillator = ctx.createOscillator();
    const envelope = ctx.createGain();
    const now = ctx.currentTime;
    oscillator.type = shape;
    oscillator.frequency.setValueAtTime(frequency, now);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, endFrequency), now + duration);
    envelope.gain.setValueAtTime(0, now);
    envelope.gain.linearRampToValueAtTime(gain, now + 0.004);
    envelope.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    oscillator.connect(envelope);
    envelope.connect(ctx.destination);
    this.voices.add(oscillator);
    oscillator.onended = () => {
      this.voices.delete(oscillator);
      oscillator.disconnect();
      envelope.disconnect();
    };
    oscillator.start(now);
    oscillator.stop(now + duration + 0.01);
  }

  play(cue, width = 29) {
    if (this.game.skillVisualsEnabled === false || this.game.paused || this.game.role === 'cpu') return;
    try {
      if (cue === 'activate') {
        this.tone(740, 0.17, 0.025, 1110, 'triangle');
        this.tone(1480, 0.12, 0.012, 1110);
      } else if (cue === 'hold') {
        this.tone(960, 0.065, 0.018, 720);
      } else if (cue === 'fire') {
        const weight = Math.min(1, Math.max(0, (width - 19) / 120));
        this.tone(1800, 0.09, 0.024, 240, 'triangle');
        this.tone(3000, 0.045, 0.01, 800, 'sawtooth');
        this.tone(135 - 35 * weight, 0.12 + 0.035 * weight, 0.03 + 0.015 * weight, 55);
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
