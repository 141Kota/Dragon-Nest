// バトルの共通の枠: ルール説明カード → ミニゲーム → 結果演出 → 報酬
// どのバトルも同じ入口（battleInput: 連れているドラゴンとゴブリンの種類）と
// 同じ出口（結果の段階 great / good / fail → battleReward）を持つ。
// バトル本体は src/battles/<file>.js（DATA.battles の1行で登録）
import { DATA, lineageById } from '../data.js';
import { W } from '../ui.js';
import { text, panel, button, controlIcon, C, textBox, iconShard, iconStone, drawEgg, sparkle, bar, rr, HALO, measure } from '../draw.js';
import { chooseBattle, battleInput, battleReward, makeRng } from '../logic.js';
import { tag } from './common.js';

export const BATTLES = {};

export async function loadBattles() {
  await Promise.all(DATA.battles.map(async (b) => {
    const mod = await import(`../battles/${b.file}.js`);
    BATTLES[b.id] = mod.default;
  }));
}

export const HUD_H = 76;
const ANCHOR = 0.46;

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
    // フィールドで立っていた画面上の位置（バトルをその場で始めるのに使う）
    const ex = game.scenes.explore;
    const start = B.from === 'explore' && ex.state ? ex.screenPos() : null;
    B.inst = def(B.input, { ui: game.ui, rng, game, start });
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

  // 画面の下に置く小さなカード（フィールドとキャラを隠さない）。後ろを暗くする幕は掛けない
  function card(ctx, h) {
    const H = game.ui.H;
    const w = W - 24, x = 12, y = H - h - 14;
    panel(ctx, x, y, w, h, { r: 18, fill: C.glass, stroke: C.glassLine });
    game.ui.block(x, y, w, h);
    return { x, y, w, h };
  }

  function drawIntro(ctx, t) {
    const inp = B.input;
    const bt = inp.battle;
    const pad = 16;
    const box = card(ctx, 252);
    let y = box.y + pad;
    // 1行目：バトル名とゴブリン
    const nameSize = 24;
    text(ctx, bt.name, box.x + pad, y + nameSize / 2 + 2, { size: nameSize, maxW: 120 });
    const nw = Math.min(120, measure(ctx, bt.name, nameSize));
    tag(ctx, inp.goblin.name, box.x + box.w - pad, y + 2, { size: 12, align: 'right', maxW: box.w - pad * 3 - nw });
    y += nameSize + 18;
    // 1行のルールと操作アイコン
    const ruleH = 56;
    panel(ctx, box.x + pad, y, box.w - pad * 2, ruleH, { r: 12, fill: 'rgba(70,56,40,0.06)', shadow: false, stroke: false });
    controlIcon(ctx, bt.control, box.x + pad + 30, y + ruleH / 2 + 2, 0.72, t);
    textBox(ctx, bt.rule, box.x + pad + 62, y + 7, box.w - pad * 2 - 62 - 12, ruleH - 14, { size: 14, valign: 'middle', maxLines: 2 });
    y += ruleH + 12;
    // 効く得意と、有利かどうか
    text(ctx, '効く得意', box.x + pad, y + 11, { size: 12, color: C.sub, maxW: 64 });
    let tx = box.x + pad + 66;
    for (const sid of bt.stats) {
      const s = DATA.stats.find((x) => x.id === sid);
      tx += tag(ctx, `${s.name} ${inp.stats[sid]}`, tx, y, { size: 12, color: '#fffaf0', fill: s.color }) + 8;
    }
    y += 32;
    if (inp.advantage) tag(ctx, '足跡に先に気づいた：有利に始まる', box.x + pad, y, { size: 12, color: '#fffaf0', fill: C.gold, maxW: box.w - pad * 2 });
    else tag(ctx, `時間 ${bt.time}秒・連れているドラゴン ${inp.team.length}体`, box.x + pad, y, { size: 12, maxW: box.w - pad * 2 });
    const by = box.y + box.h - pad - 50;
    button(game.ui, box.x + pad, by, box.w - pad * 2, 50, '始める', begin, { color: C.rust, size: 18 });
  }

  function drawHud(ctx) {
    const inp = B.input;
    ctx.fillStyle = C.glass;
    ctx.fillRect(0, 0, W, HUD_H);
    ctx.fillStyle = C.glassLine;
    ctx.fillRect(0, HUD_H, W, 1);
    text(ctx, inp.battle.name, 16, 24, { size: 17, maxW: 140 });
    text(ctx, inp.goblin.name, 16, 50, { size: 12, color: C.sub, maxW: 160 });
    const r = Math.max(0, B.remain);
    text(ctx, `残り${Math.ceil(r)}秒`, W - 16, 24, { size: 15, align: 'right', color: r < 6 ? C.red : C.text, maxW: 110 });
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
    const rw = B.reward;
    const lines = [];
    if (rw.eggs) lines.push({ icon: 'egg', str: `卵 ${rw.eggs}個` });
    if (rw.shards) lines.push({ icon: 'shard', str: `星のかけら ${rw.shards}個` });
    if (rw.stones) lines.push({ icon: 'stone', str: `ぬくもり石 ${rw.stones}個` });
    if (rw.steal) lines.push({ icon: 'lost', str: '卵を1つ奪われた（かごに卵があれば）' });
    if (!lines.length) lines.push({ icon: null, str: '報酬はありません' });
    const pad = 16;
    const box = card(ctx, 70 + lines.length * 30 + 12 + 50 + pad);
    const col = g === 'great' ? C.gold : g === 'good' ? C.teal : C.red;
    // 結果演出：文字がはずんで出る＋光が広がる
    const k = Math.min(1, el / 0.35);
    const pop = 1 + Math.sin(Math.min(1, el / 0.5) * Math.PI) * 0.25;
    const cy = box.y + 38;
    if (g !== 'fail') {
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2 + el * 0.8;
        const rad = 30 + Math.min(1, el * 2) * 60;
        sparkle(ctx, W / 2 + Math.cos(a) * rad * 1.6, cy + Math.sin(a) * rad * 0.35, g === 'great' ? 7 : 5, col, a);
      }
    }
    ctx.save();
    ctx.globalAlpha = k;
    ctx.translate(W / 2, cy);
    ctx.scale(pop, pop);
    text(ctx, info.name, 0, 0, { size: 30, align: 'center', color: col, maxW: (box.w - 80) / pop });
    ctx.restore();
    let y = box.y + 82;
    for (const l of lines) {
      const ix = box.x + 40;
      if (l.icon === 'egg') drawEgg(ctx, 'forest_common', ix, y - 2, 22, { shadow: false });
      else if (l.icon === 'shard') iconShard(ctx, ix, y, 9);
      else if (l.icon === 'stone') iconStone(ctx, ix, y, 8, t);
      else if (l.icon === 'lost') drawEgg(ctx, 'forest_common', ix, y - 2, 22, { shadow: false, silhouette: true });
      text(ctx, l.str, ix + 22, y, { size: 15, maxW: box.w - 40 - 22 - 24 });
      y += 30;
    }
    if (el > 0.6) button(game.ui, box.x + pad, box.y + box.h - pad - 50, box.w - pad * 2, 50, B.from === 'explore' ? '探索に戻る' : '拠点に戻る', leave, { color: C.teal, size: 17 });
  }

  // 背景：探索していたフィールドをそのまま映す（カメラだけ少し寄る）
  function drawBack(ctx, t, dt, theme) {
    const ex = game.scenes.explore;
    const win = B.grade && B.grade !== 'fail';
    // カメラの位置は説明・バトル中・結果で変えない（その場で始まり、その場で終わる）
    const o = B.phase === 'play' ? { hide: true, anchor: ANCHOR }
      : B.phase === 'result' ? { showFoe: true, playerPose: win ? 'win' : 'lose', foePose: win ? 'lose' : 'win', anchor: ANCHOR }
        : { showFoe: true, foePose: 'idle', anchor: ANCHOR };
    if (B.from === 'explore' && ex.state && ex.backdrop(ctx, t, dt, o)) return;
    const H = game.ui.H;
    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, theme.skyTop);
    bg.addColorStop(0.45, theme.skyBottom);
    bg.addColorStop(0.46, theme.ground);
    bg.addColorStop(1, theme.groundDark);
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);
  }

  return {
    enter(params) { start(params); },
    draw(ctx, t, dt) {
      if (!B) { game.go('home'); return; }
      const H = game.ui.H;
      const area = { x: 0, y: HUD_H, w: W, h: H - HUD_H };
      const loc = game.scenes.explore.state ? game.scenes.explore.state.loc : 'forest';
      const theme = DATA.locations.find((l) => l.id === loc).theme;
      drawBack(ctx, t, dt, theme);
      if (B.phase === 'intro') {
        drawIntro(ctx, t);
        return;
      }
      if (B.phase === 'play') {
        B.remain -= dt;
        B.inst.update(dt, area, B.remain / B.total);
        if (B.inst.result) finish(B.inst.result);
        else if (B.remain <= 0) finish(B.inst.timeUp());
        HALO.on = true;
        try {
          B.inst.draw(ctx, area, t, { theme, remainRatio: B.remain / B.total, playing: true });
        } finally { HALO.on = false; }
        drawHud(ctx, t);
        return;
      }
      drawResult(ctx, t);
    },
    get state() { return B; },
  };
}

// バトルで共通に使う小物
// 遊ぶ範囲を示す枠。フィールドが透けて見えるように、ごく薄い明るい板と白い縁だけを描く
export function arenaFloor(ctx, area, theme, inset = 12) {
  const x = area.x + inset, y = area.y + inset, w = area.w - inset * 2, h = area.h - inset * 2;
  ctx.save();
  rr(ctx, x, y, w, h, 18);
  ctx.fillStyle = 'rgba(253,251,246,0.16)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.85)';
  ctx.lineWidth = 2.5;
  ctx.setLineDash([10, 7]);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();
  void theme;
  return { x, y, w, h };
}

export function skillName(d) { return lineageById(d.genome.lineage).skill; }
