// 罠解除: 卵に仕掛けられた罠を外す。押すと隣の罠も切り替わる（パズル）
// 知恵 → 正しい場所のヒント / 器用さ → 1つ確実に外す手助け / 力 → 時間が少し増える
import { W } from '../ui.js';
import { text, drawEgg, C, button, rr, textBox } from '../draw.js';
import { arenaFloor } from '../scenes/battle.js';
import { statK } from '../logic.js';

const TAU = Math.PI * 2;

export default function create(input, env) {
  const { stats, quirk, advantage } = input;
  const rng = env.rng;
  const ui = env.ui;
  const n = Math.max(3, Math.min(4, quirk.size || 3));
  const board = new Array(n * n).fill(0);
  const need = new Array(n * n).fill(0); // この集合を押せば解ける
  const press = (i, rec = true) => {
    const r = Math.floor(i / n), c = i % n;
    for (const [dr, dc] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const rr2 = r + dr, cc = c + dc;
      if (rr2 < 0 || cc < 0 || rr2 >= n || cc >= n) continue;
      board[rr2 * n + cc] ^= 1;
    }
    if (rec) need[i] ^= 1;
  };
  // 解けた状態から崩して作る（必ず解ける）
  const k = Math.max(2, (quirk.scramble || 3) + (n === 4 ? 1 : 0));
  const picks = new Set();
  while (picks.size < k) picks.add(Math.floor(rng() * n * n));
  for (const i of picks) press(i);
  if (board.every((v) => !v)) press(0);
  const hintEvery = 9 - statK(stats, 'wit') * 6; // 秒
  const S = {
    moves: 0, flips: [], hint: -1, hintT: advantage ? 0 : hintEvery * 0.6, helps: 1 + Math.floor(statK(stats, 'dex') * 2.5),
    result: null, solvedT: -1, sparks: [],
  };

  function tap(i) {
    if (S.result || S.solvedT >= 0) return;
    press(i);
    S.moves++;
    S.flips.push({ i, t: 0 });
    if (S.hint === i || (S.hint >= 0 && !need[S.hint])) S.hint = -1;
    check();
  }

  function check() {
    if (board.every((v) => !v)) { S.solvedT = 0; }
  }

  function help() {
    if (S.helps <= 0 || S.solvedT >= 0) return;
    const opts = need.map((v, i) => (v ? i : -1)).filter((i) => i >= 0);
    if (!opts.length) return;
    S.helps--;
    tap(opts[Math.floor(rng() * opts.length)]);
  }

  return {
    timeBonus: Math.round(statK(stats, 'pow') * 6),
    result: null,
    remainRatio: 1,
    timeUp() { return 'fail'; },
    status() { return `手数 ${S.moves}`; },
    update(dt) {
      S.flips = S.flips.filter((f) => (f.t += dt) < 0.3);
      if (S.solvedT >= 0) {
        S.solvedT += dt;
        if (S.solvedT > 0.8) this.result = this.remainRatio > 0.4 ? 'great' : 'good';
        return;
      }
      S.hintT -= dt;
      if (S.hintT <= 0 && statK(stats, 'wit') > 0.15) {
        const opts = need.map((v, i) => (v ? i : -1)).filter((i) => i >= 0);
        S.hint = opts.length ? opts[Math.floor(rng() * opts.length)] : -1;
        S.hintT = hintEvery;
      }
    },
    draw(ctx, area, t, info) {
      this.remainRatio = info.remainRatio;
      const g = arenaFloor(ctx, area, info.theme);
      // 卵と鎖
      const eggY = g.y + 70;
      const locked = board.reduce((a, b) => a + b, 0);
      drawEgg(ctx, 'forest_common', W / 2, eggY, 74, { wobble: Math.sin(t * 3) * 0.03 * locked, glow: S.solvedT >= 0 ? 0.8 : 0 });
      ctx.strokeStyle = 'rgba(180,170,160,0.8)';
      ctx.lineWidth = 3;
      for (let i = 0; i < locked; i++) {
        const a = -0.6 + (i / Math.max(1, locked - 1)) * 1.2;
        ctx.beginPath();
        ctx.ellipse(W / 2, eggY + 6, 34, 12, a, 0, TAU);
        ctx.stroke();
      }
      const txtY = eggY + 52;
      text(ctx, S.solvedT >= 0 ? '全部外れた' : `残りの罠 ${locked}`, W / 2, txtY, { size: 15, align: 'center', color: S.solvedT >= 0 ? C.gold : C.text, maxW: g.w - 40 });
      // 盤面
      const helpH = 64;
      const top = txtY + 22;
      const size = Math.min(g.w - 48, g.y + g.h - top - helpH - 20);
      const cell = size / n;
      const x0 = W / 2 - size / 2;
      for (let i = 0; i < n * n; i++) {
        const r = Math.floor(i / n), c = i % n;
        const x = x0 + c * cell, y = top + r * cell;
        const f = S.flips.find((q) => {
          const fr = Math.floor(q.i / n), fc = q.i % n;
          return Math.abs(fr - r) + Math.abs(fc - c) <= 1;
        });
        const squash = f ? Math.abs(Math.cos((f.t / 0.3) * Math.PI)) : 1;
        ctx.save();
        ctx.translate(x + cell / 2, y + cell / 2);
        ctx.scale(1, squash);
        const on = board[i];
        rr(ctx, -cell / 2 + 4, -cell / 2 + 4, cell - 8, cell - 8, 10);
        const gr = ctx.createLinearGradient(0, -cell / 2, 0, cell / 2);
        gr.addColorStop(0, on ? '#c46a4e' : '#c4ccc4');
        gr.addColorStop(1, on ? '#94402c' : '#95a098');
        ctx.fillStyle = gr;
        ctx.fill();
        ctx.strokeStyle = on ? 'rgba(255,170,120,0.9)' : 'rgba(70,56,40,0.3)';
        ctx.lineWidth = 2;
        ctx.stroke();
        // 罠の絵: とげ（作動中）/ ひらいた輪（外れた）
        ctx.strokeStyle = on ? '#ffd0b0' : 'rgba(60,70,64,0.5)';
        ctx.fillStyle = on ? `rgba(255,120,70,${0.5 + 0.3 * Math.sin(t * 5 + i)})` : 'rgba(0,0,0,0)';
        ctx.lineWidth = 2.5;
        const rad = cell * 0.22;
        ctx.beginPath();
        if (on) {
          for (let k2 = 0; k2 < 8; k2++) {
            const a = (k2 / 8) * TAU;
            ctx.lineTo(Math.cos(a) * rad * (k2 % 2 ? 0.55 : 1), Math.sin(a) * rad * (k2 % 2 ? 0.55 : 1));
          }
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
        } else {
          ctx.arc(0, 0, rad * 0.7, 0.4, TAU - 0.4);
          ctx.stroke();
        }
        ctx.restore();
        if (S.hint === i && S.solvedT < 0) {
          ctx.strokeStyle = `rgba(255,220,140,${0.5 + 0.5 * Math.sin(t * 6)})`;
          ctx.lineWidth = 3;
          rr(ctx, x + 1, y + 1, cell - 2, cell - 2, 12);
          ctx.stroke();
        }
        ui.press(x + 2, y + 2, cell - 4, cell - 4, () => tap(i));
      }
      // 手助けボタン（器用さ）
      const by = g.y + g.h - helpH - 6;
      if (input.team.length) {
        button(ui, g.x + 24, by + 8, g.w - 48, 50, `ドラゴンに外してもらう（残り${S.helps}回）`, S.helps > 0 ? help : null, { color: C.plum, size: 14, disabled: S.helps <= 0 });
      } else {
        textBox(ctx, 'ドラゴンがいると、ヒントや手助けがもらえます', g.x + 24, by + 8, g.w - 48, 50, { size: 12, color: C.sub, valign: 'middle', align: 'center' });
      }
    },
  };
}
