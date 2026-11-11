import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { FONT, roundRect, wrap } from '../core/ui.js';

/**
 * Stylised people built from simple shapes, animated in code (no model files): close to real
 * body proportions with a slightly large head, expressive eyes and brows, and a mouth that opens
 * wide enough to treat. Everything is low-poly and shares geometry, so a room full stays smooth.
 *
 *   const c = new Character({ skin, hair, hairStyle, top, bottom });
 *   c.walkTo([p1, p2])          → Promise, walks along the points
 *   c.sitDown(seat)             → Promise
 *   c.standUp()                 → Promise
 *   c.face('pain')              neutral | happy | aaa | pain | mad | sad | numb | talk
 *   c.act('wave', 1.5)          wave | fist | facepalm | clap | cheer | thumbs | point | shrug | cover | phone | shiver | calm
 *                               scroll | stretch | tidy | mirror | give
 *   c.say('Halo Dokter!', 2.5)     speech bubble
 */

const geo = new Map();
const cached = (key, make) => { if (!geo.has(key)) geo.set(key, make()); return geo.get(key); };
const capsule = (r, l) => cached(`c${r}|${l}`, () => new THREE.CapsuleGeometry(r, l, 6, 14));
const ball = (seg = 18) => cached(`b${seg}`, () => new THREE.SphereGeometry(1, seg, Math.round(seg * 0.75)));
const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.7, ...o });
const ease = (k, dt) => 1 - Math.exp(-dt * k);
const lerp = (a, b, k) => a + (b - a) * k;

/** Body proportions: hips at 0.62 m, about 1.5 m tall at height 1 (adults use height ~1.1). */
export const HIP_Y = 0.62;
const HEAD_SCALE = 0.74;
export const SIT_ARM = { sx: -0.12, sy: -0.98, sz: 0.1, ex: -1.06 };

const FACES = {
  //        eye   brow  browY  sad   mouth     open  blush red  pupilY
  neutral: { eye: 1, brow: 0, browY: 0, sad: 0, mouth: 'smile', open: 0, blush: 0.4, red: 0, py: 0 },
  happy: { eye: 0.35, brow: -0.15, browY: 0.012, sad: 0, mouth: 'grin', open: 0.34, blush: 1, red: 0, py: 0 },
  smiley: { eye: 0.8, brow: -0.1, browY: 0.008, sad: 0, mouth: 'smile', open: 0, blush: 0.8, red: 0, py: 0 },
  talk: { eye: 1, brow: -0.05, browY: 0.006, sad: 0, mouth: 'talk', open: 0.3, blush: 0.5, red: 0, py: 0 },
  aaa: { eye: 1, brow: -0.1, browY: 0.012, sad: 0.2, mouth: 'open', open: 1, blush: 0.4, red: 0, py: 0.004 },
  pain: { eye: 0, brow: 0, browY: 0.01, sad: 1, mouth: 'open', open: 1.15, blush: 0.6, red: 0.35, py: 0, x: true },
  mad: { eye: 0.7, brow: 0.55, browY: -0.012, sad: 0, mouth: 'frown', open: 0, blush: 0, red: 1, py: 0 },
  sad: { eye: 0.65, brow: 0, browY: 0.004, sad: 1, mouth: 'frown', open: 0, blush: 0.2, red: 0, py: -0.012 },
  numb: { eye: 0.55, brow: -0.1, browY: 0.008, sad: 0.3, mouth: 'open', open: 0.55, blush: 0.4, red: 0, py: -0.004 },
  scared: { eye: 1.25, brow: 0, browY: 0.016, sad: 0.8, mouth: 'open', open: 0.45, blush: 0.2, red: 0, py: 0 },
  sleep: { eye: 0.06, brow: -0.1, browY: 0, sad: 0, mouth: 'open', open: 0.35, blush: 0.6, red: 0, py: 0 },
  sneeze: { eye: 0.1, brow: 0.3, browY: 0.014, sad: 0.4, mouth: 'open', open: 0.8, blush: 0.9, red: 0.3, py: 0 },
  yawn: { eye: 0.1, brow: -0.2, browY: 0.004, sad: 0.2, mouth: 'open', open: 1.0, blush: 0.4, red: 0, py: 0 },
  wow: { eye: 1.3, brow: -0.25, browY: 0.018, sad: 0, mouth: 'open', open: 0.7, blush: 1, red: 0, py: 0 },
};

export class Character {
  constructor(opts = {}) {
    const o = (this.opts = {
      skin: '#f3c9a6', hair: '#3b2a22', hairStyle: 'short', top: '#9ed9c2', bottom: '#5d6b8c', shoes: '#ffffff',
      eyes: '#3a2a24', cap: false, height: 1, ...opts,
    });
    this.root = new THREE.Group();
    this.body = new THREE.Group();
    this.root.add(this.body);
    this.root.scale.setScalar(o.height);

    this.skinMat = std(o.skin, { roughness: 0.8 });
    this.skinBase = new THREE.Color(o.skin);
    const topMat = std(o.top);
    const botMat = std(o.bottom);
    this.topMat = topMat; // kept so a uniform can be recoloured
    this.botMat = botMat;
    const shoeMat = std(o.shoes, { roughness: 0.5 });
    const hairMat = std(o.hair, { roughness: 0.85 });
    const dark = std('#2b2120', { roughness: 0.4 });
    const white = std('#ffffff', { roughness: 0.3 });

    // --- hips and legs (thigh + shin, so sitting and walking bend at the knee)
    this.hips = new THREE.Group();
    this.hips.position.y = HIP_Y;
    this.body.add(this.hips);
    const pelvis = new THREE.Mesh(ball(), botMat);
    pelvis.scale.set(0.15, 0.08, 0.12);
    this.hips.add(pelvis);
    this.legs = [-1, 1].map((s) => {
      const thigh = new THREE.Group();
      thigh.position.set(0.075 * s, 0, 0);
      this.hips.add(thigh);
      const tm = new THREE.Mesh(capsule(0.066, 0.2), botMat);
      tm.position.y = -0.14;
      thigh.add(tm);
      const shin = new THREE.Group();
      shin.position.y = -0.29;
      thigh.add(shin);
      const sm = new THREE.Mesh(capsule(0.05, 0.18), botMat);
      sm.position.y = -0.13;
      shin.add(sm);
      const shoe = new THREE.Mesh(ball(), shoeMat);
      shoe.scale.set(0.05, 0.04, 0.11);
      shoe.position.set(0, -0.27, 0.04);
      shin.add(shoe);
      return { thigh, shin };
    });

    // --- torso, arms
    this.torso = new THREE.Group();
    this.hips.add(this.torso);
    const chest = new THREE.Mesh(capsule(0.15, 0.26), topMat);
    chest.position.y = 0.24;
    chest.scale.set(1.08, 1, 0.72); // flatter front to back, like a real chest
    this.torso.add(chest);
    if (o.collar) {
      const collar = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.022, 8, 20), std(o.collar));
      collar.rotation.x = Math.PI / 2;
      collar.position.y = 0.52;
      this.torso.add(collar);
    }
    this.arms = [-1, 1].map((s) => {
      const shoulder = new THREE.Group();
      shoulder.position.set(0.185 * s, 0.46, 0);
      this.torso.add(shoulder);
      const up = new THREE.Mesh(capsule(0.046, 0.17), topMat);
      up.position.y = -0.12;
      shoulder.add(up);
      const elbow = new THREE.Group();
      elbow.position.y = -0.25;
      shoulder.add(elbow);
      const fore = new THREE.Mesh(capsule(0.038, 0.15), o.longSleeves ? topMat : this.skinMat);
      fore.position.y = -0.11;
      elbow.add(fore);
      const hand = new THREE.Mesh(ball(14), this.skinMat);
      hand.scale.set(0.04, 0.05, 0.025); // flatter, like a hand
      hand.position.y = -0.23;
      elbow.add(hand);
      return { shoulder, elbow, hand, side: s };
    });

    // --- head (on a neck pivot so it can turn and nod)
    this.neck = new THREE.Group();
    this.neck.position.y = 0.53;
    this.neck.rotation.order = 'YXZ';
    this.torso.add(this.neck);
    const neckMesh = new THREE.Mesh(capsule(0.045, 0.07), this.skinMat);
    neckMesh.position.y = 0.05;
    this.neck.add(neckMesh);
    this.head = new THREE.Group();
    this.head.position.y = 0.19;
    this.head.scale.setScalar(HEAD_SCALE); // the face is designed at cartoon size, then scaled down
    this.neck.add(this.head);
    const skull = new THREE.Mesh(ball(28), this.skinMat);
    skull.scale.set(0.215, 0.25, 0.23); // a bit taller than wide, like a real head
    this.head.add(skull);
    for (const s of [-1, 1]) {
      const ear = new THREE.Mesh(ball(12), this.skinMat);
      ear.scale.set(0.035, 0.05, 0.03);
      ear.position.set(0.235 * s, 0, -0.01);
      this.head.add(ear);
    }
    this.addHair(hairMat, o.hairStyle);
    if (o.cap) this.addNurseCap();
    if (o.shades) this.addShades();
    if (o.apron) this.addApron(o.apron);
    if (o.labCoat) this.addLabCoat(o.top, o.labCoat);
    if (o.glasses) this.addGlasses();
    if (o.earrings) this.addEarrings(o.earrings);
    if (o.stethoscope) this.addStethoscope();
    if (o.badge) this.addBadge(o.badge);

    // eyes: white, pupil, shine; an "X" version for pain
    this.eyes = [-1, 1].map((s) => {
      const g = new THREE.Group();
      g.position.set(0.084 * s, 0.0, 0.204);
      g.rotation.y = 0.34 * s;
      this.head.add(g);
      const w = new THREE.Mesh(ball(), white);
      w.scale.set(0.04, 0.046, 0.02);
      g.add(w);
      const pupil = new THREE.Group();
      g.add(pupil);
      const pm = new THREE.Mesh(ball(), std(o.eyes, { roughness: 0.3 }));
      pm.scale.set(0.03, 0.036, 0.012);
      pm.position.z = 0.012;
      pupil.add(pm);
      const shine = new THREE.Mesh(ball(8), white);
      shine.scale.setScalar(0.0105);
      shine.position.set(0.011, 0.014, 0.024);
      pupil.add(shine);
      const shine2 = new THREE.Mesh(ball(8), white);
      shine2.scale.setScalar(0.005);
      shine2.position.set(-0.009, -0.012, 0.024);
      pupil.add(shine2);
      const x = new THREE.Group();
      for (const r of [0.78, -0.78]) {
        const bar = new THREE.Mesh(capsule(0.007, 0.05), dark);
        bar.rotation.z = r;
        bar.position.z = 0.02;
        x.add(bar);
      }
      x.visible = false;
      g.add(x);
      if (o.lashes) {
        // upper lid line and a little flick at the outer corner
        const lid = new THREE.Mesh(cached('lidArc', () => new THREE.TorusGeometry(0.041, 0.0048, 4, 16, Math.PI * 0.86)), dark);
        lid.rotation.z = Math.PI * 0.07;
        lid.scale.set(1, 1.12, 1);
        lid.position.z = 0.008;
        g.add(lid);
        for (const [dx, dy, r, len] of [[0.036, 0.03, 0.75, 0.016], [0.026, 0.04, 0.35, 0.012]]) {
          const lash = new THREE.Mesh(capsule(0.003, len), dark);
          lash.position.set(dx * s, dy, 0.01);
          lash.rotation.z = -r * s;
          g.add(lash);
        }
      }
      return { g, w, pupil, x, side: s };
    });
    this.brows = [-1, 1].map((s) => {
      const b = new THREE.Mesh(capsule(0.008, 0.04), hairMat);
      b.rotation.z = Math.PI / 2;
      b.position.set(0.084 * s, 0.075, 0.2);
      this.head.add(b);
      return { b, side: s };
    });
    this.cheekMat = std('#f49aae', { transparent: true, opacity: 0.5, roughness: 1 });
    for (const s of [-1, 1]) {
      const ch = new THREE.Mesh(ball(12), this.cheekMat);
      ch.scale.set(0.034, 0.02, 0.01);
      ch.position.set(0.128 * s, -0.06, 0.18);
      ch.rotation.y = 0.6 * s;
      this.head.add(ch);
    }
    const nose = new THREE.Mesh(ball(12), this.skinMat);
    nose.scale.set(0.02, 0.017, 0.016);
    nose.position.set(0, -0.045, 0.222);
    this.head.add(nose);

    this.buildMouth();

    // soft round shadow on the floor
    const sh = new THREE.Mesh(
      cached('shadow', () => new THREE.CircleGeometry(0.28, 24)),
      new THREE.MeshBasicMaterial({ color: '#2e3b36', transparent: true, opacity: 0.16, depthWrite: false }),
    );
    sh.rotation.x = -Math.PI / 2;
    sh.position.y = 0.004;
    this.shadow = sh;
    this.root.add(sh);

    // speech bubble
    this.bubble = makeBubble();
    this.root.add(this.bubble.sprite);

    // animation state
    this.cur = { ...FACES.neutral };
    this.target = { ...FACES.neutral };
    this.faceName = 'neutral';
    this.action = null;
    this.actionT = 0;
    this.actionDur = 0;
    this.phase = 0;
    this.walkAmt = 0;
    this.sitAmt = 0;
    this.recline = 0;
    this.lean = 0;
    this.jump = 0;
    this.shake = 0;
    this.blinkT = 2 + Math.random() * 3;
    this.blink = 1;
    this.lookTarget = null;
    this.look = { yaw: 0, pitch: 0 };
    this.path = null;
    this.speed = 1.0;
    this.sad = false;
    this.talkT = 0;
    this.t = 0;
    this.joints = {}; // smoothed joint angles
  }

  addHair(mat, style) {
    const cap = new THREE.Mesh(
      cached('hairCap', () => new THREE.SphereGeometry(0.25, 28, 16, 0, Math.PI * 2, 0, Math.PI * 0.46)),
      mat,
    );
    cap.rotation.x = -0.2;
    cap.position.set(0, 0.012, -0.012);
    this.head.add(cap);
    if (style !== 'spiky' && style !== 'curly') {
      // soft fringe over the forehead, so the face reads friendly instead of bald and staring
      for (const [x, ry, sc] of [[-0.075, -0.45, 1], [0.075, 0.45, 1], [0, 0, 0.9]]) {
        const f = new THREE.Mesh(ball(16), mat);
        f.scale.set(0.1 * sc, 0.055, 0.06);
        f.position.set(x, 0.145, 0.165 - Math.abs(x) * 0.25);
        f.rotation.set(-0.55, ry, x * -3);
        this.head.add(f);
      }
    }
    if (style === 'long' || style === 'bob') {
      const back = new THREE.Mesh(ball(), mat);
      back.scale.set(0.25, style === 'long' ? 0.27 : 0.2, 0.17);
      back.position.set(0, style === 'long' ? -0.06 : -0.01, -0.09);
      this.head.add(back);
    }
    if (style === 'bun') {
      const bun = new THREE.Mesh(ball(), mat);
      bun.scale.setScalar(0.085);
      bun.position.set(0, 0.2, -0.13);
      this.head.add(bun);
    }
    if (style === 'spiky') {
      for (let i = 0; i < 7; i++) {
        const sp = new THREE.Mesh(cached('spike', () => new THREE.ConeGeometry(0.05, 0.12, 8)), mat);
        const a = -0.9 + (i / 6) * 1.8;
        sp.position.set(Math.sin(a) * 0.15, 0.22, -0.02 + Math.cos(a) * 0.05);
        sp.rotation.z = -a * 0.6;
        this.head.add(sp);
      }
    }
    if (style === 'curly') {
      for (let i = 0; i < 14; i++) {
        const c = new THREE.Mesh(ball(10), mat);
        c.scale.setScalar(0.06);
        const a = (i / 14) * Math.PI * 2;
        c.position.set(Math.cos(a) * 0.17, 0.17 + Math.sin(i * 1.7) * 0.03, Math.sin(a) * 0.15 - 0.03);
        this.head.add(c);
      }
    }
    if (style === 'pony') {
      const tail = new THREE.Mesh(capsule(0.05, 0.14), mat);
      tail.position.set(0, 0.02, -0.25);
      tail.rotation.x = 0.4;
      this.head.add(tail);
    }
  }

  addNurseCap() {
    const capMat = std('#ffffff', { roughness: 0.5 });
    const c = new THREE.Mesh(cached('nurseCap', () => new THREE.CylinderGeometry(0.11, 0.13, 0.08, 20)), capMat);
    c.position.set(0, 0.22, 0.02);
    c.rotation.x = -0.25;
    this.head.add(c);
    const cross = new THREE.Group();
    const cm = std('#f08aa5');
    for (const r of [0, Math.PI / 2]) {
      const bar = new THREE.Mesh(cached('crossBar', () => new THREE.BoxGeometry(0.05, 0.016, 0.004)), cm);
      bar.rotation.z = r;
      cross.add(bar);
    }
    cross.position.set(0, 0.235, 0.135);
    cross.rotation.x = -0.25;
    this.head.add(cross);
  }

  buildMouth() {
    const m = (this.mouth = new THREE.Group());
    m.position.set(0, -0.092, 0.212);
    m.rotation.x = 0.41;
    this.head.add(m);
    const lineMat = std(this.opts.lips || '#9a3b47', { roughness: 0.5 });
    this.smile = new THREE.Mesh(cached('smile', () => new THREE.TorusGeometry(0.042, 0.008, 6, 18, Math.PI)), lineMat);
    this.smile.rotation.z = Math.PI;
    this.smile.position.set(0, 0.022, 0.012);
    this.frown = new THREE.Mesh(this.smile.geometry, lineMat);
    this.frown.position.set(0, -0.03, 0.012);
    m.add(this.smile, this.frown);

    // the open mouth: dark inside, lips, tongue and two rows of six teeth
    this.open = new THREE.Group();
    m.add(this.open);
    this.cavity = new THREE.Mesh(cached('cavity', () => new THREE.CircleGeometry(1, 32)), std('#5a1c2a', { roughness: 0.9 }));
    this.cavity.position.z = 0.012;
    this.lips = new THREE.Mesh(cached('lips', () => new THREE.TorusGeometry(1, 0.07, 8, 36)), std('#d9707f', { roughness: 0.45 }));
    this.lips.position.z = 0.013;
    this.tongue = new THREE.Mesh(ball(16), std('#ec8796', { roughness: 0.6 }));
    this.tongue.position.z = 0.006; // behind the lower teeth
    this.open.add(this.cavity, this.lips, this.tongue);
    const toothGeo = cached('tooth', () => new THREE.CapsuleGeometry(0.5, 0.35, 4, 10));
    this.toothMat = std('#fffdf6', { roughness: 0.25 });
    this.teeth = { upper: [], lower: [] };
    for (const row of ['upper', 'lower']) {
      for (let i = 0; i < 6; i++) {
        const t = new THREE.Group(); // problem markers (tartar, cavity...) go inside this group
        const mesh = new THREE.Mesh(toothGeo, this.toothMat);
        mesh.scale.set(0.022, 0.024, 0.012);
        t.add(mesh);
        t.userData = { mesh, row, i };
        this.open.add(t);
        this.teeth[row].push(t);
      }
    }
    this.mouthW = 0.078;
    this.layoutMouth(0);
  }

  /** Place lips, inside and teeth for how wide the mouth is open (0 closed … 1.2 screaming). */
  layoutMouth(open, wide = 1, upperOnly = false, forceTeeth = false) {
    const W = this.mouthW * wide;
    const H = Math.max(0.004, 0.066 * open);
    this.cavity.scale.set(W, H, 1);
    this.lips.scale.set(W, H, 0.09); // flat ring (the torus is 1 m wide before scaling)
    this.tongue.scale.set(W * 0.62, H * 0.38, 0.012);
    this.tongue.position.y = -H * 0.5;
    const show = forceTeeth || open > 0.5; // teeth only when the mouth is open wide for treatment
    for (const row of ['upper', 'lower']) {
      const sign = row === 'upper' ? 1 : -1;
      this.teeth[row].forEach((t, i) => {
        if (t.userData.out) return; // pulled out: it now belongs to the forceps
        const u = (i - 2.5) / 2.5;
        const x = u * W * 0.74;
        const edge = H * Math.sqrt(Math.max(0, 1 - (x / W) ** 2));
        // Teeth shrink to fit inside the lips when the mouth is only a little open (talking,
        // grinning). Wide open for treatment they keep their full size.
        // The tip of each tooth stays just inside the lips (the lip ring is ~10% of the opening).
        const half = Math.min(0.0162, edge * 0.38); // half the tooth height (capsule is 1.35 tall)
        const width = Math.min(0.022, W * 0.296 * 0.95); // never wider than the gap between teeth
        t.userData.mesh?.scale.set(width, (half * 2) / 1.35, 0.012);
        t.position.set(x, sign * Math.max(half * 0.6, edge * 0.9 - half), 0.016);
        t.visible = show && !t.userData.gone && !(upperOnly && row === 'lower');
      });
    }
  }

  // ------------------------------------------------------------------ public API
  face(name) {
    if (!FACES[name]) return;
    this.faceName = name;
    Object.assign(this.target, FACES[name]);
    this.target.x = !!FACES[name].x;
  }

  act(name, dur = 1.5) {
    this.action = name;
    this.actionT = 0;
    this.actionDur = dur;
  }

  say(textStr, secs = 2.5, tone = 'normal') {
    this.onSay?.(textStr, tone); // the game plays a little voice
    this.bubble.show(textStr, tone);
    this.bubble.time = secs;
    this.talkT = Math.min(secs, 0.25 + textStr.length * 0.045);
  }

  lookAt(v) { this.lookTarget = v; }

  walkTo(points, { speed = 1.0, sad = false } = {}) {
    this.path = points.map((p) => new THREE.Vector3(p.x, 0, p.z));
    this.speed = speed;
    this.sad = sad;
    return new Promise((resolve) => { this.onArrive = resolve; });
  }

  /** Sit in the dental chair: `seat` = { x, y, z, yaw, recline } (y = top of the cushion). */
  sitDown(seat) {
    this.seat = seat;
    this.sitFrom = { x: this.root.position.x, z: this.root.position.z, yaw: this.root.rotation.y };
    this.sitT = 0;
    this.sitDir = 1;
    return new Promise((resolve) => { this.onSat = resolve; });
  }

  standUp(to) {
    // not sitting (still walking in, e.g. when Mode Event ends): nothing to stand up from
    if (!this.seat || (this.sitDir === 0 && this.sitAmt <= 0)) { this.sitDir = 0; this.onSat?.(); this.onSat = null; return Promise.resolve(); }
    this.standTo = to;
    this.sitT = 0;
    this.sitDir = -1;
    return new Promise((resolve) => { this.onSat = resolve; });
  }

  /** Where the open mouth is, in world space. */
  mouthWorld(v = new THREE.Vector3()) { return this.cavity.getWorldPosition(v); }
  headWorld(v = new THREE.Vector3()) { return this.head.getWorldPosition(v); }

  /** Hold a small object in the right hand (hand mirror, phone). */
  holdItem(obj) {
    this.dropItem();
    const hand = this.arms[1].hand;
    obj.position.set(0, -0.03, 0.02);
    hand.parent.add(obj);
    obj.position.add(hand.position);
    this.item = obj;
  }
  dropItem() { if (this.item) { this.item.removeFromParent(); this.item = null; } }

  /** VIP: cool sunglasses pushed up on the head. */
  addShades() {
    const g = new THREE.Group();
    const lens = std('#1f2a33', { metalness: 0.6, roughness: 0.15 });
    for (const s of [-1, 1]) {
      const l = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 8), lens);
      l.scale.set(0.05, 0.035, 0.012);
      l.position.set(0.06 * s, 0, 0);
      g.add(l);
    }
    const bridge = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.008, 0.008), std('#f2c14e', { metalness: 0.8, roughness: 0.3 }));
    g.add(bridge);
    g.position.set(0, 0.2, 0.15);
    g.rotation.x = -0.75;
    this.head.add(g);
  }

  /** A white medical apron: bib on the chest, a skirt to just below the knees, neck strap, waist ties and a pocket with a pen. */
  addApron(color) {
    const mat = std(color, { roughness: 0.7 });
    const bib = new THREE.Mesh(new RoundedBoxGeometry(0.21, 0.27, 0.012, 2, 0.006), mat);
    bib.position.set(0, 0.27, 0.112);
    this.torso.add(bib);
    // tapered skirt: narrow at the waist, wider at the knees, leaning out over the tummy and thighs
    const sh = new THREE.Shape();
    sh.moveTo(-0.13, 0);
    sh.lineTo(0.13, 0);
    sh.lineTo(0.17, -0.5);
    sh.quadraticCurveTo(0, -0.53, -0.17, -0.5);
    sh.lineTo(-0.13, 0);
    const skirt = new THREE.Mesh(new THREE.ExtrudeGeometry(sh, { depth: 0.01, bevelEnabled: true, bevelThickness: 0.003, bevelSize: 0.004, bevelSegments: 1 }), mat);
    skirt.position.set(0, 0.15, 0.115);
    skirt.rotation.x = -0.06;
    this.torso.add(skirt);
    for (const sx of [-1, 1]) {
      const tie = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.018, 0.2), mat);
      tie.position.set(0.155 * sx, 0.14, 0.01);
      tie.rotation.y = 0.15 * sx;
      this.torso.add(tie);
      const strap = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.16, 0.012), mat);
      strap.position.set(0.075 * sx, 0.45, 0.07);
      strap.rotation.set(-0.5, 0, -0.25 * sx);
      this.torso.add(strap);
    }
    const pocket = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.07, 0.006), std('#eef2f1', { roughness: 0.7 }));
    pocket.position.set(-0.06, 0.02, 0.135);
    this.torso.add(pocket);
    const pen = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.07, 6), std('#3d7fd6', { roughness: 0.4 }));
    pen.position.set(-0.085, 0.06, 0.135);
    this.torso.add(pen);
  }

  /**
   * A long white lab coat worn open: the chest and sleeves are the coat (top colour), the scrubs show
   * in the opening, with lapels, a chest pocket with a pen, an ID card, and a coat skirt to below the knee.
   */
  addLabCoat(coat, scrubs) {
    const coatMat = std(coat, { roughness: 0.75, side: THREE.DoubleSide });
    const scrubMat = std(scrubs, { roughness: 0.85 });
    // scrubs showing between the lapels (a V at the neck, then straight down)
    const v = new THREE.Shape();
    v.moveTo(-0.045, 0.49);
    v.lineTo(0, 0.4);
    v.lineTo(0.045, 0.49);
    v.lineTo(0.06, 0.49);
    v.lineTo(0.055, 0.1);
    v.lineTo(-0.055, 0.1);
    v.lineTo(-0.06, 0.49);
    const strip = new THREE.Mesh(new THREE.ShapeGeometry(v), scrubMat);
    strip.position.z = 0.111;
    this.torso.add(strip);
    // lapels folding back along the opening
    for (const sx of [-1, 1]) {
      const lapel = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.24, 0.01), coatMat);
      lapel.position.set(0.075 * sx, 0.38, 0.112);
      lapel.rotation.set(-0.05, 0.25 * sx, 0.2 * sx);
      this.torso.add(lapel);
      const edge = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.3, 0.012), coatMat);
      edge.position.set(0.064 * sx, 0.18, 0.112);
      this.torso.add(edge);
    }
    // coat skirt: open in front, flaring a little toward the knees
    const skirt = new THREE.Mesh(new THREE.CylinderGeometry(0.168, 0.215, 0.6, 24, 1, true, 0.42, Math.PI * 2 - 0.84), coatMat);
    skirt.scale.z = 0.78;
    skirt.position.set(0, -0.17, 0.0);
    this.torso.add(skirt);
    for (const sx of [-1, 1]) {
      const front = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.6, 0.008), coatMat);
      front.position.set(0.092 * sx, -0.17, 0.142);
      front.rotation.set(-0.07, 0, 0.04 * sx);
      this.torso.add(front);
      const pocket = new THREE.Mesh(new THREE.BoxGeometry(0.065, 0.06, 0.004), std('#e9ecec', { roughness: 0.8 }));
      pocket.position.set(0.095 * sx, -0.12, 0.149);
      this.torso.add(pocket);
    }
    const chestPocket = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.05, 0.004), std('#e9ecec', { roughness: 0.8 }));
    chestPocket.position.set(-0.1, 0.3, 0.108);
    chestPocket.rotation.y = -0.35;
    this.torso.add(chestPocket);
    const pen = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.06, 6), std('#3d7fd6', { roughness: 0.4 }));
    pen.position.set(-0.11, 0.33, 0.11);
    this.torso.add(pen);
    // ID card on a clip
    const card = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.06, 0.003), std('#ffffff', { roughness: 0.6 }));
    card.position.set(0.1, 0.24, 0.112);
    card.rotation.y = 0.35;
    this.torso.add(card);
    const band = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.014, 0.004), std('#5fb89a', { roughness: 0.6 }));
    band.position.set(0.1, 0.262, 0.114);
    band.rotation.y = 0.35;
    this.torso.add(band);
  }

  /** Small round earrings (pearl or gold). */
  addEarrings(color) {
    const mat = std(color, { metalness: 0.5, roughness: 0.25 });
    for (const sx of [-1, 1]) {
      const e = new THREE.Mesh(ball(10), mat);
      e.scale.setScalar(0.022);
      e.position.set(0.238 * sx, -0.055, 0.0);
      this.head.add(e);
    }
  }

  /** Thin round glasses. */
  addGlasses() {
    const frame = std('#5a4a42', { roughness: 0.4, metalness: 0.3 });
    const g = new THREE.Group();
    for (const sx of [-1, 1]) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.052, 0.006, 6, 20), frame);
      ring.position.set(0.084 * sx, 0, 0);
      ring.rotation.y = 0.3 * sx;
      g.add(ring);
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.006, 0.16), frame);
      arm.position.set(0.19 * sx, 0.01, -0.1);
      g.add(arm);
    }
    const bridge = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.006, 0.006), frame);
    bridge.position.y = 0.012;
    g.add(bridge);
    g.position.set(0, 0.0, 0.235);
    this.head.add(g);
  }

  /** A stethoscope around the neck. */
  addStethoscope() {
    const tube = std('#3a3f44', { roughness: 0.5 });
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-0.07, 0.3, 0.125), new THREE.Vector3(-0.09, 0.44, 0.09), new THREE.Vector3(-0.06, 0.52, 0.0),
      new THREE.Vector3(0, 0.54, -0.06), new THREE.Vector3(0.06, 0.52, 0.0), new THREE.Vector3(0.09, 0.44, 0.09), new THREE.Vector3(0.05, 0.27, 0.13),
    ]);
    this.torso.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 24, 0.008, 6), tube));
    const bell = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.012, 14), std('#c7ccd0', { metalness: 0.8, roughness: 0.25 }));
    bell.rotation.x = Math.PI / 2;
    bell.position.set(0.05, 0.255, 0.135);
    this.torso.add(bell);
  }

  /** A small name badge on the chest (FDC branding). */
  addBadge(label) {
    const c = document.createElement('canvas');
    c.width = 256; c.height = 128;
    const g = c.getContext('2d');
    g.fillStyle = '#ffffff';
    g.beginPath(); g.roundRect(4, 4, 248, 120, 26); g.fill();
    g.strokeStyle = '#5fb89a'; g.lineWidth = 8; g.stroke();
    g.fillStyle = '#3f8f74'; g.font = '900 64px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(label, 128, 68);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(0.07, 0.035), new THREE.MeshBasicMaterial({ map: tex, transparent: true }));
    m.position.set(0.06, 0.34, 0.112);
    this.torso.add(m);
  }

  /** Kids get a shiny star sticker on their shirt after a good visit. */
  addSticker() {
    if (this.sticker) return;
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d');
    g.fillStyle = '#f7c95e';
    g.beginPath();
    for (let i = 0; i < 10; i++) { const r = i % 2 ? 26 : 60; const a = (i / 10) * Math.PI * 2 - Math.PI / 2; g.lineTo(64 + Math.cos(a) * r, 66 + Math.sin(a) * r); }
    g.fill();
    g.fillStyle = '#e98aa4'; g.beginPath(); g.arc(64, 66, 14, 0, Math.PI * 2); g.fill();
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    this.sticker = new THREE.Mesh(new THREE.PlaneGeometry(0.06, 0.06), new THREE.MeshBasicMaterial({ map: tex, transparent: true }));
    this.sticker.position.set(-0.06, 0.32, 0.113);
    this.torso.add(this.sticker);
  }

  // ------------------------------------------------------------------ per-frame animation
  update(dt, cameraPos) {
    this.t += dt;
    const t = this.t;
    const k = ease(10, dt);

    // walking along a path
    let moving = false;
    if (this.path?.length) {
      const p = this.root.position;
      const goal = this.path[0];
      const dx = goal.x - p.x;
      const dz = goal.z - p.z;
      const d = Math.hypot(dx, dz);
      const step = this.speed * dt * (this.sad ? 0.6 : 1);
      if (d <= step) {
        p.x = goal.x; p.z = goal.z;
        this.path.shift();
        if (!this.path.length) { this.path = null; const r = this.onArrive; this.onArrive = null; r?.(); }
      } else {
        p.x += (dx / d) * step;
        p.z += (dz / d) * step;
        moving = true;
        const want = Math.atan2(dx, dz);
        let diff = want - this.root.rotation.y;
        diff = Math.atan2(Math.sin(diff), Math.cos(diff));
        this.root.rotation.y += diff * ease(8, dt);
      }
      const before = Math.sin(this.phase);
      this.phase += step * 9.5;
      if (Math.sign(Math.sin(this.phase)) !== Math.sign(before)) this.onStep?.();
    }
    this.walkAmt = lerp(this.walkAmt, moving ? 1 : 0, ease(8, dt));

    // sitting down / standing up
    if (this.sitDir) {
      this.sitT = Math.min(1, this.sitT + dt / 0.9);
      const e = this.sitT < 0.5 ? 2 * this.sitT * this.sitT : 1 - (-2 * this.sitT + 2) ** 2 / 2;
      const s = this.seat;
      if (this.sitDir > 0) {
        this.sitAmt = e;
        const f = this.sitFrom;
        this.root.position.x = lerp(f.x, s.x, e);
        this.root.position.z = lerp(f.z, s.z, e);
        let dy = s.yaw - f.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
        this.root.rotation.y = f.yaw + dy * e;
        this.root.position.y = (s.y - HIP_Y * this.root.scale.y) * e + Math.sin(e * Math.PI) * 0.12; // a little hop up
        this.recline = (s.recline || 0) * e;
      } else {
        this.sitAmt = 1 - e;
        const to = this.standTo;
        this.root.position.x = lerp(s.x, to.x, e);
        this.root.position.z = lerp(s.z, to.z, e);
        this.root.position.y = (s.y - HIP_Y * this.root.scale.y) * (1 - e) + Math.sin(e * Math.PI) * 0.1;
        this.recline = (s.recline || 0) * (1 - e);
      }
      if (this.sitT >= 1) { this.sitDir = 0; const r = this.onSat; this.onSat = null; r?.(); }
    }
    this.shadow.visible = this.sitAmt < 0.5;

    // face: blend toward the target expression
    const c = this.cur;
    const tg = this.target;
    for (const key of ['eye', 'brow', 'browY', 'sad', 'open', 'blush', 'red', 'py']) c[key] = lerp(c[key], tg[key], k);
    this.blinkT -= dt;
    if (this.blinkT <= 0) { this.blink = 0; this.blinkT = 2.2 + Math.random() * 3.5; }
    this.blink = Math.min(1, this.blink + dt * 9);
    const eyeOpen = Math.max(0.08, c.eye * (this.blink < 1 ? 0.15 + this.blink * 0.85 : 1));
    for (const e of this.eyes) {
      e.w.scale.y = 0.04 * eyeOpen;
      e.pupil.scale.y = Math.max(0.15, Math.min(1, eyeOpen));
      e.pupil.position.y = c.py;
      e.w.visible = e.pupil.visible = !tg.x;
      e.x.visible = !!tg.x;
    }
    for (const b of this.brows) {
      // positive "brow" = angry (inner end down); "sad" lifts the inner end
      b.b.rotation.z = Math.PI / 2 + b.side * (c.brow - c.sad * 0.45);
      b.b.position.y = 0.075 + c.browY + c.sad * 0.006;
    }
    this.cheekMat.opacity = 0.15 + c.blush * 0.55;
    this.skinMat.color.copy(this.skinBase).lerp(RED, c.red * 0.35);

    // mouth shape (talking flaps the mouth while a bubble is fresh)
    if (this.talkT > 0) this.talkT -= dt;
    const talking = this.talkT > 0 && (tg.mouth === 'smile' || tg.mouth === 'talk' || tg.mouth === 'grin');
    let open = c.open;
    let mode = tg.mouth;
    if (talking) { mode = 'talk'; open = 0.18 + Math.abs(Math.sin(t * 14)) * 0.32; }
    // in treatment the mouth never closes or hides the teeth (the face still shows through eyes and brows)
    if (this.treating) { mode = 'open'; open = Math.max(c.open, 0.75) + (talking ? Math.abs(Math.sin(t * 14)) * 0.12 : 0); }
    const showOpen = mode === 'open' || mode === 'talk' || mode === 'grin';
    this.open.visible = showOpen;
    this.smile.visible = mode === 'smile';
    this.frown.visible = mode === 'frown';
    if (showOpen) this.layoutMouth(Math.max(0.12, open), tg.x ? 1.15 : mode === 'talk' ? 0.62 : mode === 'grin' ? 0.9 : 1, mode === 'talk' || mode === 'grin', this.treating);
    this.open.scale.y = mode === 'grin' ? 0.7 : 1;
    this.open.position.y = mode === 'grin' ? 0.008 : 0;

    // body pose
    this.pose(dt, t);

    // head: look at something (the dentist, a tool), with a shake when upset
    let yaw = 0;
    let pitch = this.sad && this.walkAmt > 0.3 ? 0.35 : 0;
    if (this.lookTarget) {
      const v = this.torso.worldToLocal(_v.copy(this.lookTarget));
      v.sub(this.neck.position);
      v.y -= 0.2;
      yaw = THREE.MathUtils.clamp(Math.atan2(v.x, v.z), -1.35, 1.35);
      pitch = THREE.MathUtils.clamp(Math.atan2(-v.y, Math.hypot(v.x, v.z)), -0.6, 0.6);
    }
    if (this.faceName === 'sad') pitch += 0.25;
    this.look.yaw = lerp(this.look.yaw, yaw, ease(6, dt));
    this.look.pitch = lerp(this.look.pitch, pitch, ease(6, dt));
    this.shake = Math.max(0, this.shake - dt * 1.6);
    this.neck.rotation.set(this.look.pitch, this.look.yaw + Math.sin(t * 38) * this.shake * 0.12, Math.sin(t * 23) * this.shake * 0.08);

    // bubble floats above the head
    if (this.bubble.time > 0) this.bubble.time -= dt;
    this.bubble.update(dt, this.bubble.time > 0);
    this.headWorld(_v);
    _v.y += 0.34;
    this.root.worldToLocal(_v);
    this.bubble.sprite.position.copy(_v);
  }

  pose(dt, t) {
    const J = this.joints;
    const set = (key, v) => { J[key] = v; };
    const w = this.walkAmt;
    const s = this.sitAmt;
    const ph = this.phase;
    const swing = Math.sin(ph) * 0.55 * w;
    const swingSad = this.sad ? 0.5 : 1;

    // legs: walk swing, sit bend
    for (const [i, leg] of this.legs.entries()) {
      const dir = i === 0 ? 1 : -1;
      const sw = swing * dir * swingSad;
      set(`th${i}`, lerp(sw, -1.45, s));
      // dental chair (it reclines): legs stretched out along the legrest; benches and chairs: knees bent
      const legsOut = this.seat?.recline ? 1 : 0;
      set(`sh${i}`, lerp(Math.max(0, -Math.sin(ph) * dir) * 0.7 * w, lerp(1.15, 0.36, legsOut), s));
      void leg;
    }
    // swinging legs on the bench (kids and bored patients)
    if (this.swingLegs && s > 0.9) this.legs.forEach((leg, i) => set(`sh${i}`, J[`sh${i}`] + Math.sin(t * 4.5 + i * Math.PI) * 0.3));
    // breathing and bobbing
    const breathe = Math.sin(t * 2.2) * 0.008;
    this.jump = Math.max(0, this.jump - dt * 2.5);
    const hop = Math.sin((1 - this.jump) * Math.PI) * 0.09 * (this.jump > 0 ? 1 : 0);
    this.body.position.y = Math.abs(Math.sin(ph)) * 0.035 * w * swingSad + breathe + hop;
    set('torsoX', -this.recline + (this.sad && w > 0.2 ? 0.2 : 0) + this.lean);

    // arms: idle → walk → sit → action
    for (const [i, arm] of this.arms.entries()) {
      const side = arm.side; // -1 left, +1 right
      let sx = -swing * (i === 0 ? 1 : -1) * 0.9 * swingSad;
      let sz = 0.12 * side;
      let ez = 0;
      let ex = -0.18 - Math.abs(swing) * 0.2;
      let sy = 0;
      // seated: hands resting on the tummy/lap (the dental chair has no armrests)
      if (s > 0.01) { sx = lerp(sx, SIT_ARM.sx, s); ex = lerp(ex, SIT_ARM.ex, s); sz = lerp(sz, SIT_ARM.sz * side, s); sy = lerp(0, SIT_ARM.sy * side, s); }
      const a = this.action;
      if (a) {
        const k = Math.min(1, this.actionT / 0.2, (this.actionDur - this.actionT) / 0.25);
        let ax = sx; let az = sz; let aex = ex; let aez = ez;
        const right = side > 0;
        if (a === 'wave' && right) { az = 2.5 + Math.sin(t * 9) * 0.25; aex = -0.3; aez = Math.sin(t * 9) * 0.5; }
        if (a === 'cheer') { az = 2.65 * side + Math.sin(t * 12) * 0.12; aex = -0.2; }
        if (a === 'fist') { ax = -1.3 + Math.sin(t * 22 + i) * 0.22; aex = -1.5; az = 0.25 * side; }
        if (a === 'clap') { ax = -1.15; az = -0.42 * side + Math.sin(t * 16) * 0.12 * side; aex = -0.8; }
        if (a === 'facepalm' && right) { ax = -2.35; az = -0.55; aex = -1.7; }
        if (a === 'thumbs' && right) { ax = -1.25; az = 0.1; aex = -1.35; }
        if (a === 'point' && right) { ax = -1.35; az = 0.5; aex = -0.1; }
        if (a === 'shrug') { ax = -0.4; az = 0.65 * side; aex = -1.4; aez = 0.5 * side; }
        if (a === 'cover') { ax = -2.2; az = -0.35 * side; aex = -1.9; } // hands over the mouth
        if (a === 'phone' && right) { ax = -2.0; az = 0.35; aex = -2.2; } // hand to the ear
        if (a === 'scroll' && right) { ax = -0.9; az = -0.2; aex = -1.6 + Math.sin(t * 3) * 0.05; } // phone in front of the chest
        if (a === 'scroll' && !right) { ax = -0.7; az = 0.25; aex = -1.4; }
        if (a === 'stretch') { az = 2.9 * side; ax = -0.2; aex = -0.6 + Math.sin(t * 2) * 0.1; } // big yawn stretch
        if (a === 'tidy') { ax = -1.2 + Math.sin(t * 5 + i) * 0.15; az = -0.15 * side + Math.sin(t * 3) * 0.12; aex = -0.6; } // arranging things
        if (a === 'mirror' && right) { ax = -0.95; az = -0.45; aex = -0.95; } // hand mirror held up in front of the face
        if (a === 'give' && right) { ax = -1.45; az = 0.25; aex = -0.25; } // holding something out
        if (a === 'shiver') { ax = -1.0 + Math.sin(t * 40 + i) * 0.08; az = -0.3 * side; aex = -1.6; } // arms hugging
        if (a === 'calm' && right) { ax = -1.1; az = -0.2; aex = -0.5; aez = Math.sin(t * 6) * 0.3; } // gentle pat
        sx = lerp(sx, ax, k); sz = lerp(sz, az, k); ex = lerp(ex, aex, k); ez = lerp(ez, aez, k); sy = lerp(sy, 0, k);
      }
      set(`sx${i}`, sx); set(`sy${i}`, sy); set(`sz${i}`, sz); set(`ex${i}`, ex); set(`ez${i}`, ez);
    }
    if (this.action) {
      this.actionT += dt;
      if (this.actionT >= this.actionDur) this.action = null;
    }

    // smooth every joint toward its target
    const k = ease(14, dt);
    const S = (this.sm ||= {});
    for (const key in J) S[key] = S[key] === undefined ? J[key] : lerp(S[key], J[key], k);
    this.legs.forEach((leg, i) => { leg.thigh.rotation.x = S[`th${i}`]; leg.shin.rotation.x = S[`sh${i}`]; });
    this.arms.forEach((arm, i) => {
      arm.shoulder.rotation.set(S[`sx${i}`], S[`sy${i}`], S[`sz${i}`]);
      arm.elbow.rotation.set(S[`ex${i}`], 0, S[`ez${i}`]);
    });
    this.torso.rotation.x = S.torsoX;
  }

  dispose() {
    this.root.traverse((o) => {
      if (o.material && !o.isSprite) o.material.dispose?.();
    });
    this.bubble.dispose();
  }
}

const RED = new THREE.Color('#ff6b6b');
const _v = new THREE.Vector3();

/** Speech bubble sprite that pops in and out. */
function makeBubble() {
  const W = 640;
  const H = 300;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false });
  const sprite = new THREE.Sprite(mat);
  sprite.renderOrder = 30;
  sprite.center.set(0.5, 0);
  const SIZE = 0.46;
  let pop = 0;
  let lines = 1;
  const b = {
    sprite,
    time: 0,
    show(str, tone) {
      ctx.clearRect(0, 0, W, H);
      ctx.font = `700 46px ${FONT}`;
      const ls = wrap(ctx, str, W - 90).slice(0, 3);
      lines = ls.length;
      const bh = 40 + ls.length * 56;
      const top = H - 40 - bh;
      const fill = tone === 'angry' ? '#ffe3e3' : tone === 'sad' ? '#e6eef7' : tone === 'happy' ? '#e3f6ee' : '#ffffff';
      const edge = tone === 'angry' ? '#e8676c' : tone === 'sad' ? '#8aa3c2' : '#9ed9c2';
      roundRect(ctx, 10, top, W - 20, bh, 44);
      ctx.fillStyle = fill;
      ctx.fill();
      ctx.lineWidth = 8;
      ctx.strokeStyle = edge;
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(W / 2 - 26, top + bh - 4);
      ctx.lineTo(W / 2, H - 6);
      ctx.lineTo(W / 2 + 26, top + bh - 4);
      ctx.fillStyle = fill;
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(W / 2 - 26, top + bh);
      ctx.lineTo(W / 2, H - 6);
      ctx.lineTo(W / 2 + 26, top + bh);
      ctx.stroke();
      ctx.fillStyle = tone === 'angry' ? '#b8343e' : '#2e3b36';
      ctx.textAlign = 'center';
      ls.forEach((l, i) => ctx.fillText(l, W / 2, top + 64 + i * 56));
      tex.needsUpdate = true;
      pop = 0;
    },
    update(dt, on) {
      pop = lerp(pop, on ? 1 : 0, ease(on ? 12 : 9, dt));
      const over = on ? 1 + Math.max(0, Math.sin(Math.min(1, pop) * Math.PI)) * 0.08 : 1;
      sprite.visible = pop > 0.02;
      sprite.scale.set(SIZE * pop * over, SIZE * (H / W) * pop * over, 1);
      void lines;
    },
    dispose() { tex.dispose(); mat.dispose(); },
  };
  b.update(0, false);
  return b;
}
