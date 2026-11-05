import * as THREE from 'three';

/**
 * What the patient's teeth look like for each treatment, and how they change while you work.
 * Everything is attached to the patient's open mouth, so it moves with their head.
 */
const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.6, ...o });
const BALL = new THREE.SphereGeometry(1, 14, 10);
const _w = new THREE.Vector3();

export class MouthWork {
  constructor(patient, caseId, fx, sfx) {
    this.p = patient;
    this.caseId = caseId;
    this.fx = fx;
    this.sfx = sfx;
    this.added = [];
    this.t = 0;
    this.highlight = 0;
    this.found = []; // things that glow after the mirror check
    this.toothMat = patient.toothMat;
    this[`setup_${caseId}`]();
  }

  add(parent, mesh) { parent.add(mesh); this.added.push(mesh); return mesh; }

  // ------------------------------------------------------------------ scaling
  setup_scaling() {
    this.toothMat.color.set('#f3e6c4'); // yellowish before cleaning
    this.tartar = [];
    const mat = std('#d4ae55', { roughness: 0.95 });
    const spots = [...this.p.teeth.lower.map((t) => [t, -1]), ...this.p.teeth.upper.slice(1, 5).map((t) => [t, 1])];
    for (const [tooth, side] of spots) {
      const b = this.add(tooth, new THREE.Mesh(BALL, mat.clone()));
      b.scale.set(0.012 + Math.random() * 0.004, 0.008, 0.007);
      b.position.set((Math.random() - 0.5) * 0.008, side * 0.012, 0.006);
      b.userData.base = b.scale.clone();
      this.tartar.push(b);
      this.found.push(b);
    }
    this.water = [];
    const wm = std('#a9dcf5', { roughness: 0.05, transparent: true, opacity: 0.85 });
    for (let i = 0; i < 6; i++) {
      const d = this.add(this.p.open, new THREE.Mesh(BALL, wm));
      d.userData.base = 0.007 + Math.random() * 0.005;
      d.userData.x = (Math.random() - 0.5) * 0.08;
      d.visible = false;
      this.water.push(d);
    }
  }

  // ------------------------------------------------------------------ extraction
  setup_extraction() {
    this.toothMat.color.set('#fffdf6');
    const row = this.p.teeth.lower;
    this.bad = row[4];
    this.badMat = std('#b6a084', { roughness: 0.7 });
    this.bad.userData.mesh.material = this.badMat;
    this.found.push(this.bad.userData.mesh);
    this.wobble = 0.4;
    // the gap that is left behind (placeholder in the row)
    this.gap = new THREE.Group();
    this.gap.userData = {};
    this.p.open.add(this.gap);
    this.added.push(this.gap);
    this.blood = new THREE.Mesh(BALL, std('#d64553', { roughness: 0.4 }));
    this.blood.scale.set(0.011, 0.006, 0.004);
    this.blood.visible = false;
    this.gap.add(this.blood);
    this.gauze = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.016, 0.014), std('#ffffff', { roughness: 1 }));
    this.gauze.visible = false;
    this.gap.add(this.gauze);
  }

  // ------------------------------------------------------------------ filling
  setup_filling() {
    this.toothMat.color.set('#fffdf6');
    this.hole = this.p.teeth.upper[2];
    this.holeTooth = this.hole.userData.mesh;
    this.holeTooth.material = this.toothMat.clone();
    this.holeMat = std('#3b2a24', { roughness: 0.9 });
    this.spot = this.add(this.hole, new THREE.Mesh(BALL, this.holeMat));
    this.spot.scale.set(0.0065, 0.0075, 0.003);
    this.spot.position.set(0.001, -0.003, 0.0062);
    this.found.push(this.spot);
    this.putty = this.add(this.hole, new THREE.Mesh(BALL, std('#fff3dc', { roughness: 0.7 })));
    this.putty.position.copy(this.spot.position).add(new THREE.Vector3(0, 0, 0.0008));
    this.putty.scale.setScalar(0.0001);
  }

  /** Called every frame while the right tool works; k goes 0 → 1 for the current step. */
  progress(stepTool, k, dt) {
    const p = this.p;
    if (stepTool === 'mirror') {
      this.highlight = Math.max(this.highlight, k);
      if (Math.random() < dt * 8) this.sparkleAt(p.mouthWorld(_w), 'glow', 1, 0.02);
    }
    if (stepTool === 'scaler') {
      const n = this.tartar.length;
      this.tartar.forEach((b, i) => {
        const own = THREE.MathUtils.clamp(k * n - i, 0, 1);
        b.scale.copy(b.userData.base).multiplyScalar(1 - own);
        if (own > 0 && own < 1 && Math.random() < dt * 14) this.sparkleAt(b.getWorldPosition(_w), 'bit', 1, 0.006, 0.012);
        b.visible = own < 1;
      });
      this.toothMat.color.lerpColors(_yellow, _white, k);
    }
    if (stepTool === 'suction') {
      this.water.forEach((d, i) => {
        const own = THREE.MathUtils.clamp(k * this.water.length - i, 0, 1);
        d.scale.setScalar(d.userData.base * (1 - own));
        d.visible = own < 1;
      });
    }
    if (stepTool === 'syringe') this.wobble = 0.4 + k * 0.4;
    if (stepTool === 'forceps') {
      this.pull = k;
      if (Math.random() < dt * 6) this.sfx.play('tick');
    }
    if (stepTool === 'gauze') {
      this.gauze.visible = true;
      this.gauze.scale.setScalar(Math.min(1, k * 1.5));
      this.blood.scale.set(0.011 * (1 - k), 0.006 * (1 - k), 0.004);
    }
    if (stepTool === 'drill') {
      this.holeMat.color.lerpColors(_dark, _clean, k);
      this.spot.scale.set(0.0065 + k * 0.002, 0.0075 + k * 0.002, 0.003);
      if (Math.random() < dt * 20) this.sparkleAt(this.spot.getWorldPosition(_w), 'puff', 1, 0.008, 0.012);
    }
    if (stepTool === 'filling') this.putty.scale.set(0.0082 * k + 0.0001, 0.0092 * k + 0.0001, 0.003 * k + 0.0001);
    if (stepTool === 'light') {
      const m = this.holeTooth.material;
      m.emissive.set('#4aa8ff');
      m.emissiveIntensity = 0.4 + Math.sin(this.t * 30) * 0.3;
      if (Math.random() < dt * 10) this.sparkleAt(this.hole.getWorldPosition(_w), 'glow', 1, 0.01, 0.02);
    }
  }

  /** The step is finished: snap to the end state, add any new problem, celebrate a little. */
  done(stepTool, tool) {
    const p = this.p;
    p.mouthWorld(_w);
    if (stepTool === 'mirror') this.highlight = 1;
    if (stepTool === 'scaler') {
      for (const b of this.tartar) b.visible = false;
      this.toothMat.color.copy(_white);
      for (const d of this.water) { d.visible = true; d.scale.setScalar(d.userData.base); }
      this.sfx.loop('water', true);
      setTimeout(() => this.sfx.loop('water', false), 700);
    }
    if (stepTool === 'suction') for (const d of this.water) d.visible = false;
    if (stepTool === 'syringe') { this.numb = true; }
    if (stepTool === 'forceps') {
      // the tooth comes out with the forceps
      const row = p.teeth.lower;
      const i = row.indexOf(this.bad);
      this.gap.position.copy(this.bad.position);
      row[i] = this.gap;
      this.bad.userData.out = true;
      tool.tip.attach(this.bad);
      this.bad.position.set(0, 0, 0);
      this.bad.rotation.set(0, 0, 0);
      this.blood.visible = true;
      this.pulled = this.bad;
      this.pulledTool = tool;
      this.sfx.play('pop');
      this.sparkleAt(_w, 'star', 6, 0.02, 0.05);
    }
    if (stepTool === 'gauze') this.blood.visible = false;
    if (stepTool === 'filling') this.putty.scale.set(0.0082, 0.0092, 0.003);
    if (stepTool === 'light') {
      const m = this.holeTooth.material;
      m.emissiveIntensity = 0;
      this.putty.material.color.copy(this.toothMat.color);
      this.spot.visible = false;
      this.sparkleAt(this.hole.getWorldPosition(_w), 'star', 8, 0.02, 0.05);
    }
  }

  /** Remove the pulled tooth from the forceps once it goes back to the tray. */
  releasePulled() {
    if (!this.pulled) return;
    this.pulled.getWorldPosition(_w);
    this.sparkleAt(_w, 'star', 5, 0.02, 0.04);
    this.pulled.removeFromParent();
    this.pulled = null;
  }

  sparkleAt(pos, kind, n, spread = 0.02, size = 0.03) {
    this.fx.emit(kind, pos, n, { speed: 0.15, size, life: 0.6, spread, up: kind === 'puff' ? 0.05 : 0.08, gravity: kind === 'bit' ? 0.4 : 0 });
  }

  update(dt) {
    this.t += dt;
    // after the mirror check, the problems glow so you can see them
    if (this.highlight > 0) {
      const glow = (Math.sin(this.t * 7) * 0.5 + 0.5) * 0.6;
      for (const f of this.found) {
        const m = f.material;
        if (!m.emissive || !f.visible) continue;
        m.emissive.set('#ff6b8b');
        m.emissiveIntensity = glow * this.highlight;
      }
    }
    if (this.caseId === 'extraction' && this.bad && !this.bad.userData.out) {
      this.bad.rotation.z = Math.sin(this.t * 9) * 0.12 * this.wobble;
      if (this.pull) this.bad.position.z = 0.016 + this.pull * 0.012 + Math.sin(this.t * 40) * 0.0015 * this.pull;
    }
    for (const d of this.water || []) {
      if (!d.visible) continue;
      const H = this.p.cavity.scale.y;
      d.position.set(d.userData.x * this.p.cavity.scale.x / 0.078, -H * 0.55 + Math.sin(this.t * 5 + d.userData.x * 50) * 0.002, 0.018);
    }
  }

  stopHighlight() {
    this.highlight = 0;
    for (const f of this.found) if (f.material.emissive) f.material.emissiveIntensity = 0;
  }

  dispose() {
    this.releasePulled();
    for (const m of this.added) m.removeFromParent();
    if (this.bad) this.bad.userData.mesh.material = this.toothMat;
    this.toothMat.color.copy(_white);
  }
}

const _yellow = new THREE.Color('#f3e6c4');
const _white = new THREE.Color('#fffdf6');
const _dark = new THREE.Color('#3b2a24');
const _clean = new THREE.Color('#e6c9bd');
