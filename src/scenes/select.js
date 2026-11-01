// 探索先えらびと、連れていくドラゴン（最大3体）えらび
import { DATA } from '../data.js';
import { W } from '../ui.js';
import { text, panel, rr, drawEgg, bar, C, textBox, pushClip, popClip } from '../draw.js';
import { drawDragonAt } from '../dragon.js';
import { dexProgress, genomeOf, teamInfo, teamStats, toggleTeam } from '../logic.js';
import { drawTopBar, drawNav, modalFrame, closeButton, modalTitle, levelBadge, NAV_H, TOP_H, teamStrip } from './common.js';

export function drawLocationDecor(ctx, loc, x, y, s) {
  const th = loc.theme;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  ctx.lineJoin = 'round';
  if (th.obstacle === 'tree') {
    ctx.fillStyle = th.obTrunk;
    rr(ctx, -5, -22, 10, 24, 3);
    ctx.fill();
    ctx.fillStyle = th.obDark;
    ctx.beginPath();
    ctx.moveTo(-26, -14); ctx.lineTo(0, -70); ctx.lineTo(26, -14);
    ctx.fill();
    ctx.fillStyle = th.obMain;
    ctx.beginPath();
    ctx.moveTo(-18, -34); ctx.lineTo(0, -76); ctx.lineTo(16, -34);
    ctx.fill();
  } else if (th.obstacle === 'rock') {
    ctx.fillStyle = th.obDark;
    ctx.beginPath();
    ctx.moveTo(-28, 2); ctx.lineTo(-20, -24); ctx.lineTo(4, -34); ctx.lineTo(24, -18); ctx.lineTo(30, 2);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = th.obMain;
    ctx.beginPath();
    ctx.moveTo(-20, -2); ctx.lineTo(-14, -22); ctx.lineTo(4, -30); ctx.lineTo(10, -14); ctx.lineTo(4, -2);
    ctx.closePath();
    ctx.fill();
  } else {
    ctx.fillStyle = th.obDark;
    ctx.beginPath();
    ctx.moveTo(-24, 2); ctx.lineTo(-12, -40); ctx.lineTo(-2, -30); ctx.lineTo(8, -52); ctx.lineTo(26, 2);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = th.obTrunk;
    ctx.beginPath();
    ctx.ellipse(14, -4, 6, 3, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

export function createSelect(game) {
  let modal = null;

  function drawTeamPick(ctx, t) {
    const st = game.state;
    const keys = Object.keys(st.dex).sort((a, b) => st.dex[b].level - st.dex[a].level || st.dex[b].at - st.dex[a].at);
    const close = () => { modal = null; };
    const box = modalFrame(game, 600, { onBackdrop: close });
    closeButton(game, box, close);
    modalTitle(ctx, box, `連れていくドラゴン ${st.team.length}/${DATA.dragon.teamMax}`);
    const area = { x: box.x + 10, y: box.y + 62, w: box.w - 20, h: box.h - 74 };
    const cols = 3, cw = area.w / cols, ch = 124;
    const off = game.ui.scroll('team', area.x, area.y, area.w, area.h, Math.ceil(keys.length / cols) * ch + 8);
    ctx.save();
    rr(ctx, area.x, area.y, area.w, area.h, 12);
    ctx.clip();
    pushClip(area.x, area.y, area.w, area.h);
    keys.forEach((k, i) => {
      const x = area.x + (i % cols) * cw;
      const y = area.y + Math.floor(i / cols) * ch - off;
      if (y > area.y + area.h || y + ch < area.y) return;
      const d = st.dex[k];
      const g = genomeOf(st, k);
      const idx = st.team.indexOf(k);
      panel(ctx, x + 4, y + 4, cw - 8, ch - 8, { r: 12, fill: idx >= 0 ? 'rgba(168,117,31,0.14)' : 'rgba(70,56,40,0.05)', shadow: false, stroke: idx >= 0 ? C.gold : undefined });
      drawDragonAt(ctx, g, x + cw / 2, y + 50, cw - 28, { cache: `sel:${k}`, t: t * 0.6 + i, level: d.level, shadow: false, aspect: 64 / (cw - 28) });
      levelBadge(ctx, x + cw / 2 - 24, y + ch - 40, d.level);
      if (idx >= 0) {
        ctx.fillStyle = C.gold;
        ctx.beginPath();
        ctx.arc(x + cw - 20, y + 20, 11, 0, Math.PI * 2);
        ctx.fill();
        text(ctx, String(idx + 1), x + cw - 20, y + 20, { size: 12, align: 'center', color: '#fffaf0', free: true });
      }
      game.ui.hit(x + 4, y + 4, cw - 8, ch - 8, () => {
        if (!toggleTeam(st, k)) game.toast(`連れていけるのは${DATA.dragon.teamMax}体までです`);
        else game.save();
      }, area);
    });
    popClip();
    ctx.restore();
  }

  return {
    nav: 'select',
    enter() { modal = null; game.ui.resetScroll('team'); },
    draw(ctx, t) {
      const st = game.state;
      const H = game.ui.H;
      const bg = ctx.createLinearGradient(0, 0, 0, H);
      bg.addColorStop(0, C.bg2);
      bg.addColorStop(1, C.bg);
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, W, H);
      let y = TOP_H + 12;
      // 連れていくドラゴン
      const team = teamInfo(st);
      const ts = teamStats(team);
      panel(ctx, 16, y, W - 32, 186);
      text(ctx, '連れていくドラゴン', 32, y + 22, { size: 14, color: C.sub, maxW: 200 });
      text(ctx, 'タップで入れかえ', W - 32, y + 22, { size: 11, align: 'right', color: C.dim, maxW: 120 });
      if (Object.keys(st.dex).length) {
        teamStrip(game, 28, y + 40, W - 56, 70, { onTap: () => { modal = 'team'; } });
      } else {
        textBox(ctx, 'まだドラゴンがいません。卵をかえすと一緒に探索できます', 32, y + 40, W - 64, 70, { size: 13, color: C.sub, valign: 'middle' });
      }
      // 得意（2列）
      const half = (W - 64 - 16) / 2;
      DATA.stats.forEach((s, i) => {
        const sx = 32 + (i % 2) * (half + 16), sy = y + 128 + Math.floor(i / 2) * 26;
        text(ctx, s.name, sx, sy, { size: 12, color: C.sub, maxW: 46 });
        bar(ctx, sx + 50, sy - 4, half - 50 - 30, 8, ts[s.id] / 10, s.color);
        text(ctx, String(ts[s.id]), sx + half, sy, { size: 12, align: 'right', maxW: 28 });
      });
      y += 186 + 16;
      text(ctx, '行き先', 20, y + 10, { size: 16, maxW: 200 });
      y += 26;
      const area = { x: 0, y, w: W, h: H - NAV_H - y - 6 };
      const ch = Math.max(112, Math.min(150, (area.h - 8) / DATA.locations.length));
      const off = game.ui.scroll('locs', area.x, area.y, area.w, area.h, DATA.locations.length * (ch + 8));
      ctx.save();
      ctx.beginPath();
      ctx.rect(area.x, area.y, area.w, area.h);
      ctx.clip();
      pushClip(area.x, area.y, area.w, area.h);
      DATA.locations.forEach((loc, i) => {
        const cy = y + i * (ch + 8) - off;
        const th = loc.theme;
        const cardH = ch - 4;
        ctx.save();
        rr(ctx, 16, cy + 4, W - 32, cardH, 16);
        ctx.fillStyle = 'rgba(70,52,30,0.16)';
        ctx.fill();
        rr(ctx, 16, cy, W - 32, cardH, 16);
        const g = ctx.createLinearGradient(0, cy, 0, cy + cardH);
        g.addColorStop(0, th.skyTop);
        g.addColorStop(1, th.skyBottom);
        ctx.fillStyle = g;
        ctx.fill();
        ctx.clip();
        ctx.fillStyle = th.ground;
        ctx.beginPath();
        ctx.ellipse(W - 80, cy + cardH + 12, 140, 46, 0, 0, Math.PI * 2);
        ctx.fill();
        drawLocationDecor(ctx, loc, W - 62, cy + cardH - 18, 0.9);
        drawLocationDecor(ctx, loc, W - 118, cy + cardH - 8, 0.65);
        // 文字を読みやすくする帯
        const sh = ctx.createLinearGradient(16, 0, W - 80, 0);
        sh.addColorStop(0, 'rgba(253,251,246,0.88)');
        sh.addColorStop(0.55, 'rgba(253,251,246,0.6)');
        sh.addColorStop(1, 'rgba(253,251,246,0)');
        ctx.fillStyle = sh;
        ctx.fillRect(16, cy, W - 32, cardH);
        ctx.restore();
        const tx = 32, tw = W - 32 - 32 - 96;
        text(ctx, loc.name, tx, cy + 24, { size: 18, maxW: tw });
        textBox(ctx, loc.desc, tx, cy + 38, tw, 36, { size: 12, color: C.sub, maxLines: 2, weight: 'normal' });
        const pr = dexProgress(st, loc.id);
        bar(ctx, tx, cy + cardH - 24, 110, 8, pr.found / pr.total, th.accent);
        text(ctx, `図鑑 ${pr.found}/${pr.total}`, tx + 120, cy + cardH - 20, { size: 11, color: C.sub, maxW: tw - 120 });
        loc.eggTable.slice(0, 2).forEach((e, k) => drawEgg(ctx, e.egg, W - 44 - k * 26, cy + 24, 22, { shadow: false }));
        game.ui.hit(16, cy, W - 32, cardH, () => {
          if (!st.team.length && Object.keys(st.dex).length) game.toast('ドラゴンなしで出発します');
          game.go('explore', { loc: loc.id });
        }, area);
      });
      popClip();
      ctx.restore();
      drawTopBar(game, '探索');
      drawNav(game, 'select');
      if (modal === 'team') drawTeamPick(ctx, t);
    },
    set modal(m) { modal = m; },
  };
}

