import * as THREE from 'three';
import { P } from './palette.js';
import { makePanel, text, card } from '../core/ui.js';
import { ROOM, DOOR } from './room.js';
import { progress, RANKS } from './progress.js';

/**
 * Things on the walls: the X-ray screen next to the chair, the score TV, the rank sign above the
 * door, the FDC Dental Clinic sign, and the unlockable decorations (balloons, trophy).
 */
const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.5, ...o });

export function buildBoards(app, parent) {
  const out = {};

  // ------------------------------------------------------------------ X-ray screen on a pole
  const xr = { caseId: null, reveal: 0, scan: -1, hover: 0, t: 0 };
  const xray = makePanel(0.44, 0.3, (c, W, H) => drawXray(c, W, H, xr), { ppm: 900 });
  const xGroup = new THREE.Group();
  xGroup.position.set(-0.5, 1.34, -1.5);
  xGroup.rotation.y = 0.32;
  const frame = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.34, 0.03), std(P.white));
  frame.position.z = -0.018;
  xGroup.add(frame);
  xGroup.add(xray.mesh);
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 1.32, 10), std(P.white));
  pole.position.set(0, -0.66 - 0.17, -0.03);
  xGroup.add(pole);
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.16, 0.04, 20), std(P.mint));
  base.position.set(0, -1.31, -0.03);
  xGroup.add(base);
  parent.add(xGroup);
  app.addTarget(xray.mesh, {
    onHover: (v) => { xr.hover = v ? 1 : 0; },
    onSelect: () => out.onXray?.(),
  });
  out.xray = {
    group: xGroup,
    show(caseId) { xr.caseId = caseId; xr.reveal = 0; xr.scan = -1; xray.redraw(); },
    clear() { xr.caseId = null; xr.reveal = 0; xr.scan = -1; xray.redraw(); },
    startScan() { xr.scan = 0; },
    get scanning() { return xr.scan >= 0; },
    update(dt) {
      xr.t += dt;
      if (xr.scan >= 0) {
        xr.scan += dt / 1.0;
        if (xr.scan >= 1) { xr.scan = -1; xr.reveal = 1; out.onScanDone?.(); }
        xray.redraw();
      } else if (xr.reveal > 0 || xr.hover) {
        if (Math.floor(xr.t * 10) !== xr.lastTick) { xr.lastTick = Math.floor(xr.t * 10); xray.redraw(); }
      }
    },
  };

  // ------------------------------------------------------------------ score TV on the right wall
  const tvState = { mode: null, timeLeft: 0, score: 0, combo: 1, name: '' };
  const tv = makePanel(1.1, 0.66, (c, W, H) => drawTv(c, W, H, tvState), { ppm: 600 });
  const tvGroup = new THREE.Group();
  tvGroup.position.set(ROOM.maxX - 0.04, 1.5, -0.45); // under the clock, clear of the bench
  tvGroup.rotation.y = -Math.PI / 2;
  const bezel = new THREE.Mesh(new THREE.BoxGeometry(1.16, 0.72, 0.04), std('#2e3b36', { roughness: 0.4 }));
  bezel.position.z = -0.022;
  tvGroup.add(bezel, tv.mesh);
  parent.add(tvGroup);
  let tvKey = '';
  out.tv = {
    set(s) {
      Object.assign(tvState, s);
      const key = JSON.stringify(tvState) + progress.board().length;
      if (key !== tvKey) { tvKey = key; tv.redraw(); }
    },
  };

  // ------------------------------------------------------------------ rank sign above the door
  const rank = makePanel(1.0, 0.26, (c, W, H) => drawRank(c, W, H), { ppm: 600 });
  rank.mesh.position.set(DOOR.x, 2.45, ROOM.minZ + 0.02);
  parent.add(rank.mesh);
  out.rank = { redraw: () => rank.redraw() };

  // ------------------------------------------------------------------ FDC Dental Clinic sign
  const sign = makePanel(1.3, 0.3, (c, W, H) => {
    card(c, W, H, { r: 0.4, fill: '#ffffff', stroke: P.mint, lw: 10 });
    c.fillStyle = P.mintDeep;
    c.beginPath(); c.arc(H * 0.55, H / 2, H * 0.32, 0, Math.PI * 2); c.fill();
    text(c, 'fdc', H * 0.55, H * 0.6, { size: H * 0.3, weight: 900, color: '#fff', align: 'center' });
    text(c, 'FDC Dental Clinic', H * 1.05, H * 0.5, { size: H * 0.36, weight: 900, color: P.mintDark });
    text(c, 'Senyum sehat untuk semua', H * 1.05, H * 0.82, { size: H * 0.17, weight: 600, color: P.pinkDeep });
  }, { ppm: 600 });
  sign.mesh.position.set(-0.3, 2.4, ROOM.minZ + 0.02);
  parent.add(sign.mesh);

  // door plate
  const plate = makePanel(0.36, 0.1, (c, W, H) => {
    card(c, W, H, { r: 0.3, fill: P.pinkSoft, stroke: P.pinkDeep, lw: 6 });
    text(c, 'Ruang Periksa 1', W / 2, H * 0.62, { size: H * 0.4, weight: 800, color: P.pinkDeep, align: 'center' });
  }, { ppm: 700 });
  plate.mesh.position.set(DOOR.x - DOOR.w / 2 - 0.3, 1.6, ROOM.minZ + 0.02);
  parent.add(plate.mesh);

  // ------------------------------------------------------------------ unlockable decorations
  const balloons = new THREE.Group();
  const cols = [P.pink, P.mint, P.gold, P.pinkDeep, '#a8d8f0'];
  for (let i = 0; i < 5; i++) {
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.13, 16, 12), std(cols[i], { roughness: 0.25 }));
    b.scale.y = 1.2;
    b.position.set((i % 3) * 0.2 - 0.2, 2.05 + (i % 2) * 0.18, Math.floor(i / 3) * 0.2);
    b.userData.phase = i * 1.3;
    balloons.add(b);
    const str = new THREE.Mesh(new THREE.CylinderGeometry(0.002, 0.002, 1.1, 4), std('#ffffff'));
    str.position.set(b.position.x * 0.6, b.position.y - 0.7, b.position.z * 0.6);
    balloons.add(str);
  }
  balloons.position.set(-2.05, 0, -2.4);
  balloons.visible = false;
  parent.add(balloons);

  const trophy = new THREE.Group();
  const gold = std('#f2c14e', { metalness: 0.85, roughness: 0.25, emissive: '#5a3c00', emissiveIntensity: 0.2 });
  const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.03, 0.09, 18, 1, true), gold);
  cup.position.y = 0.12;
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.05, 8), gold);
  stem.position.y = 0.055;
  const foot = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.03, 0.06), std(P.mintDark));
  foot.position.y = 0.015;
  for (const s of [-1, 1]) {
    const h = new THREE.Mesh(new THREE.TorusGeometry(0.025, 0.006, 6, 12), gold);
    h.position.set(s * 0.065, 0.13, 0);
    trophy.add(h);
  }
  trophy.add(cup, stem, foot);
  trophy.position.set(-1.05, 1.77, ROOM.minZ + 0.12);
  trophy.visible = false;
  parent.add(trophy);

  out.decor = {
    apply() {
      balloons.visible = progress.has('balloons');
      trophy.visible = progress.has('trophy');
    },
    update(dt, t) {
      if (balloons.visible) for (const b of balloons.children) if (b.userData.phase !== undefined) b.position.y += Math.sin(t * 1.4 + b.userData.phase) * 0.0006;
      if (trophy.visible) trophy.rotation.y += dt * 0.6;
    },
  };
  out.decor.apply();
  // Klinik FDC room: its mural already carries the FDC logo, and the counter fills the back-left corner
  // Klinik FDC: the X-ray screen becomes the chair's monitor on a cream arm (no floor pole)
  const monitorArm = new THREE.Group();
  const cream = std('#f1ead8', { roughness: 0.5 });
  const armRod = (a, b) => {
    const len = a.distanceTo(b);
    const r = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, len, 10), cream);
    r.position.copy(a).add(b).multiplyScalar(0.5);
    r.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
    monitorArm.add(r);
  };
  // from the water unit column (0.2, 0.7, -1.02) up and back to the monitor (in xGroup space)
  const toLocal = (x, y, z) => xGroup.worldToLocal(new THREE.Vector3(x, y, z));
  xGroup.updateMatrixWorld(true);
  const p0 = toLocal(-0.2, 0.72, -1.26);
  const p1 = toLocal(-0.3, 1.05, -1.4);
  const p2 = new THREE.Vector3(0, -0.12, -0.05);
  armRod(p0, p1);
  armRod(p1, p2);
  const knuckle = new THREE.Mesh(new THREE.SphereGeometry(0.03, 12, 10), cream);
  knuckle.position.copy(p1);
  monitorArm.add(knuckle);
  monitorArm.visible = false;
  xGroup.add(monitorArm);
  out.setRoomStyle = (style) => {
    const fdc = style !== 'kartun';
    pole.visible = base.visible = !fdc;
    monitorArm.visible = fdc;
    sign.mesh.visible = !fdc;
    balloons.position.set(fdc ? -1.45 : -2.05, 0, fdc ? -2.75 : -2.4);
    trophy.position.set(fdc ? -2.0 : -1.05, 1.77, ROOM.minZ + 0.12); // on the black shelf left of the mural logo
  };
  return out;
}

// ------------------------------------------------------------------ drawing
const TOOTH_ROWS = 7;
function drawXray(c, W, H, s) {
  c.fillStyle = '#0d1418';
  c.fillRect(0, 0, W, H);
  // jaw shape
  c.strokeStyle = 'rgba(160,200,215,0.35)';
  c.lineWidth = W * 0.012;
  c.beginPath(); c.ellipse(W / 2, H * 0.5, W * 0.42, H * 0.36, 0, 0, Math.PI * 2); c.stroke();
  const bad = s.caseId ? BAD_TOOTH[s.caseId] : null;
  for (const row of [-1, 1]) {
    for (let i = 0; i < TOOTH_ROWS; i++) {
      const u = (i - (TOOTH_ROWS - 1) / 2) / ((TOOTH_ROWS - 1) / 2);
      const x = W / 2 + u * W * 0.34;
      const y = H / 2 + row * (H * 0.13 + Math.abs(u) ** 2 * -H * 0.04);
      const isBad = bad && bad.row === row && bad.i === i;
      const glow = isBad && s.reveal > 0 ? 0.5 + Math.sin(s.t * 8) * 0.5 : 0;
      c.fillStyle = isBad && s.reveal > 0 ? `rgba(255,${120 - glow * 60},${130 - glow * 60},0.95)` : 'rgba(225,240,245,0.85)';
      // crown
      c.beginPath(); c.ellipse(x, y, W * 0.032, H * 0.07, 0, 0, Math.PI * 2); c.fill();
      // root(s)
      c.fillStyle = 'rgba(200,225,232,0.55)';
      c.beginPath(); c.moveTo(x - W * 0.018, y + row * H * 0.03); c.lineTo(x, y + row * H * 0.17); c.lineTo(x + W * 0.018, y + row * H * 0.03); c.fill();
      if (isBad && s.reveal > 0) {
        c.strokeStyle = P.pinkDeep;
        c.lineWidth = W * 0.008;
        c.beginPath(); c.arc(x, y + row * H * 0.05, W * 0.06 + glow * W * 0.01, 0, Math.PI * 2); c.stroke();
      }
    }
  }
  if (s.scan >= 0) {
    const y = H * s.scan;
    const gr = c.createLinearGradient(0, y - H * 0.08, 0, y);
    gr.addColorStop(0, 'rgba(120,220,255,0)');
    gr.addColorStop(1, 'rgba(120,220,255,0.6)');
    c.fillStyle = gr;
    c.fillRect(0, y - H * 0.08, W, H * 0.08);
  }
  c.fillStyle = s.hover ? P.pink : 'rgba(255,255,255,0.75)';
  c.font = `800 ${Math.round(H * 0.075)}px system-ui, sans-serif`;
  c.textAlign = 'left';
  c.fillText(s.caseId ? (s.reveal ? 'RONTGEN · masalah ditemukan' : 'RONTGEN · tekan untuk memindai') : 'RONTGEN', W * 0.04, H * 0.1);
  c.lineWidth = W * 0.012;
  c.strokeStyle = s.hover ? P.pink : 'rgba(255,255,255,0.25)';
  c.strokeRect(0, 0, W, H);
}
// which tooth is the problem on the X-ray, per treatment (row -1 = upper)
const BAD_TOOTH = {
  rootcanal: { row: -1, i: 4 },
  filling: { row: -1, i: 2 },
  extraction: { row: 1, i: 5 },
};

function drawTv(c, W, H, s) {
  c.fillStyle = '#16302a';
  c.fillRect(0, 0, W, H);
  const pad = W * 0.05;
  text(c, 'PAPAN SKOR', pad, H * 0.13, { size: H * 0.08, weight: 900, color: P.mint });
  text(c, 'FDC Dentist', W - pad, H * 0.13, { size: H * 0.06, weight: 700, color: P.pink, align: 'right' });
  if (s.mode === 'event' && s.timeLeft > 0 && s.timeLeft <= 10) {
    // the last 10 seconds: one giant number for the crowd to count down with
    const sec = Math.ceil(s.timeLeft);
    c.fillStyle = sec % 2 ? '#3a1f26' : '#16302a';
    c.fillRect(0, 0, W, H);
    text(c, 'WAKTU HAMPIR HABIS!', W / 2, H * 0.16, { size: H * 0.085, weight: 900, color: P.pink, align: 'center' });
    text(c, `${sec}`, W / 2, H * 0.78, { size: H * 0.62, weight: 900, color: sec <= 3 ? '#ff8a8a' : '#ffffff', align: 'center' });
    text(c, `${s.score}`, W - pad, H * 0.95, { size: H * 0.07, weight: 900, color: P.gold, align: 'right' });
    if (s.name) text(c, s.name, pad, H * 0.95, { size: H * 0.06, weight: 800, color: '#ffffff', maxWidth: W * 0.6 });
    return;
  }
  if (s.mode === 'event') {
    const sec = Math.max(0, Math.ceil(s.timeLeft));
    text(c, `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`, pad, H * 0.34, { size: H * 0.16, weight: 900, color: sec <= 10 ? '#ff8a8a' : '#ffffff' });
    text(c, `${s.score}`, W - pad, H * 0.34, { size: H * 0.16, weight: 900, color: P.gold, align: 'right' });
    text(c, s.combo > 1 ? `COMBO ×${s.combo}` : 'MODE EVENT', W / 2, H * 0.34, { size: H * 0.07, weight: 900, color: P.pink, align: 'center' });
  } else if (s.mode === 'shift') {
    text(c, `Skor shift: ${s.score}`, pad, H * 0.32, { size: H * 0.08, weight: 800, color: '#ffffff' });
    if (s.combo > 1) text(c, `COMBO ×${s.combo}`, W - pad, H * 0.32, { size: H * 0.08, weight: 900, color: P.pink, align: 'right' });
  } else {
    text(c, `Bintang total: ★ ${progress.stars}`, pad, H * 0.32, { size: H * 0.075, weight: 800, color: '#ffffff' });
  }
  if (s.name && s.mode) text(c, `Dokter: ${s.name}`, pad, H * 0.44, { size: H * 0.055, weight: 800, color: P.pink, maxWidth: W - pad * 2 });
  // today's top 10 (names), in two columns
  text(c, 'Terbaik hari ini', pad, H * 0.55, { size: H * 0.06, weight: 800, color: P.mint });
  const top = progress.topToday(10);
  if (!top.length) text(c, 'Belum ada skor. Ayo main!', pad, H * 0.66, { size: H * 0.055, color: 'rgba(255,255,255,0.7)' });
  top.forEach((e, i) => {
    const col = i < 5 ? 0 : 1;
    const x0 = pad + col * (W / 2 - pad * 0.5);
    const x1 = col ? W - pad : W / 2 - pad;
    const y = H * 0.65 + (i % 5) * H * 0.072;
    text(c, `${i + 1}. ${e.name || 'Dokter Tamu'}`, x0, y, { size: H * 0.05, weight: 700, color: i === 0 ? P.gold : '#ffffff', maxWidth: W * 0.3 });
    text(c, `${e.score}`, x1, y, { size: H * 0.052, weight: 900, color: i === 0 ? P.gold : '#ffffff', align: 'right' });
  });
}

function drawRank(c, W, H) {
  card(c, W, H, { r: 0.35, fill: '#ffffff', stroke: P.gold, lw: 8 });
  const stars = progress.stars;
  const r = progress.rank(stars);
  const next = progress.nextRank(stars);
  text(c, r.name, W * 0.05, H * 0.45, { size: H * 0.3, weight: 900, color: P.mintDark });
  text(c, `★ ${stars}`, W * 0.95, H * 0.45, { size: H * 0.28, weight: 900, color: '#d9a32c', align: 'right' });
  const label = next ? `${next.stars - stars} bintang lagi → ${next.name}` : 'Peringkat tertinggi!';
  text(c, label, W * 0.05, H * 0.8, { size: H * 0.17, weight: 600, color: P.muted });
  void RANKS;
}
