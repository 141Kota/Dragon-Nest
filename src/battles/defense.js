// 防衛: 卵を守りながら、押し寄せるゴブリンをタップで追い払う（忙しさと手際）
// 器用さ → タップの当たる広さ / 力 → 一撃で倒しやすい / 速さ → ドラゴンが自動で攻撃する間隔
import { W } from '../ui.js';
import { text, drawGoblin, drawEgg, C } from '../draw.js';
import { drawDragonAt } from '../dragon.js';
import { arenaFloor } from '../scenes/battle.js';
import { statK } from '../logic.js';

const TAU = Math.PI * 2;

export default function create(input, env) {
  const { stats, quirk, team, advantage } = input;
  const rng = env.rng;
  const ui = env.ui;
  const total = Math.max(3, (quirk.count || 8) - (advantage ? 1 : 0));
  const dur = input.battle.time;
  const S = {
    gobs: [], spawned: 0, spawnT: advantage ? 2.2 : 1.0, stolen: 0, fx: [], time: 0, beaten: 0,
    shots: team.map((_, i) => ({ cd: 1 + i * 0.6 })), bolts: [],
  };
  const tapR = 30 + statK(stats, 'dex') * 22;
  const shotCd = 4.2 - statK(stats, 'spd') * 2.4;
  const crit = statK(stats, 'pow') * 0.6;
  let geo = null;

  function spawn() {
    const side = Math.floor(rng() * 3); // 左・右・上
    const p = side === 0 ? { x: -0.05, y: 0.15 + rng() * 0.6 } : side === 1 ? { x: 1.05, y: 0.15 + rng() * 0.6 } : { x: 0.1 + rng() * 0.8, y: -0.05 };
    S.gobs.push({ ...p, hp: quirk.hp || 1, max: quirk.hp || 1, hurt: 0, flee: false, speed: (0.07 + rng() * 0.03) * (quirk.speed || 1), id: S.spawned });
    S.spawned++;
  }

  function hitGob(gb, dmg) {
    gb.hp -= dmg;
    gb.hurt = 0.25;
    const dx = gb.x - 0.5, dy = gb.y - 0.55;
    const m = Math.hypot(dx, dy) || 1;
    gb.x += (dx / m) * 0.06; gb.y += (dy / m) * 0.06;
    if (gb.hp <= 0) { gb.dead = true; S.beaten++; S.fx.push({ x: gb.x, y: gb.y, t: 0 }); }
  }

  function tap(p) {
    if (!geo) return;
    let best = null, bd = Infinity;
    for (const gb of S.gobs) {
      if (gb.dead || gb.flee) continue;
      const sx = geo.x + gb.x * geo.w, sy = geo.y + gb.y * geo.h - 18;
      const d = Math.hypot(sx - p.x, sy - p.y);
      if (d < tapR && d < bd) { bd = d; best = gb; }
    }
    if (best) hitGob(best, rng() < crit ? 2 : 1);
    S.fx.push({ x: (p.x - geo.x) / geo.w, y: (p.y - geo.y) / geo.h, t: 0, tap: true });
  }

  return {
    result: null,
    remainRatio: 1,
    timeUp() { return S.stolen === 0 ? 'great' : S.stolen <= 2 ? 'good' : 'fail'; },
    status() { return `奪われた ${S.stolen}`; },
    update(dt) {
      S.time += dt;
      S.spawnT -= dt;
      if (S.spawned < total && S.spawnT <= 0) { spawn(); S.spawnT = (dur * 0.72) / total * (0.6 + rng() * 0.8); }
      for (const gb of S.gobs) {
        if (gb.dead) continue;
        gb.hurt = Math.max(0, gb.hurt - dt);
        const tx = gb.flee ? (gb.x < 0.5 ? -0.3 : 1.3) : 0.5, ty = gb.flee ? -0.3 : 0.55;
        const dx = tx - gb.x, dy = ty - gb.y;
        const m = Math.hypot(dx, dy) || 1;
        const sp = gb.speed * (gb.hurt > 0 ? 0.2 : 1) * (gb.flee ? 2.2 : 1);
        gb.x += (dx / m) * sp * dt;
        gb.y += (dy / m) * sp * dt;
        gb.face = dx > 0 ? 1 : -1;
        if (!gb.flee && m < 0.07) { gb.flee = true; S.stolen++; }
        if (gb.flee && (gb.x < -0.2 || gb.x > 1.2 || gb.y < -0.2)) gb.dead = true;
      }
      // ドラゴンの自動攻撃
      S.shots.forEach((s, i) => {
        s.cd -= dt;
        if (s.cd > 0) return;
        const ox = 0.5 + Math.cos(i * 2.1 + 0.5) * 0.17, oy = 0.6 + Math.sin(i * 2.1 + 0.5) * 0.1;
        let best = null, bd = 0.42;
        for (const gb of S.gobs) {
          if (gb.dead || gb.flee) continue;
          const d = Math.hypot(gb.x - ox, gb.y - oy);
          if (d < bd) { bd = d; best = gb; }
        }
        if (best) { S.bolts.push({ x0: ox, y0: oy, gb: best, t: 0 }); s.cd = shotCd; } else s.cd = 0.3;
      });
      S.bolts = S.bolts.filter((b) => { b.t += dt * 3; if (b.t >= 1) { if (!b.gb.dead && !b.gb.flee) hitGob(b.gb, 1); return false; } return true; });
      S.fx = S.fx.filter((f) => (f.t += dt) < 0.5);
      S.gobs = S.gobs.filter((gb) => !gb.dead || false);
      if (S.spawned >= total && !S.gobs.length && S.time > 2) this.result = this.timeUp();
    },
    draw(ctx, area, t, info) {
      this.remainRatio = info.remainRatio;
      geo = arenaFloor(ctx, area, info.theme);
      ui.press(geo.x, geo.y, geo.w, geo.h, tap);
      const ex = geo.x + geo.w * 0.5, ey = geo.y + geo.h * 0.55;
      // 卵の台
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.beginPath(); ctx.ellipse(ex, ey + 22, 46, 15, 0, 0, TAU); ctx.fill();
      drawEgg(ctx, 'forest_common', ex, ey, 56, { wobble: S.gobs.some((g) => !g.flee && Math.hypot(g.x - 0.5, g.y - 0.55) < 0.15) ? Math.sin(t * 20) * 0.1 : 0 });
      // 卵の残り（奪われるたびに減る表示）
      for (let i = 0; i < 3; i++) {
        ctx.fillStyle = i < S.stolen ? 'rgba(200,90,70,0.9)' : 'rgba(255,255,255,0.2)';
        ctx.beginPath(); ctx.arc(ex - 16 + i * 16, ey + 48, 5, 0, TAU); ctx.fill();
      }
      // ドラゴン（卵のまわり）
      team.forEach((d, i) => {
        const ox = geo.x + geo.w * (0.5 + Math.cos(i * 2.1 + 0.5) * 0.17), oy = geo.y + geo.h * (0.6 + Math.sin(i * 2.1 + 0.5) * 0.1);
        drawDragonAt(ctx, d.genome, ox, oy, 62, { anchor: 'feet', t: t + i, level: d.level, flip: ox > ex });
      });
      for (const b of S.bolts) {
        const x = b.x0 + (b.gb.x - b.x0) * b.t, y = b.y0 + (b.gb.y - b.y0) * b.t;
        ctx.fillStyle = '#ffd08a';
        ctx.beginPath(); ctx.arc(geo.x + x * geo.w, geo.y + y * geo.h - 20, 5, 0, TAU); ctx.fill();
      }
      const list = [...S.gobs].sort((a, b) => a.y - b.y);
      for (const gb of list) {
        const sx = geo.x + gb.x * geo.w, sy = geo.y + gb.y * geo.h;
        ctx.save();
        ctx.beginPath(); ctx.rect(geo.x, geo.y, geo.w, geo.h); ctx.clip();
        drawGoblin(ctx, input.goblin, sx, sy - 20, 40, { t: t + gb.id, hurt: gb.hurt > 0, flip: gb.face < 0, egg: gb.flee ? 'forest_common' : null });
        ctx.restore();
        if (gb.max > 1 && !gb.flee) for (let k = 0; k < gb.max; k++) { ctx.fillStyle = k < gb.hp ? '#e0907a' : 'rgba(0,0,0,0.4)'; ctx.fillRect(sx - 10 + k * 12, sy - 52, 9, 4); }
      }
      for (const f of S.fx) {
        ctx.strokeStyle = f.tap ? `rgba(255,240,200,${0.6 * (1 - f.t / 0.5)})` : `rgba(255,200,120,${1 - f.t / 0.5})`;
        ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.arc(geo.x + f.x * geo.w, geo.y + f.y * geo.h - (f.tap ? 0 : 18), (f.tap ? 8 : 12) + f.t * 50, 0, TAU); ctx.stroke();
      }
      text(ctx, `${S.beaten + S.stolen} / ${total}`, geo.x + 18, geo.y + 22, { size: 13, color: C.sub, maxW: 80 });
    },
  };
}
