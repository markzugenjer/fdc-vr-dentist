import * as THREE from 'three';
import { P } from './palette.js';
import { buildRoom, DOOR, SEAT } from './room.js';
import { Character } from './character.js';
import { ToolTray, TOOL_INFO } from './tools.js';
import { MouthWork } from './mouth.js';
import { Effects } from './effects.js';
import { Music } from './music.js';
import { CASES, LINES, PATIENTS, ASSISTANT, pick } from './cases.js';
import { makePanel, makeButton, tickButtons, text, card, wrap, roundRect } from '../core/ui.js';
import { store } from '../core/util.js';

const PATIENTS_PER_SHIFT = 3;
const MAX_MISTAKES = 3; // wrong tools before the patient walks out
const BEST_KEY = 'fdc.dentist.best';
const MOUTH_REACH = 0.075; // how close (m) the tool tip must be to the mouth in VR
const STAND = { x: 0.35, z: -1.12 }; // where the patient stands before sitting in the chair
const EXIT = { x: 0.85, z: -1.0 }; // where they step out of the chair (clear of the big panel)
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

/**
 * FDC Dentist. Patients walk in, sit in the chair and open wide. Pick the right instrument for
 * each step of their treatment. Wrong instruments hurt (or annoy) them; after three, they leave.
 */
export function createClinic(app) {
  const group = new THREE.Group();
  const room = buildRoom();
  group.add(room.group);
  const fx = new Effects(group);
  const sfx = app.sfx;
  // on the dentist's right, clear of the line of sight to the patient's mouth
  const tray = new ToolTray(app, { position: new THREE.Vector3(0.62, 0.86, -0.16), yaw: -0.85 });
  group.add(tray.group);

  const assistant = new Character({ height: 1.06, ...ASSISTANT.look });
  assistant.root.position.set(-0.9, 0, -1.2);
  assistant.root.rotation.y = Math.atan2(0.9, 1.2);
  group.add(assistant.root);

  const head = new THREE.Vector3(); // the player's head, updated every frame
  const tmp = new THREE.Vector3();
  const tmp2 = new THREE.Vector3();

  // ------------------------------------------------------------------ game state
  let state = 'title'; // title | arriving | treat | react | done | leaving | result | final
  let paused = false;
  let patient = null;
  let work = null;
  let patientNo = 0;
  let queue = [];
  let caseId = null;
  let stepIdx = 0;
  let stepProgress = 0;
  let mistakes = 0;
  let treatStart = 0;
  let elapsed = 0;
  let clock = 0;
  let shift = { score: 0, stars: 0, happy: 0, results: [] };
  let last = null; // result of the last patient
  let token = 0;
  let timers = [];
  let leavingDone = Promise.resolve();

  const wait = (s) => new Promise((resolve, reject) => {
    const my = token;
    timers.push({ t: s, done: () => (my === token ? resolve() : reject(CANCEL)) });
  });
  const guard = (p) => p.catch((e) => { if (e !== CANCEL) console.error(e); });

  // ------------------------------------------------------------------ panels
  const FRONT = new THREE.Vector3(0, 1.6, -1.25);

  // title / how to play / results share one big card
  let bigContent = { kind: 'title' };
  const big = makePanel(1.3, 0.74, (c, W, H) => drawBig(c, W, H, bigContent));
  big.mesh.position.copy(FRONT);
  group.add(big.mesh);
  const btn = (label, tone, x, y, onSelect, w = 0.4) => {
    const b = makeButton(app, { label, tone, w, h: 0.13, onSelect });
    b.position.set(FRONT.x + x, FRONT.y + y, FRONT.z + 0.02);
    group.add(b);
    return b;
  };
  const bStart = btn('Mulai kerja', 'mint', -0.44, -0.47, () => startShift());
  const bHow = btn('Cara main', 'light', 0, -0.47, () => { bigContent = bigContent.kind === 'how' ? { kind: 'title' } : { kind: 'how' }; big.redraw(); bHow.userData.setLabel(bigContent.kind === 'how' ? 'Kembali' : 'Cara main'); });
  const bLobby = btn('Lobby FDC', 'pink', 0.44, -0.47, () => toLobby());
  const bNext = btn('Pasien berikutnya', 'mint', -0.22, -0.47, () => nextPatient(), 0.52);
  const bAgain = btn('Main lagi', 'mint', -0.22, -0.47, () => startShift(), 0.52);
  const bLobby2 = btn('Lobby FDC', 'pink', 0.33, -0.47, () => toLobby(), 0.36);

  // patient card on the right
  const cardPanel = makePanel(0.62, 0.66, (c, W, H) => drawCard(c, W, H));
  cardPanel.mesh.position.set(0.95, 1.5, -1.3);
  cardPanel.mesh.rotation.y = -0.55;
  group.add(cardPanel.mesh);

  // pause menu
  const pausePanel = makePanel(0.8, 0.26, (c, W, H) => {
    card(c, W, H, { r: 0.2 });
    text(c, 'Istirahat sebentar', W / 2, H * 0.42, { size: H * 0.22, weight: 800, align: 'center' });
    text(c, 'Tombol B / Y (atau M) untuk lanjut', W / 2, H * 0.72, { size: H * 0.13, color: P.muted, align: 'center' });
  });
  pausePanel.mesh.position.set(0, 1.62, -0.95);
  group.add(pausePanel.mesh);
  const pBtn = (label, tone, x, f) => {
    const b = makeButton(app, { label, tone, w: 0.3, h: 0.12, onSelect: f });
    b.position.set(x, 1.4, -0.94);
    group.add(b);
    return b;
  };
  const pResume = pBtn('Lanjut', 'mint', -0.33, () => setPaused(false));
  const pRestart = pBtn('Ulang', 'light', 0, () => { setPaused(false); startShift(); });
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
    big.mesh.visible = t || r || f;
    show([bStart, bHow], t);
    bLobby.visible = t && FROM_LOBBY;
    bNext.visible = r;
    bAgain.visible = f;
    bLobby2.visible = (f || r) && FROM_LOBBY;
    cardPanel.mesh.visible = !t && !f;
    show([pausePanel.mesh, pResume, pRestart, pMusic], paused);
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
      drawToothLogo(c, pad + H * 0.17, H * 0.27, H * 0.17);
      text(c, 'FDC Dentist', pad + H * 0.4, H * 0.24, { size: H * 0.13, weight: 800, color: P.mintDark });
      text(c, 'Klinik Gigi Ceria', pad + H * 0.4, H * 0.35, { size: H * 0.07, weight: 600, color: P.pinkDeep });
      const lines = [
        'Kamu dokter giginya! Pasien datang satu per satu.',
        'Pilih alat yang tepat untuk setiap langkah perawatan.',
        `Salah alat? Pasien kesakitan atau marah. Salah ${MAX_MISTAKES}x, pasien pulang.`,
      ];
      lines.forEach((l, i) => text(c, l, pad, H * 0.55 + i * H * 0.1, { size: H * 0.058, color: P.ink, maxWidth: W - pad * 2 }));
      const best = store.get(BEST_KEY, 0);
      if (best) text(c, `Skor terbaik: ${best}`, W - pad, H * 0.24, { size: H * 0.06, weight: 700, color: P.muted, align: 'right' });
    } else if (d.kind === 'how') {
      text(c, 'Cara main', pad, H * 0.15, { size: H * 0.09, weight: 800, color: P.mintDark });
      const lines = [
        ['Ambil alat', 'Arahkan laser ke baki, tekan trigger.'],
        ['Pakai alat', 'Dekatkan ujung alat ke mulut pasien dan tahan.'],
        ['Ganti alat', 'Ambil alat lain, atau tekan grip untuk mengembalikan.'],
        ['Langkah', 'Kartu di kanan menunjukkan langkah perawatan.'],
        ['Desktop', 'Klik alat, lalu klik-tahan mulut pasien.'],
      ];
      lines.forEach(([a, b], i) => {
        const y = H * 0.3 + i * H * 0.115;
        text(c, a, pad, y, { size: H * 0.058, weight: 800, color: P.pinkDeep });
        text(c, b, pad + W * 0.22, y, { size: H * 0.055, color: P.ink, maxWidth: W * 0.68 });
      });
    } else if (d.kind === 'result') {
      const r = d.r;
      text(c, r.left ? `${r.name} pulang kecewa...` : `${r.name} tersenyum lagi!`, W / 2, H * 0.17, { size: H * 0.09, weight: 800, align: 'center', color: r.left ? P.red : P.mintDark });
      drawStars(c, W / 2, H * 0.33, H * 0.075, r.stars);
      const rows = r.left
        ? [[`Langkah selesai`, `${r.stepsDone} / ${r.steps}`], ['Poin', `+${r.points}`]]
        : [['Perawatan', `+${r.base}`], ['Tanpa salah', r.perfect ? `+${r.perfect}` : '-'], ['Bonus cepat', `+${r.speed}`], ['Salah alat', r.penalty ? `-${r.penalty}` : '0']];
      rows.forEach(([a, b], i) => {
        const y = H * 0.5 + i * H * 0.075;
        text(c, a, W * 0.28, y, { size: H * 0.055, color: P.muted });
        text(c, b, W * 0.72, y, { size: H * 0.055, weight: 700, align: 'right' });
      });
      text(c, `Total pasien ini: ${r.points}   ·   Skor shift: ${shift.score}`, W / 2, H * 0.85, { size: H * 0.055, weight: 800, align: 'center', color: P.ink });
    } else if (d.kind === 'final') {
      const best = store.get(BEST_KEY, 0);
      text(c, 'Shift selesai!', W / 2, H * 0.15, { size: H * 0.1, weight: 800, align: 'center', color: P.mintDark });
      text(c, rankOf(shift.stars), W / 2, H * 0.26, { size: H * 0.07, weight: 700, align: 'center', color: P.pinkDeep });
      drawStars(c, W / 2, H * 0.41, H * 0.06, shift.stars, PATIENTS_PER_SHIFT * 3);
      text(c, `${shift.score}`, W / 2, H * 0.66, { size: H * 0.17, weight: 800, align: 'center' });
      text(c, `Pasien senang: ${shift.happy} / ${PATIENTS_PER_SHIFT}   ·   Skor terbaik: ${best}${d.newBest ? '  (baru!)' : ''}`, W / 2, H * 0.78, { size: H * 0.055, color: P.muted, align: 'center' });
    }
  }

  function drawCard(c, W, H) {
    card(c, W, H, { r: 0.08, fill: 'rgba(255,255,255,0.95)', stroke: P.pink, lw: 8 });
    const pad = W * 0.07;
    if (!caseId) {
      text(c, 'Menunggu pasien...', W / 2, H / 2, { size: H * 0.06, color: P.muted, align: 'center' });
      return;
    }
    const cs = CASES[caseId];
    const who = queue[patientNo];
    text(c, `PASIEN ${patientNo + 1} / ${PATIENTS_PER_SHIFT}`, pad, H * 0.09, { size: H * 0.04, weight: 800, color: P.muted });
    // hearts = patience left
    for (let i = 0; i < MAX_MISTAKES; i++) drawHeart(c, W - pad - i * H * 0.07, H * 0.075, H * 0.026, i < MAX_MISTAKES - mistakes);
    text(c, who.name, pad, H * 0.19, { size: H * 0.08, weight: 800 });
    roundRect(c, pad, H * 0.225, c.measureText(cs.title).width * 0 + W * 0.6, H * 0.065, H * 0.03);
    c.fillStyle = P.mintSoft; c.fill();
    text(c, cs.title, pad + W * 0.03, H * 0.272, { size: H * 0.042, weight: 700, color: P.mintDark });
    c.font = `italic 500 ${Math.round(H * 0.038)}px system-ui`;
    const q = wrap(c, `"${who.complaint}"`, W - pad * 2).slice(0, 2);
    q.forEach((l, i) => text(c, l, pad, H * 0.35 + i * H * 0.05, { size: H * 0.038, weight: 500, color: P.muted }));
    let y = H * 0.48;
    cs.steps.forEach((st, i) => {
      const done = i < stepIdx;
      const now = i === stepIdx && (state === 'treat' || state === 'react');
      if (now) {
        roundRect(c, pad * 0.6, y - H * 0.045, W - pad * 1.2, H * 0.075, H * 0.03);
        c.fillStyle = P.pinkSoft; c.fill();
        roundRect(c, pad * 0.6, y + H * 0.022, (W - pad * 1.2) * stepProgress, H * 0.008, H * 0.004);
        c.fillStyle = P.pinkDeep; c.fill();
      }
      c.beginPath();
      c.arc(pad + H * 0.02, y - H * 0.012, H * 0.022, 0, Math.PI * 2);
      c.fillStyle = done ? P.mintDeep : now ? P.pinkDeep : '#e3e9e6';
      c.fill();
      if (done) text(c, '✓', pad + H * 0.02, y, { size: H * 0.035, weight: 800, color: '#fff', align: 'center' });
      else text(c, `${i + 1}`, pad + H * 0.02, y, { size: H * 0.032, weight: 800, color: now ? '#fff' : P.muted, align: 'center' });
      text(c, st.text, pad + H * 0.065, y, { size: H * 0.042, weight: now ? 800 : 500, color: done ? P.muted : P.ink, maxWidth: W - pad * 2 - H * 0.07 });
      y += H * 0.085;
    });
    const secs = Math.floor(elapsed);
    text(c, `Waktu ${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`, pad, H * 0.94, { size: H * 0.042, weight: 700, color: P.muted });
    text(c, `Skor ${shift.score}`, W - pad, H * 0.94, { size: H * 0.042, weight: 800, color: P.mintDark, align: 'right' });
  }
  let cardKey = '';
  function refreshCard(force) {
    const key = `${caseId}|${stepIdx}|${Math.round(stepProgress * 20)}|${mistakes}|${Math.floor(elapsed)}|${state}|${shift.score}|${patientNo}`;
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
    if (patient && state === 'treat') patient.lookAt(null);
  };
  function returnTool(tool) {
    if (!tool || tool.home) return;
    if (tool.id === 'forceps') work?.releasePulled();
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
  function makeMouthTarget(pt) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.085, 12, 8), new THREE.MeshBasicMaterial({ visible: false }));
    m.position.set(0, 0, 0.02);
    pt.mouth.add(m);
    app.addTarget(m, { enabled: false, onHold: (hit, pointer) => { deskWork = { hit, pointer, frame: frameNo }; } });
    return m;
  }

  // ------------------------------------------------------------------ the shift
  function resetAll() {
    token++;
    for (const t of timers) t.done();
    timers = [];
    returnAll();
    sfx.stopAll();
    if (work) { work.dispose(); work = null; }
    if (patient) { group.remove(patient.root); patient.dispose(); patient = null; }
    if (mouthTarget) { app.removeTarget(mouthTarget); mouthTarget = null; }
    room.door.want = 0;
    room.chair.want = 0;
    caseId = null;
  }

  function startShift(forced) {
    resetAll();
    const cases = Array.isArray(forced) ? forced : shuffle(Object.keys(CASES));
    const people = shuffle(PATIENTS).slice(0, PATIENTS_PER_SHIFT);
    queue = people.map((p, i) => ({ ...p, caseId: cases[i % cases.length], complaint: pick(CASES[cases[i % cases.length]].complaints) }));
    shift = { score: 0, stars: 0, happy: 0, results: [] };
    patientNo = 0;
    bHow.userData.setLabel('Cara main');
    assistant.say('Ayo mulai, Dok! Pasien pertama datang.', 2.6);
    assistant.face('smiley');
    sfx.play('yay');
    guard(runPatient());
  }

  function nextPatient() {
    if (state !== 'result') return;
    patientNo++;
    if (patientNo >= PATIENTS_PER_SHIFT) return;
    // let the last patient finish walking out first
    state = 'arriving';
    caseId = null;
    layout();
    refreshCard(true);
    const my = token;
    guard(leavingDone.then(() => { if (my === token) return runPatient(); return undefined; }));
  }

  async function runPatient() {
    resetAll();
    const who = queue[patientNo];
    caseId = who.caseId;
    stepIdx = 0;
    stepProgress = 0;
    mistakes = 0;
    elapsed = 0;
    state = 'arriving';
    layout();
    refreshCard(true);

    patient = new Character({ height: 1.0 + Math.random() * 0.1, ...who.look });
    patient.root.position.set(DOOR.x, 0, DOOR.z - 0.6);
    patient.root.rotation.y = 0;
    patient.onStep = () => sfx.play('footstep');
    group.add(patient.root);
    if (!xr()) mouthTarget = makeMouthTarget(patient);

    await wait(0.4);
    room.door.want = 1;
    sfx.play('door');
    await wait(0.5);
    const walk = patient.walkTo([{ x: DOOR.x, z: DOOR.z + 0.7 }, { x: 1.0, z: -1.7 }, STAND]);
    await wait(1.4);
    room.door.want = 0;
    sfx.play('door-close');
    await walk;
    patient.lookAt(head);
    patient.face('happy');
    patient.act('wave', 1.8);
    patient.say(pick(LINES.hello), 1.6);
    sfx.play('hello');
    await wait(1.5);
    patient.face('talk');
    patient.say(who.complaint, 3.2);
    assistant.lookAt(patient.headWorld(new THREE.Vector3()));
    await wait(3.0);
    patient.face('neutral');
    await patient.sitDown(SEAT);
    room.chair.want = 1;
    patient.face('aaa');
    patient.say(pick(LINES.sit), 1.4);
    await wait(0.6);
    work = new MouthWork(patient, caseId, fx, sfx);
    state = 'treat';
    treatStart = clock;
    if (mouthTarget) mouthTarget.userData.enabled = true;
    assistant.lookAt(null);
    if (patientNo === 0) assistant.say('Pilih alat di baki, Dok!', 2.4);
    layout();
  }

  // ------------------------------------------------------------------ treating
  function workOn(tool, dt, pointer, entering) {
    if (state !== 'treat') return;
    const step = CASES[caseId].steps[stepIdx];
    if (tool.id !== step.tool) {
      if (entering) mistake(tool, pointer);
      return;
    }
    stepProgress = Math.min(1, stepProgress + dt / step.time);
    work.progress(step.tool, stepProgress, dt);
    if (tool.sound) sfx.loop(tool.sound, true);
    tool.working = true;
    haptic(pointer, TOOL_INFO[tool.id].sharp ? 0.25 : 0.12, 30);
    // the patient reacts to the work: eyes squeeze a little for sharp tools
    if (TOOL_INFO[tool.id].sharp && Math.random() < dt * 0.8) patient.blink = 0;
    if (stepProgress >= 1) finishStep(tool);
  }

  function finishStep(tool) {
    const steps = CASES[caseId].steps;
    const step = steps[stepIdx];
    work.done(step.tool, tool);
    if (step.tool !== 'mirror') work.stopHighlight();
    sfx.loop(tool.sound || 'none', false);
    sfx.play('step-done');
    fx.emit('star', patient.mouthWorld(tmp), 6, { speed: 0.35, size: 0.035, life: 0.7, up: 0.15 });
    haptic(tool.pointer, 0.6, 80);
    stepIdx++;
    stepProgress = 0;
    if (step.tool === 'syringe') { patient.face('numb'); patient.say(pick(LINES.numb), 1.6); guard(wait(1.8).then(() => { if (state === 'treat') patient.face('aaa'); })); }
    if (stepIdx >= steps.length) { guard(treatmentDone()); return; }
    if (Math.random() < 0.5) assistant.say(pick(LINES.stepOk), 1.3);
  }

  function mistake(tool, pointer) {
    mistakes++;
    state = 'react';
    const pain = TOOL_INFO[tool.id].sharp;
    patient.face(pain ? 'pain' : 'mad');
    patient.jump = 1;
    patient.shake = 1;
    patient.act(pain ? 'cover' : 'fist', 1.4);
    patient.say(pick(pain ? LINES.pain : LINES.mad), 1.8, 'angry');
    sfx.play(pain ? 'ouch' : 'grr');
    sfx.play('heart');
    haptic(pointer, 1, 200);
    const h = patient.headWorld(tmp);
    if (pain) {
      for (const s of [-1, 1]) fx.emit('tear', tmp2.copy(h).add(new THREE.Vector3(0, 0.03, 0)).addScaledVector(sideOf(patient), s * 0.1), 3, { speed: 0.4, size: 0.035, gravity: 1.6, up: 0.4, life: 0.9 });
    } else {
      fx.emit('anger', tmp2.copy(h).add(new THREE.Vector3(0.12, 0.2, 0)), 1, { speed: 0, size: 0.09, life: 1.2 });
      fx.emit('puff', tmp2.copy(h).add(new THREE.Vector3(0, 0.28, 0)), 6, { speed: 0.15, size: 0.07, up: 0.35, life: 1.0, grow: 1.5 });
    }
    assistant.act('facepalm', 1.1);
    const right = TOOL_INFO[CASES[caseId].steps[stepIdx].tool].name;
    refreshCard(true);
    guard((async () => {
      await wait(0.45);
      returnTool(tool);
      await wait(0.6);
      if (mistakes >= MAX_MISTAKES) { await leaveSad(); return; }
      assistant.say(`Dok, coba pakai ${right}!`, 2.4);
      assistant.act('point', 1.6);
      await wait(0.5);
      patient.face('aaa');
      if (mistakes === MAX_MISTAKES - 1) patient.say(pick(LINES.lastChance), 2.0, 'angry');
      state = 'treat';
    })());
  }

  function scorePatient(left) {
    const steps = CASES[caseId].steps.length;
    const par = 12 + steps * 6;
    if (left) {
      const points = stepIdx * 50;
      return { name: queue[patientNo].name, left: true, stars: 0, points, stepsDone: stepIdx, steps };
    }
    const base = steps * 100;
    const perfect = mistakes === 0 ? 100 : 0;
    const speed = Math.max(0, Math.round((par - elapsed) * 4));
    const penalty = mistakes * 40;
    const points = Math.max(0, base + perfect + speed - penalty);
    const stars = mistakes === 0 && elapsed <= par ? 3 : mistakes <= 1 ? 2 : 1;
    return { name: queue[patientNo].name, left: false, stars, points, base, perfect, speed, penalty };
  }

  async function treatmentDone() {
    state = 'done';
    returnAll();
    if (mouthTarget) mouthTarget.userData.enabled = false;
    const r = scorePatient(false);
    finishPatient(r);
    patient.face('happy');
    patient.act('cheer', 2.2);
    patient.jump = 1;
    patient.say(pick(LINES.thanks), 2.4, 'happy');
    sfx.play('win');
    const h = patient.headWorld(tmp).clone();
    fx.emit('heart', h.clone().add(new THREE.Vector3(0, 0.25, 0)), 6, { speed: 0.3, size: 0.06, up: 0.35, life: 1.4 });
    fx.emit('star', h, 12, { speed: 0.6, size: 0.04, life: 1.0, up: 0.2 });
    assistant.act('clap', 2.0);
    assistant.face('happy');
    assistant.say('Hebat, Dok!', 1.6);
    await wait(2.0);
    room.chair.want = 0;
    showResult(r);
    leavingDone = walkOut(false);
  }

  async function leaveSad() {
    state = 'leaving';
    returnAll();
    if (mouthTarget) mouthTarget.userData.enabled = false;
    const r = scorePatient(true);
    finishPatient(r);
    patient.face('sad');
    patient.say(pick(LINES.leave), 2.4, 'sad');
    sfx.play('sad');
    assistant.act('shrug', 1.6);
    assistant.face('sad');
    await wait(1.8);
    room.chair.want = 0;
    showResult(r);
    leavingDone = walkOut(true);
  }

  async function walkOut(sad) {
    const my = token;
    const pt = patient;
    if (work) { work.dispose(); work = null; }
    await pt.standUp(EXIT);
    if (my !== token) return;
    pt.lookAt(null);
    room.door.want = 1;
    sfx.play('door');
    if (!sad) pt.face('happy');
    await pt.walkTo([{ x: 1.0, z: -1.7 }, { x: DOOR.x, z: DOOR.z + 0.7 }, { x: DOOR.x, z: DOOR.z - 0.7 }], { speed: sad ? 0.8 : 1.2, sad });
    if (my !== token) return;
    room.door.want = 0;
    sfx.play('door-close');
    group.remove(pt.root);
    pt.dispose();
    if (patient === pt) patient = null;
  }

  function finishPatient(r) {
    shift.score += r.points;
    shift.stars += r.stars;
    if (!r.left) shift.happy++;
    shift.results.push(r);
    last = r;
    refreshCard(true);
  }

  function showResult(r) {
    const final = patientNo >= PATIENTS_PER_SHIFT - 1;
    sfx.play('star');
    if (final) {
      const best = store.get(BEST_KEY, 0);
      const newBest = shift.score > best;
      if (newBest) store.set(BEST_KEY, shift.score);
      bigContent = { kind: 'final', newBest };
      state = 'final';
      assistant.say(shift.happy === PATIENTS_PER_SHIFT ? 'Semua pasien senang! Keren!' : 'Shift selesai, Dok!', 2.6);
    } else {
      bigContent = { kind: 'result', r };
      state = 'result';
    }
    big.redraw();
    layout();
    starPop = 1;
  }

  // ------------------------------------------------------------------ per frame
  let frameNo = 0;
  let idleT = 1.5;
  let starPop = 0;
  const assistantLook = new THREE.Vector3();

  function update(dt) {
    frameNo++;
    music.tryStart();
    // desktop view: stand a little further back so the tray and the patient both fit
    if (!xr()) app.camera.position.set(0, 1.6, 0.3);
    app.camera.getWorldPosition(head);
    tickButtons(group, dt);
    room.update(paused ? 0 : dt);
    fx.update(dt);
    tray.update(dt);
    if (paused) return;

    clock += dt;
    for (const t of [...timers]) {
      t.t -= dt;
      if (t.t <= 0) { timers.splice(timers.indexOf(t), 1); t.done(); }
    }

    if (patient) {
      if (patient.lookTarget) patient.lookTarget = head;
      // while treating, the patient keeps an eye on the tool coming at them
      if (state === 'treat' && held.size) {
        const tool = [...held.values()][0];
        tool.tip.getWorldPosition(tmp);
        patient.lookAt(tmp.distanceTo(patient.mouthWorld(tmp2)) < 0.35 ? head : tool.tip.getWorldPosition(new THREE.Vector3()));
      } else if (state === 'treat' || state === 'react') patient.lookAt(head);
      patient.update(dt);
    }
    // the assistant watches the dentist, or the tool in their hand
    const tool0 = [...held.values()][0];
    if (tool0) assistant.lookAt(tool0.tip.getWorldPosition(assistantLook));
    else if (!assistant.lookTarget || assistant.lookTarget === assistantLook) assistant.lookAt(head);
    if (state === 'title' || state === 'final') {
      idleT -= dt;
      if (idleT <= 0 && !assistant.action) { idleT = 5 + Math.random() * 4; assistant.act(pick(['wave', 'thumbs', 'wave']), 1.8); assistant.face('smiley'); }
    }
    assistant.update(dt);
    if (assistant.faceName !== 'neutral' && !assistant.bubble.time && !assistant.action) assistant.face('neutral');

    // tools touching the mouth
    if (state === 'treat' || state === 'react') {
      elapsed = clock - treatStart;
      const mouth = patient ? patient.mouthWorld(tmp2) : null;
      for (const [pointer, tool] of held) {
        tool.working = false;
        let inside = false;
        if (pointer.object) {
          tool.tip.getWorldPosition(tmp);
          inside = mouth && tmp.distanceTo(mouth) < MOUTH_REACH;
        } else if (deskWork && deskWork.pointer === pointer && frameNo - deskWork.frame <= 1) {
          inside = true;
          // move the tool so its tip touches where you clicked
          const target = app.camera.worldToLocal(tmp.copy(deskWork.hit.point));
          tool.holdPos = target.sub(tool.tip.position.clone().applyQuaternion(DESK_QUAT));
        } else if (!pointer.object) {
          tool.holdPos = DESK_POS.clone();
        }
        const entering = inside && !tool.inMouth;
        tool.inMouth = inside;
        if (inside) workOn(tool, dt, pointer, entering);
        if (!tool.working && tool.sound) sfx.loop(tool.sound, false);
      }
      work?.update(dt);
      refreshCard();
    } else if (work) work.update(dt);

    if (starPop > 0) starPop = Math.max(0, starPop - dt);
    big.mesh.scale.setScalar(1 + Math.sin(starPop * Math.PI) * 0.04);
  }

  // first screen
  assistant.lookAt(head);
  assistant.say('Selamat datang, Dok!', 3);
  layout();

  // debug hooks for testing in a browser console
  window.dentist = {
    get state() { return state; },
    get step() { return CASES[caseId]?.steps[stepIdx]?.tool; },
    get patient() { return patient; },
    tray, held, startShift, nextPatient,
    pick(id) { tray.onPick(tray.tools[id], app.pointers.mouse); },
    work(seconds = 1) {
      const t = held.get(app.pointers.mouse);
      const s0 = stepIdx;
      for (let i = 0; i < seconds * 30 && stepIdx === s0 && state === 'treat'; i++) workOn(t, 1 / 30, app.pointers.mouse, i === 0);
    },
    skip(s) { for (const t of timers) t.t = Math.min(t.t, s ?? 0); },
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
function shuffle(list) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
function sideOf(ch) {
  return new THREE.Vector3(1, 0, 0).applyQuaternion(ch.head.getWorldQuaternion(new THREE.Quaternion()));
}
function rankOf(stars) {
  if (stars >= 9) return 'Dokter Gigi Legendaris!';
  if (stars >= 7) return 'Dokter Gigi Hebat!';
  if (stars >= 4) return 'Dokter Gigi Muda';
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
