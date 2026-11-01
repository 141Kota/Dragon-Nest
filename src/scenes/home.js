// 拠点: 斜め視点の島。巣・施設・ドラゴン（手前と奥の重なり・影・グラデーション）
import { DATA, facilityById } from '../data.js';
import { W } from '../ui.js';
import { text, panel, button, rr, drawEgg, drawNest, drawFacility, bar, formatTime, iconStone, rarityStars, sparkle, C, textBox } from '../draw.js';
import { drawDragonAt } from '../dragon.js';
import { nestStatus, placeEgg, useStone, hatchNest, facilityLevel, facilityCost, upgradeFacility, genomeOf, eggSlots } from '../logic.js';
import { drawTopBar, drawNav, modalFrame, closeButton, modalTitle, dragonDetail, hintBubble, NAV_H, TOP_H, tag } from './common.js';

const NEST_SPOTS = [[-0.26, 0.24], [0.26, 0.24], [-0.56, 0.56], [0.56, 0.56]];
const WANDER = [[-0.3, -0.36], [0.3, -0.4], [0.02, -0.08], [-0.12, -0.3], [0.2, -0.12], [-0.25, -0.05]];

export function createHome(game) {
  let modal = null;
  let walkers = [];

  function layout() {
    const H = game.ui.H;
    const top = TOP_H + 10, bottom = H - NAV_H - 108;
    const cy = top + (bottom - top) * 0.52;
    const IW = 176, IH = Math.min(160, (bottom - top) * 0.42);
    return { cx: W / 2, cy, IW, IH, top, bottom, map: (u, v) => ({ x: W / 2 + u * IW, y: cy + v * IH }) };
  }

  function syncWalkers() {
    const st = game.state;
    const keys = Object.keys(st.dex)
      .sort((a, b) => st.team.includes(b) - st.team.includes(a) || st.dex[b].level - st.dex[a].level || st.dex[b].at - st.dex[a].at)
      .slice(0, 4);
    walkers = keys.map((k, i) => walkers.find((w) => w.key === k) || { key: k, u: WANDER[i][0], v: WANDER[i][1], tu: WANDER[i][0], tv: WANDER[i][1], wait: Math.random() * 3, flip: false });
  }

  function updateWalkers(dt) {
    for (const w of walkers) {
      if (w.wait > 0) { w.wait -= dt; continue; }
      const du = w.tu - w.u, dv = w.tv - w.v;
      const dist = Math.hypot(du, dv);
      if (dist < 0.01) {
        const p = WANDER[Math.floor(Math.random() * WANDER.length)];
        w.tu = p[0] + (Math.random() - 0.5) * 0.15;
        w.tv = p[1] + (Math.random() - 0.5) * 0.1;
        w.wait = 2 + Math.random() * 4;
        continue;
      }
      const sp = Math.min(dist, dt * 0.08);
      w.u += (du / dist) * sp;
      w.v += (dv / dist) * sp;
      if (Math.abs(du) > 0.005) w.flip = du < 0;
    }
  }

  function hint() {
    const st = game.state;
    const now = Date.now();
    if (st.nests.some((n) => n && nestStatus(n, now).ready)) return '卵がかえります。巣をタップ';
    if (st.storage.length && st.nests.some((n) => !n)) return '巣をタップして卵を置こう';
    if (!st.storage.length && st.nests.every((n) => !n)) return '探索に出て卵を探そう';
    if (st.nests.some((n) => n)) return '探索に出ると、孵化が少し早まります';
    return '卵がかえるのを待っています';
  }

  function tapNest(i) {
    const n = game.state.nests[i];
    const now = Date.now();
    if (!n) {
      if (!game.state.storage.length) game.toast('卵がありません。探索で探そう');
      else modal = { type: 'eggPick', slot: i };
    } else if (nestStatus(n, now).ready) {
      const res = hatchNest(game.state, i, game.rng, now);
      if (res) {
        game.save();
        modal = { type: 'hatch', res, egg: n.egg.egg, t0: game.t };
        syncWalkers();
      }
    } else modal = { type: 'nest', slot: i };
  }

  function drawIsland(ctx, L, t) {
    const H = game.ui.H;
    const sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, '#a9c4cf');
    sky.addColorStop(0.55, '#dfe3d6');
    sky.addColorStop(1, '#e9e1cc');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H);
    // 日の光と雲（ゆっくり流れる）
    const sun = ctx.createRadialGradient(318, TOP_H + 46, 4, 318, TOP_H + 46, 70);
    sun.addColorStop(0, 'rgba(255,248,224,0.95)');
    sun.addColorStop(1, 'rgba(255,248,224,0)');
    ctx.fillStyle = sun;
    ctx.fillRect(240, TOP_H - 30, 160, 160);
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    for (let i = 0; i < 4; i++) {
      const cx = ((i * 131 + t * 6) % (W + 140)) - 70, cy = TOP_H + 26 + i * 22;
      ctx.beginPath();
      ctx.ellipse(cx, cy, 38, 9, 0, 0, Math.PI * 2);
      ctx.ellipse(cx + 22, cy - 5, 22, 8, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    // 遠くの山並み（奥の層）
    ctx.fillStyle = '#9fb1b0';
    ctx.beginPath();
    ctx.moveTo(0, L.cy - L.IH * 0.7);
    ctx.lineTo(70, L.cy - L.IH * 1.35);
    ctx.lineTo(150, L.cy - L.IH * 0.9);
    ctx.lineTo(240, L.cy - L.IH * 1.5);
    ctx.lineTo(330, L.cy - L.IH * 0.95);
    ctx.lineTo(W, L.cy - L.IH * 1.2);
    ctx.lineTo(W, H);
    ctx.lineTo(0, H);
    ctx.fill();
    ctx.fillStyle = '#8ea596';
    ctx.beginPath();
    ctx.moveTo(0, L.cy - L.IH * 0.45);
    ctx.quadraticCurveTo(110, L.cy - L.IH * 0.95, 220, L.cy - L.IH * 0.6);
    ctx.quadraticCurveTo(320, L.cy - L.IH * 0.85, W, L.cy - L.IH * 0.5);
    ctx.lineTo(W, H);
    ctx.lineTo(0, H);
    ctx.fill();
    // 島の影と側面（厚み）
    ctx.fillStyle = 'rgba(50,60,50,0.22)';
    ctx.beginPath();
    ctx.ellipse(L.cx, L.cy + 46, L.IW * 0.95, L.IH * 0.8, 0, 0, Math.PI * 2);
    ctx.fill();
    const isle = (dy, k = 1) => {
      ctx.beginPath();
      ctx.ellipse(L.cx, L.cy + dy, L.IW * k, L.IH * k, 0, 0, Math.PI * 2);
    };
    isle(28);
    const side = ctx.createLinearGradient(0, L.cy, 0, L.cy + L.IH + 28);
    side.addColorStop(0, '#9a7c5c');
    side.addColorStop(1, '#6a5038');
    ctx.fillStyle = side;
    ctx.fill();
    isle(0);
    const top = ctx.createRadialGradient(L.cx - 50, L.cy - L.IH * 0.5, 20, L.cx, L.cy, L.IW * 1.1);
    top.addColorStop(0, '#b4c98e');
    top.addColorStop(0.6, '#93ae6c');
    top.addColorStop(1, '#6f8c50');
    ctx.fillStyle = top;
    ctx.fill();
    // 小道
    ctx.fillStyle = 'rgba(214,196,150,0.75)';
    for (let i = 0; i < 6; i++) {
      const p = L.map(-0.05 + Math.sin(i) * 0.05, 0.9 - i * 0.28);
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, 14 - i, 6 - i * 0.4, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    // 草
    ctx.strokeStyle = '#5f7a40';
    ctx.lineWidth = 2;
    for (const [u, v] of [[-0.78, 0.25], [0.74, 0.3], [-0.5, -0.55], [0.55, -0.55], [0.1, 0.82], [-0.08, 0.36]]) {
      const p = L.map(u, v);
      ctx.beginPath();
      for (let k = -1; k <= 1; k++) { ctx.moveTo(p.x + k * 4, p.y); ctx.lineTo(p.x + k * 6, p.y - 9 + Math.abs(k) * 2); }
      ctx.stroke();
    }
  }

  function drawModal(ctx, t) {
    const st = game.state;
    const close = () => { modal = null; };
    if (modal.type === 'eggPick' || modal.type === 'storage') {
      const rows = Math.max(1, Math.ceil(st.storage.length / 4));
      const box = modalFrame(game, 86 + rows * 112, { onBackdrop: close });
      modalTitle(ctx, box, modal.type === 'eggPick' ? 'どの卵を置きますか' : `持っている卵 ${st.storage.length}/${DATA.base.storageMax}`);
      closeButton(game, box, close);
      if (!st.storage.length) text(ctx, '卵はありません', W / 2, box.y + 100, { size: 14, align: 'center', color: C.sub });
      const cw = (box.w - 32) / 4;
      st.storage.forEach((e, i) => {
        const x = box.x + 16 + (i % 4) * cw;
        const y = box.y + 64 + Math.floor(i / 4) * 112;
        panel(ctx, x + 4, y, cw - 8, 100, { r: 12, fill: 'rgba(70,56,40,0.06)', shadow: false });
        drawEgg(ctx, e.egg, x + cw / 2, y + 42, 54, { wobble: Math.sin(t * 2 + i) * 0.04 });
        rarityStars(ctx, e.egg, x + cw / 2, y + 84, 7);
        game.ui.hit(x + 4, y, cw - 8, 100, () => {
          const slot = modal.type === 'eggPick' ? modal.slot : st.nests.findIndex((n) => !n);
          if (slot < 0) { game.toast('巣がいっぱいです'); return; }
          placeEgg(st, slot, i, Date.now());
          game.save();
          game.toast(`${DATA.eggs[e.egg].name}を置きました`);
          modal = null;
        });
      });
      return;
    }
    if (modal.type === 'nest') {
      const n = st.nests[modal.slot];
      if (!n) { modal = null; return; }
      const s = nestStatus(n, Date.now());
      if (s.ready) { modal = null; return; }
      const box = modalFrame(game, 340, { onBackdrop: close });
      closeButton(game, box, close);
      const e = DATA.eggs[n.egg.egg];
      modalTitle(ctx, box, e.name);
      drawEgg(ctx, n.egg.egg, W / 2, box.y + 112, 88, { wobble: Math.sin(t * 3) * 0.05 });
      rarityStars(ctx, n.egg.egg, W / 2, box.y + 170, 8);
      text(ctx, `かえるまで あと${formatTime(s.remain)}`, W / 2, box.y + 198, { size: 15, align: 'center', maxW: box.w - 40 });
      bar(ctx, box.x + 30, box.y + 216, box.w - 60, 12, s.progress, C.gold);
      const can = st.stones > 0;
      button(game.ui, box.x + 24, box.y + 252, box.w - 48, 64, `ぬくもり石を使う（残り${st.stones}）`, () => {
        if (useStone(st, modal.slot, Date.now())) { game.save(); game.toast(`${DATA.items.stone.reduceSec / 60}分早くなりました`); }
      }, { color: C.rust, disabled: !can, size: 15, sub: can ? `孵化が${DATA.items.stone.reduceSec / 60}分早まる` : '探索やバトルで手に入ります', onDisabled: () => game.toast('ぬくもり石がありません'), icon: (x, y) => iconStone(ctx, x - 8, y, 9, t) });
      return;
    }
    if (modal.type === 'facility') {
      const f = facilityById(modal.id);
      const lv = facilityLevel(st, f.id);
      const cost = facilityCost(st, f.id);
      const box = modalFrame(game, 380, { onBackdrop: close });
      closeButton(game, box, close);
      modalTitle(ctx, box, f.name);
      ctx.save();
      ctx.fillStyle = 'rgba(70,56,40,0.08)';
      rr(ctx, box.x + 24, box.y + 60, box.w - 48, 130, 14);
      ctx.fill();
      ctx.restore();
      drawFacility(ctx, f.look, W / 2, box.y + 162, 1.15, Math.max(1, lv), t);
      textBox(ctx, f.desc, box.x + 24, box.y + 204, box.w - 48, 40, { size: 14, align: 'center', color: C.sub, valign: 'middle' });
      text(ctx, lv ? `レベル ${lv} / ${f.maxLevel}` : 'まだ建てていません', W / 2, box.y + 258, { size: 15, align: 'center', maxW: box.w - 48 });
      if (cost == null) {
        button(game.ui, box.x + 24, box.y + 290, box.w - 48, 64, '最大レベルです', null, { disabled: true, size: 16 });
      } else {
        const can = st.shards >= cost;
        button(game.ui, box.x + 24, box.y + 290, box.w - 48, 64, lv ? '強化する' : '建てる', () => {
          if (upgradeFacility(st, f.id)) { game.save(); game.toast(`${f.name}を${lv ? '強化しました' : '建てました'}`); }
        }, { color: C.moss, disabled: !can, size: 16, sub: `星のかけら ${cost}個（所持 ${st.shards}）`, onDisabled: () => game.toast('星のかけらが足りません') });
      }
      return;
    }
    if (modal.type === 'hatch') {
      const el = t - modal.t0;
      const crackT = 1.6;
      if (el < crackT) {
        const box = modalFrame(game, 320);
        const k = el / crackT;
        text(ctx, '卵が動いた…', W / 2, box.y + 36, { size: 18, align: 'center' });
        drawEgg(ctx, modal.egg, W / 2, box.y + 176, 150, { wobble: Math.sin(el * 30) * 0.12 * k, crack: k, glow: k });
        return;
      }
      const res = modal.res;
      const banner = res.isNew ? (res.genome.shiny ? '新しいドラゴン（色違い）' : '新しいドラゴン') : res.levelUp ? `レベルアップ Lv.${res.level}` : '仲間がまた来てくれた';
      dragonDetail(game, res.key, { onClose: close, banner, reveal: Math.min(1, (el - crackT) / 0.6) });
      return;
    }
    if (modal.type === 'dragon') dragonDetail(game, modal.key, { onClose: close });
  }

  return {
    nav: 'home',
    enter() {
      modal = null;
      syncWalkers();
    },
    draw(ctx, t, dt) {
      const st = game.state;
      const L = layout();
      const now = Date.now();
      updateWalkers(dt);
      drawIsland(ctx, L, t);
      // 奥から順に描く
      const items = [];
      const labels = []; // 文字は最後にまとめて描き、ドラゴンなどに隠れないようにする
      DATA.facilities.forEach((f) => {
        const p = L.map(f.spot.x, f.spot.y);
        items.push({ y: p.y, draw: () => {
          const lv = facilityLevel(st, f.id);
          drawFacility(ctx, f.look, p.x, p.y, 0.95, lv, t);
          if (lv <= 0) labels.push(() => tag(ctx, f.name, p.x, p.y + 20, { align: 'center', size: 11, fill: C.glass, color: C.text, maxW: 110 }));
          game.ui.hit(p.x - 46, p.y - 90, 92, 120, () => { modal = { type: 'facility', id: f.id }; });
        } });
      });
      const slots = eggSlots(st);
      for (let i = 0; i < slots; i++) {
        const p = L.map(...NEST_SPOTS[i]);
        const n = st.nests[i];
        items.push({ y: p.y, draw: () => {
          const s = nestStatus(n, now);
          drawNest(ctx, p.x, p.y, 0.9, { highlight: s.empty && st.storage.length ? 0.4 + 0.3 * Math.sin(t * 4) : 0 });
          if (n) {
            const wob = s.ready ? Math.sin(t * 12) * 0.12 * (Math.sin(t * 2) > 0 ? 1 : 0.2) : Math.sin(t * 1.5 + i) * 0.03;
            drawEgg(ctx, n.egg.egg, p.x, p.y - 28, 46, { shadow: false, wobble: wob, glow: s.ready ? 0.7 + 0.3 * Math.sin(t * 5) : 0 });
            if (s.ready) {
              labels.push(() => tag(ctx, 'かえる', p.x, p.y + 12, { align: 'center', size: 11, fill: C.rust, color: '#fffaf0' }));
            } else {
              labels.push(() => {
                bar(ctx, p.x - 28, p.y + 13, 56, 7, s.progress, C.gold);
                tag(ctx, formatTime(s.remain), p.x, p.y + 24, { align: 'center', size: 11, fill: C.glass, color: C.text });
              });
            }
          } else {
            labels.push(() => tag(ctx, '空き', p.x, p.y + 14, { align: 'center', size: 11, fill: C.glass, color: C.sub }));
          }
          game.ui.hit(p.x - 44, p.y - 64, 88, 98, () => tapNest(i));
        } });
      }
      for (const w of walkers) {
        const p = L.map(w.u, w.v);
        const d = st.dex[w.key];
        if (!d) continue;
        const g = genomeOf(st, w.key);
        items.push({ y: p.y, draw: () => {
          drawDragonAt(ctx, g, p.x, p.y, 92, { anchor: 'feet', t: t + w.u * 7, level: d.level, flip: w.flip, speed: w.wait > 0 ? 0.6 : 1.4 });
          if (st.team.includes(w.key)) sparkle(ctx, p.x, p.y - 74 + Math.sin(t * 3) * 2, 5, C.gold, t);
          game.ui.hit(p.x - 40, p.y - 70, 80, 70, () => { modal = { type: 'dragon', key: w.key }; });
        } });
      }
      items.sort((a, b) => a.y - b.y).forEach((it) => it.draw());
      labels.forEach((fn) => fn());

      // 下のボタン列
      const by = game.ui.H - NAV_H - 62;
      hintBubble(ctx, hint(), W / 2, by - 46);
      const bw = (W - 16 * 2 - 14) / 2;
      button(game.ui, 16, by, bw, 50, `卵 ${st.storage.length}/${DATA.base.storageMax}`, () => { modal = { type: 'storage' }; }, { color: C.amber, size: 16 });
      button(game.ui, 16 + bw + 14, by, bw, 50, '探索に出る', () => game.go('select'), { color: C.teal, size: 16 });

      drawTopBar(game, 'ドラゴンの巣');
      drawNav(game, 'home');
      if (modal) drawModal(ctx, t);
    },
    openDragon(key) { modal = { type: 'dragon', key }; },
    get modal() { return modal; },
    set modal(m) { modal = m; },
  };
}
