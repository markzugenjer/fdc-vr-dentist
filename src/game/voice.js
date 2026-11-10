import { voiceKey, voiceFile, sentences } from './voicekey.js';

/**
 * Recorded character voices (made with ElevenLabs by scripts/voices.mjs, stored in public/voices/).
 *
 *   voices.speak(speaker, 'nana', 'Halo, Dok!', { rate, priority }) → duration in s, or 0 if there is no recording
 *
 * A line the game builds from several recorded lines (a patient with two complaints) plays them
 * one after another. The compressed files are fetched in the background after the game starts and
 * decoded when first needed, so memory stays small. Each speaker says one line at a time; the
 * waiting-room chatter (priority 'low') only talks when nobody important is speaking.
 */
export class Voices {
  constructor(sfx) {
    this.sfx = sfx;
    this.index = null;
    this.raw = new Map(); // url → ArrayBuffer promise
    this.decoded = new Map(); // url → AudioBuffer (most recent ~80)
    this.playing = new Map(); // speaker → { srcs, end }
    fetch('voices/index.json')
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { this.index = j; if (j) setTimeout(() => this.prefetch(), 4000); })
      .catch(() => {});
  }

  get ready() { return !!this.index; }

  /** One of the recorded variants of a voice ('woman', 'woman2'...), picked by seed so a patient keeps theirs. */
  variant(base, seed = 0) {
    const names = Object.keys(this.index?.voices || {}).filter((v) => v === base || new RegExp(`^${base}\\d+$`).test(v));
    return names.length ? names[seed % names.length] : base;
  }

  /** The files for this line in this voice (one per sentence when the whole line isn't recorded), or null. */
  files(voice, text) {
    const v = this.index?.voices?.[voice];
    if (!v) return null;
    const whole = v[voiceKey(text)];
    if (whole) return [whole];
    const parts = sentences(text).filter((s) => voiceKey(s));
    if (parts.length < 2) return null;
    const files = parts.map((s) => v[voiceKey(s)]);
    return files.every(Boolean) ? files : null;
  }

  /** Download every recording in the background (small mp3s), so lines start without a delay. */
  async prefetch() {
    for (const [voice, map] of Object.entries(this.index.voices)) {
      for (const f of Object.values(map)) {
        await this.load(`voices/${voice}/${f}.mp3`).catch(() => {});
        await new Promise((r) => setTimeout(r, 30));
      }
    }
  }

  load(url) {
    if (!this.raw.has(url)) this.raw.set(url, fetch(url).then((r) => { if (!r.ok) throw new Error(url); return r.arrayBuffer(); }));
    return this.raw.get(url);
  }

  async buffer(url) {
    if (this.decoded.has(url)) return this.decoded.get(url);
    const bytes = await this.load(url);
    const buf = await this.sfx.ctx.decodeAudioData(bytes.slice(0));
    this.decoded.set(url, buf);
    if (this.decoded.size > 80) this.decoded.delete(this.decoded.keys().next().value);
    return buf;
  }

  busy(except) {
    const now = this.sfx.ctx?.currentTime ?? 0;
    for (const [who, p] of this.playing) if (who !== except && p.end > now) return true;
    return false;
  }

  stop(speaker) {
    const p = this.playing.get(speaker);
    if (!p) return;
    for (const s of p.srcs) { try { s.stop(); } catch { /* already stopped */ } }
    this.playing.delete(speaker);
  }

  /**
   * Play a line. Returns a promise of its length in seconds (0 = not recorded: use the babble).
   * rate: 1 = as recorded (patients get 0.94–1.08 so two patients with the same voice differ).
   */
  async speak(speaker, voice, text, { rate = 1, priority = 'high', volume = 1 } = {}) {
    const c = this.sfx.ctx;
    const files = this.files(voice, text);
    if (!c || !files) return 0;
    if (priority === 'low' && this.busy(speaker)) return -1; // stay quiet: someone important is talking
    let bufs;
    try { bufs = await Promise.all(files.map((f) => this.buffer(`voices/${voice}/${f}.mp3`))); } catch { return 0; }
    this.stop(speaker);
    const g = c.createGain();
    g.gain.value = volume;
    g.connect(this.sfx.master);
    let t = c.currentTime + 0.02;
    const srcs = [];
    for (const b of bufs) {
      const s = c.createBufferSource();
      s.buffer = b;
      s.playbackRate.value = rate;
      s.connect(g);
      s.start(t);
      srcs.push(s);
      t += b.duration / rate + 0.12;
    }
    const dur = t - c.currentTime;
    this.playing.set(speaker, { srcs, end: t });
    return dur;
  }
}
