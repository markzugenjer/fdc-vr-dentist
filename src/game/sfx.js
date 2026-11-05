/**
 * Every sound in the game is synthesized: no audio files to download.
 *   sfx.play('ouch')            one-shot
 *   sfx.loop('drill', true)     start / stop a looping sound (drill, scaler, suction, light)
 */
export class Sfx {
  constructor() {
    this.ctx = null;
    this.loops = new Map();
    this.noise = null;
  }

  /** Browsers only allow sound after the user clicks or presses something. */
  unlock() {
    try {
      if (!this.ctx) {
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        this.master = this.ctx.createGain();
        this.master.gain.value = 0.9;
        this.master.connect(this.ctx.destination);
        const len = this.ctx.sampleRate;
        this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
        const d = this.noise.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      }
      if (this.ctx.state === 'suspended') this.ctx.resume();
    } catch {
      /* audio unavailable */
    }
  }

  tone(f1, f2, dur, type = 'sine', vol = 0.08, delay = 0) {
    const c = this.ctx;
    if (!c) return;
    const t = c.currentTime + delay;
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(f1, t);
    if (f2) osc.frequency.exponentialRampToValueAtTime(f2, t + dur);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(vol, t + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(gain).connect(this.master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  burst(dur, freq, q = 1, vol = 0.1, delay = 0) {
    const c = this.ctx;
    if (!c) return;
    const t = c.currentTime + delay;
    const src = c.createBufferSource();
    src.buffer = this.noise;
    const f = c.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = freq;
    f.Q.value = q;
    const g = c.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.master);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.02);
  }

  play(kind) {
    switch (kind) {
      case 'click': this.tone(620, 900, 0.07, 'triangle', 0.06); break;
      case 'pick': this.tone(500, 1100, 0.1, 'sine', 0.08); this.tone(1400, null, 0.05, 'triangle', 0.03, 0.06); break;
      case 'drop': this.tone(700, 380, 0.12, 'triangle', 0.06); break;
      case 'tick': this.tone(1500, null, 0.04, 'sine', 0.035); break;
      case 'step-done': [784, 988, 1319].forEach((f, i) => this.tone(f, null, 0.18, 'triangle', 0.07, i * 0.07)); break;
      case 'pop': this.tone(300, 1200, 0.09, 'sine', 0.12); this.burst(0.06, 2500, 3, 0.05); break;
      case 'ouch': this.tone(1100, 420, 0.32, 'square', 0.05); this.tone(1300, 500, 0.3, 'triangle', 0.05, 0.02); break;
      case 'grr': this.tone(140, 95, 0.45, 'sawtooth', 0.07); this.tone(150, 110, 0.4, 'square', 0.03, 0.08); break;
      case 'heart': this.tone(520, 260, 0.25, 'triangle', 0.07); break;
      case 'door': this.burst(0.5, 400, 0.7, 0.05); this.tone(180, 140, 0.35, 'triangle', 0.03); break;
      case 'door-close': this.burst(0.18, 300, 1, 0.08); this.tone(120, 70, 0.15, 'sine', 0.1); break;
      case 'footstep': this.burst(0.07, 900, 1.5, 0.025); break;
      case 'sparkle': [1568, 2093, 2637].forEach((f, i) => this.tone(f, null, 0.12, 'sine', 0.035, i * 0.05)); break;
      case 'star': this.tone(1046, 2093, 0.18, 'triangle', 0.07); break;
      case 'win': [523, 659, 784, 1047, 1319].forEach((f, i) => this.tone(f, null, 0.24, 'triangle', 0.07, i * 0.1)); break;
      case 'sad': [392, 370, 349, 262].forEach((f, i) => this.tone(f, f * 0.97, i === 3 ? 0.7 : 0.3, 'sawtooth', 0.035, i * 0.32)); break;
      case 'hello': this.tone(600, 900, 0.12, 'sine', 0.05); this.tone(900, 700, 0.14, 'sine', 0.05, 0.12); break;
      case 'yay': [660, 880, 1100].forEach((f, i) => this.tone(f, f * 1.2, 0.12, 'sine', 0.05, i * 0.08)); break;
      default: break;
    }
  }

  /** Start (on = true) or stop a looping tool sound. Safe to call every frame. */
  loop(kind, on) {
    const c = this.ctx;
    if (!c) return;
    const cur = this.loops.get(kind);
    if (on && cur) return;
    if (!on) {
      if (!cur) return;
      const t = c.currentTime;
      cur.gain.gain.cancelScheduledValues(t);
      cur.gain.gain.setValueAtTime(cur.gain.gain.value, t);
      cur.gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
      for (const n of cur.nodes) n.stop?.(t + 0.15);
      this.loops.delete(kind);
      return;
    }
    const t = c.currentTime;
    const gain = c.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.connect(this.master);
    const nodes = [];
    const osc = (type, f) => { const o = c.createOscillator(); o.type = type; o.frequency.value = f; nodes.push(o); return o; };
    let vol = 0.05;
    if (kind === 'drill') {
      const o = osc('sawtooth', 820);
      const lfo = osc('sine', 18);
      const lg = c.createGain(); lg.gain.value = 40;
      lfo.connect(lg).connect(o.frequency);
      const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1700; f.Q.value = 2;
      o.connect(f).connect(gain);
      vol = 0.06;
    } else if (kind === 'scaler') {
      const o = osc('square', 2600);
      const f = c.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 1800;
      o.connect(f).connect(gain);
      vol = 0.018;
    } else if (kind === 'suction' || kind === 'water') {
      const src = c.createBufferSource(); src.buffer = this.noise; src.loop = true; nodes.push(src);
      const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = kind === 'water' ? 3000 : 1200; f.Q.value = 0.8;
      src.connect(f).connect(gain);
      vol = 0.08;
    } else {
      const o = osc('sine', 330);
      const o2 = osc('sine', 495);
      o.connect(gain); o2.connect(gain);
      vol = 0.03;
    }
    gain.gain.exponentialRampToValueAtTime(vol, t + 0.08);
    for (const n of nodes) n.start(t);
    this.loops.set(kind, { gain, nodes });
  }

  stopAll() { for (const k of [...this.loops.keys()]) this.loop(k, false); }
}
