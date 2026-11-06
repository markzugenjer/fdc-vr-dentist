import * as THREE from 'three';
import { P } from './palette.js';
import { store } from '../core/util.js';
import { progress } from './progress.js';

/**
 * Clinic customization: spend stars on wall colours, posters, plants, the nurse's uniform and
 * the chair colour. Stars spent here don't lower your rank (that counts every star ever earned).
 */
const KEY = 'fdc.dentist.decor';
const SPENT_KEY = 'fdc.dentist.spent';

export const DECOR = {
  wall: {
    label: 'Dinding',
    options: [
      { id: 'cream', name: 'Krem', price: 0, color: '#fdfbf8' },
      { id: 'mint', name: 'Mint', price: 4, color: '#e6f6ee' },
      { id: 'pink', name: 'Pink', price: 4, color: '#fdecf1' },
      { id: 'sky', name: 'Biru langit', price: 6, color: '#e6f1fb' },
      { id: 'lemon', name: 'Lemon', price: 6, color: '#fdf5d8' },
    ],
  },
  poster: {
    label: 'Poster',
    options: [
      { id: 'smile', name: 'Senyum Sehat', price: 0 },
      { id: 'brush', name: 'Sikat 2x Sehari', price: 3 },
      { id: 'hero', name: 'Gigi Super', price: 5 },
      { id: 'fdc', name: 'Keluarga FDC', price: 5 },
    ],
  },
  plants: {
    label: 'Tanaman',
    options: [
      { id: 'basic', name: 'Biasa', price: 0 },
      { id: 'more', name: 'Tanaman ekstra', price: 5 },
      { id: 'garden', name: 'Taman mini', price: 10 },
    ],
  },
  uniform: {
    label: 'Seragam',
    options: [
      { id: 'pink', name: 'Pink', price: 0, top: '#f6b9c9', bottom: '#f6b9c9' },
      { id: 'mint', name: 'Mint', price: 4, top: '#9ed9c2', bottom: '#9ed9c2' },
      { id: 'white', name: 'Putih', price: 3, top: '#ffffff', bottom: '#dfe9f0' },
      { id: 'lilac', name: 'Ungu muda', price: 5, top: '#c9b8ef', bottom: '#c9b8ef' },
      { id: 'sky', name: 'Biru', price: 5, top: '#a8d8f0', bottom: '#7fb6e8' },
    ],
  },
  chair: {
    label: 'Kursi',
    options: [
      { id: 'mint', name: 'Mint & pink', price: 0, pad: P.mint, accent: P.pink },
      { id: 'pink', name: 'Pink & mint', price: 4, pad: P.pink, accent: P.mint },
      { id: 'lilac', name: 'Ungu muda', price: 5, pad: '#c9b8ef', accent: '#f6b9c9' },
      { id: 'sky', name: 'Biru langit', price: 5, pad: '#a8d8f0', accent: '#ffffff' },
      { id: 'gold', name: 'Emas VIP', price: 12, pad: '#f2d27a', accent: '#ffffff' },
    ],
  },
};
export const DECOR_ORDER = ['wall', 'poster', 'plants', 'uniform', 'chair'];

function load() {
  const d = store.get(KEY, null) || {};
  d.owned ||= {};
  d.use ||= {};
  for (const k of DECOR_ORDER) {
    d.owned[k] ||= [DECOR[k].options[0].id];
    d.use[k] ||= DECOR[k].options[0].id;
  }
  return d;
}

export class Decor {
  constructor({ room, assistant, parent }) {
    this.room = room;
    this.assistant = assistant;
    this.state = load();
    this.posters = {};
    this.plantSets = { more: plantSet(parent, 'more'), garden: plantSet(parent, 'garden') };
    this.apply();
  }

  get wallet() { return Math.max(0, progress.stars - store.get(SPENT_KEY, 0)); }
  current(cat) { return DECOR[cat].options.find((o) => o.id === this.state.use[cat]); }
  owns(cat, id) { return this.state.owned[cat].includes(id); }
  /** The option after the current one (what the shop button offers). */
  next(cat) {
    const list = DECOR[cat].options;
    const i = list.findIndex((o) => o.id === this.state.use[cat]);
    return list[(i + 1 + (this.skip?.[cat] || 0)) % list.length];
  }

  /**
   * Shop button pressed for a category: equip the next option, buying it if needed.
   * Returns { ok, bought, option, need }.
   */
  advance(cat) {
    const o = this.next(cat);
    if (this.owns(cat, o.id)) return this.equip(cat, o);
    if (this.wallet >= o.price) {
      store.set(SPENT_KEY, store.get(SPENT_KEY, 0) + o.price);
      this.state.owned[cat].push(o.id);
      return { ...this.equip(cat, o), bought: true };
    }
    // can't afford it: offer the one after it next time
    this.skip ||= {};
    this.skip[cat] = ((this.skip[cat] || 0) + 1) % DECOR[cat].options.length;
    return { ok: false, option: o, need: o.price - this.wallet };
  }

  equip(cat, o) {
    this.state.use[cat] = o.id;
    if (this.skip) this.skip[cat] = 0;
    store.set(KEY, this.state);
    this.apply();
    return { ok: true, option: o };
  }

  apply() {
    const m = this.room.mats;
    m.paint.color.set(this.current('wall').color);
    const u = this.current('uniform');
    this.assistant.topMat.color.set(u.top);
    this.assistant.botMat.color.set(u.bottom);
    const c = this.current('chair');
    this.room.chair.padMat.color.set(c.pad);
    this.room.chair.accentMat.color.set(c.accent);
    const pl = this.state.use.plants;
    this.plantSets.more.visible = pl === 'more' || pl === 'garden';
    this.plantSets.garden.visible = pl === 'garden';
    const pid = this.state.use.poster;
    if (pid === 'smile') {
      if (this.posters.smile) this.room.poster.material.map = this.posters.smile;
    } else {
      this.posters.smile ||= this.room.poster.material.map;
      this.posters[pid] ||= posterTexture(pid);
      this.room.poster.material.map = this.posters[pid];
    }
    this.room.poster.material.needsUpdate = true;
  }
}

// ------------------------------------------------------------------ extra plants
function plantSet(parent, kind) {
  const g = new THREE.Group();
  const pot = (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.6 });
  const leaf = new THREE.MeshStandardMaterial({ color: '#7fc79b', roughness: 0.8 });
  const leafDark = new THREE.MeshStandardMaterial({ color: '#5fae80', roughness: 0.8 });
  const spots = kind === 'more'
    ? [[-2.05, 0.35, '#f6b9c9'], [1.0, -2.95, '#9ed9c2']]
    : [[-2.1, 1.0, '#f7c95e'], [-0.42, -2.95, '#f6b9c9'], [0.55, -2.95, '#a8d8f0']];
  for (const [x, z, col] of spots) {
    const p = new THREE.Group();
    const potM = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.12, 0.3, 16), pot(col));
    potM.position.y = 0.15;
    p.add(potM);
    for (let i = 0; i < 6; i++) {
      const a = i * 1.1;
      const lf = new THREE.Mesh(new THREE.SphereGeometry(0.11 + (i % 2) * 0.03, 10, 8), i % 2 ? leaf : leafDark);
      lf.position.set(Math.cos(a) * 0.08, 0.42 + i * 0.06, Math.sin(a) * 0.08);
      p.add(lf);
    }
    if (kind === 'garden') {
      for (let i = 0; i < 4; i++) {
        const fl = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), pot(['#ff9fb6', '#ffffff', '#f7c95e', '#e98aa4'][i]));
        fl.position.set(Math.cos(i * 1.6) * 0.13, 0.62 + (i % 2) * 0.12, Math.sin(i * 1.6) * 0.13);
        p.add(fl);
      }
    }
    p.position.set(x, 0, z);
    g.add(p);
  }
  g.visible = false;
  parent.add(g);
  return g;
}

// ------------------------------------------------------------------ posters
function posterTexture(id) {
  const c = document.createElement('canvas');
  c.width = 600;
  c.height = 800;
  const g = c.getContext('2d');
  g.fillStyle = '#ffffff';
  g.beginPath(); g.roundRect(10, 10, 580, 780, 40); g.fill();
  g.lineWidth = 16;
  g.strokeStyle = id === 'hero' ? P.pinkDeep : P.mintDeep;
  g.stroke();
  g.textAlign = 'center';
  const tooth = (x, y, s, cape) => {
    if (cape) { g.fillStyle = P.pinkDeep; g.beginPath(); g.moveTo(x - s * 0.6, y - s * 0.3); g.lineTo(x + s * 0.6, y - s * 0.3); g.lineTo(x + s, y + s * 1.4); g.lineTo(x - s, y + s * 1.4); g.fill(); }
    g.fillStyle = '#ffffff';
    g.strokeStyle = '#cfe6dc';
    g.lineWidth = 6;
    g.beginPath();
    g.moveTo(x - s * 0.55, y - s * 0.35);
    g.bezierCurveTo(x - s * 0.55, y - s * 0.8, x - s * 0.1, y - s * 0.8, x, y - s * 0.55);
    g.bezierCurveTo(x + s * 0.1, y - s * 0.8, x + s * 0.55, y - s * 0.8, x + s * 0.55, y - s * 0.35);
    g.bezierCurveTo(x + s * 0.55, y + s * 0.1, x + s * 0.4, y + s * 0.2, x + s * 0.32, y + s * 0.65);
    g.bezierCurveTo(x + s * 0.26, y + s * 0.85, x + s * 0.08, y + s * 0.8, x + s * 0.05, y + s * 0.5);
    g.lineTo(x - s * 0.05, y + s * 0.5);
    g.bezierCurveTo(x - s * 0.08, y + s * 0.8, x - s * 0.26, y + s * 0.85, x - s * 0.32, y + s * 0.65);
    g.bezierCurveTo(x - s * 0.4, y + s * 0.2, x - s * 0.55, y + s * 0.1, x - s * 0.55, y - s * 0.35);
    g.fill(); g.stroke();
    g.fillStyle = P.ink;
    g.beginPath(); g.arc(x - s * 0.2, y - s * 0.2, s * 0.07, 0, Math.PI * 2); g.arc(x + s * 0.2, y - s * 0.2, s * 0.07, 0, Math.PI * 2); g.fill();
    g.strokeStyle = P.pinkDeep; g.lineWidth = s * 0.06; g.lineCap = 'round';
    g.beginPath(); g.arc(x, y - s * 0.06, s * 0.17, 0.3, Math.PI - 0.3); g.stroke();
  };
  if (id === 'brush') {
    g.fillStyle = P.mintDark; g.font = '900 64px system-ui'; g.fillText('Sikat Gigi', 300, 110); g.fillText('2x Sehari!', 300, 180);
    tooth(220, 430, 170);
    g.fillStyle = P.pinkDeep; g.save(); g.translate(430, 420); g.rotate(-0.6); g.fillRect(-14, -150, 28, 260); g.fillStyle = '#9ed9c2'; g.fillRect(-20, -200, 40, 60); g.restore();
    g.fillStyle = P.muted; g.font = '600 34px system-ui'; g.fillText('Pagi setelah sarapan', 300, 650); g.fillText('& malam sebelum tidur', 300, 700);
  } else if (id === 'hero') {
    g.fillStyle = P.pinkDeep; g.font = '900 70px system-ui'; g.fillText('GIGI SUPER!', 300, 120);
    tooth(300, 400, 200, true);
    g.fillStyle = P.mintDark; g.font = '700 36px system-ui'; g.fillText('Kuat karena fluoride', 300, 680); g.fillText('dan rajin periksa', 300, 725);
  } else {
    g.fillStyle = P.mintDark; g.font = '900 60px system-ui'; g.fillText('Keluarga FDC', 300, 110);
    tooth(160, 400, 120); tooth(300, 360, 150); tooth(440, 420, 100);
    g.fillStyle = P.pinkDeep; g.font = '700 36px system-ui'; g.fillText('Senyum sehat', 300, 640); g.fillText('untuk semua umur', 300, 690);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
