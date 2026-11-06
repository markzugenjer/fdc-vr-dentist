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
const METAL = mat('#dfe7ec', { metalness: 0.85, roughness: 0.22 });
const cyl = (r1, r2, len, m, seg = 14) => {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r1, r2, len, seg), m);
  mesh.rotation.x = Math.PI / 2; // along Z
  return mesh;
};
const at = (o, x, y, z) => { o.position.set(x, y, z); return o; };

function handle(color, len = 0.12) {
  const g = new THREE.Group();
  g.add(at(cyl(0.0095, 0.0095, len, mat(color)), 0, 0, -len / 2));
  g.add(at(cyl(0.0108, 0.0108, 0.035, mat(P.white, { roughness: 0.35 })), 0, 0, -0.03));
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.0095, 12, 8), mat(color));
  g.add(at(cap, 0, 0, 0));
  return g;
}

const BUILD = {
  mirror(g) {
    g.add(handle(P.mint));
    g.add(at(cyl(0.0028, 0.0028, 0.05, METAL), 0, 0, -0.145));
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.004, 24), mat('#eef6fb', { metalness: 1, roughness: 0.05 }));
    disc.rotation.x = 0.5;
    return at(disc, 0, 0.004, -0.178);
  },
  scaler(g) {
    g.add(handle(P.pink));
    g.add(at(cyl(0.006, 0.0025, 0.04, METAL), 0, 0, -0.14));
    const hook = new THREE.Mesh(new THREE.TorusGeometry(0.009, 0.0022, 6, 12, Math.PI * 0.9), METAL);
    hook.rotation.y = Math.PI / 2;
    return at(hook, 0, -0.008, -0.166);
  },
  suction(g) {
    g.add(at(cyl(0.011, 0.011, 0.05, mat('#9aa8b0')), 0, 0, 0.02));
    g.add(at(cyl(0.0085, 0.0085, 0.15, mat('#ffffff', { roughness: 0.3, transparent: true, opacity: 0.92 })), 0, 0, -0.075));
    const bend = new THREE.Mesh(new THREE.TorusGeometry(0.02, 0.0085, 8, 14, Math.PI / 2), mat('#ffffff'));
    bend.rotation.y = Math.PI / 2;
    g.add(at(bend, 0, -0.02, -0.15));
    return at(new THREE.Object3D(), 0, -0.03, -0.17);
  },
  syringe(g) {
    g.add(at(cyl(0.012, 0.012, 0.085, mat('#ffffff', { transparent: true, opacity: 0.55, roughness: 0.1 })), 0, 0, -0.06));
    g.add(at(cyl(0.009, 0.009, 0.05, mat(P.pink, { emissive: '#f48aa8', emissiveIntensity: 0.15 })), 0, 0, -0.08));
    g.add(at(cyl(0.004, 0.004, 0.05, mat(P.mint)), 0, 0, 0.0));
    const thumb = cyl(0.016, 0.016, 0.005, mat(P.mint));
    g.add(at(thumb, 0, 0, 0.025));
    for (const s of [-1, 1]) g.add(at(cyl(0.01, 0.01, 0.004, mat(P.mint)), s * 0.016, 0, -0.022));
    g.add(at(cyl(0.004, 0.001, 0.012, METAL), 0, 0, -0.108));
    g.add(at(cyl(0.0011, 0.0008, 0.045, METAL), 0, 0, -0.135));
    return at(new THREE.Object3D(), 0, 0, -0.158);
  },
  forceps(g) {
    const grip = mat(P.pink);
    for (const s of [-1, 1]) {
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.009, 0.006, 0.13), grip);
      arm.rotation.y = s * 0.06;
      g.add(at(arm, s * 0.008, 0, -0.04));
      const jaw = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.005, 0.06), METAL);
      jaw.rotation.y = -s * 0.07;
      jaw.rotation.x = 0.35;
      g.add(at(jaw, s * 0.004, -0.01, -0.13));
    }
    g.add(at(new THREE.Mesh(new THREE.SphereGeometry(0.008, 10, 8), METAL), 0, 0, -0.1));
    return at(new THREE.Object3D(), 0, -0.02, -0.16);
  },
  gauze(g) {
    for (const s of [-1, 1]) {
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.004, 0.13), METAL);
      arm.rotation.y = s * 0.04;
      g.add(at(arm, s * 0.004, 0, -0.065));
    }
    const pad = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.012, 0.03), mat('#ffffff', { roughness: 0.95 }));
    return g.add(at(pad, 0, 0, -0.14)), at(new THREE.Object3D(), 0, 0, -0.145);
  },
  drill(g) {
    g.add(at(cyl(0.011, 0.012, 0.15, mat('#ffffff', { roughness: 0.3 })), 0, 0, -0.06));
    g.add(at(cyl(0.0125, 0.0125, 0.02, mat(P.mint)), 0, 0, -0.03));
    g.add(at(cyl(0.006, 0.006, 0.04, mat('#9aa8b0')), 0, 0, 0.03));
    const head = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.02, 16), mat('#ffffff'));
    g.add(at(head, 0, -0.008, -0.142));
    const bur = new THREE.Mesh(new THREE.CylinderGeometry(0.0018, 0.0012, 0.018, 8), METAL);
    g.add(at(bur, 0, -0.026, -0.142));
    return at(new THREE.Object3D(), 0, -0.034, -0.142);
  },
  filling(g) {
    g.add(handle(P.mintDeep));
    g.add(at(cyl(0.003, 0.003, 0.04, METAL), 0, 0, -0.14));
    const paddle = new THREE.Mesh(new THREE.SphereGeometry(0.008, 12, 8), METAL);
    paddle.scale.set(1, 0.4, 1.4);
    g.add(at(paddle, 0, 0, -0.163));
    const putty = new THREE.Mesh(new THREE.SphereGeometry(0.008, 12, 8), mat('#fff6e4', { roughness: 0.8 }));
    return g.add(at(putty, 0, 0.005, -0.166)), at(new THREE.Object3D(), 0, 0.002, -0.168);
  },
  light(g) {
    g.add(at(cyl(0.014, 0.016, 0.13, mat(P.pink)), 0, 0, -0.05));
    g.add(at(cyl(0.0155, 0.0155, 0.02, mat('#ffffff')), 0, 0, -0.1));
    const guide = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.06, 12), mat('#ffb36b', { transparent: true, opacity: 0.8, emissive: '#ff9a3c', emissiveIntensity: 0.3 }));
    guide.rotation.x = Math.PI / 2 + 0.6;
    g.add(at(guide, 0, -0.016, -0.13));
    const glow = new THREE.Mesh(new THREE.SphereGeometry(0.008, 12, 8), mat('#8fd0ff', { emissive: '#4aa8ff', emissiveIntensity: 1.2 }));
    g.add(at(glow, 0, -0.034, -0.153));
    return at(new THREE.Object3D(), 0, -0.036, -0.156);
  },
};

Object.assign(BUILD, {
  gel(g) {
    g.add(handle('#a8d8f0'));
    g.add(at(cyl(0.003, 0.003, 0.04, METAL), 0, 0, -0.14));
    const brush = new THREE.Mesh(new THREE.SphereGeometry(0.007, 10, 8), mat('#ffffff', { roughness: 0.9 }));
    brush.scale.set(1, 1, 1.5);
    g.add(at(brush, 0, 0, -0.165));
    const gel = new THREE.Mesh(new THREE.SphereGeometry(0.006, 10, 8), mat('#bfe8ff', { transparent: true, opacity: 0.85, roughness: 0.1, emissive: '#7fd0ff', emissiveIntensity: 0.25 }));
    return g.add(at(gel, 0, 0.004, -0.17)), at(new THREE.Object3D(), 0, 0.002, -0.172);
  },
  bracket(g) {
    // tweezers holding a tiny metal bracket
    for (const s of [-1, 1]) {
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.005, 0.004, 0.15), mat(P.pinkDeep));
      arm.rotation.y = s * 0.05;
      g.add(at(arm, s * 0.005, 0, -0.07));
    }
    const br = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.008, 0.004), METAL);
    return g.add(at(br, 0, 0, -0.148)), at(new THREE.Object3D(), 0, 0, -0.15);
  },
  wire(g) {
    // pliers holding an arch wire
    const grip = mat(P.mintDeep);
    for (const s of [-1, 1]) {
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.009, 0.007, 0.11), grip);
      arm.rotation.y = s * 0.12;
      g.add(at(arm, s * 0.01, 0, -0.03));
    }
    g.add(at(new THREE.Mesh(new THREE.SphereGeometry(0.008, 10, 8), METAL), 0, 0, -0.09));
    g.add(at(cyl(0.004, 0.002, 0.03, METAL), 0, 0, -0.11));
    const arch = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.0012, 6, 24, Math.PI), METAL);
    arch.rotation.x = Math.PI / 2;
    return g.add(at(arch, 0, 0, -0.125)), at(new THREE.Object3D(), 0, 0, -0.14);
  },
  file(g) {
    // endodontic file: small handle, rubber stop, thin twisted needle
    g.add(at(cyl(0.008, 0.008, 0.04, mat('#ffd36b')), 0, 0, -0.02));
    g.add(at(cyl(0.004, 0.004, 0.08, mat('#ffd36b')), 0, 0, -0.06));
    g.add(at(cyl(0.006, 0.006, 0.004, mat(P.pinkDeep)), 0, 0, -0.105));
    const needle = cyl(0.0012, 0.0004, 0.06, METAL, 6);
    return g.add(at(needle, 0, 0, -0.135)), at(new THREE.Object3D(), 0, 0, -0.165);
  },
});

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
      if (!o.isMesh) return;
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
const GOLD = mat('#f2c14e', { metalness: 0.9, roughness: 0.25, emissive: '#6b4b00', emissiveIntensity: 0.2 });
