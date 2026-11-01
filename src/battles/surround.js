// 包囲: 六角の盤にドラゴンを置いて、ゴブリンの逃げ道をふさぐ（作戦）
// 知恵 → ゴブリンの次の一歩が見える / 力 → 最初の岩が増える / 器用さ → 続けて置ける回数 / 速さ → 2歩進むのを止める
import { W } from '../ui.js';
import { text, C, button, textBox } from '../draw.js';
import { drawGoblin } from '../figures.js';
import { drawDragonAt } from '../dragon.js';
import { arenaFloor } from '../scenes/battle.js';
import { statK } from '../logic.js';

const TAU = Math.PI * 2;
const COLS = 7, ROWS = 7;

function neighbors(c, r) {
  const odd = r % 2 === 1;
  const d = odd ? [[0, -1], [1, -1], [-1, 0], [1, 0], [0, 1], [1, 1]] : [[-1, -1], [0, -1], [-1, 0], [1, 0], [-1, 1], [0, 1]];
  return d.map(([dc, dr]) => [c + dc, r + dr]).filter(([x, y]) => x >= 0 && y >= 0 && x < COLS && y < ROWS);
}
const isEdge = (c, r) => c === 0 || r === 0 || c === COLS - 1 || r === ROWS - 1;

export default function create(input, env) {
  const { stats, quirk, team, advantage } = input;
  const rng = env.rng;
  const ui = env.ui;
  const cells = [];
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) cells.push({ c, r, kind: null, who: 0 });
  const at = (c, r) => cells[r * COLS + c];
  const S = { g: { c: 3, r: 3 }, from: null, moveT: 1, placed: 0, opening: 2 + (advantage ? 1 : 0), free: Math.floor(statK(stats, 'dex') * 2.5), arm: false, result: null, endT: -1, escaped: false, next: null };
  let rocks = (quirk.rocks || 10) + Math.floor(statK(stats, 'pow') * 4) + (advantage ? 3 : 0);
  let guard = 0;
  while (rocks > 0 && guard++ < 500) {
    const c = Math.floor(rng() * COLS), r = Math.floor(rng() * ROWS);
    if (Math.abs(c - 3) + Math.abs(r - 3) <= 1 || at(c, r).kind) continue;
    at(c, r).kind = 'rock';
    rocks--;
  }

  // ゴブリンからいちばん近い外周への最初の一歩（なければ null）
  function plan() {
    const { c, r } = S.g;
    if (isEdge(c, r)) return { escape: true };
    const prev = new Map();
    const key = (x, y) => y * COLS + x;
    const q = [[c, r]];
    prev.set(key(c, r), null);
    const goals = [];
    let found = -1;
    for (let qi = 0; qi < q.length; qi++) {
      const [x, y] = q[qi];
      const d = depth(prev, key(x, y));
      if (found >= 0 && d > found) break;
      if (isEdge(x, y)) { goals.push([x, y]); found = d; continue; }
      for (const [nx, ny] of neighbors(x, y)) {
        if (at(nx, ny).kind || prev.has(key(nx, ny))) continue;
        prev.set(key(nx, ny), key(x, y));
        q.push([nx, ny]);
      }
    }
    if (!goals.length) return null;
    let k = key(...goals[Math.floor(rng() * goals.length)]);
    while (prev.get(k) !== key(c, r)) k = prev.get(k);
    return { c: k % COLS, r: Math.floor(k / COLS) };
  }
  function depth(prev, k) { let d = 0; while (prev.get(k) != null) { k = prev.get(k); d++; } return d; }

  function goblinTurn() {
    let steps = 1;
    if (rng() < (quirk.double || 0) && rng() > statK(stats, 'spd') * 0.8) steps = 2;
    for (let i = 0; i < steps; i++) {
      const p = plan();
      if (!p) { S.endT = 0; S.result = 'win'; return; }
      if (p.escape) { S.endT = 0; S.result = 'escape'; S.escaped = true; return; }
      S.from = { ...S.g };
      S.g = { c: p.c, r: p.r };
      S.moveT = 0;
    }
    if (!plan()) { S.endT = 0; S.result = 'win'; }
    S.next = statK(stats, 'wit') >= 0.3 ? plan() : null;
  }

  function place(c, r) {
    if (S.endT >= 0) return;
    const cell = at(c, r);
    if (cell.kind || (S.g.c === c && S.g.r === r)) return;
    cell.kind = 'guard';
    cell.who = S.placed % Math.max(1, team.length);
    S.placed++;
    const opening = S.opening > 0;
    if (opening || (S.arm && S.free > 0)) {
      if (opening) S.opening--; else { S.free--; S.arm = false; }
      if (!plan()) { S.endT = 0; S.result = 'win'; }
      S.next = statK(stats, 'wit') >= 0.3 ? plan() : null;
      return;
    }
    goblinTurn();
  }
  S.next = statK(stats, 'wit') >= 0.3 ? plan() : null;

  return {
    result: null,
    remainRatio: 1,
    // テスト用の操作口
    act: (c, r) => place(c, r),
    peek: () => ({ g: S.g, next: plan(), end: S.endT >= 0 ? S.result : null, free: S.free, blocked: (c, r) => !!at(c, r).kind }),
    arm: () => { S.arm = true; },
    timeUp() { return 'fail'; },
    status() { return `置いた数 ${S.placed}`; },
    update(dt) {
      S.moveT = Math.min(1, S.moveT + dt * 4);
      if (S.endT >= 0) {
        S.endT += dt;
        if (S.endT > 0.9) this.result = S.result === 'win' ? (S.placed <= 9 || this.remainRatio > 0.5 ? 'great' : 'good') : 'fail';
      }
    },
    draw(ctx, area, t, info) {
      this.remainRatio = info.remainRatio;
      const g = arenaFloor(ctx, area, info.theme);
      const footH = 72;
      const availH = g.h - footH - 30, availW = g.w - 24;
      const R = Math.min(availW / ((COLS + 0.5) * Math.sqrt(3)), availH / (ROWS * 1.5 + 0.5));
      const hw = Math.sqrt(3) * R;
      const bw = (COLS + 0.5) * hw, bh = ROWS * 1.5 * R + 0.5 * R;
      const x0 = W / 2 - bw / 2 + hw / 2, y0 = g.y + 18 + (availH - bh) / 2 + R;
      const pos = (c, r) => ({ x: x0 + c * hw + (r % 2 ? hw / 2 : 0), y: y0 + r * 1.5 * R });
      for (const cell of cells) {
        const p = pos(cell.c, cell.r);
        ctx.beginPath();
        for (let k = 0; k < 6; k++) {
          const a = Math.PI / 6 + (k * TAU) / 6;
          ctx.lineTo(p.x + Math.cos(a) * (R - 1.5), p.y + Math.sin(a) * (R - 1.5));
        }
        ctx.closePath();
        const edge = isEdge(cell.c, cell.r);
        ctx.fillStyle = cell.kind === 'rock' ? 'rgba(96,84,76,0.85)' : edge ? 'rgba(70,56,40,0.2)' : 'rgba(255,255,255,0.3)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(70,56,40,0.3)';
        ctx.lineWidth = 1.2;
        ctx.stroke();
        if (cell.kind === 'rock') {
          ctx.fillStyle = info.theme.obMain;
          ctx.beginPath();
          ctx.ellipse(p.x, p.y, R * 0.55, R * 0.45, 0, 0, TAU);
          ctx.fill();
        } else if (cell.kind === 'guard') {
          const d = team[cell.who];
          if (d) drawDragonAt(ctx, d.genome, p.x, p.y, R * 1.8, { t: t + cell.c, level: d.level, shadow: false, aspect: 1 });
          else { ctx.fillStyle = '#8a6a4a'; ctx.beginPath(); ctx.arc(p.x, p.y, R * 0.5, 0, TAU); ctx.fill(); }
        } else if (S.endT < 0) {
          ui.press(p.x - hw / 2, p.y - R * 0.8, hw, R * 1.6, () => place(cell.c, cell.r));
        }
      }
      // 次の一歩
      if (S.next && !S.next.escape && S.endT < 0) {
        const a = pos(S.g.c, S.g.r), b = pos(S.next.c, S.next.r);
        ctx.strokeStyle = 'rgba(255,200,120,0.75)';
        ctx.lineWidth = 3;
        ctx.setLineDash([5, 5]);
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
        ctx.setLineDash([]);
      }
      // ゴブリン
      const gp = pos(S.g.c, S.g.r);
      let gx = gp.x, gy = gp.y;
      if (S.from && S.moveT < 1) { const f = pos(S.from.c, S.from.r); gx = f.x + (gp.x - f.x) * S.moveT; gy = f.y + (gp.y - f.y) * S.moveT; }
      if (S.escaped) gy += S.endT * 200;
      drawGoblin(ctx, input.goblin, gx, gy - R * 0.6, R * 1.5, { t, egg: 'forest_common', shake: S.result === 'win', pose: S.result === 'win' ? 'lose' : S.from && S.moveT < 1 ? 'walk' : 'idle' });
      // 下の欄
      const fy = g.y + g.h - footH;
      if (S.endT >= 0) {
        text(ctx, S.result === 'win' ? '囲んだ' : '逃げられた', W / 2, fy + 30, { size: 20, align: 'center', color: S.result === 'win' ? C.gold : C.red, maxW: g.w - 40 });
      } else if (S.opening > 0) {
        textBox(ctx, `ゴブリンはまだ様子見。あと${S.opening}個置ける`, g.x + 24, fy + 8, g.w - 48, 52, { size: 13, color: C.gold, valign: 'middle', align: 'center' });
      } else if (S.free > 0) {
        button(ui, g.x + 24, fy + 8, g.w - 48, 52, S.arm ? '次は続けて置く（選択中）' : `続けて置く（残り${S.free}回）`, () => { S.arm = !S.arm; }, { color: S.arm ? C.gold : C.plum, size: 14, textColor: S.arm ? '#1b1e25' : undefined });
      } else {
        textBox(ctx, '外側の列に着く前に、まわりをふさごう', g.x + 24, fy + 8, g.w - 48, 52, { size: 13, color: C.sub, valign: 'middle', align: 'center' });
      }
    },
  };
}
