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
};
export const TOOL_ORDER = ['mirror', 'scaler', 'suction', 'syringe', 'forceps', 'gauze', 'drill', 'filling', 'light'];

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

    const W = 0.6;
    const D = 0.39;
    this.W = W;
    this.D = D;
    // cart
    const cart = new THREE.Group();
    const white = mat(P.white, { roughness: 0.4 });
    const mint = mat(P.mint, { roughness: 0.5 });
    const legGeo = new THREE.CylinderGeometry(0.012, 0.012, 0.86, 10);
    for (const [x, z] of [[-0.26, -0.15], [0.26, -0.15], [-0.26, 0.15], [0.26, 0.15]]) {
      cart.add(at(new THREE.Mesh(legGeo, white), x, -0.47, z));
      cart.add(at(new THREE.Mesh(new THREE.SphereGeometry(0.022, 10, 8), mint), x, -0.89, z));
    }
    const shelf = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.02, 0.32), mint);
    cart.add(at(shelf, 0, -0.62, 0));
    this.group.add(cart);

    // tray with name labels painted on it
    const canvas = document.createElement('canvas');
    canvas.width = 1200;
    canvas.height = 780;
    const g = canvas.getContext('2d');
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, 1200, 780);
    g.strokeStyle = '#cdebe0';
    g.lineWidth = 6;
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) {
        g.fillStyle = (r + c) % 2 ? '#f2fbf7' : '#fff4f7';
        g.beginPath();
        g.roundRect(18 + c * 392, 18 + r * 254, 372, 236, 34);
        g.fill();
        g.stroke();
        const id = TOOL_ORDER[r * 3 + c];
        g.font = `800 46px ${FONT}`;
        g.fillStyle = '#3f8f74';
        g.textAlign = 'center';
        g.fillText(TOOL_INFO[id].name, 18 + c * 392 + 186, 18 + r * 254 + 214);
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
    TOOL_ORDER.forEach((id, n) => {
      const r = Math.floor(n / 3);
      const c = n % 3;
      const tool = buildTool(id);
      const slot = new THREE.Object3D();
      slot.position.set(-W / 2 + W / 6 + c * (W / 3), 0.018, -D / 2 + D / 6 + r * (D / 3) - 0.012);
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
      const pick = new THREE.Mesh(new THREE.BoxGeometry(W / 3 - 0.01, 0.07, D / 3 - 0.008), hidden);
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
  update(dt) {
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
