import * as THREE from 'three';
import { P } from './palette.js';
import { makePanel, text, wrap, roundRect } from '../core/ui.js';

/**
 * Roda Hadiah: a festive prize wheel that appears after a round.
 *
 *   - the disc is one canvas texture (slices + prize text), spun with an ease-out so it slows
 *     down like a real wheel and stops in the middle of the chosen slice
 *   - the prize is picked first (weighted), then the wheel is aimed at it
 *   - a ring of light bulbs (one instanced mesh) chases while spinning and flashes on a win
 *   - a slowly turning sunburst, a banner and a stand make it look like a game-show wheel
 */
const SLICE_COLORS = [P.pinkDeep, '#ffffff', P.mintDeep, P.gold, P.pink, '#ffffff', P.mintDark, '#ffd88a'];
const INK_ON = { [P.pinkDeep]: '#ffffff', [P.mintDeep]: '#ffffff', [P.mintDark]: '#ffffff' };

const R = 0.42; // disc radius
const BULBS = 28;
const SPIN_TIME = 5.6;

export class PrizeWheel {
  constructor(app, { sfx, fx, position }) {
    this.app = app;
    this.sfx = sfx;
    this.fx = fx;
    this.group = new THREE.Group();
    this.group.position.copy(position);
    this.group.visible = false;
    this.prizes = [];
    this.time = 0;
    this.rot = 0;
    this.spin = null; // { from, to, t }
    this.lastSlice = 0;
    this.flap = 0;
    this.win = 0;
    this.show = 0; // pop-in 0..1
    this.onResult = null;

    // sunburst behind the wheel
    this.burst = new THREE.Mesh(new THREE.CircleGeometry(R * 1.75, 48), new THREE.MeshBasicMaterial({ map: sunburstTexture(), transparent: true, depthWrite: false, toneMapped: false }));
    this.burst.position.z = -0.06;
    this.group.add(this.burst);

    // the rim: a chunky gold-and-pink tyre
    const rim = new THREE.Mesh(new THREE.TorusGeometry(R + 0.03, 0.035, 14, 72), new THREE.MeshStandardMaterial({ color: P.pinkDeep, roughness: 0.35, metalness: 0.1 }));
    const rimInner = new THREE.Mesh(new THREE.TorusGeometry(R + 0.005, 0.012, 8, 72), new THREE.MeshStandardMaterial({ color: P.gold, roughness: 0.3, metalness: 0.5, emissive: '#7a5410', emissiveIntensity: 0.4 }));
    rimInner.position.z = 0.012;
    const back = new THREE.Mesh(new THREE.CylinderGeometry(R + 0.06, R + 0.06, 0.04, 64), new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.6 }));
    back.rotation.x = Math.PI / 2;
    back.position.z = -0.03;
    this.group.add(back, rim, rimInner);

    // the spinning disc (plus its pegs) lives in its own group
    this.spinner = new THREE.Group();
    this.group.add(this.spinner);
    this.discTex = new THREE.CanvasTexture(document.createElement('canvas'));
    this.discTex.colorSpace = THREE.SRGBColorSpace;
    this.discTex.anisotropy = 4;
    this.disc = new THREE.Mesh(new THREE.CircleGeometry(R, 96), new THREE.MeshBasicMaterial({ map: this.discTex, toneMapped: false }));
    this.disc.position.z = 0.005;
    this.spinner.add(this.disc);
    this.pegs = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.008, 0.008, 0.03, 8), new THREE.MeshStandardMaterial({ color: P.gold, metalness: 0.6, roughness: 0.3 }), 16);
    this.spinner.add(this.pegs);

    // hub: a white button with the FDC tooth
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.08, 0.04, 40), new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.3 }));
    hub.rotation.x = Math.PI / 2;
    hub.position.z = 0.025;
    const hubFace = new THREE.Mesh(new THREE.CircleGeometry(0.07, 40), new THREE.MeshBasicMaterial({ map: hubTexture(), toneMapped: false }));
    hubFace.position.z = 0.046;
    this.group.add(hub, hubFace);

    // pointer at the top: a pink flap with a gold pin
    this.pointer = new THREE.Group();
    this.pointer.position.set(0, R + 0.06, 0.05);
    const shape = new THREE.Shape();
    shape.moveTo(0, -0.09);
    shape.quadraticCurveTo(0.05, 0, 0.045, 0.03);
    shape.quadraticCurveTo(0, 0.07, -0.045, 0.03);
    shape.quadraticCurveTo(-0.05, 0, 0, -0.09);
    const flap = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: 0.025, bevelEnabled: true, bevelSize: 0.006, bevelThickness: 0.006, bevelSegments: 2 }), new THREE.MeshStandardMaterial({ color: P.red, roughness: 0.35 }));
    flap.position.z = -0.012;
    const pin = new THREE.Mesh(new THREE.SphereGeometry(0.018, 14, 10), new THREE.MeshStandardMaterial({ color: P.gold, metalness: 0.6, roughness: 0.25 }));
    pin.position.set(0, 0.02, 0.025);
    this.pointer.add(flap, pin);
    this.group.add(this.pointer);

    // light bulbs round the rim
    this.bulbs = new THREE.InstancedMesh(new THREE.SphereGeometry(0.016, 10, 8), new THREE.MeshBasicMaterial({ toneMapped: false }), BULBS);
    const m = new THREE.Matrix4();
    for (let i = 0; i < BULBS; i++) {
      const a = (i / BULBS) * Math.PI * 2;
      m.makeTranslation(Math.cos(a) * (R + 0.03), Math.sin(a) * (R + 0.03), 0.04);
      this.bulbs.setMatrixAt(i, m);
      this.bulbs.setColorAt(i, new THREE.Color('#ffffff'));
    }
    this.group.add(this.bulbs);
    this.bulbColor = new THREE.Color();

    // stand: a white post to the floor with a pink base
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, position.y - 0.05, 16), new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.5 }));
    post.position.set(0, -(position.y - 0.05) / 2, -0.06);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.26, 0.05, 32), new THREE.MeshStandardMaterial({ color: P.pinkDeep, roughness: 0.5 }));
    base.position.set(0, -position.y + 0.025, -0.06);
    this.group.add(post, base);

    // banner over the wheel
    this.banner = makePanel(0.9, 0.17, (c, W, H) => {
      // ribbon ends
      c.fillStyle = P.mintDark;
      for (const s of [0, 1]) {
        const x = s ? W - W * 0.1 : 0;
        c.beginPath();
        c.moveTo(x + (s ? 0 : W * 0.1), H * 0.25);
        c.lineTo(x + (s ? W * 0.1 : 0), H * 0.25);
        c.lineTo(x + (s ? W * 0.07 : W * 0.03), H * 0.55);
        c.lineTo(x + (s ? W * 0.1 : 0), H * 0.85);
        c.lineTo(x + (s ? 0 : W * 0.1), H * 0.85);
        c.fill();
      }
      roundRect(c, W * 0.07, H * 0.08, W * 0.86, H * 0.84, H * 0.3);
      c.fillStyle = P.mintDeep; c.fill();
      c.lineWidth = H * 0.06; c.strokeStyle = '#ffffff'; c.stroke();
      text(c, '★ RODA HADIAH FDC ★', W / 2, H * 0.66, { size: H * 0.42, weight: 900, color: '#ffffff', align: 'center' });
    });
    // the banner sits under the wheel, like a sign on the stand (the dental lamp hangs above)
    this.banner.mesh.position.set(0, -R - 0.13, 0.02);
    this.group.add(this.banner.mesh);

    // the result card, popped in front of the wheel
    this.resultText = '';
    this.result = makePanel(0.92, 0.36, (c, W, H) => {
      roundRect(c, 8, 8, W - 16, H - 16, H * 0.16);
      c.fillStyle = '#ffffff'; c.fill();
      c.lineWidth = 14; c.strokeStyle = P.gold; c.stroke();
      text(c, 'SELAMAT!', W / 2, H * 0.27, { size: H * 0.17, weight: 900, color: P.pinkDeep, align: 'center' });
      c.font = `900 ${Math.round(H * 0.15)}px system-ui`;
      const lines = wrap(c, this.resultText, W * 0.88).slice(0, 2);
      lines.forEach((l, i) => text(c, l, W / 2, H * (lines.length > 1 ? 0.5 + i * 0.16 : 0.56), { size: H * 0.15, weight: 900, color: P.ink, align: 'center' }));
      text(c, 'Tunjukkan ke petugas FDC untuk ambil hadiahmu', W / 2, H * 0.86, { size: H * 0.075, weight: 700, color: P.muted, align: 'center' });
    });
    this.result.mesh.position.set(0, -0.02, 0.16);
    this.result.mesh.visible = false;
    this.group.add(this.result.mesh);

    // pointing at the wheel and pulling the trigger spins it too
    app.addTarget(this.disc, { onSelect: () => this.start() });
  }

  /** Set the prize list: [{ text, weight }]. */
  setPrizes(list) {
    this.prizes = list.filter((p) => p && p.text && (p.weight ?? 1) > 0);
    if (!this.prizes.length) this.prizes = [{ text: 'Hadiah', weight: 1 }];
    this.drawDisc();
    const n = this.prizes.length;
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0));
    this.pegs.count = n;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      m.compose(new THREE.Vector3(Math.cos(a) * (R - 0.02), Math.sin(a) * (R - 0.02), 0.02), q, new THREE.Vector3(1, 1, 1));
      this.pegs.setMatrixAt(i, m);
    }
    this.pegs.instanceMatrix.needsUpdate = true;
  }

  drawDisc() {
    const S = 1024;
    const cv = this.discTex.image;
    cv.width = cv.height = S;
    const c = cv.getContext('2d');
    const n = this.prizes.length;
    const seg = (Math.PI * 2) / n;
    c.clearRect(0, 0, S, S);
    c.save();
    c.translate(S / 2, S / 2);
    for (let i = 0; i < n; i++) {
      // world angle of slice i runs from i*seg to (i+1)*seg (counter-clockwise); the canvas is
      // flipped vertically on the way to the texture, so draw at negative angles
      const a0 = -i * seg;
      const a1 = -(i + 1) * seg;
      // (the last slice skips a colour if it would match the first one)
      let col = SLICE_COLORS[i % SLICE_COLORS.length];
      if (i === n - 1 && i > 0 && col === SLICE_COLORS[0]) col = SLICE_COLORS[2];
      c.beginPath();
      c.moveTo(0, 0);
      c.arc(0, 0, S / 2, a0, a1, true);
      c.closePath();
      c.fillStyle = col;
      c.fill();
      c.lineWidth = 6;
      c.strokeStyle = 'rgba(255,255,255,0.9)';
      c.stroke();
      // prize text along the slice, rim to hub (the wheel turns, so every slice is the same way)
      c.save();
      c.rotate(-(i + 0.5) * seg);
      const ink = INK_ON[col] || P.ink;
      const words = this.prizes[i].text;
      let size = n > 10 ? 34 : n > 7 ? 40 : 46;
      c.font = `900 ${size}px system-ui`;
      const maxW = S * 0.33;
      let lines = wrap(c, words, maxW).slice(0, 2);
      if (lines.length > 1) { size *= 0.85; c.font = `900 ${size}px system-ui`; lines = wrap(c, words, maxW).slice(0, 2); }
      c.textAlign = 'right';
      c.textBaseline = 'middle';
      c.fillStyle = ink;
      lines.forEach((l, k) => {
        const off = lines.length > 1 ? (k - 0.5) * size * 1.05 : 0;
        c.fillText(l, S * 0.455, off, maxW);
      });
      c.restore();
    }
    // centre ring
    c.beginPath();
    c.arc(0, 0, S * 0.19, 0, Math.PI * 2);
    c.fillStyle = 'rgba(255,255,255,0.35)';
    c.fill();
    c.restore();
    this.discTex.needsUpdate = true;
  }

  open() {
    this.group.visible = true;
    this.show = 0;
    this.spin = null;
    this.win = 0;
    this.result.mesh.visible = false;
    this.done = false;
    this.spun = false;
    this.rot = Math.random() * Math.PI * 2;
  }

  close() {
    this.group.visible = false;
    this.spin = null;
  }

  get spinning() { return !!this.spin; }

  /** Spin! Picks the prize now and aims the wheel at it. Returns false if it can't spin. */
  start() {
    if (!this.group.visible || this.spin || this.spun) return false;
    const total = this.prizes.reduce((a, p) => a + (p.weight ?? 1), 0);
    let r = Math.random() * total;
    let idx = 0;
    for (; idx < this.prizes.length - 1; idx++) { r -= this.prizes[idx].weight ?? 1; if (r <= 0) break; }
    const n = this.prizes.length;
    const seg = (Math.PI * 2) / n;
    // stop with the pointer (world angle π/2) somewhere in the middle part of the slice
    const jitter = (Math.random() - 0.5) * 0.6;
    let to = Math.PI / 2 - (idx + 0.5 + jitter) * seg;
    const turns = 5 + Math.floor(Math.random() * 2);
    while (to > this.rot - turns * Math.PI * 2) to -= Math.PI * 2;
    this.spin = { from: this.rot, to, t: 0, idx };
    this.spun = true;
    this.sfx.play('whoosh');
    return true;
  }

  sliceAt(rot) {
    const n = this.prizes.length;
    const seg = (Math.PI * 2) / n;
    return Math.floor((Math.PI / 2 - rot) / seg);
  }

  update(dt) {
    if (!this.group.visible) return;
    this.time += dt;
    const t = this.time;
    // pop in
    this.show = Math.min(1, this.show + dt * 2.2);
    this.group.scale.setScalar(Math.max(0.001, easeOutBack(this.show)));
    this.burst.rotation.z -= dt * (this.spin ? 0.9 : 0.2);

    if (this.spin) {
      const sp = this.spin;
      sp.t = Math.min(1, sp.t + dt / SPIN_TIME);
      const e = 1 - Math.pow(1 - sp.t, 4); // ease-out quart
      this.rot = sp.from + (sp.to - sp.from) * e;
      const slice = this.sliceAt(this.rot);
      if (slice !== this.lastSlice) {
        this.lastSlice = slice;
        this.flap = 1;
        this.sfx.play('tick');
      }
      if (sp.t >= 1) {
        this.spin = null;
        this.win = 1;
        const prize = this.prizes[sp.idx];
        this.resultText = prize.text;
        this.result.redraw();
        this.result.mesh.visible = true;
        this.result.mesh.scale.setScalar(0.01);
        this.sfx.play('fanfare');
        this.sfx.play('clap');
        const at = new THREE.Vector3();
        this.group.getWorldPosition(at);
        this.fx.emit('confetti', at.clone().add(new THREE.Vector3(0, 0.75, 0.2)), 70, { speed: 1.1, size: 0.04, life: 2.6, gravity: 0.8, up: 0.5, spread: 0.6 });
        this.fx.emit('star', at.clone().add(new THREE.Vector3(0, 0, 0.2)), 18, { speed: 0.9, size: 0.05, life: 1.2, spread: 0.2 });
        this.onResult?.(prize);
      }
    } else {
      this.lastSlice = this.sliceAt(this.rot);
      // idle: a gentle sway so it looks alive before the spin
      if (!this.spun) this.rot += dt * 0.15;
    }
    this.spinner.rotation.z = this.rot;
    // pointer flap kicks back on every peg
    this.flap = Math.max(0, this.flap - dt * 7);
    this.pointer.rotation.z = this.flap * 0.45;

    // result card pop
    if (this.result.mesh.visible) {
      const k = this.result.mesh.scale.x;
      this.result.mesh.scale.setScalar(Math.min(1, k + (1.08 - k) * Math.min(1, dt * 9)));
      this.result.mesh.position.y = -0.02 + Math.sin(t * 2.4) * 0.01;
    }
    // more confetti every so often after a win
    if (this.win > 0) {
      this.win += dt;
      if (Math.floor(this.win * 1.3) !== Math.floor((this.win - dt) * 1.3) && this.win < 6) {
        const at = new THREE.Vector3();
        this.group.getWorldPosition(at);
        this.fx.emit('confetti', at.clone().add(new THREE.Vector3((Math.random() - 0.5) * 1.2, 0.9, 0.3)), 25, { speed: 0.5, size: 0.035, life: 2.4, gravity: 0.7, spread: 0.5 });
      }
    }

    // bulbs: slow twinkle when idle, a fast chase while spinning, all flashing on a win
    const colA = new THREE.Color('#fff6c8');
    const colB = new THREE.Color(P.pinkDeep);
    const dim = new THREE.Color('#d6c9a2');
    for (let i = 0; i < BULBS; i++) {
      let on;
      if (this.spin) on = ((i + Math.floor(t * 14)) % 4) < 2;
      else if (this.win > 0) on = Math.floor(t * 6) % 2 === i % 2;
      else on = ((i + Math.floor(t * 3)) % 3) === 0 ? false : true;
      this.bulbColor.copy(on ? (i % 2 ? colA : colB) : dim);
      this.bulbs.setColorAt(i, this.bulbColor);
    }
    this.bulbs.instanceColor.needsUpdate = true;
  }
}

function easeOutBack(x) {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
}

function sunburstTexture() {
  const S = 512;
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const c = cv.getContext('2d');
  c.translate(S / 2, S / 2);
  const rays = 24;
  for (let i = 0; i < rays; i++) {
    const a0 = (i / rays) * Math.PI * 2;
    const a1 = ((i + 0.5) / rays) * Math.PI * 2;
    c.beginPath();
    c.moveTo(0, 0);
    c.arc(0, 0, S / 2, a0, a1);
    c.closePath();
    c.fillStyle = i % 2 ? 'rgba(247,201,94,0.55)' : 'rgba(246,185,201,0.6)';
    c.fill();
  }
  // fade the edge out
  const g = c.createRadialGradient(0, 0, S * 0.2, 0, 0, S / 2);
  g.addColorStop(0, 'rgba(255,255,255,0)');
  g.addColorStop(0.75, 'rgba(255,255,255,0)');
  g.addColorStop(1, 'rgba(255,255,255,1)');
  c.globalCompositeOperation = 'destination-out';
  c.fillStyle = g;
  c.fillRect(-S / 2, -S / 2, S, S);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function hubTexture() {
  const S = 256;
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const c = cv.getContext('2d');
  c.fillStyle = '#ffffff';
  c.beginPath(); c.arc(S / 2, S / 2, S / 2, 0, Math.PI * 2); c.fill();
  c.lineWidth = 14; c.strokeStyle = P.pinkDeep;
  c.beginPath(); c.arc(S / 2, S / 2, S / 2 - 10, 0, Math.PI * 2); c.stroke();
  c.fillStyle = P.mintDeep;
  c.font = '900 88px system-ui';
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.fillText('fdc', S / 2, S * 0.47);
  c.fillStyle = P.pinkDeep;
  c.font = '800 34px system-ui';
  c.fillText('PUTAR!', S / 2, S * 0.74);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
