import * as THREE from 'three';
import qrcode from 'qrcode-generator';
import { P } from './palette.js';
import { text, roundRect } from '../core/ui.js';

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

/** The framed photo card (landscape): photo on the left, name / score / prize / QR on the right. */
/**
 * qr: { link, lines, footer } — what the QR in the corner does:
 *   the photo's download link (when the upload worked), or the FDC booking link.
 * qr: { waiting: true } shows "Menyiapkan QR..." while the photo uploads.
 */
export function drawPhotoCard(c, W, H, { photo, name, score, place, plays, prize, qr, eventName = 'FDC Fest' }) {
  // frame
  c.fillStyle = '#ffffff';
  roundRect(c, 4, 4, W - 8, H - 8, H * 0.05);
  c.fill();
  c.lineWidth = 10;
  c.strokeStyle = P.pinkDeep;
  c.stroke();
  // header band
  const g = c.createLinearGradient(0, 0, W, 0);
  g.addColorStop(0, P.mintDeep);
  g.addColorStop(1, '#3f9c7e');
  c.fillStyle = g;
  roundRect(c, 12, 12, W - 24, H * 0.12, H * 0.035);
  c.fill();
  text(c, 'FDC Dental Clinic', W * 0.04, H * 0.095, { size: H * 0.06, weight: 900, color: '#ffffff' });
  text(c, `${eventName} · FDC Dentist VR`, W - W * 0.04, H * 0.095, { size: H * 0.042, weight: 800, color: '#eafff6', align: 'right' });
  // the photo, a little tilted like a polaroid
  const px = W * 0.035;
  const py = H * 0.17;
  const pw = W * 0.57;
  const ph = pw * (PH / PW);
  c.save();
  c.translate(px + pw / 2, py + ph / 2);
  c.rotate(-0.025);
  c.fillStyle = '#ffffff';
  c.shadowColor = 'rgba(0,0,0,0.25)';
  c.shadowBlur = 18;
  c.fillRect(-pw / 2 - 10, -ph / 2 - 10, pw + 20, ph + 20);
  c.shadowBlur = 0;
  if (photo) c.drawImage(photo, -pw / 2, -ph / 2, pw, ph);
  else { c.fillStyle = P.mintSoft; c.fillRect(-pw / 2, -ph / 2, pw, ph); }
  // a little tooth sticker on the corner
  drawToothSticker(c, pw / 2 - H * 0.05, -ph / 2 + H * 0.05, H * 0.055);
  c.restore();
  // right column
  const rx = W * 0.665;
  const rw = W * 0.3;
  text(c, 'Dokter hari ini', rx, H * 0.24, { size: H * 0.04, weight: 700, color: P.muted });
  text(c, name || 'Dokter Tamu', rx, H * 0.32, { size: H * 0.075, weight: 900, color: P.ink, maxWidth: rw });
  text(c, `Skor ${score}`, rx, H * 0.42, { size: H * 0.065, weight: 900, color: '#d9a32c', maxWidth: rw });
  if (place) text(c, `Peringkat #${place} dari ${plays}`, rx, H * 0.49, { size: H * 0.042, weight: 800, color: P.mintDark, maxWidth: rw });
  if (prize) {
    roundRect(c, rx - 6, H * 0.53, rw + 6, H * 0.1, H * 0.03);
    c.fillStyle = P.gold;
    c.fill();
    text(c, `Hadiah: ${prize}`, rx + rw / 2 - 3, H * 0.595, { size: H * 0.04, weight: 900, color: P.ink, align: 'center', maxWidth: rw - 10 });
  }
  // QR
  const qs = H * 0.25;
  const qx = rx;
  const qy = H * 0.66;
  const tx = qx + qs + W * 0.012;
  const tw = W - tx - W * 0.03;
  if (qr?.waiting) {
    c.fillStyle = P.mintSoft;
    roundRect(c, qx, qy, qs, qs, qs * 0.08);
    c.fill();
    text(c, 'QR', qx + qs / 2, qy + qs * 0.45, { size: qs * 0.22, weight: 900, color: P.mintDark, align: 'center' });
    text(c, 'sebentar...', qx + qs / 2, qy + qs * 0.66, { size: qs * 0.11, weight: 700, color: P.muted, align: 'center' });
    ['Menyiapkan', 'link foto...'].forEach((l, i) => text(c, l, tx, qy + qs * (0.4 + i * 0.2), { size: H * 0.033, weight: 800, color: P.mintDark, maxWidth: tw }));
  } else {
    drawQR(c, qr.link, qx, qy, qs);
    qr.lines.forEach((l, i) => text(c, l, tx, qy + qs * (0.3 + i * 0.2), { size: H * 0.033, weight: 800, color: P.pinkDeep, maxWidth: tw }));
  }
  // footer under the photo
  const d = new Date();
  const date = d.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
  text(c, `${qr?.footer || 'Bagikan & tag FDC Dental Clinic'} · ${date}`, px, H * 0.95, { size: H * 0.034, weight: 700, color: P.muted, maxWidth: W * 0.6 });
}

function drawToothSticker(c, x, y, r) {
  c.save();
  c.translate(x, y);
  c.rotate(0.25);
  c.fillStyle = P.pink;
  c.beginPath();
  c.arc(0, 0, r, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = '#ffffff';
  c.beginPath();
  c.moveTo(-r * 0.5, -r * 0.35);
  c.bezierCurveTo(-r * 0.55, -r * 0.75, -r * 0.05, -r * 0.6, 0, -r * 0.45);
  c.bezierCurveTo(r * 0.05, -r * 0.6, r * 0.55, -r * 0.75, r * 0.5, -r * 0.35);
  c.bezierCurveTo(r * 0.45, r * 0.1, r * 0.3, r * 0.6, r * 0.18, r * 0.6);
  c.bezierCurveTo(r * 0.05, r * 0.6, r * 0.08, r * 0.15, 0, r * 0.15);
  c.bezierCurveTo(-r * 0.08, r * 0.15, -r * 0.05, r * 0.6, -r * 0.18, r * 0.6);
  c.bezierCurveTo(-r * 0.3, r * 0.6, -r * 0.45, r * 0.1, -r * 0.5, -r * 0.35);
  c.fill();
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

/** The QR choices for the card. */
export const bookingQR = (link) => ({ link, lines: ['Scan untuk', 'booking di', 'FDC Dental', 'Clinic'], footer: 'Foto layar TV ini, bagikan & tag FDC Dental Clinic' });
export const downloadQR = (link) => ({ link, lines: ['Scan untuk', 'download', 'fotomu!'], footer: 'Scan QR untuk simpan fotomu, bagikan & tag FDC Dental Clinic' });

/**
 * Upload the finished photo card (JPEG) to the booth's Google Drive through the Apps Script web app
 * (see scripts/photo-upload.gs and the README). Resolves to a direct download link, or null when
 * uploading isn't set up, the headset is offline, or it takes longer than 15 s.
 */
export async function uploadCard(canvas, { url, key, name }) {
  if (!url) return null;
  const image = canvas.toDataURL('image/jpeg', 0.88).split(',')[1];
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
