// 図鑑: 場所ごとのページ。未発見はシルエット
import { DATA } from '../data.js';
import { W } from '../ui.js';
import { text, panel, rr, bar } from '../draw.js';
import { drawDragonAt } from '../dragon.js';
import { dexPage, dexProgress, dragonKey, dragonName } from '../logic.js';
import { drawTopBar, drawNav, dragonDetail, levelBadge, shinySparkles, NAV_H, TOP_H } from './common.js';

export function createDex(game) {
  let page = 0;
  let detail = null;
  const pages = {};
  const getPage = (id) => pages[id] || (pages[id] = dexPage(id));

  return {
    nav: 'dex',
    enter() { detail = null; },
    draw(ctx, t) {
      const st = game.state;
      const H = game.ui.H;
      ctx.fillStyle = '#f6efe6';
      ctx.fillRect(0, 0, W, H);
      const loc = DATA.locations[page];
      // タブ
      const tabY = TOP_H + 10;
      const tw = (W - 24) / DATA.locations.length;
      DATA.locations.forEach((l, i) => {
        const on = i === page;
        const x = 12 + i * tw;
        rr(ctx, x + 3, tabY, tw - 6, 40, 14);
        ctx.fillStyle = on ? l.theme.skyTop : '#ece2d8';
        ctx.fill();
        if (on) { ctx.strokeStyle = l.theme.accent; ctx.lineWidth = 2.5; ctx.stroke(); }
        text(ctx, l.name, x + tw / 2, tabY + 20, { size: 13, align: 'center', color: on ? '#4a3b47' : '#8c7a76' });
        game.ui.hit(x, tabY, tw, 40, () => { page = i; game.ui.resetScroll('dex'); });
      });
      const pr = dexProgress(st, loc.id);
      const py = tabY + 52;
      text(ctx, `みつけた ${pr.found} / ${pr.total}`, 18, py + 8, { size: 14 });
      bar(ctx, 150, py + 2, W - 168, 12, pr.found / pr.total, loc.theme.accent);
      // 一覧
      const area = { x: 8, y: py + 24, w: W - 16, h: H - NAV_H - (py + 24) - 4 };
      const list = getPage(loc.id);
      const cols = 3, cw = area.w / cols, ch = 138;
      const off = game.ui.scroll('dex', area.x, area.y, area.w, area.h, Math.ceil(list.length / cols) * ch + 10);
      ctx.save();
      ctx.beginPath();
      ctx.rect(area.x, area.y, area.w, area.h);
      ctx.clip();
      list.forEach((g, i) => {
        const x = area.x + (i % cols) * cw;
        const y = area.y + Math.floor(i / cols) * ch - off + 4;
        if (y > area.y + area.h || y + ch < area.y) return;
        const key = dragonKey(g);
        const d = st.dex[key];
        const grad = ctx.createLinearGradient(0, y, 0, y + ch);
        grad.addColorStop(0, d ? loc.theme.skyTop : '#e9e1d9');
        grad.addColorStop(1, d ? loc.theme.skyBottom : '#f3ede6');
        panel(ctx, x + 5, y + 4, cw - 10, ch - 12, { r: 18, fill: grad });
        const dg = d ? { ...g, shiny: d.shiny } : g;
        drawDragonAt(ctx, dg, x + cw / 2, y + 58, cw - 22, { t: t + i * 0.37, speed: 0.45, level: d ? d.level : 1, silhouette: !d, shadow: !!d });
        if (d) {
          if (d.shiny) shinySparkles(ctx, x + cw / 2, y + 52, 40, t + i);
          levelBadge(ctx, x + 12, y + 10, d.level);
          ctx.font = 'bold 12px sans-serif';
          text(ctx, dragonName(dg), x + cw / 2, y + ch - 26, { size: dragonName(dg).length > 8 ? 11 : 12, align: 'center' });
        } else {
          text(ctx, '？', x + cw / 2, y + ch - 26, { size: 15, align: 'center', color: '#a99c96' });
        }
        game.ui.hit(x + 5, y + 4, cw - 10, ch - 12, () => {
          if (d) detail = key;
          else game.toast('まだ みつけていない ドラゴン');
        }, area);
      });
      ctx.restore();
      drawTopBar(game, 'ずかん');
      drawNav(game, 'dex');
      if (detail) dragonDetail(game, detail, { onClose: () => { detail = null; } });
    },
  };
}
