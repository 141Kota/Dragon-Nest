// ドラゴン描画（360°対応）
// 系統（DATA.lineages[].skeleton）ごとに、しっぽの先 → 胴 → 首 → 頭 を1本につないだ骨組み（背骨）を持つ。
// - 骨組みは 3D（X: 前、Y: 左、Z: 上）。向き（yaw）に合わせて回し、2D に投影して描く（rig.js の view）
// - 体は背骨に沿った玉の連なりで、しっぽ・胴・首と頭・脚・腕・角・翼を部品に分け、奥にあるものから描く
// - つなぎ目は塗り直して線を消す（rig.js の drawPieces）。全体で同じ塗り（上が明るく下が暗い）と同じ細い線
// - 動きは骨組みから作る：息で胴が上下し、首としっぽは根元から先へ遅れて追従し、翼は付け根から先へ遅れて動く
// - 系統ごとに歩き方と待機の動きを変える（data.js の skeleton.motion）
import { part, lineageById } from './data.js';
import {
  TAU, mix, hexA, lineOf, add, sub, mul, dot, cross, norm, len, at, lerp3, frame, view, smooth3, beadPolys, projChain, projPoly, meanD,
  circle3, capPoly, ellipsePoly, toPath, bbox, look, inside, fillPoly, strokePts, rootToTip, lag, unitPx, offscreen, screenSize,
  drawPieces, paintBody, groundShadow, LINE_PX, LIGHT, quad3,
} from './rig.js';

const GROUND = 70;
const PER = 4;
const SIL = { main: '#3a3f4b', light: '#3a3f4b', dark: '#3a3f4b', belly: '#3a3f4b', accent: '#3a3f4b', eye: '#3a3f4b', horn: '#3a3f4b', sil: true };
const UP = [0, 0, 1];

export function dragonPalette(g, silhouette = false) {
  if (silhouette) return SIL;
  const c = part('color', g.color) || part('color', 'moss');
  return g.shiny ? { ...c, ...c.shiny } : { ...c };
}

// 個体ごとの小さな違い（左右を完全な対称にしない）
function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
const quirkCache = new Map();
function quirkOf(g) {
  const key = [g.lineage, g.horns, g.wings, g.fins, g.tail, g.pattern, g.ornament, g.color, g.shiny ? 1 : 0].join('.');
  if (quirkCache.has(key)) return quirkCache.get(key);
  const h = hashStr(key);
  const q = {
    chip: h % 3 === 0 ? ((h >> 3) & 1 ? 1 : -1) : 0, // 片方の角が欠けている
    nick: ((h >> 5) & 3) === 0 ? ((h >> 7) & 1 ? 1 : -1) : 0, // 翼のふちの切れこみ
    side: (h >> 9) & 1 ? 1 : -1, // 傷や飾りが付く側
    hornK: 1 + (((h >> 11) % 7) - 3) * 0.025, // 左右の角の長さの違い
    phase: ((h >> 14) % 100) / 100 * TAU, // 動きの位相
    tilt: (((h >> 20) % 5) - 2) * 0.04, // 頭の傾けぐせ
  };
  quirkCache.set(key, q);
  return q;
}

// ---------- 骨組み ----------
const near = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]) < 4;
const to3 = (cx, x, y, r = 0, side = 0) => [x - cx, side, GROUND - y, r];

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
  const push = (p) => { const l = raw[raw.length - 1]; if (!near(l, p)) raw.push(p); else raw[raw.length - 1] = [l[0], l[1], Math.max(l[2], p[2])]; };
  const tailEnd = raw.length - 1;
  sk.body.pts.forEach(push);
  const bodyEnd = raw.length - 1;
  sk.necks[main].pts.forEach(push);
  let minX = Infinity, maxX = -Infinity;
  for (const [x, , r] of raw) { minX = Math.min(minX, x - r); maxX = Math.max(maxX, x + r + 20); }
  const cx = (minX + maxX) / 2;
  const out = { raw, raw3: raw.map(([x, y, r]) => to3(cx, x, y, r)), tailEnd, bodyEnd, main, sk, cx };
  baseCache.set(key, out);
  return out;
}

// 背骨を動かす。部位ごとに、根元から先へ少しずつ遅れて追従する
function animateSpine(B, tt, k, walk, motion) {
  const { raw3, tailEnd, bodyEnd, sk } = B;
  const n = raw3.length;
  const tailAmp = (sk.tail.sway || 6) * k, neckAmp = (sk.necks[B.main].sway || 3) * k;
  const breath = (u) => Math.sin(u * 2) * 1.4 * k;
  const ph = tt * 7.5;
  return raw3.map(([x, y, z, r], i) => {
    let X = x, Y = y, Z = z, R = r;
    if (i <= tailEnd) {
      const j = tailEnd - i, f = j / Math.max(1, tailEnd);
      Y += lag(tt, j, 1.2, 0.6) * tailAmp * 0.9 * Math.pow(f, 1.2) * (walk ? 1.6 : 1);
      Z += breath(tt - j * 0.18) * (1 - f * 0.4) + lag(tt, j, 1.6, 0.75) * tailAmp * 0.35 * Math.pow(f, 1.3);
    } else if (i <= bodyEnd) {
      Z += breath(tt);
      R *= 1 + Math.sin(tt * 2) * 0.03 * k;
    } else {
      const j = i - bodyEnd, f = j / Math.max(1, n - 1 - bodyEnd);
      Z += breath(tt - j * 0.2) + lag(tt, j, 1.1, 0.7) * neckAmp * f;
      X += lag(tt, j, 0.9, 0.6) * neckAmp * 0.5 * f;
      Y += Math.sin(tt * 0.5 - j * 0.3) * neckAmp * 0.5 * f * k;
    }
    const u = i / (n - 1);
    if (motion === 'slither') {
      // 体全体がくねる（進むときは大きく）
      const amp = (walk ? 9 : 3.5) * k * (0.35 + 0.65 * Math.sin(u * Math.PI));
      Y += Math.sin(tt * (walk ? 6 : 1.4) - u * 7) * amp;
    } else if (walk && (motion === 'stride' || motion === 'stomp' || motion === 'sway')) {
      Z += Math.abs(Math.cos(ph)) * (motion === 'stomp' ? 2.4 : 1.4) * k;
      if (motion === 'stomp') Y += Math.sin(ph) * 1.6 * k * (1 - Math.abs(u - 0.5));
    } else if (motion === 'drift') {
      Y += Math.sin(tt * 0.9 - u * 3) * 2.5 * k;
    }
    return [X, Y, Z, R];
  });
}

// 骨組みの決まった点（横から見た座標）に一番近い背骨の点と、そこでの動き
function anchorOf(B, anim, x, y) {
  let best = 0, bd = Infinity;
  B.raw.forEach(([px, py], i) => { const d = Math.hypot(px - x, py - y); if (d < bd) { bd = d; best = i; } });
  const a = anim[best], b = B.raw3[best];
  return { i: best, delta: [a[0] - b[0], a[1] - b[1], a[2] - b[2]], r: b[3] };
}

// 頭の向きと形（首の先の向きに少し遅れてついていく）
function headOf(tip, prev, h, yawOff, q) {
  const t = norm(sub(tip, prev));
  const neckAng = Math.atan2(t[2], Math.hypot(t[0], t[1]));
  const ang = (h.ang || 0) - neckAng * 0.18 + q.tilt * 0.5;
  const f = norm([Math.cos(ang) * Math.cos(yawOff), Math.cos(ang) * Math.sin(yawOff), -Math.sin(ang)]);
  const F = frame(f);
  const r = h.r, sn = h.snout;
  const C = at(tip, F.f, r * 0.35, F.u, r * 0.1);
  const P = (a, b, c, rr) => [...at(C, F.f, a, F.u, b, F.l, c), rr];
  const skull = [P(-r * 0.35, 0, 0, r * 0.8), P(0, 0, 0, r * 0.88), P(r * 0.55, -r * 0.12, 0, r * 0.6), P(r * 0.75 + sn * 0.45, -r * 0.2, 0, r * 0.42), P(r * 0.95 + sn * 0.85, -r * 0.25, 0, r * 0.22)];
  const jaw = [P(r * 0.05, -r * 0.42, 0, r * 0.5), P(r * 0.6 + sn * 0.5, -r * 0.42, 0, r * 0.3), P(r * 0.85 + sn * 0.75, -r * 0.37, 0, r * 0.17)];
  const extra = [];
  for (const s of [1, -1]) {
    // 眉の骨のはり出し
    extra.push([P(r * 0.4, r * 0.4, s * r * 0.36, r * 0.27)]);
    // ほおの後ろのとげ
    extra.push([P(-r * 0.15, -r * 0.08, s * r * 0.6, r * 0.18), P(-r * 0.62, r * 0.02, s * r * 0.78, r * 0.05)]);
  }
  return { C, F, r, sn, skull, jaw, extra, nose: at(C, F.f, r * 0.95 + sn * 0.85, F.u, -r * 0.2), neckTip: tip };
}

function rig(g, tt, k, walk) {
  const B = baseSpine(g);
  const sk = B.sk;
  const q = quirkOf(g);
  const motion = sk.motion || 'stride';
  const anim = animateSpine(B, tt, k, walk, motion);
  const spine = smooth3(anim, PER);
  const cx = B.cx;
  const lookYaw = Math.sin(tt * 0.45 + q.phase) * 0.22 * k;
  const necks = sk.necks.map((n, idx) => {
    if (idx === B.main) {
      const ch = spine.slice(B.bodyEnd * PER);
      return { main: true, ch, head: headOf(ch[ch.length - 1], ch[Math.max(0, ch.length - 5)], n.head, lookYaw, q) };
    }
    const side = n.far ? 1 : -1;
    const m = n.pts.length - 1;
    const anc = anchorOf(B, anim, n.pts[0][0], n.pts[0][1]);
    const pts = n.pts.map(([x, y, r], j) => {
      const f = j / Math.max(1, m);
      const p = to3(cx, x, y, r);
      return [p[0] + anc.delta[0] + lag(tt, j, 0.9, 0.6 + idx) * (n.sway || 3) * 0.5 * f * k, side * 15 * f + anc.delta[1], p[2] + anc.delta[2] + lag(tt + idx * 1.7, j, 1.1, 0.7) * (n.sway || 3) * f * k, r];
    });
    const ch = smooth3(pts, PER);
    return { main: false, ch, side, root: ch[0], head: headOf(ch[ch.length - 1], ch[Math.max(0, ch.length - 5)], n.head, lookYaw + side * 0.35, q) };
  });
  // 脚：腰は背骨にくっつき、足は地面に残る。歩くときは歩幅をとって交互に出す
  const ph = tt * 7.5;
  const legs = [];
  (sk.legs || []).filter((L) => !L.far).forEach((L, li) => {
    const anc = anchorOf(B, anim, L.hip[0], L.hip[1]);
    for (const side of [1, -1]) {
      const lat = anc.r * 0.55 * side;
      const hip = add(to3(cx, L.hip[0], L.hip[1], 0, lat), anc.delta);
      let foot = to3(cx, L.foot[0], L.foot[1], 0, lat * 1.05);
      const mid0 = [(L.hip[0] + L.foot[0]) / 2, (L.hip[1] + L.foot[1]) / 2];
      const kneeOff = [L.knee[0] - mid0[0], 0, -(L.knee[1] - mid0[1])];
      const fl = sk.float;
      if (walk && !fl) {
        const p = ph + (motion === 'stride' || motion === 'sway' ? li * Math.PI : 0) + (side > 0 ? Math.PI : 0);
        foot = [foot[0] + Math.cos(p) * L.w * 0.75 * k, foot[1], foot[2] + Math.max(0, Math.sin(p)) * L.w * 0.65 * k];
      } else if (fl) {
        foot = add(foot, [Math.sin(tt * 1.7 + side) * 2 * k, 0, anc.delta[2] * 0.8]);
      }
      const knee = add(lerp3(hip, foot, 0.5), kneeOff);
      legs.push({ side, w: L.w, hip, knee, foot, li });
    }
  });
  const arms = [];
  for (const A of sk.arms || []) {
    const anc = anchorOf(B, anim, A.hip[0], A.hip[1]);
    for (const side of [1, -1]) {
      const lat = anc.r * 0.62 * side;
      const sh = add(to3(cx, A.hip[0], A.hip[1], 0, lat), anc.delta);
      const sw = (walk ? Math.sin(ph + (side > 0 ? 0 : Math.PI)) * 5 : Math.sin(tt * 2 - 0.6) * 0.8) * k;
      const elbow = add(to3(cx, A.knee[0], A.knee[1], 0, lat * 1.15), [anc.delta[0] + sw * 0.5, 0, anc.delta[2] * 0.9]);
      const hand = add(to3(cx, A.foot[0], A.foot[1], 0, lat * 1.05), [anc.delta[0] + sw, 0, anc.delta[2] * 0.8]);
      arms.push({ side, w: A.w, hip: sh, knee: elbow, foot: hand });
    }
  }
  const wa = anchorOf(B, anim, sk.wing.at[0], sk.wing.at[1]);
  const wingRoot = (side) => add(to3(cx, sk.wing.at[0], sk.wing.at[1], 0, wa.r * 0.45 * side), wa.delta);
  return { B, sk, q, motion, spine, necks, legs, arms, wingRoot, wingScale: sk.wing.scale, float: sk.float || 0 };
}

// ---------- 形（3D） ----------
// 背骨の i 番目の点での向き（T: 頭の方向、U: 背中側、L: 左）
// 立った体（二足型の胴など）では、背中側は後ろ（X-）になる
function spineFrame(ch, i) {
  const a = ch[Math.max(0, i - 1)], b = ch[Math.min(ch.length - 1, i + 1)];
  const T = norm(sub(b, a));
  const v = Math.abs(T[2]);
  return frame(T, norm([-v * 1.4 * Math.sign(T[2] || 1), 0, 1 - v * 0.6]));
}

// 角（頭の上の決まった点に付き、後ろへ流れる）
function hornChains(st, H, q, far) {
  const { C, F, r } = H;
  const out = [];
  const sides = st.n === 1 ? [0] : [1, -1];
  for (const side of sides) {
    if (far && side === 0) continue;
    const chip = q.chip === side && side !== 0;
    const L = st.len * (side > 0 ? q.hornK : 2 - q.hornK) * (chip ? 0.62 : 1);
    const w = st.w;
    let base, dir;
    if (side === 0) {
      base = at(C, F.f, r * 0.28, F.u, r * 0.66);
      dir = norm(at([0, 0, 0], F.u, 0.85, F.f, -0.35));
    } else if (st.kind === 'curl') {
      base = at(C, F.f, -r * 0.3, F.u, r * 0.62, F.l, side * r * 0.5);
      dir = norm(at([0, 0, 0], F.f, -0.8, F.u, 0.4, F.l, side * 0.3));
    } else {
      base = at(C, F.f, -r * 0.05, F.u, r * 0.55, F.l, side * r * 0.42);
      dir = norm(at([0, 0, 0], F.f, -0.78, F.u, 0.5 + (st.kind === 'branch' ? 0.25 : 0), F.l, side * 0.24));
    }
    const chains = [];
    const main = [];
    const n = 7;
    if (st.kind === 'curl') {
      for (let i = 0; i <= 12; i++) {
        const t = i / 12, th = t * Math.PI * 1.45;
        const R = L * 0.36 * (1 - 0.35 * t);
        const p = at(base, F.f, -R * Math.sin(th) - r * 0.15 * t, F.u, -R * (1 - Math.cos(th)) * 0.85 + r * 0.1 * t, F.l, side * (R * 0.6 * t + 4 * t));
        main.push([...p, (w / 2) * (1 - t * 0.62)]);
      }
    } else {
      for (let i = 0; i <= n; i++) {
        const t = i / n;
        const p = at(base, dir, L * t, F.u, -st.bend * L * 0.35 * t * t, F.f, -st.bend * L * 0.12 * t * t);
        main.push([...p, (w / 2) * (1 - t * (chip ? 0.45 : 0.88)) + 0.4]);
      }
      if (st.kind === 'branch' && !chip) {
        for (const [ti, kL] of [[0.42, 0.42], [0.7, 0.3]]) {
          const b = main[Math.round(ti * n)];
          const d2 = norm(at(dir, F.u, 0.8, F.f, 0.35));
          const tine = [];
          for (let i = 0; i <= 4; i++) { const t = i / 4; tine.push([...at(b, d2, L * kL * t), (w * 0.34) * (1 - t * 0.85) + 0.3]); }
          chains.push(tine);
        }
      }
    }
    chains.unshift(main);
    out.push({ side, chains, base: main[0], tip: main[main.length - 1], chip, w });
  }
  return out;
}

// 背びれ（背骨の決まった範囲に、背中側にそって並べる。厚みを少し持たせる）
function finShapes(fins, ch, i0, i1, size) {
  if (!fins || fins.style.kind === 'none' || i1 - i0 < 3) return [];
  const st = fins.style;
  const out = [];
  if (st.kind === 'sail') {
    const top = [], base = [];
    for (let i = i0; i <= i1; i++) {
      const F = spineFrame(ch, i), p = ch[i];
      const e = Math.sin(((i - i0) / (i1 - i0)) * Math.PI);
      base.push(at(p, F.u, p[3] * 0.55));
      top.push(at(p, F.u, p[3] * 0.7 + size * e, F.f, -size * 0.25 * e));
    }
    const ribs = [];
    for (let k = 2; k < top.length - 1; k += 3) ribs.push([base[k], top[k]]);
    out.push({ pts: [...top, ...base.reverse()], ribs, kind: 'sail', i: Math.round((i0 + i1) / 2) });
    return out;
  }
  const step = st.kind === 'mane' ? 2 : 3;
  for (let i = i0; i <= i1; i += step) {
    const F = spineFrame(ch, i), p = ch[i];
    const e = 0.6 + 0.4 * Math.sin(((i - i0) / Math.max(1, i1 - i0)) * Math.PI);
    const s = size * e;
    const ridge = at(p, F.u, p[3] * 0.7);
    const T = (a, b, c = 0) => at(ridge, F.f, -a * s, F.u, b * s, F.l, c);
    let pts;
    if (st.kind === 'spikes') pts = [T(0.45, -0.15), T(0.38, 1.05), T(-0.45, -0.15)];
    else if (st.kind === 'plates') pts = [T(0.5, -0.15), T(0.44, 0.7), T(0.05, 1), T(-0.4, 0.7), T(-0.5, -0.15)];
    else pts = [T(0.3, -0.15), ...quad3(T(0.3, -0.15), T(-0.1, 1.15), T(0.95, 0.65), 5), ...quad3(T(0.95, 0.65), T(0.1, 0.35), T(-0.35, -0.15), 4)];
    out.push({ pts, kind: st.kind, i, thick: F.l });
  }
  return out;
}

// しっぽの先（背骨の始まり＝しっぽの先端に付く）
function tailTip(kind, ch) {
  if (kind === 'plain' || kind === 'flame' || ch.length < 4) return null;
  const p = ch[0];
  const F = frame(sub(ch[0], ch[3]), UP);
  if (kind === 'club') {
    const chains = [[[...at(p, F.f, 4), 10]]];
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU;
      const d = norm(at([0, 0, 0], F.u, Math.cos(a), F.l, Math.sin(a), F.f, 0.25));
      chains.push([[...at(p, F.f, 4, d, 7), 3.2], [...at(p, F.f, 4, d, 16), 0.5]]);
    }
    return { chains, flatPts: null, base: p, tip: at(p, F.f, 18) };
  }
  // 平たい形（ひれ・葉）。ひれは縦、葉は斜めの面に
  const ax = kind === 'blade' ? F.u : norm(at([0, 0, 0], F.u, 0.5, F.l, 0.85));
  const loc = kind === 'blade'
    ? [[-6, 0], ...quadLocal(-6, 0, 10, 22, 20, 20, 6), ...quadLocal(20, 20, 12, 0, 22, -18, 6), ...quadLocal(22, -18, 8, -16, -6, 0, 6)]
    : [[-4, 0], ...quadLocal(-4, 0, 12, 14, 28, 0, 7), ...quadLocal(28, 0, 12, -14, -4, 0, 7)];
  return { chains: null, flatPts: loc.map(([a, b]) => at(p, F.f, a, ax, b)), base: p, tip: at(p, F.f, 24), mid: [at(p, F.f, -2), at(p, F.f, 24)] };
}
function quadLocal(x0, y0, cx, cy, x1, y1, n) {
  const out = [];
  for (let i = 1; i <= n; i++) { const t = i / n, u = 1 - t; out.push([u * u * x0 + 2 * u * t * cx + t * t * x1, u * u * y0 + 2 * u * t * cy + t * t * y1]); }
  return out;
}

// 翼：付け根から外へ（outward-up）と後ろへ（back）の面に形を置く。ひじから先は少し遅れて曲がる
function wingGeom(w, root, side, scale, tt, k, motion, walk, nick) {
  if (!w || w.style.kind === 'none') return null;
  const st = w.style;
  const spread = motion === 'spread';
  const flap = (spread ? 0.3 : 0.13) * (walk ? 1.5 : 1) * k;
  const a1 = (spread ? 0.55 : 1.0) + lag(tt, 0, spread ? 2.6 : 2.2, 0) * flap;
  const a2 = a1 + 0.22 + lag(tt, 1, spread ? 2.6 : 2.2, 0.8) * flap * 0.9;
  const S1 = [0, side * Math.cos(a1), Math.sin(a1)], S2 = [0, side * Math.cos(a2), Math.sin(a2)];
  const BK = norm([-1, 0, 0.12]);
  const span = (st.span || 60) * scale;
  const ue = span * 0.42;
  const P = (u, v) => at(root, S1, Math.min(u, ue), S2, Math.max(0, u - ue), BK, v);
  const out = { kind: st.kind, side, root };
  if (st.kind === 'membrane') {
    const L = span, hk = ((st.h || span * 0.75) / span) / 0.75;
    const V = (v) => v * L * hk;
    const elbow = [0.42 * L, V(-0.05)], wrist = [0.8 * L, V(-0.14)];
    const tips = [[1.12 * L, V(0.12)], [0.98 * L, V(0.52)], [0.6 * L, V(0.82)]];
    const tr = [0.05 * L, V(0.56)];
    const poly2 = [[0, 0], elbow, wrist, tips[0]];
    const scal = (a, b, deep) => {
      const m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      const c = [m[0] + (wrist[0] - m[0]) * deep, m[1] + (wrist[1] - m[1]) * deep];
      return quadLocal(a[0], a[1], c[0], c[1], b[0], b[1], 6);
    };
    poly2.push(...scal(tips[0], tips[1], 0.22));
    if (nick === side) {
      // 切れこみ
      const m = [(tips[1][0] + tips[2][0]) / 2, (tips[1][1] + tips[2][1]) / 2];
      poly2.push(...scal(tips[1], m, 0.18), [m[0] - L * 0.08, m[1] - L * 0.04], ...scal(m, tips[2], 0.1));
    } else poly2.push(...scal(tips[1], tips[2], 0.26));
    const trc = [(tips[2][0] + tr[0]) / 2 + L * 0.02, (tips[2][1] + tr[1]) / 2 - L * 0.02];
    poly2.push(...quadLocal(tips[2][0], tips[2][1], trc[0], trc[1], tr[0], tr[1], 6));
    out.poly = poly2.map(([u, v]) => P(u, v));
    out.bones = [[[0, 0], elbow, wrist], [wrist, tips[0]], [wrist, tips[1]], [wrist, tips[2]]].map((b) => b.map(([u, v]) => P(u, v)));
    out.claw = [P(wrist[0], wrist[1]), P(wrist[0] + L * 0.04, wrist[1] - L * 0.1)];
    out.edge = P(L, V(0.4));
    return out;
  }
  if (st.kind === 'feather') {
    const L = span;
    out.feathers = [];
    for (let i = 0; i < 7; i++) {
      const u0 = L * (0.18 + i * 0.12);
      const len2 = L * (0.42 + 0.22 * Math.sin((i / 6) * Math.PI)) * (i === 6 ? 0.9 : 1);
      const ang = 0.35 + i * 0.13;
      const e = [u0 + Math.sin(ang) * len2 * 0.4, Math.cos(ang) * len2];
      const m = [(u0 + e[0]) / 2, e[1] / 2];
      const wd = L * 0.075;
      const nx = -(e[1]) / len2, ny = (e[0] - u0) / len2;
      const loc = [[u0, 0], ...quadLocal(u0, 0, m[0] + nx * wd, m[1] + ny * wd, e[0], e[1], 5), ...quadLocal(e[0], e[1], m[0] - nx * wd, m[1] - ny * wd, u0, 0, 5)];
      out.feathers.push({ pts: loc.map(([u, v]) => P(u, v)), quill: [P(u0, 0), P(e[0], e[1])] });
    }
    out.bones = [[P(0, 0), P(L * 0.45, 0), P(L * 0.95, L * 0.04)]];
    return out;
  }
  // 葉の翼
  const L = span;
  out.bones = [];
  out.leaves = [];
  for (const [ang, kL] of [[0.18, 1], [0.62, 0.86], [1.05, 0.7]]) {
    const ln = L * kL;
    const e = [Math.cos(ang) * ln, Math.sin(ang) * ln];
    const m = [e[0] / 2, e[1] / 2];
    const wd = ln * 0.2;
    const nx = -Math.sin(ang), ny = Math.cos(ang);
    const loc = [[0, 0], ...quadLocal(0, 0, m[0] + nx * wd, m[1] + ny * wd, e[0], e[1], 6), ...quadLocal(e[0], e[1], m[0] - nx * wd, m[1] - ny * wd, 0, 0, 6)];
    out.leaves.push({ pts: loc.map(([u, v]) => P(u, v)), rib: [P(0, 0), P(e[0], e[1])] });
  }
  return out;
}

// ---------- 図の大きさ（中央合わせ用。どの向きでも同じ大きさに見えるよう、何方向かの和をとる） ----------
const boundsCache = new Map();
export function dragonBounds(g, pitch = 0.3) {
  const key = `${g.lineage}.${g.horns}.${g.wings}.${g.tail}.${g.fins}.${pitch.toFixed(2)}`;
  if (boundsCache.has(key)) return boundsCache.get(key);
  const R = rig(g, 0, 0, false);
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const yaw of [0, 0.8, 1.57, 2.36, 3.14, -0.8, -1.57]) {
    const V = view(yaw, pitch);
    const pts = [...R.spine, ...R.legs.flatMap((L) => [L.hip, L.knee, L.foot]), ...R.necks.flatMap((n) => [...n.ch, ...n.head.skull])];
    for (const p of pts) { const q = V.p(p); x0 = Math.min(x0, q.x - q.r); x1 = Math.max(x1, q.x + q.r); y0 = Math.min(y0, q.y - q.r); y1 = Math.max(y1, q.y + q.r); }
    const wp = part('wings', g.wings);
    for (const side of [1, -1]) {
      const wg = wingGeom(wp, R.wingRoot(side), side, R.wingScale, 0, 0, R.motion, false, 0);
      if (wg) for (const p of wingPts(wg)) { const q = V.p(p); x0 = Math.min(x0, q.x); x1 = Math.max(x1, q.x); y0 = Math.min(y0, q.y); y1 = Math.max(y1, q.y); }
    }
  }
  const hx = Math.max(Math.abs(x0), Math.abs(x1));
  const b = { x0: -hx, x1: hx, y0, y1: Math.max(y1, 4) };
  Object.assign(b, { w: b.x1 - b.x0, h: b.y1 - b.y0, cx: 0, cy: (b.y0 + b.y1) / 2 });
  boundsCache.set(key, b);
  return b;
}

// (x, y) を中心に、幅 size・高さ size*aspect の箱に収めて描く。anchor:'feet' なら y は足もと
// opts.yaw: 向き（0 = 右、π/2 = 奥、-π/2 = 手前）。なければ flip から斜め前向きに
// opts.cache: 同時にたくさん映る画面（図鑑・拠点など）で使う。絵を小さな画像にしておき、動きは1秒に12回だけ描き直す
const sprites = new Map();
export function drawDragonAt(ctx, g, x, y, size, opts = {}) {
  const pitch = opts.pitch ?? 0.3;
  const b = dragonBounds(g, pitch);
  const lvK = 1 + 0.04 * ((opts.level || 1) - 1);
  const aspect = opts.aspect || 0.85;
  const s = Math.min(size / (b.w * lvK), (size * aspect) / (b.h * lvK));
  if (offscreen(ctx, x, y, size)) return s;
  if (opts.cache && typeof document !== 'undefined') {
    const m = ctx.getTransform();
    const k = Math.hypot(m.a, m.b);
    const bw = size * 1.5, bh = size * Math.max(aspect, 0.6) * 1.9;
    const feet = opts.anchor === 'feet';
    const ox = bw / 2, oy = feet ? bh * 0.86 : bh / 2;
    const key = `${opts.cache}`;
    const sig = [g.lineage, g.horns, g.wings, g.tail, g.fins, g.pattern, g.ornament, g.color, g.shiny, opts.silhouette, opts.level, Math.round(size), Math.round(k * 100)].join('|');
    let sp = sprites.get(key);
    const t = opts.t || 0;
    if (!sp || sp.sig !== sig || Math.abs(t - sp.t) > 1 / 12 || (opts.yaw !== undefined && Math.abs((opts.yaw - sp.yaw + Math.PI * 3) % TAU - Math.PI) > 0.12)) {
      if (!sp || sp.sig !== sig) {
        const cv = document.createElement('canvas');
        cv.width = Math.ceil(bw * k);
        cv.height = Math.ceil(bh * k);
        sp = { cv, sig };
        sprites.set(key, sp);
        if (sprites.size > 80) sprites.delete(sprites.keys().next().value);
      }
      const c2 = sp.cv.getContext('2d');
      c2.setTransform(1, 0, 0, 1, 0, 0);
      c2.clearRect(0, 0, sp.cv.width, sp.cv.height);
      c2.setTransform(k, 0, 0, k, 0, 0);
      drawDragonAt(c2, g, ox, oy, size, { ...opts, cache: null });
      sp.t = t;
      sp.yaw = opts.yaw;
    }
    ctx.drawImage(sp.cv, x - ox, y - oy, bw, bh);
    return s;
  }
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  if (opts.anchor !== 'feet') ctx.translate(0, -b.cy);
  const yaw = opts.yaw ?? (opts.flip ? Math.PI + 0.42 : -0.42);
  drawDragon(ctx, g, { ...opts, yaw, pitch });
  ctx.restore();
  return s;
}

export function drawDragon(ctx, g, opts = {}) {
  const { t = 0, level = 1, silhouette = false, speed = 1, shadow = true } = opts;
  const pal = dragonPalette(g, silhouette);
  const tt = t * speed + quirkOf(g).phase;
  const k = opts.still ? 0 : 1;
  const sc = 1 + 0.04 * (level - 1);
  const V = view(opts.yaw ?? -0.42, opts.pitch ?? 0.3);
  ctx.save();
  ctx.scale(sc, sc);
  const lw = LINE_PX * unitPx(ctx);
  const lod = opts.lod || (screenSize(ctx, 120) < 95 ? 'low' : 'high');
  const R = rig(g, tt, k, !!opts.walking);
  const fl = R.float ? Math.sin(tt * 1.7) * R.float * 0.5 * k + R.float : 0;
  if (shadow) {
    const pts = [...R.spine.map((p) => [p[0], p[1], p[2], Math.max(3, p[3])]), ...R.legs.map((L) => [...L.foot, L.w * 0.6])];
    groundShadow(ctx, V, pts, R.float ? 0.12 : 0.2, R.float ? 0.8 : 1);
  }
  ctx.translate(0, -fl * Math.cos(V.pitch));
  if (level >= 5 && !silhouette) {
    const c = V.p([0, 0, 40]);
    const gr = ctx.createRadialGradient(c.x, c.y, 10, c.x, c.y, 130);
    gr.addColorStop(0, hexA(pal.light, 0.32));
    gr.addColorStop(1, hexA(pal.light, 0));
    ctx.fillStyle = gr;
    ctx.beginPath();
    ctx.arc(c.x, c.y, 130, 0, TAU);
    ctx.fill();
  }
  buildAndDraw(ctx, g, R, V, pal, tt, k, level, lw, lod, opts);
  ctx.restore();
}

function buildAndDraw(ctx, g, R, V, pal, tt, k, level, lw, lod, opts) {
  const sil = !!pal.sil;
  const q = R.q;
  const parts = { horns: part('horns', g.horns), wings: part('wings', g.wings), fins: part('fins', g.fins), tail: part('tail', g.tail) };
  const sp = R.spine;
  const n = sp.length - 1;
  const tE = R.B.tailEnd * PER, bE = R.B.bodyEnd * PER;
  const pj = (ch) => projChain(V, ch);
  const pieces = [];
  const joints = [];
  const bodyPieces = [];
  const addBody = (piece) => { pieces.push(piece); bodyPieces.push(piece); return piece; };

  // 背びれの範囲（背骨の上の位置）
  const finK = level >= 3 ? 1.25 : 1;
  const ss = R.sk.spine;
  const seg = { tail: [0, tE], body: [tE, bE], neck: [bE, n] }[ss.chain] || [0, n];
  let i0, i1;
  if (ss.chain === 'tail') { i1 = Math.round(seg[1] - ss.from * (seg[1] - seg[0])); i0 = Math.round(seg[1] - ss.to * (seg[1] - seg[0])); } else { i0 = Math.round(seg[0] + ss.from * (seg[1] - seg[0])); i1 = Math.round(seg[0] + ss.to * (seg[1] - seg[0])); }
  const fins = finShapes(parts.fins, sp, Math.max(1, i0), Math.min(n - 1, i1), (parts.fins ? parts.fins.style.size || 0 : 0) * finK);
  const finPolys = (f) => {
    if (f.kind === 'sail') return [projPoly(V, f.pts)];
    const th = f.thick;
    return [projPoly(V, f.pts.map((p, i) => (i === 0 || i === f.pts.length - 1 ? at(p, th, 1.2) : p))), projPoly(V, f.pts.map((p, i) => (i === 0 || i === f.pts.length - 1 ? at(p, th, -1.2) : p)))];
  };
  const finsIn = (a, b) => fins.filter((f) => f.i >= a && f.i < b);

  // 胴・しっぽ・首と頭（背骨を3つに分ける）
  const ranges = [['tail', 0, tE + 1], ['torso', Math.max(0, tE - 1), bE + 1], ['neck', Math.max(0, bE - 1), n + 1]];
  const sec = {};
  const tip = tailTip(parts.tail ? parts.tail.style.tip : 'plain', sp);
  for (const [name, a, b] of ranges) {
    const beads = sp.slice(a, b);
    const polys = beadPolys(pj(beads));
    const myFins = finsIn(name === 'tail' ? 0 : a + 1, name === 'neck' ? n + 1 : b - 1);
    const fp = myFins.flatMap(finPolys);
    const piece = { name, beads, i0: a, i1: b, polys: [...polys], fins: myFins, finPolys: fp, d: meanD(V, beads) };
    piece.polys.push(...fp);
    if (name === 'tail' && tip) {
      piece.tipPolys = tip.chains ? tip.chains.flatMap((c) => beadPolys(pj(smooth3(c, 2)))) : [projPoly(V, tip.flatPts)];
      piece.polys.push(...piece.tipPolys);
    }
    if (name === 'neck') {
      const H = R.necks.find((x) => x.main).head;
      piece.head = H;
      const hp = [...beadPolys(pj(smooth3(H.skull, 2))), ...beadPolys(pj(smooth3(H.jaw, 2))), ...H.extra.flatMap((c) => beadPolys(pj(smooth3(c, 2))))];
      piece.polys.push(...hp);
      piece.d = Math.min(piece.d, meanD(V, [...beads, ...H.skull]));
    }
    sec[name] = addBody(piece);
  }
  const jAt = (a, b, p, rk = 1.3) => { const c = V.p(p); joints.push({ a, b, x: c.x, y: c.y, r: c.r * rk + 2 }); };
  jAt(sec.tail, sec.torso, sp[tE]);
  jAt(sec.torso, sec.neck, sp[bE]);
  // ほかの首と頭（多頭型）
  for (const nk of R.necks) {
    if (nk.main) continue;
    const H = nk.head;
    const polys = [...beadPolys(pj(nk.ch)), ...beadPolys(pj(smooth3(H.skull, 2))), ...beadPolys(pj(smooth3(H.jaw, 2))), ...H.extra.flatMap((c) => beadPolys(pj(smooth3(c, 2))))];
    const piece = addBody({ name: 'neck2', beads: nk.ch, polys, fins: [], finPolys: [], head: H, d: meanD(V, [...nk.ch, ...H.skull]) });
    jAt(sec.torso, piece, nk.ch[0], 1.2);
  }
  // 脚と腕
  const footChain = (L) => {
    const fw = norm([1, 0, 0]);
    return [[...L.foot, L.w * 0.38], [...at(L.foot, fw, L.w * 0.55, UP, 1.5), L.w * 0.3], [...at(L.foot, fw, L.w * 0.95, UP, 1), L.w * 0.17]];
  };
  for (const L of R.legs) {
    const ch = smooth3([[...L.hip, L.w / 2], [...L.knee, L.w * 0.42], [...L.foot, L.w * 0.36]], 3);
    const fc = R.float ? [] : footChain(L);
    const all = [...ch, ...fc];
    const piece = addBody({ name: 'leg', beads: all, leg: L, polys: [...beadPolys(pj(ch)), ...beadPolys(pj(smooth3(fc, 2)))], fins: [], finPolys: [], d: meanD(V, all) });
    jAt(sec.torso, piece, [...L.hip, L.w / 2], 1.15);
  }
  for (const A of R.arms) {
    const ch = smooth3([[...A.hip, A.w / 2], [...A.knee, A.w * 0.42], [...A.foot, A.w * 0.38]], 3);
    const hand = [[...A.foot, A.w * 0.5]];
    const piece = addBody({ name: 'arm', beads: ch, leg: A, polys: [...beadPolys(pj(ch)), ...beadPolys(pj(hand))], fins: [], finPolys: [], d: meanD(V, ch) - 1 });
    jAt(sec.torso, piece, [...A.hip, A.w / 2], 1.1);
  }

  // 体全体の外形・塗り（全部品で同じ塗りと線にする）
  const allBody = bodyPieces.flatMap((p) => p.polys);
  const bb = bbox(allBody);
  const L = sil ? { fill: pal.main, line: pal.main, rim: pal.main, main: pal.main } : look(ctx, bb, pal.main, pal.light, pal.dark);
  const union = sil || lod === 'low' ? null : toPath(allBody);
  const finCol = sil ? pal.main : parts.fins && parts.fins.style.kind === 'mane' ? mix(pal.accent, pal.light, 0.35) : mix(pal.main, pal.light, 0.45);
  const d0 = meanD(V, sp);
  const sizeR = Math.max(bb.w, bb.h) / 2 || 1;

  for (const p of bodyPieces) {
    p.line = L.line;
    p.flat = sil;
    // 奥にある脚や首は少し沈める
    if (!sil && (p.name === 'leg' || p.name === 'arm' || p.name === 'neck2')) p.shade = Math.max(0, Math.min(0.22, ((p.d - d0) / sizeR) * 0.6));
    p.paint = (c, me, patch) => paintBody(c, me, L, union, lw, sil ? null : (pt) => details(c, me, pt), patch);
  }

  // 体の内側の描きこみ（部品ごとに、自分の分だけ）
  const details = (c, p, patch) => {
    const beads = p.beads;
    if (p.name !== 'leg' && p.name !== 'arm') {
      // 腹（下側の帯）と、背中のつや（形は1回だけ作る）
      if (!p._belly) {
        const U = beads.map((_, i) => spineFrame(beads, i).u);
        p._belly = toPath(beadPolys(pj(beads.map((b, i) => [...at(b, U[i], -b[3] * 0.5), b[3] * 0.66]))));
        p._gloss = lod === 'high' ? toPath(beadPolys(pj(beads.map((b, i) => [...at(b, U[i], b[3] * 0.55), b[3] * 0.42])))) : null;
      }
      c.fillStyle = hexA(mix(pal.main, pal.belly, 0.62), 0.78);
      c.fill(p._belly);
      if (p._gloss) { c.fillStyle = hexA(pal.light, 0.18); c.fill(p._gloss); }
      // 腹の節（横のすじ）
      if (lod === 'high' && !patch) for (let i = 2; i < beads.length - 1; i += 2) {
        const b = beads[i];
        if (b[3] < 6) continue;
        const F = spineFrame(beads, i);
        const seg = [];
        for (let kk = -3; kk <= 3; kk++) {
          const th = Math.PI + kk * 0.28;
          const nrm = norm(at([0, 0, 0], F.u, Math.cos(th), F.l, Math.sin(th)));
          if (V.facing(nrm) > 0) { const q = V.p(at(b, nrm, b[3] * 0.98)); seg.push([q.x, q.y]); }
        }
        strokePts(c, seg, hexA(mix(pal.belly, pal.dark, 0.55), 0.35), lw * 0.6);
      }
    } else {
      // 手足の内側の陰
      const s = p.leg.side;
      if (!p._shadeIn) p._shadeIn = toPath(beadPolys(pj(beads.map((b) => [b[0] - b[3] * 0.3, b[1] - s * b[3] * 0.25, b[2] - b[3] * 0.2, b[3] * 0.7]))));
      c.fillStyle = hexA(pal.dark, 0.18);
      c.fill(p._shadeIn);
      if (!patch) claws(c, p);
    }
    if (p.fins.length) drawFins(c, p);
    if (p.tipPolys) {
      const a = V.p(tip.base), b2 = V.p(tip.tip);
      const tipCol = g.tail === 'club' ? pal.horn : mix(pal.main, pal.accent, 0.45);
      c.fillStyle = rootToTip(c, a.x, a.y, b2.x, b2.y, pal.main, tipCol);
      c.fill(toPath(p.tipPolys));
      if (tip.mid) strokePts(c, projPoly(V, tip.mid), hexA(mix(pal.main, pal.dark, 0.6), 0.5), lw * 0.7);
    }
    if (lod === 'high' && !patch) {
      drawPattern(c, g.pattern, p, pal, lw);
      sheen(c, p);
    }
    if (p.name === 'torso') {
      // つけ根に落ちる影（脚・首・しっぽのつけ根）
      for (const Lg of R.legs) aoAt(c, [...Lg.hip, Lg.w * 0.7], 0.22);
      for (const A of R.arms) aoAt(c, [...A.hip, A.w * 0.7], 0.2);
      if (g.ornament === 'armor') drawArmor(c, V, sp.slice(tE, bE + 1), level, lw);
      if (g.ornament === 'scar' && !patch) drawScar(c, V, sp, Math.round((tE + bE) / 2), q.side, lw);
    }
    if (p.head) face(c, V, p.head, pal, tt, lw, g, level, lod);
    if (p.name === 'neck' && g.ornament === 'charm') drawCharm(c, V, p.beads, tt, lw, q.side);
  };
  const fillUnion = (c, polys, style) => { c.fillStyle = style; c.fill(toPath(polys)); };
  const aoAt = (c, b, a) => {
    const p = V.p(b);
    const gr = c.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r * 1.6);
    gr.addColorStop(0, hexA(pal.dark, a));
    gr.addColorStop(1, hexA(pal.dark, 0));
    c.fillStyle = gr;
    c.beginPath();
    c.arc(p.x, p.y, p.r * 1.6, 0, TAU);
    c.fill();
  };
  const claws = (c, p) => {
    if (R.float || p.name === 'arm') return;
    const Lg = p.leg;
    c.fillStyle = pal.horn;
    for (const s of [-1, 0, 1]) {
      const base = at(Lg.foot, [1, 0, 0], Lg.w * 0.9, [0, 1, 0], s * Lg.w * 0.22, UP, 1);
      const pts = projPoly(V, [at(base, [0, 1, 0], -1.4), at(base, [1, 0, 0], 4.5, UP, -1), at(base, [0, 1, 0], 1.4)]);
      fillPoly(c, pts, pal.horn);
    }
  };
  const drawFins = (c, p) => {
    for (const f of p.fins) {
      const polys = finPolys(f);
      const bb2 = bbox(polys);
      const gr = c.createLinearGradient(0, bb2.y1, 0, bb2.y0);
      gr.addColorStop(0, pal.main);
      gr.addColorStop(0.35, pal.main);
      gr.addColorStop(1, finCol);
      c.fillStyle = gr;
      c.fill(toPath(polys));
      if (f.ribs) for (const rb of f.ribs) strokePts(c, projPoly(V, rb), hexA(mix(pal.main, pal.dark, 0.6), 0.55), lw * 0.7);
    }
  };
  const sheen = (c, p) => {
    // つやの小さな反射（光の側を向いた面に）
    c.fillStyle = 'rgba(255,252,240,0.22)';
    for (let i = 2; i < p.beads.length - 1; i += 3) {
      const b = p.beads[i];
      if (b[3] < 4) continue;
      const F = spineFrame(p.beads, i);
      const side = V.facing(F.l) > 0 ? 1 : -1;
      const nrm = norm(at([0, 0, 0], F.u, 0.85, F.l, side * 0.5));
      if (V.facing(nrm) < -0.1) continue;
      const s = V.p(at(b, nrm, b[3] * 0.92));
      const s2 = V.p(at(b, nrm, b[3] * 0.92, F.f, b[3] * 0.5));
      const ang = Math.atan2(s2.y - s.y, s2.x - s.x);
      c.beginPath();
      c.ellipse(s.x, s.y, Math.max(1, b[3] * 0.2), Math.max(0.5, b[3] * 0.055), ang, 0, TAU);
      c.fill();
    }
  };
  const drawPattern = (c, id, p, pal2, lw2) => patternOn(c, V, id, p.beads, pal2, lw2, p.name === 'leg' || p.name === 'arm');

  // 角（頭ごと、左右ごとの部品。付け根で頭となじませる）
  const hornSt = parts.horns ? parts.horns.style : null;
  if (hornSt) {
    for (const piece of bodyPieces.filter((p) => p.head)) {
      for (const hr of hornChains(hornSt, piece.head, q, false)) {
        const polys = hr.chains.flatMap((ch) => beadPolys(pj(smooth3(ch, 2))));
        const a = V.p(hr.base), b2 = V.p(hr.tip);
        const hp = {
          name: 'horn', polys, d: meanD(V, hr.chains[0]), line: sil ? pal.main : lineOf(pal.horn, pal.dark),
          paint(c, me) {
            c.fillStyle = sil ? pal.main : rootToTip(c, a.x, a.y, b2.x, b2.y, pal.main, pal.horn);
            c.fill(me.path);
            if (sil) return;
            inside(c, me.path, () => {
              // 光の側のつや・巻き角の節
              const m = hr.chains[0];
              strokePts(c, pj(m).map((p) => [p.x + LIGHT.x * p.r * 0.45, p.y + LIGHT.y * p.r * 0.45]), 'rgba(255,250,235,0.45)', Math.max(lw, (hr.w / 2) * 0.35));
              if (hornSt.kind === 'curl' || hornSt.kind === 'spike') for (let i = 2; i < m.length - 1; i += 2) {
                const F = frame(sub(m[i + 1], m[i - 1]));
                const ring = circle3(V, m[i], F.f, m[i][3] * 1.02, 14).filter((_, j) => j < 8);
                strokePts(c, ring, hexA(mix(pal.horn, pal.dark, 0.5), 0.45), lw * 0.6);
              }
              if (hr.chip) {
                const tp = V.p(hr.tip);
                fillPoly(c, ellipsePoly(tp.x, tp.y, tp.r * 0.9, tp.r * 0.6, 0.4, 8), hexA(mix(pal.horn, pal.dark, 0.35), 0.8));
              }
            });
          },
        };
        pieces.push(hp);
        jAt(piece, hp, [...hr.base, hr.w * 0.55], 1.0);
      }
    }
  }

  // 翼（左右の部品。膜は半透明で光が透ける）
  for (const side of [1, -1]) {
    const wg = wingGeom(parts.wings, R.wingRoot(side), side, R.wingScale, tt, k, R.motion, !!opts.walking, q.nick);
    if (!wg) continue;
    const wp = wingPiece(ctx, V, wg, pal, lw, sil);
    pieces.push(wp);
    jAt(sec.torso, wp, [...wg.root, 7 * R.wingScale + 3], 1);
  }

  drawPieces(ctx, pieces, joints, lw);

  // 飾り・息・炎（いちばん手前）
  if (!sil) {
    if (g.ornament === 'gem') for (const p of bodyPieces) if (p.head && p.name === 'neck') gem(ctx, V, p.head, level, lw);
    if (g.tail === 'flame') drawFlame(ctx, V, sp, tt);
    if (k && lod === 'high') for (const p of bodyPieces) if (p.head) breath(ctx, V, p.head, tt, pal, g);
  } else if (g.tail === 'flame') {
    const p = V.p(sp[0]);
    ctx.fillStyle = pal.main;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 10, 0, TAU);
    ctx.fill();
  }
}

const wingPts = (W) => [...(W.poly || []), ...(W.feathers || []).flatMap((f) => f.pts), ...(W.leaves || []).flatMap((f) => f.pts), ...W.bones.flat()];

// 翼の部品
function wingPiece(ctx, V, W, pal, lw, sil) {
  const memb = sil ? pal.main : mix(pal.main, pal.accent, 0.3);
  const polys = [];
  if (W.poly) polys.push(projPoly(V, W.poly));
  if (W.feathers) for (const f of W.feathers) polys.push(projPoly(V, f.pts));
  if (W.leaves) for (const f of W.leaves) polys.push(projPoly(V, f.pts));
  const bonesPts = W.bones.map((b) => projPoly(V, b));
  for (const b of W.bones) polys.push(...beadPolys(projChain(V, smooth3(b.map((p, i) => [...p, i === 0 ? 3 : 1.6]), 2))));
  const allPts = wingPts(W);
  const bb = bbox(polys);
  const r0 = V.p(W.root), e0 = W.edge ? V.p(W.edge) : { x: bb.cx, y: bb.y0 };
  return {
    name: 'wing', polys, d: meanD(V, allPts), line: sil ? pal.main : lineOf(memb, pal.dark), lineK: 0.85,
    paint(c, me) {
      if (sil) { c.fillStyle = pal.main; c.fill(me.path); return; }
      if (W.kind === 'membrane') {
        // 付け根は濃く、ふちへ向かって明るく透ける
        const gr = c.createLinearGradient(r0.x, r0.y, e0.x, e0.y);
        gr.addColorStop(0, hexA(mix(memb, pal.dark, 0.35), 0.92));
        gr.addColorStop(0.55, hexA(memb, 0.8));
        gr.addColorStop(1, hexA(mix(memb, pal.light, 0.55), 0.72));
        c.fillStyle = gr;
        c.fill(toPath([projPoly(V, W.poly)]));
        // 膜のすじ
        inside(c, toPath([projPoly(V, W.poly)]), () => {
          for (const b of bonesPts.slice(1)) {
            const a = b[0], e = b[b.length - 1];
            for (const kk of [0.3, 0.6]) strokePts(c, [[a[0] + (e[0] - a[0]) * kk * 0.2, a[1] + (e[1] - a[1]) * kk * 0.2], [e[0] * kk + r0.x * (1 - kk), e[1] * kk + r0.y * (1 - kk)]], hexA(pal.dark, 0.08), lw);
          }
        });
        // 骨のすじ
        for (const b of bonesPts) strokePts(c, b, mix(pal.main, pal.dark, 0.3), lw * 2.2);
        for (const b of bonesPts) strokePts(c, b.map(([x, y]) => [x + LIGHT.x * lw, y + LIGHT.y * lw]), hexA(pal.light, 0.5), lw * 0.8);
        if (W.claw) fillPoly(c, [...projPoly(V, W.claw), [projPoly(V, W.claw)[0][0] + 2, projPoly(V, W.claw)[0][1] + 1]], pal.horn);
      } else if (W.feathers) {
        W.feathers.forEach((f, i) => {
          const pp = projPoly(V, f.pts);
          const bb2 = bbox([pp]);
          c.fillStyle = look(c, bb2, mix(memb, pal.light, 0.15 + (i % 2) * 0.12), pal.light, pal.dark).fill;
          c.fill(toPath([pp]));
          strokePts(c, pp.concat([pp[0]]), hexA(lineOf(memb, pal.dark), 0.55), lw * 0.8);
          strokePts(c, projPoly(V, f.quill), hexA(pal.light, 0.6), lw * 0.7);
        });
        for (const b of bonesPts) strokePts(c, b, mix(pal.main, pal.dark, 0.2), lw * 2.6);
      } else {
        W.leaves.forEach((f, i) => {
          const pp = projPoly(V, f.pts);
          c.fillStyle = look(c, bbox([pp]), mix(memb, pal.light, 0.1 + i * 0.1), pal.light, pal.dark).fill;
          c.fill(toPath([pp]));
          strokePts(c, pp.concat([pp[0]]), hexA(lineOf(memb, pal.dark), 0.5), lw * 0.8);
          strokePts(c, projPoly(V, f.rib), hexA(mix(memb, pal.dark, 0.5), 0.6), lw * 0.8);
        });
      }
    },
  };
}

// ---------- 顔（球の上に貼り付ける。こちらを向いている目だけ描く） ----------
function face(ctx, V, H, pal, tt, lw, g, level, lod) {
  const { C, F, r } = H;
  const R = r * 0.88;
  const dk = lineOf(pal.main, pal.dark);
  for (const s of [1, -1]) {
    const e = norm(at([0, 0, 0], F.f, 0.72, F.u, 0.3, F.l, s * 0.62));
    const fc = V.facing(e);
    if (fc < -0.05) continue;
    const blink = (tt % 4.6) > 4.45 ? 0.25 : 1;
    // 目のくぼみの陰
    const sock = capPoly(V, C, R, e, 0.93, 16);
    if (sock) fillPoly(ctx, sock, hexA(pal.dark, 0.35));
    const eye = capPoly(V, C, R * 1.01, at(e, F.u, (blink - 1) * 0.08), 1 - 0.022 * blink, 16);
    if (eye) {
      // 小さく鋭い目。わずかに光る
      const c = V.p(at(C, e, R));
      const gl = ctx.createRadialGradient(c.x, c.y, 0, c.x, c.y, r * 0.45);
      gl.addColorStop(0, hexA(pal.eye, 0.5 * Math.max(0, fc)));
      gl.addColorStop(1, hexA(pal.eye, 0));
      ctx.fillStyle = gl;
      ctx.beginPath();
      ctx.arc(c.x, c.y, r * 0.45, 0, TAU);
      ctx.fill();
      fillPoly(ctx, eye, pal.eye);
      if (blink === 1 && fc > 0.1) {
        // 縦に細い瞳
        const p1 = V.p(at(C, norm(at(e, F.u, 0.12)), R * 1.02)), p2 = V.p(at(C, norm(at(e, F.u, -0.12)), R * 1.02));
        strokePts(ctx, [[p1.x, p1.y], [p2.x, p2.y]], '#16120e', Math.max(lw, r * 0.05));
        const hl = V.p(at(C, norm(at(e, F.u, 0.08, F.f, -0.06)), R * 1.02));
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        ctx.beginPath();
        ctx.arc(hl.x, hl.y, Math.max(0.6, r * 0.045), 0, TAU);
        ctx.fill();
      }
      strokePts(ctx, eye.concat([eye[0]]), hexA(dk, 0.6), lw * 0.7);
    }
    // 眉の骨のふち（目の上にかぶさる）
    const brow = [];
    for (let i = 0; i <= 6; i++) {
      const u = i / 6 - 0.5;
      const d = norm(at(e, F.u, 0.2 - u * 0.12, F.f, u * 0.36));
      if (V.facing(d) > 0) { const p = V.p(at(C, d, R * 1.03)); brow.push([p.x, p.y]); }
    }
    strokePts(ctx, brow, hexA(mix(pal.main, pal.dark, 0.7), 0.85), lw * 1.3);
    // 口の線
    const mouth = [];
    for (let i = 0; i <= 6; i++) {
      const u = i / 6;
      const p = at(C, F.f, r * (0.05 + u * 0.85) + H.sn * u * 0.8, F.u, -r * (0.32 - u * 0.06), F.l, s * r * (0.5 - u * 0.28));
      if (V.facing(norm(at([0, 0, 0], F.l, s, F.u, -0.3))) > -0.1) { const q = V.p(p); mouth.push([q.x, q.y]); }
    }
    strokePts(ctx, mouth, hexA(dk, 0.75), lw * 0.9);
    if (mouth.length > 4) {
      const m = mouth[Math.floor(mouth.length * 0.6)];
      fillPoly(ctx, [[m[0] - r * 0.05, m[1] - 0.3], [m[0], m[1] + r * 0.12], [m[0] + r * 0.05, m[1] - 0.3]], '#f2ead8');
    }
    // 鼻の穴
    const nd = norm(at([0, 0, 0], F.f, 0.8, F.u, 0.3, F.l, s * 0.45));
    if (V.facing(nd) > 0) {
      const tipC = at(C, F.f, r * 0.75 + H.sn * 0.45, F.u, -r * 0.2);
      const p = V.p(at(tipC, nd, r * 0.42));
      ctx.fillStyle = hexA(dk, 0.85);
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, Math.max(0.8, r * 0.07), Math.max(0.5, r * 0.04), 0.3, 0, TAU);
      ctx.fill();
    }
  }
  void g; void level; void lod;
}

// 口や鼻から、ときどき息や火の粒を出す
function breath(ctx, V, H, tt, pal, g) {
  const period = 5.5;
  const ph = (tt % period);
  if (ph > 1.6) return;
  const fire = g.color === 'ember' || g.color === 'obsidian' || g.tail === 'flame';
  for (let i = 0; i < 7; i++) {
    const k = (ph * 1.4 - i * 0.12);
    if (k < 0 || k > 1) continue;
    const p = V.p(at(H.nose, H.F.f, 4 + k * 26, H.F.u, k * (fire ? 4 : 10) + Math.sin(i * 2.1) * 3, H.F.l, Math.cos(i * 1.7) * 4));
    const a = (1 - k) * (fire ? 0.8 : 0.35);
    ctx.fillStyle = fire ? (i % 2 ? `rgba(255,170,60,${a})` : `rgba(255,220,120,${a})`) : `rgba(240,244,240,${a})`;
    ctx.beginPath();
    ctx.arc(p.x, p.y, (fire ? 1.6 : 2.4) + k * (fire ? 2 : 5), 0, TAU);
    ctx.fill();
  }
  void pal;
}

// ---------- 模様（体の表面に貼る。こちらを向いている所だけ） ----------
function patternOn(ctx, V, id, beads, pal, lw, limb) {
  if (id === 'plain' || beads.length < 3 || limb) return;
  const col = mix(pal.main, pal.accent, 0.7);
  const surf = (b, F, th, k = 1) => { const nrm = norm(at([0, 0, 0], F.u, Math.cos(th), F.l, Math.sin(th))); return { nrm, p: at(b, nrm, b[3] * k) }; };
  for (let i = 1; i < beads.length - 1; i++) {
    const b = beads[i];
    if (b[3] < 4) continue;
    const F = spineFrame(beads, i);
    if (id === 'spots' && i % 4 === 1 && b[3] > 6) {
      for (const th of [0.7, -0.9, 0.15 * (i % 8 === 1 ? 1 : -1)]) {
        const s = surf(b, F, th);
        if (V.facing(s.nrm) < 0.05) continue;
        const cp = capPoly(V, b, b[3], s.nrm, 0.97, 10);
        if (cp) fillPoly(ctx, cp, col);
      }
    } else if (id === 'stripes' && i % 4 === 0) {
      const pts = [];
      for (let k = -6; k <= 6; k++) {
        const s = surf(b, F, (k / 6) * 1.5, 1.01);
        if (V.facing(s.nrm) > 0) { const q = V.p(s.p); pts.push([q.x, q.y]); } else if (pts.length) { strokePts(ctx, pts.splice(0), col, Math.max(lw, b[3] * 0.18)); }
      }
      strokePts(ctx, pts, col, Math.max(lw, b[3] * 0.18));
    } else if (id === 'scales' && i % 2 === 0 && b[3] > 6) {
      for (const th of [-1, -0.45, 0.1, 0.65, 1.2]) {
        const s = surf(b, F, th + (i % 4 ? 0.27 : 0), 1.01);
        if (V.facing(s.nrm) < 0.1) continue;
        const a = V.p(at(s.p, F.f, -b[3] * 0.2, s.nrm, 0)), c = V.p(at(s.p, F.f, b[3] * 0.05)), q = V.p(at(s.p, cross(F.f, s.nrm), b[3] * 0.18));
        const q2 = V.p(at(s.p, cross(F.f, s.nrm), -b[3] * 0.18));
        ctx.beginPath();
        ctx.moveTo(q.x, q.y);
        ctx.quadraticCurveTo(c.x * 2 - (q.x + q2.x) / 2, c.y * 2 - (q.y + q2.y) / 2, q2.x, q2.y);
        ctx.strokeStyle = hexA(col, 0.75);
        ctx.lineWidth = lw * 0.7;
        ctx.stroke();
        void a;
      }
    } else if (id === 'rings' && i % 6 === 3) {
      const ring = [];
      for (let k = 0; k <= 16; k++) {
        const s = surf(b, F, (k / 16) * TAU, 1.01);
        if (V.facing(s.nrm) > 0) { const q = V.p(s.p); ring.push([q.x, q.y]); } else if (ring.length) strokePts(ctx, ring.splice(0), hexA(mix(pal.main, pal.dark, 0.45), 0.55), Math.max(lw, b[3] * 0.22));
      }
      strokePts(ctx, ring, hexA(mix(pal.main, pal.dark, 0.45), 0.55), Math.max(lw, b[3] * 0.22));
    }
  }
}

// ---------- 飾り（体と同じ線の太さ・同じ光の向き） ----------
function drawArmor(ctx, V, ch, level, lw) {
  const n = ch.length;
  for (let i = Math.floor(n * 0.15); i < n * 0.9; i += 3) {
    const b = ch[i];
    const F = spineFrame(ch, i);
    const cp = capPoly(V, b, b[3] * 1.04, norm(at(F.u, F.f, -0.1)), 0.55, 18);
    if (!cp) continue;
    const bb = bbox([cp]);
    fillPoly(ctx, cp, look(ctx, bb, '#a9aeb8', '#e2e4ea', '#5a606c').fill);
    strokePts(ctx, cp.concat([cp[0]]), 'rgba(50,54,62,0.7)', lw * 0.8);
    if (level >= 4) { const p = V.p(at(b, F.u, b[3] * 1.05)); ctx.fillStyle = '#e8c35a'; ctx.beginPath(); ctx.arc(p.x, p.y, 1.8, 0, TAU); ctx.fill(); }
  }
}

// 古い傷（片側だけ）
function drawScar(ctx, V, ch, i, side, lw) {
  const b = ch[i];
  if (!b) return;
  const F = spineFrame(ch, i);
  ctx.lineCap = 'round';
  for (let k = 0; k < 3; k++) {
    const pts = [];
    for (let j = 0; j <= 4; j++) {
      const th = side * (0.2 + j * 0.22);
      const nrm = norm(at([0, 0, 0], F.u, Math.cos(th), F.l, Math.sin(th)));
      if (V.facing(nrm) <= 0) continue;
      const q = V.p(at(b, nrm, b[3] * 1.01, F.f, (k - 1) * 5 + j * 1.5));
      pts.push([q.x, q.y]);
    }
    strokePts(ctx, pts, 'rgba(240,226,206,0.8)', lw * 1.1);
  }
}

// 首飾り（片側に寄って下がる。首の動きに遅れて揺れる）
function drawCharm(ctx, V, beads, tt, lw, side) {
  const i = Math.floor(beads.length * 0.3);
  const b = beads[i];
  if (!b) return;
  const F = spineFrame(beads, i);
  const ring = [];
  for (let k = 0; k <= 18; k++) {
    const th = (k / 18) * TAU;
    const nrm = norm(at([0, 0, 0], F.u, Math.cos(th), F.l, Math.sin(th)));
    if (V.facing(nrm) > 0) { const q = V.p(at(b, nrm, b[3] * 1.02)); ring.push([q.x, q.y]); } else if (ring.length) strokePts(ctx, ring.splice(0), '#b8892e', lw * 1.4);
  }
  strokePts(ctx, ring, '#b8892e', lw * 1.4);
  const sw = Math.sin(tt * 2 - 1.2) * 2;
  const hang = at(b, F.u, -b[3] * 1.05, F.l, side * b[3] * 0.25);
  const nd = norm(at([0, 0, 0], F.u, -1, F.l, side * 0.3));
  if (V.facing(nd) < -0.2) return;
  const p = V.p(hang);
  const bx = p.x + sw, by = p.y;
  fillPoly(ctx, [[bx, by + 1], [bx + 4, by + 7], [bx, by + 13], [bx - 4, by + 7]], look(ctx, { cx: bx, cy: by + 7, w: 8, h: 12 }, '#5fb0c0', '#a8e0e8', '#2f6a74').fill);
  strokePts(ctx, [[bx, by + 1], [bx + 4, by + 7], [bx, by + 13], [bx - 4, by + 7], [bx, by + 1]], 'rgba(30,60,62,0.7)', lw * 0.7);
}

function gem(ctx, V, H, level, lw) {
  const d = norm(at([0, 0, 0], H.F.u, 0.75, H.F.f, 0.65));
  if (V.facing(d) < 0) return;
  const c = at(H.C, d, H.r * 0.9);
  const p = V.p(c);
  const { x, y } = p;
  if (level >= 4) {
    const gl = ctx.createRadialGradient(x, y, 1, x, y, 12);
    gl.addColorStop(0, 'rgba(255,120,150,0.6)');
    gl.addColorStop(1, 'rgba(255,120,150,0)');
    ctx.fillStyle = gl;
    ctx.beginPath();
    ctx.arc(x, y, 12, 0, TAU);
    ctx.fill();
  }
  const pts = projPoly(V, [at(c, H.F.f, -4.5), at(c, H.F.l, 3.5), at(c, H.F.f, 4.5), at(c, H.F.l, -3.5)]);
  fillPoly(ctx, pts, look(ctx, bbox([pts]), '#d04a6a', '#ff9ab4', '#8a2440').fill);
  strokePts(ctx, pts.concat([pts[0]]), 'rgba(90,40,30,0.7)', lw * 0.7);
}

function drawFlame(ctx, V, ch, tt) {
  const p = V.p(ch[0]), q = V.p(ch[3]);
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

// テストや他の画面から使う（向きによって部品の描く順が変わることの確認用）
export function dragonPieceOrder(g, yaw, pitch = 0.3) {
  const R = rig(g, 0, 0, false);
  const V = view(yaw, pitch);
  const sp = R.spine;
  const tE = R.B.tailEnd * PER, bE = R.B.bodyEnd * PER;
  const list = [
    ['tail', meanD(V, sp.slice(0, tE + 1))],
    ['torso', meanD(V, sp.slice(tE, bE + 1))],
    ['head', meanD(V, sp.slice(bE))],
  ];
  return list.sort((a, b) => b[1] - a[1]).map((x) => x[0]);
}
void dot; void len; void mul; void cross;
