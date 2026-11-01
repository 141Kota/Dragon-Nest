// バトル: ゴブリンの予告を見て「守る・かわす・反撃」を選ぶ
import { DATA, locationById, goblinById } from '../data.js';
import { W } from '../ui.js';
import { text, panel, button, rr, drawEgg, drawGoblin, bar, skyGradient, iconShard, iconStone, sparkle, wrapText } from '../draw.js';
import { drawDragonAt } from '../dragon.js';
import { createBattle, battleAct, battleSkill, battleReward } from '../logic.js';
import { modalFrame } from './common.js';
import { drawExplorer } from './explore.js';
import { drawLocationDecor } from './select.js';

const ANIM = 0.85;

function intentIcon(ctx, id, x, y, s, t) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  if (id === 'rush') {
    ctx.fillStyle = '#e8735a';
    ctx.beginPath();
    ctx.moveTo(-14, -6); ctx.lineTo(4, -6); ctx.lineTo(4, -14); ctx.lineTo(16, 0); ctx.lineTo(4, 14); ctx.lineTo(4, 6); ctx.lineTo(-14, 6);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(232,115,90,0.5)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-22, -10); ctx.lineTo(-16, -10); ctx.moveTo(-24, 10); ctx.lineTo(-17, 10);
    ctx.stroke();
  } else if (id === 'scratch') {
    ctx.strokeStyle = '#c94f6d';
    ctx.lineWidth = 4;
    for (let i = -1; i <= 1; i++) {
      ctx.beginPath();
      ctx.moveTo(-10 + i * 8, -14);
      ctx.quadraticCurveTo(-2 + i * 8, 0, 6 + i * 8, 14);
      ctx.stroke();
    }
  } else {
    ctx.fillStyle = '#8f7ad6';
    ctx.beginPath();
    ctx.ellipse(0, 4, 13, 11, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#b9a7f0';
    ctx.beginPath();
    ctx.moveTo(-6, -6); ctx.lineTo(0, -16); ctx.lineTo(6, -6);
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-5, 4); ctx.lineTo(5, 4);
    ctx.stroke();
  }
  ctx.restore();
}

export function createBattleScene(game) {
  let B = null; // ロジック側のバトル
  let P = null; // 呼び出し時のパラメータ
  let anim = null;
  let log = '';
  let done = null;

  function act(fn) {
    if (anim || B.result) return;
    const res = fn();
    if (!res) return;
    anim = { t0: game.t, res };
    const name = res.skill ? DATA.skills[res.skill].name : DATA.battle.actions[res.action].name;
    if (res.skill) log = `${name}！ ${res.damage ? `${res.damage}ダメージ` : ''}${res.gaugeAdd < 0 ? ' ゲージがもどった' : ''}`;
    else if (res.matched) log = `${name} せいこう！ ${res.damage}ダメージ`;
    else log = `${DATA.battle.intents[res.intent].name}に ${name}は いまいち…${res.damage ? ` ${res.damage}ダメージ` : ''}`;
  }

  function finish() {
    const reward = battleReward(B, game.rng);
    done = { win: B.result === 'win', reward, t0: game.t };
  }

  return {
    nav: null,
    debug: () => (B && !B.result ? B.intent : null),
    enter(p) {
      P = p;
      game.toasts = [];
      B = createBattle(game.state, p.goblin, p.egg, game.rng);
      anim = null;
      done = null;
      log = p.stolen ? 'ゴブリンが たまごを つかんだ！' : 'ゴブリンが たまごを かかえている！';
    },
    draw(ctx, t) {
      const loc = locationById(P.loc);
      const gob = goblinById(B.goblin);
      const H = game.ui.H;
      const th = loc.theme;
      skyGradient(ctx, H, th.skyTop, th.skyBottom);
      // 地面
      const gy = H * 0.3;
      ctx.fillStyle = th.ground;
      ctx.beginPath();
      ctx.ellipse(W / 2, H * 0.62, W * 0.9, H * 0.36, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.15)';
      ctx.beginPath();
      ctx.ellipse(W / 2, H * 0.36, W * 0.6, 30, 0, 0, Math.PI * 2);
      ctx.fill();
      drawLocationDecor(ctx, loc, 40, gy + 30, 1.1);
      drawLocationDecor(ctx, loc, W - 30, gy + 10, 0.8);

      // 逃走ゲージ
      panel(ctx, 14, 14, W - 28, 62, { r: 20, fill: 'rgba(255,250,240,0.95)' });
      text(ctx, 'にげるまで', 30, 34, { size: 13, color: '#6b5560' });
      const gr = B.gauge / DATA.battle.gaugeMax;
      bar(ctx, 30, 48, W - 90, 16, gr, gr > 0.66 ? '#e8735a' : gr > 0.33 ? '#f2b33d' : '#7cc76a');
      text(ctx, 'にげ', W - 50, 56, { size: 12, color: '#6b5560' });
      text(ctx, `${gob.name}`, W - 30, 34, { size: 13, align: 'right' });

      // ゴブリン（ゲージが進むほど右へ）
      const a = anim ? (t - anim.t0) / ANIM : 1;
      const hitNow = anim && a < 0.6 && anim.res.damage > 0;
      const gx = W * 0.64 + gr * 70 + (anim && anim.res.gaugeAdd > 0 && a < 1 ? Math.sin(a * Math.PI) * 18 : 0);
      const gyy = H * 0.34;
      const fled = B.result === 'lose' && done;
      if (!fled) drawGoblin(ctx, gob, gx, gyy, 120, { t, egg: B.result === 'win' ? null : P.egg.egg, hurt: hitNow || B.result === 'win', shake: hitNow });
      // 体力
      for (let i = 0; i < B.maxHp; i++) {
        ctx.fillStyle = i < B.hp ? '#e8735a' : 'rgba(80,60,60,0.18)';
        ctx.beginPath();
        const hx = gx - (B.maxHp - 1) * 9 + i * 18, hy = gyy + 80;
        ctx.arc(hx - 3.2, hy, 3.8, Math.PI, 0);
        ctx.arc(hx + 3.2, hy, 3.8, Math.PI, 0);
        ctx.lineTo(hx, hy + 8);
        ctx.closePath();
        ctx.fill();
      }
      if (anim && anim.res.damage > 0 && a < 1) {
        text(ctx, `-${anim.res.damage}`, gx + 30, gyy - 60 - a * 30, { size: 28, align: 'center', color: '#e8735a', stroke: '#fff', strokeW: 6 });
        for (let i = 0; i < 5; i++) sparkle(ctx, gx + Math.cos(i * 1.3) * 50 * a, gyy - 10 + Math.sin(i * 1.3) * 40 * a, 8 * (1 - a), '#fff3a8', i);
      }

      // 予告
      if (!B.result) {
        const it = DATA.battle.intents[B.intent];
        const bx = 16, by = H * 0.34 - 60;
        panel(ctx, bx, by, 170, 82, { r: 18, fill: '#fff' });
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.moveTo(bx + 160, by + 30); ctx.lineTo(bx + 186, by + 40); ctx.lineTo(bx + 160, by + 52);
        ctx.fill();
        text(ctx, 'つぎは…', bx + 14, by + 16, { size: 11, color: '#a08f8a' });
        intentIcon(ctx, B.intent, bx + 30, by + 44, 1, t);
        text(ctx, it.name, bx + 54, by + 42, { size: 19 });
        wrapText(ctx, it.say, bx + 14, by + 68, 150, { size: 11, color: '#6b5560' });
      }

      // 相棒
      const px = 100 + (anim && a < 0.5 && anim.res.damage > 0 ? Math.sin(a * Math.PI * 2) * 24 : 0);
      const py = H * 0.56;
      if (B.partner) {
        drawDragonAt(ctx, B.partner.genome, px, py, 150, { t, level: B.partner.level });
        text(ctx, `${B.partner.name} Lv.${B.partner.level}`, 100, py + 62, { size: 12, align: 'center', color: '#4a3b47', stroke: 'rgba(255,255,255,0.8)', strokeW: 4 });
      } else {
        drawExplorer(ctx, px, py + 30, 1.4, t, false);
      }
      // ログ
      panel(ctx, W / 2 - 10, py - 20, W / 2 - 6, 52, { r: 16, fill: 'rgba(255,255,255,0.9)', shadow: false });
      wrapText(ctx, log, W / 2 + 4, py - 1, W / 2 - 36, { size: 13, color: '#4a3b47' });

      // ボタン
      const busy = !!anim || !!B.result;
      const aY = H - 108;
      const bw = (W - 40) / 3;
      Object.entries(DATA.battle.actions).forEach(([id, ac], i) => {
        button(game.ui, 12 + i * (bw + 8), aY, bw, 84, ac.name, () => act(() => battleAct(B, id, game.rng)), { color: ac.color, disabled: busy, size: 20, sub: ac.hint, subSize: 10 });
      });
      if (B.partner) {
        const sk = B.partner.skills;
        const sw = (W - 24 - (sk.length - 1) * 8) / sk.length;
        sk.forEach((sid, i) => {
          const used = B.usedSkills.includes(sid);
          button(game.ui, 12 + i * (sw + 8), aY - 66, sw, 52, DATA.skills[sid].name, () => act(() => battleSkill(B, sid, game.rng)), {
            color: '#8f7ad6', disabled: busy || used, size: 15, sub: used ? 'つかった' : `わざ（1回）`, subSize: 10,
          });
        });
      } else {
        text(ctx, 'あいぼうが いると わざが つかえるよ', W / 2, aY - 34, { size: 12, align: 'center', color: '#6b5560' });
      }

      if (anim && a >= 1) {
        anim = null;
        if (B.result) finish();
      }
      if (done) {
        const k = Math.min(1, (t - done.t0) / 0.4);
        const box = modalFrame(game, 300);
        ctx.globalAlpha = k;
        if (done.win) {
          text(ctx, 'たまごを とりかえした！', W / 2, box.y + 40, { size: 21, align: 'center', color: '#d9573a' });
          drawEgg(ctx, P.egg.egg, W / 2, box.y + 110, 80, { glow: 0.6 + 0.3 * Math.sin(t * 4) });
        } else {
          text(ctx, P.stolen ? 'たまごを もっていかれた…' : 'にげられちゃった…', W / 2, box.y + 40, { size: 20, align: 'center', color: '#6b5560' });
          drawEgg(ctx, P.egg.egg, W / 2, box.y + 110, 80, { silhouette: true });
        }
        iconShard(ctx, W / 2 - 50, box.y + 180, 11);
        text(ctx, `+${done.reward.shards}`, W / 2 - 34, box.y + 180, { size: 17 });
        if (done.reward.stones) {
          iconStone(ctx, W / 2 + 22, box.y + 180, 10, t);
          text(ctx, `+${done.reward.stones}`, W / 2 + 38, box.y + 180, { size: 17 });
        }
        ctx.globalAlpha = 1;
        button(game.ui, box.x + 30, box.y + 220, box.w - 60, 56, 'つづける', () => {
          P.ret.onBattleEnd({ win: done.win, egg: P.egg, stolen: P.stolen, reward: done.reward });
          game.go('explore');
        }, { color: '#7cc76a' });
      }
    },
  };
}
