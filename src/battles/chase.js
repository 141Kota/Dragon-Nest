// 追跡: 卵を持って逃げるゴブリンを、スティックで追いかけて捕まえる（アクション）
// 速さ → 自分の足の速さ / 力 → 技の足止めの長さ / 知恵 → 技の待ち時間 / 器用さ → 捕まえる距離
import { W } from '../ui.js';
import { text, drawGoblin, C, shadowEllipse } from '../draw.js';
import { drawDragonAt } from '../dragon.js';
import { drawExplorer } from '../scenes/explore.js';
import { arenaFloor, skillName } from '../scenes/battle.js';
import { statK } from '../logic.js';

const TAU = Math.PI * 2;

export default function create(input, env) {
  const { stats, quirk, team, advantage } = input;
  const rng = env.rng;
  const ui = env.ui;
  const S = {
    p: { x: 0.5, y: 0.75, face: 1 },
    g: { x: 0.5, y: advantage ? 0.5 : 0.32, vx: 0, vy: 0, stun: 0, face: 1, jinkT: 0, jx: 0, jy: 0 },
    walls: [],
    rocks: [],
    cds: team.length ? team.map(() => 0) : [0],
    fx: [],
    result: null,
    stick: null,
    last: null,
  };
  for (let i = 0; i < 4; i++) S.rocks.push({ x: 0.2 + rng() * 0.6, y: 0.15 + rng() * 0.45, r: 0.035 + rng() * 0.02 });
  const pSpeed = 0.32 + statK(stats, 'spd') * 0.2; // 画面の幅に対する割合/秒
  const gSpeed = 0.30 * (quirk.speed || 1);
  const stunT = 0.7 + statK(stats, 'pow') * 1.0;
  const wallT = 2.2 + statK(stats, 'pow') * 1.6;
  const cdT = 5.5 - statK(stats, 'wit') * 2.5;
  const catchR = 0.06 + statK(stats, 'dex') * 0.025;
  const skills = team.length ? team.map((d) => ({ name: skillName(d), d })) : [{ name: '石を投げる', d: null }];

  let geo = null; // 画面上の闘技場

  function toScreen(x, y) { return { x: geo.x + x * geo.w, y: geo.y + y * geo.h }; }

  function useSkill(i) {
    if (S.result || S.cds[i] > 0) return;
    S.cds[i] = cdT;
    const g = S.g;
    const weak = !skills[i].d;
    g.stun = Math.max(g.stun, weak ? stunT * 0.5 : stunT);
    // 逃げる向きの先に壁を置く
    const m = Math.hypot(g.vx, g.vy) || 1;
    const dx = g.vx / m, dy = g.vy / m;
    S.walls.push({ x: g.x + dx * 0.12, y: g.y + dy * 0.12 * (geo.w / geo.h), ang: Math.atan2(dy, dx) + Math.PI / 2, life: weak ? wallT * 0.5 : wallT, max: wallT });
    S.fx.push({ x: g.x, y: g.y, t: 0, kind: 'hit' });
  }

  function blockedAt(x, y, r) {
    if (x < r || x > 1 - r || y < r || y > 1 - r) return true;
    for (const k of S.rocks) if (Math.hypot((k.x - x) * geo.w, (k.y - y) * geo.h) < (k.r + r) * geo.w) return true;
    for (const w of S.walls) {
      // 壁は短い線分
      const ex = Math.cos(w.ang) * 0.09, ey = Math.sin(w.ang) * 0.09 * (geo.w / geo.h);
      const ax = w.x - ex, ay = w.y - ey, bx = w.x + ex, by = w.y + ey;
      const px = x - ax, py = y - ay, qx = bx - ax, qy = by - ay;
      const tt = Math.max(0, Math.min(1, (px * qx * geo.w * geo.w + py * qy * geo.h * geo.h) / (qx * qx * geo.w * geo.w + qy * qy * geo.h * geo.h)));
      const dx = (ax + qx * tt - x) * geo.w, dy = (ay + qy * tt - y) * geo.h;
      if (Math.hypot(dx, dy) < r * geo.w + 6) return true;
    }
    return false;
  }

  function move(o, vx, vy, dt, r) {
    const nx = o.x + vx * dt, ny = o.y + vy * dt * (geo.w / geo.h);
    if (!blockedAt(nx, ny, r)) { o.x = nx; o.y = ny; return true; }
    if (!blockedAt(nx, o.y, r)) { o.x = nx; return true; }
    if (!blockedAt(o.x, ny, r)) { o.y = ny; return true; }
    return false;
  }

  return {
    update(dt, area) {
      if (!geo) return;
      const kd = ui.keyDir();
      const st = S.stick || { x: 0, y: 0 };
      let mx = st.x + kd.x, my = st.y + kd.y;
      const m = Math.hypot(mx, my);
      if (m > 1) { mx /= m; my /= m; }
      if (m > 0.1) { move(S.p, mx * pSpeed, my * pSpeed, dt, 0.035); if (Math.abs(mx) > 0.2) S.p.face = mx > 0 ? 1 : -1; }
      // ゴブリン: プレイヤーから離れる + 壁を避ける + 癖でジグザグ
      const g = S.g;
      if (g.stun > 0) { g.stun -= dt; g.vx *= 0.9; g.vy *= 0.9; } else {
        let ax = g.x - S.p.x, ay = (g.y - S.p.y) * (geo.h / geo.w);
        const d = Math.hypot(ax, ay) || 1;
        ax /= d; ay /= d;
        const edge = 0.14;
        if (g.x < edge) ax += (edge - g.x) * 9;
        if (g.x > 1 - edge) ax -= (g.x - 1 + edge) * 9;
        if (g.y < edge) ay += (edge - g.y) * 9;
        if (g.y > 1 - edge) ay -= (g.y - 1 + edge) * 9;
        g.jinkT -= dt;
        if (g.jinkT <= 0) { g.jinkT = 0.5 + rng() * 0.8; const a = rng() * TAU; g.jx = Math.cos(a) * (quirk.jink || 1) * 0.7; g.jy = Math.sin(a) * (quirk.jink || 1) * 0.7; }
        ax += g.jx; ay += g.jy;
        const n = Math.hypot(ax, ay) || 1;
        const sp = gSpeed * (d < 0.35 ? 1 : 0.55);
        g.vx += ((ax / n) * sp - g.vx) * Math.min(1, dt * 6);
        g.vy += ((ay / n) * sp - g.vy) * Math.min(1, dt * 6);
        if (!move(g, g.vx, g.vy, dt, 0.035)) { g.jinkT = 0; }
        if (Math.abs(g.vx) > 0.02) g.face = g.vx > 0 ? 1 : -1;
      }
      for (let i = 0; i < S.cds.length; i++) S.cds[i] = Math.max(0, S.cds[i] - dt);
      S.walls = S.walls.filter((w) => (w.life -= dt) > 0);
      S.fx = S.fx.filter((f) => (f.t += dt) < 0.6);
      if (Math.hypot((g.x - S.p.x) * geo.w, (g.y - S.p.y) * geo.h) < catchR * geo.w + 22) {
        S.result = this.remainRatio > 0.45 ? 'great' : 'good';
        this.result = S.result;
      }
    },
    remainRatio: 1,
    result: null,
    timeUp() { return 'fail'; },
    status() { return null; },
    draw(ctx, area, t, info) {
      this.remainRatio = info.remainRatio;
      const btnH = 96;
      geo = arenaFloor(ctx, { x: area.x, y: area.y, w: area.w, h: area.h - btnH }, info.theme);
      // 岩
      for (const k of S.rocks) {
        const p = toScreen(k.x, k.y);
        const r = k.r * geo.w;
        shadowEllipse(ctx, p.x + 3, p.y + r * 0.5, r, r * 0.45, 0.35);
        ctx.fillStyle = info.theme.obDark;
        ctx.beginPath();
        ctx.ellipse(p.x, p.y, r, r * 0.8, 0, 0, TAU);
        ctx.fill();
        ctx.fillStyle = info.theme.obMain;
        ctx.beginPath();
        ctx.ellipse(p.x - r * 0.2, p.y - r * 0.25, r * 0.6, r * 0.45, 0, 0, TAU);
        ctx.fill();
      }
      // 技で置いた壁
      for (const w of S.walls) {
        const p = toScreen(w.x, w.y);
        const L = 0.09 * geo.w;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(w.ang);
        ctx.globalAlpha = Math.min(1, w.life * 2);
        ctx.fillStyle = 'rgba(150,200,210,0.35)';
        ctx.strokeStyle = 'rgba(200,240,250,0.8)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.roundRect ? ctx.roundRect(-L, -7, L * 2, 14, 7) : ctx.rect(-L, -7, L * 2, 14);
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      }
      // ゴブリンとプレイヤー（奥から）
      const gp = toScreen(S.g.x, S.g.y), pp = toScreen(S.p.x, S.p.y);
      const drawG = () => {
        drawGoblin(ctx, input.goblin, gp.x, gp.y - 20, 46, { t, egg: 'forest_common', flip: S.g.face < 0, shake: S.g.stun > 0 });
        if (S.g.stun > 0) for (let i = 0; i < 3; i++) { const a = t * 6 + i * 2.1; ctx.fillStyle = C.gold; ctx.beginPath(); ctx.arc(gp.x + Math.cos(a) * 16, gp.y - 52 + Math.sin(a) * 5, 2.5, 0, TAU); ctx.fill(); }
      };
      const drawP = () => {
        team.forEach((d, i) => drawDragonAt(ctx, d.genome, pp.x - S.p.face * (26 + i * 18), pp.y - 4 - i * 6, 42, { anchor: 'feet', t: t + i, level: d.level, flip: S.p.face < 0, speed: 1.5 }));
        drawExplorer(ctx, pp.x, pp.y, 0.9, t, true, S.p.face);
      };
      if (gp.y < pp.y) { drawG(); drawP(); } else { drawP(); drawG(); }
      for (const f of S.fx) {
        const p = toScreen(f.x, f.y);
        ctx.strokeStyle = `rgba(255,230,160,${1 - f.t / 0.6})`;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(p.x, p.y - 20, 10 + f.t * 60, 0, TAU);
        ctx.stroke();
      }
      // 操作: 左にスティック、右に技ボタン
      const H = area.y + area.h;
      const by = H - btnH + 10;
      const stick = ui.stick('chase', area.x, area.y + 40, area.w * 0.55, area.h - 40);
      S.stick = stick;
      const rest = { x: 70, y: by + 34 };
      const cx = stick.active ? stick.cx : rest.x, cy = stick.active ? stick.cy : rest.y;
      ctx.fillStyle = 'rgba(10,12,16,0.4)';
      ctx.strokeStyle = 'rgba(255,255,255,0.3)';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(cx, cy, 44, 0, TAU); ctx.fill(); ctx.stroke();
      ctx.fillStyle = 'rgba(230,220,200,0.8)';
      ctx.beginPath(); ctx.arc(cx + stick.x * 34, cy + stick.y * 34, 20, 0, TAU); ctx.fill();
      const n = skills.length, bw = 60, gap = 18;
      skills.forEach((sk, i) => {
        const x = W - 16 - (n - i) * bw - (n - 1 - i) * gap;
        const ready = S.cds[i] <= 0;
        ctx.fillStyle = ready ? 'rgba(154,77,52,0.95)' : 'rgba(60,60,66,0.9)';
        ctx.beginPath(); ctx.arc(x + bw / 2, by + 24, 28, 0, TAU); ctx.fill();
        ctx.strokeStyle = ready ? C.gold : 'rgba(255,255,255,0.2)';
        ctx.lineWidth = 2;
        ctx.stroke();
        if (sk.d) drawDragonAt(ctx, sk.d.genome, x + bw / 2, by + 24, 40, { t, shadow: false, level: sk.d.level, silhouette: !ready, aspect: 0.8 });
        else { ctx.fillStyle = '#8a8070'; ctx.beginPath(); ctx.arc(x + bw / 2, by + 24, 9, 0, TAU); ctx.fill(); }
        if (!ready) {
          ctx.strokeStyle = C.gold;
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.arc(x + bw / 2, by + 24, 28, -Math.PI / 2, -Math.PI / 2 + TAU * (1 - S.cds[i] / cdT));
          ctx.stroke();
        }
        text(ctx, sk.name, x + bw / 2, by + 68, { size: 11, align: 'center', color: ready ? C.text : C.dim, maxW: bw + gap - 8, free: true });
        ui.press(x + bw / 2 - 30, by - 6, 60, 60, () => useSkill(i));
      });
    },
  };
}
