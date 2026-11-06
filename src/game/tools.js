import * as THREE from 'three';
import { P } from './palette.js';
import { FONT } from '../core/ui.js';

/**
 * The dentist's instruments. Each one is built along -Z (the way a Quest controller points),
 * with an invisible `tip` marker at the working end.
 */
export const TOOL_INFO = {
  mirror: { name: 'Kaca Mulut', sharp: false, sound: null },
  scaler: { name: 'Scaler', sharp: true, sound: 'scaler' },
  suction: { name: 'Penyedot', sharp: false, sound: 'suction' },
  syringe: { name: 'Suntik Bius', sharp: true, sound: null },
  forceps: { name: 'Tang Cabut', sharp: true, sound: null },
  gauze: { name: 'Kasa', sharp: false, sound: null },
  drill: { name: 'Bor Gigi', sharp: true, sound: 'drill' },
  filling: { name: 'Tambalan', sharp: false, sound: null },
  light: { name: 'Sinar Biru', sharp: false, sound: 'light' },
  gel: { name: 'Kuas Gel', sharp: false, sound: null },
  bracket: { name: 'Bracket', sharp: false, sound: null },
  wire: { name: 'Kawat Behel', sharp: false, sound: null },
  file: { name: 'Jarum Akar', sharp: true, sound: 'scaler' },
};
// tray order: 5 columns × 3 rows (the last two slots hold cotton rolls)
export const TOOL_ORDER = ['mirror', 'scaler', 'suction', 'drill', 'filling', 'light', 'syringe', 'forceps', 'gauze', 'gel', 'bracket', 'wire', 'file'];
const COLS = 5;
const ROWS = 3;

const mat = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.45, ...o });
// Bright brushed steel: without a reflection map, high metalness renders dark, so keep it moderate.
const STEEL = mat('#e8eef2', { metalness: 0.4, roughness: 0.28 });
const STEEL_DARK = mat('#c3cdd3', { metalness: 0.45, roughness: 0.32 });
const WHITE = mat('#fbfbfb', { roughness: 0.35 });
const GREY = mat('#9aa6ad', { roughness: 0.6 });
const RUBBER = (c) => mat(c, { roughness: 0.75 });
const at = (o, x, y, z) => { o.position.set(x, y, z); return o; };
const cyl = (r1, r2, len, m, seg = 14) => {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r1, r2, len, seg), m);
  mesh.rotation.x = Math.PI / 2; // along Z
  return mesh;
};

/**
 * A smooth turned shape along -Z (handles, bodies). `profile` is a list of [radius, distance]
 * pairs, distance measured from the back end (z = 0) toward the tip (z = -distance).
 */
function lathe(profile, m, seg = 18) {
  const geo = new THREE.LatheGeometry(profile.map(([r, d]) => new THREE.Vector2(Math.max(r, 0.0001), d)), seg);
  geo.rotateX(-Math.PI / 2);
  return new THREE.Mesh(geo, m);
}
/** A bent rod through points [x, y, z] (necks, shanks, light guides, beaks). */
function rod(points, r, m, r2 = r) {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)));
  const geo = new THREE.TubeGeometry(curve, 24, r, 8, false);
  if (r2 !== r) {
    // taper toward the end
    const pos = geo.attributes.position;
    const n = 25;
    const ring = 9;
    for (let i = 0; i < n; i++) {
      const k = 1 - (i / (n - 1)) * (1 - r2 / r);
      const c = curve.getPointAt(i / (n - 1));
      for (let j = 0; j < ring; j++) {
        const idx = i * ring + j;
        const v = new THREE.Vector3().fromBufferAttribute(pos, idx).sub(c).multiplyScalar(k).add(c);
        pos.setXYZ(idx, v.x, v.y, v.z);
      }
    }
    geo.computeVertexNormals();
  }
  return new THREE.Mesh(geo, m);
}
/** A typical dental hand instrument handle: knurled steel with a soft coloured grip. */
function instrumentHandle(g, color, len = 0.12) {
  g.add(lathe([[0, 0], [0.0045, 0.002], [0.0055, 0.01], [0.0055, len - 0.012], [0.0042, len], [0, len]], STEEL));
  g.add(lathe([[0.0062, 0.02], [0.0072, 0.03], [0.0072, 0.075], [0.0062, 0.085]], RUBBER(color)));
  for (let i = 0; i < 6; i++) g.add(at(cyl(0.0074, 0.0074, 0.0012, mat(color, { roughness: 0.6 }), 16), 0, 0, -0.034 - i * 0.008));
}
/** Two arms meeting at a hinge (pliers, forceps, tweezers). */
function pliers(g, { grip, gripLen = 0.1, spread = 0.012, beak }) {
  for (const s of [-1, 1]) {
    g.add(rod([[s * spread, 0, 0.0], [s * spread * 1.05, 0, -gripLen * 0.5], [s * 0.004, 0, -gripLen]], 0.0034, STEEL_DARK));
    if (grip) g.add(rod([[s * spread, 0, -0.005], [s * spread * 1.05, 0, -gripLen * 0.5], [s * spread * 0.6, 0, -gripLen * 0.8]], 0.0048, RUBBER(grip)));
    beak(s);
  }
  g.add(at(new THREE.Mesh(new THREE.SphereGeometry(0.0055, 12, 8), STEEL), 0, 0, -gripLen));
}

const BUILD = {
  mirror(g) {
    instrumentHandle(g, P.mint);
    g.add(rod([[0, 0, -0.12], [0, 0, -0.15], [0, -0.004, -0.168]], 0.0018, STEEL));
    const head = new THREE.Group();
    head.add(cyl(0.0125, 0.0125, 0.003, STEEL, 24));
    const glass = cyl(0.0112, 0.0112, 0.0008, mat('#eaf6ff', { metalness: 0.9, roughness: 0.04, emissive: '#bfe6ff', emissiveIntensity: 0.25 }), 24);
    glass.position.z = -0.0016;
    head.add(glass);
    head.rotation.x = -1.1; // the mirror faces down and forward
    g.add(at(head, 0, -0.008, -0.176));
    return at(new THREE.Object3D(), 0, -0.01, -0.178);
  },
  scaler(g) {
    instrumentHandle(g, P.pink);
    // tapered shank that bends down into a pointed sickle
    g.add(rod([[0, 0, -0.118], [0, 0, -0.145], [0, -0.006, -0.162], [0, -0.016, -0.166]], 0.0022, STEEL, 0.0008));
    const blade = new THREE.Mesh(new THREE.ConeGeometry(0.0016, 0.012, 8), STEEL);
    blade.rotation.x = Math.PI; // point down
    g.add(at(blade, 0, -0.021, -0.166));
    return at(new THREE.Object3D(), 0, -0.026, -0.166);
  },
  suction(g) {
    // high-volume suction: grey hose, valve body, then a white tube with an angled tip
    g.add(rod([[0, -0.03, 0.03], [0, -0.006, 0.014], [0, 0, 0.0]], 0.0075, GREY)); // hose stub (short, so it fits the tray)
    g.add(lathe([[0.009, 0], [0.0105, 0.004], [0.0105, 0.05], [0.009, 0.055]], mat(P.mint, { roughness: 0.4 })));
    g.add(at(cyl(0.004, 0.004, 0.012, WHITE), 0.011, 0, -0.025));
    g.add(rod([[0, 0, -0.05], [0, 0, -0.12], [0, -0.012, -0.155], [0, -0.03, -0.17]], 0.0065, mat('#ffffff', { roughness: 0.25, transparent: true, opacity: 0.92 })));
    return at(new THREE.Object3D(), 0, -0.036, -0.172);
  },
  drill(g) {
    // contra-angle handpiece: hose connector, slim body, angled neck, head with the bur pointing down
    const hose = rod([[0, -0.03, 0.03], [0, -0.006, 0.014], [0, 0, 0.0]], 0.0065, GREY);
    hose.userData.noGold = true;
    g.add(hose);
    g.add(lathe([[0.0075, 0], [0.0095, 0.006], [0.0105, 0.02], [0.01, 0.07], [0.0082, 0.11], [0.0065, 0.13]], WHITE));
    g.add(at(cyl(0.0107, 0.0107, 0.006, mat(P.mint), 18), 0, 0, -0.03));
    g.add(at(cyl(0.0102, 0.0102, 0.0015, STEEL, 18), 0, 0, -0.018));
    g.add(rod([[0, 0, -0.128], [0, -0.004, -0.145], [0, -0.009, -0.158]], 0.0056, STEEL));
    const head = new THREE.Mesh(new THREE.CylinderGeometry(0.0072, 0.0072, 0.011, 18), STEEL);
    g.add(at(head, 0, -0.011, -0.162));
    const bur = new THREE.Mesh(new THREE.CylinderGeometry(0.0011, 0.0009, 0.014, 8), mat('#f2c14e', { metalness: 0.7, roughness: 0.3 }));
    g.add(at(bur, 0, -0.023, -0.162));
    return at(new THREE.Object3D(), 0, -0.031, -0.162);
  },
  filling(g) {
    instrumentHandle(g, P.mintDeep);
    g.add(rod([[0, 0, -0.118], [0, 0, -0.15], [0, -0.006, -0.163]], 0.002, STEEL, 0.0012));
    const paddle = new THREE.Mesh(new THREE.SphereGeometry(0.0045, 12, 8), STEEL);
    paddle.scale.set(1, 0.35, 1.5);
    g.add(at(paddle, 0, -0.008, -0.168));
    const putty = new THREE.Mesh(new THREE.SphereGeometry(0.004, 12, 8), mat('#fff3dc', { roughness: 0.8 }));
    g.add(at(putty, 0, -0.0055, -0.17));
    return at(new THREE.Object3D(), 0, -0.01, -0.172);
  },
  light(g) {
    // curing light: a white pen-shaped body, a curved light guide pointing down,
    // the orange eye-protection shield, and a glowing blue tip
    g.add(lathe([[0, 0], [0.008, 0.002], [0.0125, 0.02], [0.013, 0.09], [0.011, 0.115], [0.0075, 0.125], [0.0075, 0.13]], WHITE));
    g.add(at(cyl(0.0133, 0.0133, 0.012, mat(P.pink), 20), 0, 0, -0.06));
    const button = new THREE.Mesh(new THREE.SphereGeometry(0.0045, 12, 8), mat(P.pinkDeep));
    button.scale.set(1, 0.6, 1.4);
    g.add(at(button, 0, 0.012, -0.045));
    const display = new THREE.Mesh(new THREE.BoxGeometry(0.009, 0.002, 0.018), mat('#2e3b36', { emissive: '#4aa8ff', emissiveIntensity: 0.6 }));
    g.add(at(display, 0, 0.0125, -0.08));
    const guideMat = mat('#30383d', { metalness: 0.4, roughness: 0.25 });
    g.add(rod([[0, 0, -0.128], [0, 0, -0.15], [0, -0.008, -0.168], [0, -0.024, -0.176]], 0.0042, guideMat));
    const shield = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.0015, 24), mat('#ff9a3c', { transparent: true, opacity: 0.55, roughness: 0.1, emissive: '#ff7a1a', emissiveIntensity: 0.2 }));
    shield.rotation.x = Math.PI / 2;
    g.add(at(shield, 0, 0, -0.142));
    const glow = new THREE.Mesh(new THREE.SphereGeometry(0.0046, 12, 8), mat('#8fd0ff', { emissive: '#4aa8ff', emissiveIntensity: 1.4 }));
    glow.scale.y = 0.5;
    g.add(at(glow, 0, -0.028, -0.177));
    return at(new THREE.Object3D(), 0, -0.031, -0.177);
  },
  syringe(g) {
    // dental aspirating syringe: thumb ring, plunger, steel barrel frame with the cartridge, needle
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.011, 0.0028, 8, 20), STEEL);
    ring.rotation.y = Math.PI / 2;
    g.add(at(ring, 0, 0, 0.012));
    g.add(at(cyl(0.0022, 0.0022, 0.04, STEEL), 0, 0, -0.018));
    for (const s of [-1, 1]) {
      const fg = new THREE.Mesh(new THREE.TorusGeometry(0.007, 0.0022, 8, 16), STEEL);
      fg.rotation.y = Math.PI / 2;
      g.add(at(fg, s * 0.014, 0, -0.04));
    }
    g.add(at(cyl(0.0085, 0.0085, 0.006, STEEL, 18), 0, 0, -0.042));
    for (const a of [0, Math.PI / 2, Math.PI, Math.PI * 1.5]) g.add(at(cyl(0.0014, 0.0014, 0.06, STEEL, 8), Math.cos(a) * 0.0075, Math.sin(a) * 0.0075, -0.074));
    g.add(at(cyl(0.0062, 0.0062, 0.055, mat('#ffffff', { transparent: true, opacity: 0.45, roughness: 0.05 }), 16), 0, 0, -0.074));
    g.add(at(cyl(0.0055, 0.0055, 0.02, mat(P.pink, { emissive: '#f48aa8', emissiveIntensity: 0.15 }), 16), 0, 0, -0.08));
    g.add(at(cyl(0.0085, 0.0085, 0.006, STEEL, 18), 0, 0, -0.106));
    g.add(at(cyl(0.0045, 0.002, 0.01, mat(P.mint), 12), 0, 0, -0.114));
    g.add(at(cyl(0.0006, 0.0005, 0.04, STEEL, 6), 0, 0, -0.139));
    return at(new THREE.Object3D(), 0, 0, -0.159);
  },
  forceps(g) {
    // extraction forceps: mint grips, hinge, curved beaks pointing down
    pliers(g, {
      grip: P.mint,
      gripLen: 0.11,
      beak: (s) => g.add(rod([[s * 0.004, 0, -0.11], [s * 0.005, -0.004, -0.13], [s * 0.003, -0.016, -0.145], [s * 0.0015, -0.028, -0.148]], 0.0028, STEEL, 0.0016)),
    });
    return at(new THREE.Object3D(), 0, -0.03, -0.148);
  },
  gauze(g) {
    // cotton pliers holding a rolled gauze pad
    pliers(g, {
      gripLen: 0.03,
      spread: 0.006,
      beak: (s) => g.add(rod([[s * 0.006, 0, -0.03], [s * 0.004, 0, -0.1], [s * 0.0015, -0.006, -0.14]], 0.0018, STEEL, 0.001)),
    });
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.0055, 0.0055, 0.022, 12), mat('#ffffff', { roughness: 1 }));
    pad.rotation.z = Math.PI / 2;
    g.add(at(pad, 0, -0.009, -0.145));
    return at(new THREE.Object3D(), 0, -0.012, -0.146);
  },
  gel(g) {
    // micro-brush applicator: thin coloured stick, bent tip, fuzzy brush loaded with gel
    g.add(lathe([[0, 0], [0.004, 0.002], [0.0045, 0.06], [0.0025, 0.1], [0.0018, 0.13]], mat('#a8d8f0', { roughness: 0.4 })));
    g.add(rod([[0, 0, -0.128], [0, 0, -0.15], [0, -0.006, -0.162]], 0.0015, mat('#a8d8f0', { roughness: 0.4 })));
    const brush = new THREE.Mesh(new THREE.SphereGeometry(0.0032, 10, 8), mat('#ffffff', { roughness: 1 }));
    g.add(at(brush, 0, -0.009, -0.165));
    const gel = new THREE.Mesh(new THREE.SphereGeometry(0.0028, 10, 8), mat('#bfe8ff', { transparent: true, opacity: 0.85, roughness: 0.1, emissive: '#7fd0ff', emissiveIntensity: 0.3 }));
    g.add(at(gel, 0, -0.0115, -0.166));
    return at(new THREE.Object3D(), 0, -0.012, -0.166);
  },
  bracket(g) {
    // bracket tweezers holding one bracket
    pliers(g, {
      gripLen: 0.02,
      spread: 0.006,
      beak: (s) => g.add(rod([[s * 0.006, 0, -0.02], [s * 0.005, 0, -0.1], [s * 0.0016, -0.004, -0.14]], 0.0018, STEEL, 0.001)),
    });
    for (const s of [-1, 1]) g.add(at(rod([[s * 0.0068, 0, -0.035], [s * 0.0062, 0, -0.08]], 0.0026, RUBBER(P.pinkDeep)), 0, 0, 0));
    const br = new THREE.Group();
    br.add(new THREE.Mesh(new THREE.BoxGeometry(0.007, 0.002, 0.006), STEEL));
    for (const s of [-1, 1]) br.add(at(new THREE.Mesh(new THREE.BoxGeometry(0.0015, 0.0025, 0.007), STEEL), s * 0.002, -0.0018, 0));
    g.add(at(br, 0, -0.006, -0.143));
    return at(new THREE.Object3D(), 0, -0.008, -0.144);
  },
  wire(g) {
    // pliers holding the arch wire
    pliers(g, {
      grip: P.mintDeep,
      gripLen: 0.1,
      beak: (s) => g.add(rod([[s * 0.004, 0, -0.1], [s * 0.003, 0, -0.12], [s * 0.0012, -0.003, -0.135]], 0.0026, STEEL, 0.0012)),
    });
    const arch = new THREE.Mesh(new THREE.TorusGeometry(0.022, 0.0009, 6, 28, Math.PI), STEEL);
    arch.rotation.x = Math.PI / 2;
    g.add(at(arch, 0, -0.004, -0.137));
    return at(new THREE.Object3D(), 0, -0.004, -0.15);
  },
  file(g) {
    // endodontic file: ridged yellow handle, pink rubber stop, fine twisted steel needle
    const yellow = mat('#ffd36b', { roughness: 0.5 });
    g.add(lathe([[0, 0], [0.006, 0.002], [0.0072, 0.01], [0.0072, 0.03], [0.0042, 0.04], [0.0035, 0.085], [0.0025, 0.095]], yellow));
    for (let i = 0; i < 4; i++) g.add(at(cyl(0.0076, 0.0076, 0.0015, mat('#f2c14e'), 14), 0, 0, -0.012 - i * 0.005));
    g.add(at(cyl(0.004, 0.004, 0.0025, RUBBER(P.pinkDeep), 14), 0, 0, -0.105));
    const needle = new THREE.Mesh(new THREE.ConeGeometry(0.0009, 0.05, 6, 6), STEEL);
    needle.rotation.x = -Math.PI / 2;
    g.add(at(needle, 0, 0, -0.12));
    return at(new THREE.Object3D(), 0, 0, -0.145);
  },
};

export function buildTool(id) {
  const group = new THREE.Group();
  const tip = BUILD[id](group);
  group.add(tip);
  group.name = `tool-${id}`;
  return { id, ...TOOL_INFO[id], group, tip };
}

/**
 * The instrument tray on a little cart, within reach of the left hand. Point at a tool and pull
 * the trigger to take it; picking another tool sends the first one back.
 */
export class ToolTray {
  constructor(app, { position = new THREE.Vector3(-0.46, 0.92, -0.36), yaw = 0.45 } = {}) {
    this.app = app;
    this.group = new THREE.Group();
    this.group.position.copy(position);
    this.group.rotation.y = yaw;
    this.surface = new THREE.Group();
    this.surface.rotation.x = 0.32; // tilted toward the dentist
    this.group.add(this.surface);

    const W = 0.86;
    const D = 0.42;
    this.W = W;
    this.D = D;
    // cart
    const cart = new THREE.Group();
    const white = mat(P.white, { roughness: 0.4 });
    const mint = mat(P.mint, { roughness: 0.5 });
    const legGeo = new THREE.CylinderGeometry(0.012, 0.012, 0.86, 10);
    for (const [x, z] of [[-0.38, -0.16], [0.38, -0.16], [-0.38, 0.16], [0.38, 0.16]]) {
      cart.add(at(new THREE.Mesh(legGeo, white), x, -0.47, z));
      cart.add(at(new THREE.Mesh(new THREE.SphereGeometry(0.022, 10, 8), mint), x, -0.89, z));
    }
    const shelf = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.02, 0.34), mint);
    cart.add(at(shelf, 0, -0.62, 0));
    this.group.add(cart);

    // tray with name labels painted on it
    const canvas = document.createElement('canvas');
    const CW = 1600;
    const CH = 780;
    canvas.width = CW;
    canvas.height = CH;
    const g = canvas.getContext('2d');
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, CW, CH);
    g.strokeStyle = '#cdebe0';
    g.lineWidth = 6;
    const cw = (CW - 16) / COLS;
    const ch = (CH - 16) / ROWS;
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        g.fillStyle = (r + c) % 2 ? '#f2fbf7' : '#fff4f7';
        g.beginPath();
        g.roundRect(14 + c * cw, 14 + r * ch, cw - 12, ch - 12, 30);
        g.fill();
        g.stroke();
        const id = TOOL_ORDER[r * COLS + c];
        if (!id) continue;
        g.font = `800 36px ${FONT}`;
        g.fillStyle = '#3f8f74';
        g.textAlign = 'center';
        g.fillText(TOOL_INFO[id].name, 14 + c * cw + (cw - 12) / 2, 14 + r * ch + ch - 34);
      }
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    const tray = new THREE.Mesh(new THREE.BoxGeometry(W, 0.016, D), [
      mint, mint, new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6 }), mint, mint, mint,
    ]);
    tray.position.y = -0.008;
    this.surface.add(tray);
    const rim = new THREE.Mesh(new THREE.BoxGeometry(W + 0.02, 0.026, 0.012), mint);
    this.surface.add(at(rim, 0, 0.004, D / 2 + 0.004));
    this.surface.add(at(rim.clone(), 0, 0.004, -D / 2 - 0.004));

    // tools in their slots
    this.tools = {};
    const hidden = new THREE.MeshBasicMaterial({ visible: false });
    const slotPos = (n) => {
      const r = Math.floor(n / COLS);
      const c = n % COLS;
      return new THREE.Vector3(-W / 2 + W / (COLS * 2) + c * (W / COLS), 0.018, -D / 2 + D / (ROWS * 2) + r * (D / ROWS) - 0.012);
    };
    // cotton rolls in the two spare slots
    for (let n = TOOL_ORDER.length; n < COLS * ROWS; n++) {
      const sp = slotPos(n);
      for (let k = 0; k < 3; k++) {
        const roll = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.04, 10), mat('#ffffff', { roughness: 1 }));
        roll.rotation.z = Math.PI / 2;
        roll.position.set(sp.x, 0.012, sp.z - 0.02 + k * 0.02);
        this.surface.add(roll);
      }
    }
    // glowing ring the tutorial uses to show which tool to take
    this.ring = new THREE.Mesh(new THREE.RingGeometry(0.05, 0.062, 32), new THREE.MeshBasicMaterial({ color: P.pinkDeep, transparent: true, opacity: 0.9, toneMapped: false }));
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.visible = false;
    this.surface.add(this.ring);
    this.t = 0;
    TOOL_ORDER.forEach((id, n) => {
      const tool = buildTool(id);
      const slot = new THREE.Object3D();
      slot.position.copy(slotPos(n));
      slot.rotation.y = Math.PI / 2; // lying sideways, tip to the left
      this.surface.add(slot);
      tool.slot = slot;
      tool.home = true;
      tool.hover = 0;
      tool.lift = 0;
      slot.add(tool.group);
      tool.group.position.set(0, 0, 0.085);
      tool.group.scale.setScalar(0.92);
      // big invisible box that is easy to point at
      const pick = new THREE.Mesh(new THREE.BoxGeometry(W / COLS - 0.008, 0.07, D / ROWS - 0.008), hidden);
      pick.position.copy(slot.position).add(new THREE.Vector3(0, 0.02, 0));
      this.surface.add(pick);
      tool.pick = pick;
      app.addTarget(pick, {
        onHover: (v) => { tool.hover = v ? 1 : 0; },
        onSelect: (hit, pointer) => this.onPick?.(tool, pointer),
      });
      this.tools[id] = tool;
    });
  }

  /** Smoothly lift hovered tools and fly tools between the tray and a hand. */
  /** Show a pulsing ring under one tool (or none). */
  highlight(id) {
    this.highlighted = id || null;
    this.ring.visible = !!id;
    if (id) this.ring.position.set(this.tools[id].slot.position.x, 0.013, this.tools[id].slot.position.z);
  }

  /** The unlockable gold drill. */
  setGold(on) {
    const d = this.tools.drill.group;
    d.traverse((o) => {
      if (!o.isMesh || o.userData.noGold) return;
      if (!o.userData.orig) o.userData.orig = o.material;
      o.material = on ? GOLD : o.userData.orig;
    });
  }

  update(dt) {
    this.t += dt;
    if (this.ring.visible) {
      const s = 1 + Math.sin(this.t * 6) * 0.12;
      this.ring.scale.setScalar(s);
      this.ring.material.opacity = 0.55 + Math.sin(this.t * 6) * 0.35;
    }
    const k = 1 - Math.exp(-dt * 12);
    for (const tool of Object.values(this.tools)) {
      if (tool.home) {
        tool.lift += (tool.hover * 0.03 - tool.lift) * k;
        const want = _p.set(0, tool.lift, 0.085);
        tool.group.position.lerp(want, k);
        tool.group.quaternion.slerp(_q.identity(), k);
        const s = 0.92 + tool.hover * 0.08;
        tool.group.scale.setScalar(tool.group.scale.x + (s - tool.group.scale.x) * k);
      } else if (tool.holdPos) {
        tool.group.position.lerp(tool.holdPos, tool.snap ? 1 : k * 1.4);
        tool.group.quaternion.slerp(tool.holdQuat, tool.snap ? 1 : k * 1.4);
        tool.group.scale.setScalar(tool.group.scale.x + (1 - tool.group.scale.x) * k);
      }
      tool.pick.userData.enabled = tool.home;
    }
  }

  /** Put a tool in a hand (a controller, or the camera on desktop). */
  give(tool, holder, pos, quat) {
    holder.attach(tool.group);
    tool.home = false;
    tool.hover = 0;
    tool.holdPos = pos.clone();
    tool.holdQuat = quat.clone();
    tool.snap = false;
  }

  /** Send a tool flying back to its slot. */
  putBack(tool) {
    if (tool.home) return;
    tool.slot.attach(tool.group);
    tool.home = true;
    tool.holdPos = null;
  }
}
const _p = new THREE.Vector3();
const _q = new THREE.Quaternion();
const GOLD = mat('#f7d26b', { metalness: 0.45, roughness: 0.28, emissive: '#7a5a00', emissiveIntensity: 0.25 });
