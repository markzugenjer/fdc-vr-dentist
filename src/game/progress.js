import { store } from '../core/util.js';

/**
 * What the game remembers on the headset: stars earned over all shifts (ranks and unlocks),
 * the score board, and whether the tutorial was played.
 */
const STARS_KEY = 'fdc.dentist.totalStars';
const BOARD_KEY = 'fdc.dentist.board';
const TUT_KEY = 'fdc.dentist.tutorialDone';

export const RANKS = [
  { stars: 0, name: 'Dokter Magang' },
  { stars: 8, name: 'Dokter Muda' },
  { stars: 20, name: 'Dokter Hebat' },
  { stars: 40, name: 'Dokter Spesialis' },
  { stars: 70, name: 'Dokter Gigi Legenda' },
];

export const UNLOCKS = [
  { stars: 5, id: 'balloons', name: 'Balon pesta di ruangan' },
  { stars: 12, id: 'golddrill', name: 'Bor Gigi Emas' },
  { stars: 25, id: 'trophy', name: 'Piala di rak' },
  { stars: 40, id: 'confetti', name: 'Hujan konfeti untuk pasien sempurna' },
];

export const progress = {
  get stars() { return store.get(STARS_KEY, 0); },
  addStars(n) {
    const before = this.stars;
    const after = before + n;
    store.set(STARS_KEY, after);
    // what got unlocked by this batch of stars
    return UNLOCKS.filter((u) => before < u.stars && after >= u.stars);
  },
  has(id) { const u = UNLOCKS.find((x) => x.id === id); return !!u && this.stars >= u.stars; },
  rank(stars = this.stars) { return [...RANKS].reverse().find((r) => stars >= r.stars); },
  nextRank(stars = this.stars) { return RANKS.find((r) => r.stars > stars) || null; },
  nextUnlock(stars = this.stars) { return UNLOCKS.find((u) => u.stars > stars) || null; },

  get tutorialDone() { return store.get(TUT_KEY, false); },
  set tutorialDone(v) { store.set(TUT_KEY, !!v); },

  /** Score board: every finished shift / event round. */
  board() { return store.get(BOARD_KEY, []); },
  addScore(score, mode) {
    const list = this.board();
    const entry = { score, mode, at: Date.now(), day: today() };
    list.push(entry);
    list.sort((a, b) => b.score - a.score);
    store.set(BOARD_KEY, list.slice(0, 50));
    return entry;
  },
  topToday(n = 5) { return this.board().filter((e) => e.day === today()).slice(0, n); },
  best(mode) { return this.board().filter((e) => !mode || e.mode === mode)[0]?.score || 0; },
};

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}
