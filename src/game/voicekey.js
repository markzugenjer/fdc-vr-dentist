/**
 * Shared by the game and scripts/voices.mjs: how a spoken line is matched to its audio file.
 *
 * voiceKey: case, punctuation and stage directions in brackets don't matter, so
 * "Halo, Dok!" and "halo dok" share one recording.
 * speakable: the text as it is sent to the voice service (no "(main HP)" stage directions,
 * no "~"), or '' when there is nothing to say out loud.
 */
export function speakable(text) {
  const t = String(text)
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[~×]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!/[a-zA-Z]/.test(t)) return '';
  if (/^z+\.*$/i.test(t)) return ''; // "Zzz..." is a snore, not a word
  return t;
}

export function voiceKey(text) {
  return speakable(text)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Short stable file name for a key (FNV-1a hash), e.g. "a3f09c1e". */
export function voiceFile(key) {
  let h = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

/** Split a line the game built from several recorded lines ("A! Terus... b.") into sentences. */
export function sentences(text) {
  return String(text).split(/(?<=[.!?…])\s+/).map((s) => s.trim()).filter(Boolean);
}
