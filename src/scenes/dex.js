// 図鑑: 場所ごとのページ。未発見はシルエット。系統と得意も見られる
import { DATA, lineageById } from '../data.js';
import { W } from '../ui.js';
import { text, panel, rr, bar, C, pushClip, popClip } from '../draw.js';
import { drawDragonAt } from '../dragon.js';
import { dexPage, dexProgress, dragonKey, dragonName, genomeOf, defaultLook } from '../logic.js';
import { drawTopBar, drawNav, dragonDetail, levelBadge, shinySparkles, NAV_H, TOP_H, tag } from './common.js';

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
      const bg = ctx.createLinearGradient(0, 0, 0, H);
      bg.addColorStop(0, C.bg2);
      bg.addColorStop(1, C.bg);
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, W, H);
      const loc = DATA.locations[page];
      // タブ
      const tabY = TOP_H + 10;
      const tw = (W - 24) / DATA.locations.length;
      DATA.locations.forEach((l, i) => {
        const on = i === page;
        const x = 12 + i * tw;
        rr(ctx, x + 3, tabY, tw - 6, 44, 12);
        ctx.fillStyle = on ? l.theme.skyTop : 'rgba(255,255,255,0.05)';
        ctx.fill();
        if (on) { ctx.strokeStyle = l.theme.accent; ctx.lineWidth = 2; ctx.stroke(); }
        text(ctx, l.name, x + tw / 2, tabY + 22, { size: 13, align: 'center', color: on ? C.text : C.dim, maxW: tw - 6 - 13 });
        game.ui.hit(x, tabY, tw, 44, () => { page = i; game.ui.resetScroll('dex'); });
      });
      const pr = dexProgress(st, loc.id);
      const py = tabY + 58;
      text(ctx, `見つけた数 ${pr.found} / ${pr.total}`, 18, py + 8, { size: 13, maxW: 150 });
      bar(ctx, 176, py + 3, W - 194, 10, pr.found / pr.total, loc.theme.accent);
      // 一覧
      const area = { x: 8, y: py + 26, w: W - 16, h: H - NAV_H - (py + 26) - 4 };
      const list = getPage(loc.id);
      const cols = 3, cw = area.w / cols, ch = 156;
      const off = game.ui.scroll('dex', area.x, area.y, area.w, area.h, Math.ceil(list.length / cols) * ch + 10);
      ctx.save();
      ctx.beginPath();
      ctx.rect(area.x, area.y, area.w, area.h);
      ctx.clip();
      pushClip(area.x, area.y, area.w, area.h);
      list.forEach((sp, i) => {
        const x = area.x + (i % cols) * cw;
        const y = area.y + Math.floor(i / cols) * ch - off + 4;
        if (y > area.y + area.h || y + ch < area.y) return;
        const key = dragonKey(sp);
        const d = st.dex[key];
        const cx0 = x + 5, cy0 = y + 4, cwid = cw - 10, chei = ch - 12;
        const grad = ctx.createLinearGradient(0, cy0, 0, cy0 + chei);
        grad.addColorStop(0, d ? loc.theme.skyTop : 'rgba(255,255,255,0.06)');
        grad.addColorStop(1, d ? loc.theme.skyBottom : 'rgba(255,255,255,0.02)');
        panel(ctx, cx0, cy0, cwid, chei, { r: 14, fill: grad });
        const g = d ? genomeOf(st, key) : { ...sp, ...defaultLook(sp, loc.id) };
        drawDragonAt(ctx, g, x + cw / 2, cy0 + 50, cwid - 16, { t: t + i * 0.37, speed: 0.45, level: d ? d.level : 1, silhouette: !d, shadow: !!d, aspect: 74 / (cwid - 16) });
        if (d) {
          if (d.shiny) shinySparkles(ctx, x + cw / 2, cy0 + 50, 38, t + i);
          levelBadge(ctx, cx0 + 6, cy0 + 6, d.level);
          text(ctx, dragonName(g), x + cw / 2, cy0 + 106, { size: 12, align: 'center', maxW: cwid - 12 });
        } else {
          text(ctx, '？？？', x + cw / 2, cy0 + 106, { size: 12, align: 'center', color: C.dim, maxW: cwid - 12 });
        }
        tag(ctx, lineageById(sp.lineage).name, x + cw / 2, cy0 + 118, { align: 'center', size: 10, maxW: cwid - 12, fill: 'rgba(0,0,0,0.3)', color: d ? '#e0d8c8' : C.dim });
        game.ui.hit(cx0, cy0, cwid, chei, () => {
          if (d) detail = key;
          else game.toast('まだ見つけていないドラゴンです');
        }, area);
      });
      popClip();
      ctx.restore();
      drawTopBar(game, '図鑑');
      drawNav(game, 'dex');
      if (detail) dragonDetail(game, detail, { onClose: () => { detail = null; } });
    },
  };
}
