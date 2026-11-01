// 太鼓: ゴブリンの太鼓に合わせてタップし、ドラゴンが踊って気をそらす（リズム）
// 器用さ → 判定のゆるさ / 知恵 → 先の音が見える・輪がゆっくり来る / 力 → 踊りの迫力（点が少し増える）
import { W } from '../ui.js';
import { text, C, bar } from '../draw.js';
import { drawGoblin } from '../figures.js';
import { drawDragonAt } from '../dragon.js';
import { arenaFloor } from '../scenes/battle.js';
import { statK } from '../logic.js';

const TAU = Math.PI * 2;

function makeAudio() {
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    const ac = new AC();
    if (ac.resume) ac.resume();
    return (freq, len = 0.12, vol = 0.25) => {
      const o = ac.createOscillator(), g = ac.createGain();
      o.frequency.setValueAtTime(freq, ac.currentTime);
      o.frequency.exponentialRampToValueAtTime(freq * 0.5, ac.currentTime + len);
      g.gain.setValueAtTime(vol, ac.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + len);
      o.connect(g).connect(ac.destination);
      o.start();
      o.stop(ac.currentTime + len);
    };
  } catch (e) {
    return null;
  }
}

export default function create(input, env) {
  const { stats, quirk, team, advantage } = input;
  const rng = env.rng;
  const ui = env.ui;
  const dur = input.battle.time;
  const beat = 60 / (quirk.bpm || 96);
  const lead = 2.2;
  const notes = [];
  for (let b = 0; ; b++) {
    const tb = lead + b * beat;
    if (tb > dur - 1.6) break;
    if (b % 4 === 0 || rng() < 0.72) notes.push({ t: tb, j: null });
    if (rng() < (quirk.offbeat || 0) && tb + beat / 2 < dur - 1.6) notes.push({ t: tb + beat / 2, j: null, off: true });
  }
  const perfectW = 0.06 + statK(stats, 'dex') * 0.05;
  const goodW = 0.13 + statK(stats, 'dex') * 0.08;
  const approach = 1.1 + statK(stats, 'wit') * 0.6;
  const preview = statK(stats, 'wit') >= 0.3;
  const S = { now: 0, score: 0, combo: 0, judge: null, hitT: -9, drumT: -9, done: -1, played: 0 };
  const sound = makeAudio();
  const maxScore = notes.length * 3;
  const bonus = statK(stats, 'pow') * 0.08 + (advantage ? 0.08 : 0);
  const ratio = () => Math.max(0, Math.min(1, S.score / maxScore + bonus));

  function judgeTap() {
    if (S.done >= 0) return;
    let best = null, bd = Infinity;
    for (const n of notes) {
      if (n.j) continue;
      const d = Math.abs(n.t - S.now);
      if (d < bd) { bd = d; best = n; }
    }
    if (best && bd <= goodW) {
      best.j = bd <= perfectW ? 'perfect' : 'good';
      S.score += best.j === 'perfect' ? 3 : 2;
      S.combo++;
      S.judge = { str: best.j === 'perfect' ? 'ぴったり' : 'よし', t: S.now, col: best.j === 'perfect' ? C.gold : C.teal };
      S.hitT = S.now;
      if (sound) sound(520, 0.08, 0.12);
    } else if (!best || bd > 0.35) {
      S.score = Math.max(0, S.score - 1);
      S.combo = 0;
      S.judge = { str: 'ずれた', t: S.now, col: C.red };
    }
  }

  return {
    result: null,
    remainRatio: 1,
    timeUp() { const r = ratio(); return r >= 0.72 ? 'great' : r >= 0.42 ? 'good' : 'fail'; },
    status() { return `連続 ${S.combo}`; },
    update(dt) {
      S.now += dt;
      for (const n of notes) {
        if (!n.played && S.now >= n.t) { n.played = true; S.drumT = S.now; if (sound) sound(n.off ? 150 : 110, 0.16, 0.3); }
        if (!n.j && S.now > n.t + goodW) { n.j = 'miss'; S.combo = 0; S.judge = { str: '外れ', t: S.now, col: C.red }; }
      }
      if (S.done < 0 && notes.every((n) => n.j)) S.done = S.now;
      if (S.done >= 0 && S.now - S.done > 0.9) this.result = this.timeUp();
    },
    draw(ctx, area, t, info) {
      this.remainRatio = info.remainRatio;
      const g = arenaFloor(ctx, area, info.theme);
      ui.press(g.x, g.y, g.w, g.h, judgeTap);
      // 気をそらすゲージ
      text(ctx, 'ゴブリンの気をそらす', g.x + 18, g.y + 22, { size: 12, color: C.sub, maxW: 150 });
      bar(ctx, g.x + 170, g.y + 17, g.w - 170 - 18, 10, ratio(), C.gold);
      // 先の音（知恵）
      const tlY = g.y + 52;
      if (preview) {
        ctx.fillStyle = 'rgba(250,247,240,0.75)';
        ctx.fillRect(g.x + 18, tlY - 8, g.w - 36, 16);
        const mx = g.x + 40;
        ctx.fillStyle = 'rgba(43,39,34,0.6)';
        ctx.fillRect(mx - 1, tlY - 10, 2, 20);
        for (const n of notes) {
          if (n.j) continue;
          const x = mx + (n.t - S.now) * 70;
          if (x > g.x + g.w - 22) continue;
          ctx.fillStyle = n.off ? '#4f8fa0' : '#c07a30';
          ctx.beginPath(); ctx.arc(x, tlY, n.off ? 4 : 5.5, 0, TAU); ctx.fill();
        }
      }
      // ゴブリン（左で太鼓をたたく）
      const gx = g.x + 70, gy = g.y + g.h * 0.42;
      const k = Math.max(0, 1 - (S.now - S.drumT) / 0.15);
      // 気をそらされるほど、ゴブリンが踊りにつられる
      drawGoblin(ctx, input.goblin, gx, gy - k * 4, 66, { t, shake: ratio() > 0.6 && Math.sin(t * 3) > 0.7, pose: ratio() > 0.6 ? 'win' : 'idle' });
      if (k > 0) {
        ctx.strokeStyle = `rgba(168,117,31,${k})`;
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(gx, gy + 20, 30 + (1 - k) * 20, 0, TAU); ctx.stroke();
      }
      // 的（ドラゴンの上）と、近づく輪
      const tx = g.x + g.w * 0.62, ty = g.y + g.h * 0.42;
      const R0 = 34;
      ctx.strokeStyle = 'rgba(255,255,255,0.55)';
      ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(tx, ty, R0, 0, TAU); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.06)';
      ctx.fill();
      for (const n of notes) {
        if (n.j) continue;
        const dtn = n.t - S.now;
        if (dtn > approach || dtn < -goodW) continue;
        const r = R0 + (dtn / approach) * 120;
        ctx.strokeStyle = n.off ? `rgba(168,200,208,${1 - dtn / approach})` : `rgba(232,176,112,${1 - dtn / approach})`;
        ctx.lineWidth = n.off ? 3 : 5;
        ctx.beginPath(); ctx.arc(tx, ty, Math.max(4, r), 0, TAU); ctx.stroke();
      }
      // 踊るドラゴン
      const hop = Math.max(0, 1 - (S.now - S.hitT) / 0.25);
      const n = Math.max(1, team.length);
      const rowY = g.y + g.h * 0.78;
      team.forEach((d, i) => {
        const x = g.x + g.w * (0.38 + (i + 0.5) * (0.55 / n));
        drawDragonAt(ctx, d.genome, x, rowY - hop * 16 * (i % 2 ? 0.7 : 1), Math.min(96, (g.w * 0.55) / n), { anchor: 'feet', t: t * 2 + i, level: d.level, flip: i % 2 === 1, speed: 2 });
      });
      if (!team.length) text(ctx, 'ドラゴンがいないので、手拍子だけ', g.x + g.w * 0.65, rowY - 20, { size: 12, align: 'center', color: C.sub, maxW: g.w * 0.6 });
      if (S.judge && S.now - S.judge.t < 0.5) {
        text(ctx, S.judge.str, tx, ty + R0 + 26, { size: 18, align: 'center', color: S.judge.col, free: true });
      }
      if (S.now < lead - 0.3) text(ctx, '輪が重なったらタップ', W / 2, g.y + g.h - 28, { size: 14, align: 'center', color: C.text, maxW: g.w - 40 });
    },
  };
}
