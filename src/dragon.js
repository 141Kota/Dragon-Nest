// ドラゴン描画: 系統（DATA.lineages[].skeleton）ごとに別の骨組みを持ち、
// 角・翼・背びれ・しっぽ・模様・飾りは、その系統の接続点（頭・翼の根元・背骨・しっぽの先）に合わせて描く。
import { part, lineageById } from './data.js';

const TAU = Math.PI * 2;
const GROUND = 70;

const SIL = { main: '#14161c', light: '#14161c', dark: '#0c0d11', belly: '#14161c', accent: '#14161c', eye: '#14161c', horn: '#14161c', sil: true };

export function dragonPalette(g, silhouette = false) {
  if (silhouette) return SIL;
  const c = part('color', g.color) || part('color', 'moss');
  return g.shiny ? { ...c, ...c.shiny } : { ...c };
}

function mix(a, b, k) {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  const ch = (s) => Math.round(((pa >> s) & 255) * (1 - k) + ((pb >> s) & 255) * k);
  return `#${((1 << 24) | (ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).slice(1)}`;
}

// ---------- 骨組みの計算 ----------
function scaleChain(pts, k) {
  const [x0, y0] = pts[0];
  return pts.map(([x, y, r]) => [x0 + (x - x0) * k, y0 + (y - y0) * k, r]);
}

// Catmull-Rom でなめらかにして、半径も補間する
function smooth(pts, per = 6) {
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
  return out;
}

function sway(pts, amp, tt, phase = 0, axis = 'y') {
  const n = pts.length - 1 || 1;
  return pts.map(([x, y, r], i) => {
    const d = Math.sin(tt * 1.6 - i * 0.8 + phase) * amp * (i / n);
    return axis === 'y' ? [x, y + d, r] : [x + d, y, r];
  });
}

function rig(g, tt, breathe) {
  const lin = lineageById(g.lineage);
  const sk = lin.skeleton;
  const tail = part('tail', g.tail);
  const tailPts = sway(scaleChain(sk.tail.pts, tail ? tail.style.len : 1), sk.tail.sway, tt);
  const bodyPts = sk.body.pts.map(([x, y, r]) => [x, y, r * breathe]);
  const necks = sk.necks.map((n, i) => {
    const pts = sway(n.pts, n.sway, tt * 0.8, i * 1.7, 'y');
    const last = pts[pts.length - 1];
    const prev = pts[pts.length - 2];
    const ang = (n.head.ang || 0) + Math.atan2(last[1] - prev[1], last[0] - prev[0]) * 0.15;
    return { pts, far: !!n.far, head: { x: last[0] + n.head.r * 0.35, y: last[1] - n.head.r * 0.1, r: n.head.r, snout: n.head.snout, ang } };
  });
  return { lin, sk, tail: smooth(tailPts), body: smooth(bodyPts), necks: necks.map((n) => ({ ...n, sm: smooth(n.pts) })) };
}

// 図の大きさ（中央合わせ用）
const boundsCache = new Map();
export function dragonBounds(g) {
  const key = `${g.lineage}.${g.horns}.${g.wings}.${g.tail}.${g.fins}`;
  if (boundsCache.has(key)) return boundsCache.get(key);
  const R = rig(g, 0, 1);
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = GROUND + 4;
  const add = (x, y, r = 0) => { x0 = Math.min(x0, x - r); x1 = Math.max(x1, x + r); y0 = Math.min(y0, y - r); y1 = Math.max(y1, y + r); };
  for (const p of [...R.tail, ...R.body]) add(p.x, p.y, p.r + 3);
  for (const n of R.necks) {
    for (const p of n.sm) add(p.x, p.y, p.r);
    const h = n.head;
    add(h.x + h.r + h.snout, h.y, h.r);
    const horn = part('horns', g.horns);
    if (horn) add(h.x, h.y - h.r - horn.style.len * 0.9, 4);
  }
  const fins = part('fins', g.fins);
  if (fins && fins.style.kind !== 'none') for (const p of R.body) add(p.x, p.y - p.r - fins.style.size, 0);
  const w = part('wings', g.wings);
  if (w && w.style.kind !== 'none') {
    const s = R.sk.wing.scale, span = (w.style.span || 50) * s;
    add(R.sk.wing.at[0] - span * 0.75, R.sk.wing.at[1] - span * 0.95, 0);
    add(R.sk.wing.at[0] + span * 0.3, R.sk.wing.at[1] + 6, 0);
  }
  const tail = part('tail', g.tail);
  if (tail && tail.style.tip !== 'plain') { const l = R.tail[R.tail.length - 1]; add(l.x, l.y, 16); }
  const b = { x0, x1, y0, y1, w: x1 - x0, h: y1 - y0, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 };
  boundsCache.set(key, b);
  return b;
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
  const R = rig(g, tt, 1 + Math.sin(tt * 2) * 0.025);
  const sk = R.sk;
  const sc = 1 + 0.04 * (level - 1);
  const flap = Math.sin(tt * 2.4) * 0.14;
  const fl = sk.float ? Math.sin(tt * 1.7) * sk.float * 0.5 - sk.float : 0;
  const parts = {
    horns: part('horns', g.horns), wings: part('wings', g.wings), fins: part('fins', g.fins),
    tail: part('tail', g.tail), pattern: part('pattern', g.pattern), ornament: part('ornament', g.ornament),
  };

  ctx.save();
  ctx.translate(0, GROUND);
  ctx.scale(sc, sc);
  ctx.translate(0, -GROUND);
  if (shadow) {
    const b = dragonBounds(g);
    ctx.fillStyle = `rgba(0,0,0,${sk.float ? 0.18 : 0.32})`;
    ctx.beginPath();
    ctx.ellipse(b.cx + 6, GROUND + 2, b.w * (sk.float ? 0.22 : 0.36), 8, 0, 0, TAU);
    ctx.fill();
  }
  ctx.translate(0, fl);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  if (level >= 5 && !silhouette) {
    const gr = ctx.createRadialGradient(0, 0, 10, 0, 0, 130);
    gr.addColorStop(0, hexA(pal.light, 0.35));
    gr.addColorStop(1, hexA(pal.light, 0));
    ctx.fillStyle = gr;
    ctx.beginPath();
    ctx.arc(0, 0, 130, 0, TAU);
    ctx.fill();
  }

  const farPal = silhouette ? pal : { ...pal, main: mix(pal.main, pal.dark, 0.45), light: mix(pal.light, pal.dark, 0.45), belly: mix(pal.belly, pal.dark, 0.5) };
  const finK = level >= 3 ? 1.25 : 1;

  drawWing(ctx, parts.wings, sk.wing, farPal, true, flap, pal);
  for (const L of sk.legs) if (L.far) drawLimb(ctx, L, farPal);
  for (const n of R.necks) if (n.far) drawNeckHead(ctx, n, farPal, parts, tt, level);
  drawFins(ctx, parts.fins, chainOf(R, sk.spine), sk.spine, pal, finK);
  drawTube(ctx, R.tail, pal);
  drawTailTip(ctx, parts.tail.style.tip, R.tail, pal, tt);
  drawTube(ctx, R.body, pal);
  if (!silhouette) {
    drawPattern(ctx, parts.pattern.id, R.tail, pal);
    drawPattern(ctx, parts.pattern.id, R.body, pal);
    if (parts.ornament.id === 'armor') drawArmor(ctx, R.body, level);
    if (parts.ornament.id === 'scar') drawScar(ctx, R.body);
  }
  for (const n of R.necks) if (!n.far) drawNeckHead(ctx, n, pal, parts, tt, level);
  for (const L of sk.legs) if (!L.far) drawLimb(ctx, L, pal);
  for (const A of sk.arms || []) drawLimb(ctx, A, pal, true);
  drawWing(ctx, parts.wings, sk.wing, pal, false, flap, pal);
  ctx.restore();
}

function chainOf(R, spine) {
  if (spine.chain === 'tail') return R.tail;
  if (spine.chain === 'neck') return R.necks.find((n) => !n.far).sm;
  return R.body;
}

function hexA(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

// ---------- 胴・首・しっぽ（太さの変わる管） ----------
function drawTube(ctx, pts, pal) {
  if (pts.length < 2) return;
  const seg = (lw, col, dy = 0, k = 1) => {
    ctx.strokeStyle = col;
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      ctx.lineWidth = Math.max(1, (a.r + b.r) * k + lw);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y + dy * a.r);
      ctx.lineTo(b.x, b.y + dy * b.r);
      ctx.stroke();
    }
  };
  seg(5, pal.dark);
  if (pal.sil) { seg(0, pal.main); return; }
  seg(0, pal.main);
  seg(0, mix(pal.main, pal.belly, 0.55), 0.42, 0.5);
  seg(0, mix(pal.main, pal.dark, 0.35), 0.62, 0.32);
  seg(0, mix(pal.main, pal.light, 0.6), -0.45, 0.32);
}

function drawLimb(ctx, L, pal, arm = false) {
  const pts = smooth([[...L.hip, L.w / 2], [...L.knee, L.w * 0.42], [...L.foot, L.w * 0.36]], 4);
  drawTube(ctx, pts, pal);
  if (arm) return;
  // 足先
  ctx.beginPath();
  ctx.ellipse(L.foot[0] + L.w * 0.3, L.foot[1] - 2, L.w * 0.75, 5, 0, 0, TAU);
  ctx.lineWidth = 3.5;
  ctx.strokeStyle = pal.dark;
  ctx.stroke();
  ctx.fillStyle = pal.sil ? pal.main : mix(pal.main, pal.dark, 0.2);
  ctx.fill();
  if (!pal.sil) {
    ctx.fillStyle = pal.horn;
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.arc(L.foot[0] + L.w * 0.75 + i * 1.5 - 2, L.foot[1] - 4 + i * 2.2, 1.6, 0, TAU);
      ctx.fill();
    }
  }
}

// ---------- 頭 ----------
function drawNeckHead(ctx, n, pal, parts, tt, level) {
  drawTube(ctx, n.sm, pal);
  if (!pal.sil) drawPattern(ctx, parts.pattern.id, n.sm, pal, 0.6);
  if (parts.ornament.id === 'charm' && !pal.sil) drawCharm(ctx, n.sm, tt);
  const h = n.head;
  const horn = parts.horns.style;
  ctx.save();
  ctx.translate(h.x, h.y + Math.sin(tt * 2 + h.x) * 1.2);
  ctx.rotate(h.ang);
  // 奥の角 → 頭 → 手前の角
  if (horn.n >= 2) drawHorn(ctx, horn, h.r, pal, true);
  headShape(ctx, h, pal);
  if (!pal.sil) face(ctx, h, pal, tt);
  drawHorn(ctx, horn, h.r, pal, false);
  if (parts.ornament.id === 'gem' && !pal.sil) gem(ctx, h, level);
  ctx.restore();
}

function headPath(ctx, h) {
  const r = h.r;
  ctx.beginPath();
  ctx.ellipse(0, 0, r, r * 0.86, 0, 0, TAU);
  const sx = r * 0.7 + h.snout * 0.4, sy = r * 0.22, srx = r * 0.45 + h.snout * 0.5, sry = r * 0.48;
  ctx.moveTo(sx + srx, sy);
  ctx.ellipse(sx, sy, srx, sry, 0.05, 0, TAU);
  return { sx, sy, srx, sry };
}

function headShape(ctx, h, pal) {
  headPath(ctx, h);
  ctx.lineWidth = 5;
  ctx.strokeStyle = pal.dark;
  ctx.stroke();
  if (pal.sil) { ctx.fillStyle = pal.main; ctx.fill(); return; }
  const g = ctx.createLinearGradient(0, -h.r, 0, h.r);
  g.addColorStop(0, mix(pal.main, pal.light, 0.55));
  g.addColorStop(0.55, pal.main);
  g.addColorStop(1, mix(pal.main, pal.dark, 0.4));
  ctx.fillStyle = g;
  ctx.fill();
}

function face(ctx, h, pal, tt) {
  const r = h.r;
  const sn = { sx: r * 0.7 + h.snout * 0.4, sy: r * 0.22, srx: r * 0.45 + h.snout * 0.5 };
  // あご
  ctx.strokeStyle = pal.dark;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(sn.sx - sn.srx * 0.4, sn.sy + r * 0.28);
  ctx.quadraticCurveTo(sn.sx + sn.srx * 0.3, sn.sy + r * 0.36, sn.sx + sn.srx * 0.85, sn.sy + r * 0.12);
  ctx.stroke();
  // 鼻
  ctx.fillStyle = pal.dark;
  ctx.beginPath();
  ctx.ellipse(sn.sx + sn.srx * 0.65, sn.sy - r * 0.16, 2.2, 1.4, 0.3, 0, TAU);
  ctx.fill();
  // 目（細い瞳で少し重みのある表情。ときどきまばたき）
  const ex = r * 0.22, ey = -r * 0.18;
  const blink = (tt % 4.6) > 4.45 ? 0.15 : 1;
  ctx.fillStyle = pal.dark;
  ctx.beginPath();
  ctx.ellipse(ex, ey, r * 0.24, r * 0.2 * blink + 1, -0.15, 0, TAU);
  ctx.fill();
  if (blink === 1) {
    ctx.fillStyle = pal.eye;
    ctx.beginPath();
    ctx.ellipse(ex + 0.5, ey, r * 0.19, r * 0.15, -0.15, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#16120e';
    ctx.beginPath();
    ctx.ellipse(ex + 1.5, ey, r * 0.05, r * 0.13, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.beginPath();
    ctx.arc(ex - r * 0.05, ey - r * 0.06, 1.3, 0, TAU);
    ctx.fill();
  }
  // まゆの張り出し
  ctx.strokeStyle = mix(pal.main, pal.dark, 0.6);
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(ex - r * 0.3, ey - r * 0.28);
  ctx.quadraticCurveTo(ex, ey - r * 0.38, ex + r * 0.34, ey - r * 0.22);
  ctx.stroke();
}

// ---------- 角 ----------
function drawHorn(ctx, st, r, pal, far) {
  const list = st.n === 1 ? [{ a: -1.75, k: 1 }] : far ? [{ a: -1.95, k: 0.85 }] : [{ a: -1.45, k: 1 }];
  for (const h of list) {
    ctx.save();
    ctx.translate(Math.cos(h.a) * r * 0.8, Math.sin(h.a) * r * 0.8);
    ctx.rotate(h.a + Math.PI / 2 - 0.55);
    ctx.scale(h.k, h.k);
    const fill = pal.sil ? pal.main : far ? mix(pal.horn, pal.dark, 0.35) : pal.horn;
    const outl = pal.sil ? pal.dark : mix(pal.horn, '#000000', 0.55);
    const L = st.len, w = st.w;
    const strokeFill = () => { ctx.lineWidth = 3; ctx.strokeStyle = outl; ctx.stroke(); ctx.fillStyle = fill; ctx.fill(); };
    if (st.kind === 'curl') {
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(0, 4);
      ctx.bezierCurveTo(-L * 0.6, -L * 0.6, -L * 1.3, -L * 0.1, -L * 0.9, L * 0.35);
      ctx.lineWidth = w + 4; ctx.strokeStyle = outl; ctx.stroke();
      ctx.lineWidth = w; ctx.strokeStyle = fill; ctx.stroke();
      if (!pal.sil) {
        ctx.lineWidth = 1.5; ctx.strokeStyle = outl;
        for (let i = 1; i < 5; i++) {
          ctx.beginPath();
          ctx.arc(-L * 0.18 * i, -L * 0.45 + i * 3, w * 0.4, 0, Math.PI);
          ctx.stroke();
        }
      }
    } else {
      spike(ctx, L, w, st.bend);
      strokeFill();
      if (st.kind === 'branch') {
        for (const [ty, rot, k] of [[-0.45, 0.9, 0.45], [-0.75, -0.8, 0.35]]) {
          ctx.save();
          ctx.translate(-st.bend * L * Math.abs(ty) * 0.6, ty * L);
          ctx.rotate(rot);
          spike(ctx, L * k, w * 0.7, 0.1);
          strokeFill();
          ctx.restore();
        }
        spike(ctx, L, w, st.bend);
        ctx.fillStyle = fill;
        ctx.fill();
      }
    }
    ctx.restore();
  }
}

function spike(ctx, L, w, bend) {
  ctx.beginPath();
  ctx.moveTo(-w / 2, 5);
  ctx.quadraticCurveTo(-w / 2 - bend * L * 0.18, -L * 0.55, -bend * L * 0.6, -L);
  ctx.quadraticCurveTo(w / 2 - bend * L * 0.3, -L * 0.45, w / 2, 5);
  ctx.closePath();
}

// ---------- 翼 ----------
function drawWing(ctx, w, at, pal, far, flap, basePal) {
  if (!w || w.style.kind === 'none') return;
  const st = w.style;
  const s = at.scale * (far ? 0.9 : 1);
  ctx.save();
  ctx.translate(at.at[0] + (far ? 10 : 0), at.at[1] - (far ? 6 : 0));
  ctx.rotate((far ? -0.12 : 0) + flap * (far ? -0.8 : 1));
  ctx.scale(s, s);
  const span = st.span;
  const dark = pal.dark;
  const memb = pal.sil ? pal.main : mix(pal.main, basePal.accent, far ? 0.55 : 0.35);
  ctx.lineJoin = 'round';
  if (st.kind === 'membrane') {
    const h = st.h;
    const tips = [[-span * 0.75, -h * 0.95], [-span * 0.95, -h * 0.45], [-span * 0.8, -h * 0.05]];
    const elbow = [-span * 0.3, -h * 0.85];
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(...elbow);
    ctx.lineTo(...tips[0]);
    for (let i = 1; i < tips.length; i++) {
      const p = tips[i - 1], q = tips[i];
      ctx.quadraticCurveTo((p[0] + q[0]) / 2 + span * 0.12, (p[1] + q[1]) / 2, q[0], q[1]);
    }
    ctx.quadraticCurveTo(-span * 0.4, h * 0.05, 0, 6);
    ctx.closePath();
    ctx.lineWidth = 4;
    ctx.strokeStyle = dark;
    ctx.stroke();
    ctx.fillStyle = memb;
    ctx.fill();
    // 骨
    ctx.strokeStyle = pal.sil ? dark : mix(pal.main, pal.dark, 0.3);
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(...elbow);
    for (const tp of tips) { ctx.moveTo(...elbow); ctx.lineTo(...tp); }
    ctx.stroke();
    if (!pal.sil) {
      ctx.fillStyle = pal.horn;
      ctx.beginPath();
      ctx.arc(elbow[0], elbow[1], 3, 0, TAU);
      ctx.fill();
    }
  } else if (st.kind === 'feather') {
    for (let i = 0; i < 6; i++) {
      const a = -1.05 - i * 0.27;
      const len = span * (1 - i * 0.07);
      ctx.save();
      ctx.rotate(a + Math.PI);
      ctx.beginPath();
      ctx.ellipse(len / 2, 0, len / 2, 8, 0, 0, TAU);
      ctx.lineWidth = 3;
      ctx.strokeStyle = dark;
      ctx.stroke();
      ctx.fillStyle = pal.sil ? pal.main : i % 2 ? memb : mix(memb, pal.light, 0.3);
      ctx.fill();
      ctx.restore();
    }
  } else if (st.kind === 'leaf') {
    for (let i = 0; i < 3; i++) {
      const a = -2.1 - i * 0.42;
      const len = span * (1 - i * 0.15);
      ctx.save();
      ctx.rotate(a + Math.PI);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(len * 0.5, -len * 0.32, len, 0);
      ctx.quadraticCurveTo(len * 0.5, len * 0.32, 0, 0);
      ctx.lineWidth = 3;
      ctx.strokeStyle = dark;
      ctx.stroke();
      ctx.fillStyle = pal.sil ? pal.main : i === 1 ? mix(memb, pal.light, 0.25) : memb;
      ctx.fill();
      if (!pal.sil) {
        ctx.strokeStyle = mix(memb, pal.dark, 0.5);
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(3, 0);
        ctx.lineTo(len * 0.9, 0);
        ctx.stroke();
      }
      ctx.restore();
    }
  }
  ctx.restore();
}

// ---------- 背びれ（背骨にそって並べる） ----------
function drawFins(ctx, fins, chain, spine, pal, k) {
  if (!fins || fins.style.kind === 'none' || chain.length < 3) return;
  const st = fins.style;
  const size = st.size * k;
  const i0 = Math.floor(spine.from * (chain.length - 1)), i1 = Math.floor(spine.to * (chain.length - 1));
  const tops = [];
  for (let i = i0; i <= i1; i++) {
    const p = chain[i], q = chain[Math.min(chain.length - 1, i + 1)], o = chain[Math.max(0, i - 1)];
    let nx = (q.y - o.y), ny = -(q.x - o.x);
    const m = Math.hypot(nx, ny) || 1;
    nx /= m; ny /= m;
    if (ny > 0) { nx = -nx; ny = -ny; } // 上向きの法線
    tops.push({ x: p.x + nx * p.r * 0.85, y: p.y + ny * p.r * 0.85, nx, ny, r: p.r });
  }
  const fill = pal.sil ? pal.main : st.kind === 'mane' ? mix(pal.accent, pal.light, 0.25) : mix(pal.main, pal.light, 0.35);
  ctx.lineJoin = 'round';
  ctx.strokeStyle = pal.dark;
  ctx.lineWidth = 3;
  if (st.kind === 'sail') {
    ctx.beginPath();
    tops.forEach((p, i) => { const e = Math.sin((i / (tops.length - 1)) * Math.PI); i ? ctx.lineTo(p.x + p.nx * size * e, p.y + p.ny * size * e) : ctx.moveTo(p.x, p.y); });
    for (let i = tops.length - 1; i >= 0; i--) ctx.lineTo(tops[i].x, tops[i].y);
    ctx.closePath();
    ctx.stroke();
    ctx.fillStyle = pal.sil ? pal.main : hexA(mix(pal.main, pal.light, 0.5), 0.9);
    ctx.fill();
    if (!pal.sil) {
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      tops.forEach((p, i) => { if (i % 3) return; const e = Math.sin((i / (tops.length - 1)) * Math.PI); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x + p.nx * size * e, p.y + p.ny * size * e); });
      ctx.stroke();
    }
    return;
  }
  const step = st.kind === 'mane' ? 2 : 3;
  tops.forEach((p, i) => {
    if (i % step) return;
    const e = 0.6 + 0.4 * Math.sin((i / Math.max(1, tops.length - 1)) * Math.PI);
    const s = size * e;
    const tx = -p.ny, ty = p.nx; // 接線
    ctx.beginPath();
    if (st.kind === 'spikes') {
      ctx.moveTo(p.x - tx * s * 0.4, p.y - ty * s * 0.4);
      ctx.lineTo(p.x + p.nx * s - tx * s * 0.35, p.y + p.ny * s - ty * s * 0.35);
      ctx.lineTo(p.x + tx * s * 0.4, p.y + ty * s * 0.4);
    } else if (st.kind === 'plates') {
      ctx.moveTo(p.x - tx * s * 0.45, p.y - ty * s * 0.45);
      ctx.lineTo(p.x + p.nx * s * 0.7 - tx * s * 0.4, p.y + p.ny * s * 0.7 - ty * s * 0.4);
      ctx.lineTo(p.x + p.nx * s, p.y + p.ny * s);
      ctx.lineTo(p.x + p.nx * s * 0.7 + tx * s * 0.4, p.y + p.ny * s * 0.7 + ty * s * 0.4);
      ctx.lineTo(p.x + tx * s * 0.45, p.y + ty * s * 0.45);
    } else {
      ctx.moveTo(p.x - tx * s * 0.3, p.y - ty * s * 0.3);
      ctx.quadraticCurveTo(p.x + p.nx * s * 1.1, p.y + p.ny * s * 1.1, p.x - tx * s * 0.9 + p.nx * s * 0.6, p.y - ty * s * 0.9 + p.ny * s * 0.6);
      ctx.quadraticCurveTo(p.x + p.nx * s * 0.3, p.y + p.ny * s * 0.3, p.x + tx * s * 0.3, p.y + ty * s * 0.3);
    }
    ctx.closePath();
    ctx.stroke();
    ctx.fillStyle = fill;
    ctx.fill();
  });
}

// ---------- しっぽの先 ----------
function drawTailTip(ctx, kind, tail, pal, tt) {
  if (kind === 'plain' || tail.length < 2) return;
  const p = tail[tail.length - 1], q = tail[tail.length - 3] || tail[0];
  const ang = Math.atan2(p.y - q.y, p.x - q.x);
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(ang);
  ctx.lineWidth = 3;
  ctx.strokeStyle = pal.dark;
  const fill = pal.sil ? pal.main : mix(pal.main, pal.accent, 0.4);
  ctx.beginPath();
  if (kind === 'club') {
    ctx.arc(4, 0, 10, 0, TAU);
    ctx.stroke();
    ctx.fillStyle = pal.sil ? pal.main : pal.horn;
    ctx.fill();
    ctx.beginPath();
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * TAU;
      ctx.moveTo(4 + Math.cos(a) * 9, Math.sin(a) * 9);
      ctx.lineTo(4 + Math.cos(a) * 16, Math.sin(a) * 16);
    }
    ctx.lineWidth = 4;
    ctx.stroke();
  } else if (kind === 'blade') {
    ctx.moveTo(-4, 0);
    ctx.quadraticCurveTo(10, -22, 20, -20);
    ctx.quadraticCurveTo(12, 0, 22, 18);
    ctx.quadraticCurveTo(8, 16, -4, 0);
    ctx.stroke();
    ctx.fillStyle = pal.sil ? pal.main : hexA(pal.accent, 0.9);
    ctx.fill();
  } else if (kind === 'leaf') {
    ctx.moveTo(-2, 0);
    ctx.quadraticCurveTo(12, -14, 28, 0);
    ctx.quadraticCurveTo(12, 14, -2, 0);
    ctx.stroke();
    ctx.fillStyle = fill;
    ctx.fill();
  } else if (kind === 'flame') {
    if (pal.sil) {
      ctx.arc(8, 0, 10, 0, TAU);
      ctx.fillStyle = pal.main;
      ctx.fill();
    } else {
      const f = Math.sin(tt * 9) * 3;
      const gl = ctx.createRadialGradient(10, 0, 2, 10, 0, 26);
      gl.addColorStop(0, 'rgba(255,160,60,0.5)');
      gl.addColorStop(1, 'rgba(255,120,40,0)');
      ctx.fillStyle = gl;
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
    }
  }
  ctx.restore();
}

// ---------- 模様・飾り ----------
function drawPattern(ctx, id, pts, pal, k = 1) {
  if (id === 'plain' || pts.length < 3) return;
  const col = mix(pal.main, pal.accent, 0.75);
  ctx.save();
  ctx.fillStyle = col;
  ctx.strokeStyle = col;
  for (let i = 1; i < pts.length - 1; i++) {
    const p = pts[i], q = pts[i + 1], o = pts[i - 1];
    let nx = q.y - o.y, ny = -(q.x - o.x);
    const m = Math.hypot(nx, ny) || 1;
    nx /= m; ny /= m;
    if (ny > 0) { nx = -nx; ny = -ny; }
    const r = p.r;
    if (id === 'spots' && i % 3 === 1 && r > 8) {
      ctx.beginPath();
      ctx.ellipse(p.x + nx * r * 0.4 + (i % 2 ? 3 : -3), p.y + ny * r * 0.4, r * 0.2 * k, r * 0.15 * k, 0, 0, TAU);
      ctx.fill();
    } else if (id === 'stripes' && i % 3 === 0) {
      ctx.lineWidth = Math.max(2, r * 0.2);
      ctx.beginPath();
      ctx.moveTo(p.x + nx * r * 0.85, p.y + ny * r * 0.85);
      ctx.lineTo(p.x + nx * r * 0.05, p.y + ny * r * 0.05);
      ctx.stroke();
    } else if (id === 'scales' && i % 2 === 0 && r > 6) {
      ctx.lineWidth = 1.4;
      for (const off of [0.2, 0.55]) {
        ctx.beginPath();
        ctx.arc(p.x + nx * r * off, p.y + ny * r * off, Math.max(2.5, r * 0.16), 0.2, Math.PI - 0.2);
        ctx.stroke();
      }
    } else if (id === 'rings' && i % 4 === 2) {
      ctx.lineWidth = Math.max(2, r * 0.32);
      ctx.strokeStyle = mix(pal.main, pal.belly, 0.6);
      ctx.beginPath();
      ctx.moveTo(p.x + nx * r * 0.9, p.y + ny * r * 0.9);
      ctx.lineTo(p.x - nx * r * 0.9, p.y - ny * r * 0.9);
      ctx.stroke();
    }
  }
  ctx.restore();
}

function drawArmor(ctx, pts, level) {
  const n = pts.length;
  for (let i = Math.floor(n * 0.15); i < n * 0.9; i += 3) {
    const p = pts[i];
    const g = ctx.createLinearGradient(p.x, p.y - p.r, p.x, p.y);
    g.addColorStop(0, '#c8ccd4');
    g.addColorStop(1, '#5f6670');
    ctx.fillStyle = g;
    ctx.strokeStyle = '#2a2e34';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(p.x, p.y - p.r * 0.45, p.r * 0.55, p.r * 0.45, 0, Math.PI, TAU);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    if (level >= 4) {
      ctx.fillStyle = '#e8c35a';
      ctx.beginPath();
      ctx.arc(p.x, p.y - p.r * 0.6, 1.8, 0, TAU);
      ctx.fill();
    }
  }
}

function drawScar(ctx, pts) {
  const p = pts[Math.floor(pts.length * 0.55)];
  ctx.strokeStyle = 'rgba(235,220,200,0.75)';
  ctx.lineWidth = 2;
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    ctx.moveTo(p.x - p.r * 0.35 + i * 5, p.y - p.r * 0.55);
    ctx.lineTo(p.x - p.r * 0.05 + i * 5, p.y + p.r * 0.05);
    ctx.stroke();
  }
}

function drawCharm(ctx, pts, tt) {
  const p = pts[Math.floor(pts.length * 0.25)];
  ctx.strokeStyle = '#c99a3a';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.ellipse(p.x, p.y, p.r * 0.35, p.r * 1.05, 0.3, 0, TAU);
  ctx.stroke();
  const sw = Math.sin(tt * 2) * 2;
  ctx.fillStyle = '#5fb0c0';
  ctx.strokeStyle = '#1e3c3e';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(p.x + sw, p.y + p.r + 2);
  ctx.lineTo(p.x + 5 + sw, p.y + p.r + 9);
  ctx.lineTo(p.x + sw, p.y + p.r + 16);
  ctx.lineTo(p.x - 5 + sw, p.y + p.r + 9);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
}

function gem(ctx, h, level) {
  const x = h.r * 0.05, y = -h.r * 0.62;
  if (level >= 4) {
    const gl = ctx.createRadialGradient(x, y, 1, x, y, 12);
    gl.addColorStop(0, 'rgba(255,120,150,0.6)');
    gl.addColorStop(1, 'rgba(255,120,150,0)');
    ctx.fillStyle = gl;
    ctx.beginPath();
    ctx.arc(x, y, 12, 0, TAU);
    ctx.fill();
  }
  ctx.fillStyle = '#d04a6a';
  ctx.strokeStyle = '#e8c35a';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x, y - 5);
  ctx.lineTo(x + 4, y);
  ctx.lineTo(x, y + 5);
  ctx.lineTo(x - 4, y);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
}
