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
    panel(ctx, (W - w) / 2, y, w, 38, { r: 19, fill: 'rgba(12,13,17,0.92)', stroke: 'rgba(217,162,78,0.4)', shadow: false });
    text(ctx, tt.msg, W / 2, y + 19, { size: 14, align: 'center', color: C.text, maxW: w - 14 });
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
  if (LAYOUT.on) layoutReset();
  try {
    if (game.scene) game.scene.draw(ui.ctx, game.t, dt);
  } catch (e) {
    console.error(e);
  }
  drawToasts(ui.ctx);
  requestAnimationFrame(frame);
}

document.addEventListener('visibilitychange', () => { if (document.hidden) game.save(); });
window.addEventListener('pagehide', () => game.save());

// ホーム画面用アイコンもコードで描く
function makeIcon() {
  try {
    const c = document.createElement('canvas');
    c.width = c.height = 180;
    const ctx = c.getContext('2d');
    const g = ctx.createLinearGradient(0, 0, 0, 180);
    g.addColorStop(0, '#2a3440');
    g.addColorStop(1, '#4a5a48');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 180, 180);
    drawEgg(ctx, 'forest_common', 130, 112, 60, {});
    drawDragonAt(ctx, { lineage: 'quad', horns: 'branch', wings: 'leaf', fins: 'mane', tail: 'leaf', pattern: 'spots', ornament: 'none', color: 'moss' }, 78, 92, 150, { t: 0.4 });
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
