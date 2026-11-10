import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { P } from './palette.js';
import { FONT } from '../core/ui.js';

/**
 * The treatment room: soft green, pink and white. Everything that never moves is merged into a
 * few meshes (one per material) so the Quest draws it in very few calls.
 *
 * Layout (metres): the dentist stands at the origin looking toward -Z. The dental chair is just in
 * front, with the patient facing +X (legs to the right) so their face turns toward the dentist.
 * The door is on the back wall to the right.
 */
export const ROOM = { minX: -2.4, maxX: 2.4, minZ: -3.2, maxZ: 1.8, h: 2.8 };
export const DOOR = { x: 1.5, z: ROOM.minZ, w: 0.92, h: 2.1 };
export const SEAT = { x: 0.2, y: 0.5, z: -0.74, yaw: Math.PI / 2, recline: 0.55 };

const M = {};
export function mats() {
  if (M.ready) return M;
  const s = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.75, ...o });
  Object.assign(M, {
    wall: s(P.wall, { roughness: 0.95 }),
    paint: s(P.wall, { roughness: 0.95 }), // the four walls (colour can be changed in Dekorasi)
    mint: s(P.mint, { roughness: 0.6 }),
    mintDeep: s(P.mintDeep, { roughness: 0.55 }),
    pink: s(P.pink, { roughness: 0.6 }),
    pinkDeep: s(P.pinkDeep, { roughness: 0.55 }),
    white: s('#ffffff', { roughness: 0.35 }),
    cream: s(P.cream, { roughness: 0.8 }),
    metal: s('#dfe7ec', { metalness: 0.8, roughness: 0.25 }),
    wood: s('#e9c9a3', { roughness: 0.7 }),
    leaf: s('#7fc79b', { roughness: 0.8 }),
    leafDark: s('#5fae80', { roughness: 0.8 }),
    glow: new THREE.MeshBasicMaterial({ color: '#fffaf0' }),
    lampGlow: new THREE.MeshBasicMaterial({ color: '#fff3d6' }),
    water: s('#bfe6f5', { roughness: 0.1, transparent: true, opacity: 0.8 }),
    ready: true,
  });
  return M;
}

export const box = (w, h, d, r = 0.02) => new RoundedBoxGeometry(w, h, d, 3, Math.min(r, w / 2, h / 2, d / 2) - 1e-4);
export const put = (parent, geo, mat, x, y, z, rx = 0, ry = 0, rz = 0) => {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.rotation.set(rx, ry, rz);
  parent.add(m);
  return m;
};

/** The real time in Indonesia (WIB, UTC+7) in hours, e.g. 16.55 = 16:33. The wall clocks show this. */
export function wibHours(now = Date.now()) {
  const d = new Date(now + 7 * 3600e3);
  return d.getUTCHours() + d.getUTCMinutes() / 60 + d.getUTCSeconds() / 3600;
}

/** Wall clock hands (hour, minute and a thin red second hand) set to the real WIB time. */
export function setWallClock(hourPivot, minPivot, secPivot) {
  const h = wibHours();
  minPivot.rotation.z = -((h % 1) * Math.PI * 2);
  hourPivot.rotation.z = -((h % 12) / 12) * Math.PI * 2;
  if (secPivot) secPivot.rotation.z = -(((h * 3600) % 60) / 60) * Math.PI * 2;
}

export function canvasTex(w, h, draw, repeat) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
  return t;
}

export function buildRoom() {
  const m = mats();
  const group = new THREE.Group();
  const still = new THREE.Group(); // merged later
  group.add(still);
  const { minX, maxX, minZ, maxZ, h } = ROOM;
  const W = maxX - minX;
  const D = maxZ - minZ;
  const cx = (minX + maxX) / 2;
  const cz = (minZ + maxZ) / 2;

  // --- floor: soft mint and white tiles
  const floorTex = canvasTex(256, 256, (g) => {
    g.fillStyle = '#f4fbf8'; g.fillRect(0, 0, 256, 256);
    g.fillStyle = '#e3f4ec'; g.fillRect(0, 0, 128, 128); g.fillRect(128, 128, 128, 128);
    g.strokeStyle = '#d3ebe1'; g.lineWidth = 3; g.strokeRect(0, 0, 256, 256); g.strokeRect(0, 0, 128, 128); g.strokeRect(128, 128, 128, 128);
  }, [W / 1.2, D / 1.2]);
  const floor = put(group, new THREE.PlaneGeometry(W, D), new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.55 }), cx, 0, cz, -Math.PI / 2);
  floor.name = 'floor';
  // a pink rug under the chair
  put(group, new THREE.CircleGeometry(1.0, 40), new THREE.MeshStandardMaterial({ color: P.pinkSoft, roughness: 1 }), 0.25, 0.003, -0.7, -Math.PI / 2);

  // --- walls: white with a mint panel and a pink stripe
  const walls = [
    { x: cx, z: minZ, ry: 0, len: W },
    { x: cx, z: maxZ, ry: Math.PI, len: W },
    { x: minX, z: cz, ry: Math.PI / 2, len: D },
    { x: maxX, z: cz, ry: -Math.PI / 2, len: D },
  ];
  for (const w of walls) {
    const wall = put(still, new THREE.PlaneGeometry(w.len, h), m.paint, w.x, h / 2, w.z, 0, w.ry);
    void wall;
    const off = 0.02;
    const nx = Math.sin(w.ry) * off;
    const nz = Math.cos(w.ry) * off;
    put(still, new THREE.BoxGeometry(w.len, 0.95, 0.03), m.mint, w.x + nx, 0.475, w.z + nz, 0, w.ry);
    put(still, new THREE.BoxGeometry(w.len, 0.06, 0.045), m.pink, w.x + nx * 1.4, 0.98, w.z + nz * 1.4, 0, w.ry);
    put(still, new THREE.BoxGeometry(w.len, 0.08, 0.04), m.white, w.x + nx, 0.04, w.z + nz, 0, w.ry);
  }
  // ceiling with soft light panels
  put(still, new THREE.PlaneGeometry(W, D), m.wall, cx, h, cz, Math.PI / 2);
  for (const [x, z] of [[-0.9, -1.4], [0.9, -1.4], [-0.9, 0.6], [0.9, 0.6]]) {
    put(still, new THREE.BoxGeometry(0.9, 0.03, 0.5), m.glow, x, h - 0.015, z);
  }

  // --- door (animated) in the back wall
  const door = new THREE.Group();
  const frameMat = m.mintDeep;
  put(still, new THREE.BoxGeometry(DOOR.w + 0.16, 0.1, 0.12), frameMat, DOOR.x, DOOR.h + 0.05, minZ + 0.03);
  for (const s of [-1, 1]) put(still, new THREE.BoxGeometry(0.08, DOOR.h, 0.12), frameMat, DOOR.x + s * (DOOR.w / 2 + 0.04), DOOR.h / 2, minZ + 0.03);
  // dark gap behind the door (a corridor)
  put(group, new THREE.PlaneGeometry(DOOR.w, DOOR.h), new THREE.MeshBasicMaterial({ color: '#e6efe9' }), DOOR.x, DOOR.h / 2, minZ - 0.005);
  const hinge = new THREE.Group();
  hinge.position.set(DOOR.x - DOOR.w / 2, 0, minZ + 0.03);
  group.add(hinge);
  const leaf = put(hinge, box(DOOR.w - 0.02, DOOR.h - 0.02, 0.05, 0.015), m.white, DOOR.w / 2, DOOR.h / 2, 0);
  const porthole = put(hinge, new THREE.CircleGeometry(0.14, 28), new THREE.MeshStandardMaterial({ color: '#cfeef7', roughness: 0.1, metalness: 0.2 }), DOOR.w / 2, 1.5, 0.027);
  put(hinge, new THREE.TorusGeometry(0.14, 0.018, 8, 28), m.pink, DOOR.w / 2, 1.5, 0.028);
  put(hinge, new THREE.SphereGeometry(0.03, 12, 10), m.metal, DOOR.w - 0.1, 1.0, 0.05);
  const sign = put(hinge, new THREE.PlaneGeometry(0.34, 0.12), new THREE.MeshBasicMaterial({
    map: canvasTex(340, 120, (g) => {
      g.fillStyle = P.mintDeep; g.beginPath(); g.roundRect(0, 0, 340, 120, 30); g.fill();
      g.fillStyle = '#fff'; g.font = `800 52px ${FONT}`; g.textAlign = 'center'; g.fillText('Ruang 1', 170, 80);
    }),
    transparent: true,
  }), DOOR.w / 2, 1.18, 0.028);
  void leaf; void porthole; void sign;
  door.hinge = hinge;
  door.amount = 0;
  door.want = 0;

  // --- window with a sky and pink curtains (left wall)
  const sky = canvasTex(512, 384, (g) => {
    const gr = g.createLinearGradient(0, 0, 0, 384);
    gr.addColorStop(0, '#9fd7f0'); gr.addColorStop(1, '#e8f7fb');
    g.fillStyle = gr; g.fillRect(0, 0, 512, 384);
    g.fillStyle = 'rgba(255,255,255,0.95)';
    for (const [x, y, r] of [[120, 110, 40], [165, 100, 52], [215, 118, 38], [360, 170, 30], [395, 160, 42], [430, 175, 28]]) { g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); }
    g.fillStyle = '#9fd6b5'; g.beginPath(); g.ellipse(140, 420, 260, 110, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#86c9a2'; g.beginPath(); g.ellipse(420, 430, 230, 100, 0, 0, Math.PI * 2); g.fill();
  });
  const skyMat = new THREE.MeshBasicMaterial({ map: sky });
  put(group, new THREE.PlaneGeometry(1.3, 0.95), skyMat, minX + 0.01, 1.65, -0.9, 0, Math.PI / 2);
  for (const [y, len] of [[2.15, 1.42], [1.15, 1.42]]) put(still, new THREE.BoxGeometry(0.08, 0.07, len), m.white, minX + 0.03, y, -0.9);
  for (const z of [-0.9 - 0.68, -0.9 + 0.68, -0.9]) put(still, new THREE.BoxGeometry(0.08, 1.05, z === -0.9 ? 0.04 : 0.07), m.white, minX + 0.03, 1.65, z);
  for (const s of [-1, 1]) {
    const cur = put(still, new THREE.CylinderGeometry(0.11, 0.17, 1.35, 12, 1, true), m.pink, minX + 0.12, 1.6, -0.9 + s * 0.83);
    cur.scale.z = 0.45;
  }
  put(still, new THREE.CylinderGeometry(0.015, 0.015, 2.0, 8), m.metal, minX + 0.12, 2.3, -0.9, Math.PI / 2);

  // --- poster "Senyum sehat" on the back wall
  const poster = canvasTex(600, 800, (g) => {
    g.fillStyle = P.pinkSoft; g.beginPath(); g.roundRect(0, 0, 600, 800, 50); g.fill();
    g.fillStyle = P.mintDeep; g.font = `800 84px ${FONT}`; g.textAlign = 'center';
    g.fillText('fdc', 300, 120);
    g.fillStyle = '#2e3b36'; g.font = `800 54px ${FONT}`;
    g.fillText('Senyum Sehat', 300, 640);
    g.font = `500 34px ${FONT}`; g.fillStyle = '#71817a';
    g.fillText('Sikat gigi 2x sehari ya!', 300, 700);
    // a happy tooth
    g.fillStyle = '#ffffff'; g.strokeStyle = '#9ed9c2'; g.lineWidth = 14;
    g.beginPath();
    g.moveTo(170, 230); g.bezierCurveTo(170, 160, 260, 150, 300, 190); g.bezierCurveTo(340, 150, 430, 160, 430, 230);
    g.bezierCurveTo(430, 330, 400, 360, 390, 470); g.bezierCurveTo(380, 540, 330, 540, 320, 470);
    g.bezierCurveTo(312, 420, 288, 420, 280, 470); g.bezierCurveTo(270, 540, 220, 540, 210, 470);
    g.bezierCurveTo(200, 360, 170, 330, 170, 230); g.fill(); g.stroke();
    g.fillStyle = '#2e3b36';
    g.beginPath(); g.arc(255, 280, 16, 0, Math.PI * 2); g.arc(345, 280, 16, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#e98aa4'; g.lineWidth = 12; g.beginPath(); g.arc(300, 310, 46, 0.2, Math.PI - 0.2); g.stroke();
    g.fillStyle = 'rgba(244,138,168,0.5)'; g.beginPath(); g.arc(225, 330, 22, 0, Math.PI * 2); g.arc(375, 330, 22, 0, Math.PI * 2); g.fill();
  });
  const posterMesh = put(group, new THREE.PlaneGeometry(0.6, 0.8), new THREE.MeshBasicMaterial({ map: poster, transparent: true }), -0.3, 1.65, minZ + 0.02);

  // --- cabinet with a sink (back left)
  const cab = { x: -1.35, z: minZ + 0.32 };
  put(still, box(1.4, 0.86, 0.6, 0.03), m.white, cab.x, 0.43, cab.z);
  for (let i = 0; i < 3; i++) {
    put(still, box(0.42, 0.7, 0.03, 0.012), m.mint, cab.x - 0.46 + i * 0.46, 0.42, cab.z + 0.3);
    put(still, box(0.12, 0.025, 0.03, 0.01), m.pinkDeep, cab.x - 0.46 + i * 0.46, 0.68, cab.z + 0.325);
  }
  put(still, box(1.46, 0.05, 0.64, 0.02), m.pink, cab.x, 0.885, cab.z);
  put(still, new THREE.CylinderGeometry(0.17, 0.15, 0.05, 24), m.white, cab.x + 0.35, 0.9, cab.z + 0.02);
  put(still, new THREE.CylinderGeometry(0.015, 0.015, 0.28, 10), m.metal, cab.x + 0.35, 1.03, cab.z - 0.2);
  put(still, new THREE.CylinderGeometry(0.012, 0.012, 0.16, 10), m.metal, cab.x + 0.35, 1.16, cab.z - 0.13, Math.PI / 2);
  // jars and a toothbrush cup on the counter
  const jarCols = [m.mint, m.pink, m.white];
  for (let i = 0; i < 3; i++) {
    put(still, new THREE.CylinderGeometry(0.05, 0.05, 0.13, 16), jarCols[i], cab.x - 0.55 + i * 0.13, 0.975, cab.z - 0.08);
    put(still, new THREE.CylinderGeometry(0.053, 0.053, 0.025, 16), m.white, cab.x - 0.55 + i * 0.13, 1.05, cab.z - 0.08);
  }
  // wall shelf with a tooth model
  put(still, box(0.9, 0.04, 0.22, 0.015), m.white, cab.x, 1.75, minZ + 0.11);
  const bigTooth = toothShape(0.11, m.white);
  bigTooth.position.set(cab.x - 0.2, 1.84, minZ + 0.12);
  still.add(bigTooth);
  for (let i = 0; i < 3; i++) put(still, box(0.06, 0.2, 0.16, 0.01), [m.mint, m.pink, m.mintDeep][i], cab.x + 0.15 + i * 0.07, 1.87, minZ + 0.12);

  // --- plant in the corner
  const plant = { x: -1.95, z: -2.55 };
  put(still, new THREE.CylinderGeometry(0.2, 0.15, 0.36, 18), m.pinkDeep, plant.x, 0.18, plant.z);
  put(still, new THREE.CylinderGeometry(0.21, 0.21, 0.04, 18), m.pink, plant.x, 0.36, plant.z);
  for (let i = 0; i < 9; i++) {
    const a = i * 2.39;
    const r = 0.06 + (i % 3) * 0.05;
    const leaf = put(still, new THREE.SphereGeometry(0.14 + (i % 2) * 0.04, 12, 9), i % 2 ? m.leaf : m.leafDark,
      plant.x + Math.cos(a) * r, 0.55 + i * 0.07, plant.z + Math.sin(a) * r);
    leaf.scale.set(1, 1.2, 1);
  }
  // a second, small plant on the right
  put(still, new THREE.CylinderGeometry(0.13, 0.1, 0.26, 16), m.mint, 2.0, 0.13, -2.75);
  for (let i = 0; i < 5; i++) put(still, new THREE.SphereGeometry(0.11, 10, 8), i % 2 ? m.leaf : m.leafDark, 2.0 + Math.cos(i * 1.3) * 0.07, 0.34 + i * 0.06, -2.75 + Math.sin(i * 1.3) * 0.07);

  // --- waiting bench by the right wall
  put(still, box(0.45, 0.08, 1.2, 0.03), m.pink, maxX - 0.3, 0.45, -1.6);
  put(still, box(0.08, 0.45, 1.2, 0.03), m.pink, maxX - 0.08, 0.72, -1.6);
  for (const z of [-2.1, -1.1]) put(still, box(0.4, 0.42, 0.06, 0.02), m.white, maxX - 0.3, 0.21, z);

  // --- clock on the right wall
  put(still, new THREE.CylinderGeometry(0.2, 0.2, 0.04, 32), m.white, maxX - 0.02, 2.05, -0.2, 0, 0, Math.PI / 2);
  put(still, new THREE.TorusGeometry(0.2, 0.025, 8, 32), m.mintDeep, maxX - 0.03, 2.05, -0.2, 0, Math.PI / 2);
  const clockHands = new THREE.Group();
  clockHands.position.set(maxX - 0.05, 2.05, -0.2);
  clockHands.rotation.y = -Math.PI / 2;
  group.add(clockHands);
  const hour = put(clockHands, new THREE.BoxGeometry(0.018, 0.1, 0.006), new THREE.MeshStandardMaterial({ color: P.ink }), 0, 0.04, 0);
  const minute = put(clockHands, new THREE.BoxGeometry(0.012, 0.15, 0.006), new THREE.MeshStandardMaterial({ color: P.pinkDeep }), 0, 0.065, 0.004);
  const hourPivot = new THREE.Group(); clockHands.add(hourPivot); hourPivot.add(hour);
  const secPivot = new THREE.Group(); clockHands.add(secPivot);
  put(secPivot, new THREE.BoxGeometry(0.004, 0.16, 0.004), new THREE.MeshStandardMaterial({ color: '#e0565b' }), 0, 0.06, 0.008);
  const minPivot = new THREE.Group(); clockHands.add(minPivot); minPivot.add(minute);

  // --- dental chair (backrest and legrest tilt; the patient sits facing +X)
  const chair = buildChair(m);
  group.add(chair.group);

  // --- lamp over the chair
  // (the pole stands behind the chair, out of the way; a long arm reaches over the patient)
  const pole = new THREE.Vector3(-0.75, 0, -1.65);
  put(still, new THREE.CylinderGeometry(0.12, 0.14, 0.05, 20), m.white, pole.x, 0.025, pole.z);
  put(still, new THREE.CylinderGeometry(0.025, 0.025, 2.2, 12), m.white, pole.x, 1.1, pole.z);
  // the arm swings over the patient during treatment and parks behind the pole on the menus
  const pivot = new THREE.Vector3(pole.x, 2.18, pole.z);
  const lampArm = new THREE.Group();
  lampArm.position.copy(pivot);
  group.add(lampArm);
  const lampHead = new THREE.Group();
  lampHead.position.set(-0.22, 2.05, -0.9).sub(pivot);
  lampHead.rotation.set(-0.35, 0.3, 0);
  rod(lampArm, new THREE.Vector3(), lampHead.position.clone().add(new THREE.Vector3(0, 0.05, 0)), 0.018, m.white);
  lampArm.add(lampHead);
  let lampPark = 0;
  put(lampHead, box(0.3, 0.06, 0.16, 0.025), m.mint, 0, 0, 0);
  put(lampHead, new THREE.PlaneGeometry(0.25, 0.11), m.lampGlow, 0, -0.031, 0, Math.PI / 2);

  // --- spittoon by the chair
  put(still, new THREE.CylinderGeometry(0.025, 0.025, 0.72, 10), m.white, 0.2, 0.36, -1.0);
  put(still, new THREE.CylinderGeometry(0.12, 0.06, 0.08, 20), m.white, 0.2, 0.74, -1.0);
  put(still, new THREE.CylinderGeometry(0.09, 0.09, 0.01, 20), m.water, 0.2, 0.77, -1.0);
  put(still, new THREE.CylinderGeometry(0.03, 0.025, 0.08, 12), m.pink, 0.05, 0.82, -1.0);

  // lights
  const hemi = new THREE.HemisphereLight('#ffffff', '#f3dce3', 1.35);
  const sun = new THREE.DirectionalLight('#fff7ee', 1.25);
  sun.position.set(-2, 3.5, 1.5);
  const spot = new THREE.SpotLight('#fff6e0', 3.2, 2.4, 0.5, 0.6, 1.2);
  spot.position.set(-0.22, 2.05, -0.9);
  spot.target.position.set(-0.1, 0.95, -0.74); // the patient's mouth
  group.add(hemi, sun, spot, spot.target);

  mergeStill(still);

  const fish = buildFishTank(group, m);
  const hemiDay = hemi.intensity;
  const sunDay = sun.intensity;
  const DAY = { sky: new THREE.Color('#ffffff'), sun: new THREE.Color('#fff7ee') };
  const EVE = { sky: new THREE.Color('#ffb98a'), sun: new THREE.Color('#ffc58f') };
  const NIGHT = { sky: new THREE.Color('#41507e'), sun: new THREE.Color('#9fb0e0') };
  const _c = new THREE.Color();
  let clockHours = 9.5;
  return {
    group,
    floor,
    door,
    chair,
    mats: m,
    poster: posterMesh,
    style: 'kartun',
    /** Clinic time of day in hours (8.0 = 08:00): moves the clock hands, the light and the sky. */
    setTime(hours) {
      clockHours = hours;
      setWallClock(hourPivot, minPivot, secPivot); // the clock shows the real time in Indonesia (WIB)
      // 08-15 day, 15-17.5 golden evening, 17.5-19 into the night
      const eve = THREE.MathUtils.clamp((hours - 15) / 2.5, 0, 1);
      const night = THREE.MathUtils.clamp((hours - 17.5) / 1.5, 0, 1);
      _c.copy(DAY.sky).lerp(EVE.sky, eve).lerp(NIGHT.sky, night);
      skyMat.color.copy(_c);
      sun.color.copy(DAY.sun).lerp(EVE.sun, eve).lerp(NIGHT.sun, night);
      sun.intensity = sunDay * (1 - night * 0.6);
      hemi.intensity = hemiDay * (1 - night * 0.25);
    },
    get time() { return clockHours; },
    update(dt) {
      door.amount += (door.want - door.amount) * (1 - Math.exp(-dt * 4));
      door.hinge.rotation.y = -door.amount * 1.45;
      chair.update(dt);
      fish.update(dt);
      const park = chair.flat > 0.5 ? 1 : 0;
      lampPark += (park - lampPark) * (1 - Math.exp(-dt * (dt >= 1 ? 50 : 2.5)));
      const k = lampPark * lampPark * (3 - 2 * lampPark);
      lampArm.rotation.y = k * 2.6;
      spot.intensity = 3.2 * (1 - k);
    },
  };
}

/** A small fish tank on a cabinet under the TV, with fish swimming in loops and bubbles. */
function buildFishTank(parent, m) {
  const g = new THREE.Group();
  g.position.set(ROOM.maxX - 0.2, 0, -0.45);
  put(g, box(0.34, 0.7, 0.62, 0.02), m.white, 0, 0.35, 0);
  put(g, box(0.36, 0.03, 0.64, 0.01), m.mintDeep, 0, 0.715, 0);
  const water = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.3, 0.56), new THREE.MeshStandardMaterial({ color: '#8fd3f0', transparent: true, opacity: 0.35, roughness: 0.05, depthWrite: false }));
  water.position.y = 0.88;
  g.add(water);
  const glass = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.33, 0.58), new THREE.MeshStandardMaterial({ color: '#ffffff', transparent: true, opacity: 0.12, roughness: 0.02, depthWrite: false }));
  glass.position.y = 0.895;
  g.add(glass);
  put(g, new THREE.BoxGeometry(0.28, 0.03, 0.56), new THREE.MeshStandardMaterial({ color: '#f3e3c3', roughness: 1 }), 0, 0.745, 0);
  for (let i = 0; i < 4; i++) {
    const weed = new THREE.Mesh(new THREE.ConeGeometry(0.012, 0.12 + (i % 2) * 0.06, 6), m.leaf);
    weed.position.set(-0.06 + (i % 2) * 0.12, 0.8 + (i % 2) * 0.03, -0.2 + i * 0.13);
    g.add(weed);
  }
  const fishes = [];
  const cols = ['#ff9f6b', '#f7c95e', '#f48aa8', '#7fd0ff'];
  for (let i = 0; i < 4; i++) {
    const f = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: cols[i], roughness: 0.4 });
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.018, 10, 8), mat);
    body.scale.set(0.6, 0.9, 1.4);
    const tail = new THREE.Mesh(new THREE.ConeGeometry(0.013, 0.022, 6), mat);
    tail.rotation.x = -Math.PI / 2;
    tail.position.z = 0.032;
    f.add(body, tail);
    f.userData = { r: 0.12 + i * 0.03, y: 0.83 + i * 0.045, speed: 0.6 + i * 0.15, phase: i * 1.7, tail };
    g.add(f);
    fishes.push(f);
  }
  const bubbleMat = new THREE.MeshBasicMaterial({ color: '#e8f8ff', transparent: true, opacity: 0.7 });
  const bubbles = [];
  for (let i = 0; i < 6; i++) {
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.005, 6, 4), bubbleMat);
    b.position.set(0.05, 0.76 + i * 0.05, 0.2);
    g.add(b);
    bubbles.push(b);
  }
  parent.add(g);
  let t = 0;
  return {
    update(dt) {
      t += dt;
      for (const f of fishes) {
        const u = f.userData;
        const a = t * u.speed + u.phase;
        f.position.set(Math.sin(a * 0.5) * 0.06, u.y + Math.sin(a * 1.3) * 0.015, Math.cos(a) * u.r * 1.6);
        f.rotation.y = Math.atan2(Math.cos(a * 0.5) * 0.03, -Math.sin(a) * u.r * 1.6) + Math.PI;
        u.tail.rotation.y = Math.sin(t * 12 + u.phase) * 0.5;
      }
      for (const b of bubbles) { b.position.y += dt * 0.08; if (b.position.y > 1.02) b.position.y = 0.76; }
    },
  };
}

export function buildChair(m) {
  const group = new THREE.Group();
  // the chair's own colours (can be changed in Dekorasi without touching the rest of the room)
  m = { ...m, mint: m.mint.clone(), pink: m.pink.clone() };
  group.position.set(SEAT.x, 0, SEAT.z);
  // chair "forward" is +X
  put(group, new THREE.CylinderGeometry(0.25, 0.3, 0.05, 28), m.white, 0, 0.025, 0);
  put(group, new THREE.CylinderGeometry(0.1, 0.12, 0.36, 20), m.white, 0, 0.22, 0);
  put(group, box(0.5, 0.06, 0.5, 0.025), m.white, 0, 0.39, 0);
  put(group, box(0.48, 0.09, 0.46, 0.04), m.mint, 0.01, 0.43, 0);
  // armrests
  for (const s of [-1, 1]) {
    put(group, box(0.05, 0.2, 0.05, 0.02), m.white, 0.05, 0.53, s * 0.27);
    put(group, box(0.32, 0.045, 0.08, 0.02), m.pink, 0.05, 0.64, s * 0.27);
  }
  // backrest on a hinge at the back of the seat
  const back = new THREE.Group();
  back.position.set(-0.15, 0.46, 0);
  group.add(back);
  put(back, box(0.09, 0.7, 0.46, 0.04), m.mint, -0.05, 0.35, 0);
  put(back, box(0.06, 0.66, 0.4, 0.03), m.white, -0.1, 0.35, 0);
  put(back, box(0.08, 0.17, 0.28, 0.04), m.pink, -0.08, 0.8, 0); // headrest
  // legrest
  const legs = new THREE.Group();
  legs.position.set(0.24, 0.42, 0);
  group.add(legs);
  put(legs, box(0.56, 0.08, 0.42, 0.035), m.mint, 0.27, 0, 0);
  put(legs, box(0.06, 0.12, 0.38, 0.025), m.white, 0.57, 0.03, 0);
  // `flat` folds the empty backrest right down (on the menus) so it doesn't block the board
  const chair = { group, back, legs, recline: 0, want: 0, flat: 0, flatNow: 0, padMat: m.mint, accentMat: m.pink };
  chair.update = (dt) => {
    chair.recline += (chair.want - chair.recline) * (1 - Math.exp(-dt * 3));
    chair.flatNow += (chair.flat - chair.flatNow) * (1 - Math.exp(-dt * 4));
    back.rotation.z = chair.recline * SEAT.recline + 0.05 + chair.flatNow * 1.25;
    legs.rotation.z = -0.35 - chair.recline * 0.2;
  };
  chair.flat = chair.flatNow = 1; // the game starts on the menu
  chair.update(1);
  return chair;
}

/** A cylinder from point a to point b. */
export function rod(parent, a, b, r, mat) {
  const len = a.distanceTo(b);
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 10), mat);
  m.position.copy(a).add(b).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
  parent.add(m);
  return m;
}

/** A chunky cartoon tooth shape (used as decoration). */
export function toothShape(size, mat) {
  const g = new THREE.Group();
  const crown = new THREE.Mesh(new THREE.SphereGeometry(size, 18, 14), mat);
  crown.scale.set(1.1, 0.85, 0.8);
  g.add(crown);
  for (const s of [-1, 1]) {
    const root = new THREE.Mesh(new THREE.ConeGeometry(size * 0.38, size * 1.2, 12), mat);
    root.rotation.z = Math.PI + s * 0.12;
    root.position.set(s * size * 0.45, -size * 0.85, 0);
    g.add(root);
  }
  return g;
}

/** Merge every mesh under `still` into one mesh per material (fewer draw calls on the Quest). */
export function mergeStill(still) {
  still.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(still.matrixWorld).invert();
  const byMat = new Map();
  still.traverse((o) => {
    if (!o.isMesh) return;
    const g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld));
    if (!byMat.has(o.material)) byMat.set(o.material, []);
    byMat.get(o.material).push(g);
  });
  still.clear();
  for (const [mat, list] of byMat) {
    const merged = mergeGeometries(list, false);
    if (!merged) continue;
    still.add(new THREE.Mesh(merged, mat));
  }
}
