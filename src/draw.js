// 共通の描画部品（文字・ボタン・卵・ゴブリン・アイコン・施設）
// 文字はすべて text / textBox を通す。枠に収まらないときは自動で小さくするか折り返す。
import { DATA } from './data.js';
import { W } from './ui.js';

const TAU = Math.PI * 2;
export const FONT = '"Hiragino Sans", "Hiragino Kaku Gothic ProN", "Noto Sans JP", "Yu Gothic", sans-serif';

// 色：落ち着いた深みのある彩度のまま、画面全体は明るく。
// 明るさの下限：背景・パネルは中間より明るい色（明度 70% 以上）を基本にし、暗い色は影・輪郭・夜の場所だけに使う。
// 文字は背景に対して十分なコントラスト（text は bg に対して 10:1 以上、sub は 5:1 以上）をとる。
export const C = {
  bg: '#e9e3d6',
  bg2: '#f3eee4',
  panel: '#f7f3ea',
  panel2: '#fdfbf6',
  line: 'rgba(70,56,40,0.16)',
  text: '#2b2722',
  sub: '#5f574d',
  dim: '#857c70',
  gold: '#a8751f',
  amber: '#a8702e',
  teal: '#3a7069',
  rust: '#a2502f',
  plum: '#6a5684',
  moss: '#58733f',
  slate: '#5a6273',
  red: '#b24a35',
  // 地図の上などに置く、半透明の明るい板
  glass: 'rgba(250,247,240,0.9)',
  glassLine: 'rgba(70,56,40,0.18)',
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
// フィールドの上に直接文字を置くとき（バトル中）は、文字のまわりに明るいふちを付けて読みやすくする
export const HALO = { on: false };

export function text(ctx, str, x, y, o = {}) {
  str = String(str);
  let size = o.size || 16;
  const min = o.minSize || 9;
  if (o.maxW) while (size > min && measure(ctx, str, size, o.weight) > o.maxW) size -= 0.5;
  ctx.font = fontOf(size, o.weight);
  ctx.textAlign = o.align || 'left';
  ctx.textBaseline = 'middle';
  const halo = !o.stroke && HALO.on && !o.noHalo;
  if (o.stroke || halo) {
    ctx.lineJoin = 'round';
    ctx.lineWidth = o.strokeW || (halo ? 3.5 : 4);
    ctx.strokeStyle = o.stroke || 'rgba(253,251,246,0.92)';
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
    ctx.fillStyle = 'rgba(70,52,30,0.16)';
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
  const col = o.disabled ? '#cfc8bb' : o.color || C.amber;
  const down = !o.disabled && onTap && ui.held(x, y, w, h + 3);
  ctx.save();
  ctx.fillStyle = shade(col, -0.35);
  rr(ctx, x, y + 3, w, h, o.r ?? 12);
  ctx.fill();
  if (down) ctx.translate(0, 2);
  const g = ctx.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, shade(col, 0.12));
  g.addColorStop(1, shade(col, -0.12));
  ctx.fillStyle = g;
  rr(ctx, x, y, w, h, o.r ?? 12);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.28)';
  ctx.lineWidth = 1.2;
  rr(ctx, x + 0.5, y + 0.5, w - 1, h - 1, o.r ?? 12);
  ctx.stroke();
  const tc = o.disabled ? '#6f685e' : o.textColor || '#fffaf0';
  let size = Math.min(o.size || 17, h / 2);
  if (o.sub) {
    // 2行: 上下の余白 + 行間をそれぞれ文字の高さの半分以上
    const sub = Math.min(o.subSize || 11, size * 0.75);
    const total = size + sub;
    size = Math.min(size, (h - (size / 2) * 2 - sub * 0.3 - sub) || size);
    const pad = (h - total - sub * 0.3) / 2;
    const iconW = o.icon ? 24 : 0;
    const cx = x + w / 2 + iconW / 2;
    text(ctx, label, cx, y + pad + size / 2, { size, align: 'center', noHalo: true, color: tc, maxW: w - size - iconW });
    text(ctx, o.sub, cx, y + h - pad - sub / 2, { size: sub, align: 'center', color: o.disabled ? tc : 'rgba(255,250,240,0.88)', maxW: w - size - iconW, weight: 'normal', noHalo: true });
    if (o.icon) o.icon(x + w / 2 - Math.min(w - size - iconW, measure(ctx, label, size)) / 2 - 2, y + pad + size / 2);
  } else {
    const iconW = o.icon ? 26 : 0;
    const maxW = w - size - iconW;
    const tw = Math.min(maxW, measure(ctx, label, size));
    const cx = x + w / 2 + iconW / 2;
    text(ctx, label, cx, y + h / 2, { size, align: 'center', noHalo: true, color: tc, maxW });
    if (o.icon) o.icon(cx - tw / 2 - 14, y + h / 2);
  }
  ctx.restore();
  logBox(x, y, w, h, 'button');
  if (!o.disabled && onTap) ui.hit(x, y, w, h + 3, onTap, o.clip);
  else if (o.onDisabled) ui.hit(x, y, w, h + 3, o.onDisabled, o.clip);
}

export function bar(ctx, x, y, w, h, ratio, col, back = 'rgba(70,56,40,0.16)') {
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
  ctx.fillStyle = `rgba(40,30,20,${a * 0.8})`;
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
    ctx.fillStyle = '#3a3f4b';
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
  ctx.strokeStyle = 'rgba(40,28,18,0.55)';
  ctx.stroke();
  ctx.restore();
}

export function rarityStars(ctx, eggId, x, y, size = 10) {
  const n = DATA.rarities[DATA.eggs[eggId].rarity].stars;
  for (let i = 0; i < n; i++) sparkle(ctx, x + (i - (n - 1) / 2) * size * 1.6, y, size * 0.7, '#f2b33d');
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
    ctx.strokeStyle = 'rgba(80,62,40,0.55)';
    ctx.lineWidth = 2.5;
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.beginPath();
    ctx.ellipse(0, 0, 40, 16, 0, 0, TAU);
    ctx.fill();
    ctx.stroke();
    ctx.setLineDash([]);
    text(ctx, '+', 0, -2, { size: 24, align: 'center', color: '#5f574d', free: true });
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
    ctx.fillStyle = 'rgba(70,56,40,0.1)';
    ctx.strokeStyle = 'rgba(70,56,40,0.45)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, 22, 0, TAU);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#6a5e50';
    ctx.beginPath();
    ctx.arc(Math.cos(t * 2) * 10, Math.sin(t * 2) * 10, 10, 0, TAU);
    ctx.fill();
  } else {
    // 指でタップ
    const k = (Math.sin(t * 5) + 1) / 2;
    ctx.strokeStyle = `rgba(168,117,31,${0.3 + 0.5 * (1 - k)})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, -10, 8 + k * 10, 0, TAU);
    ctx.stroke();
    ctx.fillStyle = '#6a5e50';
    rr(ctx, -7, -12 + k * 3, 14, 30, 7);
    ctx.fill();
    rr(ctx, -16, 6 + k * 3, 32, 22, 10);
    ctx.fill();
  }
  ctx.restore();
}

// 仮想スティック（明るい半透明の輪）
export function drawStick(ctx, cx, cy, stick, R = 52) {
  ctx.fillStyle = 'rgba(250,247,240,0.45)';
  ctx.strokeStyle = 'rgba(70,56,40,0.35)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, TAU);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = 'rgba(253,251,246,0.95)';
  ctx.strokeStyle = 'rgba(70,56,40,0.45)';
  ctx.beginPath();
  ctx.arc(cx + stick.x * R * 0.77, cy + stick.y * R * 0.77, R * 0.46, 0, TAU);
  ctx.fill();
  ctx.stroke();
}

// フィールドの上に置く短い札（明るい板に濃い文字）
export function tagOnField(ctx, str, x, y, o = {}) {
  const size = o.size || 18;
  const w = Math.min(o.maxW || W - 40, measure(ctx, str, size) + size * 2);
  const h = size * 2.2;
  panel(ctx, x - w / 2, y, w, h, { r: h / 2, fill: C.glass, stroke: C.glassLine });
  text(ctx, str, x, y + h / 2, { size, align: 'center', color: o.color || C.text, maxW: w - size });
  return h;
}
