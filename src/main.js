// 起動・画面切りかえ・メインループ
import { UI, W } from './ui.js';
import { loadState, saveState } from './save.js';
import { makeRng, syncNests } from './logic.js';
import { text, panel, drawEgg, C, LAYOUT, layoutReset } from './draw.js';
import { drawDragonAt } from './dragon.js';
import { createHome } from './scenes/home.js';
import { createSelect } from './scenes/select.js';
import { createExplore } from './scenes/explore.js';
import { createBattleScene, loadBattles } from './scenes/battle.js';
import { createDex } from './scenes/dex.js';
import { beginSpriteFrame, stats as spriteStats, clearSprites } from './sprites.js';

const canvas = document.getElementById('game');
const ui = new UI(canvas);

const game = {
  ui,
  state: loadState(),
  rng: makeRng((Date.now() ^ (Math.random() * 1e9)) >>> 0),
  t: 0,
  scene: null,
  scenes: {},
  toasts: [],
  save() { saveState(this.state); },
  toast(msg) {
    this.toasts = this.toasts.filter((x) => x.msg !== msg);
    this.toasts.push({ msg, t0: this.t });
    if (this.toasts.length > 2) this.toasts.shift();
  },
  go(name, params) {
    this.scene = this.scenes[name];
    this.sceneName = name;
    if (this.scene.enter) this.scene.enter(params || {});
  },
};
syncNests(game.state);

game.scenes.home = createHome(game);
game.scenes.select = createSelect(game);
game.scenes.explore = createExplore(game);
game.scenes.battle = createBattleScene(game);
game.scenes.dex = createDex(game);
window.__game = game; // テスト用
window.__ui = ui;
window.__layout = { LAYOUT, layoutReset };
loadBattles().catch((e) => console.error(e)).finally(() => { game.go('home'); requestAnimationFrame(frame); });

function drawToasts(ctx) {
  let y = 64;
  for (const tt of game.toasts) {
    const k = game.t - tt.t0;
    if (k > 2.2) continue;
    ctx.globalAlpha = Math.min(1, k * 6, (2.2 - k) * 3);
    ctx.font = 'bold 14px sans-serif';
    const w = Math.min(W - 24, ctx.measureText(tt.msg).width + 28);
    panel(ctx, (W - w) / 2, y, w, 38, { r: 19, fill: 'rgba(253,251,246,0.97)', stroke: 'rgba(168,117,31,0.5)', shadow: false });
    text(ctx, tt.msg, W / 2, y + 19, { size: 14, align: 'center', color: C.text, maxW: w - 14 });
    ctx.globalAlpha = 1;
    y += 46;
  }
  game.toasts = game.toasts.filter((x) => game.t - x.t0 < 2.2);
}

// ---------- 性能：FPSの計測・自動で解像度を下げる・?debug=1 で表示 ----------
const DEBUG = /[?&]debug=1\b/.test(location.search);
const perf = { fps: 60, acc: 0, n: 0, slow: 0, fast: 0, ms: 0 };
function measure(dtReal, workMs) {
  perf.acc += dtReal;
  perf.n++;
  perf.ms = perf.ms * 0.9 + workMs * 0.1;
  if (perf.acc < 0.5) return;
  perf.fps = perf.n / perf.acc;
  perf.acc = 0;
  perf.n = 0;
  if (document.hidden) return;
  // 2秒続けて30fpsを切ったら解像度を1段下げる。余裕が続けば戻す
  if (perf.fps < 30) { perf.slow++; perf.fast = 0; } else if (perf.fps > 55) { perf.fast++; perf.slow = 0; } else { perf.slow = 0; perf.fast = 0; }
  const cap = ui.dprCap || 2;
  if (perf.slow >= 4 && cap > 1) { ui.dprCap = Math.max(1, cap - 0.5); ui.resize(); clearSprites(); perf.slow = 0; }
  else if (perf.fast >= 20 && cap < 2 && cap < (window.devicePixelRatio || 1)) { ui.dprCap = Math.min(2, cap + 0.5); ui.resize(); clearSprites(); perf.fast = 0; }
}
function drawDebug(ctx) {
  const lines = [
    `${perf.fps.toFixed(0)} fps  ${perf.ms.toFixed(1)} ms`,
    `描画 ${spriteStats.draws}  作成 ${spriteStats.builds}`,
    `保存 ${spriteStats.sprites}枚 ${spriteStats.mpx.toFixed(1)}M  解像度 ${ui.dpr}`,
  ];
  ctx.font = '11px monospace';
  ctx.fillStyle = 'rgba(20,20,20,0.6)';
  ctx.fillRect(4, ui.H - 52, 200, 48);
  ctx.fillStyle = perf.fps < 30 ? '#ff9a8a' : '#e8ffe0';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  lines.forEach((l, i) => ctx.fillText(l, 9, ui.H - 48 + i * 14));
}

let last = performance.now();
function frame(now) {
  const real = (now - last) / 1000;
  const dt = Math.min(0.05, real);
  last = now;
  game.t += dt;
  const t0 = performance.now();
  beginSpriteFrame();
  ui.beginFrame();
  if (LAYOUT.on) layoutReset();
  try {
    if (game.scene) game.scene.draw(ui.ctx, game.t, dt);
  } catch (e) {
    console.error(e);
  }
  drawToasts(ui.ctx);
  measure(real, performance.now() - t0);
  if (DEBUG) drawDebug(ui.ctx);
  requestAnimationFrame(frame);
}
window.__perf = perf;

document.addEventListener('visibilitychange', () => { if (document.hidden) game.save(); });
window.addEventListener('pagehide', () => game.save());

// ホーム画面用アイコンもコードで描く
function makeIcon() {
  try {
    const c = document.createElement('canvas');
    c.width = c.height = 180;
    const ctx = c.getContext('2d');
    const g = ctx.createLinearGradient(0, 0, 0, 180);
    g.addColorStop(0, '#a9c4cf');
    g.addColorStop(1, '#dfe3d6');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 180, 180);
    drawEgg(ctx, 'forest_common', 130, 112, 60, {});
    drawDragonAt(ctx, { lineage: 'quad', horns: 'branch', wings: 'leaf', fins: 'mane', tail: 'leaf', pattern: 'spots', ornament: 'none', color: 'moss' }, 78, 92, 150, { t: 0.4, live: true });
    const url = c.toDataURL('image/png');
    for (const rel of ['apple-touch-icon', 'icon']) {
      const link = document.createElement('link');
      link.rel = rel;
      link.href = url;
      document.head.appendChild(link);
    }
  } catch (e) {
    /* アイコンが作れなくても遊べる */
  }
}
makeIcon();
