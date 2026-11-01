// キャラクターの事前描画（性能のため）
// - 骨組みの投影・グラデーション・影の計算は毎フレームやらない。向き（16方向）× 動きのコマごとに、
//   オフスクリーンのキャンバスへ1回だけ描いて保存し、あとは貼るだけにする
// - 必要になったときに作り、使われないものは古い順に捨てる（画素数とまい数に上限）
// - 1フレームに新しく作る数にも上限を設け、超えたら近いコマで代用する（向きを変えた瞬間に固まらない）
export const DIRS = 16;
const TAU = Math.PI * 2;

const cache = new Map(); // key -> { cv, px, family }
let pixels = 0;
let maxPixels = 16e6;
const MAX_SPRITES = 900;
const BUILD_MS = 4; // 1フレームで新しい絵を作るのに使う時間の上限（超えた分は近いコマで代用し、次のフレームで作る）
let built = 0;
let builtMs = 0;
const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

// 計測用（?debug=1 で表示）
export const stats = { draws: 0, builds: 0, sprites: 0, mpx: 0 };

export function beginSpriteFrame() {
  built = 0;
  builtMs = 0;
  stats.draws = 0;
  stats.builds = 0;
}

export function setSpriteBudget(mpx) { maxPixels = mpx * 1e6; trim(); }

// 向きを16方向にまとめる
export function dirOf(yaw) {
  const i = Math.round(((yaw % TAU) + TAU) % TAU / (TAU / DIRS)) % DIRS;
  return i;
}
export const yawOfDir = (i) => (i * TAU) / DIRS;

// 画面上の大きさを、4段で1オクターブの段に丸める（向きと同じく、作る絵の数を抑える）
export function quantScale(k) {
  const q = Math.pow(2, Math.round(Math.log2(Math.max(0.05, k)) * 4) / 4);
  return Math.min(q, 6);
}

// いまの変換での、論理座標1あたりの実画素数
export function devScale(ctx) {
  const m = ctx.getTransform();
  return Math.hypot(m.a, m.b);
}

// ループする動きのコマ。rate は1周の角速度（ラジアン/秒）、n はコマ数
// 返す t は、そのコマの時刻（描くときに使う）。frac は次のコマまでの割合
export function frameOf(t, rate, n) {
  const u = ((t * rate) / TAU) * n;
  const f = Math.floor(u);
  const i = ((f % n) + n) % n;
  return { i, frac: u - f, tOf: (j) => ((((j % n) + n) % n) / n) * (TAU / rate) };
}

function trim() {
  while ((pixels > maxPixels || cache.size > MAX_SPRITES) && cache.size) {
    const k = cache.keys().next().value;
    const e = cache.get(k);
    pixels -= e.px;
    cache.delete(k);
  }
  stats.sprites = cache.size;
  stats.mpx = pixels / 1e6;
}

function lookup(key) {
  const e = cache.get(key);
  if (!e) return null;
  cache.delete(key); // 使ったものを新しい側へ
  cache.set(key, e);
  return e;
}

// 作る（予算を超えたら null）
function build(key, wU, hU, q, render, force) {
  if (!force && builtMs >= BUILD_MS) return null;
  const t0 = now();
  if (typeof document === 'undefined') return null;
  const cv = document.createElement('canvas');
  cv.width = Math.max(1, Math.ceil(wU * q));
  cv.height = Math.max(1, Math.ceil(hU * q));
  const c = cv.getContext('2d');
  c.setTransform(q, 0, 0, q, 0, 0);
  render(c);
  const e = { cv, px: cv.width * cv.height };
  cache.set(key, e);
  pixels += e.px;
  built++;
  builtMs += now() - t0;
  stats.builds++;
  trim();
  return e;
}

// 事前描画した絵を貼る
// spec: {
//   base: 種類と見た目のキー（向き・コマ以外）, dir, frame, n（コマ数）, k（画面の1単位あたりの実画素）,
//   box: [x0, y0, x1, y1]（図の単位。原点が (x, y)）, unit（図の1単位が論理座標でいくつか）,
//   render(c, frameIndex)（原点を box の左上からずらした所に描く。c はすでに拡大済み）, fade（次のコマを重ねる割合）
// }
export function drawSprite(ctx, x, y, spec) {
  const { box, unit } = spec;
  const q = quantScale(spec.k * unit);
  const wU = box[2] - box[0], hU = box[3] - box[1];
  const keyOf = (fr) => `${spec.base}|${spec.dir}|${fr}|${q}`;
  const get = (fr, force) => {
    const key = keyOf(fr);
    return lookup(key) || build(key, wU, hU, q, (c) => { c.translate(-box[0], -box[1]); spec.render(c, fr); }, force);
  };
  let e = get(spec.frame, false);
  if (!e) {
    // 予算切れ：近いコマを探して代用する。なければ作る
    for (let d = 1; d < spec.n && !e; d++) e = lookup(keyOf((spec.frame + d) % spec.n)) || lookup(keyOf((spec.frame - d + spec.n) % spec.n));
    // それもなければ、となりの向きの同じコマ（向きを変えた直後）
    for (let d = 1; d <= 2 && !e; d++) {
      for (const dd of [d, -d]) {
        if (e) break;
        e = lookup(`${spec.base}|${(spec.dir + dd + DIRS) % DIRS}|${spec.frame}|${q}`);
      }
    }
    // となりの大きさの段（奥行きが変わった直後。貼るときに拡大縮小されるので見た目はほぼ同じ）
    for (const qq of [q * 1.1892, q / 1.1892]) {
      if (e) break;
      e = lookup(`${spec.base}|${spec.dir}|${spec.frame}|${quantScale(qq)}`);
    }
    if (!e) e = get(spec.frame, true);
  }
  const dx = x + box[0] * unit, dy = y + box[1] * unit, dw = wU * unit, dh = hU * unit;
  ctx.drawImage(e.cv, dx, dy, dw, dh);
  stats.draws++;
  if (spec.fade > 0.08 && spec.n > 1) {
    const e2 = lookup(keyOf((spec.frame + 1) % spec.n));
    if (e2) {
      const a = ctx.globalAlpha;
      ctx.globalAlpha = a * spec.fade;
      ctx.drawImage(e2.cv, dx, dy, dw, dh);
      ctx.globalAlpha = a;
      stats.draws++;
    } else if (builtMs < BUILD_MS) get((spec.frame + 1) % spec.n, false);
  }
}

// 静止した絵（木・岩・茂みなど）。key と大きさの段だけで保存する
export function drawStatic(ctx, x, y, base, box, unit, render) {
  drawSprite(ctx, x, y, { base, dir: 0, frame: 0, n: 1, k: devScale(ctx), box, unit, render: (c) => render(c) });
}

export function clearSprites() { cache.clear(); pixels = 0; trim(); }
