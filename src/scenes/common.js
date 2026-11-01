// 画面共通の部品（上のバー・下のナビ・モーダル・ドラゴン詳細）
import { DATA, part } from '../data.js';
import { W } from '../ui.js';
import { text, panel, button, rr, iconShard, iconStone, sparkle, INK, wrapText } from '../draw.js';
import { drawDragonAt } from '../dragon.js';
import { parseKey, dragonName, dragonSkills } from '../logic.js';

export const TOP_H = 56;
export const NAV_H = 76;

export function drawTopBar(game, title) {
  const { ctx } = game.ui;
  const st = game.state;
  ctx.fillStyle = 'rgba(255,250,240,0.92)';
  ctx.fillRect(0, 0, W, TOP_H);
  ctx.fillStyle = 'rgba(120,90,80,0.12)';
  ctx.fillRect(0, TOP_H, W, 2);
  text(ctx, title, 16, TOP_H / 2, { size: 19 });
  const pill = (x, label, icon) => {
    panel(ctx, x, 13, 82, 30, { r: 15, shadow: false, fill: '#fff' });
    icon(x + 17, 28);
    text(ctx, label, x + 70, 28, { size: 15, align: 'right' });
  };
  pill(W - 182, String(st.shards), (x, y) => iconShard(ctx, x, y, 10));
  pill(W - 94, String(st.stones), (x, y) => iconStone(ctx, x, y, 9, game.t));
}

const NAV = [
  { id: 'home', label: 'きょてん' },
  { id: 'select', label: 'たんけん' },
  { id: 'dex', label: 'ずかん' },
];

function navIcon(ctx, id, x, y, on) {
  ctx.save();
  ctx.translate(x, y);
  ctx.lineWidth = 2.5;
  ctx.lineJoin = 'round';
  ctx.strokeStyle = on ? '#b3562f' : '#8c7a76';
  ctx.fillStyle = on ? '#ffcf8a' : '#efe4dc';
  ctx.beginPath();
  if (id === 'home') {
    ctx.ellipse(0, 4, 14, 7, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(0, -3, 7, 9, 0, 0, Math.PI * 2);
    ctx.fillStyle = on ? '#fff3d6' : '#fff';
    ctx.fill();
    ctx.stroke();
  } else if (id === 'select') {
    ctx.moveTo(-13, -9); ctx.lineTo(-4, -12); ctx.lineTo(5, -9); ctx.lineTo(13, -12);
    ctx.lineTo(13, 10); ctx.lineTo(5, 13); ctx.lineTo(-4, 10); ctx.lineTo(-13, 13);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-4, -12); ctx.lineTo(-4, 10); ctx.moveTo(5, -9); ctx.lineTo(5, 13);
    ctx.stroke();
  } else {
    rr(ctx, -12, -12, 24, 25, 4);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, -12); ctx.lineTo(0, 13);
    ctx.stroke();
  }
  ctx.restore();
}

export function drawNav(game, active) {
  const { ctx, H } = game.ui;
  const y = H - NAV_H;
  ctx.fillStyle = 'rgba(255,250,240,0.96)';
  ctx.fillRect(0, y, W, NAV_H);
  ctx.fillStyle = 'rgba(120,90,80,0.14)';
  ctx.fillRect(0, y, W, 2);
  const w = W / NAV.length;
  NAV.forEach((n, i) => {
    const on = n.id === active;
    const cx = w * i + w / 2;
    if (on) {
      ctx.fillStyle = '#ffe9cc';
      rr(ctx, cx - 50, y + 8, 100, 58, 18);
      ctx.fill();
    }
    navIcon(ctx, n.id, cx, y + 28, on);
    text(ctx, n.label, cx, y + 54, { size: 13, align: 'center', color: on ? '#b3562f' : '#8c7a76' });
    game.ui.hit(w * i, y, w, NAV_H, () => { if (!on) game.go(n.id); });
  });
}

// 画面を暗くしてパネルを出す。戻り値はパネルの位置
export function modalFrame(game, h, o = {}) {
  const { ctx, H } = game.ui;
  ctx.fillStyle = 'rgba(50,30,45,0.45)';
  ctx.fillRect(0, 0, W, H);
  game.ui.block(0, 0, W, H, o.onBackdrop || null);
  const w = o.w || W - 32;
  const x = (W - w) / 2;
  const y = Math.max(20, (H - h) / 2);
  panel(ctx, x, y, w, h, { r: 26, fill: o.fill || '#fffaf0' });
  game.ui.block(x, y, w, h);
  return { x, y, w, h };
}

export function closeButton(game, box, onClose) {
  const { ctx } = game.ui;
  const x = box.x + box.w - 44, y = box.y + 10;
  ctx.fillStyle = '#f1e5dc';
  ctx.beginPath();
  ctx.arc(x + 17, y + 17, 17, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#8c7a76';
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x + 11, y + 11); ctx.lineTo(x + 23, y + 23);
  ctx.moveTo(x + 23, y + 11); ctx.lineTo(x + 11, y + 23);
  ctx.stroke();
  game.ui.hit(x - 6, y - 6, 46, 46, onClose);
}

export function levelBadge(ctx, x, y, level) {
  rr(ctx, x, y, 44, 22, 11);
  ctx.fillStyle = level >= DATA.dragon.maxLevel ? '#f2b33d' : '#8f7ad6';
  ctx.fill();
  text(ctx, `Lv.${level}`, x + 22, y + 11.5, { size: 12, align: 'center', color: '#fff' });
}

export function shinySparkles(ctx, x, y, r, t) {
  for (let i = 0; i < 4; i++) {
    const a = t * 0.8 + (i * Math.PI) / 2;
    const k = 0.5 + 0.5 * Math.sin(t * 3 + i * 1.7);
    sparkle(ctx, x + Math.cos(a) * r, y + Math.sin(a) * r * 0.7, 4 + 5 * k, '#fff3a8', a);
  }
}

// ドラゴンの詳細（図鑑・孵化のあとで共通）
export function dragonDetail(game, key, o = {}) {
  const { ctx } = game.ui;
  const st = game.state;
  const d = st.dex[key];
  const g = { ...parseKey(key), shiny: d.shiny };
  const h = Math.min(game.ui.H - 40, 590);
  const box = modalFrame(game, h, { onBackdrop: o.onClose });
  const t = game.t;
  const top = box.y + 14;
  if (o.banner) text(ctx, o.banner, W / 2, top + 16, { size: 22, align: 'center', color: o.bannerColor || '#d9573a', stroke: '#fff', strokeW: 5 });
  const stageH = Math.min(250, h * 0.42);
  const stageY = top + 36;
  const loc = DATA.locations.find((l) => l.id === d.loc) || DATA.locations[0];
  const grad = ctx.createLinearGradient(0, stageY, 0, stageY + stageH);
  grad.addColorStop(0, loc.theme.skyTop);
  grad.addColorStop(1, loc.theme.skyBottom);
  ctx.fillStyle = grad;
  rr(ctx, box.x + 16, stageY, box.w - 32, stageH, 20);
  ctx.fill();
  const reveal = o.reveal == null ? 1 : o.reveal;
  if (reveal < 1) {
    ctx.save();
    ctx.globalAlpha = 1 - reveal;
    ctx.fillStyle = '#fff';
    rr(ctx, box.x + 16, stageY, box.w - 32, stageH, 20);
    ctx.fill();
    ctx.restore();
  }
  const pop = reveal < 1 ? 0.6 + 0.4 * reveal : 1;
  drawDragonAt(ctx, g, W / 2, stageY + stageH * 0.5, Math.min(260, box.w - 70) * pop, { t, level: d.level, speed: 0.55 });
  if (d.shiny) shinySparkles(ctx, W / 2, stageY + stageH * 0.45, 100, t);
  let y = stageY + stageH + 26;
  text(ctx, dragonName(g), W / 2, y, { size: 24, align: 'center' });
  y += 30;
  levelBadge(ctx, W / 2 - (d.shiny ? 52 : 22), y - 11, d.level);
  if (d.shiny) text(ctx, '★いろちがい', W / 2 + 28, y, { size: 13, align: 'left', color: '#d99a1d' });
  y += 24;
  // パーツ
  const slots = DATA.partSlots;
  ctx.font = `bold 13px sans-serif`;
  slots.forEach((slot, i) => {
    const cx = box.x + 24 + (i % 2) * ((box.w - 48) / 2);
    const cy = y + Math.floor(i / 2) * 22;
    text(ctx, DATA.partSlotNames[slot], cx, cy, { size: 12, color: '#a08f8a' });
    text(ctx, part(slot, g[slot]).name, cx + 48, cy, { size: 13 });
  });
  y += 3 * 22 + 8;
  // 技
  text(ctx, 'わざ', box.x + 24, y, { size: 13, color: '#a08f8a' });
  const skills = [part('color', g.color).skill, part('body', g.body).skill];
  const owned = dragonSkills(g, d.level);
  skills.forEach((sid, i) => {
    const sk = DATA.skills[sid];
    const has = owned.includes(sid);
    const sy = y + i * 22;
    text(ctx, has ? sk.name : `${sk.name}（Lv.${DATA.dragon.bodySkillLevel}で おぼえる）`, box.x + 72, sy, { size: 13, color: has ? INK : '#b9aca8' });
  });
  y += 2 * 22 + 6;
  const bw = (box.w - 48) / 2;
  const by = Math.min(box.y + h - 64, y + 4);
  if (st.partner === key) {
    button(game.ui, box.x + 16, by, bw, 48, 'あいぼう中', null, { color: '#b9a7d9', disabled: true, size: 16 });
  } else {
    button(game.ui, box.x + 16, by, bw, 48, 'あいぼうにする', () => { st.partner = key; game.save(); game.toast('いっしょに たんけんするよ！'); }, { color: '#8f7ad6', size: 16 });
  }
  button(game.ui, box.x + 32 + bw, by, bw, 48, 'とじる', o.onClose, { color: '#f2a65a', size: 16 });
  if (o.extra) o.extra(box);
  return box;
}

export function hintBubble(ctx, str, x, y, maxW = W - 40) {
  ctx.font = `bold 14px sans-serif`;
  const w = Math.min(maxW, 40 + str.length * 14.5);
  panel(ctx, x - w / 2, y, w, 36, { r: 18, fill: '#fff', shadow: true, depth: 3 });
  wrapText(ctx, str, x, y + 18, w - 20, { size: 14, align: 'center', color: '#6b5560' });
}
