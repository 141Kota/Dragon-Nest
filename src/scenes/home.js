// 拠点: 斜め視点の島。巣・施設・ドラゴン
import { DATA, facilityById } from '../data.js';
import { W } from '../ui.js';
import { text, panel, button, rr, drawEgg, drawNest, drawFacility, cloud, skyGradient, bar, formatTime, iconStone, rarityStars, sparkle, wrapText } from '../draw.js';
import { drawDragonAt } from '../dragon.js';
import { nestStatus, placeEgg, useStone, hatchNest, facilityLevel, facilityCost, upgradeFacility, parseKey, eggSlots } from '../logic.js';
import { drawTopBar, drawNav, modalFrame, closeButton, dragonDetail, hintBubble, NAV_H, TOP_H } from './common.js';

const NEST_SPOTS = [[-0.26, 0.26], [0.26, 0.26], [-0.5, 0.6], [0.5, 0.6]];
const WANDER = [[-0.3, -0.36], [0.3, -0.4], [0.02, -0.08], [-0.12, -0.3], [0.2, -0.12], [-0.25, -0.05]];

export function createHome(game) {
  let modal = null;
  let walkers = [];

  function layout() {
    const H = game.ui.H;
    const top = TOP_H + 10, bottom = H - NAV_H - 70;
    const cy = top + (bottom - top) * 0.48;
    const IW = 180, IH = Math.min(170, (bottom - top) * 0.44);
    return { cx: W / 2, cy, IW, IH, top, bottom, map: (u, v) => ({ x: W / 2 + u * IW, y: cy + v * IH }) };
  }

  function syncWalkers() {
    const st = game.state;
    const keys = Object.keys(st.dex)
      .sort((a, b) => (b === st.partner) - (a === st.partner) || st.dex[b].level - st.dex[a].level || st.dex[b].at - st.dex[a].at)
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
      const sp = Math.min(dist, dt * 0.09);
      w.u += (du / dist) * sp;
      w.v += (dv / dist) * sp;
      if (Math.abs(du) > 0.005) w.flip = du < 0;
    }
  }

  function hint() {
    const st = game.state;
    const now = Date.now();
    if (st.nests.some((n) => n && nestStatus(n, now).ready)) return 'たまごが かえるよ！ 巣をタップしよう';
    if (st.storage.length && st.nests.some((n) => !n)) return '巣をタップして たまごを おこう';
    if (!st.storage.length && st.nests.every((n) => !n)) return 'たんけんに でかけて たまごを さがそう';
    if (st.nests.some((n) => n)) return 'たんけんに でると たまごが はやく かえるよ';
    return 'たまごを まっているよ';
  }

  function tapNest(i) {
    const n = game.state.nests[i];
    const now = Date.now();
    if (!n) {
      if (!game.state.storage.length) game.toast('たまごが ないよ。たんけんで さがそう');
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
    const theme = DATA.locations[0].theme;
    skyGradient(ctx, game.ui.H, '#ffe3c2', '#cfeee0');
    cloud(ctx, 70 + Math.sin(t * 0.1) * 10, TOP_H + 40, 0.9);
    cloud(ctx, 320 - Math.sin(t * 0.08) * 12, TOP_H + 70, 0.7, 0.7);
    // 遠くの丘
    ctx.fillStyle = '#b6dcb0';
    ctx.beginPath();
    ctx.moveTo(0, L.cy - L.IH * 0.6);
    ctx.quadraticCurveTo(90, L.cy - L.IH * 1.25, 200, L.cy - L.IH * 0.75);
    ctx.quadraticCurveTo(300, L.cy - L.IH * 1.15, W, L.cy - L.IH * 0.7);
    ctx.lineTo(W, game.ui.H);
    ctx.lineTo(0, game.ui.H);
    ctx.fill();
    // 島の側面（厚み）
    const isle = (dy) => {
      ctx.beginPath();
      ctx.ellipse(L.cx, L.cy + dy, L.IW, L.IH, 0, 0, Math.PI * 2);
    };
    ctx.fillStyle = 'rgba(60,40,40,0.18)';
    ctx.beginPath();
    ctx.ellipse(L.cx, L.cy + 40, L.IW * 0.95, L.IH * 0.8, 0, 0, Math.PI * 2);
    ctx.fill();
    isle(24);
    const side = ctx.createLinearGradient(0, L.cy, 0, L.cy + L.IH + 24);
    side.addColorStop(0, '#9b7a5a');
    side.addColorStop(1, '#6f533e');
    ctx.fillStyle = side;
    ctx.fill();
    isle(0);
    const top = ctx.createRadialGradient(L.cx - 40, L.cy - L.IH * 0.5, 20, L.cx, L.cy, L.IW * 1.1);
    top.addColorStop(0, '#c9ecb0');
    top.addColorStop(0.6, theme.ground);
    top.addColorStop(1, theme.groundSide);
    ctx.fillStyle = top;
    ctx.fill();
    // 小道
    ctx.fillStyle = 'rgba(240,226,180,0.7)';
    for (let i = 0; i < 6; i++) {
      const p = L.map(-0.05 + Math.sin(i) * 0.05, 0.9 - i * 0.28);
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, 14 - i, 6 - i * 0.4, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    // 草
    ctx.strokeStyle = '#6aa85a';
    ctx.lineWidth = 2;
    for (const [u, v] of [[-0.75, 0.3], [0.7, 0.35], [-0.5, -0.55], [0.55, -0.55], [0.1, 0.8], [-0.15, 0.3]]) {
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
      const box = modalFrame(game, 90 + rows * 110, { onBackdrop: close });
      text(ctx, modal.type === 'eggPick' ? 'どのたまごを おく？' : `もっている たまご ${st.storage.length}/${DATA.base.storageMax}`, box.x + 22, box.y + 34, { size: 18 });
      closeButton(game, box, close);
      if (!st.storage.length) text(ctx, 'たまごは ないよ', W / 2, box.y + 110, { size: 15, align: 'center', color: '#a08f8a' });
      const cw = (box.w - 32) / 4;
      st.storage.forEach((e, i) => {
        const x = box.x + 16 + (i % 4) * cw;
        const y = box.y + 66 + Math.floor(i / 4) * 110;
        panel(ctx, x + 4, y, cw - 8, 100, { r: 16, fill: '#fff', shadow: false });
        drawEgg(ctx, e.egg, x + cw / 2, y + 40, 52, { wobble: Math.sin(t * 2 + i) * 0.04 });
        rarityStars(ctx, e.egg, x + cw / 2, y + 80, 7);
        game.ui.hit(x + 4, y, cw - 8, 100, () => {
          let slot = modal.type === 'eggPick' ? modal.slot : st.nests.findIndex((n) => !n);
          if (slot < 0) { game.toast('巣が いっぱいだよ'); return; }
          placeEgg(st, slot, i, Date.now());
          game.save();
          game.toast(`${DATA.eggs[e.egg].name}を おいた！`);
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
      const box = modalFrame(game, 330, { onBackdrop: close });
      closeButton(game, box, close);
      const e = DATA.eggs[n.egg.egg];
      text(ctx, e.name, W / 2, box.y + 36, { size: 20, align: 'center' });
      drawEgg(ctx, n.egg.egg, W / 2, box.y + 110, 90, { wobble: Math.sin(t * 3) * 0.05 });
      rarityStars(ctx, n.egg.egg, W / 2, box.y + 168, 8);
      text(ctx, `うまれるまで あと ${formatTime(s.remain)}`, W / 2, box.y + 196, { size: 16, align: 'center' });
      bar(ctx, box.x + 30, box.y + 214, box.w - 60, 14, s.progress, '#f2a65a');
      const can = st.stones > 0;
      button(game.ui, box.x + 30, box.y + 248, box.w - 60, 56, `ぬくもり石をつかう（のこり${st.stones}）`, () => {
        if (useStone(st, modal.slot, Date.now())) { game.save(); game.toast(`あたたかい！ ${DATA.items.stone.reduceSec / 60}分はやくなった`); }
      }, { color: '#ef8a5a', disabled: !can, size: 16, sub: can ? `${DATA.items.stone.reduceSec / 60}分 はやくなる` : 'たんけんや バトルで 手に入る', onDisabled: () => game.toast('ぬくもり石が ないよ') });
      iconStone(ctx, box.x + 52, box.y + 266, 10, t);
      return;
    }
    if (modal.type === 'facility') {
      const f = facilityById(modal.id);
      const lv = facilityLevel(st, f.id);
      const cost = facilityCost(st, f.id);
      const box = modalFrame(game, 360, { onBackdrop: close });
      closeButton(game, box, close);
      text(ctx, f.name, W / 2, box.y + 36, { size: 20, align: 'center' });
      ctx.save();
      ctx.fillStyle = '#e9f5dc';
      rr(ctx, box.x + 30, box.y + 60, box.w - 60, 130, 18);
      ctx.fill();
      ctx.restore();
      drawFacility(ctx, f.look, W / 2, box.y + 160, 1.2, Math.max(1, lv), t);
      wrapText(ctx, f.desc, W / 2, box.y + 214, box.w - 50, { size: 14, align: 'center', color: '#6b5560' });
      text(ctx, lv ? `いまのレベル ${lv} / ${f.maxLevel}` : 'まだ たてていない', W / 2, box.y + 248, { size: 15, align: 'center' });
      if (cost == null) {
        button(game.ui, box.x + 30, box.y + 278, box.w - 60, 56, 'さいだいレベル！', null, { disabled: true });
      } else {
        const can = st.shards >= cost;
        button(game.ui, box.x + 30, box.y + 278, box.w - 60, 56, lv ? 'きょうかする' : 'たてる', () => {
          if (upgradeFacility(st, f.id)) { game.save(); game.toast(`${f.name}が ${lv ? 'つよくなった' : 'できた'}！`); }
        }, { color: '#7cc76a', disabled: !can, sub: `ほしのかけら ${cost}こ（もっている ${st.shards}）`, onDisabled: () => game.toast('ほしのかけらが たりないよ') });
      }
      return;
    }
    if (modal.type === 'hatch') {
      const el = t - modal.t0;
      const crackT = 1.6;
      if (el < crackT) {
        const box = modalFrame(game, 320);
        const k = el / crackT;
        text(ctx, 'あれれ…？', W / 2, box.y + 40, { size: 20, align: 'center' });
        drawEgg(ctx, modal.egg, W / 2, box.y + 170, 150, { wobble: Math.sin(el * 30) * 0.12 * k, crack: k, glow: k });
        return;
      }
      const res = modal.res;
      const banner = res.isNew ? 'あたらしい ドラゴン！' : res.levelUp ? `レベルアップ！ Lv.${res.level}` : 'なかまが きてくれた！';
      dragonDetail(game, res.key, { onClose: close, banner, reveal: Math.min(1, (el - crackT) / 0.6) });
      const box = { y: Math.max(20, (game.ui.H - Math.min(game.ui.H - 40, 590)) / 2) };
      if (res.genome.shiny) text(ctx, 'いろちがいだ！', W / 2, box.y + 70, { size: 16, align: 'center', color: '#d99a1d', stroke: '#fff' });
      return;
    }
    if (modal.type === 'dragon') {
      dragonDetail(game, modal.key, { onClose: close });
    }
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
      // 奥から順に描くもの
      const items = [];
      DATA.facilities.forEach((f) => {
        const p = L.map(f.spot.x, f.spot.y);
        items.push({ y: p.y, draw: () => {
          const lv = facilityLevel(st, f.id);
          drawFacility(ctx, f.look, p.x, p.y, 1, lv, t);
          if (lv <= 0) text(ctx, f.name, p.x, p.y + 24, { size: 11, align: 'center', color: '#fff', stroke: 'rgba(70,50,50,0.5)', strokeW: 3 });
          game.ui.hit(p.x - 46, p.y - 90, 92, 120, () => { modal = { type: 'facility', id: f.id }; });
        } });
      });
      const slots = eggSlots(st);
      for (let i = 0; i < slots; i++) {
        const p = L.map(...NEST_SPOTS[i]);
        const n = st.nests[i];
        items.push({ y: p.y, draw: () => {
          const s = nestStatus(n, now);
          drawNest(ctx, p.x, p.y, 1, { highlight: s.empty && st.storage.length ? 0.5 + 0.4 * Math.sin(t * 4) : 0 });
          if (n) {
            const wob = s.ready ? Math.sin(t * 12) * 0.12 * (Math.sin(t * 2) > 0 ? 1 : 0.2) : Math.sin(t * 1.5 + i) * 0.03;
            drawEgg(ctx, n.egg.egg, p.x, p.y - 30, 50, { shadow: false, wobble: wob, glow: s.ready ? 0.7 + 0.3 * Math.sin(t * 5) : 0 });
            if (s.ready) {
              text(ctx, 'うまれる！', p.x, p.y - 72 + Math.sin(t * 5) * 3, { size: 14, align: 'center', color: '#d9573a', stroke: '#fff', strokeW: 4 });
            } else {
              bar(ctx, p.x - 30, p.y + 14, 60, 9, s.progress, '#f2a65a', 'rgba(255,255,255,0.7)');
              text(ctx, formatTime(s.remain), p.x, p.y + 30, { size: 12, align: 'center', color: '#fff', stroke: 'rgba(70,50,50,0.55)', strokeW: 3 });
            }
          } else {
            text(ctx, 'あき', p.x, p.y + 26, { size: 11, align: 'center', color: '#fff', stroke: 'rgba(70,50,50,0.4)', strokeW: 3 });
          }
          game.ui.hit(p.x - 44, p.y - 64, 88, 98, () => tapNest(i));
        } });
      }
      for (const w of walkers) {
        const p = L.map(w.u, w.v);
        const d = st.dex[w.key];
        if (!d) continue;
        const g = { ...parseKey(w.key), shiny: d.shiny };
        items.push({ y: p.y, draw: () => {
          drawDragonAt(ctx, g, p.x, p.y - 26, 100, { t: t + w.u * 7, level: d.level, flip: w.flip, speed: w.wait > 0 ? 0.6 : 1.4 });
          if (w.key === st.partner) {
            sparkle(ctx, p.x, p.y - 74 + Math.sin(t * 3) * 2, 6, '#ffd86b', t);
          }
          game.ui.hit(p.x - 40, p.y - 70, 80, 70, () => { modal = { type: 'dragon', key: w.key }; });
        } });
      }
      items.sort((a, b) => a.y - b.y).forEach((it) => it.draw());

      // 下のボタン列
      const by = game.ui.H - NAV_H - 62;
      hintBubble(ctx, hint(), W / 2, by - 46);
      button(game.ui, 16, by, 170, 50, `たまご ${st.storage.length}/${DATA.base.storageMax}`, () => { modal = { type: 'storage' }; }, { color: '#f2b55a', size: 16 });
      button(game.ui, 204, by, 170, 50, 'たんけんへ', () => game.go('select'), { color: '#6fb5e0', size: 16 });

      drawTopBar(game, 'ドラゴンのす');
      drawNav(game, 'home');
      if (modal) drawModal(ctx, t);
    },
    openDragon(key) { modal = { type: 'dragon', key }; },
  };
}
