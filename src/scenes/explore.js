// 探索: マスをタップして進み、卵やアイテムを拾う
import { DATA, locationById, goblinById } from '../data.js';
import { W } from '../ui.js';
import { text, panel, button, rr, drawEgg, iconShard, iconStone, sparkle, shadowEllipse, bar, skyGradient } from '../draw.js';
import { drawDragonAt } from '../dragon.js';
import { generateMap, distances, findPath, rollEgg, reduceHatch, addEggToStorage, pickWeighted, partnerInfo } from '../logic.js';
import { modalFrame } from './common.js';
import { drawLocationDecor } from './select.js';

const STEP_TIME = 0.17;

export function drawExplorer(ctx, x, y, s, t, walking) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  shadowEllipse(ctx, 0, 2, 14, 5, 0.22);
  const hop = walking ? -Math.abs(Math.sin(t * 16)) * 4 : 0;
  ctx.translate(0, hop);
  ctx.lineJoin = 'round';
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = '#5b3f3a';
  // リュック
  ctx.fillStyle = '#c98a4a';
  rr(ctx, -15, -30, 12, 18, 5);
  ctx.fill();
  ctx.stroke();
  // からだ
  ctx.fillStyle = '#f2a65a';
  ctx.beginPath();
  ctx.moveTo(-10, 0);
  ctx.quadraticCurveTo(-12, -26, 0, -28);
  ctx.quadraticCurveTo(12, -26, 10, 0);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  // 顔とフード
  ctx.fillStyle = '#ffe2c8';
  ctx.beginPath();
  ctx.arc(0, -36, 11, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#e8735a';
  ctx.beginPath();
  ctx.arc(0, -38, 12, Math.PI * 1.05, Math.PI * 1.95);
  ctx.quadraticCurveTo(4, -56, -4, -54);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#3b2b2b';
  ctx.beginPath();
  ctx.arc(-3.5, -35, 1.7, 0, Math.PI * 2);
  ctx.arc(4, -35, 1.7, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

export function createExplore(game) {
  let S = null;

  function popup(str, c, r, col = '#4a3b47') {
    S.popups.push({ str, c, r, t0: game.t, col });
  }

  function geom() {
    const E = DATA.explore;
    const H = game.ui.H;
    const tw = Math.min(72, (W - 20) / E.cols);
    const th = Math.max(44, Math.min(64, (H - 64 - 140) / E.rows));
    const ox = (W - tw * E.cols) / 2;
    const oy = 78 + Math.max(0, (H - 64 - 140 - th * E.rows) / 2);
    return { tw, th, ox, oy, at: (c, r) => ({ x: ox + c * tw + tw / 2, y: oy + r * th + th * 0.62 }) };
  }

  function enterTile(p) {
    const tile = S.map.tiles[p.r][p.c];
    tile.seen = true;
    S.steps--;
    const it = tile.item;
    if (!it) return;
    tile.item = null;
    let found = it;
    if (it.kind === 'grass') found = it.hidden;
    if (found.kind === 'egg') {
      S.bag.eggs.push(found.egg);
      popup(`${DATA.eggs[found.egg.egg].name}！`, p.c, p.r, '#d9573a');
    } else if (found.kind === 'shards') {
      S.bag.shards += found.n;
      popup(`ほしのかけら +${found.n}`, p.c, p.r, '#c98a1d');
    } else if (found.kind === 'stone') {
      S.bag.stones++;
      popup('ぬくもり石！', p.c, p.r, '#d9573a');
    } else if (found.kind === 'goblin') {
      triggerGoblin(p);
    } else if (found.kind === 'none') {
      popup('なにも ない…', p.c, p.r, '#8c7a76');
    }
  }

  function triggerGoblin(p) {
    const loc = locationById(S.loc);
    S.goblins++;
    S.moving = null;
    S.pendingBattle = { goblin: pickWeighted(loc.goblins, game.rng).id, t0: game.t };
    popup('ゴブリンだ！', p.c, p.r, '#5f8f45');
  }

  function afterMove() {
    const E = DATA.explore;
    reduceHatch(game.state, E.hatchReducePerMove);
    game.save();
    if (!S.pendingBattle && S.goblins < E.maxGoblins && S.steps > 0 && game.rng() < E.goblinRatePerMove) triggerGoblin(S.pos);
    if (!S.pendingBattle && S.steps <= 0) S.summary = 'tired';
  }

  function startBattle() {
    const bag = S.bag;
    let egg, stolen = false;
    if (bag.eggs.length) {
      egg = bag.eggs.splice(Math.floor(game.rng() * bag.eggs.length), 1)[0];
      stolen = true;
    } else egg = rollEgg(game.state, S.loc, game.rng);
    const goblinId = S.pendingBattle.goblin;
    S.pendingBattle = null;
    game.go('battle', { loc: S.loc, goblin: goblinId, egg, stolen, ret: api });
  }

  function commit() {
    const st = game.state;
    let overflow = 0;
    for (const e of S.bag.eggs) if (!addEggToStorage(st, e)) overflow++;
    st.shards += S.bag.shards;
    st.stones += S.bag.stones;
    game.save();
    if (overflow) game.toast(`たまごが いっぱい！ ${overflow}こは かけらに かえたよ`);
    game.go('home');
  }

  function tapTile(c, r) {
    if (S.moving || S.pendingBattle || S.summary) return;
    if (c === S.pos.c && r === S.pos.r) return;
    const reach = Math.min(DATA.explore.maxMove, S.steps);
    const d = distances(S.map, S.pos)[r][c];
    if (d < 0) { game.toast('そこへは いけないよ'); return; }
    if (d > reach) { game.toast(`いちどに ${reach}マスまで すすめるよ`); return; }
    S.moving = { path: findPath(S.map, S.pos, { c, r }), idx: 0, prog: 0, from: { ...S.pos } };
  }

  function update(dt) {
    const m = S.moving;
    if (!m) return;
    m.prog += dt / STEP_TIME;
    while (m.prog >= 1 && S.moving) {
      m.prog -= 1;
      const nx = m.path[m.idx];
      if (nx.c !== S.pos.c) S.flip = nx.c < S.pos.c;
      m.from = nx;
      S.pos = { ...nx };
      enterTile(S.pos);
      m.idx++;
      if (S.pendingBattle) break;
      if (m.idx >= m.path.length) { S.moving = null; afterMove(); }
    }
    if (S.pendingBattle && S.moving) S.moving = null;
  }

  function drawTile(ctx, G, c, r, tile, theme, t) {
    const x = G.ox + c * G.tw, y = G.oy + r * G.th;
    ctx.fillStyle = theme.groundSide;
    rr(ctx, x + 2, y + 6, G.tw - 4, G.th, 12);
    ctx.fill();
    rr(ctx, x + 2, y + 2, G.tw - 4, G.th - 4, 12);
    const g = ctx.createLinearGradient(0, y, 0, y + G.th);
    const base = tile.seen ? theme.path : theme.ground;
    g.addColorStop(0, base);
    g.addColorStop(1, tile.seen ? theme.pathSide : theme.groundSide);
    ctx.fillStyle = g;
    ctx.globalAlpha = 1;
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    rr(ctx, x + 8, y + 5, G.tw - 16, 6, 3);
    ctx.fill();
  }

  function drawTileObject(ctx, G, c, r, tile, loc, t) {
    const p = G.at(c, r);
    const th = loc.theme;
    if (tile.block) {
      drawLocationDecor(ctx, loc, p.x, p.y + 4, Math.min(1, G.th / 58) * (0.85 + tile.var * 0.25));
      return;
    }
    const it = tile.item;
    if (!it) return;
    if (it.kind === 'egg') {
      drawEgg(ctx, it.egg.egg, p.x, p.y - 20, 30, { wobble: Math.sin(t * 3 + c) * 0.08 });
      sparkle(ctx, p.x + 14, p.y - 34, 4 + 2 * Math.sin(t * 5 + r), '#fff', t);
    } else if (it.kind === 'shards') {
      iconShard(ctx, p.x, p.y - 12 + Math.sin(t * 3 + c) * 3, 10);
    } else if (it.kind === 'grass') {
      const sw = Math.sin(t * 2 + c * 1.3 + r) * 0.08;
      ctx.save();
      ctx.translate(p.x, p.y + 2);
      ctx.rotate(sw);
      for (const [ox, h, col] of [[-10, 22, th.grass], [10, 20, th.grass], [0, 28, th.accent]]) {
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.moveTo(ox - 9, 0);
        ctx.quadraticCurveTo(ox - 4, -h, ox, -h - 4);
        ctx.quadraticCurveTo(ox + 4, -h, ox + 9, 0);
        ctx.fill();
      }
      ctx.restore();
      text(ctx, '?', p.x, p.y - 30, { size: 14, align: 'center', color: '#fff', stroke: 'rgba(60,40,40,0.4)', strokeW: 3 });
    }
  }

  function drawSummary(ctx, t) {
    const bag = S.bag;
    const box = modalFrame(game, 330);
    text(ctx, S.summary === 'tired' ? 'つかれた… もどろう' : 'たんけん おしまい', W / 2, box.y + 38, { size: 20, align: 'center' });
    text(ctx, 'みつけたもの', box.x + 24, box.y + 76, { size: 14, color: '#a08f8a' });
    if (!bag.eggs.length) text(ctx, 'たまごは みつからなかった', W / 2, box.y + 120, { size: 14, align: 'center', color: '#8c7a76' });
    const n = bag.eggs.length;
    bag.eggs.forEach((e, i) => drawEgg(ctx, e.egg, W / 2 + (i - (n - 1) / 2) * 52, box.y + 120, 46, { wobble: Math.sin(t * 2 + i) * 0.05 }));
    iconShard(ctx, W / 2 - 70, box.y + 186, 11);
    text(ctx, `× ${bag.shards}`, W / 2 - 52, box.y + 186, { size: 17 });
    iconStone(ctx, W / 2 + 30, box.y + 186, 10, t);
    text(ctx, `× ${bag.stones}`, W / 2 + 48, box.y + 186, { size: 17 });
    text(ctx, 'たんけんの あいだに 巣のたまごも あたたまったよ', W / 2, box.y + 222, { size: 12, align: 'center', color: '#8c7a76' });
    button(game.ui, box.x + 30, box.y + 250, box.w - 60, 56, 'きょてんへ もどる', commit, { color: '#7cc76a' });
  }

  const api = {
    nav: null,
    // 自動テスト用: 状態と、次にタップすると良いマス
    debug() {
      if (!S) return null;
      const G = geom();
      const d = distances(S.map, S.pos);
      const maxR = Math.min(DATA.explore.maxMove, S.steps);
      let best = null;
      for (let r = 0; r < S.map.rows; r++) for (let c = 0; c < S.map.cols; c++) {
        if (d[r][c] <= 0 || d[r][c] > maxR) continue;
        const score = (S.map.tiles[r][c].item ? 10 : 0) + (S.map.tiles[r][c].seen ? 0 : 2) + d[r][c];
        if (!best || score > best.score) best = { score, x: G.ox + c * G.tw + G.tw / 2, y: G.oy + r * G.th + G.th / 2 };
      }
      return { summary: S.summary, busy: !!(S.moving || S.pendingBattle), steps: S.steps, target: best };
    },
    enter(p) {
      if (p && p.loc) {
        const st = game.state;
        reduceHatch(st, DATA.explore.hatchReduceOnDepart);
        st.stats.trips++;
        game.save();
        const map = generateMap(st, p.loc, game.rng);
        S = { loc: p.loc, map, pos: { ...map.start }, steps: DATA.explore.steps, bag: { eggs: [], shards: 0, stones: 0 }, moving: null, goblins: 0, popups: [], pendingBattle: null, summary: null, flip: false, partner: partnerInfo(st) };
        map.tiles[map.start.r][map.start.c].seen = true;
        game.toast('ひかる マスを タップして すすもう');
      }
    },
    onBattleEnd(res) {
      game.state.stats.wins += res.win ? 1 : 0;
      if (res.win) {
        S.bag.eggs.push(res.egg);
        popup('たまごを まもった！', S.pos.c, S.pos.r, '#d9573a');
      } else {
        popup(res.stolen ? 'たまごを とられた…' : 'にげられた…', S.pos.c, S.pos.r, '#6b5560');
      }
      S.bag.shards += res.reward.shards;
      S.bag.stones += res.reward.stones;
      game.save();
      if (S.steps <= 0) S.summary = 'tired';
    },
    draw(ctx, t, dt) {
      if (!S) { game.go('select'); return; }
      update(dt);
      const loc = locationById(S.loc);
      const th = loc.theme;
      const G = geom();
      const H = game.ui.H;
      skyGradient(ctx, H, th.skyTop, th.skyBottom);
      // 地図
      const reach = S.moving || S.pendingBattle || S.summary ? null : distances(S.map, S.pos);
      const maxR = Math.min(DATA.explore.maxMove, S.steps);
      for (let r = 0; r < S.map.rows; r++) {
        for (let c = 0; c < S.map.cols; c++) {
          const tile = S.map.tiles[r][c];
          drawTile(ctx, G, c, r, tile, th, t);
          if (reach && !tile.block && reach[r][c] > 0 && reach[r][c] <= maxR) {
            const x = G.ox + c * G.tw, y = G.oy + r * G.th;
            ctx.strokeStyle = `rgba(255,246,190,${0.65 + 0.3 * Math.sin(t * 4)})`;
            ctx.lineWidth = 3.5;
            rr(ctx, x + 6, y + 6, G.tw - 12, G.th - 12, 10);
            ctx.stroke();
            ctx.fillStyle = 'rgba(255,246,190,0.18)';
            ctx.fill();
          }
          game.ui.hit(G.ox + c * G.tw, G.oy + r * G.th, G.tw, G.th, () => tapTile(c, r));
        }
        for (let c = 0; c < S.map.cols; c++) drawTileObject(ctx, G, c, r, S.map.tiles[r][c], loc, t);
        // 主人公
        let pp = G.at(S.pos.c, S.pos.r);
        if (S.moving) {
          const a = G.at(S.moving.from.c, S.moving.from.r), b = G.at(S.moving.path[S.moving.idx].c, S.moving.path[S.moving.idx].r);
          pp = { x: a.x + (b.x - a.x) * S.moving.prog, y: a.y + (b.y - a.y) * S.moving.prog };
        }
        const rowOfPlayer = Math.round((pp.y - G.oy - G.th * 0.62) / G.th);
        if (rowOfPlayer === r) {
          if (S.partner) drawDragonAt(ctx, S.partner.genome, pp.x - 20, pp.y - 14, 56, { t, level: S.partner.level, flip: S.flip });
          drawExplorer(ctx, pp.x + 6, pp.y, Math.min(1, G.th / 58), t, !!S.moving);
        }
      }
      // ふきだし
      S.popups = S.popups.filter((p) => t - p.t0 < 1.6);
      for (const p of S.popups) {
        const k = (t - p.t0) / 1.6;
        const at = G.at(p.c, p.r);
        ctx.globalAlpha = Math.min(1, (1 - k) * 2);
        text(ctx, p.str, Math.max(70, Math.min(W - 70, at.x)), at.y - 60 - k * 30, { size: 16, align: 'center', color: p.col, stroke: '#fff', strokeW: 5 });
        ctx.globalAlpha = 1;
      }
      // 上のHUD
      panel(ctx, 10, 10, W - 20, 58, { r: 20, fill: 'rgba(255,250,240,0.95)' });
      text(ctx, loc.name, 24, 30, { size: 16 });
      text(ctx, `のこり ${S.steps}歩`, 24, 54, { size: 13, color: '#6b5560' });
      bar(ctx, 98, 49, 80, 10, S.steps / DATA.explore.steps, '#7cc76a');
      drawEgg(ctx, 'forest_common', 216, 40, 26, { shadow: false });
      text(ctx, `${S.bag.eggs.length}`, 232, 40, { size: 16 });
      iconShard(ctx, 270, 40, 10);
      text(ctx, `${S.bag.shards}`, 284, 40, { size: 16 });
      iconStone(ctx, 324, 40, 9, t);
      text(ctx, `${S.bag.stones}`, 338, 40, { size: 16 });
      // 下
      const by = H - 72;
      if (S.partner) text(ctx, `あいぼう: ${S.partner.name} Lv.${S.partner.level}`, 18, by + 26, { size: 12, color: '#6b5560' });
      else text(ctx, 'あいぼう なし', 18, by + 26, { size: 12, color: '#6b5560' });
      button(game.ui, W - 150, by, 134, 52, 'もどる', () => { if (!S.moving && !S.pendingBattle) S.summary = 'manual'; }, { color: '#f2a65a', size: 17 });

      if (S.pendingBattle) {
        const k = t - S.pendingBattle.t0;
        ctx.fillStyle = `rgba(40,60,30,${Math.min(0.5, k * 0.6)})`;
        ctx.fillRect(0, 0, W, H);
        text(ctx, 'ゴブリンが あらわれた！', W / 2, H / 2, { size: 24, align: 'center', color: '#fff', stroke: '#5f8f45', strokeW: 6 });
        game.ui.block();
        if (k > 1.1) startBattle();
      }
      if (S.summary) drawSummary(ctx, t);
    },
  };
  return api;
}
