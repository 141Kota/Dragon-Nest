// 骨組み描画の共通部品。ドラゴン・ゴブリン・プレイヤーはすべてここを通して描く。
// - 骨組みは3D座標（X: 前、Y: 左、Z: 上）で持つ。向き（yaw）に合わせて回し、少し見下ろす角度（pitch）で2Dに投影する
// - 体は、太さの変わる「玉の連なり」（関節ごとの円と、その間をつなぐ台形）の和で描く。投影は正射影なので、
//   どの向きから見ても円筒らしい形になる
// - 部位（胴・首・脚・翼など）ごとに「部品」にまとめ、奥にあるものから順に描く（奥行き順）
// - つなぎ目は、つながる2つの部品をつなぎ目の円の中だけ塗り直して、線を消す（つぎはぎに見せない）
// - 輪郭線は細く、塗りより少し暗い同系色。光の当たる側（左上）は薄くなる。光の向きは1つ（LIGHT）
export const TAU = Math.PI * 2;
export const LINE_PX = 0.9;
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

// 輪郭線の色：塗りの暗い色に寄せた同系色（黒にはしない）
export const lineOf = (main, dark) => mix(main, dark || '#2a221c', 0.72);

// ---------- ベクトル ----------
export const v3 = (x, y, z) => [x, y, z];
export const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
export const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const len = (a) => Math.hypot(a[0], a[1], a[2]);
export const norm = (a) => { const m = len(a) || 1; return [a[0] / m, a[1] / m, a[2] / m]; };
// a + b*k + c*m ...（点を軸の組み合わせで作る）
export function at(p, ...pairs) {
  const o = [p[0], p[1], p[2]];
  for (let i = 0; i < pairs.length; i += 2) { const v = pairs[i], k = pairs[i + 1]; o[0] += v[0] * k; o[1] += v[1] * k; o[2] += v[2] * k; }
  return o;
}
export const lerp3 = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
// 前向き f と上向きのめやす up から、直交する [前, 左, 上] を作る
export function frame(f, up = [0, 0, 1]) {
  const F = norm(f);
  let L = cross(up, F);
  if (len(L) < 1e-4) L = cross([1, 0, 0], F);
  L = norm(L);
  return { f: F, l: L, u: cross(F, L) };
}

// ---------- 視点 ----------
// yaw: 向き（0 = 画面の右、+π/2 = 画面の奥、-π/2 = 手前）。pitch: 見下ろす角度
export function view(yaw = 0, pitch = 0.32) {
  const c = Math.cos(yaw), s = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
  return {
    yaw, pitch,
    p(q) {
      const wx = q[0] * c - q[1] * s, wd = q[0] * s + q[1] * c;
      return { x: wx, y: -q[2] * cp - wd * sp, d: wd * cp - q[2] * sp, r: q[3] || 0 };
    },
    // 向き n がどれだけこちらを向いているか（1 = 真正面、0 = 真横、負 = 裏側）
    facing(n) {
      const wd = n[0] * s + n[1] * c;
      return -(wd * cp - n[2] * sp);
    },
  };
}

// ---------- 鎖（[X, Y, Z, r] の点列） ----------
// Catmull-Rom でなめらかにし、半径も補間する
export function smooth3(pts, per = 4) {
  if (pts.length < 2) return pts.map((p) => [...p]);
  const out = [];
  const P = (i) => pts[Math.max(0, Math.min(pts.length - 1, i))];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = P(i - 1), p1 = P(i), p2 = P(i + 1), p3 = P(i + 2);
    for (let k = 0; k < per; k++) {
      const t = k / per, t2 = t * t, t3 = t2 * t;
      const f = (j) => 0.5 * (2 * p1[j] + (-p0[j] + p2[j]) * t + (2 * p0[j] - 5 * p1[j] + 4 * p2[j] - p3[j]) * t2 + (-p0[j] + 3 * p1[j] - 3 * p2[j] + p3[j]) * t3);
      out.push([f(0), f(1), f(2), p1[3] + (p2[3] - p1[3]) * t]);
    }
  }
  out.push([...pts[pts.length - 1]]);
  return out;
}

// 玉の連なりの外形（関節ごとの円＋間の台形）。どれも凸で同じ向きなので、重ねても穴があかない
export function beadPolys(q, n = 14) {
  const out = [];
  for (let i = 0; i < q.length; i++) {
    const b = q[i];
    if (b.r > 0.2 && (i % 2 === 0 || i === q.length - 1)) out.push(ellipsePoly(b.x, b.y, b.r, b.r, 0, b.r > 14 ? n + 4 : n));
    if (i === 0) continue;
    const a = q[i - 1];
    const dx = b.x - a.x, dy = b.y - a.y, m = Math.hypot(dx, dy);
    if (m < 0.01 || m < Math.abs(a.r - b.r)) continue;
    const nx = -dy / m, ny = dx / m;
    out.push([[a.x + nx * a.r, a.y + ny * a.r], [b.x + nx * b.r, b.y + ny * b.r], [b.x - nx * b.r, b.y - ny * b.r], [a.x - nx * a.r, a.y - ny * a.r]]);
  }
  return out;
}

export const projChain = (V, pts) => pts.map((p) => V.p(p));
export const projPoly = (V, pts) => pts.map((p) => { const q = V.p(p); return [q.x, q.y]; });
export const meanD = (V, pts) => pts.reduce((s, p) => s + V.p(p).d, 0) / Math.max(1, pts.length);

// 3Dの円（中心 c・法線 nrm・半径 r）を投影した多角形
export function circle3(V, c, nrm, r, n = 18) {
  const F = frame(nrm, Math.abs(nrm[2]) > 0.9 ? [1, 0, 0] : [0, 0, 1]);
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU;
    const q = V.p(at(c, F.l, Math.cos(a) * r, F.u, Math.sin(a) * r));
    out.push([q.x, q.y]);
  }
  return out;
}

// 球（中心 C・半径 R）の上の、向き dir を中心とした帽子形（dir との内積が c 以上の部分）のうち、見えている所
// 顔・目・髪の生えぎわ・胸当てなどを、どの向きから見ても球に貼り付いたように描くのに使う
export function capPoly(V, C, R, dir, c, n = 24) {
  const D = norm(dir);
  if (V.facing(D) < -Math.sqrt(1 - c * c) - 0.02) return null; // 完全に裏
  if (V.facing(D) < -c) {
    // 真後ろの点まで含む大きな帽子形：見えているのは「球の円 − 反対側の帽子形」
    if (c > 0.5) return null;
    const comp = capPoly(V, C, R, mul(D, -1), -c, n);
    if (!comp) return null;
    const c2 = V.p(C);
    comp.invert = [c2.x, c2.y, R];
    return comp;
  }
  const F = frame(D, Math.abs(D[2]) > 0.9 ? [1, 0, 0] : [0, 0, 1]);
  const rr = R * Math.sqrt(Math.max(0, 1 - c * c));
  const cc = at(C, D, R * c);
  const c2 = V.p(C);
  const N = Math.max(n, c > 0.9 ? 12 : 28);
  const out = [];
  let vis = 0, lastA = null;
  for (let i = 0; i < N; i++) {
    const a = (i / N) * TAU;
    const p = at(cc, F.l, Math.cos(a) * rr, F.u, Math.sin(a) * rr);
    const q = V.p(p);
    if (V.facing(sub(p, C)) >= 0) { out.push([q.x, q.y]); vis++; lastA = null; continue; }
    // 裏に回った所は、球の輪郭（円周）の上に押し出す。押し出した点どうしの間は円周にそってつなぐ
    const ang = Math.atan2(q.y - c2.y, q.x - c2.x);
    if (lastA !== null) {
      let d = ((ang - lastA + Math.PI) % TAU + TAU) % TAU - Math.PI;
      const steps = Math.floor(Math.abs(d) / 0.15);
      for (let k = 1; k <= steps; k++) { const b = lastA + (d * k) / (steps + 1); out.push([c2.x + Math.cos(b) * R, c2.y + Math.sin(b) * R]); }
    }
    out.push([c2.x + Math.cos(ang) * R, c2.y + Math.sin(ang) * R]);
    lastA = ang;
  }
  if (!vis && V.facing(D) < 0) return null;
  return out;
}

// capPoly の結果を塗れるパスにする（反転のときは円から抜く）
export function capPath(op) {
  const path = new Path2D();
  if (!op) return path;
  let poly = op;
  if (op.invert) {
    const [x, y, R] = op.invert;
    path.arc(x, y, R, 0, TAU, false);
    if (signedArea(poly) > 0) poly = [...poly].reverse();
  }
  path.moveTo(poly[0][0], poly[0][1]);
  for (let i = 1; i < poly.length; i++) path.lineTo(poly[i][0], poly[i][1]);
  path.closePath();
  return path;
}
export function fillCap(ctx, op, style) {
  if (!op) return;
  ctx.fillStyle = style;
  ctx.fill(capPath(op));
}

// ---------- 2Dの形 ----------
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
// 3Dの2次ベジェ
export function quad3(a, c, b, n = 6, skipFirst = true) {
  const out = [];
  for (let i = skipFirst ? 1 : 0; i <= n; i++) {
    const t = i / n, u = 1 - t;
    out.push([0, 1, 2].map((j) => u * u * a[j] + 2 * u * t * c[j] + t * t * b[j]));
  }
  return out;
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
  if (x0 === Infinity) { x0 = y0 = x1 = y1 = 0; }
  return { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 };
}

// 光の向きにそったグラデーション（左上が明るく、右下が暗い）
export function lightGrad(ctx, bb, light, main, dark) {
  const R = Math.max(bb.w, bb.h) / 2 + 1;
  const g = ctx.createLinearGradient(bb.cx + LIGHT.x * R, bb.cy + LIGHT.y * R, bb.cx - LIGHT.x * R, bb.cy - LIGHT.y * R);
  g.addColorStop(0, light);
  g.addColorStop(0.45, main);
  g.addColorStop(1, dark);
  return g;
}

// 上が明るく下が暗い塗り（光は左上から）。体の塗りに使う
export function bodyGrad(ctx, bb, light, main, dark) {
  const R = Math.max(bb.w, bb.h) / 2 + 1;
  const lx = LIGHT.x * 0.55, ly = LIGHT.y;
  const m = Math.hypot(lx, ly);
  const g = ctx.createLinearGradient(bb.cx + (lx / m) * R, bb.cy + (ly / m) * R, bb.cx - (lx / m) * R, bb.cy - (ly / m) * R);
  g.addColorStop(0, light);
  g.addColorStop(0.38, main);
  g.addColorStop(0.78, mix(main, dark, 0.55));
  g.addColorStop(1, dark);
  return g;
}

// 輪郭線：影の側は濃く、光の側は薄く
export function edgeGrad(ctx, bb, col) {
  const R = Math.max(bb.w, bb.h) / 2 + 1;
  const g = ctx.createLinearGradient(bb.cx + LIGHT.x * R, bb.cy + LIGHT.y * R, bb.cx - LIGHT.x * R, bb.cy - LIGHT.y * R);
  g.addColorStop(0, hexA(col, 0.12));
  g.addColorStop(0.45, hexA(col, 0.6));
  g.addColorStop(1, hexA(col, 1));
  return g;
}

// 色の組（塗り・線・縁の光）を作る
export function look(ctx, bb, main, light, dark) {
  return { fill: bodyGrad(ctx, bb, mix(main, light, 0.8), main, mix(main, dark, 0.75)), line: edgeGrad(ctx, bb, lineOf(main, dark)), rim: mix(light, '#fffaf0', 0.35), main };
}

// 輪郭の内側だけに描く（模様・陰影・服がはみ出さない）
export function inside(ctx, path, fn) {
  ctx.save();
  ctx.clip(path);
  fn();
  ctx.restore();
}

export function fillPoly(ctx, poly, style) {
  if (!poly || poly.length < 3) return;
  ctx.beginPath();
  ctx.moveTo(poly[0][0], poly[0][1]);
  for (let i = 1; i < poly.length; i++) ctx.lineTo(poly[i][0], poly[i][1]);
  ctx.closePath();
  ctx.fillStyle = style;
  ctx.fill();
}

export function strokePts(ctx, pts, style, w) {
  if (!pts || pts.length < 2) return;
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.strokeStyle = style;
  ctx.lineWidth = w;
  ctx.stroke();
}

// 付け根の色から先端の色へ（つなぎ目をなじませる）
export function rootToTip(ctx, x0, y0, x1, y1, c0, c1) {
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  g.addColorStop(0, c0);
  g.addColorStop(0.3, c0);
  g.addColorStop(1, c1);
  return g;
}

// 遅れて追従する揺れ（根元 i=0 から先へ、位相が少しずつ遅れる）
export const lag = (t, i, speed, delay) => Math.sin(t * speed - i * delay);

// 角度を目標へなめらかに回す（1秒あたり rate ラジアンまで）
export function turnToward(a, target, step) {
  let d = ((target - a + Math.PI) % TAU + TAU) % TAU - Math.PI;
  if (Math.abs(d) <= step) return target;
  return a + Math.sign(d) * step;
}

// 今の変換から、画面上の1論理pxがローカル座標でいくつか（線の太さをそろえるため）
export function unitPx(ctx) {
  const m = ctx.getTransform();
  const k = Math.hypot(m.a, m.b) / (globalThis.__ui ? globalThis.__ui.pixel : 1);
  return k > 0 ? 1 / k : 1;
}

// 画面の外か（描かない判定）。x, y, r は今の座標系
export function offscreen(ctx, x, y, r) {
  const m = ctx.getTransform();
  const sx = m.a * x + m.c * y + m.e, sy = m.b * x + m.d * y + m.f;
  const sr = r * Math.hypot(m.a, m.b);
  const cw = ctx.canvas ? ctx.canvas.width : Infinity, ch = ctx.canvas ? ctx.canvas.height : Infinity;
  return sx + sr < 0 || sy + sr < 0 || sx - sr > cw || sy - sr > ch;
}

// 画面上の大きさ（論理px）
export function screenSize(ctx, r) {
  const m = ctx.getTransform();
  return r * Math.hypot(m.a, m.b) / (globalThis.__ui ? globalThis.__ui.pixel : 1);
}

// ---------- 部品を奥行き順に描く ----------
// piece: { polys, d（奥行き。大きいほど奥）, line（線の色）, paint(ctx, piece)（線なしの塗りと内側の描きこみ） }
// joint: { a, b（部品）, x, y, r（つなぎ目の円） }
export function drawPieces(ctx, pieces, joints, lw) {
  for (const p of pieces) p.path = toPath(p.polys);
  const order = pieces.filter((p) => p.polys.length).sort((a, b) => b.d - a.d);
  const drawn = [];
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  for (const p of order) {
    strokePiece(ctx, p, lw);
    p.paint(ctx, p);
    drawn.push(p);
    for (const j of joints) {
      if (j.a !== p && j.b !== p) continue;
      const other = j.a === p ? j.b : j.a;
      const oi = drawn.indexOf(other);
      if (oi < 0 || other === p) continue;
      // つなぎ目の円の中だけ、先に描いた方 → 今の部品 の順に塗り直す（つなぎ目の線が消える）
      ctx.save();
      ctx.beginPath();
      ctx.arc(j.x, j.y, j.r, 0, TAU);
      ctx.clip();
      other.paint(ctx, other, true);
      p.paint(ctx, p, true);
      ctx.restore();
    }
  }
}

function strokePiece(ctx, p, lw) {
  if (p.noLine) return;
  ctx.strokeStyle = p.line;
  ctx.lineWidth = lw * 2 * (p.lineK || 1);
  ctx.stroke(p.path);
}

// 基本の塗り：体の塗り → 左上の縁に光（全体の外形からずらして作る） → 内側の描きこみ
export function paintBody(ctx, p, L, union, lw, extra, patch = false) {
  ctx.fillStyle = L.fill;
  ctx.fill(p.path);
  if (union && !p.flat) {
    ctx.save();
    ctx.clip(p.path);
    ctx.fillStyle = hexA(L.rim, 0.55);
    ctx.fill(p.path);
    const k = lw * 2.4;
    ctx.translate(-LIGHT.x * k, -LIGHT.y * k);
    ctx.fillStyle = L.fill;
    ctx.fill(union);
    ctx.restore();
  }
  if (p.shade) {
    ctx.fillStyle = `rgba(30,24,20,${p.shade})`;
    ctx.fill(p.path);
  }
  if (extra) inside(ctx, p.path, () => extra(patch));
}

// 地面に落ちる影（足もとの点を地面に押しつけた円の和を、1回で塗る）
export function groundShadow(ctx, V, pts, alpha = 0.22, k = 1) {
  const sp = Math.sin(V.pitch);
  const polys = [];
  for (const q of pts) {
    const g = V.p([q[0] - LIGHT.x * 4, q[1], 0]);
    const r = (q[3] || 4) * k;
    polys.push(ellipsePoly(g.x, g.y, r * 1.05, Math.max(1.5, r * (0.25 + sp * 0.75)), 0, 14));
  }
  ctx.fillStyle = `rgba(40,30,20,${alpha})`;
  ctx.fill(toPath(polys));
}

// 2関節の手足：根元 → ひざ/ひじ → 先 を角度から（前後の面の中で）求める
export function limb3(base, a1, l1, a2, l2, out = 0) {
  const knee = [base[0] + Math.sin(a1) * l1, base[1] + out * l1, base[2] - Math.cos(a1) * l1];
  const end = [knee[0] + Math.sin(a1 + a2) * l2, knee[1] + out * l2 * 0.5, knee[2] - Math.cos(a1 + a2) * l2];
  return { base, knee, end };
}
