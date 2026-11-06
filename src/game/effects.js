import * as THREE from 'three';

const CONFETTI = ['#f6b9c9', '#e98aa4', '#9ed9c2', '#5fb89a', '#f7c95e', '#a8d8f0', '#b9a7e8'];

/** Little canvas pictures for the particles. */
function drawTexture(kind) {
  const S = 128;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  const m = S / 2;
  if (kind === 'star') {
    g.fillStyle = '#ffe28a';
    g.beginPath();
    for (let i = 0; i < 8; i++) {
      const r = i % 2 ? 16 : 60;
      const a = (i / 8) * Math.PI * 2 - Math.PI / 2;
      g.lineTo(m + Math.cos(a) * r, m + Math.sin(a) * r);
    }
    g.fill();
    g.fillStyle = '#ffffff';
    g.beginPath(); g.arc(m, m, 12, 0, Math.PI * 2); g.fill();
  } else if (kind === 'puff') {
    const gr = g.createRadialGradient(m, m, 4, m, m, m);
    gr.addColorStop(0, 'rgba(255,255,255,0.95)');
    gr.addColorStop(0.6, 'rgba(240,240,240,0.6)');
    gr.addColorStop(1, 'rgba(240,240,240,0)');
    g.fillStyle = gr; g.fillRect(0, 0, S, S);
  } else if (kind === 'tear' || kind === 'drop') {
    g.fillStyle = kind === 'tear' ? '#7cc6f2' : '#a9dcf5';
    g.beginPath();
    g.moveTo(m, 10);
    g.bezierCurveTo(m + 48, 70, m + 40, 118, m, 118);
    g.bezierCurveTo(m - 40, 118, m - 48, 70, m, 10);
    g.fill();
    g.fillStyle = 'rgba(255,255,255,0.8)';
    g.beginPath(); g.ellipse(m - 14, 80, 8, 14, -0.3, 0, Math.PI * 2); g.fill();
  } else if (kind === 'heart') {
    g.fillStyle = '#f48aa8';
    g.beginPath();
    g.moveTo(m, 110);
    g.bezierCurveTo(-10, 60, 20, 6, m, 40);
    g.bezierCurveTo(108, 6, 138, 60, m, 110);
    g.fill();
  } else if (kind === 'bit') {
    g.fillStyle = '#d9b860';
    g.beginPath(); g.arc(m, m, 44, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#c29a3d';
    g.beginPath(); g.arc(m + 12, m + 10, 18, 0, Math.PI * 2); g.fill();
  } else if (kind === 'anger') {
    // the cartoon "anger vein" mark
    g.strokeStyle = '#e8505d';
    g.lineWidth = 14;
    g.lineCap = 'round';
    for (let i = 0; i < 4; i++) {
      g.save();
      g.translate(m, m);
      g.rotate((i * Math.PI) / 2);
      g.beginPath(); g.moveTo(14, -44); g.quadraticCurveTo(14, -14, 44, -14); g.stroke();
      g.restore();
    }
  } else if (kind === 'confetti') {
    g.fillStyle = '#ffffff';
    g.fillRect(m - 22, m - 40, 44, 80);
  } else if (kind === 'zzz') {
    g.fillStyle = '#7b8fd6';
    g.font = '900 96px system-ui, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('Z', m, m + 4);
  } else if (kind === 'note') {
    g.fillStyle = '#e98aa4';
    g.font = '900 100px system-ui, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('♪', m, m + 4);
  } else if (kind === 'blood') {
    g.fillStyle = '#d64553';
    g.beginPath(); g.arc(m, m, 40, 0, Math.PI * 2); g.fill();
  } else {
    const gr = g.createRadialGradient(m, m, 2, m, m, m);
    gr.addColorStop(0, 'rgba(255,255,255,1)');
    gr.addColorStop(0.4, 'rgba(200,240,255,0.8)');
    gr.addColorStop(1, 'rgba(200,240,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, S, S);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/**
 * Pooled sprite particles: sparkles, steam puffs, tears, water drops, hearts, tartar bits.
 *   fx.emit('star', worldPos, 8, { speed: 0.6, size: 0.05 })
 */
export class Effects {
  constructor(parent, size = 120) {
    this.maps = {};
    for (const k of ['star', 'puff', 'tear', 'drop', 'heart', 'bit', 'anger', 'blood', 'glow', 'confetti', 'zzz', 'note']) this.maps[k] = drawTexture(k);
    this.pool = [];
    for (let i = 0; i < size; i++) {
      // each sprite has its own material (own opacity); only the picture is swapped
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.maps.star, transparent: true, depthWrite: false, toneMapped: false }));
      s.visible = false;
      s.renderOrder = 20;
      s.userData = { life: 0, max: 1, vel: new THREE.Vector3(), grav: 0, size: 0.05, spin: 0, grow: 0, kind: 'star' };
      parent.add(s);
      this.pool.push(s);
    }
    this.next = 0;
  }

  emit(kind, pos, n = 6, o = {}) {
    const { speed = 0.5, size = 0.04, life = 0.8, gravity = 0, up = 0, spread = 0.02, grow = 0, dir = null } = o;
    for (let i = 0; i < n; i++) {
      const s = this.pool[this.next];
      this.next = (this.next + 1) % this.pool.length;
      s.material.map = this.maps[kind] || this.maps.glow;
      s.material.color.set(kind === 'confetti' ? CONFETTI[Math.floor(Math.random() * CONFETTI.length)] : '#ffffff');
      s.visible = true;
      s.position.set(pos.x + (Math.random() - 0.5) * spread, pos.y + (Math.random() - 0.5) * spread, pos.z + (Math.random() - 0.5) * spread);
      const d = s.userData;
      d.kind = kind;
      d.life = d.max = life * (0.7 + Math.random() * 0.6);
      if (dir) d.vel.copy(dir).multiplyScalar(speed * (0.6 + Math.random() * 0.8));
      else d.vel.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize().multiplyScalar(speed * Math.random());
      d.vel.y += up;
      d.grav = gravity;
      d.size = size * (0.7 + Math.random() * 0.6);
      d.grow = grow;
      d.spin = (Math.random() - 0.5) * 4;
      s.material.rotation = Math.random() * Math.PI;
      s.scale.setScalar(d.size);
    }
  }

  update(dt) {
    for (const s of this.pool) {
      if (!s.visible) continue;
      const d = s.userData;
      d.life -= dt;
      if (d.life <= 0) { s.visible = false; continue; }
      d.vel.y -= d.grav * dt;
      s.position.addScaledVector(d.vel, dt);
      d.vel.multiplyScalar(1 - dt * 1.5);
      const k = d.life / d.max; // 1 → 0
      const pop = Math.min(1, (1 - k) * 8); // quick pop-in
      s.scale.setScalar(d.size * pop * (1 + d.grow * (1 - k)));
      s.material.opacity = Math.min(1, k * 2.5);
      s.material.rotation += d.spin * dt;
    }
  }
}
