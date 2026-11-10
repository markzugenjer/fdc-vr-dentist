import * as THREE from 'three';
import { P } from './palette.js';
import { buildRoom, DOOR, SEAT } from './room.js';
import { buildFdcRoom } from './room-fdc.js';
import { Character } from './character.js';
import { ToolTray, TOOL_INFO } from './tools.js';
import { MouthWork } from './mouth.js';
import { Effects } from './effects.js';
import { Music } from './music.js';
import { buildBoards } from './boards.js';
import { progress } from './progress.js';
import { Decor, DECOR, DECOR_ORDER } from './decor.js';
import { config, CHOICES, BOOTH } from './config.js';
import { PhotoBooth, drawPhotoCard } from './photo.js';
import { Voices } from './voice.js';
import { PrizeWheel } from './wheel.js';
import { drawLeaderboard, niceName } from './leaderboard.js';
import { store } from '../core/util.js';
import { CASES, LINES, PATIENTS, KIDS, ASSISTANT, FACTS, PERSONALITIES, TOOL_HINT, PAIRS, pick } from './cases.js';
import { makePanel, makeButton, tickButtons, text, card, wrap, roundRect } from '../core/ui.js';

/**
 * FDC Dentist.
 *
 * Patients come in through the door and wait on the bench, each with a patience bar. Call them to
 * the chair one by one and pick the right instrument for each step of their treatment. Wrong
 * instruments hurt (or annoy) them; too many and they walk out. Perfect patients in a row build a
 * combo. Three modes:
 *   - Tutorial: Suster Nana shows every step and which tool to take.
 *   - Shift: 5 patients, a result card after each one.
 *   - Event: 3 minutes, as many patients as you can, for a score board on the room TV.
 */
const BENCH_SEATS = 2;
const MOUTH_REACH = 0.075; // how close (m) the tool tip must be to the mouth in VR
const TARGET_REACH = 0.035; // ...and to the exact tooth, for tooth-by-tooth steps
const STAND = { x: 0.35, z: -1.12 }; // where the patient stands before sitting in the chair
const EXIT = { x: 0.85, z: -1.0 }; // where they step out of the chair (clear of the big panel)
const BENCH = [ // seats on the waiting bench by the right wall (facing the room)
  { x: 2.1, y: 0.49, z: -2.0, yaw: -Math.PI / 2, recline: 0, front: { x: 1.72, z: -2.0 } },
  { x: 2.1, y: 0.49, z: -1.3, yaw: -Math.PI / 2, recline: 0, front: { x: 1.72, z: -1.3 } },
];
const DOOR_IN = { x: DOOR.x, z: DOOR.z + 0.7 };
const DOOR_OUT = { x: DOOR.x, z: DOOR.z - 0.7 };
const CANCEL = Symbol('cancel');

// The "Lobby FDC" buttons only appear when the game was opened from the FDC VR lobby. In the
// stand-alone FDC Dentist app there is no lobby to go back to.
const FROM_LOBBY = (() => {
  const q = new URLSearchParams(location.search).get('from') === 'lobby';
  try { if (q) sessionStorage.setItem('fdc.dentist.from', 'lobby'); return sessionStorage.getItem('fdc.dentist.from') === 'lobby'; } catch { return q; }
})();
const LOBBY_URL = location.port === '5175'
  ? `${location.protocol}//${location.hostname}:5173/?from=dentist`
  : '/?from=dentist';

export function createClinic(app) {
  const group = new THREE.Group();
  // the treatment room: Klinik FDC (modelled on a real FDC room) or the original cartoon room,
  // switchable in Pengaturan → Ruangan. `room` stays the same object so everything keeps its reference.
  const buildRoomStyle = (style) => (style === 'kartun' ? buildRoom() : buildFdcRoom());
  const room = {};
  Object.defineProperties(room, Object.getOwnPropertyDescriptors(buildRoomStyle(config.roomStyle)));
  group.add(room.group);
  const fx = new Effects(group, 160);
  const sfx = app.sfx;
  // on the dentist's right, clear of the line of sight to the patient's mouth
  const tray = new ToolTray(app, { position: new THREE.Vector3(0.78, 0.84, 0.04), yaw: -0.95 });
  group.add(tray.group);
  tray.setGold(progress.has('golddrill'));
  const boards = buildBoards(app, group);
  boards.setRoomStyle(room.style);

  const assistant = new Character({ height: 1.06, badge: 'fdc', ...ASSISTANT.look });
  assistant.root.position.set(-0.95, 0, -1.15);
  assistant.root.rotation.y = Math.atan2(0.95, 1.15);
  group.add(assistant.root);
  // ------------------------------------------------------------------ voices
  // Recorded lines (public/voices, made with ElevenLabs) when there is one, else the cartoon babble.
  const voices = new Voices(sfx);
  const voiceFor = (ch, voiceOf, pitch, rate, isMain) => (t, tone) => {
    if (config.voices === 'off') return;
    const voice = typeof voiceOf === 'function' ? voiceOf() : voiceOf;
    if (config.voices === 'real' && voices.files(voice, t)) {
      voices.speak(ch, voice, t, { rate, priority: isMain() ? 'high' : 'low', volume: isMain() ? 1 : 0.6 }).then((d) => {
        if (d > 0) { ch.talkT = d; ch.bubble.time = Math.max(ch.bubble.time, d + 0.4); }
        else if (d === 0) sfx.voice(t, pitch, tone);
      });
      return;
    }
    sfx.voice(t, pitch, tone);
  };
  assistant.onSay = voiceFor(assistant, 'nana', 300, 1, () => true);
  const decor = new Decor({ room, assistant, parent: group });

  const head = new THREE.Vector3(); // the player's head, updated every frame
  const tmp = new THREE.Vector3();
  const tmp2 = new THREE.Vector3();
  const tmp3 = new THREE.Vector3();

  // ------------------------------------------------------------------ game state
  // chair state: title | arriving | calm | treat | react | done | leaving | result | idle | final
  let state = 'title';
  let mode = null; // tutorial | shift | event
  let paused = false;
  let patient = null; // { ...data, ch } in the chair
  let work = null; // the active job's mouth visuals
  let caseId = null; // the active job's treatment
  let jobs = []; // one per treatment (two for patients with two problems)
  let job = null; // the active job
  let hes = 0; // seconds the dentist has been hesitating on this step
  let helped = false;
  let helpCost = 0;
  let hintsLeft = 0; // "Petunjuk" presses left this round
  let hinted = null; // the tool the last hint pointed at (its ring goes once it's picked up)
  let lastPointer = null;
  let demo = false; // demo mode: the clinic plays itself while the booth is idle (see below)
  let clinicTime = 9.5; // clinic clock (hours)
  let stepIdx = 0;
  let stepProgress = 0;
  let mistakes = 0;
  let treatStart = 0;
  let elapsed = 0;
  let patience = 1; // 0..1 for the patient in the chair
  let patienceMax = 60;
  let calmLeft = 0;
  let calmBonus = 0;
  let sleeping = false;
  let funny = null; // the funny moment planned for this patient
  let clock = 0;
  let combo = 0;
  let eventLeft = 0;
  let served = 0; // patients finished or lost (shift)
  let spawned = 0; // patients that came in (shift)
  let nextArrival = 0;
  let shift = { score: 0, stars: 0, happy: 0, lost: 0, results: [] };
  let token = 0;
  let timers = [];
  const waiting = []; // { ...data, ch, seat, patience, max, bar, state: walking|seated|leaving }
  const walkers = new Set(); // characters on their way out
  let doorUsers = 0;

  const wait = (s) => new Promise((resolve, reject) => {
    const my = token;
    timers.push({ t: s, done: () => (my === token ? resolve() : reject(CANCEL)) });
  });
  const guard = (p) => p.catch((e) => { if (e !== CANCEL) console.error(e); });
  const comboMult = () => (combo >= 5 ? 3 : combo >= 3 ? 2 : combo >= 2 ? 1.5 : 1);
  const personality = () => PERSONALITIES[patient?.personality || 'normal'];
  // the hearts setting is for normal patients; scared ones get one less
  const maxHearts = () => Math.max(1, config.hearts + (personality().hearts - 3));

  // ------------------------------------------------------------------ jobs (treatments in progress)
  const stepsOf = (data) => (data.caseIds || [data.caseId]).reduce((a, id) => a + CASES[id].steps.length, 0);
  function makeJobs(data, ch) {
    const ids = data.caseIds || [data.caseId];
    // build the scaling visuals last, so its yellow teeth win over the others' clean white
    const order = [...ids].sort((a, b) => (a === 'scaling') - (b === 'scaling'));
    const works = {};
    for (const id of order) works[id] = new MouthWork(ch, id, fx, sfx);
    const list = [];
    for (const id of ids) {
      let steps = CASES[id].steps;
      // one mirror check is enough for both problems
      if (list.length && steps[0].tool === 'mirror' && list.some((j) => j.steps[0].tool === 'mirror')) steps = steps.slice(1);
      list.push({ caseId: id, steps, idx: 0, prog: 0, work: works[id], done: false });
    }
    return list;
  }
  function activate(j) {
    if (!j || job === j) return;
    if (job) { job.idx = stepIdx; job.prog = stepProgress; }
    job = j;
    caseId = j.caseId;
    stepIdx = j.idx;
    stepProgress = j.prog;
    work = j.work;
  }
  const jIdx = (j) => (j === job ? stepIdx : j.idx);
  const jProg = (j) => (j === job ? stepProgress : j.prog);
  const curStep = (j) => (j && !j.done ? j.steps[jIdx(j)] : null);
  /** The job whose current step uses this tool (the active one first): you choose the order. */
  function jobFor(toolId) {
    if (curStep(job)?.tool === toolId) return job;
    return jobs.find((j) => curStep(j)?.tool === toolId) || null;
  }
  const firstOpen = () => (job && !job.done ? job : jobs.find((j) => !j.done));
  function disposeJobs() {
    for (const j of jobs) j.work.dispose();
    jobs = [];
    job = null;
    work = null;
  }
  const totalSteps = () => jobs.reduce((a, j) => a + j.steps.length, 0);
  const doneSteps = () => jobs.reduce((a, j) => a + (j.done ? j.steps.length : jIdx(j)), 0);

  // ------------------------------------------------------------------ panels
  const FRONT = new THREE.Vector3(0, 1.6, -1.25);

  let bigContent = { kind: 'title' };
  const big = makePanel(1.3, 0.78, (c, W, H) => drawBig(c, W, H, bigContent));
  big.mesh.position.copy(FRONT);
  group.add(big.mesh);
  const btn = (label, tone, x, y, onSelect, w = 0.4) => {
    const b = makeButton(app, { label, tone, w, h: 0.12, onSelect });
    b.position.set(FRONT.x + x, FRONT.y + y, FRONT.z + 0.02);
    group.add(b);
    return b;
  };
  const ROW1 = -0.46;
  const ROW2 = -0.6;
  const bStart = btn('Mulai kerja', 'mint', -0.43, ROW1, () => askName('shift'));
  const bEvent = btn('Mode Event', 'pink', 0, ROW1, () => askName('event'));
  const bTut = btn('Tutorial', 'light', 0.43, ROW1, () => start('tutorial'));
  const bHow = btn('Cara main', 'light', -0.48, ROW2, () => { bigContent = bigContent.kind === 'how' ? { kind: 'title' } : { kind: 'how' }; big.redraw(); bHow.userData.setLabel(bigContent.kind === 'how' ? 'Kembali' : 'Cara main'); }, 0.3);
  const bDecor = btn('Dekorasi', 'light', -0.16, ROW2, () => openShop(), 0.3);
  const bSettings = btn('Pengaturan', 'light', 0.16, ROW2, () => openSettings(), 0.3);
  const bLobby = btn('Lobby FDC', 'pink', 0.48, ROW2, () => toLobby(), 0.3);

  // ------------------------------------------------------------------ final countdown (last 10 s of Mode Event)
  let countPulse = 0;
  let countShown = -1;
  const countPanel = makePanel(0.5, 0.36, (c, W, H) => {
    if (countShown < 0) return;
    c.fillStyle = 'rgba(232,103,108,0.92)';
    roundRect(c, 6, 6, W - 12, H - 12, H * 0.3);
    c.fill();
    c.lineWidth = 10;
    c.strokeStyle = '#ffffff';
    c.stroke();
    text(c, `${countShown}`, W / 2, H * 0.78, { size: H * 0.8, weight: 900, color: '#ffffff', align: 'center' });
  }, { ppm: 400 });
  countPanel.mesh.position.set(0.05, 2.0, -1.35);
  countPanel.mesh.visible = false;
  countPanel.mesh.renderOrder = 3;
  group.add(countPanel.mesh);
  function updateCountdown(dt) {
    const on = state !== 'final' && state !== 'title' && mode === 'event' && eventLeft > 0 && eventLeft <= 10 && !paused;
    countPanel.mesh.visible = on;
    if (!on) { countShown = -1; music.setRate(1); return; }
    const n = Math.ceil(eventLeft);
    if (n !== countShown) { countShown = n; countPanel.redraw(); }
    countPulse = Math.max(0, countPulse - dt * 3);
    countPanel.mesh.scale.setScalar(1 + countPulse * 0.35);
  }

  // ------------------------------------------------------------------ Papan Skor (today's top 10, beside the title menu)
  // The booth TV shows the headset through casting, so this board is what the queue sees
  // between players. It also shows after a round, with the player's line highlighted.
  let playerName = '';
  let lastEntry = null;
  const lbPanel = makePanel(0.62, 0.84, (c, W, H) => {
    card(c, W, H, { r: 0.07, stroke: P.gold, lw: 10 });
    const n = progress.playsToday();
    const mark = state === 'final' ? lastEntry : null;
    drawLeaderboard(c, W, H, { list: progress.topToday(10), mark, markPlace: mark ? progress.placeToday(mark) : 0, footer: n ? `${n} dokter sudah main hari ini` : 'Tulis namamu, masuk papan skor!' });
  });
  lbPanel.mesh.position.set(1.0, 1.6, -1.0);
  lbPanel.mesh.rotation.y = -0.38;
  group.add(lbPanel.mesh);

  // ------------------------------------------------------------------ name entry (before Mulai kerja / Mode Event)
  const NAME_MAX = 14;
  let nameMode = 'shift';
  let nameText = '';
  const NAME_CENTER = new THREE.Vector3(-0.08, 1.6, -1.24);
  const namePanel = makePanel(1.32, 0.96, (c, W, H) => {
    card(c, W, H, { r: 0.07, stroke: P.pink, lw: 10 });
    const pad = W * 0.05;
    text(c, 'Siapa namamu, Dokter?', pad, H * 0.1, { size: H * 0.065, weight: 900, color: P.mintDark });
    text(c, nameMode === 'event' ? `Mode Event · ${config.eventMinutes} menit` : `Mulai kerja · ${config.patientsPerShift} pasien`, W - pad, H * 0.1, { size: H * 0.04, weight: 800, color: P.pinkDeep, align: 'right' });
    text(c, 'Namamu akan tampil di Papan Skor hari ini.', pad, H * 0.16, { size: H * 0.034, color: P.muted });
    roundRect(c, pad, H * 0.2, W - pad * 2, H * 0.14, H * 0.04);
    c.fillStyle = P.mintSoft;
    c.fill();
    c.lineWidth = 6;
    c.strokeStyle = P.mint;
    c.stroke();
    const shown = niceName(nameText);
    text(c, shown ? `${shown}_` : 'Tekan huruf di bawah...', W / 2, H * 0.295, { size: H * 0.07, weight: shown ? 900 : 600, color: shown ? P.ink : P.muted, align: 'center', maxWidth: W - pad * 3 });
  });
  namePanel.mesh.position.copy(NAME_CENTER);
  namePanel.mesh.visible = false;
  namePanel.mesh.renderOrder = 1;
  group.add(namePanel.mesh);
  const nameBtns = [];
  const addNameBtn = (label, tone, x, y, w, onSelect, h = 0.095) => {
    const b = makeButton(app, { label, tone, w, h, onSelect });
    b.position.set(NAME_CENTER.x + x, NAME_CENTER.y + y, NAME_CENTER.z + 0.02);
    b.renderOrder = 2; // always drawn after the panel behind it
    b.visible = false;
    group.add(b);
    nameBtns.push(b);
    return b;
  };
  const typeKey = (ch) => {
    if (ch === '⌫') nameText = nameText.slice(0, -1);
    else if (nameText.length < NAME_MAX && !(ch === ' ' && (!nameText || nameText.endsWith(' ')))) nameText += ch;
    namePanel.redraw();
  };
  const KEY_ROWS = ['ABCDEFGHI', 'JKLMNOPQR', 'STUVWXYZ⌫'];
  KEY_ROWS.forEach((row, r) => [...row].forEach((ch, i) => {
    addNameBtn(ch, ch === '⌫' ? 'pink' : 'light', (i - 4) * 0.132, 0.06 - r * 0.115, 0.118, () => typeKey(ch));
  }));
  addNameBtn('Spasi', 'light', -0.4, -0.3, 0.4, () => typeKey(' '));
  addNameBtn('Kembali', 'light', -0.4, -0.415, 0.4, () => { bigContent = { kind: 'title' }; big.redraw(); layout(); });
  addNameBtn('Mulai! ›', 'mint', 0.3, -0.3, 0.56, () => startNamed(), 0.12);
  addNameBtn('Main tanpa nama', 'light', 0.3, -0.415, 0.56, () => { nameText = ''; startNamed(); });
  function askName(m) {
    if (!config.askName) { playerName = ''; start(m); return; }
    nameMode = m;
    nameText = '';
    bigContent = { kind: 'name' };
    namePanel.redraw();
    lbPanel.redraw();
    layout();
    assistant.say('Tulis namamu dulu ya, Dokter!', 2);
  }
  function startNamed() {
    playerName = niceName(nameText) || `Dokter Tamu ${progress.playsToday() + 1}`;
    start(nameMode);
  }

  // ------------------------------------------------------------------ Pengaturan (game settings)
  const SET_CENTER = new THREE.Vector3(0, 1.62, -1.24);
  const SET_TOP = 0.35; // first row, relative to the panel centre
  const SET_TYPES_Y = SET_TOP - 7 * 0.07 - 0.06; // where the patient-type list starts
  const setPanel = makePanel(1.5, 1.12, (c, W, H) => {
    card(c, W, H, { r: 0.06, stroke: P.mint, lw: 10 });
    const pad = W * 0.04;
    text(c, 'Pengaturan', pad, H * 0.075, { size: H * 0.055, weight: 800, color: P.mintDark });
    text(c, 'Tersimpan di headset.', W * 0.3, H * 0.075, { size: H * 0.026, color: P.muted });
    text(c, 'Permainan', pad, H * 0.135, { size: H * 0.032, weight: 800, color: P.pinkDeep });
    text(c, 'Perawatan yang muncul', W / 2 + pad, H * 0.135, { size: H * 0.032, weight: 800, color: P.pinkDeep });
    text(c, 'Tipe pasien', W / 2 + pad, H * ((0.56 - (SET_TYPES_Y + 0.052)) / 1.12), { size: H * 0.032, weight: 800, color: P.pinkDeep });
  });
  setPanel.mesh.position.copy(SET_CENTER);
  setPanel.mesh.visible = false;
  group.add(setPanel.mesh);
  const choiceLabel = (key) => {
    const v = config[key];
    const c = CHOICES[key]?.find?.((x) => (typeof x === 'object' ? x.id === v : x === v));
    return typeof c === 'object' ? c.label : v;
  };
  const SETTINGS = [
    ['roomStyle', () => `Ruangan: ${choiceLabel('roomStyle')}`],
    ['patientsPerShift', () => `Pasien per shift: ${config.patientsPerShift}`],
    ['eventMinutes', () => `Mode Event: ${config.eventMinutes} menit`],
    ['patience', () => `Kesabaran pasien: ${choiceLabel('patience')}`],
    ['hearts', () => `Salah alat maksimal: ${config.hearts}x`],
    ['hints', () => `Petunjuk alat: ${config.hints ? config.hints + 'x per ronde' : 'Mati'}`],
    ['pairs', () => `Pasien 2 masalah: ${choiceLabel('pairs')}`],
    ['funny', () => `Momen lucu: ${config.funny ? 'Nyala' : 'Mati'}`],
    ['nurseHelp', () => `Bantuan Suster Nana: ${config.nurseHelp ? 'Nyala' : 'Mati'}`],
    ['voices', () => `Suara karakter: ${choiceLabel('voices')}`],
    ['wheel', () => `Roda hadiah: ${choiceLabel('wheel')}`],
  ];
  const setBtns = [];
  const addSetBtn = (label, tone, x, y, w, onSelect) => {
    const b = makeButton(app, { label, tone, w, h: 0.062, onSelect });
    b.position.set(SET_CENTER.x + x, SET_CENTER.y + y, SET_CENTER.z + 0.02);
    b.visible = false;
    group.add(b);
    setBtns.push(b);
    return b;
  };
  const ROW_GAP = 0.072;
  const cycleBtns = SETTINGS.map(([key, label], i) => addSetBtn(label(), 'light', -0.36, SET_TOP - i * ROW_GAP, 0.66, () => { config.cycle(key); sfx.play('click'); if (key === 'roomStyle') setRoomStyle(config.roomStyle); refreshSettings(); }));
  const caseIds = Object.keys(CASES);
  const caseLabel = (id) => `${config.cases[id] ? '✓' : '✗'}  ${CASES[id].title}${CASES[id].kidsOnly ? ' (anak)' : ''}`;
  const caseBtns = caseIds.map((id, i) => addSetBtn(caseLabel(id), 'light', 0.37, SET_TOP - i * 0.07, 0.64, () => {
    if (!config.toggle('cases', id)) { sfx.play('heart'); assistant.say('Minimal satu perawatan harus nyala, Dokter!', 2); return; }
    sfx.play('click');
    refreshSettings();
  }));
  const TYPE_NAMES = { scared: 'Penakut', chatty: 'Cerewet', vip: 'VIP', kid: 'Anak-anak' };
  const typeIds = Object.keys(TYPE_NAMES);
  const typeLabel = (id) => `${config.types[id] ? '✓' : '✗'}  ${TYPE_NAMES[id]}`;
  const typeBtns = typeIds.map((id, i) => addSetBtn(typeLabel(id), 'light', 0.37, SET_TYPES_Y - i * 0.068, 0.64, () => { config.toggle('types', id); sfx.play('click'); refreshSettings(); }));
  addSetBtn('Kembali ke awal', 'light', -0.55, SET_TOP - SETTINGS.length * ROW_GAP - 0.03, 0.34, () => { config.reset(); sfx.play('drop'); setRoomStyle(config.roomStyle); refreshSettings(); });

  /** Swap the treatment room in place (the game keeps going; chair, door and clock carry over). */
  function setRoomStyle(style) {
    if (room.style === (style === 'kartun' ? 'kartun' : 'fdc')) return;
    const keep = { recline: room.chair.recline, want: room.chair.want, flat: room.chair.flat, flatNow: room.chair.flatNow, time: room.time, door: room.door.want, amount: room.door.amount };
    group.remove(room.group);
    room.group.traverse((o) => o.geometry?.dispose());
    const next = buildRoomStyle(style);
    for (const k of Object.keys(room)) delete room[k];
    Object.defineProperties(room, Object.getOwnPropertyDescriptors(next));
    Object.assign(room.chair, { recline: keep.recline, want: keep.want, flat: keep.flat, flatNow: keep.flatNow });
    room.door.want = keep.door;
    room.door.amount = keep.amount;
    room.setTime(keep.time);
    room.update(0);
    group.add(room.group);
    decor.apply();
    boards.setRoomStyle(room.style);
    placeDecoMirror();
  }
  addSetBtn('Selesai ✓', 'mint', 0.56, 0.48, 0.28, () => closeSettings());
  addSetBtn('Hadiah roda ›', 'pink', -0.19, SET_TOP - SETTINGS.length * ROW_GAP - 0.03, 0.34, () => openPrizes());
  addSetBtn('Papan skor & nama ›', 'pink', 0.37, SET_TOP - SETTINGS.length * ROW_GAP - 0.03, 0.64, () => openScores());
  function refreshSettings() {
    SETTINGS.forEach(([, label], i) => cycleBtns[i].userData.setLabel(label()));
    caseIds.forEach((id, i) => caseBtns[i].userData.setLabel(caseLabel(id)));
    typeIds.forEach((id, i) => typeBtns[i].userData.setLabel(typeLabel(id)));
    big.redraw();
  }
  function openSettings() {
    if (state !== 'title') { sfx.play('click'); return; }
    bigContent = { kind: 'settings' };
    refreshSettings();
    layout();
  }
  // ------------------------------------------------------------------ Atur hadiah roda (prize list and chances)
  const fmtPct = (v) => (Math.round(v * 10) / 10).toString().replace('.', ',');
  const prizePanel = makePanel(1.5, 1.12, (c, W, H) => {
    card(c, W, H, { r: 0.06, stroke: P.pink, lw: 10 });
    const pad = W * 0.04;
    text(c, 'Hadiah Roda', pad, H * 0.075, { size: H * 0.055, weight: 800, color: P.pinkDeep });
    const total = config.prizes.filter((p) => p.on).reduce((a, p) => a + p.chance, 0);
    const ok = Math.abs(total - 100) < 0.01;
    text(c, `Total: ${fmtPct(total)}%${ok ? '' : '  (dibagi otomatis jadi 100%)'}`, W * 0.36, H * 0.075, { size: H * 0.03, weight: 800, color: ok ? P.mintDark : P.pinkDeep });
    text(c, 'Tekan nama untuk nyala/mati. Tahan − / + untuk cepat. Tersimpan di headset.', pad, H * 0.13, { size: H * 0.026, color: P.muted });
    // column headings (x in panel metres → canvas)
    const cx = (x) => ((x + 0.75) / 1.5) * W;
    text(c, 'Peluang', cx(0.04), H * 0.19, { size: H * 0.028, weight: 800, color: P.mintDark, align: 'center' });
    text(c, 'Stok (sisa)', cx(0.47), H * 0.19, { size: H * 0.028, weight: 800, color: P.mintDark, align: 'center' });
    const out = config.prizes.filter((p) => p.on && p.stock === 0).length;
    if (out) text(c, `${out} hadiah habis (tidak muncul di roda)`, W - pad, H * 0.075, { size: H * 0.028, weight: 800, color: P.pinkDeep, align: 'right' });
  });
  prizePanel.mesh.position.copy(SET_CENTER);
  prizePanel.mesh.visible = false;
  group.add(prizePanel.mesh);
  const prizeBtns = [];
  const PRIZE_TOP = 0.3;
  const prizeRows = [];
  const stepFor = (v, up) => (up ? (v >= 10 ? 5 : v >= 2 ? 1 : 0.5) : (v > 10 ? 5 : v > 2 ? 1 : 0.5));
  const addPrizeBtn = (label, tone, x, y, w, onSelect) => {
    const b = makeButton(app, { label, tone, w, h: 0.07, onSelect });
    b.position.set(SET_CENTER.x + x, SET_CENTER.y + y, SET_CENTER.z + 0.02);
    b.visible = false;
    group.add(b);
    prizeBtns.push(b);
    return b;
  };
  // hold − / + to repeat (after a short pause), so setting 300 kipas doesn't take 300 presses
  const repeatOnHold = (b, fn) => {
    let last = 0;
    let held = 0;
    let rep = 0;
    b.userData.onHold = (hit, p, dt) => {
      const now = performance.now();
      if (now - last > 120) { held = 0; rep = 0; } // a new press
      last = now;
      held += dt;
      if (held < 0.45) return;
      rep += dt;
      while (rep > 0.07) { rep -= 0.07; fn(); }
    };
  };
  const prizeAt = (i) => config.prizes[i];
  const changeChance = (i, up) => {
    const p = prizeAt(i);
    if (!p) return;
    p.chance = up ? Math.min(100, +(p.chance + stepFor(p.chance, true)).toFixed(1)) : Math.max(0, +(p.chance - stepFor(p.chance, false)).toFixed(1));
    config.save();
    refreshPrizes();
  };
  // stock: null = unlimited (∞). − from ∞ starts at 100; above 100 it moves by 10; + past 990 goes back to ∞
  const changeStock = (i, up) => {
    const p = prizeAt(i);
    if (!p) return;
    const v = p.stock;
    if (up) p.stock = v == null ? null : v >= 100 ? (v + 10 > 990 ? null : v + 10) : v + 1;
    else p.stock = v == null ? 100 : Math.max(0, v > 100 ? v - 10 : v - 1);
    config.save();
    refreshPrizes();
  };
  for (let i = 0; i < 8; i++) {
    const y = PRIZE_TOP - i * 0.09;
    const row = {
      name: addPrizeBtn('', 'light', -0.44, y, 0.56, () => { const p = prizeAt(i); if (!p) return; p.on = !p.on; config.save(); sfx.play('click'); refreshPrizes(); }),
      minus: addPrizeBtn('−', 'light', -0.08, y, 0.09, () => changeChance(i, false)),
      value: addPrizeBtn('', 'mint', 0.04, y, 0.14, () => {}),
      plus: addPrizeBtn('+', 'light', 0.16, y, 0.09, () => changeChance(i, true)),
      sMinus: addPrizeBtn('−', 'light', 0.33, y, 0.09, () => changeStock(i, false)),
      sValue: addPrizeBtn('', 'light', 0.47, y, 0.17, () => {}),
      sPlus: addPrizeBtn('+', 'light', 0.61, y, 0.09, () => changeStock(i, true)),
    };
    repeatOnHold(row.minus, () => changeChance(i, false));
    repeatOnHold(row.plus, () => changeChance(i, true));
    repeatOnHold(row.sMinus, () => changeStock(i, false));
    repeatOnHold(row.sPlus, () => changeStock(i, true));
    prizeRows.push(row);
  }
  addPrizeBtn('Kembali ke awal', 'pink', -0.4, -0.47, 0.5, () => { config.resetPrizes(); sfx.play('drop'); refreshPrizes(); });
  addPrizeBtn('Selesai ✓', 'mint', 0.4, -0.47, 0.4, () => { bigContent = { kind: 'settings' }; refreshSettings(); layout(); });
  function refreshPrizes() {
    prizeRows.forEach((r, i) => {
      const p = config.prizes[i];
      r.exists = !!p;
      if (!p) return;
      const out = p.stock === 0;
      r.name.userData.setLabel(`${p.on ? '✓' : '✗'}  ${p.text}${out ? ' (habis)' : ''}`);
      r.value.userData.setLabel(p.on ? `${fmtPct(p.chance)}%` : 'mati');
      r.sValue.userData.setLabel(p.stock == null ? '∞' : `${p.stock}`);
    });
    prizePanel.redraw();
    layout();
  }
  function openPrizes() {
    bigContent = { kind: 'prizes' };
    refreshPrizes();
  }

  // ------------------------------------------------------------------ Papan skor settings (booth staff)
  let clearArmed = false;
  const scorePanel = makePanel(1.5, 1.12, (c, W, H) => {
    card(c, W, H, { r: 0.06, stroke: P.gold, lw: 10 });
    const pad = W * 0.04;
    text(c, 'Papan Skor', pad, H * 0.075, { size: H * 0.055, weight: 800, color: P.mintDark });
    text(c, 'Untuk petugas booth. Tersimpan di headset ini.', W * 0.27, H * 0.075, { size: H * 0.026, color: P.muted });
    // today's list on the right half
    c.save();
    c.translate(W * 0.5, H * 0.1);
    drawLeaderboard(c, W * 0.48, H * 0.86, { list: progress.topToday(10), footer: `${progress.playsToday()} ronde hari ini` });
    c.restore();
    const last = progress.board().reduce((a, b) => (!a || b.at > a.at ? b : a), null);
    text(c, 'Ronde terakhir:', pad, H * 0.5, { size: H * 0.03, weight: 800, color: P.pinkDeep });
    text(c, last ? `${last.name || 'Tanpa nama'} · ${last.score}` : '-', pad, H * 0.55, { size: H * 0.034, weight: 700, color: P.ink, maxWidth: W * 0.44 });
  });
  scorePanel.mesh.position.copy(SET_CENTER);
  scorePanel.mesh.visible = false;
  scorePanel.mesh.renderOrder = 1;
  group.add(scorePanel.mesh);
  const scoreBtns = [];
  const addScoreBtn = (label, tone, x, y, w, onSelect) => {
    const b = makeButton(app, { label, tone, w, h: 0.075, onSelect });
    b.position.set(SET_CENTER.x + x, SET_CENTER.y + y, SET_CENTER.z + 0.02);
    b.renderOrder = 2;
    b.visible = false;
    group.add(b);
    scoreBtns.push(b);
    return b;
  };
  const askLabel = () => `Tanya nama pemain: ${config.askName ? 'Nyala' : 'Mati'}`;
  const bAsk = addScoreBtn(askLabel(), 'light', -0.37, 0.3, 0.66, () => { config.askName = !config.askName; config.save(); sfx.play('click'); refreshScores(); });
  addScoreBtn('Hapus ronde terakhir', 'light', -0.37, -0.22, 0.66, () => { const e = progress.removeLast(); sfx.play(e ? 'drop' : 'click'); refreshScores(); });
  const bClear = addScoreBtn('Hapus semua skor hari ini', 'pink', -0.37, -0.32, 0.66, () => {
    if (!clearArmed) { clearArmed = true; refreshScores(); return; }
    progress.clearToday();
    clearArmed = false;
    sfx.play('drop');
    refreshScores();
  });
  addScoreBtn('Selesai ✓', 'mint', -0.37, -0.45, 0.4, () => { clearArmed = false; bigContent = { kind: 'settings' }; refreshSettings(); layout(); });
  function refreshScores() {
    bAsk.userData.setLabel(askLabel());
    bClear.userData.setLabel(clearArmed ? 'Yakin? Tekan sekali lagi' : 'Hapus semua skor hari ini');
    scorePanel.redraw();
    lbPanel.redraw();
    layout();
  }
  function openScores() {
    clearArmed = false;
    bigContent = { kind: 'scores' };
    refreshScores();
  }

  function closeSettings() {
    bigContent = { kind: 'title' };
    big.redraw();
    layout();
  }

  // ------------------------------------------------------------------ Dekorasi (clinic customization)
  let shopMsg = '';
  const shopRowY = (i) => 0.21 - i * 0.105;
  const shopLabel = (cat) => {
    const o = decor.next(cat);
    return `Ganti → ${o.name}${decor.owns(cat, o.id) ? '' : ` (${o.price}★)`}`;
  };
  const shopBtns = DECOR_ORDER.map((cat, i) => {
    const b = makeButton(app, { label: shopLabel(cat), tone: 'light', w: 0.56, h: 0.095, onSelect: () => shopPress(cat) });
    b.position.set(FRONT.x + 0.3, FRONT.y + shopRowY(i), FRONT.z + 0.02);
    group.add(b);
    return b;
  });
  const bShopBack = btn('Kembali', 'mint', 0, ROW1, () => { bigContent = { kind: 'title' }; big.redraw(); layout(); });
  function refreshShop() { DECOR_ORDER.forEach((cat, i) => shopBtns[i].userData.setLabel(shopLabel(cat))); big.redraw(); }
  function openShop() {
    if (state !== 'title') { sfx.play('click'); return; }
    shopMsg = 'Tekan tombol untuk ganti. Barang baru dibeli dengan bintang.';
    bigContent = { kind: 'shop' };
    refreshShop();
    layout();
  }
  function shopPress(cat) {
    const r = decor.advance(cat);
    if (r.ok) {
      sfx.play(r.bought ? 'unlock' : 'click');
      shopMsg = r.bought ? `Dibeli: ${DECOR[cat].label} ${r.option.name}!` : `Dipakai: ${DECOR[cat].label} ${r.option.name}`;
      if (r.bought) { assistant.act('clap', 1.4); assistant.say('Cantik, Dokter!', 1.4); }
      if (cat === 'uniform') { assistant.act('cheer', 1.2); }
    } else {
      sfx.play('heart');
      shopMsg = `${r.option.name} butuh ${r.option.price}★ (kurang ${r.need}★). Main lagi untuk dapat bintang!`;
    }
    refreshShop();
  }
  // a mirror on the left wall also opens Dekorasi
  const decoMirror = new THREE.Group();
  const frameM = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.035, 10, 40), new THREE.MeshStandardMaterial({ color: P.pinkDeep, roughness: 0.4 }));
  const glassM = new THREE.Mesh(new THREE.CircleGeometry(0.3, 40), new THREE.MeshStandardMaterial({ color: '#eaf4f8', metalness: 0.8, roughness: 0.08, emissive: '#d8ecf4', emissiveIntensity: 0.35 }));
  frameM.scale.y = glassM.scale.y = 1.3;
  decoMirror.add(frameM, glassM);
  // the Klinik FDC look: a tall rectangular mirror in a slim black frame
  const rectMirror = new THREE.Group();
  const rectFrame = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.78, 0.025), new THREE.MeshStandardMaterial({ color: '#26292b', roughness: 0.45 }));
  const rectGlass = new THREE.Mesh(new THREE.PlaneGeometry(0.44, 0.72), glassM.material);
  rectGlass.position.z = 0.014;
  rectMirror.add(rectFrame, rectGlass);
  decoMirror.add(rectMirror);
  // the Klinik FDC look: an arched mirror with a slim brass frame over the sink, with a soft
  // painted "reflection" (a real reflection would mean drawing the room twice: too slow for Quest)
  const archShape = (w, h) => {
    const r = w / 2;
    const sh = new THREE.Shape();
    sh.moveTo(-r, -h / 2);
    sh.lineTo(r, -h / 2);
    sh.lineTo(r, h / 2 - r);
    sh.absarc(0, h / 2 - r, r, 0, Math.PI, false);
    sh.lineTo(-r, -h / 2);
    return sh;
  };
  const AW = 0.46;
  const AH = 0.62;
  const archMirror = new THREE.Group();
  const outer = archShape(AW + 0.04, AH + 0.04);
  outer.holes.push(archShape(AW, AH));
  const archFrame = new THREE.Mesh(
    new THREE.ExtrudeGeometry(outer, { depth: 0.022, bevelEnabled: true, bevelThickness: 0.004, bevelSize: 0.004, bevelSegments: 2, curveSegments: 24 }),
    new THREE.MeshStandardMaterial({ color: '#dcb978', metalness: 0.35, roughness: 0.35, emissive: '#5a4320', emissiveIntensity: 0.35 }),
  );
  const archGeo = new THREE.ShapeGeometry(archShape(AW, AH), 24);
  {
    // map the shape's metres to 0..1 UVs for the reflection texture
    const pa = archGeo.attributes.position;
    const uv = archGeo.attributes.uv;
    for (let i = 0; i < pa.count; i++) uv.setXY(i, pa.getX(i) / AW + 0.5, pa.getY(i) / AH + 0.5);
  }
  const archGlass = new THREE.Mesh(archGeo, new THREE.MeshStandardMaterial({
    map: mirrorTexture(), roughness: 0.06, metalness: 0.1, emissive: '#ffffff', emissiveMap: null, emissiveIntensity: 0,
  }));
  archGlass.material.emissiveMap = archGlass.material.map;
  archGlass.material.emissiveIntensity = 0.45; // stays bright like a mirror, even in the corner
  archGlass.position.z = 0.016;
  archMirror.add(archFrame, archGlass);
  decoMirror.add(archMirror);
  function placeDecoMirror() {
    const spot = room.decoMirror || { x: -2.36, y: 1.55, z: -2.15, ry: Math.PI / 2, look: 'oval' };
    decoMirror.position.set(spot.x, spot.y, spot.z);
    decoMirror.rotation.y = spot.ry;
    const rect = spot.look === 'rect';
    const arch = spot.look === 'arch';
    rectMirror.visible = rect;
    archMirror.visible = arch;
    frameM.visible = glassM.visible = !rect && !arch;
    decoLabel.mesh.position.y = spot.labelY ?? (rect ? -0.47 : -0.5);
    decoLabel.mesh.position.z = arch ? 0.03 : 0;
  }
  const decoLabel = makePanel(0.36, 0.09, (c, W, H) => {
    card(c, W, H, { r: 0.45, fill: P.pinkSoft, stroke: P.pinkDeep, lw: 6 });
    text(c, 'Dekorasi', W / 2, H * 0.66, { size: H * 0.5, weight: 800, color: P.pinkDeep, align: 'center' });
  });
  decoLabel.mesh.position.y = -0.5;
  decoMirror.add(decoLabel.mesh);
  group.add(decoMirror);
  placeDecoMirror();
  app.addTarget(glassM, { onSelect: () => openShop() });
  app.addTarget(rectGlass, { onSelect: () => openShop() });
  app.addTarget(archGlass, { onSelect: () => openShop() });
  const bNext = btn('Pasien berikutnya', 'mint', -0.22, ROW1, () => nextPatient(), 0.52);
  const bAgain = btn('Main lagi', 'mint', -0.43, ROW1, () => start(mode === 'tutorial' ? 'shift' : mode), 0.4);
  const bMenu = btn('Menu', 'light', 0, ROW1, () => toTitle(), 0.4);
  const bLobby2 = btn('Lobby FDC', 'pink', 0.43, ROW1, () => toLobby(), 0.4);

  // ------------------------------------------------------------------ Roda Hadiah (prize wheel)
  // After a Mulai kerja / Mode Event round the final board offers one spin; the wheel takes the
  // board's place, and the prize is then shown on the final board for the staff to see.
  const wheel = new PrizeWheel(app, { sfx, fx, position: new THREE.Vector3(0, 1.52, -1.15) });
  group.add(wheel.group);
  let wheelReady = false; // this round may spin
  let wheelOpen = false;
  const bSpin = btn('Putar Roda Hadiah!', 'pink', 0, ROW1, () => openWheel(), 0.62);

  // ------------------------------------------------------------------ Foto kenangan (photo card after the round)
  const photo = new PhotoBooth(app.renderer, app.scene);
  let photoOpen = false;
  const photoPanel = makePanel(1.3, 0.78, (c, W, H) => {
    if (!photo.has) return;
    drawPhotoCard(c, W, H, {
      photo: photo.canvas, name: playerName, score: shift.score, place: bigContent.place || 0, plays: bigContent.plays || 0,
      prize: bigContent.prize || '', link: BOOTH.link, eventName: BOOTH.eventName,
    });
  });
  photoPanel.mesh.position.copy(FRONT);
  photoPanel.mesh.visible = false;
  group.add(photoPanel.mesh);
  const bPhoto = btn('Foto kenangan', 'pink', 0, ROW2, () => {
    photoOpen = !photoOpen;
    if (photoOpen) { photoPanel.redraw(); sfx.play('sparkle'); assistant.say('Cekrek! Foto layar TV-nya ya!', 2.4); }
    bPhoto.userData.setLabel(photoOpen ? 'Lihat skor' : 'Foto kenangan');
    layout();
  }, 0.5);
  /** Snapshot of the patient cheering, from a camera in front of the chair (Suster Nana in the frame too). */
  function takePhoto(stars) {
    if (!patient || mode === 'tutorial' || demo) return;
    const h = patient.ch.headWorld(new THREE.Vector3());
    const at = h.clone().add(new THREE.Vector3(-0.28, -0.05, -0.05));
    const from = h.clone().add(new THREE.Vector3(0.55, 0.32, 0.95));
    photo.capture(from, at, stars);
  }
  const bWheelGo = makeButton(app, { label: 'PUTAR!', tone: 'pink', w: 0.42, h: 0.13, onSelect: () => wheelButton() });
  bWheelGo.position.set(0.66, 1.2, -1.08); // right of the wheel, clear of the spittoon and the lamp
  bWheelGo.rotation.y = -0.3;
  group.add(bWheelGo);
  wheel.onResult = (prize) => {
    bigContent.prize = prize.text;
    // one less in stock (unlimited prizes have stock null)
    const won = config.prizes.find((p) => p.text === prize.text);
    if (won && won.stock != null) { won.stock = Math.max(0, won.stock - 1); config.save(); }
    big.redraw();
    bWheelGo.userData.setLabel('Lanjut');
    assistant.act('clap', 2);
    assistant.face('happy');
    assistant.say(`Selamat! Kamu dapat ${prize.text}!`, 3);
    try {
      const log = store.get('fdc.dentist.prizes', {});
      log[prize.text] = (log[prize.text] || 0) + 1;
      store.set('fdc.dentist.prizes', log);
    } catch { /* storage full or blocked: the prize still shows */ }
  };
  function openWheel() {
    if (state !== 'final' || !wheelReady || bigContent.prize) return;
    wheel.setPrizes(config.activePrizes());
    wheel.open();
    wheelOpen = true;
    bWheelGo.userData.setLabel('PUTAR!');
    sfx.play('sparkle');
    assistant.act('point', 1.6);
    assistant.say('Waktunya Roda Hadiah! Tekan PUTAR!', 2.6);
    layout();
  }
  function wheelButton() {
    if (wheel.spinning) return;
    if (!wheel.spun) { wheel.start(); bWheelGo.visible = false; return; }
    closeWheel();
  }
  function closeWheel() {
    wheel.close();
    wheelOpen = false;
    sfx.play('click');
    layout();
  }

  // patient card on the right
  const cardPanel = makePanel(0.62, 0.74, (c, W, H) => drawCard(c, W, H));
  cardPanel.mesh.position.set(0.98, 1.52, -1.3);
  cardPanel.mesh.rotation.y = -0.55;
  group.add(cardPanel.mesh);
  // "Petunjuk" under the card: rings the right tool on the tray (a few per round, see Pengaturan)
  const bHint = makeButton(app, { label: 'Petunjuk', tone: 'mint', w: 0.4, h: 0.1, onSelect: () => useHint() });
  bHint.position.set(0.98, 1.08, -1.3);
  bHint.rotation.y = -0.55;
  bHint.visible = false;
  group.add(bHint);
  const hintLabel = () => `Petunjuk alat (${hintsLeft})`;

  // small score pop-up above the chair (event mode)
  let popText = null;
  let popT = 0;
  const pop = makePanel(0.5, 0.16, (c, W, H) => {
    if (!popText) return;
    card(c, W, H, { r: 0.4, fill: popText.bad ? '#fff0f0' : '#ffffff', stroke: popText.bad ? P.red : P.gold, lw: 8 });
    text(c, popText.main, W / 2, H * 0.52, { size: H * 0.42, weight: 900, align: 'center', color: popText.bad ? P.red : P.mintDark });
    if (popText.sub) text(c, popText.sub, W / 2, H * 0.86, { size: H * 0.2, weight: 700, align: 'center', color: P.pinkDeep });
  });
  pop.mesh.position.set(0.05, 1.62, -0.95);
  pop.mesh.visible = false;
  group.add(pop.mesh);
  function showPop(main, sub, bad) {
    popText = { main, sub, bad };
    pop.redraw();
    pop.mesh.visible = true;
    popT = 2.2;
  }

  // rhythm indicator for the root canal file step
  let rhythmOn = false;
  let rhythmT = 0;
  let rhythmGreen = false;
  const rhythmPanel = makePanel(0.26, 0.09, (c, W, H) => {
    card(c, W, H, { r: 0.45, fill: rhythmGreen ? P.mintDeep : P.red });
    text(c, rhythmGreen ? 'GOSOK!' : 'TAHAN...', W / 2, H * 0.68, { size: H * 0.5, weight: 900, color: '#fff', align: 'center' });
  });
  rhythmPanel.mesh.visible = false;
  group.add(rhythmPanel.mesh);

  // a pink ring that shows where to touch with the tool
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.009, 0.013, 24), new THREE.MeshBasicMaterial({ color: P.pinkDeep, transparent: true, depthTest: false, toneMapped: false }));
  ring.renderOrder = 30;
  ring.visible = false;
  group.add(ring);

  // pause menu
  const pausePanel = makePanel(0.8, 0.26, (c, W, H) => {
    card(c, W, H, { r: 0.2 });
    text(c, 'Istirahat sebentar', W / 2, H * 0.42, { size: H * 0.22, weight: 800, align: 'center' });
    text(c, 'Tombol B / Y (atau M) untuk lanjut', W / 2, H * 0.72, { size: H * 0.13, color: P.muted, align: 'center' });
  });
  pausePanel.mesh.position.set(0, 1.62, -0.95);
  group.add(pausePanel.mesh);
  const pBtn = (label, tone, x, f) => {
    const b = makeButton(app, { label, tone, w: 0.3, h: 0.11, onSelect: f });
    b.position.set(x, 1.4, -0.94);
    group.add(b);
    return b;
  };
  const pResume = pBtn('Lanjut', 'mint', -0.33, () => setPaused(false));
  const pMenu = pBtn('Menu utama', 'light', 0, () => { setPaused(false); toTitle(); });
  const pLobby = pBtn('Lobby FDC', 'pink', 0.33, () => toLobby());
  const music = new Music(sfx);
  const musicLabel = () => (music.on ? 'Musik: nyala' : 'Musik: mati');
  const pMusic = makeButton(app, { label: musicLabel(), tone: 'light', w: 0.36, h: 0.1, onSelect: () => { music.toggle(); pMusic.userData.setLabel(musicLabel()); } });
  pMusic.position.set(0, 1.27, -0.94);
  group.add(pMusic);

  function show(list, on) { for (const o of list) o.visible = on; }
  function layout() {
    const t = state === 'title';
    const r = state === 'result';
    const f = state === 'final';
    const shop = t && bigContent.kind === 'shop';
    const sets = t && bigContent.kind === 'settings';
    const prz = t && bigContent.kind === 'prizes';
    const nm = t && bigContent.kind === 'name';
    const sc = t && bigContent.kind === 'scores';
    big.mesh.visible = (t || r || f) && !sets && !prz && !nm && !sc && !wheelOpen;
    namePanel.mesh.visible = nm;
    show(nameBtns, nm);
    scorePanel.mesh.visible = sc;
    show(scoreBtns, sc);
    lbPanel.mesh.visible = (t && !shop && !sets && !prz && !sc) || (f && mode !== 'tutorial');
    setPanel.mesh.visible = sets;
    show(setBtns, sets);
    prizePanel.mesh.visible = prz;
    show(prizeBtns, prz);
    if (prz) for (const r of prizeRows) if (!r.exists) show([r.name, r.minus, r.value, r.plus, r.sMinus, r.sValue, r.sPlus], false);
    show([bStart, bEvent, bTut, bHow, bDecor, bSettings], t && !shop && !sets && !prz && !nm && !sc);
    show([...shopBtns, bShopBack], shop);
    bLobby.visible = t && !shop && !sets && !prz && !nm && !sc && FROM_LOBBY;
    bNext.visible = r;
    const spinFirst = f && wheelReady && !bigContent.prize;
    bSpin.visible = spinFirst && !wheelOpen;
    bWheelGo.visible = f && wheelOpen && !wheel.spinning;
    show([bAgain, bMenu], f && !spinFirst && !wheelOpen);
    bPhoto.visible = f && !spinFirst && !wheelOpen && photo.has && mode !== 'tutorial';
    photoPanel.mesh.visible = bPhoto.visible && photoOpen;
    if (photoPanel.mesh.visible) big.mesh.visible = false;
    bLobby2.visible = f && !spinFirst && !wheelOpen && FROM_LOBBY;
    cardPanel.mesh.visible = !t && !f;
    show([pausePanel.mesh, pResume, pMenu, pMusic], paused);
    pLobby.visible = paused && FROM_LOBBY;
  }

  function setPaused(v) {
    paused = v;
    if (paused) sfx.stopAll();
    music.duck(paused);
    layout();
  }
  app.on((type) => { if (type === 'menu' && state !== 'title') setPaused(!paused); });

  function toLobby() {
    sfx.stopAll();
    app.openPage(LOBBY_URL);
  }

  // ------------------------------------------------------------------ drawing the panels
  function drawBig(c, W, H, d) {
    card(c, W, H, { r: 0.08, stroke: P.mint, lw: 10 });
    const pad = W * 0.06;
    if (d.kind === 'title') {
      drawToothLogo(c, pad + H * 0.15, H * 0.2, H * 0.14);
      text(c, 'FDC Dentist', pad + H * 0.36, H * 0.19, { size: H * 0.11, weight: 800, color: P.mintDark });
      text(c, 'Klinik Gigi Ceria', pad + H * 0.36, H * 0.28, { size: H * 0.06, weight: 600, color: P.pinkDeep });
      const r = progress.rank();
      text(c, r.name, W - pad, H * 0.17, { size: H * 0.055, weight: 800, color: P.mintDark, align: 'right' });
      text(c, `★ ${progress.stars}`, W - pad, H * 0.25, { size: H * 0.055, weight: 800, color: '#d9a32c', align: 'right' });
      const lines = [
        ['Mulai kerja', `Shift ${config.patientsPerShift} pasien. Pasien menunggu di bangku, jangan biarkan bosan!`],
        ['Mode Event', `${config.eventMinutes} menit, sebanyak mungkin pasien. Skor tampil di TV.`],
        ['Tutorial', 'Suster Nana menunjukkan alat yang tepat untuk setiap langkah.'],
      ];
      lines.forEach(([a, b], i) => {
        const y = H * 0.43 + i * H * 0.1;
        text(c, a, pad, y, { size: H * 0.048, weight: 800, color: P.pinkDeep });
        text(c, b, pad + W * 0.2, y, { size: H * 0.045, color: P.ink, maxWidth: W * 0.72 });
      });
      const best = progress.best();
      if (best) text(c, `Skor terbaik: ${best}`, pad, H * 0.72, { size: H * 0.045, weight: 700, color: P.muted });
      text(c, `versi ${typeof __BUILD__ !== 'undefined' ? __BUILD__ : 'dev'}`, W - pad, H * 0.95, { size: H * 0.028, color: '#b3bfba', align: 'right' });
      const nu = progress.nextUnlock();
      if (nu) text(c, `Hadiah berikutnya di ★ ${nu.stars}: ${nu.name}`, W - pad, H * 0.72, { size: H * 0.042, weight: 600, color: P.muted, align: 'right' });
    } else if (d.kind === 'shop') {
      text(c, 'Dekorasi Klinik', pad, H * 0.12, { size: H * 0.08, weight: 800, color: P.mintDark });
      text(c, `Bintangmu: ★ ${decor.wallet}`, W - pad, H * 0.12, { size: H * 0.06, weight: 800, color: '#d9a32c', align: 'right' });
      DECOR_ORDER.forEach((cat, i) => {
        const y = ((0.39 - shopRowY(i)) / 0.78) * H + H * 0.018;
        text(c, DECOR[cat].label, pad, y, { size: H * 0.048, weight: 800, color: P.pinkDeep });
        text(c, decor.current(cat).name, pad + W * 0.17, y, { size: H * 0.046, color: P.ink, maxWidth: W * 0.22 });
      });
      text(c, shopMsg, W / 2, H * 0.92, { size: H * 0.04, weight: 600, color: P.muted, align: 'center', maxWidth: W - pad * 2 });
    } else if (d.kind === 'how') {
      text(c, 'Cara main', pad, H * 0.13, { size: H * 0.08, weight: 800, color: P.mintDark });
      const lines = [
        ['Ambil alat', 'Arahkan laser ke baki, tekan trigger.'],
        ['Pakai alat', 'Sentuhkan ujung alat ke gigi yang ditandai cincin pink, tahan.'],
        ['Ganti alat', 'Ambil alat lain, atau tekan grip untuk mengembalikan.'],
        ['Pasien takut', 'Arahkan laser ke pasien dan tekan trigger untuk menenangkan.'],
        ['Rontgen', 'Tekan layar rontgen di kiri saat langkahnya muncul.'],
        ['Combo', 'Pasien sempurna berturut-turut: skor ×1.5, ×2, ×3!'],
      ];
      lines.forEach(([a, b], i) => {
        const y = H * 0.26 + i * H * 0.085;
        text(c, a, pad, y, { size: H * 0.048, weight: 800, color: P.pinkDeep });
        text(c, b, pad + W * 0.22, y, { size: H * 0.045, color: P.ink, maxWidth: W * 0.68 });
      });
    } else if (d.kind === 'result') {
      const r = d.r;
      text(c, r.left ? `${r.name} pulang kecewa...` : `${r.name} tersenyum lagi!`, W / 2, H * 0.13, { size: H * 0.08, weight: 800, align: 'center', color: r.left ? P.red : P.mintDark });
      drawStars(c, W / 2, H * 0.25, H * 0.06, r.stars);
      const rows = r.left
        ? [['Langkah selesai', `${r.stepsDone} / ${r.steps}`], ['Poin', `+${r.points}`]]
        : [['Perawatan', `+${r.base}`], ['Tanpa salah', r.perfect ? `+${r.perfect}` : '-'], ['Bonus cepat', `+${r.speed}`], ...(r.extra ? [[r.extraLabel, `+${r.extra}`]] : []), [r.helped ? 'Salah alat / dibantu' : 'Salah alat', r.penalty ? `-${r.penalty}` : '0'], ...(r.mult > 1 ? [['Pengali', `×${r.mult}`]] : [])];
      rows.forEach(([a, b], i) => {
        const y = H * 0.36 + i * H * 0.06;
        text(c, a, W * 0.28, y, { size: H * 0.045, color: P.muted });
        text(c, b, W * 0.72, y, { size: H * 0.045, weight: 700, align: 'right' });
      });
      text(c, `Total: ${r.points}   ·   Skor shift: ${shift.score}`, W / 2, H * 0.78, { size: H * 0.05, weight: 800, align: 'center', color: P.ink });
      // fun fact
      c.font = `600 ${Math.round(H * 0.038)}px system-ui`;
      const fact = wrap(c, `Tahukah kamu? ${r.fact}`, W - pad * 2).slice(0, 2);
      fact.forEach((l, i) => text(c, l, W / 2, H * 0.86 + i * H * 0.045, { size: H * 0.038, weight: 600, color: P.pinkDeep, align: 'center' }));
    } else if (d.kind === 'final') {
      const title = mode === 'event' ? 'Waktu habis!' : mode === 'tutorial' ? 'Tutorial selesai!' : 'Shift selesai!';
      text(c, title, W / 2, H * 0.12, { size: H * 0.09, weight: 800, align: 'center', color: P.mintDark });
      if (mode === 'tutorial') {
        text(c, 'Kamu siap jadi dokter gigi!', W / 2, H * 0.3, { size: H * 0.07, weight: 700, align: 'center', color: P.pinkDeep });
        const tips = ['Tiap pasien punya langkah berbeda: baca kartu di kanan.', 'Pasien di bangku bisa bosan, jadi kerja cepat ya!', 'Pasien sempurna berturut-turut = combo!'];
        tips.forEach((l, i) => text(c, l, W / 2, H * 0.45 + i * H * 0.08, { size: H * 0.048, align: 'center', color: P.ink }));
        return;
      }
      text(c, rankOf(shift.stars, d.patients), W / 2, H * 0.21, { size: H * 0.06, weight: 700, align: 'center', color: P.pinkDeep });
      text(c, `${shift.score}`, W / 2, H * 0.38, { size: H * 0.15, weight: 800, align: 'center' });
      text(c, `Pasien senang: ${shift.happy}   ·   Pulang kecewa: ${shift.lost}   ·   ★ ${shift.stars}`, W / 2, H * 0.49, { size: H * 0.048, color: P.muted, align: 'center' });
      if (d.place) text(c, `${playerName ? playerName + ': ' : ''}peringkat #${d.place} dari ${d.plays} hari ini${d.place === 1 ? '  🏆' : ''}${d.newBest ? '  · rekor baru!' : ''}`, W / 2, H * 0.56, { size: H * 0.05, weight: 800, color: d.place <= 3 ? '#c48a12' : P.mintDark, align: 'center', maxWidth: W - pad * 2 });
      else text(c, `Skor terbaik: ${progress.best(mode)}${d.newBest ? '  (baru!)' : ''}   ·   Total bintang: ★ ${progress.stars}`, W / 2, H * 0.56, { size: H * 0.048, color: P.muted, align: 'center' });
      if (d.unlocked?.length) {
        roundRect(c, pad, H * 0.62, W - pad * 2, H * 0.12, H * 0.04);
        c.fillStyle = P.pinkSoft; c.fill();
        text(c, `Hadiah baru: ${d.unlocked.map((u) => u.name).join(', ')}!`, W / 2, H * 0.695, { size: H * 0.045, weight: 800, align: 'center', color: P.pinkDeep, maxWidth: W - pad * 2.6 });
      } else if (d.rankUp) {
        text(c, `Naik peringkat: ${d.rankUp}!`, W / 2, H * 0.69, { size: H * 0.055, weight: 800, align: 'center', color: P.pinkDeep });
      }
      if (d.prize) {
        roundRect(c, pad, H * 0.79, W - pad * 2, H * 0.14, H * 0.05);
        c.fillStyle = P.gold; c.fill();
        text(c, `Hadiah Roda: ${d.prize}`, W / 2, H * 0.845, { size: H * 0.055, weight: 900, align: 'center', color: P.ink, maxWidth: W - pad * 2.6 });
        text(c, 'Tunjukkan ke petugas FDC', W / 2, H * 0.905, { size: H * 0.03, weight: 700, align: 'center', color: P.ink });
      } else if (wheelReady) {
        text(c, 'Kamu dapat 1x putar Roda Hadiah!', W / 2, H * 0.86, { size: H * 0.055, weight: 900, align: 'center', color: P.pinkDeep });
      }
    }
  }

  function drawCard(c, W, H) {
    card(c, W, H, { r: 0.08, fill: 'rgba(255,255,255,0.95)', stroke: P.pink, lw: 8 });
    const pad = W * 0.07;
    const head1 = demo ? 'DEMO · AYO MAIN!' : mode === 'event'
      ? `EVENT  ${fmt(eventLeft)}`
      : mode === 'tutorial' ? 'TUTORIAL' : `PASIEN ${Math.min(served + 1, config.patientsPerShift)} / ${config.patientsPerShift}`;
    text(c, head1, pad, H * 0.075, { size: H * 0.036, weight: 800, color: mode === 'event' && eventLeft < 15 ? P.red : P.muted });
    if (!caseId || !patient) {
      text(c, waiting.length ? 'Memanggil pasien...' : 'Menunggu pasien...', W / 2, H / 2, { size: H * 0.05, color: P.muted, align: 'center' });
      text(c, `Skor ${shift.score}`, W - pad, H * 0.94, { size: H * 0.038, weight: 800, color: P.mintDark, align: 'right' });
      return;
    }
    // the treatments shown on the card (before the jobs exist, straight from the patient data)
    const shown = jobs.length ? jobs : (patient.caseIds || [patient.caseId]).map((id) => ({ caseId: id, steps: CASES[id].steps, idx: 0, prog: 0 }));
    const two = shown.length > 1;
    // hearts = wrong tools left
    const hearts = maxHearts();
    for (let i = 0; i < hearts; i++) drawHeart(c, W - pad - i * H * 0.06, H * 0.065, H * 0.022, i < hearts - mistakes);
    text(c, patient.name, pad, H * 0.16, { size: H * 0.065, weight: 800 });
    const tag = two ? '2 masalah' : PERSONALITIES[patient.personality].label;
    if (tag) {
      c.font = `800 ${Math.round(H * 0.065)}px system-ui`;
      const x = Math.min(W - pad - W * 0.2, pad + c.measureText(patient.name).width + W * 0.03);
      roundRect(c, x, H * 0.12, W * 0.2, H * 0.05, H * 0.025);
      c.fillStyle = two ? P.pinkDeep : patient.personality === 'vip' ? P.gold : P.pinkSoft; c.fill();
      text(c, tag, x + W * 0.1, H * 0.157, { size: H * 0.03, weight: 800, color: two ? '#fff' : P.ink, align: 'center' });
    }
    roundRect(c, pad, H * 0.19, W * 0.62, H * 0.055, H * 0.027);
    c.fillStyle = P.mintSoft; c.fill();
    const title = two ? shown.map((j) => CASES[j.caseId].title.split(' ')[0]).join(' + ') : CASES[shown[0].caseId].title;
    text(c, title, pad + W * 0.03, H * 0.229, { size: H * 0.036, weight: 700, color: P.mintDark, maxWidth: W * 0.57 });
    // patience bar
    text(c, 'Sabar', W - pad - W * 0.25, H * 0.229, { size: H * 0.03, weight: 700, color: P.muted, align: 'right' });
    roundRect(c, W - pad - W * 0.23, H * 0.207, W * 0.23, H * 0.03, H * 0.015);
    c.fillStyle = '#e7ece9'; c.fill();
    roundRect(c, W - pad - W * 0.23, H * 0.207, Math.max(0.001, W * 0.23 * patience), H * 0.03, H * 0.015);
    c.fillStyle = patience > 0.5 ? P.mintDeep : patience > 0.25 ? P.gold : P.red; c.fill();

    c.font = `italic 500 ${Math.round(H * 0.032)}px system-ui`;
    const q = wrap(c, `"${patient.complaint}"`, W - pad * 2).slice(0, two ? 1 : 2);
    q.forEach((l, i) => text(c, l, pad, H * 0.3 + i * H * 0.042, { size: H * 0.032, weight: 500, color: P.muted }));
    let y = two ? H * 0.37 : H * 0.42;
    const rowH = two ? H * 0.056 : H * 0.072;
    if (patient.personality === 'scared') {
      const now = state === 'calm';
      drawStep(c, W, H, pad, y, 'Tenangkan pasien (laser + trigger ke pasien)', !now && calmLeft <= 0, now, '♥', now ? 1 - calmLeft / PERSONALITIES.scared.calm : 0, two);
      y += rowH;
    }
    for (const j of shown) {
      if (two) {
        text(c, `${j.done ? '✓ ' : ''}${CASES[j.caseId].title.toUpperCase()}`, pad, y, { size: H * 0.027, weight: 900, color: j.done ? P.mintDeep : P.pinkDeep });
        y += H * 0.044;
      }
      j.steps.forEach((st, i) => {
        const idx = jIdx(j);
        const done = j.done || i < idx;
        const now = !j.done && i === idx && (!two || j === job) && (state === 'treat' || state === 'react');
        let label = st.text;
        if (mode === 'tutorial' && now) label += ` → ${st.tool === 'xray' ? 'Layar Rontgen' : TOOL_INFO[st.tool].name}`;
        drawStep(c, W, H, pad, y, label, done, now, `${i + 1}`, now ? jProg(j) : 0, two);
        y += rowH;
      });
    }
    text(c, `Waktu ${fmt(elapsed)}`, pad, H * 0.95, { size: H * 0.036, weight: 700, color: P.muted });
    if (comboMult() > 1) text(c, `COMBO ×${comboMult()}`, W / 2, H * 0.95, { size: H * 0.036, weight: 900, color: P.pinkDeep, align: 'center' });
    text(c, `Skor ${shift.score}`, W - pad, H * 0.95, { size: H * 0.036, weight: 800, color: P.mintDark, align: 'right' });
  }
  function drawStep(c, W, H, pad, y, label, done, now, mark, prog, small) {
    const k = small ? 0.82 : 1;
    if (now) {
      roundRect(c, pad * 0.6, y - H * 0.04 * k, W - pad * 1.2, H * 0.064 * k, H * 0.026 * k);
      c.fillStyle = P.pinkSoft; c.fill();
      roundRect(c, pad * 0.6, y + H * 0.018 * k, (W - pad * 1.2) * prog, H * 0.007, H * 0.0035);
      c.fillStyle = P.pinkDeep; c.fill();
    }
    c.beginPath();
    c.arc(pad + H * 0.018, y - H * 0.01 * k, H * 0.019 * k, 0, Math.PI * 2);
    c.fillStyle = done ? P.mintDeep : now ? P.pinkDeep : '#e3e9e6';
    c.fill();
    text(c, done ? '✓' : mark, pad + H * 0.018, y, { size: H * 0.03 * k, weight: 800, color: done || now ? '#fff' : P.muted, align: 'center' });
    text(c, label, pad + H * 0.055, y, { size: H * 0.034 * k, weight: now ? 800 : 500, color: done ? P.muted : P.ink, maxWidth: W - pad * 2 - H * 0.06 });
  }
  let cardKey = '';
  function refreshCard(force) {
    const key = `${jobs.map((j) => (j.done ? 'd' : jIdx(j))).join(',')}|${caseId}|${stepIdx}|${Math.round(stepProgress * 20)}|${mistakes}|${Math.floor(elapsed)}|${state}|${shift.score}|${served}|${Math.round(patience * 40)}|${Math.ceil(eventLeft)}|${calmLeft}|${combo}|${waiting.length}`;
    if (!force && key === cardKey) return;
    cardKey = key;
    cardPanel.redraw();
  }

  // ------------------------------------------------------------------ holding tools
  const held = new Map(); // pointer → tool
  const DESK_POS = new THREE.Vector3(0.13, -0.15, -0.33);
  const DESK_QUAT = new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.3, 0.35, 0));
  const XR_POS = new THREE.Vector3(0, -0.012, -0.02);
  const XR_QUAT = new THREE.Quaternion();
  const xr = () => app.renderer.xr.isPresenting;

  tray.onPick = (tool, pointer) => {
    if (paused || state === 'title' || state === 'final') { sfx.play('click'); return; }
    const had = held.get(pointer);
    if (had) returnTool(had);
    const holder = pointer.object || app.camera;
    tray.give(tool, holder, pointer.object ? XR_POS : DESK_POS, pointer.object ? XR_QUAT : DESK_QUAT);
    tool.pointer = pointer;
    tool.inMouth = false;
    held.set(pointer, tool);
    sfx.play('pick');
    haptic(pointer, 0.3, 40);
    lastPointer = pointer;
    if (jobFor(tool.id)) hes = 0;
    if (hinted && tool.id === hinted) { hinted = null; tray.highlight(null); }
    if (mode === 'tutorial' && state === 'treat') {
      const want = curStep(job)?.tool;
      if (tool.id === want) { tray.highlight(null); assistant.say('Bagus! Dekatkan ujungnya ke cincin pink di mulut pasien, lalu tahan.', 3.2); }
    }
  };
  function returnTool(tool) {
    if (!tool || tool.home) return;
    if (tool.id === 'forceps') for (const j of jobs) j.work.releasePulled();
    held.delete(tool.pointer);
    tray.putBack(tool);
    sfx.loop(tool.sound || 'none', false);
    sfx.play('drop');
  }
  function returnAll() { for (const t of [...held.values()]) returnTool(t); }
  // Grip button (squeeze) puts the tool back; Space does it on desktop.
  const squeeze = (e) => { const p = app.pointers.controllers.find((c) => c.object === e.target); if (p) returnTool(held.get(p)); };
  for (const c of app.pointers.controllers) c.object.addEventListener('squeezestart', squeeze);
  const onKey = (e) => { if (e.code === 'Space') returnAll(); };
  window.addEventListener('keydown', onKey);

  function haptic(pointer, v, ms) {
    try { pointer?.gamepad?.hapticActuators?.[0]?.pulse?.(v, ms); } catch { /* no haptics */ }
  }

  // desktop: click-and-hold on the mouth
  let deskWork = null;
  let mouthTarget = null;
  function makeMouthTarget(ch) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.085, 12, 8), new THREE.MeshBasicMaterial({ visible: false }));
    m.position.set(0, 0, 0.02);
    ch.mouth.add(m);
    app.addTarget(m, { enabled: false, onHold: (hit, pointer) => { deskWork = { hit, pointer, frame: frameNo }; } });
    return m;
  }
  // scared patients: point at them and press the trigger to calm them down
  let calmTarget = null;
  function makeCalmTarget(ch) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 8), new THREE.MeshBasicMaterial({ visible: false }));
    m.position.set(0, -0.1, 0);
    ch.head.add(m);
    app.addTarget(m, { enabled: true, onSelect: (hit, pointer) => calmDown(pointer) });
    return m;
  }

  // the X-ray screen
  boards.onXray = () => {
    if (paused) return;
    const xj = jobFor('xray');
    if (state === 'treat' && xj && !boards.xray.scanning) {
      activate(xj);
      boards.xray.startScan();
      sfx.play('scan');
    } else if (!boards.xray.scanning && caseId) {
      boards.xray.startScan();
      sfx.play('scan');
    } else sfx.play('click');
  };
  boards.onScanDone = () => {
    const xj = jobFor('xray');
    if (state === 'treat' && xj) {
      activate(xj);
      work?.progress('mirror', 1, 0);
      finishStep(null);
      assistant.say('Itu dia gigi yang sakit, Dokter!', 2);
      assistant.act('point', 1.4);
    }
  };

  // ------------------------------------------------------------------ the door (shared by everyone)
  function doorOpen() { doorUsers++; if (room.door.want !== 1) sfx.play('door'); room.door.want = 1; }
  function doorClose() {
    doorUsers = Math.max(0, doorUsers - 1);
    if (doorUsers === 0) { room.door.want = 0; sfx.play('door-close'); }
  }

  // ------------------------------------------------------------------ patients
  const used = new Set();
  let forced = []; // test hook: [{ personality, caseId }] used by the next patients
  function makePatientData() {
    if (forced.length) {
      const f = forced.shift();
      const base = f.personality === 'kid' ? KIDS[0] : PATIENTS[Math.floor(Math.random() * PATIENTS.length)];
      const look = { ...base.look, ...(f.personality === 'vip' ? { shades: true, top: '#f2d27a' } : {}) };
      const ids = f.caseIds || [f.caseId];
      return { name: base.name, look, personality: f.personality, caseId: ids[0], caseIds: ids.length > 1 ? ids : undefined, complaint: ids.map((id) => pick(CASES[id].complaints)).join(' Terus... ') };
    }
    if (mode === 'tutorial') return { ...PATIENTS[0], personality: 'normal', caseId: 'scaling', complaint: CASES.scaling.complaints[0] };
    const roll = Math.random();
    let personality = roll < 0.4 ? 'normal' : roll < 0.55 ? 'scared' : roll < 0.7 ? 'chatty' : roll < 0.85 ? 'vip' : 'kid';
    if (personality !== 'normal' && !config.types[personality]) personality = 'normal';
    // kids need a treatment for kids
    const kidCases = ['checkup', 'filling', 'scaling'].filter((k) => config.cases[k]);
    if (personality === 'kid' && !kidCases.length) personality = 'normal';
    let pool = personality === 'kid' ? KIDS : PATIENTS;
    const fresh = pool.filter((p) => !used.has(p.name));
    if (fresh.length) pool = fresh; else used.clear();
    const base = pick(pool);
    used.add(base.name);
    const on = (k) => config.cases[k];
    let cases = personality === 'kid'
      ? [...kidCases, ...(on('checkup') ? ['checkup'] : [])]
      : Object.keys(CASES).filter((k) => !CASES[k].kidsOnly && on(k));
    if (!cases.length) cases = Object.keys(CASES).filter((k) => !CASES[k].kidsOnly);
    const cid = pick(cases);
    // some adults come with two problems at once (harder, more points)
    const pairs = PAIRS.filter((pr) => pr.every(on));
    const pair = personality !== 'kid' && pairs.length && Math.random() < config.pairChance ? pick(pairs) : null;
    const look = { ...base.look };
    if (personality === 'vip') { look.shades = true; look.top = '#f2d27a'; }
    return {
      name: personality === 'vip' ? `${base.name} (VIP)` : base.name,
      look,
      personality,
      caseId: pair ? pair[0] : cid,
      caseIds: pair || undefined,
      complaint: pair ? `${pick(CASES[pair[0]].complaints)} Terus... ${pick(CASES[pair[1]].complaints).toLowerCase()}` : pick(CASES[cid].complaints),
    };
  }

  function newCharacter(data) {
    const pers = PERSONALITIES[data.personality];
    const ch = new Character({ height: pers.height || 1.0 + Math.random() * 0.1, ...data.look });
    ch.onStep = () => sfx.play('footstep');
    // a little gibberish voice: kids high, long hair a bit higher, others lower
    const female = ['long', 'bob', 'pony', 'bun'].includes(data.look.hairStyle);
    const pitch = (data.personality === 'kid' ? 420 : female ? 255 : 150) * (0.9 + Math.random() * 0.2);
    const base = data.personality === 'kid' ? 'kid' : female ? 'woman' : 'man';
    const seed = Math.floor(Math.random() * 1000); // which of the recorded voices this patient gets
    ch.onSay = voiceFor(ch, () => voices.variant(base, seed), pitch, 0.95 + Math.random() * 0.11, () => patient?.ch === ch);
    group.add(ch.root);
    return ch;
  }

  function removeCharacter(ch) {
    group.remove(ch.root);
    ch.dispose();
    walkers.delete(ch);
  }

  /** A new patient comes in through the door and sits on the bench. */
  async function arriveToBench() {
    const seat = BENCH.find((s) => !waiting.some((w) => w.seat === s));
    if (!seat) return;
    const data = makePatientData();
    if (mode === 'shift') spawned++;
    const ch = newCharacter(data);
    const max = (40 + stepsOf(data) * 6) * PERSONALITIES[data.personality].patience * config.patienceMult;
    const w = { ...data, ch, seat, patience: 1, max, bar: makeBar(), state: 'walking', lookVec: new THREE.Vector3() };
    w.bar.visible = false;
    group.add(w.bar);
    waiting.push(w);
    ch.root.position.set(DOOR_OUT.x, 0, DOOR_OUT.z + 0.1);
    const my = token;
    doorOpen();
    await ch.walkTo([DOOR_IN, { x: 1.7, z: -2.5 }, seat.front], { speed: 1.1 });
    if (my !== token || w.state !== 'walking') return;
    doorClose();
    await ch.sitDown(seat);
    if (my !== token || w.state !== 'walking') return;
    w.state = 'seated';
    w.bar.visible = true;
    ch.face('neutral');
    ch.lookAt(head);
    if (data.personality === 'chatty') ch.say(pick(LINES.chat), 2.2);
    else if (data.personality === 'kid') ch.say(pick(LINES.kidHello), 2.2);
    else if (data.personality === 'vip') ch.say(pick(LINES.vipHello), 2.2, 'angry');
    else ch.say(pick(LINES.hello), 1.6);
    // the chair is free and nobody else is coming: call them right away
    if (state === 'idle') callNext();
  }

  // ------------------------------------------------------------------ life on the bench
  const PHONE_GEO = new THREE.BoxGeometry(0.035, 0.065, 0.007);
  const PHONE_MAT = new THREE.MeshStandardMaterial({ color: '#2e3b36', emissive: '#7fd0ff', emissiveIntensity: 0.25, roughness: 0.3 });
  function benchIdle(w, dt) {
    const ch = w.ch;
    ch.swingLegs = w.personality === 'kid' || w.idle === 'legs';
    if (w.idle) { w.idleLeft -= dt; if (w.idleLeft <= 0) endIdle(w); }
    w.idleT = (w.idleT ?? 1 + Math.random() * 3) - dt;
    if (w.idleT <= 0 && !w.idle) {
      w.idleT = 5 + Math.random() * 5;
      const other = waiting.find((o) => o !== w && o.state === 'seated');
      startIdle(w, pick(other ? ['phone', 'yawn', 'legs', 'chat', 'chat'] : ['phone', 'yawn', 'legs', 'phone']), other);
    }
    // the bench faces -X: the phone is in front of them and a little down
    if (w.idle === 'phone') ch.lookAt(ch.headWorld(w.lookVec).add(_phoneLook));
    else if (w.idle === 'chat' && w.other?.ch && waiting.includes(w.other)) ch.lookAt(w.other.ch.headWorld(w.lookVec));
    else ch.lookAt(head);
  }
  const _phoneLook = new THREE.Vector3(-0.3, -0.45, 0);
  function startIdle(w, kind, other) {
    const ch = w.ch;
    w.idle = kind;
    if (kind === 'phone') {
      ch.holdItem(new THREE.Mesh(PHONE_GEO, PHONE_MAT));
      ch.act('scroll', 4.2);
      w.idleLeft = 4.2;
    } else if (kind === 'yawn') {
      ch.face('yawn');
      ch.act('stretch', 1.8);
      ch.say(pick(LINES.yawn), 1.4);
      w.idleLeft = 1.8;
    } else if (kind === 'legs') {
      w.idleLeft = 4;
    } else if (kind === 'chat') {
      w.other = other;
      ch.face('talk');
      ch.say(pick(LINES.chat), 2.4);
      w.idleLeft = 3;
      // the other one looks back and laughs
      if (!other.idle) { other.idle = 'chat'; other.other = w; other.idleLeft = 3; guard(wait(1.4).then(() => { if (waiting.includes(other)) { other.ch.face('happy'); other.ch.say('Hahaha!', 1.0, 'happy'); } })); }
    }
  }
  function endIdle(w) {
    if (!w.idle) return;
    w.ch.dropItem();
    w.ch.action = null;
    w.ch.swingLegs = w.personality === 'kid';
    w.ch.face(w.patience < 0.3 ? 'mad' : 'neutral');
    w.idle = null;
    w.other = null;
  }

  /** A waiting patient gives up and leaves. */
  async function benchGiveUp(w) {
    endIdle(w);
    w.state = 'leaving';
    waiting.splice(waiting.indexOf(w), 1);
    group.remove(w.bar);
    const ch = w.ch;
    walkers.add(ch);
    ch.face('mad');
    ch.act('fist', 1.2);
    ch.say(pick(LINES.waitBored), 2.2, 'angry');
    sfx.play('grr');
    combo = 0;
    if (mode === 'shift') { served++; shift.lost++; shift.results.push({ left: true, stars: 0, points: 0 }); }
    if (mode === 'event') showPop('Pasien pulang!', 'kelamaan menunggu', true);
    refreshCard(true);
    await ch.standUp(w.seat.front);
    ch.face('sad');
    doorOpen();
    await ch.walkTo([{ x: 1.7, z: -2.5 }, DOOR_IN, DOOR_OUT], { speed: 0.8, sad: true });
    doorClose();
    removeCharacter(ch);
    checkShiftEnd();
  }

  function makeBar() {
    const c = document.createElement('canvas');
    c.width = 256; c.height = 64;
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false }));
    s.scale.set(0.3, 0.075, 1);
    s.userData = { c, tex, last: -1 };
    return s;
  }
  function drawBar(bar, v) {
    const k = Math.round(v * 30);
    if (k === bar.userData.last) return;
    bar.userData.last = k;
    const { c, tex } = bar.userData;
    const g = c.getContext('2d');
    g.clearRect(0, 0, 256, 64);
    g.fillStyle = 'rgba(255,255,255,0.95)';
    g.beginPath(); g.roundRect(4, 8, 248, 48, 24); g.fill();
    g.fillStyle = '#e7ece9';
    g.beginPath(); g.roundRect(56, 20, 184, 24, 12); g.fill();
    g.fillStyle = v > 0.5 ? P.mintDeep : v > 0.25 ? P.gold : P.red;
    g.beginPath(); g.roundRect(56, 20, Math.max(6, 184 * v), 24, 12); g.fill();
    g.font = '40px system-ui';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(v > 0.5 ? '🙂' : v > 0.25 ? '😐' : '😠', 30, 34);
    tex.needsUpdate = true;
  }

  /** Bring the next patient to the chair: from the bench, or straight from the door. */
  function callNext() {
    if (state !== 'idle') return;
    if (mode === 'shift' && served >= config.patientsPerShift) return;
    const w = waiting.find((x) => x.state === 'seated');
    if (w) { guard(runPatient(w)); return; }
    // nobody seated yet: if someone is still walking in they'll be called when they sit down
    if (waiting.length) return;
    if (mode === 'shift' && spawned >= config.patientsPerShift) return;
    guard(runPatient(null));
  }

  function nextPatient() {
    if (state !== 'result') return;
    state = 'idle';
    caseId = null;
    layout();
    refreshCard(true);
    if (!checkShiftEnd()) callNext();
  }

  async function runPatient(fromBench) {
    const my = token;
    state = 'arriving';
    stepIdx = 0;
    stepProgress = 0;
    mistakes = 0;
    elapsed = 0;
    calmLeft = 0;
    calmBonus = 0;
    sleeping = false;
    funny = null;
    let ch;
    let data;
    if (fromBench) {
      endIdle(fromBench);
      fromBench.ch.swingLegs = false;
      fromBench.state = 'called';
      waiting.splice(waiting.indexOf(fromBench), 1);
      group.remove(fromBench.bar);
      data = fromBench;
      ch = fromBench.ch;
      patient = { ...data, ch };
      caseId = data.caseId;
      layout();
      refreshCard(true);
      ch.say('Giliranku!', 1.2);
      await ch.standUp(fromBench.seat.front);
      if (my !== token) return;
      await ch.walkTo([{ x: 1.15, z: -1.25 }, STAND], { speed: 1.1 });
    } else {
      data = makePatientData();
      if (mode === 'shift') spawned++;
      ch = newCharacter(data);
      patient = { ...data, ch };
      caseId = data.caseId;
      layout();
      refreshCard(true);
      ch.root.position.set(DOOR_OUT.x, 0, DOOR_OUT.z + 0.1);
      await wait(0.3);
      doorOpen();
      const walk = ch.walkTo([DOOR_IN, { x: 1.0, z: -1.7 }, STAND]);
      await wait(1.4);
      doorClose();
      await walk;
    }
    if (my !== token) return;
    if (!xr()) mouthTarget = makeMouthTarget(ch);
    const pers = personality();
    patienceMax = (30 + stepsOf(data) * 9) * pers.patience * config.patienceMult;
    patience = 1;
    ch.lookAt(head);
    ch.face('happy');
    ch.act('wave', 1.8);
    const hello = data.personality === 'kid' ? LINES.kidHello : data.personality === 'vip' ? LINES.vipHello : data.personality === 'scared' ? LINES.scared : LINES.hello;
    ch.say(pick(hello), 1.8);
    sfx.play('hello');
    if (data.personality === 'scared') ch.face('scared');
    await wait(1.6);
    ch.face('talk');
    ch.say(data.complaint, 3.0);
    assistant.lookAt(ch.headWorld(new THREE.Vector3()));
    await wait(2.8);
    ch.face(data.personality === 'scared' ? 'scared' : 'neutral');
    await ch.sitDown(SEAT);
    if (my !== token) return;
    room.chair.want = 1;
    jobs = makeJobs(data, ch);
    job = null;
    activate(jobs[0]);
    for (const j of jobs) j.work.onCount = (n) => { if (n % 2 === 0 || n === 12) assistant.say(`${n}!`, 0.6); };
    const xj = jobs.find((j) => j.steps.some((st) => st.tool === 'xray'));
    if (xj) boards.xray.show(xj.caseId); else boards.xray.clear();
    hes = 0;
    helped = false;
    helpCost = 0;
    if (jobs.length > 1) assistant.say('Pasien ini punya 2 masalah, Dokter. Bebas mulai dari mana!', 3.2);
    assistant.lookAt(null);
    if (data.personality === 'scared') {
      state = 'calm';
      calmLeft = pers.calm;
      calmTarget = makeCalmTarget(ch);
      ch.act('shiver', 30);
      ch.say(pick(LINES.scared), 2.4, 'sad');
      assistant.say('Pasiennya takut, Dokter! Arahkan laser ke dia dan tekan trigger.', 3.4);
      layout();
      refreshCard(true);
      return;
    }
    beginTreatment();
  }

  function calmDown(pointer) {
    if (state !== 'calm' || paused) return;
    calmLeft--;
    sfx.play('calm');
    haptic(pointer, 0.3, 60);
    const ch = patient.ch;
    fx.emit('heart', ch.headWorld(tmp).add(new THREE.Vector3(0, 0.22, 0)), 3, { speed: 0.2, size: 0.05, up: 0.3, life: 1.1 });
    assistant.act('calm', 1.0);
    refreshCard(true);
    if (calmLeft > 0) { ch.say(calmLeft === 1 ? 'Hmm... sedikit lagi...' : 'Hiks... beneran tidak sakit?', 1.4, 'sad'); return; }
    calmBonus = 50;
    ch.action = null;
    ch.face('smiley');
    ch.say(pick(LINES.calmed), 1.6, 'happy');
    if (calmTarget) { app.removeTarget(calmTarget); calmTarget.removeFromParent(); calmTarget = null; }
    state = 'react';
    guard(wait(1.2).then(() => { if (state === 'react') beginTreatment(); }));
  }

  function beginTreatment() {
    const ch = patient.ch;
    ch.face('aaa');
    ch.say(pick(LINES.sit), 1.2);
    state = 'treat';
    treatStart = clock;
    if (mouthTarget) mouthTarget.userData.enabled = true;
    // one funny moment for some patients (never in the tutorial)
    if (mode !== 'tutorial' && config.funny && Math.random() < 0.45) funny = { kind: pick(['sneeze', 'phone', 'sleep', 'hiccup']), at: 3 + Math.random() * 4 };
    if (mode === 'tutorial') tutorialStep();
    else if (served === 0 && mode === 'shift') assistant.say('Pilih alat di baki, Dokter!', 2.2);
    layout();
    refreshCard(true);
  }

  function tutorialStep() {
    const step = curStep(job);
    if (!step) return;
    if (step.tool === 'xray') { assistant.say('Tekan layar rontgen di sebelah kiri!', 3); return; }
    tray.highlight(step.tool);
    const name = TOOL_INFO[step.tool].name;
    const lines = [
      `Langkah ${stepIdx + 1}: ${step.text.toLowerCase()}. Ambil ${name}, yang bercincin di baki!`,
    ];
    assistant.say(lines[0], 3.6);
    assistant.act('point', 1.6);
  }

  // ------------------------------------------------------------------ treating
  function workOn(tool, dt, pointer, entering) {
    if (state !== 'treat') return;
    const j = jobFor(tool.id);
    if (!j) {
      if (entering) mistake(tool, pointer);
      return;
    }
    activate(j);
    const step = job.steps[stepIdx];
    if (entering) haptic(pointer, 0.5, 40);
    if (step.rhythm && !rhythmGreen) {
      // filing while the light is red hurts a little and loses some progress
      if (!rhythmOuchCool) {
        rhythmOuchCool = 0.8;
        stepProgress = Math.max(0, stepProgress - 0.1);
        patient.ch.jump = 0.6;
        patient.ch.say(pick(LINES.rhythmOuch), 1.0, 'angry');
        sfx.play('aw');
        haptic(pointer, 0.8, 80);
      }
      sfx.loop(tool.sound || 'none', false);
      return;
    }
    stepProgress = Math.min(1, stepProgress + (demo ? dt * 1.6 : dt) / step.time); // the demo works a bit faster
    work.progress(step.tool, stepProgress, dt);
    if (tool.sound) sfx.loop(tool.sound, true);
    tool.working = true;
    haptic(pointer, TOOL_INFO[tool.id].sharp ? 0.25 : 0.12, 30);
    if (TOOL_INFO[tool.id].sharp && Math.random() < dt * 0.8) patient.ch.blink = 0;
    if (patient.personality === 'scared' && Math.random() < dt * 1.5) patient.ch.shake = Math.max(patient.ch.shake, 0.3);
    if (stepProgress >= 1) finishStep(tool);
  }
  let rhythmOuchCool = 0;

  function finishStep(tool) {
    const steps = job.steps;
    const step = steps[stepIdx];
    hes = 0;
    helped = false;
    if (tool) {
      work.done(step.tool, tool);
      sfx.loop(tool.sound || 'none', false);
      haptic(tool.pointer, 0.6, 80);
    }
    if (step.tool !== 'mirror') work.stopHighlight();
    sfx.play('step-done');
    fx.emit('star', patient.ch.mouthWorld(tmp), 6, { speed: 0.35, size: 0.035, life: 0.7, up: 0.15 });
    stepIdx++;
    stepProgress = 0;
    if (step.tool === 'syringe') { patient.ch.face('numb'); patient.ch.say(pick(LINES.numb), 1.6); guard(wait(1.8).then(() => { if (state === 'treat' && !sleeping) patient.ch.face('aaa'); })); }
    if (stepIdx >= steps.length) {
      job.done = true;
      job.idx = stepIdx;
      if (jobs.every((x) => x.done)) { guard(treatmentDone()); return; }
      activate(firstOpen());
      sfx.play('sparkle');
      assistant.say(`Satu beres! Sekarang ${CASES[caseId].title.toLowerCase()}, Dokter.`, 2.4);
      if (mode === 'tutorial') tutorialStep();
      return;
    }
    if (mode === 'tutorial') { tutorialStep(); return; }
    if (Math.random() < 0.5) assistant.say(pick(LINES.stepOk), 1.3);
  }

  function mistake(tool, pointer) {
    const ch = patient.ch;
    const kid = patient.personality === 'kid';
    const pain = kid || TOOL_INFO[tool.id].sharp;
    const tut = mode === 'tutorial';
    if (!tut) mistakes++;
    combo = 0;
    state = 'react';
    if (sleeping) { sleeping = false; ch.say('Hah?! Aku ketiduran?!', 1.0); }
    ch.face(pain ? 'pain' : 'mad');
    ch.jump = 1;
    ch.shake = 1;
    ch.act(pain ? 'cover' : 'fist', 1.4);
    ch.say(tut ? 'Eh? Bukan itu, Dokter...' : pick(kid ? LINES.kidPain : pain ? LINES.pain : LINES.mad), 1.8, 'angry');
    sfx.play(pain ? 'ouch' : 'grr');
    if (!tut) sfx.play('heart');
    haptic(pointer, 1, 200);
    const h = ch.headWorld(tmp);
    if (pain) {
      for (const s of [-1, 1]) fx.emit('tear', tmp2.copy(h).add(new THREE.Vector3(0, 0.03, 0)).addScaledVector(sideOf(ch), s * 0.08), kid ? 6 : 3, { speed: 0.4, size: 0.035, gravity: 1.6, up: 0.4, life: 0.9 });
    } else {
      fx.emit('anger', tmp2.copy(h).add(new THREE.Vector3(0.1, 0.17, 0)), 1, { speed: 0, size: 0.08, life: 1.2 });
      fx.emit('puff', tmp2.copy(h).add(new THREE.Vector3(0, 0.24, 0)), 6, { speed: 0.15, size: 0.07, up: 0.35, life: 1.0, grow: 1.5 });
    }
    assistant.act('facepalm', 1.1);
    const want = curStep(firstOpen())?.tool || 'mirror';
    const right = want === 'xray' ? null : TOOL_INFO[want].name;
    refreshCard(true);
    guard((async () => {
      await wait(0.45);
      returnTool(tool);
      await wait(0.6);
      if (mistakes >= maxHearts()) { await leaveSad(); return; }
      assistant.say(right ? `Dokter, coba pakai ${right}!` : `Dokter, ${TOOL_HINT.xray}!`, 2.4);
      assistant.act('point', 1.6);
      if (tut) tutorialStep();
      await wait(0.5);
      ch.face('aaa');
      if (!tut && mistakes === maxHearts() - 1) ch.say(pick(LINES.lastChance), 2.0, 'angry');
      state = 'treat';
    })());
  }

  function useHint() {
    const want = curStep(firstOpen());
    if (hintsLeft <= 0 || !want || !(state === 'treat' || state === 'react')) { sfx.play('click'); return; }
    hintsLeft--;
    bHint.userData.setLabel(hintLabel());
    sfx.play('sparkle');
    assistant.act('point', 1.4);
    if (want.tool === 'xray') { assistant.say('Petunjuk: tekan layar rontgen di sebelah kiri, Dokter!', 2.8); return; }
    hinted = want.tool;
    tray.highlight(want.tool);
    assistant.say(`Petunjuk: pakai ${TOOL_INFO[want.tool].name}, yang bercincin di baki!`, 2.8);
  }

  function nurseHands(id) {
    const tool = tray.tools[id];
    if (!tool || !tool.home) return;
    const ptr = xr()
      ? (lastPointer?.object ? lastPointer : app.pointers.controllers[1] || app.pointers.controllers[0])
      : app.pointers.mouse;
    if (!ptr) return;
    assistant.act('give', 1.4);
    assistant.face('smiley');
    assistant.say(`${pick(LINES.nurseGive)} ${TOOL_INFO[id].name}.`, 2.2);
    helpCost += 20;
    tray.onPick(tool, ptr);
    sfx.play('sparkle');
  }

  // ------------------------------------------------------------------ funny moments
  async function runFunny(kind) {
    const ch = patient.ch;
    const my = token;
    if (kind === 'sneeze') {
      state = 'react';
      ch.face('sneeze');
      ch.say('Ha... ha...', 1.0);
      sfx.play('sneeze-in');
      await wait(1.1);
      if (my !== token) return;
      ch.say('HACHOOO!', 1.2, 'angry');
      sfx.play('sneeze');
      ch.jump = 1;
      fx.emit('puff', ch.mouthWorld(tmp), 10, { speed: 0.6, size: 0.06, life: 0.8, grow: 1.2, dir: tmp2.copy(head).sub(tmp).normalize() });
      if (held.size) { returnAll(); assistant.say('Waduh, alatnya terpental!', 1.8); }
      assistant.act('shrug', 1.2);
      await wait(1.2);
      ch.face('aaa');
      ch.say('Maaf, Dokter... hehe', 1.2);
      if (state === 'react') state = 'treat';
    } else if (kind === 'phone') {
      state = 'react';
      sfx.play('ring');
      ch.face('talk');
      ch.act('phone', 3.0);
      ch.say(pick(LINES.phone), 2.8);
      assistant.say('Sebentar, Dokter... pasiennya angkat telepon.', 2.4);
      assistant.act('shrug', 1.4);
      await wait(3.0);
      ch.face('aaa');
      ch.say('Oke, lanjut Dokter!', 1.0);
      if (state === 'react') state = 'treat';
    } else if (kind === 'sleep') {
      sleeping = true;
      ch.face('sleep');
      ch.say('Zzz...', 1.6);
      assistant.say('Hihi, pasiennya tidur, Dokter. Pelan-pelan ya.', 2.2);
    } else if (kind === 'hiccup') {
      for (let i = 0; i < 4 && my === token && state !== 'done'; i++) {
        ch.jump = 0.7;
        sfx.play('hik');
        ch.say(i === 3 ? 'Hik! Maaf... hik!' : 'Hik!', 0.6);
        await wait(0.9);
      }
    }
  }

  function makeHandMirror() {
    const g = new THREE.Group();
    const handleM = new THREE.MeshStandardMaterial({ color: '#f4f1ea', roughness: 0.35 });
    const rimM = new THREE.MeshStandardMaterial({ color: '#d9dee2', metalness: 0.8, roughness: 0.25 });
    const handle = new THREE.Mesh(new THREE.CapsuleGeometry(0.009, 0.08, 4, 10), handleM);
    handle.position.y = -0.03;
    const frame = new THREE.Mesh(new THREE.TorusGeometry(0.055, 0.007, 8, 28), rimM);
    frame.position.y = -0.13;
    const glass = new THREE.Mesh(new THREE.CircleGeometry(0.055, 24), new THREE.MeshStandardMaterial({ color: '#eaf6ff', metalness: 0.9, roughness: 0.05, emissive: '#cfeaff', emissiveIntensity: 0.4, side: THREE.DoubleSide }));
    glass.position.y = -0.13;
    g.add(handle, frame, glass);
    // the handle sits in the hand; the mirror sticks out past the fingers
    return g;
  }

  // ------------------------------------------------------------------ scoring and leaving
  function scorePatient(left) {
    const steps = totalSteps();
    const par = 12 + steps * 6;
    const pers = personality();
    const fact = pick(FACTS[(jobs[jobs.length > 1 ? Math.floor(Math.random() * jobs.length) : 0] || {}).caseId || caseId]);
    if (left) {
      const points = doneSteps() * 50;
      return { name: patient.name, left: true, stars: 0, points, stepsDone: doneSteps(), steps, fact, mult: 1 };
    }
    const base = steps * 100;
    const perfect = mistakes === 0 ? 100 : 0;
    const speed = Math.max(0, Math.round((par - elapsed) * 4));
    const penalty = mistakes * 40 + helpCost;
    const extra = calmBonus + (sleeping ? 30 : 0) + (jobs.length > 1 ? 100 : 0);
    const extraLabel = jobs.length > 1 ? 'Bonus 2 masalah' : calmBonus ? 'Bonus menenangkan' : sleeping ? 'Pasien tertidur pulas' : '';
    if (mistakes === 0 && mode !== 'tutorial') combo++; else combo = 0;
    const mult = comboMult() * pers.points;
    const points = Math.max(0, Math.round((base + perfect + speed + extra - penalty) * mult));
    const stars = mistakes === 0 && elapsed <= par ? 3 : mistakes <= 1 ? 2 : 1;
    return { name: patient.name, left: false, stars, points, base, perfect, speed, penalty, extra, extraLabel, helped: helpCost > 0, mult: Math.round(mult * 10) / 10, fact };
  }

  async function treatmentDone() {
    state = 'done';
    returnAll();
    tray.highlight(null);
    if (mouthTarget) mouthTarget.userData.enabled = false;
    const ch = patient.ch;
    const r = scorePatient(false);
    finishPatient(r);
    ch.action = null;
    // the hand-mirror moment: they check their new smile
    ch.holdItem(makeHandMirror());
    ch.act('mirror', 1.8);
    ch.face('wow');
    ch.say(pick(LINES.mirror), 1.7, 'happy');
    sfx.play('sparkle');
    for (let i = 0; i < 4; i++) guard(wait(0.2 + i * 0.35).then(() => { fx.emit('star', ch.mouthWorld(tmp), 4, { speed: 0.25, size: 0.03, life: 0.7, up: 0.12, spread: 0.06 }); if (i === 2) sfx.play('sparkle'); }));
    await wait(1.8);
    ch.dropItem();
    ch.face('happy');
    ch.act('cheer', 2.2);
    ch.jump = 1;
    const kid = patient.personality === 'kid';
    ch.say(pick(kid ? LINES.kidThanks : LINES.thanks), 2.4, 'happy');
    sfx.play('win');
    if (kid) { ch.addSticker(); sfx.play('sticker'); }
    const h = ch.headWorld(tmp).clone();
    fx.emit('heart', h.clone().add(new THREE.Vector3(0, 0.22, 0)), 6, { speed: 0.3, size: 0.06, up: 0.35, life: 1.4 });
    fx.emit('star', h, 12, { speed: 0.6, size: 0.04, life: 1.0, up: 0.2 });
    if (r.mult > 1 && comboMult() > 1) celebrateCombo(h);
    guard(wait(0.45).then(() => takePhoto(r.stars)));
    assistant.act('clap', 2.0);
    assistant.face('happy');
    assistant.say(comboMult() > 1 ? `COMBO ×${comboMult()}! Luar biasa, Dokter!` : 'Hebat, Dokter!', 1.8);
    if (mode === 'event') showPop(`+${r.points}`, r.mult > 1 ? `×${r.mult}` : `${'★'.repeat(r.stars)}`);
    await wait(2.0);
    room.chair.want = 0;
    afterPatient(r, false);
  }

  function celebrateCombo(at) {
    sfx.play('combo');
    sfx.play('clap');
    const big = progress.has('confetti');
    fx.emit('confetti', at.clone().add(new THREE.Vector3(0, 0.6, 0)), big ? 60 : 30, { speed: 1.2, size: 0.035, life: 2.2, gravity: 0.9, up: 0.6, spread: 0.3 });
    if (big) fx.emit('confetti', new THREE.Vector3(0, 2.4, -0.6), 50, { speed: 0.6, size: 0.04, life: 2.6, gravity: 0.7, spread: 1.4 });
  }

  async function leaveSad(reason) {
    state = 'leaving';
    returnAll();
    tray.highlight(null);
    if (mouthTarget) mouthTarget.userData.enabled = false;
    const ch = patient.ch;
    const r = scorePatient(true);
    combo = 0;
    finishPatient(r);
    ch.action = null;
    ch.face('sad');
    ch.say(reason === 'bored' ? pick(LINES.waitBored) : pick(LINES.leave), 2.4, 'sad');
    sfx.play('sad');
    assistant.act('shrug', 1.6);
    assistant.face('sad');
    if (mode === 'event') showPop('Pasien kecewa', reason === 'bored' ? 'kelamaan' : 'salah alat', true);
    await wait(1.8);
    room.chair.want = 0;
    afterPatient(r, true);
  }

  function finishPatient(r) {
    shift.score += r.points;
    shift.stars += r.stars;
    if (r.left) shift.lost++; else shift.happy++;
    shift.results.push(r);
    if (mode === 'shift') served++;
    rhythmOn = false;
    rhythmPanel.mesh.visible = false;
    refreshCard(true);
  }

  /** Patient is done (happy or not): walk them out and move on. */
  function afterPatient(r, sad) {
    const pt = patient;
    if (calmTarget) { app.removeTarget(calmTarget); calmTarget = null; }
    if (mouthTarget) { app.removeTarget(mouthTarget); mouthTarget = null; }
    disposeJobs();
    boards.xray.clear();
    patient = null;
    guard(walkOut(pt.ch, sad));
    if (mode === 'tutorial') { progress.tutorialDone = true; finish(); return; }
    if (mode === 'shift') {
      if (served >= config.patientsPerShift) { finish(); return; }
      bigContent = { kind: 'result', r };
      state = 'result';
      big.redraw();
      layout();
      starPop = 1;
      sfx.play('star');
      return;
    }
    // event: straight on to the next patient
    state = 'idle';
    caseId = null;
    layout();
    refreshCard(true);
    guard(wait(0.8).then(() => callNext()));
  }

  async function walkOut(ch, sad) {
    walkers.add(ch);
    await ch.standUp(EXIT);
    ch.lookAt(null);
    if (!sad) ch.face('happy');
    doorOpen();
    await ch.walkTo([{ x: 1.0, z: -1.7 }, DOOR_IN, DOOR_OUT], { speed: sad ? 0.8 : 1.2, sad });
    doorClose();
    removeCharacter(ch);
  }

  function checkShiftEnd() {
    if (mode !== 'shift' || state === 'final') return false;
    if (served >= config.patientsPerShift && (state === 'idle' || state === 'result')) { finish(); return true; }
    return false;
  }

  function finish() {
    if (state === 'final') return;
    // stop everything that was still scheduled (treatment steps, arrivals...)
    token++;
    for (const t of timers) t.done();
    timers = [];
    state = 'final';
    returnAll();
    tray.highlight(null);
    rhythmOn = false;
    rhythmPanel.mesh.visible = false;
    let unlocked = [];
    let newBest = false;
    let rankUp = null;
    if (mode !== 'tutorial') {
      const before = progress.rank().name;
      newBest = shift.score > progress.best(mode);
      lastEntry = progress.addScore(shift.score, mode, playerName);
      unlocked = progress.addStars(shift.stars);
      const after = progress.rank().name;
      if (after !== before) rankUp = after;
      if (unlocked.length || rankUp) sfx.play('unlock');
      tray.setGold(progress.has('golddrill'));
      boards.decor.apply();
      boards.rank.redraw();
    }
    if (mode === 'event') {
      sfx.play('buzzer');
      // everyone still around goes home
      if (patient) { const pt = patient; patient = null; disposeJobs(); room.chair.want = 0; guard(walkOut(pt.ch, false)); }
    }
    for (const w of [...waiting]) { waiting.splice(waiting.indexOf(w), 1); group.remove(w.bar); w.state = 'leaving'; walkers.add(w.ch); guard((async () => { await w.ch.standUp(w.seat.front); doorOpen(); await w.ch.walkTo([{ x: 1.7, z: -2.5 }, DOOR_IN, DOOR_OUT], { speed: 1.1 }); doorClose(); removeCharacter(w.ch); })()); }
    bigContent = { kind: 'final', newBest, unlocked, rankUp, patients: mode === 'event' ? shift.results.length : config.patientsPerShift, prize: null, place: lastEntry && mode !== 'tutorial' ? progress.placeToday(lastEntry) : 0, plays: progress.playsToday() };
    lbPanel.redraw();
    wheelReady = config.wheelFor(mode) && config.activePrizes().length > 0;
    big.redraw();
    layout();
    starPop = 1;
    sfx.play('win');
    assistant.act('clap', 2);
    assistant.face('happy');
    assistant.say(mode === 'tutorial' ? 'Hebat! Sekarang coba Mulai kerja, Dokter!' : shift.lost === 0 ? 'Semua pasien senang! Keren!' : 'Kerja bagus, Dokter!', 2.8);
    fx.emit('confetti', new THREE.Vector3(0, 2.3, -1.0), 40, { speed: 0.7, size: 0.04, life: 2.4, gravity: 0.7, spread: 1.2 });
  }

  // ------------------------------------------------------------------ starting, resetting
  function resetAll() {
    token++;
    for (const t of timers) t.done();
    timers = [];
    returnAll();
    tray.highlight(null);
    sfx.stopAll();
    disposeJobs();
    if (patient) { removeCharacter(patient.ch); patient = null; }
    for (const w of waiting) { removeCharacter(w.ch); group.remove(w.bar); }
    waiting.length = 0;
    for (const ch of [...walkers]) removeCharacter(ch);
    if (mouthTarget) { app.removeTarget(mouthTarget); mouthTarget = null; }
    if (calmTarget) { app.removeTarget(calmTarget); calmTarget = null; }
    boards.xray.clear();
    doorUsers = 0;
    room.door.want = 0;
    room.chair.want = 0;
    caseId = null;
    rhythmOn = false;
    rhythmPanel.mesh.visible = false;
    pop.mesh.visible = false;
  }

  function start(m) {
    resetAll();
    photo.reset();
    photoOpen = false;
    bPhoto.userData.setLabel('Foto kenangan');
    if (wheelOpen) { wheel.close(); wheelOpen = false; }
    wheelReady = false;
    mode = m;
    shift = { score: 0, stars: 0, happy: 0, lost: 0, results: [] };
    served = 0;
    spawned = 0;
    combo = 0;
    hintsLeft = mode === 'tutorial' ? 0 : config.hints;
    hinted = null;
    bHint.userData.setLabel(hintLabel());
    eventLeft = config.eventMinutes * 60;
    clinicTime = 8;
    nextArrival = mode === 'tutorial' ? Infinity : 7;
    used.clear();
    bHow.userData.setLabel('Cara main');
    state = 'idle';
    layout();
    refreshCard(true);
    assistant.face('smiley');
    assistant.say(m === 'tutorial' ? 'Aku Suster Nana. Ikuti aku ya, Dokter!' : m === 'event' ? 'Mode event! 3 menit, ayo cepat!' : 'Ayo mulai, Dokter! Pasien pertama datang.', 2.6);
    sfx.play('yay');
    callNext();
  }

  function toTitle() {
    resetAll();
    if (wheelOpen) { wheel.close(); wheelOpen = false; }
    mode = null;
    state = 'title';
    bigContent = { kind: 'title' };
    clinicTime = 9.5;
    big.redraw();
    lbPanel.redraw();
    layout();
    boards.rank.redraw();
  }

  // ------------------------------------------------------------------ demo mode (idle booth: the clinic plays itself)
  // After DEMO_AFTER seconds on the start screen with no button pressed, patients keep coming and a
  // gloved "ghost" hand treats them with the right tools, so the booth TV (casting) shows movement.
  // Nothing is scored or saved. Any trigger press goes back to the start screen.
  const DEMO_AFTER = 45;
  let demoIdle = 0;
  let demoT = 0;
  const demoHand = new THREE.Group();
  {
    const glove = new THREE.MeshStandardMaterial({ color: '#8ec5ea', roughness: 0.55 });
    const palm = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.03, 0.09), glove);
    palm.position.set(0, -0.025, 0.04);
    demoHand.add(palm);
    for (let i = 0; i < 4; i++) {
      const f = new THREE.Mesh(new THREE.CapsuleGeometry(0.009, 0.045, 3, 6), glove);
      f.position.set(-0.027 + i * 0.018, -0.005, -0.012);
      f.rotation.x = Math.PI / 2 + 0.6;
      demoHand.add(f);
    }
    const thumb = new THREE.Mesh(new THREE.CapsuleGeometry(0.01, 0.04, 3, 6), glove);
    thumb.position.set(0.042, -0.012, 0.02);
    thumb.rotation.set(Math.PI / 2, 0, -0.7);
    demoHand.add(thumb);
    const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.04, 0.06, 10), glove);
    cuff.rotation.x = Math.PI / 2;
    cuff.position.set(0, -0.025, 0.11);
    demoHand.add(cuff);
  }
  demoHand.visible = false;
  demoHand.position.set(0.3, 1.15, -0.35);
  group.add(demoHand);
  const demoPointer = { id: 'demo', object: demoHand, pressed: false, justPressed: false, demo: true };
  const DEMO_PARK = new THREE.Vector3(0.32, 1.18, -0.38);
  const demoBanner = makePanel(1.0, 0.22, (c, W, H) => {
    c.fillStyle = P.pinkDeep;
    roundRect(c, 6, 6, W - 12, H - 12, H * 0.4);
    c.fill();
    c.lineWidth = 8;
    c.strokeStyle = '#ffffff';
    c.stroke();
    text(c, 'AYO MAIN! Jadi dokter gigi FDC', W / 2, H * 0.5, { size: H * 0.3, weight: 900, color: '#ffffff', align: 'center', maxWidth: W * 0.9 });
    text(c, 'Pegang controller, tekan trigger untuk mulai', W / 2, H * 0.8, { size: H * 0.17, weight: 700, color: '#fff3f6', align: 'center' });
  }, { ppm: 500 });
  demoBanner.mesh.position.set(0, 2.05, -1.32);
  demoBanner.mesh.visible = false;
  demoBanner.mesh.renderOrder = 3;
  group.add(demoBanner.mesh);
  const anyPress = () => app.pointers.mouse.pressed || app.pointers.controllers.some((c) => c.pressed);
  const _goal = new THREE.Vector3();
  const _tip = new THREE.Vector3();
  const _look = new THREE.Vector3();

  function startDemo() {
    demo = true;
    playerName = '';
    start('event');
    eventLeft = 1e6;
    demoHand.visible = true;
    demoHand.position.copy(DEMO_PARK);
    demoT = 1;
    assistant.say('Lihat nih, begini cara merawat gigi! Ayo coba!', 3);
  }
  function stopDemo() {
    if (!demo) return;
    demo = false;
    demoHand.visible = false;
    demoBanner.mesh.visible = false;
    toTitle();
    demoIdle = 0;
  }
  /** Point the hand's -z (where the tool points) at a spot, then move it so the tool tip ends up there. */
  function demoReach(goal, dt) {
    demoHand.updateMatrixWorld(true);
    _look.copy(demoHand.position).multiplyScalar(2).sub(goal);
    demoHand.lookAt(_look);
    const tool = held.get(demoPointer);
    if (tool) { tool.tip.getWorldPosition(_tip); demoHand.position.addScaledVector(_goal.copy(goal).sub(_tip), 1 - Math.exp(-dt * 5)); }
    else demoHand.position.lerp(goal, 1 - Math.exp(-dt * 4));
  }
  function demoPark(dt) {
    const tool = held.get(demoPointer);
    if (tool) returnTool(tool);
    demoHand.position.lerp(DEMO_PARK, 1 - Math.exp(-dt * 3));
  }
  function updateDemo(dt) {
    if (!demo) {
      demoBanner.mesh.visible = false;
      const idle = state === 'title' && bigContent.kind === 'title' && !paused && !wheelOpen;
      demoIdle = idle && !anyPress() ? demoIdle + dt : 0;
      if (demoIdle > DEMO_AFTER) startDemo();
      return;
    }
    if (anyPress() || state === 'title' || state === 'final') { stopDemo(); return; }
    demoBanner.mesh.visible = true;
    demoBanner.mesh.scale.setScalar(1 + Math.sin(clock * 3) * 0.03);
    demoT -= dt;
    if (state === 'calm') {
      demoPark(dt);
      if (demoT <= 0) { calmDown(demoPointer); demoT = 0.8; }
      return;
    }
    if (state !== 'treat' || !patient) { demoPark(dt); return; }
    const j = firstOpen();
    const step = curStep(j);
    if (!step) { demoPark(dt); return; }
    if (step.tool === 'xray') {
      demoPark(dt);
      if (demoT <= 0 && !boards.xray.scanning) { boards.onXray(); demoT = 2.5; }
      return;
    }
    const tool = held.get(demoPointer);
    if (!tool || tool.id !== step.tool) {
      demoPark(dt);
      if (demoT <= 0 && tray.tools[step.tool]) { tray.onPick(tray.tools[step.tool], demoPointer); demoT = 0.6; }
      return;
    }
    const tj = jobFor(tool.id);
    const target = tj ? tj.work.target(step.tool, jProg(tj)) : null;
    if (target) target.getWorldPosition(_goal); else patient.ch.mouthWorld(_goal);
    // filing in rhythm: wait just outside the mouth while the light is red
    if (step.rhythm && !rhythmGreen) _goal.y += 0.06;
    demoReach(_goal.clone(), dt);
  }

  // ------------------------------------------------------------------ per frame
  let frameNo = 0;
  let idleT = 1.5;
  let starPop = 0;
  let waitTalkT = 4;
  let chatT = 5;
  const assistantLook = new THREE.Vector3();

  function update(dt) {
    frameNo++;
    music.tryStart();
    if (!xr()) app.camera.position.set(0, 1.6, 0.3);
    app.camera.getWorldPosition(head);
    tickButtons(group, dt);
    // empty chair on a menu: fold the backrest down so it doesn't cover the board and buttons
    room.chair.flat = !patient && (state === 'title' || state === 'result' || state === 'final') ? 1 : 0;
    wheel.update(paused ? 0 : dt);
    if (wheelOpen && wheel.spun && !wheel.spinning && !bWheelGo.visible) bWheelGo.visible = true;
    bHint.visible = !paused && hintsLeft > 0 && !!patient && (state === 'treat' || state === 'react') && !!curStep(firstOpen());
    room.update(paused ? 0 : dt);
    fx.update(dt);
    tray.update(dt);
    boards.xray.update(dt);
    boards.decor.update(dt, clock);
    boards.tv.set({ mode: state === 'title' || demo ? null : mode === 'tutorial' ? null : mode, timeLeft: Math.ceil(eventLeft), score: shift.score, combo: comboMult(), name: playerName });
    room.setTime(clinicTime);
    updateCountdown(dt);
    updateDemo(dt);
    if (paused) return;

    clock += dt;
    for (const t of [...timers]) {
      t.t -= dt;
      if (t.t <= 0) { timers.splice(timers.indexOf(t), 1); t.done(); }
    }
    const playing = mode && state !== 'title' && state !== 'final';
    // the clinic day moves on: about one hour per 40 s (an event round runs 08:00 to ~14:00)
    if (playing && state !== 'result') clinicTime = Math.min(19.5, clinicTime + dt / (mode === 'event' ? 30 : 40));

    // event clock
    if (playing && mode === 'event') {
      eventLeft -= dt;
      // the last 10 seconds: a count beep each second (higher for 3-2-1), a tock on the half,
      // faster music and a big pulsing number for the player and the crowd
      const sec = Math.ceil(eventLeft);
      if (eventLeft <= 10 && sec !== Math.ceil(eventLeft + dt)) { sfx.play(sec <= 3 ? 'count-hi' : 'count'); countPulse = 1; }
      else if (eventLeft <= 10 && Math.ceil(eventLeft * 2) !== Math.ceil((eventLeft + dt) * 2)) sfx.play('tock');
      music.setRate(eventLeft <= 10 ? 1.35 : 1);
      if (eventLeft <= 0) { eventLeft = 0; music.setRate(1); finish(); }
    }

    // new arrivals for the bench
    if (playing && mode !== 'tutorial' && state !== 'result') {
      nextArrival -= dt;
      const roomLeft = mode === 'event' || spawned < config.patientsPerShift;
      if (nextArrival <= 0 && roomLeft && waiting.length < BENCH_SEATS) {
        nextArrival = mode === 'event' ? 7 + Math.random() * 5 : 10 + Math.random() * 6;
        guard(arriveToBench());
      }
    }

    // waiting patients: patience drains (not while you read a result card)
    waitTalkT -= dt;
    for (const w of [...waiting]) {
      if (w.state === 'seated' && playing && state !== 'result') {
        w.patience -= dt / w.max;
        if (w.patience <= 0) { guard(benchGiveUp(w)); continue; }
        if (w.patience < 0.3 && w.ch.faceName !== 'mad') { w.ch.face('mad'); w.ch.act('fist', 1); }
      }
      if (w.state === 'seated') benchIdle(w, dt); else w.ch.lookAt(head);
      w.ch.update(dt);
      if (w.bar.visible) {
        drawBar(w.bar, Math.max(0, w.patience));
        w.ch.headWorld(w.bar.position).y += 0.33;
      }
    }
    if (waitTalkT <= 0 && waiting.length) {
      waitTalkT = 5 + Math.random() * 5;
      const w = pick(waiting);
      if (w.state === 'seated' && !w.ch.bubble.time) w.ch.say(w.personality === 'chatty' ? pick(LINES.chat) : w.patience < 0.3 ? pick(LINES.waitBored) : pick(LINES.waiting), 2.2);
    }
    for (const ch of walkers) ch.update(dt);

    // the patient in the chair
    if (patient) {
      const ch = patient.ch;
      if (state === 'calm') ch.shake = Math.max(ch.shake, 0.25);
      if (ch.lookTarget) ch.lookTarget = head;
      if (state === 'treat' && held.size) {
        const tool = [...held.values()][0];
        tool.tip.getWorldPosition(tmp);
        ch.lookAt(tmp.distanceTo(ch.mouthWorld(tmp2)) < 0.35 ? head : tool.tip.getWorldPosition(new THREE.Vector3()));
      } else if (state === 'treat' || state === 'react' || state === 'calm') ch.lookAt(head);
      // during treatment the mouth always stays open with the teeth showing, whatever the face
      ch.treating = state === 'treat' || state === 'react';
      ch.update(dt);
      // patience in the chair (none in the tutorial)
      if ((state === 'treat' || state === 'calm') && mode !== 'tutorial') {
        patience -= dt / patienceMax;
        if (patience <= 0) { patience = 0; guard(leaveSad('bored')); }
      }
      // hesitating too long: Suster Nana hands over the right tool (costs a few points)
      if (state === 'treat' && mode !== 'tutorial') {
        const want = curStep(firstOpen());
        const holdingRight = [...held.values()].some((t) => jobFor(t.id));
        if (want && want.tool !== 'xray' && !holdingRight) hes += dt; else hes = 0;
        if (hes > 9 && !helped && config.nurseHelp) { helped = true; nurseHands(want.tool); }
      }
      // chatty patients keep talking
      if (state === 'treat' && patient.personality === 'chatty') {
        chatT -= dt;
        if (chatT <= 0) { chatT = 4 + Math.random() * 3; ch.say(pick(LINES.chat), 2.2); }
      }
      // funny moment
      if (funny && state === 'treat' && clock - treatStart > funny.at) { const f = funny.kind; funny = null; guard(runFunny(f)); }
      if (sleeping && state === 'treat' && Math.random() < dt * 1.3) {
        fx.emit('zzz', ch.headWorld(tmp).add(new THREE.Vector3(0.08, 0.2, 0)), 1, { speed: 0.05, size: 0.06, up: 0.18, life: 1.6 });
        if (Math.random() < 0.4) sfx.play('snore');
      }
    }
    // the assistant watches the dentist, or the tool in their hand
    const tool0 = [...held.values()][0];
    if (tool0) assistant.lookAt(tool0.tip.getWorldPosition(assistantLook));
    else if (!assistant.lookTarget || assistant.lookTarget === assistantLook) assistant.lookAt(head);
    if (state === 'title' || state === 'final' || state === 'idle' || state === 'result' || state === 'arriving') {
      idleT -= dt;
      if (idleT <= 0 && !assistant.action) {
        idleT = 5 + Math.random() * 4;
        const busy = state !== 'title' && state !== 'final';
        assistant.act(busy ? 'tidy' : pick(['wave', 'thumbs', 'tidy']), busy ? 2.4 : 1.8);
        if (busy && Math.random() < 0.6) sfx.play('tick');
        assistant.face('smiley');
        if (state === 'title' && !progress.tutorialDone && Math.random() < 0.6) assistant.say('Baru pertama? Coba Tutorial dulu, Dokter!', 2.6);
      }
    }
    assistant.update(dt);
    if (assistant.faceName !== 'neutral' && !assistant.bubble.time && !assistant.action) assistant.face('neutral');

    // rhythm light for the root canal file
    const step = curStep(job);
    rhythmOn = !!(step?.rhythm && (state === 'treat' || state === 'react'));
    rhythmPanel.mesh.visible = rhythmOn;
    if (rhythmOuchCool > 0) rhythmOuchCool = Math.max(0, rhythmOuchCool - dt);
    if (rhythmOn) {
      rhythmT += dt;
      const g = rhythmT % 1.3 < 0.75;
      if (g !== rhythmGreen) { rhythmGreen = g; rhythmPanel.redraw(); if (g) sfx.play('beat'); }
      patient.ch.headWorld(rhythmPanel.mesh.position).y += 0.36;
      rhythmPanel.mesh.lookAt(head);
    }

    // tools touching the mouth
    ring.visible = false;
    if (state === 'treat' || state === 'react') {
      elapsed = clock - treatStart;
      const mouth = patient ? patient.ch.mouthWorld(tmp2) : null;
      for (const [pointer, tool] of held) {
        tool.working = false;
        let inside = false;
        const tj = jobFor(tool.id);
        const tstep = curStep(tj);
        const target = tstep ? tj.work.target(tstep.tool, jProg(tj)) : null;
        if (target) {
          target.getWorldPosition(tmp3);
          ring.visible = true;
          ring.position.copy(tmp3);
          ring.lookAt(head);
          ring.scale.setScalar(1 + Math.sin(clock * 8) * 0.15);
        }
        if (pointer.object) {
          tool.tip.getWorldPosition(tmp);
          inside = mouth && tmp.distanceTo(mouth) < MOUTH_REACH;
          // the right tool has to touch the exact tooth for tooth-by-tooth steps
          if (inside && target) inside = tmp.distanceTo(tmp3) < TARGET_REACH;
        } else if (deskWork && deskWork.pointer === pointer && frameNo - deskWork.frame <= 1) {
          inside = true;
          // move the tool so its tip touches where you clicked (or the target tooth)
          const at = target ? tmp3 : deskWork.hit.point;
          const local = app.camera.worldToLocal(tmp.copy(at));
          tool.holdPos = local.sub(tool.tip.position.clone().applyQuaternion(DESK_QUAT));
        } else if (!pointer.object) {
          tool.holdPos = DESK_POS.clone();
        }
        const entering = inside && !tool.inMouth;
        tool.inMouth = inside;
        if (inside) workOn(tool, dt, pointer, entering);
        if (!tool.working && tool.sound) sfx.loop(tool.sound, false);
      }
      for (const j of jobs) j.work.update(dt);
    } else for (const j of jobs) j.work.update(dt);
    if (playing) refreshCard();

    if (popT > 0) {
      popT -= dt;
      pop.mesh.position.y = 1.62 + (2.2 - popT) * 0.05;
      if (popT <= 0) pop.mesh.visible = false;
    }
    if (starPop > 0) starPop = Math.max(0, starPop - dt);
    big.mesh.scale.setScalar(1 + Math.sin(starPop * Math.PI) * 0.04);
  }

  // first screen
  assistant.lookAt(head);
  assistant.say('Selamat datang di FDC Dental Clinic, Dokter!', 3);
  layout();

  // debug hooks for testing in a browser console
  window.dentist = {
    get state() { return state; },
    get mode() { return mode; },
    get step() { return curStep(firstOpen())?.tool; },
    get jobs() { return jobs; },
    get patient() { return patient?.ch; },
    get data() { return patient; },
    get waiting() { return waiting; },
    get shift() { return shift; },
    get combo() { return combo; },
    tray, start, nextPatient, toTitle, boards, assistant, music, voices, get room() { return room; },
    startShift: () => start('shift'),
    wheel, openWheel, wheelButton, finish, get wheelReady() { return wheelReady; }, photo, takePhoto, photoButton: () => bPhoto.userData.onSelect(),
    hint: () => useHint(),
    get hintsLeft() { return hintsLeft; },
    get hintVisible() { return bHint.visible; },
    pick(id) { tray.onPick(tray.tools[id], app.pointers.mouse); },
    calm() { calmDown(app.pointers.mouse); },
    xray() { boards.onXray(); },
    funny(kind) { if (patient) guard(runFunny(kind)); },
    work(seconds = 1) {
      const t = held.get(app.pointers.mouse);
      const j = t && jobFor(t.id);
      const key = () => (j ? `${j.done}${jIdx(j)}` : '');
      const s0 = key();
      for (let i = 0; i < seconds * 30 && state === 'treat'; i++) {
        if (curStep(j || job)?.rhythm) { rhythmGreen = true; }
        workOn(t, 1 / 30, app.pointers.mouse, i === 0);
        if (!j || key() !== s0) break;
      }
    },
    skip(s) { for (const t of timers) t.t = Math.min(t.t, s ?? 0); },
    setEventLeft(v) { eventLeft = v; },
    force(list) { forced = list; },
    startDemo, stopDemo, get demo() { return demo; }, get demoHeld() { return held.get(demoPointer)?.id; },
    openShop, shopPress, decor, openSettings, closeSettings, openPrizes, askName, startNamed, typeKey, openScores, progress, get playerName() { return playerName; }, config, makePatientData: () => makePatientData(),
    setClock(h) { clinicTime = h; },
    get held() { return [...held.values()].map((t) => t.id); },
    get arrivalIn() { return nextArrival; },
    set arrivalIn(v) { nextArrival = v; },
  };

  return {
    group,
    // y < 0 lowers the dentist's view (like sitting on a dentist's stool), so the patient isn't far below
    spawn: { x: 0, y: -0.2, z: 0, yaw: 0 },
    bounds: 1.1,
    center: { x: 0, z: -0.1 },
    pitch: -0.42,
    update,
    dispose() {
      resetAll();
      music.stop();
      assistant.dispose();
      window.removeEventListener('keydown', onKey);
      for (const c of app.pointers.controllers) c.object.removeEventListener('squeezestart', squeeze);
    },
  };
}

// ------------------------------------------------------------------ helpers
function fmt(secs) {
  const s = Math.max(0, Math.floor(secs));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
function sideOf(ch) {
  return new THREE.Vector3(1, 0, 0).applyQuaternion(ch.head.getWorldQuaternion(new THREE.Quaternion()));
}
function rankOf(stars, patients) {
  const max = Math.max(1, patients * 3);
  const k = stars / max;
  if (k >= 0.9) return 'Dokter Gigi Legendaris!';
  if (k >= 0.7) return 'Dokter Gigi Hebat!';
  if (k >= 0.4) return 'Dokter Gigi Muda';
  return 'Masih belajar... coba lagi!';
}
function drawStars(c, x, y, r, n, total = 3) {
  const gap = r * 2.6;
  const x0 = x - ((total - 1) * gap) / 2;
  for (let i = 0; i < total; i++) {
    c.beginPath();
    for (let k = 0; k < 10; k++) {
      const rr = k % 2 ? r * 0.45 : r;
      const a = (k / 10) * Math.PI * 2 - Math.PI / 2;
      c.lineTo(x0 + i * gap + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
    c.closePath();
    c.fillStyle = i < n ? P.gold : '#e7ece9';
    c.fill();
  }
}
function drawHeart(c, x, y, r, full) {
  c.beginPath();
  c.moveTo(x, y + r * 0.9);
  c.bezierCurveTo(x - r * 1.6, y - r * 0.2, x - r * 0.6, y - r * 1.3, x, y - r * 0.4);
  c.bezierCurveTo(x + r * 0.6, y - r * 1.3, x + r * 1.6, y - r * 0.2, x, y + r * 0.9);
  c.fillStyle = full ? P.pinkDeep : '#e7ece9';
  c.fill();
}
function drawToothLogo(c, x, y, s) {
  c.save();
  c.translate(x, y);
  c.fillStyle = P.mint;
  c.beginPath(); c.arc(0, 0, s * 1.05, 0, Math.PI * 2); c.fill();
  c.fillStyle = '#fff';
  c.beginPath();
  c.moveTo(-s * 0.55, -s * 0.35);
  c.bezierCurveTo(-s * 0.55, -s * 0.75, -s * 0.1, -s * 0.75, 0, -s * 0.55);
  c.bezierCurveTo(s * 0.1, -s * 0.75, s * 0.55, -s * 0.75, s * 0.55, -s * 0.35);
  c.bezierCurveTo(s * 0.55, s * 0.1, s * 0.4, s * 0.2, s * 0.32, s * 0.65);
  c.bezierCurveTo(s * 0.26, s * 0.85, s * 0.08, s * 0.8, s * 0.05, s * 0.5);
  c.lineTo(-s * 0.05, s * 0.5);
  c.bezierCurveTo(-s * 0.08, s * 0.8, -s * 0.26, s * 0.85, -s * 0.32, s * 0.65);
  c.bezierCurveTo(-s * 0.4, s * 0.2, -s * 0.55, s * 0.1, -s * 0.55, -s * 0.35);
  c.fill();
  c.fillStyle = P.ink;
  c.beginPath(); c.arc(-s * 0.2, -s * 0.2, s * 0.07, 0, Math.PI * 2); c.arc(s * 0.2, -s * 0.2, s * 0.07, 0, Math.PI * 2); c.fill();
  c.strokeStyle = P.pinkDeep; c.lineWidth = s * 0.07; c.lineCap = 'round';
  c.beginPath(); c.arc(0, -s * 0.08, s * 0.16, 0.3, Math.PI - 0.3); c.stroke();
  c.restore();
}

/** A painted mirror "reflection": soft sage room, a bright doorway, the cove light and two glass streaks. */
function mirrorTexture() {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 340;
  const g = c.getContext('2d');
  const w = c.width;
  const h = c.height;
  const bg = g.createLinearGradient(0, 0, 0, h);
  bg.addColorStop(0, '#e9eee6');
  bg.addColorStop(0.45, '#cbd8c3');
  bg.addColorStop(1, '#b4c6aa');
  g.fillStyle = bg;
  g.fillRect(0, 0, w, h);
  g.filter = 'blur(6px)';
  g.fillStyle = 'rgba(255,250,236,0.9)'; // warm cove light along the ceiling
  g.fillRect(-10, h * 0.1, w + 20, 14);
  g.fillStyle = 'rgba(255,255,255,0.75)'; // the white door opposite
  g.fillRect(w * 0.58, h * 0.3, w * 0.26, h * 0.62);
  g.fillStyle = 'rgba(70,112,64,0.35)'; // a hint of the jungle wall
  g.fillRect(-10, h * 0.42, w * 0.35, h * 0.6);
  g.fillStyle = 'rgba(245,245,240,0.8)'; // floor tiles
  g.fillRect(-10, h * 0.9, w + 20, h * 0.2);
  g.filter = 'none';
  const streak = (x, wd, a) => {
    const s = g.createLinearGradient(x, 0, x + wd, 0);
    s.addColorStop(0, 'rgba(255,255,255,0)');
    s.addColorStop(0.5, `rgba(255,255,255,${a})`);
    s.addColorStop(1, 'rgba(255,255,255,0)');
    g.save();
    g.translate(w / 2, h / 2);
    g.rotate(-0.5);
    g.translate(-w / 2, -h / 2);
    g.fillStyle = s;
    g.fillRect(x, -h, wd, h * 3);
    g.restore();
  };
  streak(w * 0.1, 46, 0.55);
  streak(w * 0.32, 18, 0.4);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

