import { P } from './palette.js';
import { text, roundRect } from '../core/ui.js';

/**
 * Today's top 10, drawn on a canvas. Used by the big board next to the title menu (the one the
 * booth TV shows through casting) and by the TV on the clinic wall.
 * `mark` is an entry to highlight (the round that just finished).
 */
export function drawLeaderboard(c, W, H, { list, mark = null, markPlace = 0, dark = false, title = 'Papan Skor Hari Ini', footer = '' }) {
  const ink = dark ? '#ffffff' : P.ink;
  const soft = dark ? 'rgba(255,255,255,0.65)' : P.muted;
  const pad = W * 0.06;
  text(c, title, pad, H * 0.1, { size: H * 0.062, weight: 900, color: dark ? P.mint : P.mintDark, maxWidth: W - pad * 2 });
  const top = H * 0.17;
  const rowH = (H * 0.74) / 10;
  if (!list.length) {
    text(c, 'Belum ada skor hari ini.', W / 2, top + rowH * 3, { size: H * 0.05, weight: 700, color: soft, align: 'center' });
    text(c, 'Jadilah yang pertama!', W / 2, top + rowH * 4, { size: H * 0.05, weight: 800, color: P.pinkDeep, align: 'center' });
  }
  const MEDAL = ['#f7c95e', '#cfd8dc', '#e0a77a'];
  const same = (a, b) => a && b && a.at === b.at && a.score === b.score;
  // the player who just finished outside the top 10 gets their own line in the last slot
  const rows = list.slice(0, 10).map((e, i) => ({ e, place: i + 1 }));
  if (mark && markPlace > 10 && !rows.some((r) => same(r.e, mark))) rows.splice(9, 1, { e: mark, place: markPlace });
  rows.forEach(({ e, place }, i) => {
    const y = top + i * rowH;
    const isMark = same(e, mark);
    // stripes keep each name lined up with its score, even on a tilted board
    roundRect(c, pad * 0.5, y + rowH * 0.06, W - pad, rowH * 0.88, rowH * 0.3);
    c.fillStyle = isMark ? (dark ? 'rgba(246,185,201,0.35)' : P.pinkSoft) : i % 2 ? 'rgba(0,0,0,0)' : dark ? 'rgba(255,255,255,0.06)' : '#f3f7f4';
    c.fill();
    if (place !== i + 1) text(c, '···', W / 2, y - rowH * 0.05, { size: rowH * 0.4, weight: 900, color: soft, align: 'center' });
    const cy = y + rowH * 0.5;
    if (place <= 3) {
      c.beginPath();
      c.arc(pad + rowH * 0.32, cy, rowH * 0.32, 0, Math.PI * 2);
      c.fillStyle = MEDAL[place - 1];
      c.fill();
    }
    text(c, `${place}`, pad + rowH * 0.32, cy + rowH * 0.15, { size: rowH * (place > 99 ? 0.32 : 0.42), weight: 900, color: place <= 3 ? P.ink : soft, align: 'center' });
    text(c, e.name || 'Dokter Tamu', pad + rowH * 0.85, cy + rowH * 0.15, { size: rowH * 0.42, weight: isMark ? 900 : 700, color: ink, maxWidth: W * 0.55 });
    text(c, `${e.score}`, W - pad, cy + rowH * 0.16, { size: rowH * 0.46, weight: 900, color: place === 1 ? '#d9a32c' : ink, align: 'right' });
  });
  if (footer) text(c, footer, W / 2, H * 0.955, { size: H * 0.034, weight: 700, color: soft, align: 'center', maxWidth: W - pad * 2 });
}

/** "budi santoso" → "Budi Santoso" */
export function niceName(raw) {
  return raw.trim().replace(/\s+/g, ' ').toLowerCase().replace(/(^|\s)\S/g, (m) => m.toUpperCase());
}
