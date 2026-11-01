// プレイヤーとゴブリン（ドラゴンと同じ骨組み方式・同じ線の太さ・同じ光の向き・360°対応）
// 骨組み: 腰 → 胴 → 胸 → 首 → 頭 の1本の背骨と、左右2本ずつの2関節の手足を 3D（X: 前、Y: 左、Z: 上）で持つ。
// 向き（yaw）に合わせて回して投影し、部品（脚・胴・腕・頭・耳・外套・道具）を奥にあるものから描く。
// 動き: 立ち（息）・歩き・走り・勝利・失敗。頭・耳・外套は体の動きに少し遅れて追従する。
import { drawEgg } from './draw.js';
import {
  TAU, mix, hexA, lineOf, at, sub, norm, frame, view, smooth3, beadPolys, projChain, projPoly, meanD, circle3, capPoly,
  ellipsePoly, toPath, bbox, capPath, fillCap, look, inside, fillPoly, strokePts, unitPx, offscreen, screenSize, drawPieces, paintBody, groundShadow,
  LINE_PX, LIGHT, limb3, quad3,
} from './rig.js';

// 体格（頭身は全員そろえる：頭の半径 12 前後・全体の高さ 100 前後）
const BUILDS = {
  player: { torso: 27, hipR: 8.5, waistR: 8, chestR: 10, shoulder: 1, thigh: 21, shin: 21, upper: 15, fore: 14, limbR: 1, headR: 12, hunch: 0.04, neck: 6 },
  slim: { torso: 25, hipR: 7, waistR: 6, chestR: 8.5, shoulder: 0.9, thigh: 22, shin: 23, upper: 16, fore: 15, limbR: 0.85, headR: 12, hunch: 0.26, neck: 5 },
  broad: { torso: 28, hipR: 10, waistR: 10, chestR: 14, shoulder: 1.3, thigh: 19, shin: 19, upper: 16, fore: 16, limbR: 1.3, headR: 12.5, hunch: 0.32, neck: 5 },
  stocky: { torso: 24, hipR: 10, waistR: 9.5, chestR: 11.5, shoulder: 1.15, thigh: 17, shin: 17, upper: 14, fore: 13, limbR: 1.15, headR: 12, hunch: 0.18, neck: 4 },
  robe: { torso: 26, hipR: 8, waistR: 7, chestR: 9, shoulder: 0.95, thigh: 20, shin: 21, upper: 15, fore: 15, limbR: 0.9, headR: 12, hunch: 0.4, neck: 5 },
};

// 姿勢（角度は真下が0、前が＋）。pose は idle / walk / run / win / lose
// legR/legL・armR/armL は右（Y-）と左（Y+）
function posture(pose, tt, B) {
  const P = { lean: B.hunch, lift: 0, head: 0, legR: [0.05, -0.06], legL: [-0.06, -0.04], armR: [0.12, 0.3], armL: [-0.08, 0.25], ph: 0, swing: 0, look: 0 };
  if (pose === 'walk' || pose === 'run') {
    const run = pose === 'run';
    const ph = tt * (run ? 13 : 9);
    const A = run ? 0.85 : 0.55;
    P.ph = ph;
    P.legR = [Math.sin(ph) * A, -0.1 - Math.max(0, Math.sin(ph + 1.7)) * (run ? 1.5 : 0.85)];
    P.legL = [Math.sin(ph + Math.PI) * A, -0.1 - Math.max(0, Math.sin(ph + Math.PI + 1.7)) * (run ? 1.5 : 0.85)];
    P.armR = [-Math.sin(ph) * (run ? 0.85 : 0.5), (run ? 1.2 : 0.35) + Math.max(0, -Math.sin(ph)) * 0.3];
    P.armL = [Math.sin(ph) * (run ? 0.85 : 0.5), (run ? 1.2 : 0.35) + Math.max(0, Math.sin(ph)) * 0.3];
    P.lean = B.hunch + (run ? 0.3 : 0.1);
    P.lift = -Math.abs(Math.cos(ph)) * (run ? 5 : 2.4);
    P.head = Math.sin(ph * 2 - 0.8) * 0.03 - (run ? 0.12 : 0);
    P.swing = Math.sin(ph - 0.9) * (run ? 1.4 : 1);
  } else if (pose === 'win') {
    const hop = Math.abs(Math.sin(tt * 5));
    P.lift = -hop * 8;
    P.lean = B.hunch * 0.3 - 0.06;
    P.armR = [Math.PI - 0.55 + Math.sin(tt * 10) * 0.12, 0.2];
    P.armL = [Math.PI - 0.8 + Math.sin(tt * 10 + 1) * 0.12, 0.2];
    P.legR = [0.15 * hop, -0.4 * hop];
    P.legL = [-0.1 * hop, -0.3 * hop];
    P.head = -0.12;
    P.swing = -hop;
  } else if (pose === 'lose') {
    const s = Math.sin(tt * 1.5);
    P.lean = B.hunch + 0.42 + s * 0.02;
    P.head = 0.38;
    P.armR = [0.4, 0.1];
    P.armL = [0.3, 0.1];
    P.legR = [0.45, -0.75];
    P.legL = [0.3, -0.7];
    P.swing = 0.3;
  } else {
    const br = Math.sin(tt * 2);
    P.lift = br * 0.6;
    P.lean = B.hunch + br * 0.012;
    P.armR = [0.12 + br * 0.03, 0.3];
    P.armL = [-0.06 - br * 0.03, 0.26];
    P.head = Math.sin(tt * 2 - 0.7) * 0.025;
    P.swing = Math.sin(tt * 1.3) * 0.2;
    P.look = Math.sin(tt * 0.6) * 0.25;
  }
  return P;
}

// 骨組みを組む（足もとが Z=0、前が X+）
function skeleton(B, P, egg) {
  const hipW = B.hipR * 0.55, shW = B.chestR * 0.85 * B.shoulder + 1;
  const ey = (a) => Math.cos(a[0]) * B.thigh + Math.cos(a[0] + a[1]) * B.shin;
  const hipZ = Math.max(ey(P.legR), ey(P.legL)) - P.lift;
  const hip = [0, 0, hipZ];
  const legR = limb3([0.5, -hipW, hipZ], P.legR[0], B.thigh, P.legR[1], B.shin, -0.03);
  const legL = limb3([-0.5, hipW, hipZ], P.legL[0], B.thigh, P.legL[1], B.shin, 0.03);
  const up = (d, extra = 0) => [Math.sin(P.lean + extra) * d, 0, hipZ + Math.cos(P.lean + extra) * d];
  const waist = up(B.torso * 0.4, -0.05);
  const chest = up(B.torso * 0.85, B.hunch * 0.5);
  const neckBase = up(B.torso + 2, B.hunch * 0.9);
  const ha = P.lean * 0.55 + P.head + B.hunch * 0.6;
  const neckTop = [neckBase[0] + Math.sin(ha) * B.neck, 0, neckBase[2] + Math.cos(ha) * B.neck];
  const ang = ha * 0.6 + P.head * 0.5 - B.hunch * 0.2;
  const headC = [neckTop[0] + Math.sin(ha) * B.headR * 0.75 + B.hunch * 4, 0, neckTop[2] + Math.cos(ha) * B.headR * 0.75];
  const f = norm([Math.cos(ang) * Math.cos(P.look), Math.cos(ang) * Math.sin(P.look), -Math.sin(ang)]);
  const F = frame(f);
  const shR = [chest[0] + 0.5, -shW, chest[2] + B.chestR * 0.3];
  const shL = [chest[0] - 0.5, shW, chest[2] + B.chestR * 0.3];
  let armR = limb3(shR, P.armR[0] + P.lean * 0.4, B.upper, P.armR[1], B.fore, -0.12);
  let armL = limb3(shL, P.armL[0] + P.lean * 0.4, B.upper, P.armL[1], B.fore, 0.12);
  if (egg) {
    // 卵を胸の前でかかえる
    armR = limb3(shR, 0.7 + P.lean * 0.4, B.upper, 1.25, B.fore, 0.05);
    armL = limb3(shL, 0.7 + P.lean * 0.4, B.upper, 1.25, B.fore, -0.05);
  }
  const spine = smooth3([[...hip, B.hipR], [...waist, B.waistR], [...chest, B.chestR], [...neckBase, B.chestR * 0.55], [...neckTop, B.neck * 0.8 + 1.5]], 4);
  return { hip, waist, chest, neckBase, neckTop, head: { C: headC, F, r: B.headR }, legR, legL, armR, armL, spine, shR, shL, hipW };
}

const legChain = (Lg, r0, r1) => smooth3([[...Lg.base, r0], [...Lg.knee, (r0 + r1) / 2], [...Lg.end, r1]], 3);
const footChain = (Lg, len, r) => [[...Lg.end, r], [...at(Lg.end, [1, 0, 0], len * 0.45, [0, 0, 1], -r * 0.15), r * 0.95], [...at(Lg.end, [1, 0, 0], len * 0.85, [0, 0, 1], -r * 0.25), r * 0.75]];

// 共通の人型を描く。lk: 色と体格、extras: 種類ごとの部品
function drawFigure(ctx, x, y, scale, face, o, lk, extras) {
  const B = BUILDS[lk.build] || BUILDS.player;
  const t = o.t || 0;
  const pose = o.pose || (o.running ? 'run' : o.walking ? 'walk' : 'idle');
  const P = posture(pose, t * (o.speed || 1), B);
  const K = skeleton(B, P, o.egg);
  if (offscreen(ctx, x, y - 50 * scale, 90 * scale)) return;
  const V = view(o.yaw ?? (face < 0 ? Math.PI + 0.35 : -0.35), o.pitch ?? 0.32);
  ctx.save();
  ctx.translate(x + (o.shake ? Math.sin(t * 60) * 3 : 0), y);
  ctx.scale(scale, scale);
  const lw = LINE_PX * unitPx(ctx);
  const lod = screenSize(ctx, 100) < 40 ? 'low' : 'high';
  groundShadow(ctx, V, [[...K.legR.end, 7], [...K.legL.end, 7], [K.hip[0], 0, 0, B.hipR * 1.5]], 0.22);
  const pj = (ch) => projChain(V, ch);
  const pieces = [];
  const joints = [];
  const bodyPieces = [];
  const piece = (name, polys, d, color, more = {}) => { const p = { name, polys, d, color, ...more }; pieces.push(p); if (!more.own) bodyPieces.push(p); return p; };
  const jAt = (a, b, p, r) => { const c = V.p(p); joints.push({ a, b, x: c.x, y: c.y, r }); };

  // 脚（ズボン＋靴）
  const legs = [];
  for (const [Lg, side] of [[K.legR, -1], [K.legL, 1]]) {
    const ch = legChain(Lg, 5 * B.limbR, 3.8 * B.limbR);
    const fc = footChain(Lg, 12, 3.9 * B.limbR);
    const boot = beadPolys(pj(smooth3([[...Lg.knee, 4.2 * B.limbR], ...fc.slice(0, 1)], 2).slice(1).concat(smooth3(fc, 2))));
    const p = piece('leg', [...beadPolys(pj(ch)), ...boot], meanD(V, ch), lk.legs, { boot, side, beads: ch });
    legs.push(p);
  }
  // 胴（服）
  const torso = piece('torso', beadPolys(pj(K.spine)), meanD(V, K.spine), lk.cloth, { beads: K.spine });
  for (const p of legs) jAt(torso, p, [p.side < 0 ? 0.5 : -0.5, p.side * K.hipW, K.hip[2]], 7 * B.limbR);
  // 腕（そで＋手）
  for (const [A, side] of [[K.armR, -1], [K.armL, 1]]) {
    const ch = legChain(A, 4 * B.limbR, 3.2 * B.limbR);
    const handPts = [[...A.end, 3.8 * B.limbR]];
    const hand = beadPolys(pj(handPts));
    const p = piece('arm', [...beadPolys(pj(ch)), ...hand], meanD(V, ch) - 0.5, lk.sleeve || lk.cloth, { hand, side, beads: ch, A });
    jAt(torso, p, A.base, 5.5 * B.limbR);
  }
  // 頭（肌）
  const H = K.head;
  const headParts = extras.head ? extras.head({ K, B, P, t, V }) : { beads: [[[...H.C, B.headR]], [[...at(H.C, H.F.f, B.headR * 0.15, H.F.u, -B.headR * 0.45), B.headR * 0.62]]] };
  const headPolys = headParts.beads.flatMap((ch) => beadPolys(pj(ch.length > 1 ? smooth3(ch, 2) : ch)));
  const head = piece('head', headPolys, V.p(H.C).d, lk.skin, { beads: headParts.beads.flat() });
  jAt(torso, head, K.neckTop, B.neck + 3);

  const ctxF = { ctx, K, B, P, t, lw, lk, o, V, pj, piece, jAt, head, torso, pieces, lod };
  if (extras.more) extras.more(ctxF);
  if (o.egg) {
    const ep = at(K.chest, [1, 0, 0], B.chestR + 7, [0, 0, 1], -3);
    const c = V.p(ep);
    piece('egg', [ellipsePoly(c.x, c.y, 8, 10, 0, 12)], c.d - 4, '#ffffff', {
      own: true, noLine: true,
      paint() { drawEgg(ctx, o.egg, c.x, c.y, 20, { shadow: false, wobble: Math.sin(t * 6) * 0.08 }); },
    });
  }

  // 全体の外形と塗り（色は部品ごと、光と線は全体でそろえる）
  const all = bodyPieces.flatMap((p) => p.polys);
  const bb = bbox(all);
  const union = lod === 'low' ? null : toPath(all);
  const looks = new Map();
  const lookOf = (c) => { if (!looks.has(c)) looks.set(c, look(ctx, bb, c, mix(c, '#ffffff', 0.32), mix(c, '#16120e', 0.5))); return looks.get(c); };
  for (const p of pieces) {
    if (p.own) continue;
    const L = lookOf(p.color);
    p.line = L.line;
    p.paint = (c, me, patch) => paintBody(c, me, L, union, lw, () => {
      if (me.boot) { c.fillStyle = lookOf(lk.boots).fill; c.fill(toPath(me.boot)); }
      if (me.hand) { c.fillStyle = lookOf(lk.skin).fill; c.fill(toPath(me.hand)); }
      if (me.name === 'leg' || me.name === 'arm') {
        // 手足の奥側の陰
        const sh = me.beads.map((b) => [b[0] - b[3] * 0.3, b[1] - me.side * b[3] * 0.3, b[2], b[3] * 0.7]);
        c.fillStyle = 'rgba(30,22,16,0.14)';
        c.fill(toPath(beadPolys(pj(sh))));
      }
      if (me.name === 'torso') {
        // 腰まわりの陰と、服の描きこみ
        const hp = V.p([K.hip[0], 0, K.hip[2] - 3]);
        const gr = c.createRadialGradient(hp.x, hp.y, 0, hp.x, hp.y, B.hipR * 1.3);
        gr.addColorStop(0, hexA(mix(lk.cloth, '#16120e', 0.5), 0.28));
        gr.addColorStop(1, hexA(mix(lk.cloth, '#16120e', 0.5), 0));
        c.fillStyle = gr;
        c.fillRect(hp.x - B.hipR * 1.4, hp.y - B.hipR * 1.4, B.hipR * 2.8, B.hipR * 2.8);
        if (extras.body) extras.body(ctxF);
      }
      if (me.name === 'head' && extras.face) extras.face(ctxF);
      if (me.extra) me.extra(c, me);
    }, patch);
  }
  drawPieces(ctx, pieces, joints, lw);
  ctx.restore();
}

// 腰のベルト・胸当てなど：体の表面の輪（見えている側だけ）
function ringOn(V, c, r, F, from = 0, to = TAU, n = 18) {
  const segs = [[]];
  for (let i = 0; i <= n; i++) {
    const a = from + ((to - from) * i) / n;
    const nrm = norm(at([0, 0, 0], F.f, Math.cos(a), F.l, Math.sin(a)));
    if (V.facing(nrm) > 0) { const q = V.p(at(c, nrm, r)); segs[segs.length - 1].push([q.x, q.y]); } else if (segs[segs.length - 1].length) segs.push([]);
  }
  return segs.filter((s) => s.length > 1);
}
const H_FRAME = frame([1, 0, 0]);

// 外套・肩布（背中に下がる布。動きに遅れてなびく。jag でぎざぎざのすそ）
function backCloth(ctxF, color, hemDrop, jag, widthK = 1) {
  const { K, B, P, V, piece, jAt, torso } = ctxF;
  const sw = P.swing * 6;
  const top = K.neckBase[2] - 1, bx = K.chest[0] - B.chestR * 0.75;
  const hz = K.hip[2] - hemDrop;
  const hx = K.hip[0] - B.hipR - 4 - sw * 0.5 - Math.max(0, P.lean) * 6;
  const w0 = B.chestR * 0.9 * widthK, w1 = B.hipR * 1.6 * widthK;
  const pts = [];
  pts.push([bx + 3, -w0, top], ...quad3([bx + 3, -w0, top], [bx - 5, 0, top + 2], [bx + 3, w0, top], 4));
  pts.push(...quad3([bx + 3, w0, top], [K.chest[0] - B.chestR - 4, w1 * 0.9, (top + hz) / 2], [hx, w1, hz], 5));
  const n = jag ? 7 : 4;
  for (let i = 1; i <= n; i++) {
    const u = i / n;
    const y = w1 - u * w1 * 2;
    const dz = jag ? (i % 2 ? 5 : -1) : Math.sin(u * Math.PI) * -2;
    pts.push([hx - Math.sin(u * Math.PI) * 4 - sw * 0.3, y, hz + dz]);
  }
  pts.push(...quad3([hx, -w1, hz], [K.chest[0] - B.chestR - 4, -w1 * 0.9, (top + hz) / 2], [bx + 3, -w0, top], 5));
  const p = piece('cloak', [projPoly(V, pts)], meanD(V, pts) + 2, color);
  jAt(torso, p, [bx, 0, top], B.chestR * 0.8);
  return p;
}

// ---------- プレイヤー（ドラゴンを連れる冒険者：外套・革の装備・道具袋） ----------
const PLAYER = { build: 'player', skin: '#e6c4a0', cloth: '#8a6440', sleeve: '#7a5a3a', legs: '#5e5650', boots: '#4e3a2c', cloak: '#3f6a72', hair: '#5a3a26', bag: '#a07a4a' };

export function drawExplorer(ctx, x, y, s, t, walking, face = 1, pose, yaw, o = {}) {
  drawFigure(ctx, x, y, s * 0.6, face, { t, walking, pose, yaw, ...o }, PLAYER, {
    head({ K, B }) {
      const H = K.head;
      return { beads: [[[...H.C, B.headR]], [[...at(H.C, H.F.f, B.headR * 0.18, H.F.u, -B.headR * 0.42), B.headR * 0.66]]] };
    },
    more(F) {
      const { K, B, V, piece, jAt, head, torso, pj } = F;
      backCloth(F, PLAYER.cloak, 16, false);
      // 道具袋（腰の後ろ・左）
      const bagC = [K.hip[0] - B.hipR * 0.8, B.hipR * 0.7, K.hip[2] + 1];
      const bag = piece('bag', beadPolys(pj([[...bagC, 6.5]])), V.p(bagC).d, PLAYER.bag);
      jAt(torso, bag, bagC, 5);
      // 髪（頭にかぶさり、顔の所だけあく）
      const H = K.head;
      const hc = at(H.C, H.F.f, -B.headR * 0.12, H.F.u, B.headR * 0.12);
      const R = B.headR * 1.06;
      const open = norm(at(H.F.f, H.F.u, -0.35));
      const hair = piece('hair', beadPolys(pj([[...hc, R], [...at(hc, H.F.f, -R * 0.35, H.F.u, -R * 0.45), R * 0.7]])), V.p(H.C).d - 0.3, PLAYER.hair, {
        extra(c) {
          const op = capPoly(V, hc, R, open, 0.22, 26);
          if (!op) return;
          fillCap(c, op, mix(PLAYER.hair, '#16120e', 0.3));
          inside(c, capPath(op), () => head.paint(c, head));
          // 前髪
          const fr = [];
          for (let i = 0; i <= 8; i++) {
            const u = i / 8 - 0.5;
            const d = norm(at(open, H.F.u, 1.3 - Math.abs(Math.sin(u * 9)) * 0.12, H.F.l, u * 1.6));
            if (V.facing(d) > -0.05) { const q = V.p(at(hc, d, R)); fr.push([q.x, q.y]); }
          }
          strokePts(c, fr, PLAYER.hair, B.headR * 0.16);
        },
      });
      void hair;
    },
    body({ ctx: c, K, B, V, lw }) {
      // 革の胸当て・ベルト・肩ひも
      const cp = capPoly(V, K.chest, B.chestR * 1.01, [1, 0, 0.15], 0.35, 22);
      if (cp) fillCap(c, cp, look(c, bbox([cp]), '#9a7448', '#c09a68', '#5a4028').fill);
      for (const seg of ringOn(V, [K.waist[0], 0, K.waist[2] - 2], B.waistR * 1.02, H_FRAME)) strokePts(c, seg, '#3e2c1e', lw * 2.2);
      const buckle = V.p(at([K.waist[0], 0, K.waist[2] - 2], [1, 0, 0], B.waistR * 1.03));
      if (V.facing([1, 0, 0]) > 0.1) { c.fillStyle = '#c9a050'; c.fillRect(buckle.x - 1.6, buckle.y - 1.6, 3.2, 3.2); }
      const strap = [];
      for (let i = 0; i <= 8; i++) {
        const u = i / 8;
        const p = [K.waist[0] + (K.chest[0] - K.waist[0]) * (1 - u), 0, K.waist[2] + (K.neckBase[2] - K.waist[2]) * (1 - u)];
        const r = B.waistR + (B.chestR - B.waistR) * (1 - u);
        const a = -1.1 + u * 2.2;
        for (const side of [1]) {
          const nrm = norm([Math.cos(a) * side, Math.sin(a), 0]);
          if (V.facing(nrm) > 0) { const q = V.p(at(p, nrm, r * 1.02)); strap.push([q.x, q.y]); }
        }
      }
      strokePts(c, strap, '#5a4028', lw * 1.6);
    },
    face({ ctx: c, K, B, V, lw, P }) {
      const H = K.head;
      const R = B.headR;
      const down = P.head > 0.2;
      for (const s of [1, -1]) {
        const e = norm(at([0, 0, 0], H.F.f, 0.95, H.F.u, 0.02, H.F.l, s * 0.42));
        if (V.facing(e) < 0.05) continue;
        const eye = capPoly(V, H.C, R * 1.01, e, down ? 0.997 : 0.988, 12);
        if (eye) fillPoly(c, eye, '#2a1e16');
        const ch = capPoly(V, H.C, R * 1.01, norm(at(e, H.F.u, -0.35, H.F.l, s * 0.12)), 0.985, 10);
        if (ch) fillPoly(c, ch, 'rgba(200,110,90,0.32)');
      }
      const m = [];
      for (let i = 0; i <= 4; i++) {
        const u = i / 4 - 0.5;
        const d = norm(at([0, 0, 0], H.F.f, 1, H.F.u, -0.45 + (P.lift < -4 ? -Math.cos(u * Math.PI) * 0.05 : 0), H.F.l, u * 0.32));
        if (V.facing(d) > 0) { const q = V.p(at(H.C, d, R * 1.0)); m.push([q.x, q.y]); }
      }
      strokePts(c, m, '#7a4a36', lw * 0.8);
    },
  });
}

// ---------- ゴブリン ----------
// 少し猫背の細身の体・大きくとがった耳・つり目・牙・ぼろぼろの装束と革の防具・武器
// 種類（look.gear）ごとに体格と装備が変わり、シルエットで見分けられる
export function drawGoblin(ctx, gob, x, y, size, o = {}) {
  const L = gob.look;
  const s = (size / 100) * L.size;
  const lk = { build: L.build || 'slim', skin: L.skin, cloth: L.cloth, sleeve: L.sleeve || L.skin, legs: L.legs || L.skinDark, boots: L.boots || '#4a3628' };
  const pose = o.pose || (o.hurt ? 'lose' : o.running ? 'run' : o.walking ? 'walk' : 'idle');
  const gear = L.gear;
  drawFigure(ctx, x, y + 46 * s, s * 1.05, o.flip ? -1 : 1, { ...o, pose }, lk, {
    head({ K, B }) {
      const H = K.head, r = B.headR;
      const P = (a, b, rr) => [...at(H.C, H.F.f, a, H.F.u, b), rr];
      // 細長い頭・前に突き出た口元と、とがった鼻
      return {
        beads: [
          [P(-r * 0.15, 0.04 * r, r * 0.95), P(r * 0.2, 0, r * 0.88)],
          [P(r * 0.45, -r * 0.3, r * 0.62), P(r * 0.62, -r * 0.42, r * 0.5)],
          [P(r * 0.7, -r * 0.02, r * 0.3), P(r * 1.2, -r * 0.12, r * 0.18), P(r * 1.62, -r * 0.2, r * 0.05)],
        ],
      };
    },
    more(F) {
      const { K, B, V, piece, jAt, head, torso, pj, P, t: tt } = F;
      const H = K.head, r = B.headR;
      // 耳（頭の動きに遅れて揺れる）
      const ear = L.ear || 1;
      const flick = Math.sin(tt * 2 - 1.1) * 0.08 + P.swing * 0.06;
      for (const side of [1, -1]) {
        const E = 27 * ear;
        const bt = at(H.C, H.F.l, side * r * 0.78, H.F.u, r * 0.32, H.F.f, -r * 0.1);
        const bb2 = at(H.C, H.F.l, side * r * 0.78, H.F.u, -r * 0.22, H.F.f, -r * 0.02);
        const tipP = at(H.C, H.F.l, side * (r * 0.8 + E * 0.8), H.F.f, -E * 0.5, H.F.u, E * (0.28 + flick * side));
        const pts = [bt, ...quad3(bt, at(lerpP(bt, tipP, 0.5), H.F.u, E * 0.12), tipP, 6), ...quad3(tipP, at(lerpP(bb2, tipP, 0.5), H.F.u, -E * 0.08), bb2, 6)];
        const inner = pts.map((p) => at(lerpP(p, lerpP(bt, bb2, 0.5), 0.3), H.F.l, side * 0.4));
        const ep = piece('ear', [projPoly(V, pts)], meanD(V, pts), L.skin, {
          extra(c) { fillPoly(c, projPoly(V, inner.slice(1, -2)), hexA(mix(L.skin, '#7a3a3a', 0.45), 0.5)); },
        });
        jAt(head, ep, lerpP(bt, bb2, 0.5), r * 0.32);
      }
      if (L.hood) {
        // フード（耳は横から出る。顔の所があく）
        const hc = at(H.C, H.F.f, -r * 0.15, H.F.u, r * 0.12);
        const R = r * 1.16;
        const open = norm(at(H.F.f, H.F.u, -0.2));
        const tail = [[...hc, R], [...at(hc, H.F.f, -R * 0.75, H.F.u, R * 0.15), R * 0.45], [...at(hc, H.F.f, -R * 1.25 - P.swing * 2, H.F.u, -R * 0.2), R * 0.08]];
        piece('hood', beadPolys(pj(smooth3(tail, 3))), V.p(H.C).d - 0.3, L.cloth, {
          extra(c) {
            const op = capPoly(V, hc, R, open, 0.3, 26);
            if (!op) return;
            fillCap(c, op, mix(L.cloth, '#16120e', 0.6));
            inside(c, capPath(op), () => head.paint(c, head));
            const segs = op.concat([op[0]]);
            strokePts(c, segs, hexA(lineOf(L.cloth), 0.5), F.lw * 0.8);
          },
        });
      } else if (gear !== 'shield') {
        // 頭のてっぺんの髪の房
        const base = at(H.C, H.F.u, r * 0.8, H.F.f, -r * 0.1);
        const ch = [[...base, 3], [...at(base, H.F.u, 6, H.F.f, -6), 2], [...at(base, H.F.u, 9, H.F.f, -13), 0.4]];
        const tuft = piece('tuft', beadPolys(pj(smooth3(ch, 2))), V.p(base).d, mix(L.skinDark, '#16120e', 0.3));
        jAt(head, tuft, base, 3);
      }
      // 腰布（前と後ろに垂れる。すそはぎざぎざ）
      for (const fb of [1, -1]) {
        const wz = K.waist[2] - 3, wx = K.waist[0] + fb * B.waistR * 0.75;
        const w = B.hipR * 0.95;
        const pts = [[wx, -w, wz]];
        for (let i = 0; i <= 6; i++) {
          const u = i / 6;
          pts.push([K.hip[0] + fb * (B.hipR * 0.85) - fb * P.swing * 1.5, -w * 1.05 + u * w * 2.1, K.hip[2] - 7 - (i % 2 ? 6 : 0)]);
        }
        pts.push([wx, w, wz]);
        const lc = piece('loin', [projPoly(V, pts)], meanD(V, pts) - fb * 1.5, mix(L.cloth, '#16120e', 0.12));
        jAt(torso, lc, [wx, 0, wz], B.waistR * 0.7);
      }
      if (gear === 'sack' || gear === 'drum') backCloth(F, gear === 'drum' ? L.cloth : mix(L.cloth, '#16120e', 0.15), gear === 'drum' ? 22 : -2, true, 0.9);
      if (gear === 'sack' && !F.o.egg) {
        const sc = [K.chest[0] - B.chestR - 5, 2, K.chest[2] - 4];
        const sk = piece('sack', beadPolys(pj([[...sc, 9.5], [...at(sc, [0, 0, 1], 9), 5]])), V.p(sc).d, '#8a7350');
        jAt(torso, sk, sc, 6);
      }
      // 武器・道具（右手と左手）
      const aR = K.armR, aL = K.armL;
      const hand = aR.end;
      if (gear === 'club' && !F.o.egg) {
        // 斧：柄は前上がりに持ち、刃は前へ
        const ax = norm([0.42 + Math.sin(tt * 3) * 0.04, -0.05, 0.9]);
        const top = at(hand, ax, 40);
        const handle = [[...at(hand, ax, -10), 2.2], [...top, 2.4]];
        const bl = [at(top, ax, 0), ...quad3(top, at(top, [1, 0, 0], 17, ax, -6), at(top, [1, 0, 0], 20, ax, -20), 5), ...quad3(at(top, [1, 0, 0], 20, ax, -20), at(top, [1, 0, 0], 13, ax, -24), at(top, ax, -14), 4)];
        piece('handle', beadPolys(pj(smooth3(handle, 3))), meanD(V, handle) - 0.2, '#6a4a32');
        piece('blade', [projPoly(V, bl)], meanD(V, bl) - 0.3, '#b0b4bc', { extra(c) { strokePts(c, projPoly(V, bl.slice(5, 10)), 'rgba(255,255,255,0.6)', F.lw); } });
      } else if (gear === 'sack' && !F.o.egg) {
        // 短剣
        const d = norm(sub(aR.end, aR.knee));
        const dir = norm(at(d, [1, 0, 0], 1.2));
        const grip = [[...at(hand, dir, -3), 1.8], [...at(hand, dir, 4), 1.8]];
        const bl = [at(hand, dir, 4, [0, 0, 1], 2.4), at(hand, dir, 21), at(hand, dir, 4, [0, 0, 1], -2.4)];
        piece('grip', beadPolys(pj(grip)), meanD(V, grip) - 0.2, '#5a3a24');
        piece('blade', [projPoly(V, bl)], meanD(V, bl) - 0.3, '#c4c8d0');
      } else if (gear === 'drum') {
        // 骨と羽根の杖
        const st = [[...at(hand, [0, 0, 1], -26), 1.9], [...at(hand, [0, 0, 1], 34), 1.9]];
        piece('staff', beadPolys(pj(st)), meanD(V, st) - 0.2, '#7a5a3a');
        const sk = at(hand, [0, 0, 1], 39);
        piece('skull', beadPolys(pj([[...sk, 5.2], [...at(sk, [1, 0, 0], 4, [0, 0, 1], -1.5), 3.6]])), V.p(sk).d - 0.3, '#e0d6c0');
        const fp = [at(sk, [0, 0, 1], -4), at(sk, [-1, 0, 0], 11, [0, 0, 1], 3 + Math.sin(tt * 3) * 2), at(sk, [-1, 0, 0], 2, [0, 0, 1], -1)];
        piece('feather', [projPoly(V, fp)], meanD(V, fp), '#4f7a8a');
        if (!F.o.egg) {
          // 腰の太鼓（太鼓バトルで鳴らす）
          const dc = at(K.waist, [1, 0, 0], B.waistR + 7, [0, 0, 1], -6);
          const dr = piece('drum', beadPolys(pj([[...at(dc, [0, 0, 1], -6), 10], [...at(dc, [0, 0, 1], 6), 11]])), V.p(dc).d - 1, '#8a3a2a', {
            extra(c) { fillPoly(c, circle3(V, at(dc, [0, 0, 1], 6.5), [0, 0, 1], 10.5, 18), look(c, bbox([[[0, 0], [20, 20]]]), '#e0cfa8', '#f4e8cc', '#a8946a').fill); },
          });
          jAt(torso, dr, at(dc, [-1, 0, 0], 6), 6);
        }
      } else if (gear === 'shield') {
        // 槍（右手）と、丸い木の盾（左腕）
        const ax = norm([0.12, 0, 1]);
        const sp = [[...at(hand, ax, -24), 1.8], [...at(hand, ax, 46), 1.8]];
        piece('spear', beadPolys(pj(sp)), meanD(V, sp) - 0.2, '#7a5a3a');
        const tp = at(hand, ax, 46);
        const head3 = [at(tp, [1, 0, 0], 3.5), at(tp, ax, 15), at(tp, [1, 0, 0], -3.5), at(tp, ax, 2)];
        piece('spearhead', [projPoly(V, head3)], meanD(V, head3) - 0.3, '#b8bcc4');
        const sc = at(aL.end, [0, 1, 0], 3, [1, 0, 0], 2);
        const nrm = norm([0.55, 0.85, 0.05]);
        const disc = circle3(V, sc, nrm, 15, 24);
        piece('shield', [disc], V.p(sc).d - 2, '#8a6440', {
          extra(c) {
            const vis = V.facing(nrm) > 0;
            if (!vis) return;
            strokePts(c, circle3(V, sc, nrm, 13.5, 24).concat([circle3(V, sc, nrm, 13.5, 24)[0]]), '#a8acb4', F.lw * 1.8);
            fillPoly(c, circle3(V, at(sc, nrm, 1), nrm, 4, 12), '#b8bcc4');
            for (const k of [-1, 1]) {
              const pl = frame(nrm, [0, 0, 1]);
              strokePts(c, projPoly(V, [at(sc, pl.u, k * 6, pl.l, -12), at(sc, pl.u, k * 6, pl.l, 12)]), 'rgba(60,40,24,0.4)', F.lw * 0.8);
            }
          },
        });
      }
    },
    body({ ctx: c, K, B, V, lw }) {
      // 革の防具（胸当て）・ベルト
      if (gear === 'club' || gear === 'shield') {
        const cp = capPoly(V, K.chest, B.chestR * 1.01, [1, 0, 0.1], 0.2, 22);
        if (cp) {
          fillCap(c, cp, look(c, bbox([cp]), gear === 'shield' ? '#8a6a48' : '#6a4a32', '#a88a64', '#3a2a1c').fill);
          for (const dz of [-4, 0, 4]) for (const seg of ringOn(V, at(K.chest, [0, 0, 1], dz), B.chestR * 1.02, H_FRAME, -0.9, 0.9, 8)) strokePts(c, seg, 'rgba(30,20,12,0.45)', lw * 0.7);
        }
        // 肩当て（右肩）
        const sp = capPoly(V, at(K.shR, [0, -1, 0], 1), 6.5 * B.limbR, [0.1, -0.6, 0.8], 0.1, 14);
        if (sp) fillCap(c, sp, look(c, bbox([sp]), '#7a6048', '#a8866a', '#3a2a1c').fill);
      }
      for (const seg of ringOn(V, [K.waist[0], 0, K.waist[2] - 2], B.waistR * 1.03, H_FRAME)) strokePts(c, seg, '#3a2618', lw * 2);
      // ぼろの縫い目
      for (const seg of ringOn(V, at(K.chest, [0, 0, 1], -B.chestR * 0.4), B.chestR * 1.0, H_FRAME, 0.4, 1.4, 5)) strokePts(c, seg, hexA(mix(L.cloth, '#16120e', 0.5), 0.5), lw * 0.6);
    },
    face({ ctx: c, K, B, V, lw, P, o: opts }) {
      const H = K.head, r = B.headR;
      const hurt = opts.hurt || P.head > 0.3;
      const Rs = r * 0.9;
      const C = at(H.C, H.F.f, r * 0.2);
      if (gear === 'shield' && !L.hood) {
        // 鋲の付いた革の帽子
        const cp = capPoly(V, H.C, r * 0.97, norm(at(H.F.u, H.F.f, -0.25)), 0.3, 22);
        if (cp) fillCap(c, cp, look(c, bbox([cp]), '#7a6048', '#a8866a', '#3a2a1c').fill);
        c.fillStyle = '#d0d4da';
        for (const a of [-0.5, 0, 0.5]) {
          const d = norm(at([0, 0, 0], H.F.u, 0.75, H.F.f, 0.2, H.F.l, a));
          if (V.facing(d) > 0) { const q = V.p(at(H.C, d, r * 0.97)); c.beginPath(); c.arc(q.x, q.y, 1.1, 0, TAU); c.fill(); }
        }
      }
      for (const s of [1, -1]) {
        // つり目（目頭は低く鼻寄り、目じりは高く外へ）
        const inner = norm(at([0, 0, 0], H.F.f, 1, H.F.l, s * 0.26, H.F.u, 0.02));
        const outer = norm(at([0, 0, 0], H.F.f, 0.72, H.F.l, s * 0.62, H.F.u, 0.26));
        if (V.facing(norm(at(inner, outer, 1))) < 0.02) continue;
        const pt = (u, v) => { const d = norm(at([0, 0, 0], inner, 1 - u, outer, u, H.F.u, v)); return V.p(at(C, d, Rs * 1.02)); };
        if (hurt) {
          strokePts(c, [0, 0.5, 1].map((u) => { const q = pt(u, 0.02); return [q.x, q.y]; }), '#1e160e', lw * 1.1);
        } else {
          const up = [], lo = [];
          for (let i = 0; i <= 6; i++) { const u = i / 6; const a = pt(u, Math.sin(u * Math.PI) * 0.09); up.push([a.x, a.y]); const b = pt(u, -Math.sin(u * Math.PI) * 0.035); lo.push([b.x, b.y]); }
          const almond = [...up, ...lo.reverse()];
          fillPoly(c, almond, '#1e160e');
          const inn = almond.map(([x0, y0], i, arr) => { const cx0 = arr.reduce((a, p) => a + p[0], 0) / arr.length, cy0 = arr.reduce((a, p) => a + p[1], 0) / arr.length; return [cx0 + (x0 - cx0) * 0.72, cy0 + (y0 - cy0) * 0.6]; });
          fillPoly(c, inn, '#f0cf48');
          const m = pt(0.55, 0.025);
          c.fillStyle = '#1e160e';
          c.fillRect(m.x - 0.45, m.y - 1.4, 0.9, 2.4);
        }
        // 険しいまゆ
        const b0 = pt(-0.05, 0.12), b1 = pt(1.05, 0.2);
        strokePts(c, [[b0.x, b0.y], [b1.x, b1.y]], mix(L.skinDark, '#16120e', 0.4), lw * 1.3);
      }
      // 口と牙（口元の前）
      const mouth = [];
      const fang = [];
      for (let i = 0; i <= 6; i++) {
        const u = i / 6 - 0.5;
        const d = norm(at([0, 0, 0], H.F.f, 1, H.F.l, u * 1.3, H.F.u, -0.18 + Math.abs(u) * 0.2 + (P.lift < -4 ? -0.08 : 0)));
        const mc = at(H.C, H.F.f, r * 0.55, H.F.u, -r * 0.4);
        if (V.facing(d) > 0) { const q = V.p(at(mc, d, r * 0.5)); mouth.push([q.x, q.y]); if (i === 2 || i === 4) fang.push(q); }
      }
      strokePts(c, mouth, '#2a1a12', lw * 0.9);
      c.fillStyle = '#f2ead8';
      for (const q of fang) { c.beginPath(); c.moveTo(q.x - 1.3, q.y); c.lineTo(q.x, q.y - 3.4); c.lineTo(q.x + 1.3, q.y - 0.3); c.closePath(); c.fill(); }
    },
  });
}

const lerpP = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
void LIGHT; void ellipsePoly;
