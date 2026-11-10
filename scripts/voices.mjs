#!/usr/bin/env node
/**
 * Character voices with ElevenLabs.
 *
 *   npm run voices:list    every line the game says, per voice, with the character count (no API calls)
 *   npm run voices         make the missing audio files (needs the API key, see below)
 *
 * Setup (once):
 *   1. voices.config.json: the ElevenLabs voice ID for each character voice (nana, kid, woman, man).
 *      woman / man can list several IDs: each becomes a voice (woman, woman2, ...) and patients get one each.
 *   2. .env.local (never committed): ELEVENLABS_API_KEY=your-key
 *
 * The files go to public/voices/<voice>/<hash>.mp3 with an index (public/voices/index.json) the
 * game reads. Lines that already have a file are skipped, so after editing a few lines in the game
 * only the new ones are made (and only those cost credits). Delete a file to make it again.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} }; // config.js reads saved settings
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { CASES, LINES } = await import('../src/game/cases.js');
const { TOOL_INFO } = await import('../src/game/tools.js');
const { PRIZES } = await import('../src/game/config.js');
const { speakable, voiceKey, voiceFile } = await import('../src/game/voicekey.js');

// voices.config.json: { voices: { nana: id, kid: id, woman: id | [ids], man: id | [ids] } }
const cfgPath = path.join(root, 'voices.config.json');
const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
const VOICE_ID = {}; // voice name → ElevenLabs voice ID (woman, woman2, man, man2...)
for (const [name, ids] of Object.entries(cfg.voices || {})) [].concat(ids).forEach((id, i) => { VOICE_ID[i ? `${name}${i + 1}` : name] = id; });
const variants = (base) => Object.keys(VOICE_ID).filter((v) => v === base || new RegExp(`^${base}\\d+$`).test(v));
const ADULT = [...variants('woman'), ...variants('man')];
const PATIENT = ['kid', ...ADULT];

// ------------------------------------------------------------------ every line, by who says it
const lines = []; // { voice, text }
const add = (voices, texts) => { for (const v of [].concat(voices)) for (const t of [].concat(texts)) lines.push({ voice: v, text: t }); };

// Patients (generic lines in all three patient voices; kid / VIP lines only where they fit)
const KID_ONLY = ['kidHello', 'kidThanks', 'kidPain'];
for (const [k, list] of Object.entries(LINES)) {
  if (k === 'nurseGive' || k === 'stepOk') continue; // Suster Nana's
  add(KID_ONLY.includes(k) ? 'kid' : k === 'vipHello' ? ADULT : PATIENT, list);
}
for (const c of Object.values(CASES)) add(PATIENT, c.complaints);
add(PATIENT, ['Terus...']); // joins the two complaints of a patient with 2 problems

// Lines written straight into game.js (patients: ch.say, Suster Nana: assistant.say)
const game = fs.readFileSync(path.join(root, 'src/game/game.js'), 'utf8');
const TONES = new Set(['normal', 'happy', 'sad', 'angry']);
for (const ln of game.split('\n')) {
  if (!ln.includes('.say(')) continue;
  const voices = ln.includes('assistant.say(') ? ['nana'] : PATIENT;
  for (const m of ln.matchAll(/'([^'\\]*(?:\\.[^'\\]*)*)'/g)) {
    const s = m[1];
    if (TONES.has(s) || !/[A-Za-z]{2}/.test(s) || /^[a-z]+$/.test(s)) continue; // tones, keys like 'chatty'
    add(voices, s);
  }
}

// Suster Nana's lines that include a tool, a treatment, a prize or a number
const toolNames = Object.entries(TOOL_INFO).filter(([id]) => id !== 'xray').map(([, t]) => t.name);
for (const n of toolNames) {
  for (const g of LINES.nurseGive) add('nana', `${g} ${n}.`);
  add('nana', `Petunjuk: pakai ${n}, yang bercincin di baki!`);
  add('nana', `Dok, coba pakai ${n}!`);
}
add('nana', 'Dok, lihat layar rontgen di sebelah kiri!');
add('nana', LINES.stepOk);
for (const c of Object.values(CASES)) {
  add('nana', `Satu beres! Sekarang ${c.title.toLowerCase()}, Dok.`);
  c.steps.forEach((s, i) => {
    if (s.tool === 'xray') return;
    add('nana', `Langkah ${i + 1}: ${s.text.toLowerCase()}. Ambil ${TOOL_INFO[s.tool].name}, yang bercincin di baki!`);
  });
}
for (const p of PRIZES) add('nana', `Selamat! Kamu dapat ${p.text}!`);
for (const n of [1.5, 2, 3]) add('nana', `COMBO ×${n}! Luar biasa, Dok!`);
for (let n = 2; n <= 12; n++) add('nana', `${n}!`);

// one entry per voice + key
const byKey = new Map();
for (const l of lines) {
  const say = speakable(l.text);
  const key = voiceKey(l.text);
  if (!say || !key) continue;
  const id = `${l.voice}|${key}`;
  if (!byKey.has(id)) byKey.set(id, { voice: l.voice, key, say: say.replace('COMBO 1.5', 'COMBO satu setengah kali').replace(/COMBO (\d)/, 'COMBO $1 kali'), file: voiceFile(key) });
}
const all = [...byKey.values()];
const chars = all.reduce((a, l) => a + l.say.length, 0);

const outDir = path.join(root, 'public/voices');
const exists = (l) => fs.existsSync(path.join(outDir, l.voice, `${l.file}.mp3`));
const todo = all.filter((l) => !exists(l));
// recordings of lines the game no longer says (after a line was changed)
const wanted = new Set(all.map((l) => `${l.voice}/${l.file}.mp3`));
const unused = () => (fs.existsSync(outDir) ? fs.readdirSync(outDir, { withFileTypes: true }).filter((d) => d.isDirectory())
  .flatMap((d) => fs.readdirSync(path.join(outDir, d.name)).filter((f) => f.endsWith('.mp3')).map((f) => `${d.name}/${f}`)).filter((f) => !wanted.has(f)) : []);

if (process.argv.includes('--list')) {
  const per = {};
  for (const l of all) { per[l.voice] ??= { lines: 0, chars: 0 }; per[l.voice].lines++; per[l.voice].chars += l.say.length; }
  console.table(per);
  console.log(`Total: ${all.length} lines, ${chars} characters. Still to make: ${todo.length} lines, ${todo.reduce((a, l) => a + l.say.length, 0)} characters.`);
  fs.writeFileSync(path.join(root, 'voices-lines.csv'), 'voice,file,text\n' + all.map((l) => `${l.voice},${l.file},"${l.say.replace(/"/g, '""')}"`).join('\n') + '\n');
  console.log('All lines written to voices-lines.csv');
  const old = unused();
  if (old.length) console.log(`${old.length} old recordings are no longer used; npm run voices removes them.`);
  process.exit(0);
}

// ------------------------------------------------------------------ make the audio
let key = process.env.ELEVENLABS_API_KEY;
const envFile = path.join(root, '.env.local');
if (!key && fs.existsSync(envFile)) key = /ELEVENLABS_API_KEY\s*=\s*(\S+)/.exec(fs.readFileSync(envFile, 'utf8'))?.[1];
if (!key) { console.error('No API key. Put ELEVENLABS_API_KEY=... in .env.local (see README).'); process.exit(1); }
const missing = ['nana', 'kid', 'woman', 'man'].filter((v) => !VOICE_ID[v] || VOICE_ID[v].startsWith('PASTE'));
if (missing.length) { console.error(`voices.config.json: add the voice ID for ${missing.join(', ')}.`); process.exit(1); }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function make(l) {
  const settings = cfg.settings?.[l.voice] || cfg.settings?.[l.voice.replace(/\d+$/, '')] || cfg.settings?.default || { stability: 0.45, similarity_boost: 0.8, style: 0.35, use_speaker_boost: true };
  for (let attempt = 1; attempt <= 4; attempt++) {
    const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID[l.voice]}?output_format=mp3_44100_64`, {
      method: 'POST',
      headers: { 'xi-api-key': key, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
      body: JSON.stringify({ text: l.say, model_id: cfg.model || 'eleven_multilingual_v2', language_code: 'id', voice_settings: settings }),
    });
    if (res.ok) {
      fs.mkdirSync(path.join(outDir, l.voice), { recursive: true });
      fs.writeFileSync(path.join(outDir, l.voice, `${l.file}.mp3`), Buffer.from(await res.arrayBuffer()));
      return;
    }
    const msg = await res.text();
    if (res.status === 429 || res.status >= 500) { await sleep(2000 * attempt); continue; }
    throw new Error(`${res.status} ${msg.slice(0, 300)}`);
  }
  throw new Error('gave up after 4 tries');
}

console.log(`${todo.length} of ${all.length} lines to make (${todo.reduce((a, l) => a + l.say.length, 0)} characters).`);
let done = 0;
let failed = 0;
const queue = [...todo];
await Promise.all([0, 1].map(async () => {
  for (let l = queue.shift(); l; l = queue.shift()) {
    try { await make(l); done++; process.stdout.write(`\r${done}/${todo.length}  ${l.voice}: ${l.say.slice(0, 50).padEnd(50)}`); }
    catch (e) {
      failed++;
      console.error(`\n✗ ${l.voice}: "${l.say}": ${e.message}`);
      if (/quota|credits|401|unauthorized/i.test(e.message)) { console.error('Stopping: check the API key and your ElevenLabs credits.'); queue.length = 0; }
    }
  }
}));

// remove recordings of lines the game no longer says
const old = unused();
for (const f of old) fs.unlinkSync(path.join(outDir, f));
if (old.length) console.log(`\nRemoved ${old.length} old recordings.`);

// index the game reads: voice → { key: file }
const index = { voices: {} };
for (const l of all) if (exists(l)) (index.voices[l.voice] ??= {})[l.key] = l.file;
fs.writeFileSync(path.join(outDir, 'index.json'), JSON.stringify(index));
console.log(`\nDone: ${done} made, ${failed} failed. public/voices/index.json lists ${Object.values(index.voices).reduce((a, v) => a + Object.keys(v).length, 0)} lines.`);
