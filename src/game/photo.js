import * as THREE from 'three';
import qrcode from 'qrcode-generator';
import { P } from './palette.js';
import { roundRect } from '../core/ui.js';

/**
 * Foto kenangan: a snapshot of the round's happiest moment (the patient cheering with their new
 * smile, Suster Nana clapping), taken by a virtual camera in front of the chair, then framed as an
 * FDC photo card with the player's name, score, place and prize, and a QR to FDC.
 *
 * The snapshot is rendered once per happy patient into a small off-screen image (640 x 480),
 * so it costs one extra draw of the room at that moment and nothing while playing.
 */
const PW = 640;
const PH = 480;

export class PhotoBooth {
  constructor(renderer, scene) {
    this.renderer = renderer;
    this.scene = scene;
    this.rt = new THREE.WebGLRenderTarget(PW, PH, { samples: 4 });
    this.rt.texture.colorSpace = THREE.SRGBColorSpace;
    this.cam = new THREE.PerspectiveCamera(46, PW / PH, 0.05, 30);
    this.pixels = new Uint8Array(PW * PH * 4);
    this.canvas = document.createElement('canvas');
    this.canvas.width = PW;
    this.canvas.height = PH;
    this.has = false;
    this.stars = -1;
  }

  /** Forget the photo (a new round starts). */
  reset() { this.has = false; this.stars = -1; }

  /** Take the photo from `from`, looking at `at`. Keeps the best one of the round (most stars, then latest). */
  capture(from, at, stars = 3) {
    if (stars < this.stars) return false;
    const r = this.renderer;
    const cam = this.cam;
    cam.position.copy(from);
    cam.lookAt(at);
    cam.updateMatrixWorld(true);
    const xrOn = r.xr.enabled;
    const prev = r.getRenderTarget();
    const tm = r.toneMapping;
    try {
      r.xr.enabled = false; // draw from the photo camera, not the headset
      r.setRenderTarget(this.rt);
      r.clear();
      r.render(this.scene, cam);
      r.readRenderTargetPixels(this.rt, 0, 0, PW, PH, this.pixels);
    } finally {
      r.setRenderTarget(prev);
      r.xr.enabled = xrOn;
      r.toneMapping = tm;
    }
    // WebGL rows run bottom-up: flip into the canvas
    const c = this.canvas.getContext('2d');
    const img = c.createImageData(PW, PH);
    const row = PW * 4;
    for (let y = 0; y < PH; y++) img.data.set(this.pixels.subarray((PH - 1 - y) * row, (PH - y) * row), y * row);
    c.putImageData(img, 0, 0);
    this.has = true;
    this.stars = stars;
    return true;
  }
}

const SERIF = 'Georgia, "Noto Serif", "Times New Roman", serif';
const SANS = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

/** Small helpers for an editorial look: letter-spaced eyebrows, serif display type. */
function eyebrow(c, str, x, y, size, color, align = 'left', spacing = 0.28) {
  c.save();
  c.font = `700 ${Math.round(size)}px ${SANS}`;
  c.fillStyle = color;
  c.textAlign = align;
  c.textBaseline = 'alphabetic';
  if ('letterSpacing' in c) c.letterSpacing = `${(size * spacing).toFixed(1)}px`;
  c.fillText(str.toUpperCase(), x, y);
  c.restore();
}
function serif(c, str, x, y, size, color, { weight = 600, align = 'left', italic = false, maxWidth } = {}) {
  c.save();
  c.font = `${italic ? 'italic ' : ''}${weight} ${Math.round(size)}px ${SERIF}`;
  c.fillStyle = color;
  c.textAlign = align;
  c.textBaseline = 'alphabetic';
  if (maxWidth) c.fillText(str, x, y, maxWidth); else c.fillText(str, x, y);
  c.restore();
}
function sans(c, str, x, y, size, color, { weight = 600, align = 'left', maxWidth } = {}) {
  c.save();
  c.font = `${weight} ${Math.round(size)}px ${SANS}`;
  c.fillStyle = color;
  c.textAlign = align;
  c.textBaseline = 'alphabetic';
  if (maxWidth) c.fillText(str, x, y, maxWidth); else c.fillText(str, x, y);
  c.restore();
}
function fitSize(c, str, size, maxWidth, font) {
  c.font = `600 ${size}px ${font}`;
  const w = c.measureText(str).width;
  return w > maxWidth ? size * (maxWidth / w) : size;
}

/**
 * The photo card (landscape, 5:3): an editorial keepsake on warm ivory paper. The photo sits in a
 * white mat on the left; on the right the doctor's name in serif type, score and rank, the prize,
 * and the photo-download QR.
 *
 * qr: { link, title, sub, footer } once uploaded, { waiting: true } while it uploads,
 * { failed: true, setup } if it couldn't upload, or { tag: true } on the copy saved to Drive
 * (that copy can't hold its own link, so it shows the share tag instead).
 */
export function drawPhotoCard(c, W, H, { photo, name, score, place, plays, prize, qr, eventName = 'FDC Fest' }) {
  const u = H / 960;
  const ink = '#26332e';
  const muted = '#8a978f';
  const green = '#3f8f74';
  const blush = '#d9768f';
  const gold = '#b9893a';
  c.save();
  // ---- paper
  c.clearRect(0, 0, W, H);
  roundRect(c, 0, 0, W, H, 40 * u);
  c.clip();
  c.fillStyle = '#fbf7f1';
  c.fillRect(0, 0, W, H);
  const blob = (x, y, r, col) => {
    const g = c.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, col); g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g; c.fillRect(0, 0, W, H);
  };
  blob(W * 0.98, H * 0.02, 620 * u, 'rgba(158,217,194,0.42)');
  blob(W * 0.02, H * 1.02, 640 * u, 'rgba(246,185,201,0.38)');
  blob(W * 0.62, H * 0.98, 380 * u, 'rgba(247,201,94,0.14)');
  // paper grain
  c.fillStyle = 'rgba(80,70,50,0.025)';
  for (let i = 0; i < 1400; i++) c.fillRect((i * 7919) % W, (i * 104729) % H, 1.5 * u, 1.5 * u);
  // fine inner frame
  roundRect(c, 24 * u, 24 * u, W - 48 * u, H - 48 * u, 26 * u);
  c.lineWidth = 1.6 * u;
  c.strokeStyle = 'rgba(63,143,116,0.32)';
  c.stroke();

  // ---- header
  const L = 72 * u;
  const R = W - 72 * u;
  drawToothMark(c, L + 16 * u, 78 * u, 17 * u, green);
  eyebrow(c, 'FDC Dental Clinic', L + 44 * u, 87 * u, 24 * u, green, 'left', 0.3);
  eyebrow(c, `${eventName}  ·  Dentist VR`, R, 87 * u, 19 * u, muted, 'right', 0.3);
  c.fillStyle = 'rgba(38,51,46,0.12)';
  c.fillRect(L, 116 * u, R - L, 1.5 * u);

  // ---- the photo in a white mat
  const px = L;
  const py = 150 * u;
  const pw = W * 0.555;
  const ph = pw * (PH / PW);
  const mat = 14 * u;
  c.save();
  c.shadowColor = 'rgba(38,51,46,0.22)';
  c.shadowBlur = 42 * u;
  c.shadowOffsetY = 16 * u;
  roundRect(c, px - mat, py - mat, pw + mat * 2, ph + mat * 2, 22 * u);
  c.fillStyle = '#ffffff';
  c.fill();
  c.restore();
  c.save();
  roundRect(c, px, py, pw, ph, 12 * u);
  c.clip();
  if (photo) c.drawImage(photo, px, py, pw, ph);
  else { c.fillStyle = P.mintSoft; c.fillRect(px, py, pw, ph); }
  // a gentle vignette
  const vg = c.createRadialGradient(px + pw / 2, py + ph / 2, ph * 0.45, px + pw / 2, py + ph / 2, ph * 0.95);
  vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(20,30,25,0.22)');
  c.fillStyle = vg; c.fillRect(px, py, pw, ph);
  c.restore();
  // a frosted label on the photo
  {
    const t = 'Senyum terbaik hari ini';
    c.font = `italic 600 ${Math.round(24 * u)}px ${SERIF}`;
    const tw = c.measureText(t).width;
    const lx = px + 20 * u;
    const ly = py + ph - 64 * u;
    roundRect(c, lx, ly, tw + 56 * u, 44 * u, 22 * u);
    c.fillStyle = 'rgba(255,255,255,0.88)';
    c.fill();
    c.fillStyle = blush;
    c.beginPath(); c.arc(lx + 24 * u, ly + 22 * u, 6 * u, 0, Math.PI * 2); c.fill();
    serif(c, t, lx + 40 * u, ly + 30 * u, 24 * u, ink, { italic: true });
  }
  // caption under the photo
  const d = new Date();
  const date = d.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
  serif(c, date, px, H - 72 * u, 24 * u, muted, { italic: true, weight: 500 });
  sans(c, qr?.footer || 'Bagikan & tag FDC Dental Clinic', px + pw, H - 72 * u, 19 * u, muted, { align: 'right', weight: 600, maxWidth: pw * 0.62 });

  // ---- the right column
  const rx = px + pw + 76 * u;
  const rw = R - rx;
  let y = 196 * u;
  eyebrow(c, 'Dokter hari ini', rx, y, 18 * u, muted);
  const nm = name || 'Dokter Tamu';
  const ns = fitSize(c, nm, 78 * u, rw, SERIF);
  serif(c, nm, rx, y + 82 * u, ns, ink, { weight: 600 });
  c.fillStyle = blush;
  c.fillRect(rx, y + 108 * u, 56 * u, 4 * u);
  // score and rank
  y = 372 * u;
  eyebrow(c, 'Skor', rx, y, 17 * u, muted);
  serif(c, `${score}`, rx, y + 66 * u, 66 * u, gold, { weight: 600 });
  if (place) {
    const kx = rx + rw * 0.55;
    c.fillStyle = 'rgba(38,51,46,0.12)';
    c.fillRect(kx - 30 * u, y - 18 * u, 1.5 * u, 92 * u);
    eyebrow(c, 'Peringkat', kx, y, 17 * u, muted);
    serif(c, `#${place}`, kx, y + 66 * u, 66 * u, green, { weight: 600 });
    sans(c, `dari ${plays} dokter`, kx + 4 * u, y + 98 * u, 18 * u, muted, { weight: 600 });
  }
  // prize
  y = 512 * u;
  const ch = 92 * u;
  roundRect(c, rx, y, rw, ch, 22 * u);
  const pg = c.createLinearGradient(rx, y, rx + rw, y + ch);
  if (prize) { pg.addColorStop(0, '#fff6e3'); pg.addColorStop(1, '#fbe6bd'); } else { pg.addColorStop(0, '#eef8f3'); pg.addColorStop(1, '#dcf1e7'); }
  c.fillStyle = pg; c.fill();
  c.lineWidth = 1.6 * u; c.strokeStyle = prize ? 'rgba(185,137,58,0.45)' : 'rgba(63,143,116,0.3)'; c.stroke();
  drawGift(c, rx + 46 * u, y + ch / 2, 22 * u, prize ? gold : green);
  eyebrow(c, prize ? 'Hadiah' : 'Terima kasih', rx + 86 * u, y + 36 * u, 15 * u, prize ? gold : green);
  sans(c, prize || 'sudah jadi dokter hari ini!', rx + 86 * u, y + 70 * u, 28 * u, ink, { weight: 800, maxWidth: rw - 104 * u });

  // QR
  const qs = 212 * u;
  const qx = rx;
  const qy = H - 72 * u - qs + 8 * u;
  c.save();
  c.shadowColor = 'rgba(38,51,46,0.12)';
  c.shadowBlur = 24 * u;
  c.shadowOffsetY = 8 * u;
  roundRect(c, qx, qy, qs, qs, 20 * u);
  c.fillStyle = '#ffffff';
  c.fill();
  c.restore();
  roundRect(c, qx, qy, qs, qs, 20 * u);
  c.lineWidth = 1.4 * u; c.strokeStyle = 'rgba(38,51,46,0.1)'; c.stroke();
  const tx = qx + qs + 30 * u;
  const tw = R - tx;
  if (qr?.waiting) {
    for (let k = 0; k < 3; k++) { c.fillStyle = k === 1 ? green : 'rgba(63,143,116,0.35)'; c.beginPath(); c.arc(qx + qs / 2 + (k - 1) * 26 * u, qy + qs / 2, 8 * u, 0, Math.PI * 2); c.fill(); }
    eyebrow(c, 'Sebentar', tx, qy + 70 * u, 16 * u, green);
    serif(c, 'Menyiapkan', tx, qy + 116 * u, 32 * u, ink, { maxWidth: tw });
    serif(c, 'link fotomu…', tx, qy + 156 * u, 32 * u, ink, { maxWidth: tw });
  } else if (qr?.failed) {
    c.fillStyle = 'rgba(217,118,143,0.12)';
    roundRect(c, qx + 14 * u, qy + 14 * u, qs - 28 * u, qs - 28 * u, 14 * u); c.fill();
    c.fillStyle = blush; c.font = `800 ${Math.round(64 * u)}px ${SANS}`; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText('!', qx + qs / 2, qy + qs / 2); c.textAlign = 'left'; c.textBaseline = 'alphabetic';
    eyebrow(c, 'Download foto', tx, qy + 58 * u, 16 * u, blush);
    serif(c, qr.setup ? 'Upload belum diatur' : 'Belum terkirim', tx, qy + 104 * u, 32 * u, ink, { maxWidth: tw });
    sans(c, qr.setup ? 'Isi alamat upload di config.js' : 'Cek internet, lalu buka foto lagi', tx, qy + 144 * u, 20 * u, muted, { maxWidth: tw });
  } else if (qr?.tag) {
    drawToothMark(c, qx + qs / 2, qy + qs / 2 + 4 * u, qs * 0.3, green);
    eyebrow(c, 'Bagikan', tx, qy + 58 * u, 16 * u, blush);
    serif(c, 'Tag FDC Dental Clinic', tx, qy + 104 * u, 32 * u, ink, { maxWidth: tw });
    sans(c, '#klinikgigiyaafdc', tx, qy + 144 * u, 20 * u, green);
  } else if (qr) {
    drawQR(c, qr.link, qx + 14 * u, qy + 14 * u, qs - 28 * u);
    eyebrow(c, 'Scan', tx, qy + 58 * u, 16 * u, blush);
    serif(c, qr.title, tx, qy + 104 * u, 34 * u, ink, { maxWidth: tw });
    const words = String(qr.sub).split(' ');
    c.font = `600 ${Math.round(20 * u)}px ${SANS}`;
    let line = '';
    let ly = qy + 144 * u;
    for (const w of words) {
      const t = line ? `${line} ${w}` : w;
      if (c.measureText(t).width > tw && line) { sans(c, line, tx, ly, 20 * u, muted); line = w; ly += 28 * u; } else line = t;
    }
    if (line) sans(c, line, tx, ly, 20 * u, muted);
  }
  c.restore();
}

function drawToothMark(c, x, y, r, color) {
  c.save();
  c.translate(x, y);
  c.fillStyle = color;
  c.beginPath();
  c.moveTo(-r * 0.8, -r * 0.45);
  c.bezierCurveTo(-r * 0.9, -r * 1.05, -r * 0.1, -r * 0.95, 0, -r * 0.7);
  c.bezierCurveTo(r * 0.1, -r * 0.95, r * 0.9, -r * 1.05, r * 0.8, -r * 0.45);
  c.bezierCurveTo(r * 0.75, r * 0.2, r * 0.5, r * 0.95, r * 0.3, r * 0.95);
  c.bezierCurveTo(r * 0.1, r * 0.95, r * 0.15, r * 0.25, 0, r * 0.25);
  c.bezierCurveTo(-r * 0.15, r * 0.25, -r * 0.1, r * 0.95, -r * 0.3, r * 0.95);
  c.bezierCurveTo(-r * 0.5, r * 0.95, -r * 0.75, r * 0.2, -r * 0.8, -r * 0.45);
  c.fill();
  c.restore();
}

function drawGift(c, x, y, r, color) {
  c.save();
  c.translate(x, y);
  c.fillStyle = '#ffffff';
  c.beginPath(); c.arc(0, 0, r * 1.25, 0, Math.PI * 2); c.fill();
  c.strokeStyle = color; c.fillStyle = color; c.lineWidth = r * 0.14;
  roundRect(c, -r * 0.62, -r * 0.2, r * 1.24, r * 0.8, r * 0.1); c.stroke();
  c.fillRect(-r * 0.72, -r * 0.42, r * 1.44, r * 0.26);
  c.fillRect(-r * 0.07, -r * 0.42, r * 0.14, r * 1.02);
  c.beginPath(); c.ellipse(-r * 0.25, -r * 0.55, r * 0.22, r * 0.13, -0.5, 0, Math.PI * 2); c.stroke();
  c.beginPath(); c.ellipse(r * 0.25, -r * 0.55, r * 0.22, r * 0.13, 0.5, 0, Math.PI * 2); c.stroke();
  c.restore();
}

function drawQR(c, url, x, y, size) {
  const qr = qrcode(0, 'M');
  qr.addData(url);
  qr.make();
  const n = qr.getModuleCount();
  const cell = size / (n + 4);
  c.fillStyle = '#ffffff';
  c.fillRect(x, y, size, size);
  c.fillStyle = '#1d2a25';
  for (let r = 0; r < n; r++) for (let k = 0; k < n; k++) if (qr.isDark(r, k)) c.fillRect(Math.floor(x + (k + 2) * cell), Math.floor(y + (r + 2) * cell), Math.ceil(cell), Math.ceil(cell));
}

/** The download QR for the card. */
export const downloadQR = (link) => ({ link, title: 'Simpan fotomu', sub: 'Scan dengan HP untuk download foto ini', footer: 'Bagikan & tag FDC Dental Clinic' });

/**
 * Upload the finished photo card (JPEG) to the booth's Google Drive through the Apps Script web app
 * (see scripts/photo-upload.gs and the README). Resolves to a direct download link, or null when
 * uploading isn't set up, the headset is offline, or it takes longer than 15 s.
 */
export async function uploadCard(canvas, { url, key, name }) {
  if (!url) return null;
  // JPEG has no transparency: put the rounded card on white so its corners aren't black
  const flat = document.createElement('canvas');
  flat.width = canvas.width;
  flat.height = canvas.height;
  const fc = flat.getContext('2d');
  fc.fillStyle = '#ffffff';
  fc.fillRect(0, 0, flat.width, flat.height);
  fc.drawImage(canvas, 0, 0);
  const image = flat.toDataURL('image/jpeg', 0.9).split(',')[1];
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15000);
  try {
    // a plain text body keeps it a "simple" request, so Apps Script needs no CORS preflight
    const res = await fetch(url, { method: 'POST', body: JSON.stringify({ key, name, image }), signal: ctrl.signal });
    const j = await res.json();
    return j && j.download ? j.download : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
