// ドラゴン描画: すべてのパーツが DATA.skeleton の接続点を共有する
import { DATA, part } from './data.js';

const S = DATA.skeleton;
const TAU = Math.PI * 2;

const SIL = { main: '#3b4060', light: '#3b4060', dark: '#2f3350', belly: '#3b4060', accent: '#3b4060', eye: '#3b4060', horn: '#3b4060', hornDark: '#2f3350', sil: true };

export function dragonPalette(g, silhouette = false) {
  if (silhouette) return SIL;
  const c = part('color', g.color);
  const p = g.shiny ? { ...c, ...c.shiny } : { ...c };
  p.horn = '#f6ecd4';
  p.hornDark = '#cdb68a';
  return p;
}

// 描画する大きさの目安（ローカル座標での幅）
export const DRAGON_BASE_SIZE = 230;

// (x, y) を見た目の中心として size 幅で描く
export function drawDragonAt(ctx, g, x, y, size, opts = {}) {
  const s = size / DRAGON_BASE_SIZE;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(opts.flip ? -s : s, s);
  ctx.translate(14, -4);
  drawDragon(ctx, g, opts);
  ctx.restore();
}

export function drawDragon(ctx, g, opts = {}) {
  const { t = 0, level = 1, silhouette = false, speed = 1, shadow = true } = opts;
  const P = {};
  for (const slot of DATA.partSlots) P[slot] = part(slot, g[slot]);
  const pal = dragonPalette(g, silhouette);
  const body = P.body.style;
  const tt = t * speed;
  const flap = Math.sin(tt * 2.2) * 0.16;
  const sway = Math.sin(tt * 1.5) * 0.12;
  const bob = Math.sin(tt * 2 + 0.6) * 1.6;
  const breathe = 1 + Math.sin(tt * 2) * 0.018;
  const sc = 1 + 0.035 * (level - 1);

  ctx.save();
  if (shadow) {
    ctx.fillStyle = 'rgba(40,30,40,0.18)';
    ctx.beginPath();
    ctx.ellipse(-6, S.groundY + 1, 66 * sc, 9 * sc, 0, 0, TAU);
    ctx.fill();
  }
  ctx.translate(0, S.groundY);
  ctx.scale(sc, sc);
  ctx.translate(0, -S.groundY);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  if (level >= 5 && !silhouette) {
    const gr = ctx.createRadialGradient(0, 0, 10, 0, 0, 120);
    gr.addColorStop(0, hexA(pal.light, 0.45));
    gr.addColorStop(1, hexA(pal.light, 0));
    ctx.fillStyle = gr;
    ctx.beginPath();
    ctx.arc(0, 0, 120, 0, TAU);
    ctx.fill();
  }

  drawWing(ctx, P.wings.style, pal, true, flap);
  drawLeg(ctx, S.legs.backFar, body, pal, true);
  drawLeg(ctx, S.legs.frontFar, body, pal, true);
  drawTail(ctx, P.tail.style, pal, sway, tt);
  if (level >= 3) drawRidge(ctx, body, pal, level);
  // 首のつけ根はからだで隠れるように、頭→からだの順
  ctx.save();
  ctx.translate(0, bob);
  drawHorn(ctx, P.horns.style, pal, true);
  drawHorn(ctx, P.horns.style, pal, false);
  drawHead(ctx, body, pal, tt);
  ctx.restore();
  drawTorso(ctx, body, pal, P.pattern.id, breathe);
  drawLeg(ctx, S.legs.back, body, pal, false);
  drawLeg(ctx, S.legs.front, body, pal, false);

  drawWing(ctx, P.wings.style, pal, false, flap);
  ctx.restore();
}

function hexA(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

function outlineFill(ctx, pal, fill, width = 4.5) {
  ctx.lineWidth = width;
  ctx.strokeStyle = pal.dark;
  ctx.stroke();
  ctx.fillStyle = fill;
  ctx.fill();
}

function softGrad(ctx, pal, cx, cy, r) {
  if (pal.sil) return pal.main;
  const g = ctx.createRadialGradient(cx - r * 0.35, cy - r * 0.45, r * 0.1, cx, cy, r * 1.15);
  g.addColorStop(0, pal.light);
  g.addColorStop(0.55, pal.main);
  g.addColorStop(1, pal.dark);
  return g;
}

// ---------- からだ ----------
function torsoPath(ctx, b, breathe = 1) {
  ctx.beginPath();
  ctx.ellipse(S.torso.x, S.torso.y, b.rx, b.ry * breathe, 0, 0, TAU);
}

function drawTorso(ctx, b, pal, pattern, breathe) {
  const { x, y } = S.torso;
  torsoPath(ctx, b, breathe);
  outlineFill(ctx, pal, softGrad(ctx, pal, x, y, b.rx));
  if (pal.sil) return;
  ctx.save();
  torsoPath(ctx, b, breathe);
  ctx.clip();
  ctx.fillStyle = pal.belly;
  ctx.globalAlpha = 0.85;
  ctx.beginPath();
  ctx.ellipse(x + b.rx * 0.3, y + b.ry * 0.55, b.rx * 0.55, b.ry * 0.5, 0, 0, TAU);
  ctx.fill();
  ctx.globalAlpha = 1;
  drawPattern(ctx, pattern, b, pal);
  ctx.restore();
}

function drawPattern(ctx, id, b, pal) {
  const { x, y } = S.torso;
  const { rx, ry } = b;
  ctx.fillStyle = pal.accent;
  ctx.strokeStyle = pal.accent;
  if (id === 'spots') {
    ctx.globalAlpha = 0.5;
    for (const [px, py, pr] of [[-0.45, -0.45, 0.22], [0.08, -0.62, 0.16], [-0.78, 0.05, 0.14], [0.4, -0.25, 0.12], [-0.18, -0.08, 0.1]]) {
      ctx.beginPath();
      ctx.ellipse(x + px * rx, y + py * ry, pr * ry * 1.25, pr * ry, 0, 0, TAU);
      ctx.fill();
    }
  } else if (id === 'stripes') {
    ctx.globalAlpha = 0.45;
    ctx.lineWidth = 7;
    for (let i = 0; i < 4; i++) {
      const sx = x - rx * 0.62 + i * rx * 0.34;
      ctx.beginPath();
      ctx.moveTo(sx + 4, y - ry);
      ctx.quadraticCurveTo(sx - 4, y - ry * 0.4, sx - 2, y + ry * 0.05);
      ctx.stroke();
    }
  } else if (id === 'belly') {
    ctx.globalAlpha = 1;
    ctx.fillStyle = pal.belly;
    ctx.beginPath();
    ctx.ellipse(x + rx * 0.25, y + ry * 0.5, rx * 0.72, ry * 0.58, 0, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = 0.35;
    ctx.lineWidth = 2;
    for (let i = 0; i < 4; i++) {
      const ly = y + ry * (0.05 + i * 0.22);
      ctx.beginPath();
      ctx.moveTo(x - rx * 0.4, ly);
      ctx.quadraticCurveTo(x + rx * 0.25, ly + 6, x + rx * 0.95, ly);
      ctx.stroke();
    }
  } else if (id === 'scales') {
    ctx.globalAlpha = 0.45;
    ctx.lineWidth = 1.8;
    for (let row = 0; row < 3; row++) {
      const sy = y - ry * 0.78 + row * ry * 0.3;
      for (let sx = x - rx + (row % 2) * 6; sx < x + rx * 0.6; sx += 12) {
        ctx.beginPath();
        ctx.arc(sx, sy, 5.5, 0.15, Math.PI - 0.15);
        ctx.stroke();
      }
    }
  }
  ctx.globalAlpha = 1;
}

function drawRidge(ctx, b, pal, level) {
  const size = level >= 5 ? 11 : 8;
  ctx.fillStyle = pal.sil ? pal.main : pal.accent;
  ctx.strokeStyle = pal.dark;
  ctx.lineWidth = 2;
  for (let i = 0; i < 5; i++) {
    const px = S.ridge.from + (i * (S.ridge.to - S.ridge.from)) / 4;
    const k = Math.max(0, 1 - (px / b.rx) ** 2);
    const py = S.torso.y - b.ry * Math.sqrt(k) + 3;
    ctx.beginPath();
    ctx.moveTo(px - size * 0.6, py + 2);
    ctx.lineTo(px - size * 0.25, py - size);
    ctx.lineTo(px + size * 0.6, py + 2);
    ctx.closePath();
    ctx.stroke();
    ctx.fill();
  }
}

function drawLeg(ctx, lx, b, pal, far) {
  const w = b.legW * (far ? 0.9 : 1);
  const top = S.torso.y + b.ry * 0.5;
  const bottom = S.groundY - (far ? 2 : 0);
  ctx.beginPath();
  roundRectPath(ctx, lx - w / 2, top, w, bottom - top, w / 2);
  ctx.moveTo(lx + w * 1.1, bottom - 4);
  ctx.ellipse(lx + w * 0.25, bottom - 4, w * 0.85, 5.5, 0, 0, TAU);
  const fill = far ? pal.dark : pal.main;
  outlineFill(ctx, pal, fill, 4);
  if (!pal.sil && !far) {
    ctx.fillStyle = pal.belly;
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.arc(lx + w * 0.55 + i * 3.2 - 3, bottom - 2.2, 1.6, 0, TAU);
      ctx.fill();
    }
  }
}

function roundRectPath(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// ---------- 頭 ----------
function headPath(ctx, b) {
  const H = S.head;
  const r = b.headR;
  ctx.beginPath();
  // 首
  ctx.moveTo(S.neckBack.x, S.neckBack.y);
  ctx.quadraticCurveTo(S.neckBack.x + 18, S.neckBack.y - 16, H.x - r * 0.75, H.y - 2);
  ctx.lineTo(H.x + 2, H.y + r * 0.7);
  ctx.quadraticCurveTo(S.neckFront.x + 8, S.neckFront.y - 12, S.neckFront.x, S.neckFront.y);
  ctx.closePath();
  // 頭と鼻先
  ctx.moveTo(H.x + r * 1.05, H.y);
  ctx.ellipse(H.x, H.y, r * 1.05, r * 0.92, 0, 0, TAU);
  const sx = H.x + r * 0.72 + b.snout * 0.35;
  const sy = H.y + r * 0.28;
  const srx = r * 0.42 + b.snout * 0.55;
  ctx.moveTo(sx + srx, sy);
  ctx.ellipse(sx, sy, srx, r * 0.5, 0, 0, TAU);
  return { sx, sy, srx };
}

function drawHead(ctx, b, pal, t) {
  const H = S.head;
  const r = b.headR;
  headPath(ctx, b);
  ctx.lineWidth = 4.5;
  ctx.strokeStyle = pal.dark;
  ctx.stroke();
  ctx.fillStyle = softGrad(ctx, pal, H.x, H.y, r * 1.2);
  const sn = headPath(ctx, b);
  ctx.fill('nonzero');
  if (pal.sil) return;
  // ほっぺ
  ctx.fillStyle = 'rgba(255,140,150,0.35)';
  ctx.beginPath();
  ctx.ellipse(S.eye.x - 2, S.eye.y + r * 0.55, 6, 3.5, 0, 0, TAU);
  ctx.fill();
  // 鼻の穴と口
  ctx.fillStyle = pal.dark;
  ctx.beginPath();
  ctx.arc(sn.sx + sn.srx * 0.6, sn.sy - r * 0.18, 1.8, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = pal.dark;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(sn.sx - sn.srx * 0.3, sn.sy + r * 0.2);
  ctx.quadraticCurveTo(sn.sx + sn.srx * 0.2, sn.sy + r * 0.32, sn.sx + sn.srx * 0.7, sn.sy + r * 0.14);
  ctx.stroke();
  // 目（ときどきまばたき）
  const blink = (t % 4.2) > 4.05 ? 0.15 : 1;
  ctx.fillStyle = pal.eye;
  ctx.beginPath();
  ctx.ellipse(S.eye.x, S.eye.y, 4.6, 5.8 * blink, 0, 0, TAU);
  ctx.fill();
  if (blink === 1) {
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(S.eye.x + 1.5, S.eye.y - 2, 1.8, 0, TAU);
    ctx.fill();
  }
}

// ---------- つの ----------
function drawHorn(ctx, st, pal, far) {
  const base = far ? S.hornBaseFar : S.hornBase;
  ctx.save();
  ctx.translate(base.x, base.y);
  ctx.rotate(far ? -0.5 : -0.25);
  if (far) ctx.scale(0.85, 0.85);
  const fill = far ? pal.hornDark : pal.horn;
  const strokePal = { dark: pal.sil ? pal.dark : '#a8916a' };
  spikePath(ctx, st.len, st.w, st.bend);
  outlineFill(ctx, strokePal, fill, 3.5);
  if (st.kind === 'antler') {
    for (const [tx, ty, rot, k] of [[0.2, -0.42, 0.9, 0.42], [-0.1, -0.72, 0.8, 0.32]]) {
      ctx.save();
      ctx.translate(tx * st.len - st.bend * st.len * Math.abs(ty) * 0.6, ty * st.len);
      ctx.rotate(rot);
      spikePath(ctx, st.len * k, st.w * 0.7, 0.1);
      outlineFill(ctx, strokePal, fill, 3);
      ctx.restore();
    }
    spikePath(ctx, st.len, st.w, st.bend);
    ctx.fillStyle = fill;
    ctx.fill();
  }
  ctx.restore();
}

function spikePath(ctx, L, w, bend) {
  ctx.beginPath();
  ctx.moveTo(-w / 2, 6);
  ctx.quadraticCurveTo(-w / 2 - bend * L * 0.18, -L * 0.55, -bend * L * 0.6, -L);
  ctx.quadraticCurveTo(w / 2 - bend * L * 0.3, -L * 0.45, w / 2, 6);
  ctx.closePath();
}

// ---------- つばさ ----------
function drawWing(ctx, st, pal, far, flap) {
  const root = far ? S.wingRootFar : S.wingRoot;
  ctx.save();
  ctx.translate(root.x, root.y);
  ctx.rotate(far ? flap * 0.7 - 0.12 : -flap);
  if (far) ctx.scale(0.85, 0.85);
  const fill = pal.sil ? pal.main : far ? pal.main : pal.light;
  const bone = far ? pal.dark : pal.main;
  const span = st.span;
  if (st.kind === 'membrane') {
    const h = st.h;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(-span * 0.02, -h * 0.7, -span * 0.22, -h);
    ctx.quadraticCurveTo(-span * 0.65, -h * 1.02, -span, -h * 0.5);
    ctx.quadraticCurveTo(-span * 0.78, -h * 0.42, -span * 0.66, -h * 0.12);
    ctx.quadraticCurveTo(-span * 0.5, -h * 0.25, -span * 0.32, -h * 0.02);
    ctx.quadraticCurveTo(-span * 0.18, -h * 0.1, 0, 4);
    ctx.closePath();
    outlineFill(ctx, pal, fill, 3.5);
    ctx.strokeStyle = bone;
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(-span * 0.02, -h * 0.7, -span * 0.22, -h);
    ctx.quadraticCurveTo(-span * 0.65, -h * 1.02, -span, -h * 0.5);
    ctx.stroke();
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(-span * 0.22, -h);
    ctx.lineTo(-span * 0.66, -h * 0.12);
    ctx.moveTo(-span * 0.22, -h);
    ctx.lineTo(-span * 0.32, -h * 0.02);
    ctx.stroke();
  } else if (st.kind === 'feather') {
    for (let i = 4; i >= 0; i--) {
      const a = -1.7 - i * 0.3;
      const L = span * (0.62 + 0.1 * i);
      ctx.save();
      ctx.rotate(a);
      ctx.beginPath();
      ctx.ellipse(L / 2, 0, L / 2, 8, 0, 0, TAU);
      outlineFill(ctx, pal, i % 2 ? fill : pal.sil ? pal.main : pal.belly, 3);
      ctx.restore();
    }
    ctx.beginPath();
    ctx.ellipse(-4, -8, 11, 13, 0, 0, TAU);
    outlineFill(ctx, pal, pal.main, 3);
  } else if (st.kind === 'leaf') {
    const leaves = [[-1.85, 1], [-2.3, 0.85], [-2.75, 0.68]];
    for (let i = leaves.length - 1; i >= 0; i--) {
      const [a, k] = leaves[i];
      const L = span * k;
      ctx.save();
      ctx.rotate(a);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(L * 0.5, -L * 0.32, L, 0);
      ctx.quadraticCurveTo(L * 0.5, L * 0.32, 0, 0);
      outlineFill(ctx, pal, i === 0 ? fill : pal.main, 3);
      if (!pal.sil) {
        ctx.strokeStyle = pal.dark;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(2, 0);
        ctx.lineTo(L * 0.85, 0);
        ctx.stroke();
      }
      ctx.restore();
    }
  } else if (st.kind === 'fin') {
    const a0 = -1.6, a1 = -2.95, n = 4;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    for (let i = 0; i <= n; i++) {
      const a = a0 + ((a1 - a0) * i) / n;
      const L = span * (1 - i * 0.1);
      const px = Math.cos(a) * L, py = Math.sin(a) * L;
      if (i === 0) ctx.lineTo(px, py);
      else {
        const am = a0 + ((a1 - a0) * (i - 0.5)) / n;
        const Lm = L * 0.8;
        ctx.quadraticCurveTo(Math.cos(am) * Lm, Math.sin(am) * Lm, px, py);
      }
    }
    ctx.closePath();
    ctx.globalAlpha = pal.sil ? 1 : 0.9;
    outlineFill(ctx, pal, fill, 3);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = bone;
    ctx.lineWidth = 2;
    for (let i = 0; i <= n; i++) {
      const a = a0 + ((a1 - a0) * i) / n;
      const L = span * (1 - i * 0.1) * 0.95;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(Math.cos(a) * L, Math.sin(a) * L);
      ctx.stroke();
    }
  }
  ctx.restore();
}

// ---------- しっぽ ----------
function cubic(p0, p1, p2, p3, t) {
  const u = 1 - t;
  return {
    x: u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x,
    y: u * u * u * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * p3.y,
  };
}

function drawTail(ctx, st, pal, sway, t) {
  ctx.save();
  ctx.translate(S.tailRoot.x, S.tailRoot.y);
  ctx.rotate(sway);
  const L = st.len, w = st.w;
  const p0 = { x: 16, y: -6 }, p1 = { x: -L * 0.4, y: 10 }, p2 = { x: -L * 0.85, y: 6 }, p3 = { x: -L, y: -st.curl };
  const N = 18;
  const left = [], right = [];
  let pts = [];
  for (let i = 0; i <= N; i++) pts.push(cubic(p0, p1, p2, p3, i / N));
  for (let i = 0; i <= N; i++) {
    const a = pts[Math.max(0, i - 1)], c = pts[Math.min(N, i + 1)];
    const dx = c.x - a.x, dy = c.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len, ny = dx / len;
    const ww = (w * (1 - (i / N) * 0.75)) / 2;
    left.push({ x: pts[i].x + nx * ww, y: pts[i].y + ny * ww });
    right.push({ x: pts[i].x - nx * ww, y: pts[i].y - ny * ww });
  }
  const tip = pts[N];
  const dir = Math.atan2(pts[N].y - pts[N - 2].y, pts[N].x - pts[N - 2].x);
  // 先っぽの飾りはしっぽの後ろに
  if (st.tip !== 'plain') drawTailTip(ctx, st.tip, tip, dir, pal, t);
  ctx.beginPath();
  ctx.moveTo(left[0].x, left[0].y);
  for (const p of left) ctx.lineTo(p.x, p.y);
  ctx.arc(tip.x, tip.y, (w * 0.25) / 2, dir - Math.PI / 2, dir + Math.PI / 2);
  for (let i = right.length - 1; i >= 0; i--) ctx.lineTo(right[i].x, right[i].y);
  ctx.closePath();
  outlineFill(ctx, pal, softGrad(ctx, pal, -L * 0.4, 0, L * 0.6));
  ctx.restore();
}

function drawTailTip(ctx, kind, p, dir, pal, t) {
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(dir);
  if (kind === 'leaf') {
    ctx.beginPath();
    ctx.moveTo(-4, 0);
    ctx.quadraticCurveTo(10, -11, 24, 0);
    ctx.quadraticCurveTo(10, 11, -4, 0);
    outlineFill(ctx, pal, pal.light, 3);
  } else if (kind === 'fin') {
    ctx.beginPath();
    ctx.moveTo(-6, 0);
    ctx.quadraticCurveTo(8, -20, 22, -18);
    ctx.quadraticCurveTo(12, 0, 22, 18);
    ctx.quadraticCurveTo(8, 20, -6, 0);
    outlineFill(ctx, pal, pal.light, 3);
  } else if (kind === 'club') {
    ctx.beginPath();
    for (let i = 0; i < 4; i++) {
      const a = -1.2 + i * 0.8;
      ctx.moveTo(4 + Math.cos(a - 0.3) * 8, Math.sin(a - 0.3) * 8);
      ctx.lineTo(4 + Math.cos(a) * 17, Math.sin(a) * 17);
      ctx.lineTo(4 + Math.cos(a + 0.3) * 8, Math.sin(a + 0.3) * 8);
    }
    outlineFill(ctx, { dark: pal.sil ? pal.dark : '#a8916a' }, pal.horn, 2.5);
    ctx.beginPath();
    ctx.arc(4, 0, 9, 0, TAU);
    outlineFill(ctx, pal, pal.main, 3);
  } else if (kind === 'flame') {
    const f = Math.sin(t * 9) * 2.5;
    const layers = pal.sil ? [[pal.main, 1]] : [['#ff7a3d', 1], ['#ffc65a', 0.65], ['#fff3b0', 0.35]];
    for (const [col, k] of layers) {
      ctx.beginPath();
      ctx.moveTo(-4, -9 * k);
      ctx.quadraticCurveTo(14 * k, -16 * k - f, 28 * k + f, -2);
      ctx.quadraticCurveTo(16 * k, 2, 22 * k, 10 * k + f);
      ctx.quadraticCurveTo(6, 14 * k, -4, 9 * k);
      ctx.closePath();
      ctx.fillStyle = col;
      ctx.fill();
    }
  }
  ctx.restore();
}
