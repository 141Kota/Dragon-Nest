// 骨組み描画の共通部品。ドラゴン・ゴブリン・プレイヤーはすべてここを通して描く。
// - 体は「骨組み（関節の連なり）」に沿った1つの連続した輪郭（複数の多角形の和）で描く
// - 輪郭線は画面上で同じ太さ（LINE_PX）、光の向きは1つ（LIGHT：左上から）
// - 輪郭線は「全部の形を太線でなぞる → 上から全部を塗る」の順で描くので、形の重なった内側に線が残らない
export const TAU = Math.PI * 2;
export const LINE_PX = 2.2;
const lm = Math.hypot(-0.5, -0.86);
export const LIGHT = { x: -0.5 / lm, y: -0.86 / lm };

export function mix(a, b, k) {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  const ch = (s) => Math.round(((pa >> s) & 255) * (1 - k) + ((pb >> s) & 255) * k);
  return `#${((1 << 24) | (ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).slice(1)}`;
}

export function hexA(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

// 輪郭線の色（その形の暗い色をさらに沈める）
export const lineOf = (dark) => mix(dark, '#16120e', 0.45);

// ---------- 鎖（[x, y, r] の点列）----------
// Catmull-Rom でなめらかにし、半径も補間する
export function smooth(pts, per = 6) {
  const out = [];
  const P = (i) => pts[Math.max(0, Math.min(pts.length - 1, i))];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = P(i - 1), p1 = P(i), p2 = P(i + 1), p3 = P(i + 2);
    for (let k = 0; k < per; k++) {
      const t = k / per, t2 = t * t, t3 = t2 * t;
      const f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push({ x: f(p0[0], p1[0], p2[0], p3[0]), y: f(p0[1], p1[1], p2[1], p3[1]), r: p1[2] + (p2[2] - p1[2]) * t });
    }
  }
  const l = pts[pts.length - 1];
  out.push({ x: l[0], y: l[1], r: l[2] });
  return withNormals(out);
}

// 各点に、進む向きの左側（背中側）の法線 nx, ny と、進む向き dx, dy を付ける
export function withNormals(ch) {
  for (let i = 0; i < ch.length; i++) {
    const a = ch[Math.max(0, i - 1)], b = ch[Math.min(ch.length - 1, i + 1)];
    let dx = b.x - a.x, dy = b.y - a.y;
    const m = Math.hypot(dx, dy) || 1;
    dx /= m; dy /= m;
    ch[i].dx = dx; ch[i].dy = dy;
    ch[i].nx = dy; ch[i].ny = -dx;
  }
  return ch;
}

// 鎖の外形（太さの変わる管）。両端は丸い
export function tubePoly(ch, capN = 6) {
  const L = [], R = [];
  for (const p of ch) { L.push([p.x + p.nx * p.r, p.y + p.ny * p.r]); R.push([p.x - p.nx * p.r, p.y - p.ny * p.r]); }
  const out = [...L];
  const e = ch[ch.length - 1], s = ch[0];
  for (let k = 1; k < capN; k++) {
    const a = (k / capN) * Math.PI;
    out.push([e.x + (e.nx * Math.cos(a) + e.dx * Math.sin(a)) * e.r, e.y + (e.ny * Math.cos(a) + e.dy * Math.sin(a)) * e.r]);
  }
  for (let i = R.length - 1; i >= 0; i--) out.push(R[i]);
  for (let k = 1; k < capN; k++) {
    const a = (k / capN) * Math.PI;
    out.push([s.x + (-s.nx * Math.cos(a) - s.dx * Math.sin(a)) * s.r, s.y + (-s.ny * Math.cos(a) - s.dy * Math.sin(a)) * s.r]);
  }
  return out;
}

// 管＋関節ごとの円（急に曲がったところで輪郭が欠けないように）
export function tubePolys(ch, step = 3) {
  const list = [tubePoly(ch)];
  for (let i = step; i < ch.length - 1; i += step) list.push(ellipsePoly(ch[i].x, ch[i].y, ch[i].r * 0.98, ch[i].r * 0.98, 0, 14));
  return list;
}

// 鎖にそった帯（a, b は背中側 +1 〜 腹側 -1 の位置）
export function bandPoly(ch, a, b, i0 = 0, i1 = ch.length - 1) {
  const out = [];
  for (let i = i0; i <= i1; i++) { const p = ch[i]; out.push([p.x + p.nx * p.r * a, p.y + p.ny * p.r * a]); }
  for (let i = i1; i >= i0; i--) { const p = ch[i]; out.push([p.x + p.nx * p.r * b, p.y + p.ny * p.r * b]); }
  return out;
}

export function ellipsePoly(cx, cy, rx, ry, rot = 0, n = 22) {
  const c = Math.cos(rot), s = Math.sin(rot);
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU;
    const x = Math.cos(a) * rx, y = Math.sin(a) * ry;
    out.push([cx + x * c - y * s, cy + x * s + y * c]);
  }
  return out;
}

// 2次ベジェを点にする
export function quadPts(x0, y0, cx, cy, x1, y1, n = 8, skipFirst = true) {
  const out = [];
  for (let i = skipFirst ? 1 : 0; i <= n; i++) {
    const t = i / n, u = 1 - t;
    out.push([u * u * x0 + 2 * u * t * cx + t * t * x1, u * u * y0 + 2 * u * t * cy + t * t * y1]);
  }
  return out;
}

// 点の並びを移動・回転・拡大する
export function xf(poly, x, y, rot = 0, sx = 1, sy = sx) {
  const c = Math.cos(rot), s = Math.sin(rot);
  return poly.map(([px, py]) => { const a = px * sx, b = py * sy; return [x + a * c - b * s, y + a * s + b * c]; });
}

function signedArea(poly) {
  let a = 0;
  for (let i = 0; i < poly.length; i++) { const p = poly[i], q = poly[(i + 1) % poly.length]; a += p[0] * q[1] - q[0] * p[1]; }
  return a / 2;
}

// すべての多角形を同じ向きにそろえてから1つのパスにする（重なっても穴があかない）
export function toPath(polys) {
  const path = new Path2D();
  for (let poly of polys) {
    if (!poly || poly.length < 3) continue;
    if (signedArea(poly) < 0) poly = [...poly].reverse();
    path.moveTo(poly[0][0], poly[0][1]);
    for (let i = 1; i < poly.length; i++) path.lineTo(poly[i][0], poly[i][1]);
    path.closePath();
  }
  return path;
}

export function bbox(polys) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const poly of polys) for (const [x, y] of poly) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  return { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 };
}

// 光の向きにそったグラデーション（左上が明るく、右下が暗い）
export function lightGrad(ctx, bb, light, main, dark) {
  const R = Math.max(bb.w, bb.h) / 2 + 1;
  const g = ctx.createLinearGradient(bb.cx + LIGHT.x * R, bb.cy + LIGHT.y * R, bb.cx - LIGHT.x * R, bb.cy - LIGHT.y * R);
  g.addColorStop(0, light);
  g.addColorStop(0.42, main);
  g.addColorStop(1, dark);
  return g;
}

// 1つの塊（体・翼など）を描く。st: { light, main, dark, line, lw, sil }
// 戻り値は中を塗るための Path2D
export function solid(ctx, polys, st) {
  const path = toPath(polys);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.strokeStyle = st.line;
  ctx.lineWidth = st.lw * 2;
  ctx.stroke(path);
  ctx.fillStyle = st.sil ? st.main : lightGrad(ctx, bbox(polys), st.light, st.main, st.dark);
  ctx.fill(path);
  return path;
}

// 輪郭の内側だけに描く（模様・陰影・服がはみ出さない）
export function inside(ctx, path, fn) {
  ctx.save();
  ctx.clip(path);
  fn();
  ctx.restore();
}

export function fillPoly(ctx, poly, style) {
  ctx.beginPath();
  ctx.moveTo(poly[0][0], poly[0][1]);
  for (let i = 1; i < poly.length; i++) ctx.lineTo(poly[i][0], poly[i][1]);
  ctx.closePath();
  ctx.fillStyle = style;
  ctx.fill();
}

// 付け根の色から先端の色へ（つなぎ目をなじませる）
export function rootToTip(ctx, x0, y0, x1, y1, c0, c1) {
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  g.addColorStop(0, c0);
  g.addColorStop(0.35, c0);
  g.addColorStop(1, c1);
  return g;
}

// 遅れて追従する揺れ（根元 i=0 から先へ、位相が少しずつ遅れる）
export const lag = (t, i, speed, delay) => Math.sin(t * speed - i * delay);

// 今の変換から、画面上の1論理pxがローカル座標でいくつか（線の太さをそろえるため）
export function unitPx(ctx) {
  const m = ctx.getTransform();
  const k = Math.hypot(m.a, m.b) / (globalThis.__ui ? globalThis.__ui.pixel : 1);
  return k > 0 ? 1 / k : 1;
}

// 2関節の手足（肩/腰 → ひじ/ひざ → 先）を角度から求める
export function limb(x, y, a1, l1, a2, l2) {
  const kx = x + Math.sin(a1) * l1, ky = y + Math.cos(a1) * l1;
  const ex = kx + Math.sin(a1 + a2) * l2, ey = ky + Math.cos(a1 + a2) * l2;
  return { x, y, kx, ky, ex, ey };
}
