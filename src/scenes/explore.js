// 探索: 左下の仮想スティックで自由に歩く。斜め上からの見下ろしで、奥ほど小さく見える
import { DATA, locationById, goblinById } from '../data.js';
import { W } from '../ui.js';
import { text, panel, button, rr, drawEgg, iconShard, iconStone, sparkle, shadowEllipse, C, textBox, measure, drawStick, tagOnField } from '../draw.js';
import { drawGoblin, drawExplorer } from '../figures.js';
import { drawDragonAt } from '../dragon.js';
import { generateField, moveCircle, rollEgg, reduceHatch, addEggToStorage, randInt, makeRng, genomeOf, updateGoblins } from '../logic.js';
import { turnToward } from '../rig.js';
import { modalFrame, modalTitle } from './common.js';

const TAU = Math.PI * 2;
export const BATTLE_ZOOM = 1.28;
// キャラを見下ろす角度（フィールドの見下ろしに合わせる）
const PITCH = 0.5;

export { drawExplorer };

export function createExplore(game) {
  let S = null;

  // ---------- 投影（奥ほど小さく、上に） ----------
  // zoom はバトルのときにカメラだけ少し寄るのに使う
  function proj(wx, wy) {
    const dy = Math.max(-600, wy - S.cam.y);
    const s = 1 / (1 + dy / 1100);
    const z = S.zoom;
    return { x: W / 2 + (wx - S.cam.x) * s * z, y: S.anchorY - dy * 0.55 * s * z, s: s * z };
  }

  function start(locId) {
    const rng = makeRng((Date.now() ^ (Math.random() * 1e9)) >>> 0);
    const st = game.state;
    const field = generateField(st, locId, rng);
    const decor = [];
    for (let i = 0; i < 260; i++) decor.push({ x: rng() * field.w, y: rng() * field.d, k: rng(), kind: rng() < 0.7 ? 'tuft' : 'pebble' });
    const weather = [];
    for (let i = 0; i < 70; i++) weather.push({ x: rng() * W, y: rng() * 900, v: 0.5 + rng(), p: rng() * TAU });
    S = {
      loc: locId, field, decor, weather, rng,
      p: { x: field.start.x, y: field.start.y, face: 1, yaw: Math.PI / 2, walking: false, running: false },
      cam: { x: field.start.x, y: field.start.y }, zoom: 1, foe: null, actors: null,
      trail: [], bag: [], shards: 0, stones: 0, anchorY: 500,
      t0: game.t, msg: null, summary: false, flash: 0, pending: null, foundTracks: new Set(),
    };
    reduceHatch(st, DATA.explore.hatchReduceOnDepart);
    st.stats.trips++;
    game.save();
    say('スティックで歩こう。卵の巣や宝箱を探します');
  }

  function say(str) { S.msg = { str, t: game.t }; }

  function commit() {
    const st = game.state;
    let over = 0;
    for (const egg of S.bag) if (!addEggToStorage(st, egg)) over++;
    st.shards += S.shards;
    st.stones += S.stones;
    game.save();
    if (over) game.toast(`卵があふれたので、かけら${over * DATA.base.overflowShards}個に替えました`);
    S = null;
    game.go('home');
  }

  function addEgg(egg) {
    if (S.bag.length >= DATA.explore.bagMax) { S.shards += DATA.base.overflowShards; say('かごがいっぱい。かけらに替えました'); return false; }
    S.bag.push(egg);
    return true;
  }

  function touch(it) {
    const E = DATA.explore;
    it.taken = true;
    if (it.kind === 'nest') {
      if (addEgg(it.egg)) say(`${DATA.eggs[it.egg.egg].name}を見つけた`);
    } else if (it.kind === 'chest') {
      const n = randInt(S.rng, ...E.chestShards);
      S.shards += n;
      let msg = `宝箱から星のかけら${n}個`;
      if (S.rng() < E.chestStoneChance) { S.stones++; msg += 'とぬくもり石'; }
      say(msg);
    } else if (it.kind === 'spring') {
      reduceHatch(game.state, E.springReduceSec);
      game.save();
      say(`泉の湯気で、巣の卵が${E.springReduceSec / 60}分早まった`);
    }
  }

  function startBattle(g, advantage) {
    g.done = true;
    S.foe = g;
    // おたがいに相手の方を向く
    g.ai.yaw = Math.atan2(S.p.y - g.y, S.p.x - g.x);
    S.p.yaw = Math.atan2(g.y - S.p.y, g.x - S.p.x);
    g.face = g.x < S.p.x ? 1 : -1;
    S.p.face = g.x < S.p.x ? -1 : 1;
    S.p.walking = false;
    S.p.running = false;
    g.ai.moving = false;
    g.ai.running = false;
    S.pending = { goblin: g.goblin, advantage, gid: g.id };
    S.flash = 0.01;
  }

  // バトル中のカメラ：プレイヤーとゴブリンの間に寄る
  function battleCam(dt, zoom) {
    const fx = S.foe ? (S.p.x + S.foe.x) / 2 : S.p.x, fy = S.foe ? (S.p.y + S.foe.y) / 2 : S.p.y;
    const k = Math.min(1, dt * 4);
    S.cam.x += (fx - S.cam.x) * k;
    S.cam.y += (fy - S.cam.y) * k;
    S.zoom += (zoom - S.zoom) * k;
  }

  function applyResult(res) {
    if (!res) return;
    S.shards += res.shards;
    S.stones += res.stones;
    for (let i = 0; i < res.eggs; i++) addEgg(rollEgg(game.state, S.loc, S.rng));
    if (res.steal && S.bag.length) {
      S.bag.pop();
      say('卵を1つ奪われてしまった');
    } else if (res.eggs) say(res.grade === 'great' ? '大成功。卵を2つ取り返した' : '卵を取り返した');
    if (res.grade !== 'fail') game.state.stats.wins++;
    game.save();
  }

  function update(dt) {
    const E = DATA.explore;
    const f = S.field;
    if (S.summary) return;
    if (S.flash > 0) {
      S.flash += dt;
      battleCam(dt, BATTLE_ZOOM);
      if (S.flash > 0.7) {
        const pd = S.pending;
        S.flash = 0;
        S.pending = null;
        game.go('battle', { goblin: pd.goblin, advantage: pd.advantage, from: 'explore' });
      }
      return;
    }
    const H = game.ui.H;
    const stick = S.stick || { x: 0, y: 0 };
    const kd = game.ui.keyDir();
    let mx = stick.x + kd.x, my = stick.y + kd.y;
    const m = Math.hypot(mx, my);
    if (m > 1) { mx /= m; my /= m; }
    S.p.walking = m > 0.15;
    S.p.running = m > E.runStick;
    if (S.p.walking) {
      const np = moveCircle(f, S.p, mx * E.speed * dt, -my * E.speed * dt, E.playerR);
      S.p.x = np.x; S.p.y = np.y;
      // 向きは進む方向へなめらかに回る（止まったら直前の向きのまま）
      S.p.yaw = turnToward(S.p.yaw, Math.atan2(-my, mx), 10 * dt);
      S.p.face = Math.cos(S.p.yaw) >= 0 ? 1 : -1;
      const last = S.trail[0];
      if (!last || Math.hypot(last.x - S.p.x, last.y - S.p.y) > 4) {
        const yaw = last ? Math.atan2(S.p.y - last.y, S.p.x - last.x) : S.p.yaw;
        S.trail.unshift({ x: S.p.x, y: S.p.y, face: S.p.face, yaw });
        if (S.trail.length > 80) S.trail.pop();
      }
    }
    // カメラはキャラを追う
    S.cam.x += (S.p.x - S.cam.x) * Math.min(1, dt * 5);
    S.cam.y += (S.p.y - S.cam.y) * Math.min(1, dt * 5);
    S.zoom += (1 - S.zoom) * Math.min(1, dt * 3);
    S.anchorY = H * 0.66;
    // 拾う
    for (const it of f.items) if (!it.taken && Math.hypot(it.x - S.p.x, it.y - S.p.y) < 34) touch(it);
    // 足跡に気づく
    for (const tr of f.tracks) {
      const g = f.goblins[tr.gob];
      if (g && !g.noticed && !g.done && Math.hypot(tr.x - S.p.x, tr.y - S.p.y) < E.trackR) {
        g.noticed = true;
        say(`${goblinById(g.goblin).name}の足跡だ。先に気づいたので有利に戦える`);
      }
    }
    // ゴブリン：見回り → 気づく → 追跡 → 見失う → 戻る。触れたらバトル
    const res = updateGoblins(f, S.p, dt, S.rng);
    for (const ev of res.events) {
      ev.g.bubble = { kind: ev.kind, t: game.t };
      if (ev.kind === 'notice' && !S.warned) { S.warned = true; say('気づかれた。走って逃げるか、川や崖の向こうへ行こう'); }
      if (ev.kind === 'giveup') say('ゴブリンはあきらめた');
    }
    if (res.contact) {
      if (res.advantage && !res.contact.noticed) say('気づかれる前に近づいた。有利に戦える');
      startBattle(res.contact, res.advantage);
    }
  }

  // ---------- 描画 ----------
  function drawBackground(ctx, theme, t) {
    const H = game.ui.H;
    const hz = proj(S.cam.x, S.cam.y + 1150).y;
    const sky = ctx.createLinearGradient(0, 0, 0, hz + 20);
    sky.addColorStop(0, theme.skyTop);
    sky.addColorStop(1, theme.skyBottom);
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H);
    // 奥の層（ゆっくり動く）
    const farX = -S.cam.x * 0.12;
    ctx.fillStyle = theme.far;
    ctx.beginPath();
    ctx.moveTo(0, H);
    for (let i = -1; i <= 8; i++) {
      const x = ((i * 70 + farX) % 560 + 560) % 560 - 70;
      ctx.lineTo(x, hz - 60 - ((i * 37) % 50));
      ctx.lineTo(x + 35, hz - 30);
    }
    ctx.lineTo(W, hz);
    ctx.lineTo(W, H);
    ctx.closePath();
    ctx.fill();
    if (S.loc === 'volcano') {
      const vx = W * 0.7 + farX * 0.5;
      ctx.fillStyle = '#9a7670';
      ctx.beginPath();
      ctx.moveTo(vx - 120, hz); ctx.lineTo(vx - 24, hz - 120); ctx.lineTo(vx + 24, hz - 120); ctx.lineTo(vx + 120, hz);
      ctx.fill();
      const gl = ctx.createRadialGradient(vx, hz - 120, 2, vx, hz - 120, 40);
      gl.addColorStop(0, 'rgba(255,120,50,0.7)');
      gl.addColorStop(1, 'rgba(255,120,50,0)');
      ctx.fillStyle = gl;
      ctx.fillRect(vx - 40, hz - 160, 80, 80);
    }
    if (S.loc === 'sea') {
      ctx.fillStyle = '#7aa4bc';
      ctx.fillRect(0, hz - 34, W, 40);
      ctx.strokeStyle = 'rgba(255,255,255,0.45)';
      ctx.lineWidth = 1.5;
      for (let i = 0; i < 6; i++) {
        const y = hz - 30 + i * 6;
        const off = (t * 12 + i * 40) % 60;
        ctx.beginPath();
        for (let x = -60 + off; x < W; x += 60) { ctx.moveTo(x, y); ctx.lineTo(x + 24, y); }
        ctx.stroke();
      }
    }
    // 中間の層
    const midX = -S.cam.x * 0.35;
    ctx.fillStyle = theme.mid;
    ctx.beginPath();
    ctx.moveTo(0, H);
    for (let x = -40; x <= W + 40; x += 20) {
      const wx = x - midX;
      ctx.lineTo(x, hz - 14 - Math.abs(Math.sin(wx * 0.021)) * 22 - Math.sin(wx * 0.007) * 8);
    }
    ctx.lineTo(W, H);
    ctx.closePath();
    ctx.fill();
  }

  function quad(ctx, x0, y0, x1, y1) {
    const a = proj(x0, y0), b = proj(x1, y0), c = proj(x1, y1), d = proj(x0, y1);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.lineTo(c.x, c.y); ctx.lineTo(d.x, d.y);
    ctx.closePath();
  }

  function drawGround(ctx, theme, t) {
    const f = S.field;
    const y0 = S.cam.y - 400, y1 = Math.min(f.d + 300, S.cam.y + 1150);
    // 外側（歩けない）
    quad(ctx, -800, y0, f.w + 800, y1);
    ctx.fillStyle = theme.groundDark;
    ctx.fill();
    // 地面（奥へ向かって暗く）
    for (let y = Math.floor(y0 / 120) * 120; y < Math.min(f.d, y1); y += 120) {
      quad(ctx, 0, Math.max(0, y), f.w, Math.min(f.d, y + 120));
      ctx.fillStyle = (Math.floor(y / 120) % 2) ? theme.ground : shadeMix(theme.ground, theme.groundDark, 0.15);
      ctx.fill();
    }
    // 奥のはて
    if (f.d < y1) {
      quad(ctx, -800, f.d, f.w + 800, y1);
      ctx.fillStyle = theme.far;
      ctx.fill();
    }
    // 草や小石
    for (const d of S.decor) {
      if (d.y < y0 || d.y > y1) continue;
      const p = proj(d.x, d.y);
      if (p.x < -20 || p.x > W + 20) continue;
      if (d.kind === 'tuft') {
        ctx.strokeStyle = shadeMix(theme.ground, '#ffffff', 0.15 + d.k * 0.1);
        ctx.lineWidth = 1.5 * p.s;
        ctx.beginPath();
        for (let k = -1; k <= 1; k++) { ctx.moveTo(p.x + k * 3 * p.s, p.y); ctx.lineTo(p.x + k * 5 * p.s, p.y - (7 + d.k * 4) * p.s); }
        ctx.stroke();
      } else {
        ctx.fillStyle = shadeMix(theme.groundDark, '#000000', 0.12);
        ctx.beginPath();
        ctx.ellipse(p.x, p.y, 4 * p.s, 2.2 * p.s, 0, 0, TAU);
        ctx.fill();
      }
    }
    // 川（平ら）と橋
    for (const b of f.bands) {
      if (b.y1 < y0 || b.y0 > y1) continue;
      if (b.type === 'river') {
        quad(ctx, -800, b.y0, f.w + 800, b.y1);
        const pa = proj(0, b.y1), pb = proj(0, b.y0);
        const g = ctx.createLinearGradient(0, pa.y, 0, pb.y);
        g.addColorStop(0, shadeMix(theme.water, '#000000', 0.18));
        g.addColorStop(1, theme.water);
        ctx.fillStyle = g;
        ctx.fill();
        ctx.strokeStyle = S.loc === 'volcano' ? 'rgba(255,220,150,0.55)' : 'rgba(255,255,255,0.45)';
        ctx.lineWidth = 1.5;
        for (let i = 0; i < 4; i++) {
          const wy = b.y0 + ((i + 0.5) * (b.y1 - b.y0)) / 4;
          const off = (t * 30 + i * 50) % 80;
          for (let x = -80 + off; x < f.w; x += 80) {
            const a = proj(x, wy), c = proj(x + 30, wy);
            ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(c.x, c.y); ctx.stroke();
          }
        }
        for (const gp of b.gaps) {
          quad(ctx, gp.x0 + 10, b.y0 - 8, gp.x1 - 10, b.y1 + 8);
          ctx.fillStyle = '#a8825a';
          ctx.fill();
          ctx.strokeStyle = '#5e4630';
          ctx.lineWidth = 1.5;
          ctx.stroke();
          for (let y = b.y0; y < b.y1; y += 14) {
            const a = proj(gp.x0 + 10, y), c = proj(gp.x1 - 10, y);
            ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(c.x, c.y); ctx.stroke();
          }
        }
      } else if (b.type === 'cliff') {
        // 崖の上面（坂の部分は明るい）
        quad(ctx, -800, b.y0, f.w + 800, b.y1);
        ctx.fillStyle = theme.cliff;
        ctx.fill();
        for (const gp of b.gaps) {
          quad(ctx, gp.x0, b.y0 - 10, gp.x1, b.y1 + 10);
          ctx.fillStyle = theme.path;
          ctx.fill();
        }
      }
    }
    // 足跡
    for (const tr of f.tracks) {
      if (tr.y < y0 || tr.y > y1) continue;
      const g = f.goblins[tr.gob];
      if (!g || g.done) continue;
      const p = proj(tr.x, tr.y);
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.scale(p.s, p.s * 0.55);
      ctx.rotate(-tr.ang);
      ctx.fillStyle = g.noticed ? 'rgba(200,120,30,0.8)' : 'rgba(60,44,30,0.42)';
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.ellipse(side * 3, side * 6, 7, 4, 0, 0, TAU);
        ctx.fill();
        for (let k = -1; k <= 1; k++) { ctx.beginPath(); ctx.arc(8 + side * 3, side * 6 + k * 3, 1.5, 0, TAU); ctx.fill(); }
      }
      ctx.restore();
    }
  }

  function shadeMix(a, b, k) {
    const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
    const ch = (s) => Math.round(((pa >> s) & 255) * (1 - k) + ((pb >> s) & 255) * k);
    return `rgb(${ch(16)},${ch(8)},${ch(0)})`;
  }

  function drawObstacle(ctx, theme, o, p) {
    const s = p.s * (o.r / 26);
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.scale(s, s);
    shadowEllipse(ctx, 4, 2, 30, 9, 0.35);
    ctx.lineJoin = 'round';
    if (theme.obstacle === 'tree') {
      ctx.fillStyle = theme.obTrunk;
      rr(ctx, -6, -30, 12, 32, 3);
      ctx.fill();
      const lay = [[-34, -18, 34, -70], [-28, -46, 28, -96], [-20, -72, 20, -118]];
      for (const [x0, y0, x1, yt] of lay) {
        ctx.fillStyle = theme.obDark;
        ctx.beginPath();
        ctx.moveTo(x0, y0); ctx.lineTo(0, yt); ctx.lineTo(x1, y0);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = theme.obMain;
        ctx.beginPath();
        ctx.moveTo(x0 + 4, y0 - 4); ctx.lineTo(0, yt + 2); ctx.lineTo(x1 * 0.2, y0 - 6);
        ctx.closePath();
        ctx.fill();
      }
    } else if (theme.obstacle === 'rock') {
      ctx.fillStyle = theme.obDark;
      ctx.beginPath();
      ctx.moveTo(-32, 2); ctx.lineTo(-26, -28); ctx.lineTo(-4, -46 - o.v * 10); ctx.lineTo(22, -34); ctx.lineTo(34, 2);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = theme.obMain;
      ctx.beginPath();
      ctx.moveTo(-24, -4); ctx.lineTo(-18, -28); ctx.lineTo(-4, -42 - o.v * 10); ctx.lineTo(6, -20); ctx.lineTo(0, -4);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = 'rgba(160,200,190,0.35)';
      ctx.beginPath();
      ctx.ellipse(10, -6, 10, 4, 0, 0, TAU);
      ctx.fill();
    } else {
      ctx.fillStyle = theme.obDark;
      ctx.beginPath();
      ctx.moveTo(-30, 2); ctx.lineTo(-16, -56); ctx.lineTo(-4, -40); ctx.lineTo(8, -72 - o.v * 14); ctx.lineTo(30, 2);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = theme.obMain;
      ctx.beginPath();
      ctx.moveTo(-20, -2); ctx.lineTo(-12, -46); ctx.lineTo(-2, -34); ctx.lineTo(4, -58 - o.v * 12); ctx.lineTo(10, -2);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,120,50,0.6)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-6, -4); ctx.lineTo(-2, -18); ctx.lineTo(4, -28);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawBush(ctx, theme, p, v) {
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.scale(p.s, p.s);
    shadowEllipse(ctx, 0, 2, 30, 8, 0.35);
    for (const [ox, oy, r, dark] of [[-16, -12, 18, 1], [14, -12, 18, 1], [0, -22, 20, 0], [-10, -8, 14, 0], [12, -6, 13, 0]]) {
      ctx.fillStyle = dark ? shadeMix(theme.bush, '#000000', 0.22) : theme.bush;
      ctx.beginPath();
      ctx.arc(ox + v * 4, oy, r, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawCliffFace(ctx, theme, b) {
    const f = S.field;
    // 手前側の切り立った面（坂の部分は切れている）
    const xs = [];
    let x = -800;
    for (const gp of b.gaps) { xs.push([x, gp.x0]); x = gp.x1; }
    xs.push([x, f.w + 800]);
    for (const [x0, x1] of xs) {
      const a = proj(x0, b.y0), c = proj(x1, b.y0);
      const h = 34 * a.s;
      const g = ctx.createLinearGradient(0, a.y - h, 0, a.y);
      g.addColorStop(0, shadeMix(theme.cliff, '#ffffff', 0.1));
      g.addColorStop(1, shadeMix(theme.cliff, '#000000', 0.3));
      ctx.fillStyle = g;
      ctx.fillRect(a.x, a.y - h, c.x - a.x, h);
      ctx.strokeStyle = 'rgba(40,30,20,0.25)';
      ctx.lineWidth = 1;
      for (let k = Math.ceil(x0 / 30) * 30; k < x1; k += 30) {
        const q = proj(k, b.y0);
        ctx.beginPath(); ctx.moveTo(q.x, q.y - h); ctx.lineTo(q.x + 4, q.y); ctx.stroke();
      }
    }
  }

  function drawItem(ctx, it, p, t) {
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.scale(p.s, p.s);
    if (it.kind === 'nest') {
      shadowEllipse(ctx, 0, 2, 26, 8, 0.35);
      ctx.fillStyle = '#a07e54';
      ctx.beginPath();
      ctx.ellipse(0, -4, 24, 10, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#6e5236';
      ctx.beginPath();
      ctx.ellipse(0, -7, 16, 5, 0, 0, TAU);
      ctx.fill();
      drawEgg(ctx, it.egg.egg, 0, -22, 30, { shadow: false, wobble: Math.sin(t * 2) * 0.05, glow: 0.3 + 0.2 * Math.sin(t * 3) });
    } else if (it.kind === 'chest') {
      shadowEllipse(ctx, 0, 2, 22, 7, 0.35);
      ctx.fillStyle = '#9a6a3e';
      ctx.strokeStyle = '#4a2e18';
      ctx.lineWidth = 2;
      rr(ctx, -18, -24, 36, 24, 4);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#ad7c4a';
      rr(ctx, -18, -32, 36, 12, 6);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = C.gold;
      ctx.fillRect(-3, -26, 6, 8);
      sparkle(ctx, 14, -36, 4 + Math.sin(t * 4) * 1.5, '#ffe7a0', t);
    } else if (it.kind === 'spring') {
      ctx.fillStyle = '#8a9a96';
      ctx.beginPath();
      ctx.ellipse(0, -2, 34, 13, 0, 0, TAU);
      ctx.fill();
      const g = ctx.createRadialGradient(-6, -6, 2, 0, -2, 28);
      g.addColorStop(0, '#9fd0d0');
      g.addColorStop(1, '#3f7f88');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(0, -3, 27, 9, 0, 0, TAU);
      ctx.fill();
      for (let i = 0; i < 3; i++) {
        const k = (t * 0.5 + i / 3) % 1;
        ctx.fillStyle = `rgba(230,240,240,${0.35 * (1 - k)})`;
        ctx.beginPath();
        ctx.arc(-10 + i * 10, -10 - k * 30, 6 + k * 6, 0, TAU);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  function drawWeather(ctx, t, dt) {
    const H = game.ui.H;
    const kind = locationById(S.loc).weather;
    for (const w of S.weather) {
      if (kind === 'rain') {
        w.y += 620 * w.v * dt; w.x -= 80 * dt;
        ctx.strokeStyle = 'rgba(110,140,170,0.4)';
        ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.moveTo(w.x, w.y); ctx.lineTo(w.x - 3, w.y + 12); ctx.stroke();
      } else if (kind === 'ash') {
        w.y += 30 * w.v * dt; w.x += Math.sin(t + w.p) * 12 * dt;
        ctx.fillStyle = w.p > 5 ? 'rgba(230,110,50,0.75)' : 'rgba(120,108,104,0.45)';
        ctx.fillRect(w.x, w.y, 2.4, 2.4);
      } else {
        w.y += 34 * w.v * dt; w.x += Math.sin(t * 1.4 + w.p) * 22 * dt;
        ctx.save();
        ctx.translate(w.x, w.y);
        ctx.rotate(t * 2 + w.p);
        ctx.fillStyle = w.p > 3 ? 'rgba(160,140,70,0.6)' : 'rgba(110,140,80,0.6)';
        ctx.beginPath();
        ctx.ellipse(0, 0, 4, 2, 0, 0, TAU);
        ctx.fill();
        ctx.restore();
      }
      if (w.y > H) { w.y = -10; w.x = Math.random() * (W + 60); }
      if (w.x < -20) w.x += W + 40;
    }
    if (kind === 'leaves') {
      // 霧
      const g = ctx.createLinearGradient(0, 0, 0, H * 0.5);
      g.addColorStop(0, 'rgba(200,220,210,0)');
      g.addColorStop(1, 'rgba(240,248,244,0.18)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H * 0.5);
    }
  }

  // ゴブリンの頭の上の吹き出し：気づいたら「！」、見失ったら「？」
  function drawBubble(ctx, g, p, t) {
    const st = g.ai.state;
    const mark = st === 'notice' || st === 'chase' ? '！' : st === 'lost' ? '？' : null;
    if (!mark) return;
    const age = g.bubble ? t - g.bubble.t : 1;
    const pop = st === 'notice' ? 1 + Math.max(0, 0.35 - age) * 1.6 : st === 'chase' ? 0.8 : 1;
    const r = (11 * p.s + 3) * pop;
    const bx = p.x, by = p.y - 96 * p.s - r;
    ctx.fillStyle = mark === '！' ? '#c8463a' : '#fbf7ee';
    ctx.strokeStyle = mark === '！' ? '#7a2a22' : '#6e6252';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(bx, by, r, 0, TAU);
    ctx.moveTo(bx - r * 0.35, by + r * 0.8);
    ctx.lineTo(bx, by + r * 1.45);
    ctx.lineTo(bx + r * 0.35, by + r * 0.8);
    ctx.fill();
    ctx.stroke();
    text(ctx, mark, bx, by + 0.5, { size: Math.round(r * 1.25), align: 'center', noHalo: true, color: mark === '！' ? '#fffaf0' : '#3a3026', maxW: r * 2 });
  }

  function drawWorld(ctx, t, dt) {
    const f = S.field;
    const loc = locationById(S.loc);
    const theme = loc.theme;
    drawBackground(ctx, theme, t);
    drawGround(ctx, theme, t);
    const y0 = S.cam.y - 400, y1 = S.cam.y + 1150;
    const objs = [];
    const add = (y, fn) => { if (y > y0 && y < y1) objs.push({ y, fn }); };
    for (const o of f.obstacles) add(o.y, () => { const p = proj(o.x, o.y); if (p.x > -80 && p.x < W + 80) drawObstacle(ctx, theme, o, p); });
    // 端の木や岩（ここから先へは行けない）
    for (let y = Math.floor(y0 / 90) * 90; y < Math.min(y1, f.d + 200); y += 90) {
      for (const x of [-30, f.w + 30]) {
        const o = { x, y, r: 30, v: ((y / 90) % 3) / 3 };
        add(y, () => { const p = proj(o.x, o.y); if (p.x > -80 && p.x < W + 80) drawObstacle(ctx, theme, o, p); });
      }
    }
    for (let x = -60; x < f.w + 60; x += 70) {
      const o = { x, y: f.d + 30, r: 32, v: (x % 3) / 3 };
      add(o.y, () => { const p = proj(o.x, o.y); if (p.x > -80 && p.x < W + 80) drawObstacle(ctx, theme, o, p); });
    }
    for (const b of f.bands) {
      if (b.type === 'bush') {
        for (let x = 10; x < f.w; x += 38) {
          if (b.gaps.some((g) => x > g.x0 - 12 && x < g.x1 + 12)) continue;
          for (const yy of [b.y1 - 12, b.y0 + 18]) add(yy, () => { const p = proj(x, yy); if (p.x > -60 && p.x < W + 60) drawBush(ctx, theme, p, (x * 7) % 3 - 1); });
        }
      } else if (b.type === 'cliff') add(b.y0, () => drawCliffFace(ctx, theme, b));
    }
    for (const it of f.items) if (!it.taken) add(it.y, () => drawItem(ctx, it, proj(it.x, it.y), t));
    const A = S.actors || {};
    for (const g of f.goblins) {
      const isFoe = g === S.foe && (S.flash > 0 || A.showFoe);
      if (g.done && !isFoe) continue;
      add(g.y, () => {
        const p = proj(g.x, g.y);
        const gob = goblinById(g.goblin);
        const size = 60 * p.s;
        const ai = g.ai;
        if (g.noticed && !isFoe) {
          // 足跡に先に気づいたゴブリン：足もとに金の輪
          ctx.strokeStyle = 'rgba(214,170,70,0.85)';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.ellipse(p.x, p.y, 22 * p.s, 22 * p.s * Math.sin(PITCH), 0, 0, TAU);
          ctx.stroke();
        }
        drawGoblin(ctx, gob, p.x, p.y - 0.46 * size * gob.look.size, size, {
          t: t + g.id, yaw: ai.yaw, pitch: PITCH,
          walking: !isFoe && ai.moving && !ai.running, running: !isFoe && ai.moving && ai.running,
          pose: isFoe ? A.foePose : undefined,
        });
        if (!isFoe) drawBubble(ctx, g, p, t);
      });
    }
    if (!A.hide) {
      // 連れているドラゴン（後ろをついてくる）
      const team = game.state.team.filter((k) => game.state.dex[k]);
      team.forEach((key, i) => {
        const tp = S.trail[Math.min(S.trail.length - 1, (i + 1) * 9)] || { x: S.p.x - 30 * (i + 1), y: S.p.y - 20, face: S.p.face };
        add(tp.y, () => {
          const p = proj(tp.x, tp.y);
          const facingFoe = S.foe && (S.flash > 0 || A.showFoe);
          const yaw = facingFoe ? Math.atan2(S.foe.y - tp.y, S.foe.x - tp.x) : (tp.yaw ?? S.p.yaw);
          drawDragonAt(ctx, genomeOf(game.state, key), p.x, p.y, 64 * p.s, { anchor: 'feet', t: t + i, level: game.state.dex[key].level, yaw, pitch: PITCH, walking: S.p.walking && !facingFoe, speed: S.p.walking ? 1.3 : 0.7 });
        });
      });
      add(S.p.y, () => { const p = proj(S.p.x, S.p.y); drawExplorer(ctx, p.x, p.y, p.s * 1.1, t, S.p.walking, S.p.face, A.playerPose, S.p.yaw, { pitch: PITCH, running: S.p.running && S.p.walking }); });
    }
    objs.sort((a, b) => b.y - a.y).forEach((o) => o.fn());
    // 手前の層（速く動く草むら）
    const H = game.ui.H;
    const fx = -S.cam.x * 1.25;
    ctx.fillStyle = shadeMix(theme.groundDark, '#000000', 0.12);
    for (let i = -1; i < 8; i++) {
      const x = ((i * 64 + fx) % 512 + 512) % 512 - 64;
      ctx.beginPath();
      ctx.ellipse(x, H + 6, 46, 26 + (i % 3) * 6, 0, Math.PI, TAU);
      ctx.fill();
    }
    drawWeather(ctx, t, dt);
  }

  function drawHud(ctx, t) {
    const H = game.ui.H;
    const loc = locationById(S.loc);
    // 上の帯
    ctx.fillStyle = C.glass;
    ctx.fillRect(0, 0, W, 64);
    ctx.fillStyle = C.glassLine;
    ctx.fillRect(0, 64, W, 1);
    text(ctx, loc.name, 16, 22, { size: 15, maxW: W - 16 - 120 });
    // 持ち物
    let x = 16;
    for (let i = 0; i < DATA.explore.bagMax; i++) {
      const e = S.bag[i];
      if (e) drawEgg(ctx, e.egg, x + 8, 44, 16, { shadow: false });
      else { ctx.strokeStyle = 'rgba(70,56,40,0.3)'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.ellipse(x + 8, 44, 5.5, 7, 0, 0, TAU); ctx.stroke(); }
      x += 18;
    }
    iconShard(ctx, x + 16, 44, 7);
    text(ctx, String(S.shards), x + 28, 44, { size: 12, maxW: 30 });
    iconStone(ctx, x + 66, 44, 7, t);
    text(ctx, String(S.stones), x + 78, 44, { size: 12, maxW: 24 });
    button(game.ui, W - 100, 10, 86, 44, '帰る', () => { S.summary = true; }, { color: C.slate, size: 15 });
    // 進み具合（右端の細い地図）
    const f = S.field;
    const mx = W - 14, my0 = 80, my1 = Math.min(H * 0.5, 300);
    ctx.fillStyle = 'rgba(250,247,240,0.75)';
    rr(ctx, mx - 5, my0, 10, my1 - my0, 5);
    ctx.fill();
    const mapY = (y) => my1 - (y / f.d) * (my1 - my0);
    for (const it of f.items) if (!it.taken) { ctx.fillStyle = it.kind === 'nest' ? '#8a6a3a' : it.kind === 'chest' ? C.gold : '#3a8a90'; ctx.fillRect(mx - 2 + (it.x / f.w - 0.5) * 6, mapY(it.y) - 1.5, 3, 3); }
    for (const g of f.goblins) if (!g.done && (g.noticed || g.ai.state === 'chase')) { ctx.fillStyle = C.red; ctx.fillRect(mx - 2 + (g.x / f.w - 0.5) * 6, mapY(g.y) - 1.5, 4, 3); }
    ctx.fillStyle = C.text;
    ctx.beginPath();
    ctx.arc(mx, mapY(S.p.y), 3.5, 0, TAU);
    ctx.fill();
    // ひとこと
    if (S.msg && game.t - S.msg.t < 3.2 && !(S.flash > 0)) {
      const a = Math.min(1, (3.2 - (game.t - S.msg.t)) * 2);
      ctx.globalAlpha = a;
      const bw = W - 40;
      panel(ctx, 20, 74, bw - 14, 46, { r: 12, fill: C.glass, stroke: C.glassLine, shadow: false });
      textBox(ctx, S.msg.str, 20 + 14, 74 + 7, bw - 14 - 28, 32, { size: 13, valign: 'middle', align: 'center', maxLines: 2 });
      ctx.globalAlpha = 1;
    }
    // 仮想スティック（左下）
    const stick = game.ui.stick('move', 0, 130, W - 30, H - 130);
    S.stick = stick;
    const rest = { x: 84, y: H - 104 };
    const cx = stick.active ? stick.cx : rest.x, cy = stick.active ? stick.cy : rest.y;
    drawStick(ctx, cx, cy, stick, 52);
  }

  function drawSummary(ctx, t) {
    const back = () => { S.summary = false; };
    const box = modalFrame(game, 360, { onBackdrop: back });
    modalTitle(ctx, box, '拠点に帰りますか');
    const n = S.bag.length;
    const cw = Math.min(54, (box.w - 40) / Math.max(1, n));
    if (n) S.bag.forEach((e, i) => drawEgg(ctx, e.egg, W / 2 + (i - (n - 1) / 2) * cw, box.y + 104, 46, { wobble: Math.sin(t * 2 + i) * 0.05 }));
    else text(ctx, '今回は卵が見つかっていません', W / 2, box.y + 104, { size: 14, align: 'center', color: C.sub, maxW: box.w - 40 });
    const s1 = `星のかけら ${S.shards}個`, s2 = `ぬくもり石 ${S.stones}個`;
    const w1 = measure(ctx, s1, 14), w2 = measure(ctx, s2, 14);
    const rowW = 20 + w1 + 24 + 20 + w2;
    let rx = W / 2 - rowW / 2;
    iconShard(ctx, rx + 8, box.y + 164, 9);
    text(ctx, s1, rx + 20, box.y + 164, { size: 14 });
    rx += 20 + w1 + 24;
    iconStone(ctx, rx + 8, box.y + 164, 8, t);
    text(ctx, s2, rx + 20, box.y + 164, { size: 14 });
    const bw = box.w - 40;
    button(game.ui, box.x + 20, box.y + 200, bw, 56, '拠点に戻る', commit, { color: C.teal, size: 16 });
    button(game.ui, box.x + 20, box.y + 272, bw, 56, 'もう少し探す', back, { color: C.slate, size: 16 });
  }

  // バトルの背景：探索していたフィールドをそのまま映す（暗くする幕は掛けない）
  // o.hide: フィールドのプレイヤーとドラゴンを隠す（バトル側が描くとき）
  // o.showFoe: 出くわしたゴブリンをその場に描く / playerPose, foePose: 勝利・失敗の動き
  function backdrop(ctx, t, dt, o = {}) {
    if (!S) return false;
    battleCam(dt, o.zoom || BATTLE_ZOOM);
    S.anchorY = game.ui.H * (o.anchor || 0.5);
    S.actors = o;
    drawWorld(ctx, t, dt);
    S.actors = null;
    return true;
  }

  // いま画面のどこにプレイヤーとゴブリンがいるか（バトルの開始位置に使う）
  function screenPos() {
    if (!S) return null;
    const p = proj(S.p.x, S.p.y);
    const g = S.foe ? proj(S.foe.x, S.foe.y) : null;
    return { player: p, foe: g };
  }

  return {
    backdrop,
    screenPos,
    enter(params) {
      if (params.resume && S) {
        S.foe = null;
        applyResult(params.result);
        return;
      }
      start(params.loc || 'forest');
    },
    draw(ctx, t, dt) {
      if (!S) { game.go('home'); return; }
      update(dt);
      drawWorld(ctx, t, dt);
      drawHud(ctx, t);
      if (S.flash > 0) {
        // ゴブリンに出くわした：カメラが寄り、明るい輪が広がる（暗くはしない）
        const k = Math.min(1, S.flash / 0.5);
        const fp = S.foe ? proj(S.foe.x, S.foe.y) : { x: W / 2, y: game.ui.H / 2, s: 1 };
        ctx.strokeStyle = `rgba(255,250,235,${0.9 * (1 - k)})`;
        ctx.lineWidth = 6;
        ctx.beginPath();
        ctx.arc(fp.x, fp.y - 30 * fp.s, 20 + k * 260, 0, TAU);
        ctx.stroke();
        if (S.pending) {
          ctx.globalAlpha = Math.min(1, S.flash * 5);
          tagOnField(ctx, 'ゴブリンだ！', W / 2, 88);
          ctx.globalAlpha = 1;
        }
      }
      if (S.summary) drawSummary(ctx, t);
    },
    get state() { return S; },
  };
}
