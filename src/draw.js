// 共通の描画部品（文字・ボタン・卵・ゴブリン・アイコン・施設）
// 文字はすべて text / textBox を通す。枠に収まらないときは自動で小さくするか折り返す。
import { DATA } from './data.js';
import { W } from './ui.js';

const TAU = Math.PI * 2;
export const FONT = '"Hiragino Sans", "Hiragino Kaku Gothic ProN", "Noto Sans JP", "Yu Gothic", sans-serif';

// 落ち着いた深い色
export const C = {
  bg: '#1b1e25',
  bg2: '#23262e',
  panel: '#2b2e37',
  panel2: '#353843',
  line: 'rgba(255,255,255,0.09)',
  text: '#ece4d4',
  sub: '#a8a093',
  dim: '#7b756c',
  gold: '#d9a24e',
  amber: '#b07a36',
  teal: '#3d7670',
  rust: '#9a4d34',
  plum: '#5d4a72',
  moss: '#566f3e',
  slate: '#4a5060',
  red: '#c45a44',
};
export const INK = C.text;

// ---------- 文字の配置記録（重なり・はみ出しの自動チェック用） ----------
export const LAYOUT = { on: false, texts: [], boxes: [], clips: [] };
export function layoutReset() { LAYOUT.texts = []; LAYOUT.boxes = []; LAYOUT.clips = []; }
export function pushClip(x, y, w, h) { LAYOUT.clips.push({ x, y, w, h }); }
export function popClip() { LAYOUT.clips.pop(); }
export function logBox(x, y, w, h, kind) { if (LAYOUT.on) LAYOUT.boxes.push({ x, y, w, h, kind }); }

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

const fontOf = (size, weight = 'bold') => `${weight} ${size}px ${FONT}`;

export function measure(ctx, str, size, weight) {
  ctx.font = fontOf(size, weight);
  return ctx.measureText(str).width;
}

// 1行の文字。maxW を超えるときは文字を小さくする（最小 minSize）
export function text(ctx, str, x, y, o = {}) {
  str = String(str);
  let size = o.size || 16;
  const min = o.minSize || 9;
  if (o.maxW) while (size > min && measure(ctx, str, size, o.weight) > o.maxW) size -= 0.5;
  ctx.font = fontOf(size, o.weight);
  ctx.textAlign = o.align || 'left';
  ctx.textBaseline = 'middle';
  if (o.stroke) {
    ctx.lineJoin = 'round';
    ctx.lineWidth = o.strokeW || 4;
    ctx.strokeStyle = o.stroke;
    ctx.strokeText(str, x, y);
  }
  ctx.fillStyle = o.color || C.text;
  ctx.fillText(str, x, y);
  if (LAYOUT.on && ctx.globalAlpha > 0.5) {
    const w = ctx.measureText(str).width;
    const x0 = o.align === 'center' ? x - w / 2 : o.align === 'right' ? x - w : x;
    const m = ctx.getTransform();
    const k = m.a / (window.__ui ? window.__ui.pixel : 1);
    const px = (m.e / (window.__ui ? window.__ui.pixel : 1));
    const py = (m.f / (window.__ui ? window.__ui.pixel : 1));
    LAYOUT.texts.push({ str, size: size * k, x0: px + x0 * k, x1: px + (x0 + w) * k, y0: py + (y - size / 2) * k, y1: py + (y + size / 2) * k, free: !!o.free, clip: LAYOUT.clips[LAYOUT.clips.length - 1] || null });
  }
  return size;
}

// 折り返しの行を作る（日本語は1文字ずつ、句読点は行頭に来ないように）
export function wrapLines(ctx, str, maxW, size, weight) {
  ctx.font = fontOf(size, weight);
  const lines = [];
  for (const para of String(str).split('\n')) {
    let line = '';
    for (const ch of para) {
      if (ctx.measureText(line + ch).width > maxW && line && !'、。」）！？'.includes(ch)) { lines.push(line); line = ch; } else line += ch;
    }
    lines.push(line);
  }
  return lines;
}

// 枠（x, y, w, h）の中に文を収める。入らなければ文字を小さくする。戻り値は使った高さ
export function textBox(ctx, str, x, y, w, h, o = {}) {
  let size = o.size || 15;
  const min = o.minSize || 9;
  const lhK = o.lineH || 1.45;
  let lines = wrapLines(ctx, str, w, size, o.weight);
  while (size > min && (lines.length * size * lhK > h || (o.maxLines && lines.length > o.maxLines))) {
    size -= 0.5;
    lines = wrapLines(ctx, str, w, size, o.weight);
  }
  // 最後の行が1〜2文字だけになるときは、少しだけ小さくして前の行に収める
  if (lines.length > 1 && [...lines[lines.length - 1]].length <= 2) {
    for (let s2 = size - 0.5; s2 >= Math.max(min, size - 2); s2 -= 0.5) {
      const l2 = wrapLines(ctx, str, w, s2, o.weight);
      if (l2.length < lines.length) { size = s2; lines = l2; break; }
    }
  }
  const lh = size * lhK;
  const total = lines.length * lh;
  let top = y + lh / 2;
  if (o.valign === 'middle') top = y + (h - total) / 2 + lh / 2;
  const ax = o.align === 'center' ? x + w / 2 : o.align === 'right' ? x + w : x;
  lines.forEach((l, i) => text(ctx, l, ax, top + i * lh, { ...o, size, maxW: w }));
  return total;
}

export function panel(ctx, x, y, w, h, o = {}) {
  ctx.save();
  if (o.shadow !== false) {
    ctx.fillStyle = 'rgba(0,0,0,0.32)';
    rr(ctx, x, y + (o.depth || 4), w, h, o.r ?? 14);
    ctx.fill();
  }
  rr(ctx, x, y, w, h, o.r ?? 14);
  if (o.fill && typeof o.fill !== 'string') ctx.fillStyle = o.fill;
  else if (o.fill) ctx.fillStyle = o.fill;
  else {
    const g = ctx.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, C.panel2);
    g.addColorStop(1, C.panel);
    ctx.fillStyle = g;
  }
  ctx.fill();
  if (o.stroke !== false) {
    ctx.lineWidth = o.lineW || 1.5;
    ctx.strokeStyle = o.stroke || C.line;
    ctx.stroke();
  }
  ctx.restore();
  logBox(x, y, w, h, 'panel');
}

export function shade(hex, k) {
  const n = parseInt(hex.slice(1), 16);
  const f = (c) => Math.max(0, Math.min(255, Math.round(k > 0 ? c + (255 - c) * k : c * (1 + k))));
  return `rgb(${f((n >> 16) & 255)},${f((n >> 8) & 255)},${f(n & 255)})`;
}

export function hexA(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

// ボタン。高さは 44 以上。文字は上下左右に文字の高さの半分以上の余白を取る
export function button(ui, x, y, w, h, label, onTap, o = {}) {
  const ctx = ui.ctx;
  h = Math.max(44, h);
  const col = o.disabled ? '#4a4a50' : o.color || C.amber;
  ctx.save();
  ctx.fillStyle = shade(col, -0.45);
  rr(ctx, x, y + 3, w, h, o.r ?? 12);
  ctx.fill();
  const g = ctx.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, shade(col, 0.12));
  g.addColorStop(1, shade(col, -0.12));
  ctx.fillStyle = g;
  rr(ctx, x, y, w, h, o.r ?? 12);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.14)';
  ctx.lineWidth = 1.2;
  rr(ctx, x + 0.5, y + 0.5, w - 1, h - 1, o.r ?? 12);
  ctx.stroke();
  const tc = o.disabled ? '#8a857c' : o.textColor || '#f6efe2';
  let size = Math.min(o.size || 17, h / 2);
  if (o.sub) {
    // 2行: 上下の余白 + 行間をそれぞれ文字の高さの半分以上
    const sub = Math.min(o.subSize || 11, size * 0.75);
    const total = size + sub;
    size = Math.min(size, (h - (size / 2) * 2 - sub * 0.3 - sub) || size);
    const pad = (h - total - sub * 0.3) / 2;
    const iconW = o.icon ? 24 : 0;
    const cx = x + w / 2 + iconW / 2;
    text(ctx, label, cx, y + pad + size / 2, { size, align: 'center', color: tc, maxW: w - size - iconW });
    text(ctx, o.sub, cx, y + h - pad - sub / 2, { size: sub, align: 'center', color: o.disabled ? tc : 'rgba(246,239,226,0.8)', maxW: w - size - iconW, weight: 'normal' });
    if (o.icon) o.icon(x + w / 2 - Math.min(w - size - iconW, measure(ctx, label, size)) / 2 - 2, y + pad + size / 2);
  } else {
    const iconW = o.icon ? 26 : 0;
    const maxW = w - size - iconW;
    const tw = Math.min(maxW, measure(ctx, label, size));
    const cx = x + w / 2 + iconW / 2;
    text(ctx, label, cx, y + h / 2, { size, align: 'center', color: tc, maxW });
    if (o.icon) o.icon(cx - tw / 2 - 14, y + h / 2);
  }
  ctx.restore();
  logBox(x, y, w, h, 'button');
  if (!o.disabled && onTap) ui.hit(x, y, w, h + 3, onTap, o.clip);
  else if (o.onDisabled) ui.hit(x, y, w, h + 3, o.onDisabled, o.clip);
}

export function bar(ctx, x, y, w, h, ratio, col, back = 'rgba(0,0,0,0.35)') {
  rr(ctx, x, y, w, h, h / 2);
  ctx.fillStyle = back;
  ctx.fill();
  if (ratio > 0) {
    rr(ctx, x, y, Math.max(h, w * Math.min(1, ratio)), h, h / 2);
    ctx.fillStyle = col;
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    rr(ctx, x + 2, y + 1.5, Math.max(0, w * Math.min(1, ratio) - 4), h * 0.35, h * 0.2);
    ctx.fill();
  }
}

export function shadowEllipse(ctx, x, y, rx, ry, a = 0.3) {
  ctx.fillStyle = `rgba(0,0,0,${a})`;
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, TAU);
  ctx.fill();
}

export function sparkle(ctx, x, y, r, col = '#ffe7a0', rot = 0) {
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

// 得意の小さなメーター（ラベル + 棒）
export function statBars(ctx, stats, x, y, w, o = {}) {
  const rowH = o.rowH || 20;
  const labelW = o.labelW || 52;
  DATA.stats.forEach((s, i) => {
    const yy = y + i * rowH + rowH / 2;
    text(ctx, s.name, x, yy, { size: o.size || 12, color: C.sub, maxW: labelW - 8 });
    bar(ctx, x + labelW, yy - 4, w - labelW - 30, 8, (stats[s.id] || 0) / 10, s.color);
    text(ctx, String(Math.round((stats[s.id] || 0) * 10) / 10), x + w, yy, { size: o.size || 12, align: 'right', color: C.text, maxW: 26 });
  });
  return DATA.stats.length * rowH;
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
    ctx.fillStyle = '#14161c';
    ctx.fill();
    ctx.restore();
    return;
  }
  const g = ctx.createRadialGradient(-w * 0.2, -h * 0.2, h * 0.05, 0, 0, h * 0.62);
  g.addColorStop(0, 'rgba(255,255,255,0.85)');
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
    ctx.strokeStyle = 'rgba(30,20,15,0.8)';
    ctx.lineWidth = Math.max(1.5, h * 0.03);
    ctx.beginPath();
    const n = Math.ceil(o.crack * 6);
    ctx.moveTo(-w * 0.4, -h * 0.02);
    for (let i = 1; i <= n; i++) ctx.lineTo(-w * 0.4 + (i * w * 0.8) / 6, (i % 2 ? -0.1 : 0.04) * h);
    ctx.stroke();
  }
  path();
  ctx.lineWidth = Math.max(1.5, h * 0.035);
  ctx.strokeStyle = 'rgba(0,0,0,0.45)';
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
  // 持ち物（種類ごとに違う形）
  if (L.gear === 'sack' && !o.egg) {
    ctx.beginPath();
    ctx.ellipse(-30, 14, 15, 18, -0.3, 0, TAU);
    out('#8a7350', 3);
  } else if (L.gear === 'club') {
    ctx.save();
    ctx.translate(30, 10);
    ctx.rotate(-0.5 + Math.sin(t * 3) * 0.1);
    ctx.beginPath();
    ctx.moveTo(-4, 10); ctx.lineTo(-7, -34); ctx.quadraticCurveTo(0, -46, 7, -34); ctx.lineTo(4, 10);
    ctx.closePath();
    out('#6a4a32', 3);
    ctx.restore();
  } else if (L.gear === 'drum') {
    ctx.beginPath();
    ctx.ellipse(0, 26, 20, 9, 0, 0, TAU);
    ctx.rect(-20, 26, 40, 14);
    out('#7a3a2a', 3);
    ctx.beginPath();
    ctx.ellipse(0, 26, 20, 8, 0, 0, TAU);
    out('#d8c49a', 2.5);
  }
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
    text(ctx, '+', 0, -2, { size: 24, align: 'center', color: '#e6dccb', free: true });
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

export function skyGradient(ctx, H, top, bottom) {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, top);
  g.addColorStop(1, bottom);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}

// 操作アイコン（ルール説明カード用）
export function controlIcon(ctx, kind, x, y, s = 1, t = 0) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  if (kind === 'stick') {
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, 22, 0, TAU);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#e6dccb';
    ctx.beginPath();
    ctx.arc(Math.cos(t * 2) * 10, Math.sin(t * 2) * 10, 10, 0, TAU);
    ctx.fill();
  } else {
    // 指でタップ
    const k = (Math.sin(t * 5) + 1) / 2;
    ctx.strokeStyle = `rgba(255,230,180,${0.3 + 0.5 * (1 - k)})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, -10, 8 + k * 10, 0, TAU);
    ctx.stroke();
    ctx.fillStyle = '#e6dccb';
    rr(ctx, -7, -12 + k * 3, 14, 30, 7);
    ctx.fill();
    rr(ctx, -16, 6 + k * 3, 32, 22, 10);
    ctx.fill();
  }
  ctx.restore();
}
