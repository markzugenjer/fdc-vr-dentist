import { store } from '../core/util.js';

/**
 * Game settings. The defaults below are what a fresh headset starts with; players change them in
 * the game (title screen → Pengaturan) and the choice is saved on the headset.
 *
 * To change the defaults for everyone (for an event, say), edit DEFAULTS and push.
 */
export const DEFAULTS = {
  roomStyle: 'fdc', // the treatment room: 'fdc' = modelled on a real FDC clinic room | 'kartun' = the original cartoon room
  patientsPerShift: 5, // patients in one "Mulai kerja" round
  eventMinutes: 3, // length of a "Mode Event" round
  patience: 'normal', // how fast patients get bored: santai | normal | cepat
  hearts: 3, // wrong tools allowed before a patient walks out (scared patients get one less)
  pairs: 'sometimes', // patients with two problems: off | sometimes | often
  funny: true, // sneezes, phone calls, falling asleep, hiccups
  nurseHelp: true, // Suster Nana hands over the right tool when you hesitate
  hints: 3, // "Petunjuk" presses per round: shows which tool is right (0 = no hint button)
  voices: 'real', // character voices: 'real' (recorded, see scripts/voices.mjs) | 'babble' (cartoon beeps) | 'off'
  wheel: 'both', // Roda Hadiah after a round: 'both' (Mulai kerja and Mode Event) | 'event' | 'shift' | 'off'
  askName: true, // ask the player's name before Mulai kerja / Mode Event, for the Papan Skor
  cases: { scaling: true, extraction: true, filling: true, whitening: true, braces: true, rootcanal: true, checkup: true },
  types: { scared: true, chatty: true, vip: true, kid: true },
};

/**
 * Roda Hadiah prizes: the default list for every headset. `chance` is the percentage that
 * prize comes up (they should add up to 100; if not, the game scales them to 100).
 * The booth staff can change the percentages and switch prizes on/off on the headset itself:
 * Pengaturan → Hadiah roda, including how many of each prize are left (`stock`: a number, or
 * null for unlimited). The wheel counts the stock down and skips a prize once it runs out.
 * To rename prizes or change the defaults for every headset, edit this list and push.
 */
export const PRIZES = [
  { text: 'Kipas FDC Fest', chance: 70 },
  { text: 'Gunting Kuku', chance: 10 },
  { text: 'Tumbler', chance: 10 },
  { text: 'Jersey FDC Fest', chance: 2.5 },
  { text: 'Racepack FDC Fest', chance: 2.5 },
  { text: 'Kipas Tangan Elektrik', chance: 5 },
];

/** Booth details for the Foto kenangan card: the event name, the booking link, and where photos upload. */
export const BOOTH = {
  eventName: 'FDC Fest',
  link: 'https://www.fdcdentalclinic.co.id',
  // Foto kenangan download: the Apps Script web app URL (README → "Foto kenangan download").
  // Empty = no upload; the card's QR then leads to the link above.
  photoUploadUrl: '',
  photoUploadKey: 'fdc-fest',
};

/** The choices each setting cycles through in the game. */
export const CHOICES = {
  patientsPerShift: [2, 3, 5, 7, 10],
  eventMinutes: [1, 2, 3, 5],
  patience: [
    { id: 'santai', label: 'Santai', mult: 1.6 },
    { id: 'normal', label: 'Normal', mult: 1 },
    { id: 'cepat', label: 'Cepat bosan', mult: 0.65 },
  ],
  roomStyle: [
    { id: 'fdc', label: 'Klinik FDC' },
    { id: 'kartun', label: 'Kartun (lama)' },
  ],
  hearts: [2, 3, 5],
  hints: [0, 1, 3, 5, 10],
  voices: [
    { id: 'real', label: 'Suara asli' },
    { id: 'babble', label: 'Bip lucu' },
    { id: 'off', label: 'Mati' },
  ],
  wheel: [
    { id: 'both', label: 'Semua mode', modes: ['shift', 'event'] },
    { id: 'event', label: 'Mode Event saja', modes: ['event'] },
    { id: 'shift', label: 'Mulai kerja saja', modes: ['shift'] },
    { id: 'off', label: 'Mati', modes: [] },
  ],
  pairs: [
    { id: 'off', label: 'Tidak ada', chance: 0 },
    { id: 'sometimes', label: 'Kadang', chance: 0.25 },
    { id: 'often', label: 'Sering', chance: 0.5 },
  ],
};

const KEY = 'fdc.dentist.config';

const defaultPrizes = () => PRIZES.map((p) => ({ text: p.text, chance: p.chance, on: true, stock: p.stock ?? null }));

function load() {
  const saved = store.get(KEY, null) || {};
  // prizes saved on this headset, if they still match the names in PRIZES (renamed lists start fresh)
  const sameList = Array.isArray(saved.prizes) && saved.prizes.length === PRIZES.length && saved.prizes.every((p, i) => p.text === PRIZES[i].text);
  return {
    ...DEFAULTS,
    ...saved,
    prizes: sameList ? saved.prizes : defaultPrizes(),
    // older headsets saved the wheel as on/off
    voices: saved.voices === true ? 'real' : saved.voices === false ? 'off' : saved.voices ?? DEFAULTS.voices,
    wheel: saved.wheel === true ? 'both' : saved.wheel === false ? 'off' : saved.wheel ?? DEFAULTS.wheel,
    cases: { ...DEFAULTS.cases, ...(saved.cases || {}) },
    types: { ...DEFAULTS.types, ...(saved.types || {}) },
  };
}

export const config = {
  ...load(),
  save() {
    const { save, reset, resetPrizes, activePrizes, wheelFor, cycle, toggle, patienceMult, pairChance, ...data } = this;
    void save; void reset; void resetPrizes; void activePrizes; void wheelFor; void cycle; void toggle; void patienceMult; void pairChance;
    store.set(KEY, data);
  },
  reset() {
    Object.assign(this, structuredClone(DEFAULTS));
    this.prizes = defaultPrizes();
    this.save();
  },
  resetPrizes() {
    this.prizes = defaultPrizes();
    this.save();
  },
  /** The prizes that are switched on, with weights for the wheel. */
  activePrizes() {
    return this.prizes.filter((p) => p.on && p.chance > 0 && p.stock !== 0).map((p) => ({ text: p.text, weight: p.chance }));
  },
  /** Move a setting to its next choice. */
  cycle(key) {
    const list = CHOICES[key];
    if (list) {
      const ids = list.map((c) => (typeof c === 'object' ? c.id : c));
      this[key] = ids[(ids.indexOf(this[key]) + 1) % ids.length];
    } else this[key] = !this[key];
    this.save();
  },
  /** Switch a treatment or patient type on/off (at least one treatment stays on). */
  toggle(group, id) {
    const g = this[group];
    if (g[id] && group === 'cases' && Object.keys(g).filter((k) => g[k] && k !== 'checkup').length <= 1 && id !== 'checkup') return false;
    g[id] = !g[id];
    this.save();
    return true;
  },
  get patienceMult() { return CHOICES.patience.find((c) => c.id === this.patience)?.mult ?? 1; },
  /** Does this mode end with the Roda Hadiah? */
  wheelFor(mode) { return (CHOICES.wheel.find((c) => c.id === this.wheel)?.modes ?? []).includes(mode); },
  get pairChance() { return CHOICES.pairs.find((c) => c.id === this.pairs)?.chance ?? 0.25; },
};
