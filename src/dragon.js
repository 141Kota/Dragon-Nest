// ドラゴン描画
// 系統（DATA.lineages[].skeleton）ごとに、しっぽの先 → 胴 → 首 → 頭 を1本につないだ骨組み（背骨）を持つ。
// - 体は背骨に沿った1つの連続した輪郭で描く（rig.js の solid。つなぎ目に線が出ない）
// - 角・背びれ・しっぽの先は背骨の決まった点に付け、体と同じ輪郭の中に入れて、付け根の色からなじませる
// - 動きは骨組みから作る：息で胴が上下し、首としっぽは根元から先へ少しずつ遅れて追従し、翼は付け根から動く
import { part, lineageById } from './data.js';
import {
  TAU, mix, hexA, lineOf, smooth, withNormals, tubePolys, bandPoly, ellipsePoly, quadPts, xf, toPath, bbox,
  solid, inside, fillPoly, rootToTip, lag, unitPx, LINE_PX, LIGHT,
} from './rig.js';

const GROUND = 70;
const SIL = { main: '#3a3f4b', light: '#3a3f4b', dark: '#3a3f4b', belly: '#3a3f4b', accent: '#3a3f4b', eye: '#3a3f4b', horn: '#3a3f4b', sil: true };

export function dragonPalette(g, silhouette = false) {
  if (silhouette) return SIL;
  const c = part('color', g.color) || part('color', 'moss');
  return g.shiny ? { ...c, ...c.shiny } : { ...c };
}

const farOf = (pal) => (pal.sil ? pal : { ...pal, main: mix(pal.main, pal.dark, 0.42), light: mix(pal.light, pal.dark, 0.45), belly: mix(pal.belly, pal.dark, 0.5), horn: mix(pal.horn, pal.dark, 0.4) });
const styleOf = (pal, lw) => ({ light: mix(pal.main, pal.light, 0.75), main: pal.main, dark: mix(pal.main, pal.dark, 0.7), line: pal.sil ? pal.main : lineOf(pal.dark), lw, sil: pal.sil });

// ---------- 骨組み ----------
const near = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]) < 4;

// 動かす前の背骨（しっぽの先 → 頭）と、各部の範囲
const baseCache = new Map();
function baseSpine(g) {
  const key = `${g.lineage}.${g.tail}`;
  if (baseCache.has(key)) return baseCache.get(key);
  const sk = lineageById(g.lineage).skeleton;
  const tl = (part('tail', g.tail) || { style: { len: 1 } }).style.len;
  const [x0, y0] = sk.tail.pts[0];
  const tail = sk.tail.pts.map(([x, y, r]) => [x0 + (x - x0) * tl, y0 + (y - y0) * tl, r]).reverse();
  const main = sk.necks.findIndex((n) => !n.far);
  const raw = [...tail];
  const push = (p) => { if (!near(raw[raw.length - 1], p)) raw.push(p); else raw[raw.length - 1] = [raw[raw.length - 1][0], raw[raw.length - 1][1], Math.max(raw[raw.length - 1][2], p[2])]; };
  const tailEnd = raw.length - 1;
  sk.body.pts.forEach(push);
  const bodyEnd = raw.length - 1;
  sk.necks[main].pts.forEach(push);
  const out = { raw, tailEnd, bodyEnd, main, sk };
  baseCache.set(key, out);
  return out;
}

// 背骨の点 i を動かす。部位ごとに、根元から先へ少しずつ遅れて追従する
function animateSpine(B, tt, k) {
  const { raw, tailEnd, bodyEnd, sk } = B;
  const n = raw.length;
  const breath = (u) => Math.sin(u * 2) * 1.4 * k;
  const tailAmp = (sk.tail.sway || 6) * k, neckAmp = (sk.necks[B.main].sway || 3) * k;
  return raw.map(([x, y, r], i) => {
    if (i <= tailEnd) {
      // しっぽ: 根元(tailEnd) → 先(0)
      const j = tailEnd - i, m = Math.max(1, tailEnd);
      const f = j / m;
      return [x + lag(tt, j, 1.3, 0.55) * tailAmp * 0.35 * f, y + breath(tt - j * 0.18) * (1 - f * 0.4) + lag(tt, j, 1.6, 0.75) * tailAmp * Math.pow(f, 1.3), r];
    }
    if (i <= bodyEnd) return [x, y + breath(tt), r * (1 + Math.sin(tt * 2) * 0.03 * k)];
    // 首: 根元(bodyEnd) → 頭
    const j = i - bodyEnd, m = Math.max(1, n - 1 - bodyEnd);
    const f = j / m;
    return [x + lag(tt, j, 0.9, 0.6) * neckAmp * 0.5 * f, y + breath(tt - j * 0.2) + lag(tt, j, 1.1, 0.7) * neckAmp * f, r];
  });
}

// ほかの首（多頭型）：胴にくっついた根元から先へ揺れる
function animateNeck(n, idx, tt, bodyLift, k) {
  const m = n.pts.length - 1;
  return n.pts.map(([x, y, r], j) => {
    const f = j / Math.max(1, m);
    return [x + lag(tt, j, 0.9, 0.6 + idx) * (n.sway || 3) * 0.5 * f * k, y + bodyLift(j) + lag(tt + idx * 1.7, j, 1.1, 0.7) * (n.sway || 3) * f * k, r];
  });
}

// 頭の位置と向き（首の先の向きに少し遅れてついていく）
function headOf(ch, h) {
  const p = ch[ch.length - 1], q = ch[Math.max(0, ch.length - 4)];
  const ang = (h.ang || 0) + Math.atan2(p.y - q.y, p.x - q.x) * 0.18;
  return { x: p.x + h.r * 0.35, y: p.y - h.r * 0.1, r: h.r, snout: h.snout, ang };
}

// 骨組みの決まった点（rest の座標）に一番近い背骨の点と、そこからのずれ
function anchorOf(B, at) {
  let best = 0, bd = Infinity;
  B.raw.forEach(([x, y], i) => { const d = Math.hypot(x - at[0], y - at[1]); if (d < bd) { bd = d; best = i; } });
  return { i: best, dx: at[0] - B.raw[best][0], dy: at[1] - B.raw[best][1] };
}

function rig(g, tt, k = 1) {
  const B = baseSpine(g);
  const sk = B.sk;
  const per = 6;
  const animRaw = animateSpine(B, tt, k);
  const spine = smooth(animRaw, per);
  const lift = Math.sin(tt * 2) * 1.4 * k;
  const moved = (at) => { const a = anchorOf(B, at); const p = animRaw[a.i]; return [p[0] + a.dx, p[1] + a.dy, a.i]; };
  const necks = sk.necks.map((n, idx) => {
    if (idx === B.main) {
      const ch = spine.slice(B.bodyEnd * per);
      return { far: false, main: true, ch, head: headOf(ch, n.head) };
    }
    const pts = animateNeck(n, idx, tt, (j) => lift * (1 - j * 0.05) + Math.sin((tt - j * 0.2) * 2) * 0.4 * k, k);
    const ch = smooth(pts, per);
    return { far: !!n.far, main: false, ch, head: headOf(ch, n.head) };
  });
  // 脚は腰が背骨にくっつき、足は地面に残る
  const legs = (sk.legs || []).map((L) => {
    const [hx, hy] = moved(L.hip);
    const dy = hy - L.hip[1];
    return { ...L, hip: [hx, hy], knee: [L.knee[0], L.knee[1] + dy * 0.5], foot: L.foot };
  });
  const arms = (sk.arms || []).map((A) => {
    const [hx, hy] = moved(A.hip);
    const dx = hx - A.hip[0], dy = hy - A.hip[1];
    return { ...A, hip: [hx, hy], knee: [A.knee[0] + dx, A.knee[1] + dy * 0.9], foot: [A.foot[0] + dx, A.foot[1] + dy * 0.8 + Math.sin(tt * 2 - 0.6) * 0.8 * k] };
  });
  const wingAt = moved(sk.wing.at);
  return { B, sk, per, spine, necks, legs, arms, wing: { at: [wingAt[0], wingAt[1]], scale: sk.wing.scale } };
}

// ---------- 形 ----------
function headPolys(h, pal) {
  const r = h.r;
  const sx = r * 0.7 + h.snout * 0.4, sy = r * 0.22, srx = r * 0.45 + h.snout * 0.5, sry = r * 0.46;
  const local = [
    ellipsePoly(0, 0, r, r * 0.86, 0, 24),
    ellipsePoly(sx, sy, srx, sry, 0.05, 20),
    // あごの付け根を首になじませる
    ellipsePoly(-r * 0.15, r * 0.45, r * 0.7, r * 0.5, 0, 16),
  ];
  void pal;
  return { polys: local.map((p) => xf(p, h.x, h.y, h.ang)), sn: { sx, sy, srx, sry } };
}

function spikePoly(L, w, bend) {
  return [[-w / 2, 5], ...quadPts(-w / 2, 5, -w / 2 - bend * L * 0.18, -L * 0.55, -bend * L * 0.6, -L, 7), ...quadPts(-bend * L * 0.6, -L, w / 2 - bend * L * 0.3, -L * 0.45, w / 2, 5, 7)];
}

// 角（頭の上の決まった点に付く）。base と tip は色をなじませるのに使う
function hornShapes(st, h, far) {
  const r = h.r;
  const list = st.n === 1 ? [{ a: -1.75, k: 1 }] : far ? [{ a: -1.95, k: 0.85 }] : [{ a: -1.45, k: 1 }];
  const out = [];
  for (const it of list) {
    const bx = Math.cos(it.a) * r * 0.78, by = Math.sin(it.a) * r * 0.78;
    const rot = it.a + Math.PI / 2 - 0.55;
    const place = (poly) => xf(xf(poly, bx, by, rot, it.k), h.x, h.y, h.ang);
    const L = st.len, w = st.w;
    let polys = [];
    let tip = [-st.bend * L * 0.6, -L];
    if (st.kind === 'curl') {
      const pts = [];
      for (let i = 0; i <= 10; i++) {
        const t = i / 10, u = 1 - t;
        const x = u * u * u * 0 + 3 * u * u * t * (-L * 0.6) + 3 * u * t * t * (-L * 1.3) + t * t * t * (-L * 0.9);
        const y = u * u * u * 4 + 3 * u * u * t * (-L * 0.6) + 3 * u * t * t * (-L * 0.1) + t * t * t * (L * 0.35);
        pts.push([x, y, (w / 2) * (1 - t * 0.6)]);
      }
      polys = tubePolys(withNormals(pts.map(([x, y, rr]) => ({ x, y, r: rr }))), 2);
      tip = [-L * 0.9, L * 0.35];
    } else {
      polys.push(spikePoly(L, w, st.bend));
      if (st.kind === 'branch') {
        for (const [ty, rot2, k2] of [[-0.45, 0.9, 0.45], [-0.75, -0.8, 0.35]]) polys.push(xf(spikePoly(L * k2, w * 0.7, 0.1), -st.bend * L * Math.abs(ty) * 0.6, ty * L, rot2));
      }
    }
    const tp = place([tip])[0], bp = place([[0, 4]])[0];
    out.push({ polys: polys.map(place), base: bp, tip: tp });
  }
  return out;
}

// 背びれ（背骨の決まった範囲に、背中側の法線にそって並べる）
function finShapes(fins, ch, i0, i1, size) {
  if (!fins || fins.style.kind === 'none' || i1 - i0 < 3) return [];
  const st = fins.style;
  const tops = [];
  for (let i = i0; i <= i1; i++) {
    const p = ch[i];
    tops.push({ x: p.x + p.nx * p.r * 0.7, y: p.y + p.ny * p.r * 0.7, nx: p.nx, ny: p.ny, tx: p.dx, ty: p.dy, r: p.r });
  }
  const out = [];
  if (st.kind === 'sail') {
    const poly = [];
    tops.forEach((p, i) => { const e = Math.sin((i / (tops.length - 1)) * Math.PI); poly.push([p.x + p.nx * (size * e + p.r * 0.3), p.y + p.ny * (size * e + p.r * 0.3)]); });
    for (let i = tops.length - 1; i >= 0; i--) poly.push([tops[i].x - tops[i].nx * 2, tops[i].y - tops[i].ny * 2]);
    const mid = tops[Math.floor(tops.length / 2)];
    out.push({ poly, base: [mid.x, mid.y], tip: [mid.x + mid.nx * size, mid.y + mid.ny * size], ribs: tops.filter((_, i) => i % 3 === 0 && i > 0 && i < tops.length - 1).map((p) => { const i = tops.indexOf(p); const e = Math.sin((i / (tops.length - 1)) * Math.PI); return [p.x, p.y, p.x + p.nx * (size * e + p.r * 0.3), p.y + p.ny * (size * e + p.r * 0.3)]; }) });
    return out;
  }
  const step = st.kind === 'mane' ? 2 : 3;
  tops.forEach((p, i) => {
    if (i % step) return;
    const e = 0.6 + 0.4 * Math.sin((i / Math.max(1, tops.length - 1)) * Math.PI);
    const s = size * e;
    const T = (a, b) => [p.x + p.nx * b * s - p.tx * a * s, p.y + p.ny * b * s - p.ty * a * s];
    let poly;
    if (st.kind === 'spikes') poly = [T(0.45, -0.1), T(0.35, 1), T(-0.45, -0.1)];
    else if (st.kind === 'plates') poly = [T(0.5, -0.1), T(0.42, 0.7), T(0, 1), T(-0.42, 0.7), T(-0.5, -0.1)];
    else poly = [T(0.3, -0.1), ...quadPts(...T(0.3, -0.1), ...T(-0.1, 1.15), ...T(0.95, 0.65), 5), ...quadPts(...T(0.95, 0.65), ...T(0.1, 0.35), ...T(-0.35, -0.1), 4)];
    out.push({ poly, base: [p.x, p.y], tip: T(0, 1) });
  });
  return out;
}

// しっぽの先（背骨の始まり＝しっぽの先端に付く）
function tailTipShape(kind, ch) {
  if (kind === 'plain' || kind === 'flame' || ch.length < 4) return null;
  const p = ch[0], q = ch[3];
  const ang = Math.atan2(p.y - q.y, p.x - q.x);
  let local;
  if (kind === 'club') {
    local = [ellipsePoly(4, 0, 10, 10, 0, 16)];
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * TAU;
      local.push([[4 + Math.cos(a - 0.3) * 8, Math.sin(a - 0.3) * 8], [4 + Math.cos(a) * 17, Math.sin(a) * 17], [4 + Math.cos(a + 0.3) * 8, Math.sin(a + 0.3) * 8]]);
    }
  } else if (kind === 'blade') {
    local = [[[-6, 0], ...quadPts(-6, 0, 10, -22, 20, -20, 6), ...quadPts(20, -20, 12, 0, 22, 18, 6), ...quadPts(22, 18, 8, 16, -6, 0, 6)]];
  } else {
    local = [[[-4, 0], ...quadPts(-4, 0, 12, -14, 28, 0, 7), ...quadPts(28, 0, 12, 14, -4, 0, 7)]];
  }
  return { polys: local.map((poly) => xf(poly, p.x, p.y, ang)), base: [p.x, p.y], tip: xf([[24, 0]], p.x, p.y, ang)[0] };
}

function limbPolys(L) {
  const ch = smooth([[...L.hip, L.w / 2], [...L.knee, L.w * 0.42], [...L.foot, L.w * 0.36]], 4);
  return tubePolys(ch, 3);
}

function footPoly(L) { return ellipsePoly(L.foot[0] + L.w * 0.3, L.foot[1] - 2, L.w * 0.72, 5, 0, 14); }

// 翼（付け根から羽ばたく。先のほうは少し遅れて曲がる）
function wingShape(w, at, far, tt, k) {
  if (!w || w.style.kind === 'none') return null;
  const st = w.style;
  const s = at.scale * (far ? 0.9 : 1);
  const a1 = (far ? -0.12 : 0) + lag(tt, 0, 2.4, 0) * 0.16 * k * (far ? -0.8 : 1);
  const a2 = lag(tt, 1, 2.4, 0.7) * 0.12 * k;
  const ox = at.at[0] + (far ? 10 : 0), oy = at.at[1] - (far ? 6 : 0);
  const span = st.span;
  const place = (poly) => xf(xf(poly, 0, 0, 0, s), ox, oy, a1);
  if (st.kind === 'membrane') {
    const h = st.h;
    const elbow = [-span * 0.3, -h * 0.85];
    const bend = (pt) => xf([[pt[0] - elbow[0], pt[1] - elbow[1]]], elbow[0], elbow[1], a2)[0];
    const tips = [[-span * 0.75, -h * 0.95], [-span * 0.95, -h * 0.45], [-span * 0.8, -h * 0.05]].map(bend);
    const poly = [[4, 0], elbow, tips[0]];
    for (let i = 1; i < tips.length; i++) {
      const p = tips[i - 1], q = tips[i];
      poly.push(...quadPts(p[0], p[1], (p[0] + q[0]) / 2 + span * 0.12, (p[1] + q[1]) / 2, q[0], q[1], 6));
    }
    poly.push(...quadPts(tips[2][0], tips[2][1], -span * 0.4, h * 0.05, 2, 7, 7));
    const bones = [[[0, 0], elbow], ...tips.map((tp) => [elbow, tp])];
    return { polys: [place(poly)], bones: bones.map((b) => place(b)), joint: place([elbow])[0], kind: 'membrane' };
  }
  const polys = [], ribs = [];
  const n = st.kind === 'feather' ? 6 : 3;
  for (let i = 0; i < n; i++) {
    const a = st.kind === 'feather' ? -1.05 - i * 0.27 : -2.1 - i * 0.42;
    const len = span * (1 - i * (st.kind === 'feather' ? 0.07 : 0.15));
    const extra = a2 * (i / n);
    let p;
    if (st.kind === 'feather') p = ellipsePoly(len / 2, 0, len / 2, 8, 0, 18);
    else p = [[0, 0], ...quadPts(0, 0, len * 0.5, -len * 0.32, len, 0, 7), ...quadPts(len, 0, len * 0.5, len * 0.32, 0, 0, 7)];
    polys.push(place(xf(p, 0, 0, a + Math.PI + extra)));
    ribs.push(place(xf([[4, 0], [len * 0.88, 0]], 0, 0, a + Math.PI + extra)));
  }
  return { polys, ribs, kind: st.kind };
}

// ---------- 図の大きさ（中央合わせ用） ----------
const boundsCache = new Map();
export function dragonBounds(g) {
  const key = `${g.lineage}.${g.horns}.${g.wings}.${g.tail}.${g.fins}`;
  if (boundsCache.has(key)) return boundsCache.get(key);
  const R = rig(g, 0, 0);
  const polys = collect(g, R, 0, 1, 0).all;
  const b0 = bbox(polys);
  const b = { x0: b0.x0, x1: b0.x1, y0: b0.y0, y1: Math.max(b0.y1, GROUND + 4) };
  Object.assign(b, { w: b.x1 - b.x0, h: b.y1 - b.y0, cx: (b.x0 + b.x1) / 2, cy: (b.y0 + b.y1) / 2 });
  boundsCache.set(key, b);
  return b;
}

// 形をまとめて作る（描画と大きさ計算で共通）
function collect(g, R, tt, level, k) {
  const parts = {
    horns: part('horns', g.horns), wings: part('wings', g.wings), fins: part('fins', g.fins), tail: part('tail', g.tail),
  };
  const sk = R.sk;
  const per = R.per;
  const finK = level >= 3 ? 1.25 : 1;
  // 背びれの範囲を背骨の上の位置にする
  const sp = sk.spine;
  const n = R.spine.length - 1;
  const seg = { tail: [0, R.B.tailEnd * per], body: [R.B.tailEnd * per, R.B.bodyEnd * per], neck: [R.B.bodyEnd * per, n] }[sp.chain] || [0, n];
  // しっぽは背骨では先 → 根元の順なので、from/to は根元からの割合として読む
  let i0, i1;
  if (sp.chain === 'tail') { i1 = Math.round(seg[1] - sp.from * (seg[1] - seg[0])); i0 = Math.round(seg[1] - sp.to * (seg[1] - seg[0])); } else { i0 = Math.round(seg[0] + sp.from * (seg[1] - seg[0])); i1 = Math.round(seg[0] + sp.to * (seg[1] - seg[0])); }
  const fins = finShapes(parts.fins, R.spine, Math.max(1, i0), Math.min(n - 1, i1), (parts.fins ? parts.fins.style.size || 0 : 0) * finK);
  const tip = tailTipShape(parts.tail ? parts.tail.style.tip : 'plain', R.spine);
  const heads = R.necks.map((nk) => ({ nk, ...headPolys(nk.head), horns: hornShapes(parts.horns.style, nk.head, false), hornsFar: parts.horns.style.n >= 2 ? hornShapes(parts.horns.style, nk.head, true) : [] }));
  const nearLegs = R.legs.filter((L) => !L.far), farLegs = R.legs.filter((L) => L.far);
  const wingNear = wingShape(parts.wings, R.wing, false, tt, k), wingFar = wingShape(parts.wings, R.wing, true, tt, k);
  // 手前の体（1つの輪郭）
  const body = [...tubePolys(R.spine, 3)];
  for (const h of heads) if (!h.nk.far) { if (!h.nk.main) body.push(...tubePolys(h.nk.ch, 3)); body.push(...h.polys); }
  for (const L of nearLegs) body.push(...limbPolys(L), footPoly(L));
  const attach = [];
  for (const h of heads) if (!h.nk.far) for (const hr of h.horns) attach.push({ ...hr, kind: 'horn' });
  for (const f of fins) attach.push({ polys: [f.poly], base: f.base, tip: f.tip, ribs: f.ribs, kind: 'fin' });
  if (tip) attach.push({ ...tip, kind: 'tip' });
  // 奥の体（色を沈めて後ろに描く）
  const far = [];
  for (const L of farLegs) far.push(...limbPolys(L), footPoly(L));
  for (const h of heads) {
    if (h.nk.far) { far.push(...tubePolys(h.nk.ch, 3), ...h.polys); for (const hr of h.horns) far.push(...hr.polys); }
    for (const hr of h.hornsFar) far.push(...hr.polys);
  }
  const arms = R.arms.map((A) => [...limbPolys(A), ellipsePoly(A.foot[0], A.foot[1], A.w * 0.5, A.w * 0.42, 0, 12)]);
  const all = [...body, ...far, ...attach.flatMap((a) => a.polys), ...arms.flat()];
  for (const wg of [wingNear, wingFar]) if (wg) all.push(...wg.polys);
  return { parts, body, far, attach, heads, arms, wingNear, wingFar, all, fins };
}

// (x, y) を中心に、幅 size・高さ size*aspect の箱に収めて描く。anchor:'feet' なら y は足もと
export function drawDragonAt(ctx, g, x, y, size, opts = {}) {
  const b = dragonBounds(g);
  const lvK = 1 + 0.04 * ((opts.level || 1) - 1);
  const aspect = opts.aspect || 0.85;
  const s = Math.min(size / (b.w * lvK), (size * aspect) / (b.h * lvK));
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(opts.flip ? -s : s, s);
  if (opts.anchor === 'feet') ctx.translate(-b.cx, -GROUND);
  else ctx.translate(-b.cx, -b.cy);
  drawDragon(ctx, g, opts);
  ctx.restore();
  return s;
}

export function drawDragon(ctx, g, opts = {}) {
  const { t = 0, level = 1, silhouette = false, speed = 1, shadow = true } = opts;
  const pal = dragonPalette(g, silhouette);
  const tt = t * speed;
  const k = opts.still ? 0 : 1;
  const sc = 1 + 0.04 * (level - 1);
  const sk = lineageById(g.lineage).skeleton;
  const fl = sk.float ? Math.sin(tt * 1.7) * sk.float * 0.5 * k - sk.float : 0;

  ctx.save();
  ctx.translate(0, GROUND);
  ctx.scale(sc, sc);
  ctx.translate(0, -GROUND);
  const lw = LINE_PX * unitPx(ctx);
  if (shadow) {
    const b = dragonBounds(g);
    ctx.fillStyle = `rgba(40,30,20,${sk.float ? 0.14 : 0.22})`;
    ctx.beginPath();
    ctx.ellipse(b.cx - LIGHT.x * 8, GROUND + 2, b.w * (sk.float ? 0.22 : 0.36), 7, 0, 0, TAU);
    ctx.fill();
  }
  ctx.translate(0, fl);
  const R = rig(g, tt, k);
  const S = collect(g, R, tt, level, k);
  const farPal = farOf(pal);

  if (level >= 5 && !silhouette) {
    const gr = ctx.createRadialGradient(0, 0, 10, 0, 0, 130);
    gr.addColorStop(0, hexA(pal.light, 0.35));
    gr.addColorStop(1, hexA(pal.light, 0));
    ctx.fillStyle = gr;
    ctx.beginPath();
    ctx.arc(0, 0, 130, 0, TAU);
    ctx.fill();
  }

  // 1. 奥の翼 → 奥の脚・首
  if (S.wingFar) drawWing(ctx, S.wingFar, farPal, pal, lw);
  if (S.far.length) {
    const fp = solid(ctx, S.far, styleOf(farPal, lw));
    if (!pal.sil) inside(ctx, fp, () => { for (const h of S.heads) if (h.nk.far) face(ctx, h, farPal, tt, lw); });
  }
  // 2. 手前の体：体・頭・脚・角・背びれ・しっぽの先をまとめて1つの輪郭に
  const outline = toPath([...S.body, ...S.attach.flatMap((a) => a.polys)]);
  ctx.lineJoin = 'round';
  ctx.strokeStyle = styleOf(pal, lw).line;
  ctx.lineWidth = lw * 2;
  ctx.stroke(outline);
  const bodyPath = toPath(S.body);
  const st = styleOf(pal, lw);
  ctx.fillStyle = pal.sil ? pal.main : lightGradFor(ctx, S.body, st);
  ctx.fill(bodyPath);
  // 付けるもの：付け根は体の色、先は角・ひれの色
  for (const a of S.attach) {
    const tipCol = pal.sil ? pal.main : a.kind === 'horn' ? pal.horn : a.kind === 'fin' ? (S.parts.fins.style.kind === 'mane' ? mix(pal.accent, pal.light, 0.35) : mix(pal.main, pal.light, 0.45)) : g.tail === 'club' ? pal.horn : mix(pal.main, pal.accent, 0.45);
    const fill = pal.sil ? pal.main : rootToTip(ctx, a.base[0], a.base[1], a.tip[0], a.tip[1], pal.main, tipCol);
    ctx.fillStyle = fill;
    ctx.fill(toPath(a.polys));
    if (!pal.sil && a.ribs) {
      ctx.strokeStyle = hexA(mix(pal.main, pal.dark, 0.6), 0.6);
      ctx.lineWidth = lw * 0.6;
      ctx.beginPath();
      for (const [x0, y0, x1, y1] of a.ribs) { ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); }
      ctx.stroke();
    }
  }
  // 3. 体の中：腹・陰・光・模様（輪郭の外に出ない）
  if (!pal.sil) {
    inside(ctx, bodyPath, () => {
      const ch = R.spine;
      fillPoly(ctx, bandPoly(ch, -0.12, -1.05), hexA(mix(pal.main, pal.belly, 0.62), 0.85));
      fillPoly(ctx, bandPoly(ch, -0.62, -1.1), hexA(pal.dark, 0.28));
      fillPoly(ctx, bandPoly(ch, 0.38, 0.86), hexA(pal.light, 0.28));
      for (const h of S.heads) if (!h.nk.main && !h.nk.far) {
        fillPoly(ctx, bandPoly(h.nk.ch, -0.12, -1.05), hexA(mix(pal.main, pal.belly, 0.62), 0.85));
        fillPoly(ctx, bandPoly(h.nk.ch, 0.38, 0.86), hexA(pal.light, 0.28));
      }
      for (const L of R.legs) if (!L.far) {
        const ch2 = smooth([[...L.hip, L.w / 2], [...L.knee, L.w * 0.42], [...L.foot, L.w * 0.36]], 4);
        fillPoly(ctx, bandPoly(ch2, -0.4, -1.05), hexA(pal.dark, 0.25));
      }
      drawPattern(ctx, g.pattern, ch, pal, lw);
      if (g.ornament === 'scar') drawScar(ctx, ch.slice(R.B.tailEnd * R.per, R.B.bodyEnd * R.per + 1), lw);
      for (const h of S.heads) if (!h.nk.far) face(ctx, h, pal, tt, lw);
      // 爪
      ctx.fillStyle = pal.horn;
      for (const L of R.legs) if (!L.far) for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(L.foot[0] + L.w * 0.85 + i * 1.6 - 2, L.foot[1] - 4 + i * 2.2, 1.5, 0, TAU); ctx.fill(); }
    });
    // 角の節（巻き角）
    if (S.parts.horns.style.kind === 'curl') for (const a of S.attach) if (a.kind === 'horn') {
      ctx.strokeStyle = hexA(lineOf(pal.dark), 0.5);
      ctx.lineWidth = lw * 0.6;
      ctx.beginPath();
      ctx.arc((a.base[0] + a.tip[0]) / 2, (a.base[1] + a.tip[1]) / 2 - 3, 3, 0, Math.PI);
      ctx.stroke();
    }
  }
  // 4. 腕（二足型。体の前に出る）
  for (const A of S.arms) solid(ctx, A, styleOf(pal, lw));
  // 5. 飾り
  if (!pal.sil) {
    if (g.ornament === 'armor') drawArmor(ctx, R.spine.slice(R.B.tailEnd * R.per, R.B.bodyEnd * R.per + 1), level, lw);
    if (g.ornament === 'gem') for (const h of S.heads) if (h.nk.main) gem(ctx, h.nk.head, level, lw);
    if (g.ornament === 'charm') { const nk = S.heads.find((h) => h.nk.main).nk; drawCharm(ctx, nk.ch, tt, lw); }
    if (g.tail === 'flame') drawFlame(ctx, R.spine, tt);
  } else if (g.tail === 'flame') {
    const p = R.spine[0];
    ctx.fillStyle = pal.main;
    ctx.beginPath();
    ctx.arc(p.x - 6, p.y, 10, 0, TAU);
    ctx.fill();
  }
  // 6. 手前の翼
  if (S.wingNear) drawWing(ctx, S.wingNear, pal, pal, lw);
  ctx.restore();
}

function lightGradFor(ctx, polys, st) {
  const bb = bbox(polys);
  const R = Math.max(bb.w, bb.h) / 2 + 1;
  const gr = ctx.createLinearGradient(bb.cx + LIGHT.x * R, bb.cy + LIGHT.y * R, bb.cx - LIGHT.x * R, bb.cy - LIGHT.y * R);
  gr.addColorStop(0, st.light);
  gr.addColorStop(0.45, st.main);
  gr.addColorStop(1, st.dark);
  return gr;
}

// ---------- 顔 ----------
function face(ctx, H, pal, tt, lw) {
  const h = H.nk.head;
  const r = h.r;
  const sn = H.sn;
  ctx.save();
  ctx.translate(h.x, h.y);
  ctx.rotate(h.ang);
  // あごの線
  ctx.strokeStyle = lineOf(pal.dark);
  ctx.lineWidth = lw * 0.8;
  ctx.beginPath();
  ctx.moveTo(sn.sx - sn.srx * 0.4, sn.sy + r * 0.26);
  ctx.quadraticCurveTo(sn.sx + sn.srx * 0.3, sn.sy + r * 0.34, sn.sx + sn.srx * 0.85, sn.sy + r * 0.1);
  ctx.stroke();
  // 鼻
  ctx.fillStyle = lineOf(pal.dark);
  ctx.beginPath();
  ctx.ellipse(sn.sx + sn.srx * 0.65, sn.sy - r * 0.16, 2.2, 1.4, 0.3, 0, TAU);
  ctx.fill();
  // 目（細い瞳。ときどきまばたき）
  const ex = r * 0.22, ey = -r * 0.18;
  const blink = (tt % 4.6) > 4.45 ? 0.15 : 1;
  ctx.fillStyle = lineOf(pal.dark);
  ctx.beginPath();
  ctx.ellipse(ex, ey, r * 0.24, r * 0.2 * blink + 1, -0.15, 0, TAU);
  ctx.fill();
  if (blink === 1) {
    ctx.fillStyle = pal.eye;
    ctx.beginPath();
    ctx.ellipse(ex + 0.5, ey, r * 0.18, r * 0.14, -0.15, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#16120e';
    ctx.beginPath();
    ctx.ellipse(ex + 1.5, ey, r * 0.05, r * 0.12, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.beginPath();
    ctx.arc(ex - r * 0.05, ey - r * 0.06, 1.3, 0, TAU);
    ctx.fill();
  }
  // まゆの張り出し（体と同じ陰の色）
  ctx.strokeStyle = mix(pal.main, pal.dark, 0.65);
  ctx.lineWidth = lw;
  ctx.beginPath();
  ctx.moveTo(ex - r * 0.3, ey - r * 0.28);
  ctx.quadraticCurveTo(ex, ey - r * 0.38, ex + r * 0.34, ey - r * 0.22);
  ctx.stroke();
  ctx.restore();
}

// ---------- 翼 ----------
function drawWing(ctx, W, pal, basePal, lw) {
  const memb = pal.sil ? pal.main : mix(pal.main, basePal.accent, 0.32);
  const st = { light: pal.sil ? pal.main : mix(memb, pal.light, 0.45), main: memb, dark: pal.sil ? pal.main : mix(memb, pal.dark, 0.55), line: pal.sil ? pal.main : lineOf(pal.dark), lw, sil: pal.sil };
  solid(ctx, W.polys, st);
  if (pal.sil) return;
  ctx.lineCap = 'round';
  if (W.kind === 'membrane') {
    ctx.strokeStyle = mix(pal.main, pal.dark, 0.25);
    ctx.lineWidth = lw * 1.8;
    ctx.beginPath();
    for (const b of W.bones) { ctx.moveTo(b[0][0], b[0][1]); ctx.lineTo(b[1][0], b[1][1]); }
    ctx.stroke();
    ctx.fillStyle = pal.horn;
    ctx.beginPath();
    ctx.arc(W.joint[0], W.joint[1], lw * 1.3, 0, TAU);
    ctx.fill();
  } else {
    ctx.strokeStyle = hexA(lineOf(pal.dark), 0.55);
    ctx.lineWidth = lw * 0.6;
    ctx.beginPath();
    for (const r of W.ribs) { ctx.moveTo(r[0][0], r[0][1]); ctx.lineTo(r[1][0], r[1][1]); }
    ctx.stroke();
  }
}

// ---------- 模様（背中側。輪郭の内側だけ） ----------
function drawPattern(ctx, id, ch, pal, lw) {
  if (id === 'plain' || ch.length < 3) return;
  const col = mix(pal.main, pal.accent, 0.7);
  ctx.fillStyle = col;
  ctx.strokeStyle = col;
  for (let i = 2; i < ch.length - 2; i++) {
    const p = ch[i];
    const r = p.r;
    if (id === 'spots' && i % 4 === 1 && r > 7) {
      ctx.beginPath();
      ctx.ellipse(p.x + p.nx * r * 0.45 + (i % 8 === 1 ? 3 : -3) * p.dx, p.y + p.ny * r * 0.45, r * 0.2, r * 0.15, Math.atan2(p.dy, p.dx), 0, TAU);
      ctx.fill();
    } else if (id === 'stripes' && i % 4 === 0) {
      ctx.lineWidth = Math.max(lw, r * 0.2);
      ctx.beginPath();
      ctx.moveTo(p.x + p.nx * r * 1.1, p.y + p.ny * r * 1.1);
      ctx.lineTo(p.x + p.nx * r * 0.05, p.y + p.ny * r * 0.05);
      ctx.stroke();
    } else if (id === 'scales' && i % 2 === 0 && r > 6) {
      ctx.lineWidth = lw * 0.6;
      for (const off of [0.25, 0.6]) {
        ctx.beginPath();
        const cx = p.x + p.nx * r * off, cy = p.y + p.ny * r * off;
        const a = Math.atan2(-p.ny, -p.nx);
        ctx.arc(cx, cy, Math.max(2.5, r * 0.16), a - 1.2, a + 1.2);
        ctx.stroke();
      }
    } else if (id === 'rings' && i % 6 === 3) {
      ctx.lineWidth = Math.max(lw, r * 0.24);
      ctx.strokeStyle = hexA(mix(pal.main, pal.dark, 0.45), 0.55);
      ctx.beginPath();
      ctx.moveTo(p.x + p.nx * r * 1.1, p.y + p.ny * r * 1.1);
      ctx.lineTo(p.x - p.nx * r * 1.1, p.y - p.ny * r * 1.1);
      ctx.stroke();
      ctx.strokeStyle = col;
    }
  }
}

// ---------- 飾り（体と同じ線の太さ・同じ光の向き） ----------
function drawArmor(ctx, ch, level, lw) {
  const n = ch.length;
  for (let i = Math.floor(n * 0.15); i < n * 0.9; i += 3) {
    const p = ch[i];
    const cx = p.x + p.nx * p.r * 0.5, cy = p.y + p.ny * p.r * 0.5;
    const ang = Math.atan2(p.dy, p.dx);
    const poly = xf(ellipsePoly(0, 0, p.r * 0.5, p.r * 0.42, 0, 14).filter(([, y]) => y <= 0.5), cx, cy, ang);
    solid(ctx, [poly], { light: '#e2e4ea', main: '#a9aeb8', dark: '#6a707c', line: '#2a2e34', lw: lw * 0.8 });
    if (level >= 4) { ctx.fillStyle = '#e8c35a'; ctx.beginPath(); ctx.arc(cx, cy - p.r * 0.1, 1.8, 0, TAU); ctx.fill(); }
  }
}

function drawScar(ctx, ch, lw) {
  const p = ch[Math.floor(ch.length * 0.55)];
  if (!p) return;
  ctx.strokeStyle = 'rgba(240,226,206,0.8)';
  ctx.lineWidth = lw * 0.9;
  ctx.lineCap = 'round';
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    ctx.moveTo(p.x - p.r * 0.35 + i * 5, p.y - p.r * 0.55);
    ctx.lineTo(p.x - p.r * 0.05 + i * 5, p.y + p.r * 0.05);
    ctx.stroke();
  }
}

function drawCharm(ctx, ch, tt, lw) {
  const p = ch[Math.floor(ch.length * 0.3)];
  if (!p) return;
  ctx.strokeStyle = '#b8892e';
  ctx.lineWidth = lw * 1.2;
  ctx.beginPath();
  ctx.moveTo(p.x + p.nx * p.r, p.y + p.ny * p.r);
  ctx.lineTo(p.x - p.nx * p.r, p.y - p.ny * p.r);
  ctx.stroke();
  // 首の動きに少し遅れて揺れる
  const sw = Math.sin(tt * 2 - 1.2) * 2;
  const bx = p.x - p.nx * p.r + sw, by = p.y - p.ny * p.r;
  solid(ctx, [[[bx, by + 1], [bx + 5, by + 8], [bx, by + 15], [bx - 5, by + 8]]], { light: '#a8e0e8', main: '#5fb0c0', dark: '#2f6a74', line: '#1e3c3e', lw: lw * 0.8 });
}

function gem(ctx, h, level, lw) {
  const p = xf([[h.r * 0.05, -h.r * 0.62]], h.x, h.y, h.ang)[0];
  const [x, y] = p;
  if (level >= 4) {
    const gl = ctx.createRadialGradient(x, y, 1, x, y, 12);
    gl.addColorStop(0, 'rgba(255,120,150,0.6)');
    gl.addColorStop(1, 'rgba(255,120,150,0)');
    ctx.fillStyle = gl;
    ctx.beginPath();
    ctx.arc(x, y, 12, 0, TAU);
    ctx.fill();
  }
  solid(ctx, [[[x, y - 5], [x + 4, y], [x, y + 5], [x - 4, y]]], { light: '#ff9ab4', main: '#d04a6a', dark: '#8a2440', line: '#5a3a1a', lw: lw * 0.8 });
}

function drawFlame(ctx, ch, tt) {
  const p = ch[0], q = ch[3];
  const ang = Math.atan2(p.y - q.y, p.x - q.x);
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(ang);
  const f = Math.sin(tt * 9) * 3;
  const gl = ctx.createRadialGradient(10, 0, 2, 10, 0, 26);
  gl.addColorStop(0, 'rgba(255,160,60,0.5)');
  gl.addColorStop(1, 'rgba(255,120,40,0)');
  ctx.fillStyle = gl;
  ctx.beginPath();
  ctx.arc(10, 0, 26, 0, TAU);
  ctx.fill();
  for (const [col, k] of [['#e0572e', 1], ['#ffc65a', 0.55]]) {
    ctx.beginPath();
    ctx.moveTo(-2, -8 * k);
    ctx.quadraticCurveTo(14 * k, -14 * k + f, 26 * k + 4, f);
    ctx.quadraticCurveTo(14 * k, 14 * k + f, -2, 8 * k);
    ctx.closePath();
    ctx.fillStyle = col;
    ctx.fill();
  }
  ctx.restore();
}
