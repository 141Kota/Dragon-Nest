// 画面共通の部品（上のバー・下のナビ・モーダル・ドラゴン詳細）
import { DATA, lineageById, VERSION } from '../data.js';
import { W } from '../ui.js';
import { text, panel, button, rr, iconShard, iconStone, sparkle, C, statBars, logBox, measure, LAYOUT } from '../draw.js';
import { drawDragonAt } from '../dragon.js';
import { genomeOf, dragonName, dragonSub, dragonStats, toggleTeam, facilityBonus } from '../logic.js';

export const TOP_H = 56;
export const NAV_H = 72;

export function drawTopBar(game, title) {
  const { ctx } = game.ui;
  const st = game.state;
  const g = ctx.createLinearGradient(0, 0, 0, TOP_H);
  g.addColorStop(0, 'rgba(253,251,246,0.97)');
  g.addColorStop(1, 'rgba(244,239,229,0.95)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, TOP_H);
  ctx.fillStyle = C.glassLine;
  ctx.fillRect(0, TOP_H - 1, W, 1);
  text(ctx, title, 16, TOP_H / 2 - 4, { size: 18, maxW: W - 16 - 190, color: C.text });
  text(ctx, VERSION, 16, TOP_H - 11, { size: 9, maxW: W - 16 - 190, color: C.dim, noHalo: true });
  const pill = (x, label, icon) => {
    panel(ctx, x, 12, 80, 32, { r: 16, shadow: false, fill: 'rgba(70,56,40,0.07)' });
    icon(x + 18, 28);
    text(ctx, label, x + 80 - 14, 28, { size: 14, align: 'right', maxW: 40 });
  };
  pill(W - 180, String(st.shards), (x, y) => iconShard(ctx, x, y, 9));
  pill(W - 92, String(st.stones), (x, y) => iconStone(ctx, x, y, 8, game.t));
}

const NAV = [
  { id: 'home', label: '拠点' },
  { id: 'select', label: '探索' },
  { id: 'dex', label: '図鑑' },
];

function navIcon(ctx, id, x, y, on) {
  ctx.save();
  ctx.translate(x, y);
  ctx.lineWidth = 2;
  ctx.lineJoin = 'round';
  ctx.strokeStyle = on ? C.gold : C.dim;
  ctx.fillStyle = on ? 'rgba(168,117,31,0.18)' : 'rgba(70,56,40,0.05)';
  ctx.beginPath();
  if (id === 'home') {
    ctx.ellipse(0, 5, 13, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(0, -2, 6.5, 8.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  } else if (id === 'select') {
    ctx.moveTo(-12, -8); ctx.lineTo(-4, -11); ctx.lineTo(4, -8); ctx.lineTo(12, -11);
    ctx.lineTo(12, 9); ctx.lineTo(4, 12); ctx.lineTo(-4, 9); ctx.lineTo(-12, 12);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-4, -11); ctx.lineTo(-4, 9); ctx.moveTo(4, -8); ctx.lineTo(4, 12);
    ctx.stroke();
  } else {
    rr(ctx, -11, -11, 22, 23, 3);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, -11); ctx.lineTo(0, 12);
    ctx.stroke();
  }
  ctx.restore();
}

export function drawNav(game, active) {
  const { ctx, H } = game.ui;
  const y = H - NAV_H;
  ctx.fillStyle = 'rgba(253,251,246,0.97)';
  ctx.fillRect(0, y, W, NAV_H);
  ctx.fillStyle = C.glassLine;
  ctx.fillRect(0, y, W, 1);
  const w = W / NAV.length;
  NAV.forEach((n, i) => {
    const on = n.id === active;
    const cx = w * i + w / 2;
    if (on) {
      ctx.fillStyle = 'rgba(168,117,31,0.12)';
      rr(ctx, cx - 48, y + 6, 96, 60, 14);
      ctx.fill();
      logBox(cx - 48, y + 6, 96, 60, 'nav');
    }
    navIcon(ctx, n.id, cx, y + 25, on);
    text(ctx, n.label, cx, y + 50, { size: 13, align: 'center', color: on ? C.gold : C.dim });
    game.ui.hit(w * i, y, w, NAV_H, () => { if (!on) game.go(n.id); });
  });
}

// 後ろを少しだけ沈めてパネルを出す（暗くしすぎない）。戻り値はパネルの位置
export function modalFrame(game, h, o = {}) {
  const { ctx, H } = game.ui;
  ctx.fillStyle = 'rgba(70,56,40,0.28)';
  ctx.fillRect(0, 0, W, H);
  if (LAYOUT.on) for (const it of [...LAYOUT.texts, ...LAYOUT.boxes]) it.under = true; // 幕の下はチェック対象外
  game.ui.block(0, 0, W, H, o.onBackdrop || null);
  const w = o.w || W - 28;
  h = Math.min(h, H - 32);
  const x = (W - w) / 2;
  const y = Math.max(16, (H - h) / 2);
  panel(ctx, x, y, w, h, { r: 20 });
  game.ui.block(x, y, w, h);
  return { x, y, w, h };
}

// 右上の × ボタン（押せる大きさ 44）
export function closeButton(game, box, onClose) {
  const { ctx } = game.ui;
  const cx = box.x + box.w - 30, cy = box.y + 30;
  ctx.fillStyle = 'rgba(70,56,40,0.08)';
  ctx.beginPath();
  ctx.arc(cx, cy, 17, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = C.sub;
  ctx.lineWidth = 2.5;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(cx - 6, cy - 6); ctx.lineTo(cx + 6, cy + 6);
  ctx.moveTo(cx + 6, cy - 6); ctx.lineTo(cx - 6, cy + 6);
  ctx.stroke();
  game.ui.hit(cx - 22, cy - 22, 44, 44, onClose);
}

// モーダルの見出し（× ボタンと重ならない幅で）
export function modalTitle(ctx, box, str, o = {}) {
  text(ctx, str, box.x + 20, box.y + 30, { size: o.size || 18, maxW: box.w - 20 - 60 });
}

export function levelBadge(ctx, x, y, level) {
  const w = 48, h = 24;
  rr(ctx, x, y, w, h, 12);
  ctx.fillStyle = level >= DATA.dragon.maxLevel ? '#a8751f' : '#6a5684';
  ctx.fill();
  logBox(x, y, w, h, 'badge');
  text(ctx, `Lv.${level}`, x + w / 2, y + h / 2, { size: 12, align: 'center', color: '#fffaf0', maxW: w - 12 });
  return w;
}

// 小さなラベル（角丸の枠に文字。幅は文字に合わせる）
export function tag(ctx, str, x, y, o = {}) {
  const size = o.size || 11;
  const h = Math.max(22, size * 2);
  const w = Math.min(o.maxW || 200, measure(ctx, str, size) + size * 1.2);
  const x0 = o.align === 'right' ? x - w : o.align === 'center' ? x - w / 2 : x;
  rr(ctx, x0, y, w, h, h / 2);
  ctx.fillStyle = o.fill || 'rgba(70,56,40,0.08)';
  ctx.fill();
  logBox(x0, y, w, h, 'tag');
  text(ctx, str, x0 + w / 2, y + h / 2, { size, align: 'center', color: o.color || C.sub, maxW: w - size });
  return w;
}

export function shinySparkles(ctx, x, y, r, t) {
  for (let i = 0; i < 4; i++) {
    const a = t * 0.8 + (i * Math.PI) / 2;
    const k = 0.5 + 0.5 * Math.sin(t * 3 + i * 1.7);
    sparkle(ctx, x + Math.cos(a) * r, y + Math.sin(a) * r * 0.7, 3 + 4 * k, '#ffe7a0', a);
  }
}

export function stageBack(ctx, loc, x, y, w, h, r = 14) {
  const g = ctx.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, loc.theme.skyTop);
  g.addColorStop(1, loc.theme.skyBottom);
  ctx.save();
  rr(ctx, x, y, w, h, r);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.clip();
  ctx.fillStyle = loc.theme.ground;
  ctx.beginPath();
  ctx.ellipse(x + w / 2, y + h + h * 0.05, w * 0.7, h * 0.28, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  logBox(x, y, w, h, 'stage');
}

// ドラゴンの詳細（図鑑・孵化のあとで共通）
export function dragonDetail(game, key, o = {}) {
  const { ctx } = game.ui;
  const st = game.state;
  const d = st.dex[key];
  const g = genomeOf(st, key);
  const t = game.t;
  const pad = 18;
  const fixed = 30 + 24 + 34 + 4 * 20 + 16 + 48 + pad + 12;
  const head = pad + 34;
  const stageMax = Math.max(110, Math.min(240, game.ui.H - 32 - head - fixed));
  const box = modalFrame(game, head + stageMax + fixed, { onBackdrop: o.onClose });
  let y = box.y + pad;
  if (o.banner) {
    text(ctx, o.banner, W / 2, y + 12, { size: 20, align: 'center', color: o.bannerColor || C.gold, maxW: box.w - 120 });
    y += 34;
  } else {
    closeButton(game, box, o.onClose);
    y += 34;
  }
  const stageH = Math.max(110, Math.min(stageMax, box.y + box.h - y - fixed));
  const loc = DATA.locations.find((l) => l.id === d.loc) || DATA.locations[0];
  stageBack(ctx, loc, box.x + pad, y, box.w - pad * 2, stageH);
  const reveal = o.reveal == null ? 1 : o.reveal;
  const pop = reveal < 1 ? 0.6 + 0.4 * reveal : 1;
  // 図鑑の大きな絵は、ゆっくり向きを変えて360°を見せる
  drawDragonAt(ctx, g, W / 2, y + stageH / 2 + 4, Math.min(260, box.w - 80) * pop, { t, level: d.level, speed: 0.55, yaw: -0.42 + Math.sin(t * 0.35) * 1.1, aspect: (stageH - 24) / Math.min(260, box.w - 80), live: true });
  if (reveal < 1) {
    ctx.save();
    ctx.globalAlpha = 1 - reveal;
    ctx.fillStyle = '#f6efe2';
    rr(ctx, box.x + pad, y, box.w - pad * 2, stageH, 14);
    ctx.fill();
    ctx.restore();
  }
  if (d.shiny) shinySparkles(ctx, W / 2, y + stageH / 2, 90, t);
  y += stageH + 12;
  // 名前と系統
  text(ctx, dragonName(g), W / 2, y + 13, { size: 20, align: 'center', maxW: box.w - pad * 2 - 20 });
  y += 30;
  text(ctx, `${lineageById(g.lineage).name}・${dragonSub(g)}`, W / 2, y + 10, { size: 12, align: 'center', color: C.sub, maxW: box.w - pad * 2 - 12 });
  y += 24;
  let bx = box.x + pad;
  bx += levelBadge(ctx, bx, y, d.level) + 8;
  if (d.shiny) bx += tag(ctx, '色違い', bx, y + 1, { color: '#fffaf0', fill: C.gold }) + 8;
  tag(ctx, `技: ${lineageById(g.lineage).skill}`, box.x + box.w - pad, y + 1, { align: 'right', maxW: box.w / 2 - 20 });
  y += 34;
  statBars(ctx, dragonStats(g, d.level, facilityBonus(st, 'teamStat')), box.x + pad, y, box.w - pad * 2, { rowH: 20 });
  y += 4 * 20 + 16;
  const by = Math.min(box.y + box.h - pad - 48, y);
  const bw = (box.w - pad * 2 - 12) / 2;
  const inTeam = st.team.includes(key);
  const full = !inTeam && st.team.length >= DATA.dragon.teamMax;
  button(game.ui, box.x + pad, by, bw, 48, inTeam ? '連れていかない' : '連れていく', () => {
    if (toggleTeam(st, key)) { game.save(); game.toast(inTeam ? '待機にしました' : '探索に連れていきます'); }
  }, { color: inTeam ? C.slate : C.plum, size: 15, disabled: full, onDisabled: () => game.toast(`連れていけるのは${DATA.dragon.teamMax}体までです`) });
  button(game.ui, box.x + pad + bw + 12, by, bw, 48, '閉じる', o.onClose, { color: C.amber, size: 15 });
  return box;
}

// 下に出るひとこと
export function hintBubble(ctx, str, x, y, maxW = W - 32) {
  const size = 13;
  const w = Math.min(maxW, measure(ctx, str, size) + size * 2);
  panel(ctx, x - w / 2, y, w, 34, { r: 17, fill: C.glass, stroke: C.glassLine, shadow: false });
  text(ctx, str, x, y + 17, { size, align: 'center', color: C.text, maxW: w - size * 2 });
}

export function teamStrip(game, x, y, w, h, o = {}) {
  // 連れていくドラゴンの小さな並び（最大3）
  const { ctx } = game.ui;
  const st = game.state;
  const cw = w / DATA.dragon.teamMax;
  for (let i = 0; i < DATA.dragon.teamMax; i++) {
    const key = st.team[i];
    const cx = x + i * cw;
    panel(ctx, cx + 3, y, cw - 6, h, { r: 12, shadow: false, fill: key ? 'rgba(255,255,255,0.55)' : 'rgba(70,56,40,0.07)' });
    if (key && st.dex[key]) {
      const g = genomeOf(st, key);
      drawDragonAt(ctx, g, cx + cw / 2, y + h / 2, cw - 20, { cache: `team:${i}`, t: game.t * 0.7 + i, level: st.dex[key].level, shadow: false, aspect: (h - 12) / (cw - 20) });
    } else {
      text(ctx, '空き', cx + cw / 2, y + h / 2, { size: 12, align: 'center', color: C.dim });
    }
    if (o.onTap) game.ui.hit(cx + 3, y, cw - 6, h, () => o.onTap(i));
  }
}
