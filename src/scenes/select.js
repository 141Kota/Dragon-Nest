// 探索先えらびと相棒えらび
import { DATA } from '../data.js';
import { W } from '../ui.js';
import { text, panel, button, rr, drawEgg, wrapText, bar } from '../draw.js';
import { drawDragonAt } from '../dragon.js';
import { partnerInfo, dexProgress, parseKey, dragonName } from '../logic.js';
import { drawTopBar, drawNav, modalFrame, closeButton, levelBadge, NAV_H, TOP_H } from './common.js';

export function drawLocationDecor(ctx, loc, x, y, s) {
  const th = loc.theme;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  ctx.lineJoin = 'round';
  if (th.block === 'tree') {
    ctx.fillStyle = th.trunk;
    rr(ctx, -5, -22, 10, 24, 4);
    ctx.fill();
    for (const [ox, oy, r] of [[0, -40, 22], [-12, -30, 15], [13, -28, 15]]) {
      ctx.fillStyle = th.blockDark;
      ctx.beginPath();
      ctx.arc(ox, oy + 3, r, 0, Math.PI * 2);
      ctx.fill();
    }
    for (const [ox, oy, r] of [[0, -42, 20], [-12, -32, 13], [13, -30, 13]]) {
      ctx.fillStyle = th.blockMain;
      ctx.beginPath();
      ctx.arc(ox, oy, r, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (th.block === 'coral') {
    ctx.strokeStyle = th.blockMain;
    ctx.lineCap = 'round';
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.moveTo(0, 0); ctx.lineTo(0, -30);
    ctx.moveTo(0, -14); ctx.quadraticCurveTo(-16, -18, -16, -34);
    ctx.moveTo(0, -20); ctx.quadraticCurveTo(14, -22, 15, -40);
    ctx.stroke();
    ctx.fillStyle = th.blockDark;
    ctx.beginPath();
    ctx.ellipse(10, 2, 14, 6, 0, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.fillStyle = th.blockDark;
    ctx.beginPath();
    ctx.moveTo(-24, 2); ctx.lineTo(-16, -22); ctx.lineTo(2, -32); ctx.lineTo(20, -18); ctx.lineTo(26, 2);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = th.blockMain;
    ctx.beginPath();
    ctx.moveTo(-18, -2); ctx.lineTo(-12, -20); ctx.lineTo(2, -28); ctx.lineTo(10, -16); ctx.lineTo(4, -2);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = th.trunk;
    ctx.beginPath();
    ctx.ellipse(16, -4, 6, 3, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

export function createSelect(game) {
  let modal = null;

  function drawPartnerPick(ctx, t) {
    const st = game.state;
    const keys = Object.keys(st.dex).sort((a, b) => st.dex[b].level - st.dex[a].level);
    const h = Math.min(game.ui.H - 60, 560);
    const close = () => { modal = null; };
    const box = modalFrame(game, h, { onBackdrop: close });
    closeButton(game, box, close);
    text(ctx, 'あいぼうを えらぶ', box.x + 22, box.y + 34, { size: 18 });
    const area = { x: box.x + 10, y: box.y + 64, w: box.w - 20, h: h - 76 };
    const cols = 3, cw = area.w / cols, ch = 118;
    const off = game.ui.scroll('partner', area.x, area.y, area.w, area.h, Math.ceil(keys.length / cols) * ch + 8);
    ctx.save();
    rr(ctx, area.x, area.y, area.w, area.h, 14);
    ctx.clip();
    keys.forEach((k, i) => {
      const x = area.x + (i % cols) * cw;
      const y = area.y + Math.floor(i / cols) * ch - off;
      if (y > area.y + area.h || y + ch < area.y) return;
      const d = st.dex[k];
      const g = { ...parseKey(k), shiny: d.shiny };
      panel(ctx, x + 4, y + 4, cw - 8, ch - 8, { r: 16, fill: k === st.partner ? '#efe6ff' : '#fff', shadow: false, stroke: k === st.partner ? '#8f7ad6' : undefined });
      drawDragonAt(ctx, g, x + cw / 2, y + 50, cw - 26, { t: t * 0.6, level: d.level, shadow: false });
      text(ctx, `Lv.${d.level}`, x + cw / 2, y + 96, { size: 12, align: 'center', color: '#8f7ad6' });
      game.ui.hit(x + 4, y + 4, cw - 8, ch - 8, () => { st.partner = k; game.save(); modal = null; game.toast(`${dragonName(g)}と いっしょに いくよ`); }, area);
    });
    ctx.restore();
  }

  return {
    nav: 'select',
    enter() { modal = null; game.ui.resetScroll('partner'); },
    draw(ctx, t) {
      const st = game.state;
      const H = game.ui.H;
      ctx.fillStyle = '#fbf1e4';
      ctx.fillRect(0, 0, W, H);
      let y = TOP_H + 14;
      // 相棒
      const p = partnerInfo(st);
      panel(ctx, 16, y, W - 32, 104, { fill: '#f3edff' });
      text(ctx, 'あいぼう', 30, y + 20, { size: 13, color: '#8f7ad6' });
      if (p) {
        drawDragonAt(ctx, p.genome, 76, y + 62, 100, { t, level: p.level, shadow: false });
        text(ctx, p.name, 140, y + 30, { size: 16 });
        levelBadge(ctx, 140, y + 46, p.level);
        text(ctx, p.skills.map((s) => DATA.skills[s].name).join('・'), 140, y + 88, { size: 12, color: '#6b5560' });
        button(game.ui, W - 112, y + 48, 82, 40, 'かえる', () => { modal = 'partner'; }, { color: '#8f7ad6', size: 15 });
      } else {
        wrapText(ctx, 'まだ ドラゴンが いないよ。\nたまごを かえすと いっしょに たんけんできる', 30, y + 50, W - 70, { size: 13, color: '#6b5560' });
      }
      y += 120;
      text(ctx, 'どこへ たんけんする？', 20, y + 6, { size: 17 });
      y += 22;
      const avail = H - NAV_H - y - 10;
      const ch = Math.min(150, (avail - 16) / DATA.locations.length);
      DATA.locations.forEach((loc, i) => {
        const cy = y + i * (ch + 8);
        const th = loc.theme;
        ctx.save();
        rr(ctx, 16, cy + 4, W - 32, ch - 6, 22);
        ctx.fillStyle = 'rgba(80,50,50,0.15)';
        ctx.fill();
        rr(ctx, 16, cy, W - 32, ch - 6, 22);
        const g = ctx.createLinearGradient(0, cy, 0, cy + ch);
        g.addColorStop(0, th.skyTop);
        g.addColorStop(1, th.skyBottom);
        ctx.fillStyle = g;
        ctx.fill();
        ctx.clip();
        ctx.fillStyle = th.ground;
        ctx.beginPath();
        ctx.ellipse(W - 90, cy + ch + 10, 150, 50, 0, 0, Math.PI * 2);
        ctx.fill();
        drawLocationDecor(ctx, loc, W - 70, cy + ch - 26, 1);
        drawLocationDecor(ctx, loc, W - 130, cy + ch - 16, 0.7);
        ctx.restore();
        text(ctx, loc.name, 34, cy + 28, { size: 20, color: '#4a3b47', stroke: 'rgba(255,255,255,0.8)', strokeW: 5 });
        text(ctx, loc.desc, 34, cy + 54, { size: 12, color: '#5b4a55' });
        const pr = dexProgress(st, loc.id);
        bar(ctx, 34, cy + 70, 120, 9, pr.found / pr.total, th.accent, 'rgba(255,255,255,0.7)');
        text(ctx, `ずかん ${pr.found}/${pr.total}`, 162, cy + 75, { size: 11, color: '#5b4a55' });
        if (ch > 120) loc.eggTable.slice(0, 3).forEach((e, k) => drawEgg(ctx, e.egg, 46 + k * 30, cy + ch - 32, 28, { shadow: false }));
        game.ui.hit(16, cy, W - 32, ch - 6, () => game.go('explore', { loc: loc.id }));
      });
      drawTopBar(game, 'たんけん');
      drawNav(game, 'select');
      if (modal === 'partner') drawPartnerPick(ctx, t);
    },
  };
}
