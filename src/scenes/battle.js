// バトルの共通の枠: ルール説明カード → ミニゲーム → 結果演出 → 報酬
// どのバトルも同じ入口（battleInput: 連れているドラゴンとゴブリンの種類）と
// 同じ出口（結果の段階 great / good / fail → battleReward）を持つ。
// バトル本体は src/battles/<file>.js（DATA.battles の1行で登録）
import { DATA, lineageById } from '../data.js';
import { W } from '../ui.js';
import { text, panel, button, drawGoblin, controlIcon, C, textBox, iconShard, iconStone, drawEgg, sparkle, bar, rr } from '../draw.js';
import { chooseBattle, battleInput, battleReward, makeRng } from '../logic.js';
import { modalFrame, tag, teamStrip } from './common.js';

export const BATTLES = {};

export async function loadBattles() {
  await Promise.all(DATA.battles.map(async (b) => {
    const mod = await import(`../battles/${b.file}.js`);
    BATTLES[b.id] = mod.default;
  }));
}

export const HUD_H = 76;

export function createBattleScene(game) {
  let B = null;

  function start(params) {
    const seed = (Date.now() ^ (Math.random() * 1e9)) >>> 0;
    const pick = params.battle ? { battle: DATA.battles.find((b) => b.id === params.battle), quirk: params.quirk || DATA.goblins.find((g) => g.id === params.goblin).battles.find((x) => x.id === params.battle).quirk } : chooseBattle(params.goblin, makeRng(seed));
    const input = battleInput(game.state, params.goblin, pick.battle.id, pick.quirk, { advantage: params.advantage, seed });
    B = { params, input, phase: 'intro', t0: game.t, inst: null, remain: 0, grade: null, reward: null, from: params.from || 'explore' };
  }

  function begin() {
    const def = BATTLES[B.input.battle.id];
    const rng = makeRng(B.input.seed);
    B.inst = def(B.input, { ui: game.ui, rng, game });
    B.total = B.input.battle.time + (B.inst.timeBonus || 0);
    B.remain = B.total;
    B.phase = 'play';
    B.t0 = game.t;
  }

  function finish(grade) {
    B.grade = grade;
    B.reward = battleReward(grade, game.rng);
    B.phase = 'result';
    B.t0 = game.t;
  }

  function leave() {
    const reward = B.reward;
    const from = B.from;
    B = null;
    if (from === 'explore') game.go('explore', { resume: true, result: reward });
    else game.go('home');
  }

  function drawIntro(ctx, t) {
    const H = game.ui.H;
    const inp = B.input;
    const bt = inp.battle;
    const box = modalFrame(game, 600);
    const pad = 20;
    let y = box.y + pad;
    tag(ctx, `バトル：${inp.goblin.name}`, box.x + pad, y, { size: 11, maxW: box.w - pad * 2 });
    y += 34;
    text(ctx, bt.name, box.x + pad, y + 14, { size: 26, maxW: box.w - pad * 2 - 110 });
    // ゴブリンの絵
    drawGoblin(ctx, inp.goblin, box.x + box.w - 64, y + 6, 58, { t });
    y += 44;
    // 1行のルール（入らなければ折り返す）
    const ruleH = 52;
    panel(ctx, box.x + pad, y, box.w - pad * 2, ruleH + 16, { r: 12, fill: 'rgba(0,0,0,0.25)', shadow: false });
    const iconX = box.x + pad + 34;
    controlIcon(ctx, bt.control, iconX, y + (ruleH + 16) / 2 + 2, 0.85, t);
    textBox(ctx, bt.rule, box.x + pad + 68, y + 8, box.w - pad * 2 - 68 - 14, ruleH, { size: 15, valign: 'middle', maxLines: 2 });
    y += ruleH + 16 + 14;
    // 効く得意
    text(ctx, '効く得意', box.x + pad, y + 11, { size: 12, color: C.sub, maxW: 70 });
    let tx = box.x + pad + 72;
    for (const sid of bt.stats) {
      const s = DATA.stats.find((x) => x.id === sid);
      tx += tag(ctx, `${s.name} ${inp.stats[sid]}`, tx, y, { size: 12, color: '#f2e8d6', fill: s.color + '66' }) + 8;
    }
    y += 34;
    // 連れていくドラゴン
    text(ctx, '連れているドラゴン', box.x + pad, y + 10, { size: 12, color: C.sub, maxW: box.w - pad * 2 });
    y += 22;
    const stripH = Math.max(56, Math.min(90, box.y + box.h - y - 150));
    if (inp.team.length) teamStrip(game, box.x + pad - 3, y, box.w - pad * 2 + 6, stripH);
    else textBox(ctx, 'ドラゴンなし（得意はすべて0）', box.x + pad, y, box.w - pad * 2, stripH, { size: 13, color: C.sub, valign: 'middle' });
    y += stripH + 10;
    if (inp.advantage) {
      tag(ctx, '足跡に先に気づいた：有利に始まる', box.x + pad, y, { size: 12, color: '#1b1e25', fill: C.gold, maxW: box.w - pad * 2 });
    } else {
      tag(ctx, `時間 ${bt.time}秒・結果は 大成功／成功／失敗`, box.x + pad, y, { size: 11, maxW: box.w - pad * 2 });
    }
    const by = box.y + box.h - pad - 56;
    button(game.ui, box.x + pad, by, box.w - pad * 2, 56, '始める', begin, { color: C.rust, size: 18 });
    void H;
  }

  function drawHud(ctx, t) {
    const inp = B.input;
    ctx.fillStyle = 'rgba(14,15,20,0.85)';
    ctx.fillRect(0, 0, W, HUD_H);
    text(ctx, inp.battle.name, 16, 24, { size: 17, maxW: 140 });
    text(ctx, inp.goblin.name, 16, 50, { size: 12, color: C.sub, maxW: 160 });
    const r = Math.max(0, B.remain);
    text(ctx, `残り${Math.ceil(r)}秒`, W - 16, 24, { size: 15, align: 'right', color: r < 6 ? '#ff9a7a' : C.text, maxW: 110 });
    bar(ctx, W - 16 - 170, 46, 170, 9, r / B.total, r < 6 ? C.red : C.gold);
    if (B.inst.status) {
      const s = B.inst.status();
      if (s) text(ctx, s, W - 16 - 170 - 12, 50, { size: 12, align: 'right', color: C.sub, maxW: W - 16 - 170 - 12 - 180 });
    }
  }

  function drawResult(ctx, t) {
    const el = t - B.t0;
    const g = B.grade;
    const info = DATA.battleRewards[g];
    const rw0 = B.reward;
    const nLines = Math.max(1, (rw0.eggs ? 1 : 0) + (rw0.shards ? 1 : 0) + (rw0.stones ? 1 : 0) + (rw0.steal ? 1 : 0));
    const box = modalFrame(game, 140 + nLines * 32 + 16 + 56 + 20);
    const col = g === 'great' ? C.gold : g === 'good' ? '#9fc0a0' : '#c88a7a';
    // 結果演出: 文字がはずんで出る + 光
    const k = Math.min(1, el / 0.35);
    const pop = 1 + Math.sin(Math.min(1, el / 0.5) * Math.PI) * 0.25;
    if (g !== 'fail') {
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2 + el * 0.8;
        const rad = 40 + Math.min(1, el * 2) * 70;
        sparkle(ctx, W / 2 + Math.cos(a) * rad, box.y + 70 + Math.sin(a) * rad * 0.45, g === 'great' ? 7 : 5, col, a);
      }
    }
    ctx.save();
    ctx.globalAlpha = k;
    ctx.translate(W / 2, box.y + 70);
    ctx.scale(pop, pop);
    text(ctx, info.name, 0, 0, { size: 34, align: 'center', color: col, maxW: (box.w - 80) / pop });
    ctx.restore();
    const rw = B.reward;
    let y = box.y + 140;
    const lines = [];
    if (rw.eggs) lines.push({ icon: 'egg', str: `卵 ${rw.eggs}個` });
    if (rw.shards) lines.push({ icon: 'shard', str: `星のかけら ${rw.shards}個` });
    if (rw.stones) lines.push({ icon: 'stone', str: `ぬくもり石 ${rw.stones}個` });
    if (rw.steal) lines.push({ icon: 'lost', str: '卵を1つ奪われた（かごに卵があれば）' });
    if (!lines.length) lines.push({ icon: null, str: '報酬はありません' });
    for (const l of lines) {
      const ix = box.x + 44;
      if (l.icon === 'egg') drawEgg(ctx, 'forest_common', ix, y - 2, 22, { shadow: false });
      else if (l.icon === 'shard') iconShard(ctx, ix, y, 9);
      else if (l.icon === 'stone') iconStone(ctx, ix, y, 8, t);
      else if (l.icon === 'lost') drawEgg(ctx, 'forest_common', ix, y - 2, 22, { shadow: false, silhouette: true });
      text(ctx, l.str, ix + 22, y, { size: 15, maxW: box.w - 44 - 22 - 24 });
      y += 32;
    }
    if (el > 0.6) button(game.ui, box.x + 20, box.y + box.h - 20 - 56, box.w - 40, 56, B.from === 'explore' ? '探索に戻る' : '拠点に戻る', leave, { color: C.teal, size: 17 });
  }

  return {
    enter(params) { start(params); },
    draw(ctx, t, dt) {
      if (!B) { game.go('home'); return; }
      const H = game.ui.H;
      const area = { x: 0, y: HUD_H, w: W, h: H - HUD_H };
      const loc = game.scenes.explore.state ? game.scenes.explore.state.loc : 'forest';
      const theme = DATA.locations.find((l) => l.id === loc).theme;
      const bg = ctx.createLinearGradient(0, 0, 0, H);
      bg.addColorStop(0, theme.skyTop);
      bg.addColorStop(1, theme.groundDark);
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, W, H);
      if (B.phase === 'intro') {
        drawIntro(ctx, t);
        return;
      }
      if (B.phase === 'play') {
        B.remain -= dt;
        B.inst.update(dt, area, B.remain / B.total);
        if (B.inst.result) finish(B.inst.result);
        else if (B.remain <= 0) finish(B.inst.timeUp());
      }
      B.inst.draw(ctx, area, t, { theme, remainRatio: B.remain / B.total, playing: B.phase === 'play' });
      drawHud(ctx, t);
      if (B.phase === 'result') drawResult(ctx, t);
    },
    get state() { return B; },
  };
}

// バトルで共通に使う小物
export function arenaFloor(ctx, area, theme, inset = 12) {
  const x = area.x + inset, y = area.y + inset, w = area.w - inset * 2, h = area.h - inset * 2;
  const g = ctx.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, theme.groundDark);
  g.addColorStop(0.3, theme.ground);
  g.addColorStop(1, theme.groundDark);
  ctx.save();
  rr(ctx, x, y, w, h, 18);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.restore();
  return { x, y, w, h };
}

export function skillName(d) { return lineageById(d.genome.lineage).skill; }
