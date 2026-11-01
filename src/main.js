// 起動・画面切りかえ・メインループ
import { UI, W } from './ui.js';
import { loadState, saveState } from './save.js';
import { makeRng, syncNests } from './logic.js';
import { text, panel, drawEgg } from './draw.js';
import { drawDragonAt } from './dragon.js';
import { createHome } from './scenes/home.js';
import { createSelect } from './scenes/select.js';
import { createExplore } from './scenes/explore.js';
import { createBattleScene } from './scenes/battle.js';
import { createDex } from './scenes/dex.js';

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
game.go('home');
window.__game = game; // テスト用

function drawToasts(ctx) {
  let y = 72;
  for (const tt of game.toasts) {
    const k = game.t - tt.t0;
    if (k > 2.2) continue;
    ctx.globalAlpha = Math.min(1, k * 6, (2.2 - k) * 3);
    ctx.font = 'bold 14px sans-serif';
    const w = Math.min(W - 30, ctx.measureText(tt.msg).width + 44);
    panel(ctx, (W - w) / 2, y, w, 38, { r: 19, fill: '#4a3b47', stroke: false, shadow: false });
    text(ctx, tt.msg, W / 2, y + 19, { size: 14, align: 'center', color: '#fff' });
    ctx.globalAlpha = 1;
    y += 46;
  }
  game.toasts = game.toasts.filter((x) => game.t - x.t0 < 2.2);
}

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  game.t += dt;
  ui.beginFrame();
  try {
    game.scene.draw(ui.ctx, game.t, dt);
  } catch (e) {
    console.error(e);
  }
  drawToasts(ui.ctx);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

document.addEventListener('visibilitychange', () => { if (document.hidden) game.save(); });
window.addEventListener('pagehide', () => game.save());

// ホーム画面用アイコンもコードで描く
function makeIcon() {
  try {
    const c = document.createElement('canvas');
    c.width = c.height = 180;
    const ctx = c.getContext('2d');
    const g = ctx.createLinearGradient(0, 0, 0, 180);
    g.addColorStop(0, '#ffe3c2');
    g.addColorStop(1, '#bfe6c9');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 180, 180);
    drawEgg(ctx, 'forest_common', 130, 112, 60, {});
    drawDragonAt(ctx, { body: 'round', wings: 'leaf', horns: 'antler', tail: 'leafy', pattern: 'spots', color: 'leaf' }, 78, 92, 150, { t: 0.4 });
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
