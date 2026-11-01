// プレイヤーとゴブリン（ドラゴンと同じ骨組み方式・同じ線の太さ・同じ光の向き）
// 骨組み: 腰 → 胴 → 胸 → 首 → 頭 の1本の背骨と、2関節の手足。
// 体（胴・首・頭・耳・手前の脚）は1つの輪郭で描き、服や肌の色はその輪郭の内側で塗り分ける。
// 動き: 立ち（息）・歩き・勝利・失敗。頭・耳・外套は体の動きに少し遅れて追従する。
import { drawEgg } from './draw.js';
import {
  TAU, mix, hexA, lineOf, smooth, tubePolys, ellipsePoly, quadPts, xf, toPath, solid, inside, fillPoly, unitPx, LINE_PX, LIGHT, limb, bbox, lightGrad,
} from './rig.js';

// 体格（頭身は全員そろえる：頭の半径 12 前後・全体の高さ 100 前後）
const BUILDS = {
  player: { torso: 27, hipR: 8.5, waistR: 8, chestR: 10, shoulder: 1, thigh: 21, shin: 21, upper: 15, fore: 14, limbR: 1, headR: 12, hunch: 0.04, neck: 6 },
  slim: { torso: 25, hipR: 7, waistR: 6, chestR: 8.5, shoulder: 0.9, thigh: 22, shin: 23, upper: 16, fore: 15, limbR: 0.85, headR: 12, hunch: 0.26, neck: 5 },
  broad: { torso: 28, hipR: 10, waistR: 10, chestR: 14, shoulder: 1.3, thigh: 19, shin: 19, upper: 16, fore: 16, limbR: 1.3, headR: 12.5, hunch: 0.32, neck: 5 },
  stocky: { torso: 24, hipR: 10, waistR: 9.5, chestR: 11.5, shoulder: 1.15, thigh: 17, shin: 17, upper: 14, fore: 13, limbR: 1.15, headR: 12, hunch: 0.18, neck: 4 },
  robe: { torso: 26, hipR: 8, waistR: 7, chestR: 9, shoulder: 0.95, thigh: 20, shin: 21, upper: 15, fore: 15, limbR: 0.9, headR: 12, hunch: 0.4, neck: 5 },
};

// 姿勢（角度は真下が0、前が＋）。tt は時間、pose は idle / walk / win / lose
function posture(pose, tt, B) {
  const P = { lean: B.hunch, lift: 0, head: 0, legN: [0.05, -0.06], legF: [-0.06, -0.04], armN: [0.12, 0.3], armF: [-0.08, 0.25], ph: 0, swing: 0 };
  if (pose === 'walk') {
    const ph = tt * 9;
    P.ph = ph;
    P.legN = [Math.sin(ph) * 0.55, -0.08 - Math.max(0, Math.sin(ph + 1.7)) * 0.85];
    P.legF = [Math.sin(ph + Math.PI) * 0.55, -0.08 - Math.max(0, Math.sin(ph + Math.PI + 1.7)) * 0.85];
    P.armN = [-Math.sin(ph) * 0.5, 0.35 + Math.max(0, -Math.sin(ph)) * 0.3];
    P.armF = [Math.sin(ph) * 0.5, 0.35 + Math.max(0, Math.sin(ph)) * 0.3];
    P.lean = B.hunch + 0.1;
    P.lift = -Math.abs(Math.cos(ph)) * 2.4;
    P.head = Math.sin(ph * 2 - 0.8) * 0.03;
    P.swing = Math.sin(ph - 0.9);
  } else if (pose === 'win') {
    const hop = Math.abs(Math.sin(tt * 5));
    P.lift = -hop * 8;
    P.lean = B.hunch * 0.3 - 0.06;
    P.armN = [Math.PI - 0.55 + Math.sin(tt * 10) * 0.12, 0.2];
    P.armF = [Math.PI - 0.8 + Math.sin(tt * 10 + 1) * 0.12, 0.2];
    P.legN = [0.15 * hop, -0.4 * hop];
    P.legF = [-0.1 * hop, -0.3 * hop];
    P.head = -0.12;
    P.swing = -hop;
  } else if (pose === 'lose') {
    const s = Math.sin(tt * 1.5);
    P.lean = B.hunch + 0.42 + s * 0.02;
    P.head = 0.38;
    P.armN = [0.4, 0.1];
    P.armF = [0.3, 0.1];
    P.legN = [0.45, -0.75];
    P.legF = [0.3, -0.7];
    P.lift = 0;
    P.swing = 0.3;
  } else {
    const br = Math.sin(tt * 2);
    P.lift = br * 0.6;
    P.lean = B.hunch + br * 0.012;
    P.armN = [0.12 + br * 0.03, 0.3];
    P.armF = [-0.06 - br * 0.03, 0.26];
    P.head = Math.sin(tt * 2 - 0.7) * 0.025;
    P.swing = Math.sin(tt * 1.3) * 0.2;
  }
  return P;
}

// 骨組みを組む（足もとが y=0、右向き）
function skeleton(B, P, tt, egg) {
  const legLen = B.thigh + B.shin;
  const rel = (a) => limb(0, 0, a[0], B.thigh, a[1], B.shin);
  const ln = rel(P.legN), lf = rel(P.legF);
  const drop = legLen - Math.max(ln.ey, lf.ey); // 一番低い足を地面に
  const hip = { x: 0, y: -legLen + drop + P.lift };
  const legN = limb(hip.x + 1.5, hip.y, P.legN[0], B.thigh, P.legN[1], B.shin);
  const legF = limb(hip.x - 2.5, hip.y - 1, P.legF[0], B.thigh, P.legF[1], B.shin);
  // 背骨（腰 → 胸 → 首）。猫背は胸が前に出る
  const up = (d, extra = 0) => ({ x: hip.x + Math.sin(P.lean + extra) * d, y: hip.y - Math.cos(P.lean + extra) * d });
  const waist = up(B.torso * 0.4, -0.05);
  const chest = up(B.torso * 0.85, B.hunch * 0.5);
  const neckBase = up(B.torso + 2, B.hunch * 0.9);
  const ha = P.lean * 0.55 + P.head + B.hunch * 0.6;
  const neckTop = { x: neckBase.x + Math.sin(ha) * B.neck, y: neckBase.y - Math.cos(ha) * B.neck };
  const head = { x: neckTop.x + Math.sin(ha) * B.headR * 0.75 + B.hunch * 4, y: neckTop.y - Math.cos(ha) * B.headR * 0.75, r: B.headR, ang: ha * 0.6 + P.head * 0.5 };
  const sh = { x: chest.x + 1, y: chest.y - B.chestR * 0.35 };
  const shF = { x: chest.x - 3 * B.shoulder, y: chest.y - B.chestR * 0.45 };
  let armN = limb(sh.x, sh.y, P.armN[0] + P.lean * 0.4, B.upper, P.armN[1], B.fore);
  let armF = limb(shF.x, shF.y, P.armF[0] + P.lean * 0.4, B.upper, P.armF[1], B.fore);
  if (egg) {
    // 卵を胸の前でかかえる
    armN = limb(sh.x, sh.y, 0.55 + P.lean * 0.4, B.upper, 1.25, B.fore);
    armF = limb(shF.x, shF.y, 0.7 + P.lean * 0.4, B.upper, 1.15, B.fore);
  }
  const spine = smooth([[hip.x, hip.y, B.hipR], [waist.x, waist.y, B.waistR], [chest.x, chest.y, B.chestR], [neckBase.x, neckBase.y, B.chestR * 0.55], [neckTop.x, neckTop.y, B.neck * 0.8 + 1.5]], 5);
  return { hip, waist, chest, neckBase, neckTop, head, legN, legF, armN, armF, spine, sh, shF };
}

const legCh = (L, r0, r1) => smooth([[L.x, L.y, r0], [L.kx, L.ky, (r0 + r1) / 2], [L.ex, L.ey, r1]], 4);
const footPoly = (L, len, h) => [[L.ex - len * 0.35, L.ey - h], [L.ex + len * 0.65, L.ey - h * 0.55], [L.ex + len * 0.8, L.ey + 0.5], [L.ex - len * 0.4, L.ey + 0.5]];
const handPoly = (A, r) => ellipsePoly(A.ex, A.ey, r, r * 0.9, 0, 12);
const styleOf = (main, k = 0, lw) => ({ light: mix(main, '#ffffff', 0.28 - k), main, dark: mix(main, '#16120e', 0.42), line: lineOf(mix(main, '#16120e', 0.5)), lw });
const grad = (ctx, polys, main) => lightGrad(ctx, bbox(polys), mix(main, '#ffffff', 0.28), main, mix(main, '#16120e', 0.4));
const farC = (c) => mix(c, '#2a2420', 0.32);

// 共通の人型を描く。look: 色と体格、extras: 種類ごとの装備
function drawFigure(ctx, x, y, scale, face, o, look, extras) {
  const B = BUILDS[look.build] || BUILDS.player;
  const t = o.t || 0;
  const pose = o.pose || (o.walking ? 'walk' : 'idle');
  const P = posture(pose, t * (o.speed || 1), B);
  const K = skeleton(B, P, t, o.egg);
  ctx.save();
  ctx.translate(x + (o.shake ? Math.sin(t * 60) * 3 : 0), y);
  // 影は地面に（光の反対側へ少しずらす）
  ctx.fillStyle = 'rgba(40,30,20,0.24)';
  ctx.beginPath();
  ctx.ellipse(-LIGHT.x * 4 * scale, 1, 22 * scale * B.shoulder, 6 * scale, 0, 0, TAU);
  ctx.fill();
  ctx.scale(scale * face, scale);
  const lw = LINE_PX * unitPx(ctx);
  const ctxF = { ctx, K, B, P, t, lw, look, o };
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  if (extras.back) extras.back(ctxF);
  // 奥の腕と脚（色を沈める）
  const farLeg = [...tubePolys(legCh(K.legF, 4.8 * B.limbR, 3.6 * B.limbR), 3), footPoly(K.legF, 11, 6)];
  solid(ctx, farLeg, styleOf(farC(look.legs), 0, lw));
  const farArm = [...tubePolys(legCh(K.armF, 3.8 * B.limbR, 3 * B.limbR), 3)];
  solid(ctx, farArm, styleOf(farC(look.sleeve || look.legs), 0, lw));
  solid(ctx, [handPoly(K.armF, 3.6 * B.limbR)], styleOf(farC(look.skin), 0, lw));
  if (extras.farHand) extras.farHand(ctxF);

  // 手前の体（胴・首・頭・耳・手前の脚を1つの輪郭に）
  const headP = extras.head ? extras.head(ctxF) : { polys: [ellipsePoly(K.head.x, K.head.y, B.headR, B.headR * 1.02, K.head.ang, 24)], skin: [] };
  const torso = tubePolys(K.spine, 3);
  const nearLeg = [...tubePolys(legCh(K.legN, 5 * B.limbR, 3.8 * B.limbR), 3)];
  const boot = footPoly(K.legN, 12, 7);
  const all = [...torso, ...headP.polys, ...(headP.skin || []), ...nearLeg, boot];
  const outline = toPath(all);
  ctx.strokeStyle = lineOf(mix(look.cloth, '#16120e', 0.5));
  ctx.lineWidth = lw * 2;
  ctx.stroke(outline);
  // 塗り分け：脚 → 胴（服） → 首と頭（肌）
  ctx.fillStyle = grad(ctx, nearLeg, look.legs);
  ctx.fill(toPath(nearLeg));
  ctx.fillStyle = grad(ctx, [boot], look.boots);
  ctx.fill(toPath([boot]));
  ctx.fillStyle = grad(ctx, torso, look.cloth);
  ctx.fill(toPath(torso));
  const skinPolys = [...headP.polys, ...(headP.skin || [])];
  ctx.fillStyle = grad(ctx, skinPolys, look.skin);
  ctx.fill(toPath(skinPolys));
  // 首の付け根は服の色からなじませる
  const nb = K.neckBase, nt = K.neckTop;
  const ng = ctx.createLinearGradient(nb.x, nb.y, nt.x, nt.y);
  ng.addColorStop(0, look.cloth);
  ng.addColorStop(1, hexA(look.cloth, 0));
  ctx.fillStyle = ng;
  ctx.beginPath();
  ctx.arc((nb.x + nt.x) / 2, (nb.y + nt.y) / 2, B.neck + 3, 0, TAU);
  ctx.fill();
  // 体の内側：陰と服の模様
  inside(ctx, outline, () => {
    // 腰まわりの陰
    fillPoly(ctx, xf(ellipsePoly(0, 0, B.hipR * 1.1, 4, 0, 12), K.hip.x, K.hip.y + 1), hexA(mix(look.cloth, '#16120e', 0.5), 0.35));
    if (extras.body) extras.body(ctxF);
  });
  if (extras.face) extras.face(ctxF);
  if (o.egg) drawEgg(ctx, o.egg, K.chest.x + 10, K.chest.y + 6, 20, { shadow: false, wobble: Math.sin(t * 6) * 0.08 });
  // 手前の腕
  const nearArm = tubePolys(legCh(K.armN, 4 * B.limbR, 3.2 * B.limbR), 3);
  const hand = handPoly(K.armN, 3.8 * B.limbR);
  const armOutline = toPath([...nearArm, hand]);
  ctx.strokeStyle = lineOf(mix(look.sleeve || look.cloth, '#16120e', 0.5));
  ctx.lineWidth = lw * 2;
  ctx.stroke(armOutline);
  ctx.fillStyle = grad(ctx, nearArm, look.sleeve || look.cloth);
  ctx.fill(toPath(nearArm));
  ctx.fillStyle = grad(ctx, [hand], look.skin);
  ctx.fill(toPath([hand]));
  if (extras.nearHand) extras.nearHand(ctxF);
  ctx.restore();
}

// ---------- プレイヤー（ドラゴンを連れる冒険者：外套・革の装備・道具袋） ----------
const PLAYER = { build: 'player', skin: '#e6c4a0', cloth: '#8a6440', sleeve: '#7a5a3a', legs: '#5e5650', boots: '#4e3a2c', cloak: '#3f6a72', hair: '#5a3a26', bag: '#a07a4a' };

export function drawExplorer(ctx, x, y, s, t, walking, face = 1, pose) {
  drawFigure(ctx, x, y, s * 0.6, face, { t, walking, pose }, PLAYER, {
    back({ ctx, K, B, P, lw }) {
      // 外套：肩から下がり、動きに遅れてなびく
      const sw = P.swing * 6;
      const top = { x: K.neckBase.x - 2, y: K.neckBase.y + 1 };
      const hemY = K.hip.y + 16;
      const poly = [
        [top.x + 6, top.y - 1],
        ...quadPts(top.x + 6, top.y - 1, K.chest.x - 4, K.chest.y + 4, K.hip.x - 4 + sw * 0.3, hemY, 6),
        ...quadPts(K.hip.x - 4 + sw * 0.3, hemY, K.hip.x - 12 + sw, hemY + 2, K.hip.x - 20 + sw * 1.6, hemY - 4, 4),
        ...quadPts(K.hip.x - 20 + sw * 1.6, hemY - 4, K.chest.x - 16 - B.chestR, K.chest.y, top.x - 6, top.y - 2, 6),
      ];
      solid(ctx, [poly], styleOf(PLAYER.cloak, 0, lw));
      // 道具袋（腰の後ろ）
      solid(ctx, [ellipsePoly(K.hip.x - 9, K.hip.y + 2, 6, 7.5, 0.2, 14)], styleOf(PLAYER.bag, 0, lw));
    },
    head({ K, B }) {
      const h = K.head;
      return { polys: [ellipsePoly(h.x, h.y, B.headR, B.headR * 1.04, h.ang, 24), ellipsePoly(h.x + 2, h.y + B.headR * 0.55, B.headR * 0.62, B.headR * 0.5, h.ang, 14)] };
    },
    body({ ctx, K, B, lw }) {
      // 革の胸当てとベルト
      const c = K.chest;
      ctx.fillStyle = grad(ctx, [ellipsePoly(c.x, c.y, B.chestR, B.chestR, 0)], '#9a7448');
      ctx.beginPath();
      ctx.ellipse(c.x + 1, c.y + 2, B.chestR * 0.85, B.chestR * 0.9, 0, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = '#3e2c1e';
      ctx.lineWidth = lw * 1.6;
      ctx.beginPath();
      ctx.moveTo(K.waist.x - B.waistR - 2, K.waist.y + 3);
      ctx.lineTo(K.waist.x + B.waistR + 2, K.waist.y + 1);
      ctx.stroke();
      ctx.fillStyle = '#c9a050';
      ctx.fillRect(K.waist.x + 2, K.waist.y - 0.5, 3.2, 3.2);
      // 肩ひも（たすき）
      ctx.strokeStyle = '#5a4028';
      ctx.lineWidth = lw * 1.2;
      ctx.beginPath();
      ctx.moveTo(K.neckBase.x - 5, K.neckBase.y + 2);
      ctx.lineTo(K.waist.x + 6, K.waist.y + 2);
      ctx.stroke();
    },
    face({ ctx, K, B, lw, P }) {
      const h = K.head;
      ctx.save();
      ctx.translate(h.x, h.y);
      ctx.rotate(h.ang);
      // 髪（頭の上から後ろへ。頭と同じ輪郭の内側に）
      ctx.save();
      ctx.beginPath();
      ctx.ellipse(0, 0, B.headR, B.headR * 1.04, 0, 0, TAU);
      ctx.clip();
      ctx.fillStyle = grad(ctx, [ellipsePoly(0, -6, B.headR, B.headR * 0.7)], PLAYER.hair);
      ctx.beginPath();
      ctx.moveTo(-B.headR - 2, 3);
      ctx.quadraticCurveTo(-B.headR, -B.headR - 4, 3, -B.headR - 2);
      ctx.quadraticCurveTo(B.headR + 2, -B.headR + 2, B.headR + 1, -2);
      ctx.quadraticCurveTo(4, -7, -3, -4);
      ctx.quadraticCurveTo(-5, 2, -B.headR - 2, 3);
      ctx.fill();
      ctx.restore();
      // 目と口
      const down = P.head > 0.2;
      ctx.fillStyle = '#2a1e16';
      ctx.beginPath();
      if (down) { ctx.fillRect(4, 0, 5, 1.6); } else ctx.ellipse(6.5, 0, 1.6, 2.2, 0, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = '#7a4a36';
      ctx.lineWidth = lw * 0.7;
      ctx.beginPath();
      if (P.lift < -4) ctx.arc(7, 6, 2.2, 0.2, Math.PI - 0.2); else { ctx.moveTo(5.5, 6.5); ctx.lineTo(9, 6); }
      ctx.stroke();
      ctx.fillStyle = 'rgba(200,110,90,0.35)';
      ctx.beginPath();
      ctx.arc(3.5, 4, 2.2, 0, TAU);
      ctx.fill();
      ctx.restore();
    },
  });
}

// ---------- ゴブリン ----------
// 少し猫背の細身の体・大きくとがった耳・つり目・牙・ぼろぼろの装束と革の防具・武器
// 種類（look.gear）ごとに体格と装備が変わり、シルエットで見分けられる
export function drawGoblin(ctx, gob, x, y, size, o = {}) {
  const L = gob.look;
  const s = (size / 100) * L.size;
  const look = { build: L.build || 'slim', skin: L.skin, cloth: L.cloth, sleeve: L.sleeve || L.skin, legs: L.legs || L.skinDark, boots: L.boots || '#4a3628' };
  const pose = o.pose || (o.hurt ? 'lose' : o.walking ? 'walk' : 'idle');
  const gear = L.gear;
  drawFigure(ctx, x, y + 46 * s, s * 1.05, o.flip ? -1 : 1, { ...o, pose }, look, {
    back({ ctx, K, B, P, lw }) {
      // ぼろぼろの肩布（すそがぎざぎざ。動きに遅れてなびく）
      if (gear === 'sack' || gear === 'drum') {
        const sw = P.swing * 5;
        const top = K.neckBase;
        const hemY = gear === 'drum' ? K.hip.y + 22 : K.chest.y + 12;
        const pts = [[top.x + 4, top.y]];
        pts.push(...quadPts(top.x + 4, top.y, K.chest.x + 2, K.chest.y, K.hip.x + 2 + sw * 0.3, hemY, 5));
        const n = 5;
        for (let i = 1; i <= n; i++) {
          const k = i / n;
          pts.push([K.hip.x + 2 - k * (18 + B.chestR) + sw * (0.3 + k), hemY + (i % 2 ? -5 : 1) - k * 3]);
        }
        pts.push(...quadPts(pts[pts.length - 1][0], pts[pts.length - 1][1], K.chest.x - B.chestR - 10, K.chest.y - 4, top.x - 5, top.y - 2, 5));
        solid(ctx, [pts], styleOf(gear === 'drum' ? L.cloth : mix(L.cloth, '#16120e', 0.15), 0, lw));
      }
      if (gear === 'sack' && !o.egg) solid(ctx, [ellipsePoly(K.chest.x - B.chestR - 6, K.chest.y + 6, 9, 11, -0.3, 16)], styleOf('#8a7350', 0, lw));
      if (gear === 'shield') {
        // 槍（背中側の手で持つ）
        const a = K.armF;
        ctx.strokeStyle = lineOf('#3a2a1c');
        ctx.lineWidth = lw * 2 + 3;
        ctx.beginPath(); ctx.moveTo(a.ex - 4, a.ey + 22); ctx.lineTo(a.ex + 4, a.ey - 46); ctx.stroke();
        ctx.strokeStyle = '#7a5a3a';
        ctx.lineWidth = 3;
        ctx.stroke();
        solid(ctx, [[[a.ex + 1, a.ey - 44], [a.ex + 9, a.ey - 46], [a.ex + 6, a.ey - 60]]], styleOf('#b8bcc4', 0, lw));
      }
    },
    head({ K, B, t, P }) {
      const h = K.head;
      const ear = L.ear || 1;
      // 耳は頭の動きに遅れて揺れる
      const flick = Math.sin(t * 2 - 1.1) * 0.08 + P.swing * 0.06;
      const earPoly = (side) => {
        const len = 27 * ear, base = side > 0 ? -1 : -5;
        const a = (side > 0 ? -0.3 : -0.12) + flick * side;
        const local = [[base + 1, -7], ...quadPts(base + 1, -7, base - len * 0.4, -len * 0.32, base - len, -len * 0.42, 6), ...quadPts(base - len, -len * 0.42, base - len * 0.45, len * 0.02, base + 2, 5, 6)];
        return xf(local, h.x, h.y, h.ang + a);
      };
      const skull = ellipsePoly(h.x, h.y, B.headR * 1.02, B.headR * 0.92, h.ang, 24);
      // 前に突き出た鼻と口元（細長い頭）
      const snout = xf(ellipsePoly(B.headR * 0.62, B.headR * 0.3, B.headR * 0.6, B.headR * 0.42, 0.15, 16), h.x, h.y, h.ang);
      const nose = xf([[B.headR * 0.7, -1], [B.headR * 1.55, B.headR * 0.28], [B.headR * 0.8, B.headR * 0.55]], h.x, h.y, h.ang);
      const polys = [skull, snout, nose, earPoly(1)];
      return { polys, skin: [earPoly(-1)] };
    },
    body({ ctx, K, B, lw }) {
      // 革の防具（胸当て・ベルト）と、ぼろの縫い目
      const c = K.chest;
      if (gear === 'club' || gear === 'shield') {
        ctx.fillStyle = grad(ctx, [ellipsePoly(c.x, c.y, B.chestR, B.chestR)], gear === 'shield' ? '#8a6a48' : '#6a4a32');
        ctx.beginPath();
        ctx.ellipse(c.x + 1, c.y + 1, B.chestR * 0.95, B.chestR * 0.9, 0, 0, TAU);
        ctx.fill();
        ctx.strokeStyle = 'rgba(30,20,12,0.55)';
        ctx.lineWidth = lw * 0.7;
        for (let i = -1; i <= 1; i++) { ctx.beginPath(); ctx.moveTo(c.x - B.chestR * 0.8, c.y + i * 4); ctx.lineTo(c.x + B.chestR * 0.8, c.y + i * 4 - 1); ctx.stroke(); }
      }
      ctx.strokeStyle = '#3a2618';
      ctx.lineWidth = lw * 1.5;
      ctx.beginPath();
      ctx.moveTo(K.waist.x - B.waistR - 2, K.waist.y + 4);
      ctx.lineTo(K.waist.x + B.waistR + 2, K.waist.y + 1);
      ctx.stroke();
      // 腰布（ぎざぎざのすそ）
      const hy = K.hip.y + B.hipR * 0.4;
      ctx.fillStyle = mix(L.cloth, '#16120e', 0.1);
      ctx.beginPath();
      ctx.moveTo(K.hip.x - B.hipR - 3, K.waist.y + 4);
      for (let i = 0; i <= 6; i++) ctx.lineTo(K.hip.x - B.hipR - 3 + (i * (B.hipR * 2 + 6)) / 6, hy + (i % 2 ? 7 : 2));
      ctx.lineTo(K.hip.x + B.hipR + 3, K.waist.y + 1);
      ctx.closePath();
      ctx.fill();
      if (gear === 'drum') {
        // 罠師：罠の道具を入れた袋
        ctx.fillStyle = '#7a5a3a';
        ctx.beginPath();
        ctx.ellipse(K.waist.x + 5, K.waist.y + 9, 4.5, 5.5, 0, 0, TAU);
        ctx.fill();
      }
    },
    face({ ctx, K, B, lw, P, o: opts }) {
      const h = K.head;
      ctx.save();
      ctx.translate(h.x, h.y);
      ctx.rotate(h.ang);
      const hurt = opts.hurt || P.head > 0.3;
      // フード（すき間から耳が出る）
      if (L.hood) {
        const hood = [[-B.headR - 3, 4], ...quadPts(-B.headR - 3, 4, -B.headR - 2, -B.headR - 6, 3, -B.headR - 3, 6), ...quadPts(3, -B.headR - 3, B.headR + 2, -B.headR + 1, B.headR * 0.9, -B.headR * 0.25, 5), ...quadPts(B.headR * 0.9, -B.headR * 0.25, 2, -B.headR * 0.55, -B.headR * 0.4, 3, 5)];
        solid(ctx, [hood], styleOf(L.cloth, 0, lw));
      } else if (gear === 'shield') {
        // 鋲の付いた革の帽子
        const cap = [[-B.headR - 1, -1], ...quadPts(-B.headR - 1, -1, -B.headR * 0.4, -B.headR * 1.5, B.headR * 0.8, -B.headR * 0.55, 6), [B.headR * 0.85, -B.headR * 0.25], [-B.headR * 0.6, -B.headR * 0.2]];
        solid(ctx, [cap], styleOf('#7a6048', 0, lw));
        ctx.fillStyle = '#d0d4da';
        for (const [px, py] of [[-6, -9], [-1, -11], [4, -9]]) { ctx.beginPath(); ctx.arc(px, py, 1.2, 0, TAU); ctx.fill(); }
      } else {
        // 頭のてっぺんの髪の房
        ctx.fillStyle = mix(L.skinDark, '#16120e', 0.3);
        ctx.beginPath();
        ctx.moveTo(-8, -B.headR * 0.75);
        ctx.quadraticCurveTo(-4, -B.headR - 9, 4, -B.headR * 0.85);
        ctx.quadraticCurveTo(-1, -B.headR - 4, -8, -B.headR * 0.75);
        ctx.fill();
      }
      // つり目（細い目に黄色い瞳）
      const ex = B.headR * 0.38, ey = -B.headR * 0.12;
      if (hurt) {
        ctx.strokeStyle = '#1e160e';
        ctx.lineWidth = lw * 0.9;
        ctx.beginPath(); ctx.moveTo(ex - 3, ey - 2); ctx.lineTo(ex + 4, ey + 1); ctx.stroke();
      } else {
        ctx.fillStyle = '#1e160e';
        ctx.beginPath();
        ctx.moveTo(ex - 4.5, ey + 1.5);
        ctx.quadraticCurveTo(ex, ey - 3, ex + 5, ey - 3.2);
        ctx.quadraticCurveTo(ex + 1, ey + 3, ex - 4.5, ey + 1.5);
        ctx.fill();
        ctx.fillStyle = '#f0cf48';
        ctx.beginPath();
        ctx.ellipse(ex + 0.8, ey - 0.6, 2, 1.4, -0.35, 0, TAU);
        ctx.fill();
        ctx.fillStyle = '#1e160e';
        ctx.fillRect(ex + 0.4, ey - 1.8, 0.9, 2.4);
      }
      // 険しいまゆ
      ctx.strokeStyle = mix(L.skinDark, '#16120e', 0.4);
      ctx.lineWidth = lw * 1.1;
      ctx.beginPath();
      ctx.moveTo(ex - 5, ey - 5.5);
      ctx.lineTo(ex + 5, ey - 2.5);
      ctx.stroke();
      // 口と牙
      const my = B.headR * 0.55;
      ctx.strokeStyle = '#2a1a12';
      ctx.lineWidth = lw * 0.8;
      ctx.beginPath();
      ctx.moveTo(B.headR * 0.35, my);
      ctx.quadraticCurveTo(B.headR * 0.8, my + (P.lift < -4 ? 3 : 1), B.headR * 1.15, my - 1.5);
      ctx.stroke();
      ctx.fillStyle = '#f2ead8';
      for (const fx of [B.headR * 0.55, B.headR * 0.95]) {
        ctx.beginPath(); ctx.moveTo(fx - 1.4, my); ctx.lineTo(fx, my - 3.6); ctx.lineTo(fx + 1.4, my - 0.4); ctx.closePath(); ctx.fill();
      }
      ctx.restore();
    },
    nearHand({ ctx, K, lw, t }) {
      const a = K.armN;
      const ang = Math.atan2(a.ey - a.ky, a.ex - a.kx);
      if (gear === 'club') {
        // 斧（柄 → 刃）
        ctx.save();
        ctx.translate(a.ex, a.ey);
        ctx.rotate(ang - Math.PI / 2 - 0.9 + Math.sin(t * 3) * 0.05);
        solid(ctx, [[[-2, 10], [-2.5, -40], [2.5, -40], [2, 10]]], styleOf('#6a4a32', 0, lw));
        solid(ctx, [[[1, -40], ...quadPts(1, -40, 18, -46, 20, -30, 5), ...quadPts(20, -30, 14, -24, 1, -26, 4)]], styleOf('#b0b4bc', 0, lw));
        ctx.restore();
      } else if (gear === 'sack' && !o.egg) {
        // 短剣
        ctx.save();
        ctx.translate(a.ex, a.ey);
        ctx.rotate(ang - Math.PI / 2 + 0.6);
        solid(ctx, [[[-1.6, 2], [-2, -6], [2, -6], [1.6, 2]]], styleOf('#5a3a24', 0, lw));
        solid(ctx, [[[-2.4, -6], [0, -22], [2.4, -6]]], styleOf('#c4c8d0', 0, lw));
        ctx.restore();
      } else if (gear === 'drum') {
        // 骨と羽根の杖
        ctx.save();
        ctx.translate(a.ex, a.ey);
        ctx.rotate(-0.15);
        solid(ctx, [[[-1.8, 26], [-1.8, -34], [1.8, -34], [1.8, 26]]], styleOf('#7a5a3a', 0, lw));
        solid(ctx, [ellipsePoly(0, -38, 5.5, 5, 0, 12)], styleOf('#e0d6c0', 0, lw));
        solid(ctx, [[[2, -34], [12, -26 + Math.sin(t * 3) * 2], [3, -30]]], styleOf('#4f7a8a', 0, lw));
        ctx.restore();
      } else if (gear === 'shield') {
        // 丸い木の盾（金属の縁）
        solid(ctx, [ellipsePoly(a.ex + 3, a.ey - 4, 14, 16, 0, 22)], styleOf('#8a6440', 0, lw));
        ctx.strokeStyle = '#a8acb4';
        ctx.lineWidth = lw * 1.6;
        ctx.beginPath(); ctx.ellipse(a.ex + 3, a.ey - 4, 12.5, 14.5, 0, 0, TAU); ctx.stroke();
        solid(ctx, [ellipsePoly(a.ex + 3, a.ey - 4, 4, 4.4, 0, 12)], styleOf('#b8bcc4', 0, lw));
      }
    },
  });
  if (gear === 'drum' && !o.egg) {
    // 腰の太鼓（太鼓バトルで鳴らす）
    ctx.save();
    ctx.translate(x, y + 46 * s);
    ctx.scale(s * 1.05 * (o.flip ? -1 : 1), s * 1.05);
    const lw = LINE_PX * unitPx(ctx);
    solid(ctx, [[[-12, -34], [12, -34], [10, -20], [-10, -20]]], styleOf('#8a3a2a', 0, lw));
    solid(ctx, [ellipsePoly(0, -34, 12, 4, 0, 16)], styleOf('#e0cfa8', 0, lw));
    ctx.restore();
  }
}
