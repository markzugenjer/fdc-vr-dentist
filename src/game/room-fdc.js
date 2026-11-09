import * as THREE from 'three';
import { ROOM, DOOR, SEAT, mats as baseMats, box, put, canvasTex, buildChair, rod, mergeStill } from './room.js';
import { FONT } from '../core/ui.js';

/**
 * "Klinik FDC": the treatment room modelled on a real FDC Dental Clinic room (photos, Nov 2026).
 *
 *   - sage-green walls, glossy white floor tiles, white ceiling with a warm LED cove
 *   - feature wall behind the chair: a misty tropical-jungle mural with the round
 *     "FDC DENTAL CLINIC" logo
 *   - left wall: light-oak counter with drawers, a sterilizer, a double sink, yellow and pink
 *     towels, an oak shelf with the two FDC art prints (sunset hills, sun rays) and plants,
 *     a curing light, the yellow biohazard box
 *   - right wall: black leather chairs (the waiting seats), an oak desk with a monitor and tooth
 *     models, a tan office chair, a black floating shelf with small prints, the AC unit
 *   - the white glass-panelled door, olive-green dental chair
 *
 * Same layout constants as the cartoon room (ROOM, DOOR, SEAT), so the game plays the same, and
 * the same API (group, chair, door, mats, poster, setTime, update). Everything still is merged
 * into one mesh per material, so it stays light on the Quest.
 */
export const SAGE = '#a9bd9b';
export const FDC_CHAIR = { pad: '#b9c97c', accent: '#efe7cf' };

const OAK = '#d9b07c';
const OAK_DARK = '#c49a66';
const BLACK = '#26292b';

export function buildFdcRoom() {
  // own materials (the cartoon room's are shared and get recoloured by Dekorasi)
  const b = baseMats();
  const s = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.75, ...o });
  const m = {
    ...b,
    paint: s(SAGE, { roughness: 0.95 }),
    wall: s('#ffffff', { roughness: 0.95 }),
    white: s('#ffffff', { roughness: 0.35 }),
    cream: s('#f1ead8', { roughness: 0.5 }),
    oak: s(OAK, { roughness: 0.55 }),
    oakDark: s(OAK_DARK, { roughness: 0.6 }),
    black: s(BLACK, { roughness: 0.5 }),
    leather: s('#2b2d30', { roughness: 0.45 }),
    tan: s('#a87b52', { roughness: 0.5 }),
    steel: s('#c9d0d4', { metalness: 0.7, roughness: 0.3 }),
    glassDark: s('#1b2024', { roughness: 0.15, metalness: 0.3 }),
    yellow: s('#f2d43a', { roughness: 0.6 }),
    pinkTowel: s('#e46fae', { roughness: 0.9 }),
    yellowTowel: s('#e7e04a', { roughness: 0.9 }),
    blue: s('#2a8fb8', { roughness: 0.4 }),
    leaf: s('#5f8a4a', { roughness: 0.8 }),
    leafDark: s('#46703a', { roughness: 0.8 }),
    pot: s('#2f3133', { roughness: 0.6 }),
    cove: new THREE.MeshBasicMaterial({ color: '#ffe2a8' }),
    down: new THREE.MeshBasicMaterial({ color: '#fffaf0' }),
  };
  const group = new THREE.Group();
  const still = new THREE.Group();
  group.add(still);
  const { minX, maxX, minZ, maxZ, h } = ROOM;
  const W = maxX - minX;
  const D = maxZ - minZ;
  const cx = (minX + maxX) / 2;
  const cz = (minZ + maxZ) / 2;

  // ------------------------------------------------------------------ floor: glossy white 60 cm tiles
  const floorTex = canvasTex(256, 256, (g) => {
    g.fillStyle = '#f3f1ec'; g.fillRect(0, 0, 256, 256);
    const gr = g.createLinearGradient(0, 0, 256, 256);
    gr.addColorStop(0, 'rgba(255,255,255,0.5)'); gr.addColorStop(0.5, 'rgba(255,255,255,0)'); gr.addColorStop(1, 'rgba(225,222,214,0.5)');
    g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
    g.strokeStyle = '#dcd8cf'; g.lineWidth = 3; g.strokeRect(1.5, 1.5, 253, 253);
  }, [W / 0.6, D / 0.6]);
  const floor = put(group, new THREE.PlaneGeometry(W, D), new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.18, metalness: 0.05 }), cx, 0, cz, -Math.PI / 2);
  floor.name = 'floor';

  // ------------------------------------------------------------------ walls (sage), skirting, ceiling
  const walls = [
    { x: cx, z: minZ, ry: 0, len: W },
    { x: cx, z: maxZ, ry: Math.PI, len: W },
    { x: minX, z: cz, ry: Math.PI / 2, len: D },
    { x: maxX, z: cz, ry: -Math.PI / 2, len: D },
  ];
  for (const w of walls) {
    put(still, new THREE.PlaneGeometry(w.len, h), m.paint, w.x, h / 2, w.z, 0, w.ry);
    const nx = Math.sin(w.ry) * 0.012;
    const nz = Math.cos(w.ry) * 0.012;
    put(still, new THREE.BoxGeometry(w.len, 0.08, 0.02), m.white, w.x + nx, 0.04, w.z + nz, 0, w.ry);
  }
  put(still, new THREE.PlaneGeometry(W, D), m.wall, cx, h, cz, Math.PI / 2);
  // downlights
  for (const [x, z] of [[-1.2, -1.8], [0.4, -1.8], [-1.2, 0.2], [0.4, 0.2], [1.8, -1.0]]) put(still, new THREE.CylinderGeometry(0.07, 0.07, 0.01, 16), m.down, x, h - 0.004, z);
  // warm LED cove along the top of the back wall (as in the photos)
  put(still, new THREE.BoxGeometry(W, 0.12, 0.22), m.wall, cx, h - 0.06, minZ + 0.11);
  put(still, new THREE.PlaneGeometry(W - 0.05, 0.05), m.cove, cx, h - 0.125, minZ + 0.02);
  const coveGlow = put(group, new THREE.PlaneGeometry(W, 0.5), new THREE.MeshBasicMaterial({ map: canvasTex(16, 128, (g) => {
    const gr = g.createLinearGradient(0, 0, 0, 128);
    gr.addColorStop(0, 'rgba(255,214,140,0.75)'); gr.addColorStop(1, 'rgba(255,214,140,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 16, 128);
  }), transparent: true, depthWrite: false }), cx, h - 0.38, minZ + 0.025);
  void coveGlow;

  // ------------------------------------------------------------------ the jungle mural with the FDC logo (back wall, left of the door)
  const muralW = (DOOR.x - DOOR.w / 2 - 0.1) - minX;
  const muralX = minX + muralW / 2;
  const mural = put(group, new THREE.PlaneGeometry(muralW, h - 0.12), new THREE.MeshStandardMaterial({ map: muralTexture(muralW, h - 0.12), roughness: 0.9 }), muralX, (h - 0.12) / 2, minZ + 0.008);
  void mural;

  // ------------------------------------------------------------------ the door: white frame, glass panes in a 2 × 6 grid
  const door = new THREE.Group();
  put(still, new THREE.BoxGeometry(DOOR.w + 0.12, 0.08, 0.1), m.white, DOOR.x, DOOR.h + 0.04, minZ + 0.03);
  for (const sx of [-1, 1]) put(still, new THREE.BoxGeometry(0.06, DOOR.h, 0.1), m.white, DOOR.x + sx * (DOOR.w / 2 + 0.03), DOOR.h / 2, minZ + 0.03);
  put(group, new THREE.PlaneGeometry(DOOR.w, DOOR.h), new THREE.MeshBasicMaterial({ color: '#d8ddd5' }), DOOR.x, DOOR.h / 2, minZ - 0.005);
  const hinge = new THREE.Group();
  hinge.position.set(DOOR.x - DOOR.w / 2, 0, minZ + 0.03);
  group.add(hinge);
  const leafTex = canvasTex(256, 576, (g) => {
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, 256, 576);
    for (let r = 0; r < 6; r++) for (let c = 0; c < 2; c++) {
      const x = 22 + c * 110;
      const y = 22 + r * 89;
      const gr = g.createLinearGradient(x, y, x + 100, y + 80);
      gr.addColorStop(0, '#c9d2cf'); gr.addColorStop(1, '#e7ecea');
      g.fillStyle = gr; g.fillRect(x, y, 102, 79);
      g.fillStyle = 'rgba(255,255,255,0.35)'; g.fillRect(x + 10, y + 6, 18, 66);
    }
  });
  put(hinge, box(DOOR.w - 0.02, DOOR.h - 0.02, 0.045, 0.01), new THREE.MeshStandardMaterial({ map: leafTex, roughness: 0.3 }), DOOR.w / 2, DOOR.h / 2, 0);
  put(hinge, new THREE.BoxGeometry(0.12, 0.02, 0.03), m.steel, DOOR.w - 0.12, 1.02, 0.04);
  door.hinge = hinge;
  door.amount = 0;
  door.want = 0;

  // light switch and the AC remote holder beside the door, and on the front wall
  const wallBits = (x, z, ry) => {
    const g = new THREE.Group();
    put(g, box(0.1, 0.1, 0.02, 0.01), m.white, 0, 1.3, 0);
    put(g, box(0.06, 0.13, 0.03, 0.01), m.white, 0.14, 1.3, 0);
    g.position.set(x, 0, z);
    g.rotation.y = ry;
    still.add(g);
  };
  wallBits(DOOR.x + DOOR.w / 2 + 0.25, minZ + 0.012, 0);
  wallBits(-0.6, maxZ - 0.012, Math.PI);

  // ------------------------------------------------------------------ counter on the left wall
  const cabX = minX + 0.31;
  const cab0 = minZ + 0.1; // back end
  const cab1 = -1.25; // front end
  const cabL = cab1 - cab0;
  const cabZ = (cab0 + cab1) / 2;
  put(still, box(0.6, 0.84, cabL, 0.01), m.oak, cabX, 0.44, cabZ);
  put(still, new THREE.BoxGeometry(0.56, 0.06, cabL - 0.04), m.black, cabX + 0.01, 0.03, cabZ); // plinth
  put(still, box(0.66, 0.04, cabL + 0.04, 0.008), m.oak, cabX + 0.02, 0.88, cabZ); // worktop
  // drawers (back section)
  for (let r = 0; r < 4; r++) for (let c = 0; c < 2; c++) {
    const z = cab0 + 0.17 + c * 0.3;
    const y = 0.17 + r * 0.19;
    put(still, box(0.02, 0.17, 0.28, 0.005), m.oakDark, cabX + 0.305, y, z);
    put(still, new THREE.CylinderGeometry(0.012, 0.012, 0.02, 8), m.black, cabX + 0.32, y + 0.05, z, 0, 0, Math.PI / 2);
  }
  // built-in sterilizer
  const stZ = cab0 + 0.85;
  put(still, box(0.04, 0.62, 0.42, 0.01), m.steel, cabX + 0.3, 0.5, stZ);
  put(still, box(0.02, 0.4, 0.34, 0.01), m.glassDark, cabX + 0.325, 0.48, stZ);
  put(still, box(0.02, 0.08, 0.34, 0.01), m.black, cabX + 0.325, 0.74, stZ);
  // doors with towels (front section)
  for (const k of [0, 1]) {
    const z = stZ + 0.43 + k * 0.33;
    put(still, box(0.02, 0.7, 0.31, 0.005), m.oakDark, cabX + 0.305, 0.45, z);
    put(still, new THREE.CylinderGeometry(0.012, 0.012, 0.02, 8), m.black, cabX + 0.32, 0.72, z + (k ? -0.12 : 0.12), 0, 0, Math.PI / 2);
    put(still, box(0.015, 0.3, 0.22, 0.004), k ? m.pinkTowel : m.yellowTowel, cabX + 0.322, 0.62, z);
  }
  // double sink, tap, soap
  const sinkZ = stZ + 0.6;
  put(still, box(0.44, 0.03, 0.62, 0.02), m.white, cabX + 0.02, 0.905, sinkZ);
  for (const k of [-1, 1]) put(still, new THREE.BoxGeometry(0.34, 0.012, 0.24), m.steel, cabX + 0.02, 0.92, sinkZ + k * 0.14);
  put(still, new THREE.CylinderGeometry(0.012, 0.012, 0.3, 8), m.steel, cabX - 0.2, 1.05, sinkZ);
  put(still, new THREE.CylinderGeometry(0.01, 0.01, 0.16, 8), m.steel, cabX - 0.13, 1.19, sinkZ, 0, 0, Math.PI / 2);
  put(still, new THREE.CylinderGeometry(0.03, 0.03, 0.17, 10), m.white, cabX - 0.2, 0.99, sinkZ + 0.36);
  put(still, box(0.1, 0.17, 0.08, 0.02), m.white, minX + 0.03, 1.35, sinkZ + 0.3); // wall soap dispenser
  // things on the worktop: a drawer organiser, tissue box, bottles
  put(still, box(0.22, 0.2, 0.36, 0.01), m.black, cabX - 0.12, 1.0, cab0 + 0.25);
  for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) put(still, new THREE.BoxGeometry(0.01, 0.045, 0.07), m.steel, cabX - 0.005, 0.94 + r * 0.06, cab0 + 0.12 + c * 0.085);
  put(still, box(0.14, 0.08, 0.2, 0.01), m.cream, cabX - 0.05, 0.94, cab0 + 0.65);
  for (let k = 0; k < 3; k++) put(still, new THREE.CylinderGeometry(0.03, 0.03, 0.18 + k * 0.03, 10), [m.white, m.blue, m.white][k], cabX - 0.15, 0.99 + k * 0.015, cab0 + 1.75 + k * 0.08);
  // glass splashback (a faint lighter band) and the oak shelf above
  put(still, new THREE.BoxGeometry(0.01, 0.75, cabL), s('#bfcdb2', { roughness: 0.2 }), minX + 0.006, 1.27, cabZ);
  put(still, box(0.24, 0.04, cabL - 0.1, 0.006), m.oak, minX + 0.12, 1.72, cabZ);
  // the two FDC art prints on the shelf
  const prints = [
    { tex: hillsPrint(), z: cab0 + 0.55, w: 0.3, h: 0.4 },
    { tex: sunPrint(), z: cab0 + 1.25, w: 0.42, h: 0.34 },
  ];
  for (const p of prints) {
    put(still, new THREE.BoxGeometry(0.025, p.h + 0.04, p.w + 0.04), m.black, minX + 0.06, 1.74 + p.h / 2 + 0.02, p.z, 0, 0, 0.06);
    const pm = put(group, new THREE.PlaneGeometry(p.w, p.h), new THREE.MeshStandardMaterial({ map: p.tex, roughness: 0.6 }), minX + 0.075, 1.74 + p.h / 2 + 0.02, p.z, 0, Math.PI / 2, 0);
    pm.rotation.z = 0;
  }
  // little things on the shelf: plants, a triangle-pattern cup, a box
  plant(still, m, minX + 0.13, 1.74, cab0 + 0.15, 0.6);
  plant(still, m, minX + 0.13, 1.74, cab1 - 0.15, 0.55);
  put(still, new THREE.CylinderGeometry(0.05, 0.05, 0.09, 12), m.cream, minX + 0.13, 1.785, cab0 + 0.88);
  // curing light on a stand at the front of the counter, the yellow biohazard box
  const lampBase = new THREE.Vector3(cabX + 0.18, 0, cab1 + 0.25);
  put(still, new THREE.CylinderGeometry(0.02, 0.02, 1.0, 8), m.white, lampBase.x, 0.55, lampBase.z);
  for (let k = 0; k < 5; k++) { const a = (k / 5) * Math.PI * 2; put(still, new THREE.BoxGeometry(0.2, 0.02, 0.025), m.white, lampBase.x + Math.cos(a) * 0.1, 0.04, lampBase.z + Math.sin(a) * 0.1, 0, -a, 0); }
  put(still, new THREE.CylinderGeometry(0.05, 0.05, 0.12, 12), m.blue, lampBase.x, 0.95, lampBase.z);
  rod(still, new THREE.Vector3(lampBase.x, 1.05, lampBase.z), new THREE.Vector3(lampBase.x + 0.05, 1.35, lampBase.z - 0.05), 0.012, m.white);
  rod(still, new THREE.Vector3(lampBase.x + 0.05, 1.35, lampBase.z - 0.05), new THREE.Vector3(lampBase.x + 0.22, 1.32, lampBase.z - 0.1), 0.012, m.white);
  put(still, box(0.08, 0.06, 0.06, 0.02), m.white, lampBase.x + 0.24, 1.29, lampBase.z - 0.1);
  put(still, box(0.18, 0.24, 0.12, 0.005), m.yellow, cabX + 0.18, 0.6, cab1 + 0.07);

  // ------------------------------------------------------------------ the dental chair (olive green, cream body) and its unit
  const chair = buildChair({ ...m, white: m.cream, mint: s(FDC_CHAIR.pad, { roughness: 0.4 }), pink: s(FDC_CHAIR.accent, { roughness: 0.45 }) });
  group.add(chair.group);
  // overhead lamp on a cream pole behind the chair
  const pole = new THREE.Vector3(-0.75, 0, -1.65);
  put(still, new THREE.CylinderGeometry(0.14, 0.16, 0.05, 20), m.cream, pole.x, 0.025, pole.z);
  put(still, new THREE.CylinderGeometry(0.03, 0.03, 2.2, 12), m.cream, pole.x, 1.1, pole.z);
  const lampHead = new THREE.Group();
  lampHead.position.set(-0.22, 2.05, -0.9);
  lampHead.rotation.set(-0.35, 0.3, 0);
  rod(still, new THREE.Vector3(pole.x, 2.18, pole.z), lampHead.position.clone().add(new THREE.Vector3(0, 0.05, 0)), 0.02, m.cream);
  still.add(lampHead);
  put(lampHead, box(0.32, 0.07, 0.18, 0.03), m.cream, 0, 0, 0);
  put(lampHead, new THREE.PlaneGeometry(0.26, 0.12), b.lampGlow, 0, -0.036, 0, Math.PI / 2);
  // spittoon
  put(still, new THREE.CylinderGeometry(0.025, 0.025, 0.72, 10), m.cream, 0.2, 0.36, -1.0);
  put(still, new THREE.CylinderGeometry(0.12, 0.06, 0.08, 20), m.white, 0.2, 0.74, -1.0);
  put(still, new THREE.CylinderGeometry(0.09, 0.09, 0.01, 20), b.water, 0.2, 0.77, -1.0);
  // the dentist's round stool (green seat, five-star base), parked out of the way
  const stool = new THREE.Vector3(-1.35, 0, -0.35);
  put(still, new THREE.CylinderGeometry(0.2, 0.2, 0.08, 20), s(FDC_CHAIR.pad, { roughness: 0.4 }), stool.x, 0.55, stool.z);
  put(still, new THREE.CylinderGeometry(0.025, 0.03, 0.45, 10), m.steel, stool.x, 0.3, stool.z);
  for (let k = 0; k < 5; k++) { const a = (k / 5) * Math.PI * 2; put(still, new THREE.BoxGeometry(0.26, 0.025, 0.035), m.black, stool.x + Math.cos(a) * 0.13, 0.06, stool.z + Math.sin(a) * 0.13, 0, -a, 0); }
  // a trash bin
  put(still, new THREE.CylinderGeometry(0.13, 0.12, 0.42, 16), m.steel, minX + 0.25, 0.21, -0.95);

  // ------------------------------------------------------------------ right wall: waiting chairs, desk, shelf, AC
  // two black leather chairs where the waiting patients sit (the game's bench seats)
  for (const z of [-2.0, -1.3]) blackChair(still, m, maxX - 0.3, z, -Math.PI / 2);
  // black floating shelf with small prints and a plant
  put(still, box(0.2, 0.035, 0.75, 0.006), m.black, maxX - 0.1, 1.75, -1.65);
  const small = [{ tex: duneMini(), z: -1.85 }, { tex: vaseMini(), z: -1.5 }];
  for (const p of small) {
    put(still, new THREE.BoxGeometry(0.02, 0.24, 0.19), m.black, maxX - 0.08, 1.89, p.z, 0, 0, -0.06);
    put(group, new THREE.PlaneGeometry(0.15, 0.2), new THREE.MeshStandardMaterial({ map: p.tex, roughness: 0.6 }), maxX - 0.093, 1.89, p.z, 0, -Math.PI / 2, 0);
  }
  plant(still, m, maxX - 0.12, 1.77, -1.68, 0.5);
  // the AC unit, high on the right wall
  put(still, box(0.22, 0.28, 0.9, 0.04), m.white, maxX - 0.12, 2.48, -1.65);
  put(still, new THREE.BoxGeometry(0.02, 0.03, 0.8), s('#d6dadc'), maxX - 0.235, 2.38, -1.65);
  // the doctor's desk at the front right: oak top, black legs, monitor, keyboard, tooth models
  const desk = { x: maxX - 0.42, z: 0.85 };
  put(still, box(0.62, 0.04, 1.25, 0.008), m.oak, desk.x, 0.75, desk.z);
  put(still, box(0.04, 0.3, 1.2, 0.006), m.oak, desk.x + 0.29, 0.6, desk.z);
  for (const dz of [-0.56, 0.56]) for (const dx of [-0.26, 0.26]) put(still, new THREE.CylinderGeometry(0.015, 0.012, 0.73, 6), m.black, desk.x + dx, 0.365, desk.z + dz);
  put(still, box(0.04, 0.34, 0.52, 0.01), m.white, desk.x + 0.1, 1.02, desk.z + 0.1);
  put(still, box(0.02, 0.28, 0.46, 0.006), m.glassDark, desk.x + 0.078, 1.04, desk.z + 0.1);
  put(still, new THREE.BoxGeometry(0.03, 0.14, 0.03), m.steel, desk.x + 0.14, 0.83, desk.z + 0.1);
  put(still, box(0.16, 0.012, 0.42, 0.004), m.black, desk.x - 0.12, 0.775, desk.z + 0.1);
  put(still, box(0.2, 0.004, 0.22, 0.002), m.black, desk.x - 0.12, 0.772, desk.z - 0.25);
  // tooth models on the desk: big molars on a red base and a clear jaw
  put(still, box(0.12, 0.04, 0.22, 0.01), s('#d9473f', { roughness: 0.5 }), desk.x - 0.12, 0.79, desk.z + 0.48);
  for (let k = 0; k < 3; k++) put(still, new THREE.SphereGeometry(0.035, 10, 8), m.white, desk.x - 0.12, 0.84, desk.z + 0.41 + k * 0.07);
  put(still, new THREE.SphereGeometry(0.06, 12, 8), s('#e8f2f6', { transparent: true, opacity: 0.6, roughness: 0.1 }), desk.x - 0.1, 0.81, desk.z - 0.45);
  // the tan office chair on the room side of the desk
  tanChair(still, m, desk.x - 0.6, desk.z, Math.PI / 2);

  // ------------------------------------------------------------------ the big FDC print on the left wall (this is the Dekorasi poster)
  const posterTex = happinessPrint();
  put(still, new THREE.BoxGeometry(0.03, 0.88, 0.68), m.black, minX + 0.016, 1.6, 0.35);
  const posterMesh = put(group, new THREE.PlaneGeometry(0.6, 0.8), new THREE.MeshBasicMaterial({ map: posterTex }), minX + 0.033, 1.6, 0.35, 0, Math.PI / 2);
  // a black floating shelf on the front wall with a small plant
  put(still, box(0.7, 0.035, 0.2, 0.006), m.black, 0.9, 1.65, maxZ - 0.1);
  plant(still, m, 0.75, 1.67, maxZ - 0.11, 0.5);
  // a shelf on the mural for the trophy (Dekorasi unlock)
  put(still, box(0.55, 0.035, 0.2, 0.006), m.black, -1.95, 1.755, minZ + 0.1);
  plant(still, m, -1.78, 1.775, minZ + 0.1, 0.45);

  // a clock on the right wall (the game's clinic time)
  put(still, new THREE.CylinderGeometry(0.18, 0.18, 0.035, 32), m.white, maxX - 0.02, 2.05, -0.2, 0, 0, Math.PI / 2);
  put(still, new THREE.TorusGeometry(0.18, 0.018, 8, 32), m.black, maxX - 0.03, 2.05, -0.2, 0, Math.PI / 2);
  const clockHands = new THREE.Group();
  clockHands.position.set(maxX - 0.045, 2.05, -0.2);
  clockHands.rotation.y = -Math.PI / 2;
  group.add(clockHands);
  const hour = put(clockHands, new THREE.BoxGeometry(0.016, 0.09, 0.005), m.black, 0, 0.035, 0);
  const minute = put(clockHands, new THREE.BoxGeometry(0.01, 0.14, 0.005), m.black, 0, 0.06, 0.003);
  const hourPivot = new THREE.Group(); clockHands.add(hourPivot); hourPivot.add(hour);
  const minPivot = new THREE.Group(); clockHands.add(minPivot); minPivot.add(minute);

  // lights: bright, neutral clinic light plus a warm touch from the cove
  const hemi = new THREE.HemisphereLight('#ffffff', '#e8e2d4', 1.4);
  const sun = new THREE.DirectionalLight('#fffaf2', 1.15);
  sun.position.set(-1.5, 3.5, 1.5);
  const warm = new THREE.PointLight('#ffd9a0', 0.8, 4.5, 1.6);
  warm.position.set(-0.6, 2.55, minZ + 0.4);
  const spot = new THREE.SpotLight('#fff6e0', 3.2, 2.4, 0.5, 0.6, 1.2);
  spot.position.copy(lampHead.position);
  spot.target.position.set(-0.1, 0.95, -0.74);
  group.add(hemi, sun, warm, spot, spot.target);

  mergeStill(still);

  const hemiDay = hemi.intensity;
  const sunDay = sun.intensity;
  let clockHours = 9.5;
  return {
    group,
    floor,
    door,
    chair,
    mats: m,
    poster: posterMesh,
    style: 'fdc',
    // Dekorasi's first choices map to the real clinic's look
    wallColor: (opt) => (opt.id === 'cream' ? SAGE : opt.color),
    chairColors: (opt) => (opt.id === 'mint' ? FDC_CHAIR : opt),
    setTime(hours) {
      clockHours = hours;
      minPivot.rotation.z = -((hours % 1) * Math.PI * 2);
      hourPivot.rotation.z = -((hours % 12) / 12) * Math.PI * 2;
      // no window here: the evening just warms and dims the light a little
      const eve = THREE.MathUtils.clamp((hours - 15) / 3, 0, 1);
      sun.intensity = sunDay * (1 - eve * 0.35);
      hemi.intensity = hemiDay * (1 - eve * 0.15);
      warm.intensity = 0.8 + eve * 0.6;
    },
    get time() { return clockHours; },
    update(dt) {
      door.amount += (door.want - door.amount) * (1 - Math.exp(-dt * 4));
      door.hinge.rotation.y = -door.amount * 1.45;
      chair.update(dt);
    },
  };
}

// =================================================================== furniture helpers
function plant(parent, m, x, y, z, k = 1) {
  put(parent, new THREE.CylinderGeometry(0.06 * k * 1.6, 0.05 * k * 1.6, 0.14 * k * 1.6, 12), m.pot, x, y + 0.07 * k * 1.6, z);
  for (let i = 0; i < 9; i++) {
    const a = i * 2.4;
    const r = (0.02 + (i % 3) * 0.03) * k * 1.6;
    const leaf = put(parent, new THREE.ConeGeometry(0.03 * k * 1.6, 0.22 * k * 1.6, 4), i % 2 ? m.leaf : m.leafDark,
      x + Math.cos(a) * r, y + (0.2 + (i % 3) * 0.04) * k * 1.6, z + Math.sin(a) * r, Math.sin(a) * 0.5, 0, Math.cos(a) * 0.5);
    void leaf;
  }
}

function blackChair(parent, m, x, z, yaw) {
  // black leather side chair with channel-stitched back and thin black legs (seat at y 0.47)
  const g = new THREE.Group();
  put(g, box(0.46, 0.08, 0.46, 0.04), m.leather, 0, 0.47, 0);
  put(g, box(0.46, 0.42, 0.07, 0.04), m.leather, 0, 0.74, -0.22, -0.18);
  for (let k = -2; k <= 2; k++) put(g, new THREE.BoxGeometry(0.008, 0.38, 0.075), m.black, k * 0.08, 0.74, -0.215, -0.18);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) put(g, new THREE.CylinderGeometry(0.015, 0.01, 0.46, 6), m.black, sx * 0.19, 0.22, sz * 0.18, sz * 0.12, 0, -sx * 0.08);
  g.position.set(x, 0, z);
  g.rotation.y = yaw + Math.PI;
  parent.add(g);
}

function tanChair(parent, m, x, z, yaw) {
  // tan leather office chair with chrome cantilever frame and padded arms
  const g = new THREE.Group();
  put(g, box(0.5, 0.1, 0.48, 0.04), m.tan, 0, 0.47, 0);
  put(g, box(0.5, 0.6, 0.1, 0.05), m.tan, 0, 0.85, -0.24, -0.12);
  for (let k = 0; k < 3; k++) put(g, new THREE.BoxGeometry(0.46, 0.012, 0.11), s2(m), 0, 0.7 + k * 0.15, -0.235, -0.12);
  for (const sx of [-1, 1]) {
    put(g, new THREE.BoxGeometry(0.03, 0.03, 0.5), m.steel, sx * 0.24, 0.02, 0.0);
    put(g, new THREE.BoxGeometry(0.03, 0.45, 0.03), m.steel, sx * 0.24, 0.24, 0.24, -0.15);
    put(g, box(0.06, 0.04, 0.34, 0.015), m.tan, sx * 0.28, 0.66, 0.02);
    put(g, new THREE.BoxGeometry(0.025, 0.2, 0.025), m.steel, sx * 0.28, 0.56, 0.12);
  }
  g.position.set(x, 0, z);
  g.rotation.y = yaw + Math.PI;
  parent.add(g);
}
let seam = null;
function s2(m) { seam ||= new THREE.MeshStandardMaterial({ color: '#8f6542', roughness: 0.6 }); void m; return seam; }

// =================================================================== the art (canvas textures)
function muralTexture(w, h) {
  const H = 1024;
  const Wpx = Math.round((H * w) / h);
  // seeded, so the mural looks the same every time
  let seed = 20261109;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  return canvasTex(Wpx, H, (g, W) => {
    const Math_ = { random: rnd };
    // misty grey-green background, lighter towards the top
    const bg = g.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#e9ece4'); bg.addColorStop(0.55, '#c9cfc1'); bg.addColorStop(1, '#9fa894');
    g.fillStyle = bg; g.fillRect(0, 0, W, H);
    // speckled forest texture far away
    for (let i = 0; i < 2600; i++) {
      const y = H * (0.35 + Math_.random() * 0.65);
      g.fillStyle = `rgba(${90 + Math_.random() * 40},${105 + Math_.random() * 40},${85 + Math_.random() * 30},${0.12 + Math_.random() * 0.12})`;
      g.fillRect(Math_.random() * W, y, 3 + Math_.random() * 5, 2 + Math_.random() * 4);
    }
    // palms: far (pale) to near (dark)
    const palm = (x, base, height, lean, col, fronds = 11, size = 1) => {
      const topX = x + lean;
      const topY = base - height;
      g.strokeStyle = col; g.lineWidth = 7 * size; g.lineCap = 'round';
      g.beginPath(); g.moveTo(x, base); g.quadraticCurveTo(x + lean * 0.2, base - height * 0.5, topX, topY); g.stroke();
      for (let f = 0; f < fronds; f++) {
        const a = -Math.PI / 2 + (f / (fronds - 1) - 0.5) * Math.PI * 1.5 + (Math_.random() - 0.5) * 0.2;
        const len = (110 + Math_.random() * 70) * size;
        const ex = topX + Math.cos(a) * len;
        const ey = topY + Math.sin(a) * len * 0.75 + len * 0.35;
        const mx = topX + Math.cos(a) * len * 0.5;
        const my = topY + Math.sin(a) * len * 0.5 - 18 * size;
        g.lineWidth = 3 * size;
        g.beginPath(); g.moveTo(topX, topY); g.quadraticCurveTo(mx, my, ex, ey); g.stroke();
        // leaflets
        for (let k = 1; k < 14; k++) {
          const t = k / 14;
          const px = (1 - t) * (1 - t) * topX + 2 * (1 - t) * t * mx + t * t * ex;
          const py = (1 - t) * (1 - t) * topY + 2 * (1 - t) * t * my + t * t * ey;
          const ll = (26 - t * 14) * size;
          g.lineWidth = 2.2 * size;
          g.beginPath(); g.moveTo(px, py); g.lineTo(px + Math.cos(a + 1.9) * ll, py + Math.sin(a + 1.9) * ll + ll * 0.5); g.stroke();
          g.beginPath(); g.moveTo(px, py); g.lineTo(px + Math.cos(a - 1.9) * ll, py + Math.sin(a - 1.9) * ll + ll * 0.5); g.stroke();
        }
      }
    };
    // far misty palms, then mid palms, then two big dark ones framing the logo
    for (let i = 0; i < 9; i++) palm(Math_.random() * W, H * (0.8 + Math_.random() * 0.1), H * (0.4 + Math_.random() * 0.2), (Math_.random() - 0.5) * 80, 'rgba(140,152,132,0.4)', 12, 0.9);
    for (let i = 0; i < 5; i++) palm(W * (0.05 + i * 0.22 + Math_.random() * 0.08), H * 0.95, H * (0.5 + Math_.random() * 0.15), (Math_.random() - 0.5) * 60, 'rgba(96,116,92,0.6)', 13, 1.15);
    palm(W * 0.14, H * 1.02, H * 0.88, 40, 'rgba(58,82,58,0.9)', 15, 1.7);
    palm(W * 0.86, H * 1.02, H * 0.8, -50, 'rgba(52,78,54,0.9)', 14, 1.6);
    // a band of dense tropical bushes across the lower third
    for (let i = 0; i < 160; i++) {
      const x = Math_.random() * W;
      const y = H * (0.62 + Math_.random() * 0.2);
      const r = 18 + Math_.random() * 40;
      g.fillStyle = `rgba(${60 + Math_.random() * 40},${85 + Math_.random() * 40},${60 + Math_.random() * 30},${0.35 + Math_.random() * 0.3})`;
      g.beginPath(); g.ellipse(x, y, r, r * 0.55, Math_.random() * 3, 0, Math.PI * 2); g.fill();
    }
    // ferns
    const fern = (x, y, len, a, col) => {
      g.strokeStyle = col; g.lineWidth = 3;
      g.beginPath(); g.moveTo(x, y); const ex = x + Math.cos(a) * len; const ey = y + Math.sin(a) * len; g.quadraticCurveTo((x + ex) / 2, Math.min(y, ey) - len * 0.25, ex, ey); g.stroke();
      for (let k = 1; k < 16; k++) {
        const t = k / 16;
        const px = x + (ex - x) * t;
        const py = y + (ey - y) * t - Math.sin(t * Math.PI) * len * 0.12;
        const l = (1 - t) * len * 0.22 + 6;
        g.beginPath(); g.moveTo(px, py); g.lineTo(px - l * 0.3, py - l); g.moveTo(px, py); g.lineTo(px + l * 0.3, py + l * 0.6); g.stroke();
      }
    };
    for (let i = 0; i < 40; i++) fern(Math_.random() * W, H * (0.78 + Math_.random() * 0.22), 90 + Math_.random() * 120, -Math.PI / 2 + (Math_.random() - 0.5) * 2.4, ['#3f6440', '#557a50', '#2f4f30'][i % 3]);
    // foreground tropical leaves along the bottom
    for (let i = 0; i < 150; i++) {
      const x = Math_.random() * W;
      const y = H * (0.78 + Math_.random() * 0.24);
      const r = 40 + Math_.random() * 80;
      const a = -Math.PI / 2 + (Math_.random() - 0.5) * 1.6;
      g.fillStyle = ['#3f5f3c', '#4f7148', '#2f4b2e', '#5f8257'][i % 4];
      g.save(); g.translate(x, y); g.rotate(a + Math.PI / 2);
      g.beginPath(); g.ellipse(0, -r / 2, r * 0.32, r * 0.55, 0, 0, Math.PI * 2); g.fill();
      g.strokeStyle = 'rgba(200,220,190,0.35)'; g.lineWidth = 2; g.beginPath(); g.moveTo(0, 0); g.lineTo(0, -r); g.stroke();
      g.restore();
    }
    // the round FDC DENTAL CLINIC logo
    const cxp = W * 0.5;
    const cyp = H * 0.43;
    const R = Math.min(W, H) * 0.2;
    g.fillStyle = 'rgba(244,244,238,0.72)';
    g.beginPath(); g.arc(cxp, cyp, R, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#8a5c3c'; g.lineWidth = R * 0.045;
    g.beginPath(); g.arc(cxp, cyp, R, 0, Math.PI * 2); g.stroke();
    g.fillStyle = '#7d5236';
    g.textAlign = 'center';
    g.font = `500 ${Math.round(R * 0.5)}px Georgia, "Times New Roman", serif`;
    g.fillText('FDC', cxp, cyp - R * 0.08);
    g.fillRect(cxp - R * 0.5, cyp + R * 0.02, R, R * 0.035);
    g.fillRect(cxp - R * 0.5, cyp + R * 0.09, R, R * 0.035);
    g.font = `500 ${Math.round(R * 0.2)}px Georgia, "Times New Roman", serif`;
    g.fillText('DENTAL', cxp, cyp + R * 0.38);
    g.fillText('CLINIC', cxp, cyp + R * 0.62);
  });
}

function framed(w, h, draw) {
  return canvasTex(w, h, (g) => {
    g.fillStyle = '#fbf8f2'; g.fillRect(0, 0, w, h);
    draw(g, w, h);
  });
}

function fdcMark(g, x, y, size, col = '#ffffff') {
  g.fillStyle = col;
  g.textAlign = 'center';
  g.font = `700 ${size}px ${FONT}`;
  g.fillText('fdc', x, y);
  g.font = `500 ${Math.round(size * 0.32)}px ${FONT}`;
  g.fillText('Dental Clinic', x, y + size * 0.42);
}

function hillsPrint() {
  return framed(300, 400, (g, w, h) => {
    const cols = ['#f3d2c2', '#e9a98c', '#d9805f', '#c4643f', '#a94c2f'];
    cols.forEach((c, i) => {
      g.fillStyle = c;
      g.beginPath(); g.moveTo(30, 120 + i * 45);
      g.bezierCurveTo(100, 80 + i * 45, 170, 160 + i * 45, 270, 100 + i * 45);
      g.lineTo(270, 330); g.lineTo(30, 330); g.closePath(); g.fill();
    });
    g.fillStyle = '#d9805f'; g.beginPath(); g.arc(210, 80, 18, 0, Math.PI * 2); g.fill();
    fdcMark(g, w / 2, 365, 26, '#c4643f');
  });
}

function sunPrint() {
  return framed(420, 340, (g, w, h) => {
    g.save(); g.translate(w / 2, h * 0.5);
    for (let i = 0; i < 32; i++) {
      g.rotate(Math.PI / 16);
      g.fillStyle = i % 2 ? '#e9b3a0' : '#f6e2d8';
      g.beginPath(); g.moveTo(0, 0); g.lineTo(260, -22); g.lineTo(260, 22); g.closePath(); g.fill();
    }
    g.restore();
    g.fillStyle = '#d98a74'; g.beginPath(); g.arc(w / 2, h * 0.5, 48, 0, Math.PI * 2); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.4)'; g.fillRect(0, 0, w, 14); g.fillRect(0, h - 14, w, 14);
    fdcMark(g, w / 2, h * 0.88, 22, '#b45d48');
  });
}

function happinessPrint() {
  return framed(600, 800, (g, w, h) => {
    g.fillStyle = '#b5523b'; g.fillRect(40, 40, w - 80, h - 80);
    g.fillStyle = '#f4e7d6';
    g.beginPath(); g.moveTo(120, 700); g.lineTo(120, 260); g.arc(300, 260, 180, Math.PI, 0); g.lineTo(480, 700); g.closePath(); g.fill();
    // vases with leafy stems
    const vase = (x, y, rw, rh, col) => {
      g.fillStyle = col;
      g.beginPath(); g.ellipse(x, y, rw, rh, 0, 0, Math.PI * 2); g.fill();
      g.fillRect(x - rw * 0.35, y - rh * 1.25, rw * 0.7, rh * 0.5);
    };
    g.strokeStyle = '#3d5a3a'; g.lineWidth = 6;
    for (const [x, y0] of [[250, 520], [355, 500]]) {
      g.beginPath(); g.moveTo(x, y0); g.lineTo(x, y0 - 210); g.stroke();
      for (let k = 0; k < 6; k++) {
        g.fillStyle = '#3d5a3a';
        const yy = y0 - 40 - k * 32;
        for (const sx of [-1, 1]) { g.beginPath(); g.ellipse(x + sx * 20, yy, 22, 8, sx * -0.6, 0, Math.PI * 2); g.fill(); }
      }
    }
    vase(250, 580, 60, 70, '#c4643f');
    vase(355, 560, 48, 80, '#e3a24a');
    g.fillStyle = '#f2b23a';
    g.beginPath(); g.arc(380, 230, 30, 0, Math.PI * 2); g.fill();
    g.textAlign = 'center';
    g.fillStyle = '#e8452b'; g.font = `800 64px ${FONT}`; g.fillText('fdc', w / 2, 175);
    g.fillStyle = '#3d5a3a'; g.font = `600 22px ${FONT}`; g.fillText('Dental Clinic', w / 2, 205);
    g.fillStyle = '#f4e7d6'; g.font = `600 26px ${FONT}`; g.fillText('Pure Happiness', w / 2, 735);
  });
}

function duneMini() {
  return framed(150, 200, (g, w, h) => {
    g.fillStyle = '#d9805f';
    g.beginPath(); g.moveTo(20, 180); g.lineTo(20, 70); g.arc(75, 70, 55, Math.PI, 0); g.lineTo(130, 180); g.closePath(); g.fill();
    g.fillStyle = '#f3d2c2'; g.beginPath(); g.moveTo(20, 150); g.bezierCurveTo(60, 120, 90, 160, 130, 130); g.lineTo(130, 180); g.lineTo(20, 180); g.fill();
    g.fillStyle = '#fff'; g.beginPath(); g.arc(55, 60, 10, 0, Math.PI * 2); g.fill();
  });
}

function vaseMini() {
  return framed(150, 200, (g) => {
    g.fillStyle = '#e8c39a'; g.fillRect(30, 30, 90, 140);
    g.fillStyle = '#c4643f'; g.beginPath(); g.ellipse(65, 140, 22, 26, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#e3a24a'; g.beginPath(); g.ellipse(92, 135, 16, 30, 0, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#3d5a3a'; g.lineWidth = 3; g.beginPath(); g.moveTo(65, 115); g.lineTo(60, 60); g.moveTo(92, 105); g.lineTo(98, 55); g.stroke();
  });
}
