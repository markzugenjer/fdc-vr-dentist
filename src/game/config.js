import { store } from '../core/util.js';

/**
 * Game settings. The defaults below are what a fresh headset starts with; players change them in
 * the game (title screen → Pengaturan) and the choice is saved on the headset.
 *
 * To change the defaults for everyone (for an event, say), edit DEFAULTS and push.
 */
export const DEFAULTS = {
  patientsPerShift: 5, // patients in one "Mulai kerja" round
  eventMinutes: 3, // length of a "Mode Event" round
  patience: 'normal', // how fast patients get bored: santai | normal | cepat
  hearts: 3, // wrong tools allowed before a patient walks out (scared patients get one less)
  pairs: 'sometimes', // patients with two problems: off | sometimes | often
  funny: true, // sneezes, phone calls, falling asleep, hiccups
  nurseHelp: true, // Suster Nana hands over the right tool when you hesitate
  hints: 3, // "Petunjuk" presses per round: shows which tool is right (0 = no hint button)
  voices: true, // gibberish character voices
  cases: { scaling: true, extraction: true, filling: true, whitening: true, braces: true, rootcanal: true, checkup: true },
  types: { scared: true, chatty: true, vip: true, kid: true },
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
  hearts: [2, 3, 5],
  hints: [0, 1, 3, 5, 10],
  pairs: [
    { id: 'off', label: 'Tidak ada', chance: 0 },
    { id: 'sometimes', label: 'Kadang', chance: 0.25 },
    { id: 'often', label: 'Sering', chance: 0.5 },
  ],
};

const KEY = 'fdc.dentist.config';

function load() {
  const saved = store.get(KEY, null) || {};
  return {
    ...DEFAULTS,
    ...saved,
    cases: { ...DEFAULTS.cases, ...(saved.cases || {}) },
    types: { ...DEFAULTS.types, ...(saved.types || {}) },
  };
}

export const config = {
  ...load(),
  save() {
    const { save, reset, cycle, toggle, patienceMult, pairChance, ...data } = this;
    void save; void reset; void cycle; void toggle; void patienceMult; void pairChance;
    store.set(KEY, data);
  },
  reset() {
    Object.assign(this, structuredClone(DEFAULTS));
    this.save();
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
  get pairChance() { return CHOICES.pairs.find((c) => c.id === this.pairs)?.chance ?? 0.25; },
};
