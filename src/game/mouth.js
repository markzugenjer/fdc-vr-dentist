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

  // ------------------------------------------------------------------ whitening / kids check-up
  // Both paint a gel on the teeth tooth by tooth (whitening gel, or strawberry fluoride for kids).
  coatTeeth(color) {
    const mat = std(color, { transparent: true, opacity: 0.75, roughness: 0.1, emissive: color, emissiveIntensity: 0.15 });
    this.coatMat = mat;
    this.coats = [...this.p.teeth.upper, ...this.p.teeth.lower].map((t) => {
      const c = this.add(t, new THREE.Mesh(BALL, mat));
      c.scale.setScalar(0.0001);
      c.position.set(0, 0, 0.004);
      c.userData.tooth = t;
      return c;
    });
  }

  setup_whitening() {
    this.toothMat.color.set('#e2c98c'); // coffee and tea stains
    this.coatTeeth('#bfe8ff');
    this.found.push(this.p.teeth.upper[0].userData.mesh);
  }

  setup_checkup() {
    this.toothMat.color.set('#fffdf6');
    this.coatTeeth('#ffb3c7');
  }

  // ------------------------------------------------------------------ braces
  setup_braces() {
    this.toothMat.color.set('#fffdf6');
    const metal = std('#dfe7ec', { metalness: 0.85, roughness: 0.25 });
    this.bracketMat = metal;
    this.brackets = this.p.teeth.upper.map((t) => {
      const b = this.add(t, new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.008, 0.004), metal));
      b.position.set(0, -0.002, 0.008);
      b.visible = false;
      b.userData.tooth = t;
      return b;
    });
    // the arch wire runs across the brackets; it grows from left to right
    this.wire = this.add(this.p.open, new THREE.Mesh(new THREE.CylinderGeometry(0.0012, 0.0012, 1, 6), metal));
    this.wire.rotation.z = Math.PI / 2;
    this.wire.visible = false;
    this.wireK = 0;
    // colourful elastics on each bracket, shown when the wire is in
    this.elastics = this.brackets.map((b, i) => {
      const e = this.add(b, new THREE.Mesh(new THREE.TorusGeometry(0.004, 0.0011, 6, 10), std(['#f6b9c9', '#9ed9c2', '#a8d8f0'][i % 3])));
      e.position.z = 0.0015;
      e.visible = false;
      return e;
    });
  }

  // ------------------------------------------------------------------ root canal
  setup_rootcanal() {
    this.toothMat.color.set('#fffdf6');
    this.hole = this.p.teeth.upper[3];
    this.holeTooth = this.hole.userData.mesh;
    this.holeTooth.material = this.toothMat.clone();
    this.holeMat = std('#5a2f2a', { roughness: 0.9 });
    this.spot = this.add(this.hole, new THREE.Mesh(BALL, this.holeMat));
    this.spot.scale.set(0.0001, 0.0001, 0.003);
    this.spot.position.set(0, -0.002, 0.0062);
    this.found.push(this.holeTooth);
    this.putty = this.add(this.hole, new THREE.Mesh(BALL, std('#fff3dc', { roughness: 0.7 })));
    this.putty.position.copy(this.spot.position).add(new THREE.Vector3(0, 0, 0.0008));
    this.putty.scale.setScalar(0.0001);
    this.sick = std('#ff8a8a', { transparent: true, opacity: 0.6, emissive: '#ff4d4d', emissiveIntensity: 0.4 });
    this.nerve = this.add(this.hole, new THREE.Mesh(new THREE.CylinderGeometry(0.0016, 0.0008, 0.02, 6), this.sick));
    this.nerve.position.set(0, 0.006, 0.0066);
    this.nerve.visible = false;
  }

  /**
   * Where the tool has to touch for the current step in VR (null = anywhere in the mouth).
   * Tooth-by-tooth steps move the target along as you go.
   */
  target(stepTool, k) {
    const nextOf = (list, vis) => list.find((x) => vis(x)) || null;
    if (this.caseId === 'scaling' && stepTool === 'scaler') return nextOf(this.tartar, (b) => b.visible && b.scale.x > 0.002);
    if (this.caseId === 'extraction') {
      if (stepTool === 'syringe' || stepTool === 'forceps') return this.bad.userData.out ? null : this.bad;
      if (stepTool === 'gauze') return this.gap;
    }
    if ((this.caseId === 'filling' || this.caseId === 'rootcanal') && ['drill', 'filling', 'light', 'file', 'syringe'].includes(stepTool)) return this.hole;
    if (this.coats && stepTool === 'gel') return this.coats[Math.min(this.coats.length - 1, Math.floor(k * this.coats.length))].userData.tooth;
    if (this.caseId === 'braces' && stepTool === 'bracket') return this.brackets[Math.min(5, Math.floor(k * 6))].userData.tooth;
    return null;
  }

  /** Called every frame while the right tool works; k goes 0 → 1 for the current step. */
  progress(stepTool, k, dt) {
    const p = this.p;
    if (stepTool === 'mirror') {
      this.highlight = Math.max(this.highlight, k);
      if (Math.random() < dt * 8) this.sparkleAt(p.mouthWorld(_w), 'glow', 1, 0.02);
    }
    if (stepTool === 'scaler' && this.tartar) {
      const n = this.tartar.length;
      this.tartar.forEach((b, i) => {
        const own = THREE.MathUtils.clamp(k * n - i, 0, 1);
        b.scale.copy(b.userData.base).multiplyScalar(1 - own);
        if (own > 0 && own < 1 && Math.random() < dt * 14) this.sparkleAt(b.getWorldPosition(_w), 'bit', 1, 0.006, 0.012);
        b.visible = own < 1;
      });
      this.toothMat.color.lerpColors(_yellow, _white, k);
    }
    if (stepTool === 'suction' && this.water) {
      this.water.forEach((d, i) => {
        const own = THREE.MathUtils.clamp(k * this.water.length - i, 0, 1);
        d.scale.setScalar(d.userData.base * (1 - own));
        d.visible = own < 1;
      });
    }
    if (stepTool === 'syringe') this.wobble = 0.4 + k * 0.4;
    if (stepTool === 'forceps' && this.bad) {
      this.pull = k;
      if (Math.random() < dt * 6) this.sfx.play('tick');
    }
    if (stepTool === 'gauze' && this.gauze) {
      this.gauze.visible = true;
      this.gauze.scale.setScalar(Math.min(1, k * 1.5));
      this.blood.scale.set(0.011 * (1 - k), 0.006 * (1 - k), 0.004);
    }
    if (stepTool === 'drill' && this.caseId === 'filling') {
      this.holeMat.color.lerpColors(_dark, _clean, k);
      this.spot.scale.set(0.0065 + k * 0.002, 0.0075 + k * 0.002, 0.003);
      if (Math.random() < dt * 20) this.sparkleAt(this.spot.getWorldPosition(_w), 'puff', 1, 0.008, 0.012);
    }
    if (stepTool === 'filling') this.putty.scale.set(0.0082 * k + 0.0001, 0.0092 * k + 0.0001, 0.003 * k + 0.0001);
    if (this.coats && stepTool === 'gel') {
      const n = this.coats.length;
      this.coats.forEach((c, i) => { const own = THREE.MathUtils.clamp(k * n - i, 0, 1); c.scale.set(0.012 * own + 0.0001, 0.014 * own + 0.0001, 0.006 * own + 0.0001); });
      if (Math.random() < dt * 6) this.sparkleAt(p.mouthWorld(_w), 'drop', 1, 0.03, 0.01);
    }
    if (this.coats && stepTool === 'light') {
      this.coatMat.emissiveIntensity = 0.3 + Math.sin(this.t * 30) * 0.25 + k * 0.4;
      if (Math.random() < dt * 10) this.sparkleAt(p.mouthWorld(_w), 'glow', 1, 0.04, 0.02);
      return;
    }
    if (this.coats && stepTool === 'suction') {
      const n = this.coats.length;
      this.coats.forEach((c, i) => { const own = THREE.MathUtils.clamp(k * n - i, 0, 1); if (own > 0) c.scale.multiplyScalar(1 - own * 0.3); c.visible = own < 1; });
      if (this.caseId === 'whitening') this.toothMat.color.lerpColors(_stain, _bright, k);
    }
    if (this.caseId === 'checkup' && stepTool === 'mirror') {
      // count the teeth one by one
      const all = [...this.p.teeth.upper, ...this.p.teeth.lower];
      const i = Math.floor(k * all.length);
      if (i !== this.counted && i < all.length) { this.counted = i; this.sparkleAt(all[i].getWorldPosition(_w), 'star', 2, 0.005, 0.015); this.sfx.play('tick'); this.onCount?.(i + 1); }
    }
    if (this.brackets && stepTool === 'bracket') {
      this.brackets.forEach((b, i) => { const own = THREE.MathUtils.clamp(k * 6 - i, 0, 1); if (own > 0 && !b.visible) { b.visible = true; this.sfx.play('tick'); this.sparkleAt(b.getWorldPosition(_w), 'glow', 2, 0.004, 0.012); } b.scale.setScalar(Math.max(0.01, own)); });
    }
    if (this.brackets && stepTool === 'light') {
      this.bracketMat.emissive.set('#4aa8ff');
      this.bracketMat.emissiveIntensity = 0.3 + Math.sin(this.t * 30) * 0.3;
      if (Math.random() < dt * 8) this.sparkleAt(p.mouthWorld(_w), 'glow', 1, 0.04, 0.02);
      return;
    }
    if (this.brackets && stepTool === 'wire') { this.wire.visible = true; this.wireK = k; }
    if (this.caseId === 'rootcanal') {
      if (stepTool === 'syringe') this.numb = true;
      if (stepTool === 'drill') {
        this.spot.scale.set(0.007 * k + 0.0001, 0.008 * k + 0.0001, 0.003);
        this.nerve.visible = k > 0.6;
        if (Math.random() < dt * 20) this.sparkleAt(this.hole.getWorldPosition(_w), 'puff', 1, 0.008, 0.012);
      }
      if (stepTool === 'file') {
        this.sick.color.lerpColors(_sickC, _cleanC, k);
        this.sick.emissiveIntensity = 0.4 * (1 - k);
        this.nerve.scale.y = 1 - k * 0.6;
      }
      if (stepTool === 'filling') this.putty.scale.set(0.0082 * k + 0.0001, 0.0092 * k + 0.0001, 0.003 * k + 0.0001);
      return;
    }
    if (stepTool === 'light' && this.holeTooth) {
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
    if (this.coats) {
      if (stepTool === 'gel') for (const c of this.coats) c.scale.set(0.012, 0.014, 0.006);
      if (stepTool === 'light') this.coatMat.emissiveIntensity = 0.15;
      if (stepTool === 'suction') {
        for (const c of this.coats) c.visible = false;
        if (this.caseId === 'whitening') { this.toothMat.color.copy(_bright); this.toothMat.emissive.set('#ffffff'); this.toothMat.emissiveIntensity = 0.25; this.sparkleAt(_w, 'star', 14, 0.05, 0.03); this.sfx.play('sparkle'); }
      }
      if (stepTool !== 'mirror') return;
    }
    if (this.brackets) {
      if (stepTool === 'bracket') for (const b of this.brackets) { b.visible = true; b.scale.setScalar(1); }
      if (stepTool === 'light') this.bracketMat.emissiveIntensity = 0;
      if (stepTool === 'wire') { this.wireK = 1; for (const e of this.elastics) e.visible = true; this.sparkleAt(_w, 'star', 10, 0.04, 0.03); this.sfx.play('sparkle'); }
      return;
    }
    if (this.caseId === 'rootcanal') {
      if (stepTool === 'file') { this.nerve.visible = false; this.spot.material.color.set('#e6c9bd'); }
      if (stepTool === 'filling') { this.putty.scale.set(0.0082, 0.0092, 0.003); this.putty.material.color.copy(this.toothMat.color); this.spot.visible = false; this.sparkleAt(this.hole.getWorldPosition(_w), 'star', 8, 0.02, 0.05); }
      return;
    }
    if (stepTool === 'mirror') this.highlight = 1;
    if (stepTool === 'scaler' && this.tartar) {
      for (const b of this.tartar) b.visible = false;
      this.toothMat.color.copy(_white);
      for (const d of this.water) { d.visible = true; d.scale.setScalar(d.userData.base); }
      this.sfx.loop('water', true);
      setTimeout(() => this.sfx.loop('water', false), 700);
    }
    if (stepTool === 'suction' && this.water) for (const d of this.water) d.visible = false;
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
    if (stepTool === 'gauze' && this.blood) this.blood.visible = false;
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
    if (this.wire && this.wire.visible) {
      const up = this.p.teeth.upper;
      const x0 = up[0].position.x;
      const x1 = up[5].position.x;
      const y = up.reduce((a, t) => a + t.position.y, 0) / up.length - 0.002;
      const len = (x1 - x0) * Math.max(0.02, this.wireK);
      this.wire.scale.set(1, len, 1);
      this.wire.position.set(x0 + len / 2, y, 0.025);
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
    if (this.holeTooth) this.holeTooth.material = this.toothMat;
    this.toothMat.color.copy(_white);
    this.toothMat.emissiveIntensity = 0;
  }
}

const _yellow = new THREE.Color('#f3e6c4');
const _white = new THREE.Color('#fffdf6');
const _dark = new THREE.Color('#3b2a24');
const _clean = new THREE.Color('#e6c9bd');
const _stain = new THREE.Color('#e2c98c');
const _bright = new THREE.Color('#ffffff');
const _sickC = new THREE.Color('#ff8a8a');
const _cleanC = new THREE.Color('#f3e2d6');
