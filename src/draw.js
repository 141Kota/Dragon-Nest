// 共通の描画部品（文字・ボタン・卵・ゴブリン・アイコン・施設）
import { DATA } from './data.js';
import { W } from './ui.js';

const TAU = Math.PI * 2;
export const FONT = '"Hiragino Maru Gothic ProN", "Hiragino Sans", "Rounded Mplus 1c", "Noto Sans JP", sans-serif';
export const INK = '#4a3b47';

export function rr(ctx, x, y, w, h, r) {
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function text(ctx, str, x, y, o = {}) {
  ctx.font = `${o.weight || 'bold'} ${o.size || 16}px ${FONT}`;
  ctx.textAlign = o.align || 'left';
  ctx.textBaseline = o.baseline || 'middle';
  if (o.stroke) {
    ctx.lineJoin = 'round';
    ctx.lineWidth = o.strokeW || 4;
    ctx.strokeStyle = o.stroke;
    ctx.strokeText(str, x, y);
  }
  ctx.fillStyle = o.color || INK;
  ctx.fillText(str, x, y);
}

// 長い文を幅で折り返して描く。戻り値は使った高さ
export function wrapText(ctx, str, x, y, maxW, o = {}) {
  const size = o.size || 15;
  const lh = o.lineH || size * 1.45;
  ctx.font = `${o.weight || 'bold'} ${size}px ${FONT}`;
  const lines = [];
  for (const para of String(str).split('\n')) {
    let line = '';
    for (const ch of para) {
      if (ctx.measureText(line + ch).width > maxW && line) { lines.push(line); line = ch; } else line += ch;
    }
    lines.push(line);
  }
  lines.forEach((l, i) => text(ctx, l, x, y + i * lh, { ...o, size }));
  return lines.length * lh;
}

export function panel(ctx, x, y, w, h, o = {}) {
  ctx.save();
  if (o.shadow !== false) {
    ctx.fillStyle = 'rgba(60,40,50,0.16)';
    rr(ctx, x, y + (o.depth || 4), w, h, o.r ?? 18);
    ctx.fill();
  }
  rr(ctx, x, y, w, h, o.r ?? 18);
  ctx.fillStyle = o.fill || '#fffaf0';
  ctx.fill();
  if (o.stroke !== false) {
    ctx.lineWidth = o.lineW || 2;
    ctx.strokeStyle = o.stroke || 'rgba(120,90,80,0.18)';
    ctx.stroke();
  }
  ctx.restore();
}

function shade(hex, k) {
  const n = parseInt(hex.slice(1), 16);
  const f = (c) => Math.max(0, Math.min(255, Math.round(k > 0 ? c + (255 - c) * k : c * (1 + k))));
  return `rgb(${f((n >> 16) & 255)},${f((n >> 8) & 255)},${f(n & 255)})`;
}

// ぷっくりしたボタン
export function button(ui, x, y, w, h, label, onTap, o = {}) {
  const ctx = ui.ctx;
  const col = o.disabled ? '#c9c0bd' : o.color || '#f2a65a';
  ctx.save();
  ctx.fillStyle = shade(col, -0.25);
  rr(ctx, x, y + 4, w, h, o.r ?? h / 2.4);
  ctx.fill();
  const g = ctx.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, shade(col, 0.25));
  g.addColorStop(1, col);
  ctx.fillStyle = g;
  rr(ctx, x, y, w, h, o.r ?? h / 2.4);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  rr(ctx, x + 8, y + 4, w - 16, h * 0.32, h * 0.16);
  ctx.fill();
  const tc = o.textColor || '#fff';
  const stroke = o.disabled ? null : shade(col, -0.35);
  if (o.sub) {
    text(ctx, label, x + w / 2, y + h * 0.38, { size: o.size || 18, align: 'center', color: tc, stroke, strokeW: 3 });
    text(ctx, o.sub, x + w / 2, y + h * 0.74, { size: o.subSize || 11, align: 'center', color: tc, stroke, strokeW: 3 });
  } else {
    text(ctx, label, x + w / 2, y + h / 2 + 1, { size: o.size || 18, align: 'center', color: tc, stroke, strokeW: 3 });
  }
  ctx.restore();
  if (!o.disabled && onTap) ui.hit(x, y, w, h + 4, onTap, o.clip);
  else if (o.onDisabled) ui.hit(x, y, w, h + 4, o.onDisabled, o.clip);
}

export function bar(ctx, x, y, w, h, ratio, col, back = 'rgba(80,60,60,0.15)') {
  rr(ctx, x, y, w, h, h / 2);
  ctx.fillStyle = back;
  ctx.fill();
  if (ratio > 0) {
    rr(ctx, x, y, Math.max(h, w * Math.min(1, ratio)), h, h / 2);
    ctx.fillStyle = col;
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    rr(ctx, x + 3, y + 2, Math.max(0, w * Math.min(1, ratio) - 6), h * 0.35, h * 0.2);
    ctx.fill();
  }
}

export function shadowEllipse(ctx, x, y, rx, ry, a = 0.18) {
  ctx.fillStyle = `rgba(50,30,40,${a})`;
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, TAU);
  ctx.fill();
}

export function sparkle(ctx, x, y, r, col = '#fff6b0', rot = 0) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.fillStyle = col;
  ctx.beginPath();
  for (let i = 0; i < 4; i++) {
    const a = (i * TAU) / 4;
    ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    ctx.lineTo(Math.cos(a + TAU / 8) * r * 0.28, Math.sin(a + TAU / 8) * r * 0.28);
  }
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

export function formatTime(sec) {
  sec = Math.ceil(sec);
  const m = Math.floor(sec / 60), s = sec % 60;
  return m > 0 ? `${m}分${String(s).padStart(2, '0')}秒` : `${s}秒`;
}

// ---------- 卵 ----------
export function drawEgg(ctx, eggId, x, y, h, o = {}) {
  const e = DATA.eggs[eggId];
  const w = h * 0.78;
  ctx.save();
  if (o.shadow !== false) shadowEllipse(ctx, x, y + h * 0.48, w * 0.55, h * 0.1);
  ctx.translate(x, y + h * 0.45);
  ctx.rotate(o.wobble || 0);
  ctx.translate(0, -h * 0.45);
  if (o.glow) {
    const g = ctx.createRadialGradient(0, 0, h * 0.2, 0, 0, h * 0.9);
    g.addColorStop(0, `rgba(255,240,170,${0.6 * o.glow})`);
    g.addColorStop(1, 'rgba(255,240,170,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, h * 0.9, 0, TAU);
    ctx.fill();
  }
  const path = () => {
    ctx.beginPath();
    ctx.moveTo(0, -h / 2);
    ctx.bezierCurveTo(w * 0.55, -h / 2, w * 0.55, h * 0.45, 0, h / 2);
    ctx.bezierCurveTo(-w * 0.55, h * 0.45, -w * 0.55, -h / 2, 0, -h / 2);
  };
  path();
  if (o.silhouette) {
    ctx.fillStyle = '#3b4060';
    ctx.fill();
    ctx.restore();
    return;
  }
  const g = ctx.createRadialGradient(-w * 0.2, -h * 0.2, h * 0.05, 0, 0, h * 0.62);
  g.addColorStop(0, '#ffffff');
  g.addColorStop(0.35, e.shell);
  g.addColorStop(1, e.shellDark);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.save();
  path();
  ctx.clip();
  ctx.fillStyle = e.mark;
  ctx.strokeStyle = e.mark;
  if (e.pattern === 'spots') {
    for (const [px, py, r] of [[-0.18, -0.2, 0.09], [0.15, -0.05, 0.07], [-0.08, 0.18, 0.08], [0.2, 0.25, 0.05], [0.02, -0.36, 0.05]]) {
      ctx.beginPath();
      ctx.arc(px * w * 1.4, py * h, r * h, 0, TAU);
      ctx.fill();
    }
  } else if (e.pattern === 'stripes') {
    ctx.lineWidth = h * 0.07;
    for (const py of [-0.12, 0.12]) {
      ctx.beginPath();
      ctx.moveTo(-w, py * h);
      ctx.quadraticCurveTo(0, py * h + h * 0.08, w, py * h);
      ctx.stroke();
    }
  } else if (e.pattern === 'zigzag') {
    ctx.lineWidth = h * 0.06;
    ctx.beginPath();
    for (let i = 0; i <= 8; i++) ctx.lineTo(-w / 2 + (i * w) / 8, (i % 2 ? -0.02 : 0.08) * h);
    ctx.stroke();
  } else if (e.pattern === 'stars') {
    for (const [px, py, r] of [[-0.15, -0.15, 0.1], [0.18, 0.05, 0.08], [-0.05, 0.25, 0.07], [0.1, -0.33, 0.05]]) sparkle(ctx, px * w * 1.4, py * h, r * h, e.mark);
  }
  ctx.restore();
  if (o.crack) {
    ctx.strokeStyle = 'rgba(80,50,40,0.75)';
    ctx.lineWidth = Math.max(1.5, h * 0.03);
    ctx.beginPath();
    const n = Math.ceil(o.crack * 6);
    ctx.moveTo(-w * 0.4, -h * 0.02);
    for (let i = 1; i <= n; i++) ctx.lineTo(-w * 0.4 + (i * w * 0.8) / 6, (i % 2 ? -0.1 : 0.04) * h);
    ctx.stroke();
  }
  path();
  ctx.lineWidth = Math.max(1.5, h * 0.035);
  ctx.strokeStyle = 'rgba(90,60,60,0.35)';
  ctx.stroke();
  ctx.restore();
}

export function rarityStars(ctx, eggId, x, y, size = 10) {
  const n = DATA.rarities[DATA.eggs[eggId].rarity].stars;
  for (let i = 0; i < n; i++) sparkle(ctx, x + (i - (n - 1) / 2) * size * 1.6, y, size * 0.7, '#f2b33d');
}

// ---------- ゴブリン ----------
export function drawGoblin(ctx, gob, x, y, size, o = {}) {
  const L = gob.look;
  const t = o.t || 0;
  const s = (size / 100) * L.size;
  ctx.save();
  shadowEllipse(ctx, x, y + 46 * s, 42 * s, 9 * s);
  ctx.translate(x + (o.shake ? Math.sin(t * 60) * 4 : 0), y + Math.sin(t * 4) * 2 * s);
  ctx.scale(s * (o.flip ? -1 : 1), s);
  ctx.lineJoin = 'round';
  const out = (fill, lw = 4) => { ctx.lineWidth = lw; ctx.strokeStyle = '#3d3a2a'; ctx.stroke(); ctx.fillStyle = fill; ctx.fill(); };
  // 足
  for (const fx of [-16, 14]) {
    ctx.beginPath();
    ctx.ellipse(fx, 42, 12, 7, 0, 0, TAU);
    out(L.skinDark);
  }
  // からだ（服）
  ctx.beginPath();
  ctx.moveTo(-30, 40);
  ctx.quadraticCurveTo(-34, 0, 0, -4);
  ctx.quadraticCurveTo(34, 0, 30, 40);
  ctx.closePath();
  out(L.cloth);
  // 耳
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(side * 22, -34);
    ctx.quadraticCurveTo(side * (44 + 14 * L.ear), -48 - 6 * L.ear, side * (52 + 12 * L.ear), -30 + Math.sin(t * 5 + side) * 3);
    ctx.quadraticCurveTo(side * 38, -22, side * 22, -20);
    ctx.closePath();
    out(L.skin);
  }
  // 頭
  ctx.beginPath();
  ctx.ellipse(0, -28, 28, 25, 0, 0, TAU);
  out(L.skin);
  if (L.hood) {
    ctx.beginPath();
    ctx.ellipse(0, -36, 30, 20, 0, Math.PI, TAU);
    ctx.quadraticCurveTo(10, -66, -14, -60);
    ctx.closePath();
    out(L.cloth, 3.5);
  } else {
    ctx.fillStyle = L.skinDark;
    ctx.beginPath();
    ctx.ellipse(0, -46, 12, 5, 0, 0, TAU);
    ctx.fill();
  }
  // 顔
  const hurt = o.hurt;
  ctx.fillStyle = '#2b2620';
  for (const ex of [-10, 10]) {
    ctx.beginPath();
    if (hurt) { ctx.lineWidth = 3; ctx.strokeStyle = '#2b2620'; ctx.moveTo(ex - 5, -32); ctx.lineTo(ex + 5, -26); ctx.moveTo(ex + 5, -32); ctx.lineTo(ex - 5, -26); ctx.stroke(); } else { ctx.ellipse(ex, -29, 4, 5.5, 0, 0, TAU); ctx.fill(); }
  }
  ctx.fillStyle = '#fff';
  if (!hurt) for (const ex of [-9, 11]) { ctx.beginPath(); ctx.arc(ex, -31, 1.6, 0, TAU); ctx.fill(); }
  ctx.beginPath();
  ctx.ellipse(0, -19, 7, 5, 0, 0, TAU);
  out(L.skinDark, 2.5);
  ctx.strokeStyle = '#2b2620';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(-9, -9);
  ctx.quadraticCurveTo(0, hurt ? -12 : -4, 9, -9);
  ctx.stroke();
  // 卵をかかえる
  if (o.egg) drawEgg(ctx, o.egg, 0, 14, 40, { shadow: false, wobble: Math.sin(t * 6) * 0.08 });
  // うで
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(side * 18, 18, 9, 7, side * 0.6, 0, TAU);
    out(L.skin, 3);
  }
  ctx.restore();
}

// ---------- アイコン ----------
export function iconShard(ctx, x, y, r) {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = '#ffd86b';
  ctx.strokeStyle = '#d69a2d';
  ctx.lineWidth = Math.max(1.5, r * 0.18);
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * TAU) / 10;
    const rr2 = i % 2 ? r * 0.48 : r;
    ctx.lineTo(Math.cos(a) * rr2, Math.sin(a) * rr2);
  }
  ctx.closePath();
  ctx.stroke();
  ctx.fill();
  ctx.restore();
}

export function iconStone(ctx, x, y, r, t = 0) {
  ctx.save();
  ctx.translate(x, y);
  const g = ctx.createRadialGradient(-r * 0.3, -r * 0.3, r * 0.1, 0, 0, r);
  g.addColorStop(0, '#ffe2c4');
  g.addColorStop(0.5, '#ff9e6b');
  g.addColorStop(1, '#d9573a');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(0, 0, r, r * 0.82, 0, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = 'rgba(150,50,30,0.5)';
  ctx.lineWidth = Math.max(1.2, r * 0.12);
  ctx.stroke();
  ctx.strokeStyle = `rgba(255,255,255,${0.5 + 0.3 * Math.sin(t * 3)})`;
  ctx.beginPath();
  ctx.moveTo(-r * 0.2, -r * 0.1);
  ctx.quadraticCurveTo(0, -r * 0.5, r * 0.2, -r * 0.1);
  ctx.stroke();
  ctx.restore();
}

// ---------- 拠点の部品 ----------
export function drawNest(ctx, x, y, s, o = {}) {
  shadowEllipse(ctx, x, y + 6 * s, 40 * s, 12 * s, 0.2);
  const g = ctx.createLinearGradient(0, y - 14 * s, 0, y + 12 * s);
  g.addColorStop(0, '#d9b077');
  g.addColorStop(1, '#a37a46');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(x, y, 38 * s, 15 * s, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#7a5a33';
  ctx.beginPath();
  ctx.ellipse(x, y - 3 * s, 27 * s, 8 * s, 0, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,240,200,0.6)';
  ctx.lineWidth = 2;
  for (let i = 0; i < 7; i++) {
    const a = Math.PI * 0.1 + (i * Math.PI * 0.8) / 6;
    ctx.beginPath();
    ctx.ellipse(x, y - 1, 33 * s, 11 * s, 0, a, a + 0.25);
    ctx.stroke();
  }
  if (o.highlight) {
    ctx.strokeStyle = `rgba(255,255,255,${o.highlight})`;
    ctx.lineWidth = 3;
    ctx.setLineDash([6, 6]);
    ctx.beginPath();
    ctx.ellipse(x, y - 2, 44 * s, 18 * s, 0, 0, TAU);
    ctx.stroke();
    ctx.setLineDash([]);
  }
}

export function drawFacility(ctx, look, x, y, s, level, t) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  ctx.lineJoin = 'round';
  if (level <= 0) {
    // 建設予定地
    ctx.setLineDash([6, 5]);
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.lineWidth = 2.5;
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.beginPath();
    ctx.ellipse(0, 0, 40, 16, 0, 0, TAU);
    ctx.fill();
    ctx.stroke();
    ctx.setLineDash([]);
    text(ctx, '+', 0, -2, { size: 26, align: 'center', color: '#fff', stroke: 'rgba(80,60,60,0.35)' });
    ctx.restore();
    return;
  }
  shadowEllipse(ctx, 4, 4, 46, 14, 0.22);
  if (look === 'straw') {
    for (let i = 0; i < level + 1; i++) {
      const ox = (i - level / 2) * 30;
      const g = ctx.createLinearGradient(0, -30, 0, 0);
      g.addColorStop(0, '#f6dc8a');
      g.addColorStop(1, '#c99a45');
      ctx.fillStyle = g;
      ctx.strokeStyle = '#9c7432';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(ox - 20, 0);
      ctx.quadraticCurveTo(ox - 18, -32, ox, -34);
      ctx.quadraticCurveTo(ox + 18, -32, ox + 20, 0);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      for (let k = -2; k <= 2; k++) { ctx.moveTo(ox + k * 6, -2); ctx.lineTo(ox + k * 4, -24); }
      ctx.stroke();
    }
  } else if (look === 'hearth') {
    const g = ctx.createLinearGradient(-30, 0, 30, 0);
    g.addColorStop(0, '#c9b5a3');
    g.addColorStop(1, '#8f7766');
    ctx.fillStyle = g;
    ctx.strokeStyle = '#5f4c40';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-30, 2);
    ctx.lineTo(-26, -34);
    ctx.quadraticCurveTo(0, -56 - level * 4, 26, -34);
    ctx.lineTo(30, 2);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#3d2c26';
    rr(ctx, -14, -26, 28, 26, 12);
    ctx.fill();
    const f = Math.sin(t * 8) * 2;
    for (const [col, k] of [['#ff7a3d', 1], ['#ffc65a', 0.6]]) {
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.moveTo(-10 * k, 0);
      ctx.quadraticCurveTo(-12 * k, -14 * k, 0 + f, -22 * k);
      ctx.quadraticCurveTo(12 * k, -14 * k, 10 * k, 0);
      ctx.fill();
    }
    ctx.fillStyle = `rgba(255,255,255,${0.25 + 0.1 * Math.sin(t)})`;
    ctx.beginPath();
    ctx.arc(14 + Math.sin(t) * 3, -60 - level * 4 - ((t * 10) % 20), 6, 0, TAU);
    ctx.fill();
  } else if (look === 'tower') {
    const h = 56 + level * 12;
    ctx.strokeStyle = '#6b4a30';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(-18, 0); ctx.lineTo(-12, -h);
    ctx.moveTo(18, 0); ctx.lineTo(12, -h);
    ctx.moveTo(-16, -h * 0.3); ctx.lineTo(14, -h * 0.6);
    ctx.moveTo(16, -h * 0.3); ctx.lineTo(-14, -h * 0.6);
    ctx.stroke();
    ctx.fillStyle = '#a7774c';
    ctx.strokeStyle = '#6b4a30';
    ctx.lineWidth = 3;
    rr(ctx, -22, -h - 14, 44, 16, 4);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#e8735a';
    ctx.beginPath();
    ctx.moveTo(-26, -h - 14);
    ctx.lineTo(0, -h - 38);
    ctx.lineTo(26, -h - 14);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#ffe28a';
    ctx.beginPath();
    ctx.moveTo(0, -h - 38);
    ctx.lineTo(0, -h - 54);
    ctx.lineTo(16 + Math.sin(t * 3) * 3, -h - 48);
    ctx.lineTo(0, -h - 44);
    ctx.fill();
  }
  // レベルの星
  for (let i = 0; i < level; i++) sparkle(ctx, (i - (level - 1) / 2) * 13, 16, 6, '#ffd86b');
  ctx.restore();
}

export function cloud(ctx, x, y, s, a = 0.85) {
  ctx.fillStyle = `rgba(255,255,255,${a})`;
  ctx.beginPath();
  ctx.ellipse(x, y, 34 * s, 14 * s, 0, 0, TAU);
  ctx.ellipse(x - 20 * s, y + 3 * s, 20 * s, 10 * s, 0, 0, TAU);
  ctx.ellipse(x + 14 * s, y - 8 * s, 20 * s, 14 * s, 0, 0, TAU);
  ctx.fill();
}

export function skyGradient(ctx, H, top, bottom) {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, top);
  g.addColorStop(1, bottom);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}
