// ゲームロジック（DOMを使わない処理。node のテストからも呼べる）
import { DATA, part, locationById, goblinById, facilityById, battleById, lineageById } from './data.js';

// ---------- 乱数 ----------
export function makeRng(seed = Date.now()) {
  let a = seed >>> 0;
  return function rng() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function pickWeighted(list, rng, weightOf = (x) => x.w) {
  const total = list.reduce((s, x) => s + Math.max(0, weightOf(x)), 0);
  let r = rng() * total;
  for (const x of list) {
    r -= Math.max(0, weightOf(x));
    if (r < 0) return x;
  }
  return list[list.length - 1];
}

export const randInt = (rng, min, max) => min + Math.floor(rng() * (max - min + 1));
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// ---------- 状態 ----------
export function defaultState(now = Date.now()) {
  const s = {
    v: DATA.version,
    shards: DATA.base.startShards,
    stones: DATA.base.startStones,
    nextUid: 1,
    storage: [],
    nests: [],
    dex: {},
    team: [],
    facilities: {},
    stats: { trips: 0, wins: 0, hatched: 0 },
  };
  for (let i = 0; i < DATA.base.eggSlots; i++) s.nests.push(null);
  const first = newEgg(s, 'first', 'forest');
  s.nests[0] = { egg: first, startAt: now, endAt: now + hatchDuration(s, 'first') * 1000 };
  return s;
}

export function newEgg(state, eggId, loc) {
  return { uid: state.nextUid++, egg: eggId, loc };
}

const isObj = (x) => x && typeof x === 'object' && !Array.isArray(x);
const num = (x, d) => (typeof x === 'number' && Number.isFinite(x) ? x : d);

function cleanEgg(e) {
  if (!isObj(e) || !DATA.eggs[e.egg] || !locationById(e.loc)) return null;
  return { uid: num(e.uid, 0), egg: e.egg, loc: e.loc };
}

const LOOK_SLOTS = ['fins', 'pattern', 'ornament', 'color'];

// 壊れたセーブや古いセーブでも落ちないように整える
export function sanitizeState(raw, now = Date.now()) {
  const s = defaultState(now);
  if (!isObj(raw)) return s;
  s.shards = Math.max(0, Math.floor(num(raw.shards, s.shards)));
  s.stones = Math.max(0, Math.floor(num(raw.stones, s.stones)));
  if (isObj(raw.stats)) for (const k of Object.keys(s.stats)) s.stats[k] = Math.max(0, num(raw.stats[k], 0));
  s.facilities = {};
  if (isObj(raw.facilities)) {
    for (const f of DATA.facilities) {
      const lv = Math.floor(num(raw.facilities[f.id], 0));
      if (lv > 0) s.facilities[f.id] = Math.min(lv, f.maxLevel);
    }
  }
  s.dex = {};
  if (isObj(raw.dex)) {
    for (const [key, d] of Object.entries(raw.dex)) {
      const sp = parseKey(key);
      if (!sp || !isObj(d)) continue;
      const loc = locationById(d.loc) ? d.loc : DATA.locations[0].id;
      const look = {};
      for (const slot of LOOK_SLOTS) {
        const v = isObj(d.look) ? d.look[slot] : null;
        look[slot] = part(slot, v) ? v : locationById(loc).pool[slot][0].id;
      }
      s.dex[key] = {
        level: clamp(Math.floor(num(d.level, 1)), 1, DATA.dragon.maxLevel),
        shiny: !!d.shiny,
        count: Math.max(1, Math.floor(num(d.count, 1))),
        loc,
        at: num(d.at, now),
        look,
      };
    }
  }
  s.team = Array.isArray(raw.team) ? [...new Set(raw.team.filter((k) => typeof k === 'string' && s.dex[k]))].slice(0, DATA.dragon.teamMax) : [];
  s.storage = Array.isArray(raw.storage) ? raw.storage.map(cleanEgg).filter(Boolean).slice(0, DATA.base.storageMax) : [];
  const slots = eggSlots(s);
  s.nests = [];
  for (let i = 0; i < slots; i++) {
    const n = Array.isArray(raw.nests) ? raw.nests[i] : null;
    const egg = isObj(n) ? cleanEgg(n.egg) : null;
    s.nests.push(egg ? { egg, startAt: num(n.startAt, now), endAt: num(n.endAt, now) } : null);
  }
  const maxUid = Math.max(0, ...s.storage.map((e) => e.uid), ...s.nests.filter(Boolean).map((n) => n.egg.uid));
  s.nextUid = Math.max(Math.floor(num(raw.nextUid, 1)), maxUid + 1);
  return s;
}

// ---------- 施設 ----------
export const facilityLevel = (state, id) => state.facilities[id] || 0;

export function facilityBonus(state, type) {
  let sum = 0;
  for (const f of DATA.facilities) if (f.effect.type === type) sum += f.effect.perLevel * facilityLevel(state, f.id);
  return sum;
}

export function facilityCost(state, id) {
  const f = facilityById(id);
  const lv = facilityLevel(state, id);
  return lv >= f.maxLevel ? null : f.cost[lv];
}

export function upgradeFacility(state, id) {
  const cost = facilityCost(state, id);
  if (cost == null || state.shards < cost) return false;
  state.shards -= cost;
  state.facilities[id] = facilityLevel(state, id) + 1;
  syncNests(state);
  return true;
}

export const eggSlots = (state) => DATA.base.eggSlots + facilityBonus(state, 'eggSlots');

export function syncNests(state) {
  while (state.nests.length < eggSlots(state)) state.nests.push(null);
}

// ---------- 孵化 ----------
export function hatchDuration(state, eggId) {
  const base = DATA.rarities[DATA.eggs[eggId].rarity].hatchSec;
  const speed = Math.min(0.8, facilityBonus(state, 'hatchSpeed'));
  return Math.round(base * (1 - speed));
}

export function nestStatus(nest, now = Date.now()) {
  if (!nest) return { empty: true, ready: false, remain: 0, progress: 0 };
  const remain = Math.max(0, (nest.endAt - now) / 1000);
  const total = Math.max(1, (nest.endAt - nest.startAt) / 1000);
  return { empty: false, ready: remain <= 0, remain, progress: Math.min(1, 1 - remain / total) };
}

export function placeEgg(state, slot, storageIdx, now = Date.now()) {
  if (state.nests[slot] || !state.storage[storageIdx]) return false;
  const [egg] = state.storage.splice(storageIdx, 1);
  state.nests[slot] = { egg, startAt: now, endAt: now + hatchDuration(state, egg.egg) * 1000 };
  return true;
}

export function reduceHatch(state, sec) {
  for (const n of state.nests) if (n) n.endAt -= sec * 1000;
}

export function useStone(state, slot, now = Date.now()) {
  const n = state.nests[slot];
  if (!n || state.stones <= 0 || nestStatus(n, now).ready) return false;
  state.stones--;
  n.endAt -= DATA.items.stone.reduceSec * 1000;
  return true;
}

export function addEggToStorage(state, egg) {
  if (state.storage.length >= DATA.base.storageMax) {
    state.shards += DATA.base.overflowShards;
    return false;
  }
  state.storage.push(egg);
  return true;
}

// ---------- ドラゴン ----------
export function rollEgg(state, locId, rng) {
  const loc = locationById(locId);
  return newEgg(state, pickWeighted(loc.eggTable, rng).egg, locId);
}

export function rollGenome(egg, rng) {
  const loc = locationById(egg.loc);
  const rar = DATA.rarities[DATA.eggs[egg.egg].rarity];
  const g = {};
  for (const slot of ['lineage', ...DATA.partSlots]) {
    g[slot] = pickWeighted(loc.pool[slot], rng, (p) => p.w * (p.rare ? rar.rareBoost : 1)).id;
  }
  g.shiny = rng() < rar.shinyChance;
  return g;
}

// 図鑑の1種類 = シルエットを決めるパーツの組
export const dragonKey = (g) => DATA.speciesSlots.map((s) => g[s]).join('.');

export function parseKey(key) {
  if (typeof key !== 'string') return null;
  const ids = key.split('.');
  if (ids.length !== DATA.speciesSlots.length) return null;
  const g = {};
  for (let i = 0; i < ids.length; i++) {
    if (!part(DATA.speciesSlots[i], ids[i])) return null;
    g[DATA.speciesSlots[i]] = ids[i];
  }
  return g;
}

export function addDragon(state, genome, loc, now = Date.now()) {
  const key = dragonKey(genome);
  const d = state.dex[key];
  if (!d) {
    const look = {};
    for (const slot of LOOK_SLOTS) look[slot] = genome[slot];
    state.dex[key] = { level: 1, shiny: !!genome.shiny, count: 1, loc, at: now, look };
    if (state.team.length < DATA.dragon.teamMax) state.team.push(key);
    return { key, isNew: true, level: 1, levelUp: false };
  }
  d.count++;
  const before = d.level;
  d.level = Math.min(DATA.dragon.maxLevel, d.level + 1);
  if (genome.shiny) d.shiny = true;
  return { key, isNew: false, level: d.level, levelUp: d.level > before };
}

export function hatchNest(state, slot, rng, now = Date.now()) {
  const n = state.nests[slot];
  if (!n || !nestStatus(n, now).ready) return null;
  const genome = rollGenome(n.egg, rng);
  state.nests[slot] = null;
  state.stats.hatched++;
  return { genome, egg: n.egg, ...addDragon(state, genome, n.egg.loc, now) };
}

// 図鑑の記録から描画用の遺伝子を作る
export function genomeOf(state, key) {
  const d = state.dex[key];
  const sp = parseKey(key);
  if (!sp) return null;
  if (!d) return { ...sp, ...defaultLook(sp), shiny: false };
  return { ...sp, ...d.look, shiny: d.shiny };
}

// 未発見のシルエット用（場所の pool の最初のパーツ）
export function defaultLook(sp, locId) {
  const loc = locationById(locId) || DATA.locations.find((l) => l.pool.lineage.some((p) => p.id === sp.lineage)) || DATA.locations[0];
  const look = {};
  for (const slot of LOOK_SLOTS) look[slot] = loc.pool[slot][0].id;
  return look;
}

export function dragonName(g) {
  return part('horns', g.horns).adj + lineageById(g.lineage).word;
}

export function dragonSub(g) {
  return `${part('wings', g.wings).name}・${part('tail', g.tail).name}`;
}

export function dragonStats(g, level = 1, bonus = 0) {
  const lin = lineageById(g.lineage);
  const st = { ...lin.base };
  for (const slot of ['horns', 'wings', 'fins', 'tail', 'ornament']) {
    const p = part(slot, g[slot]);
    if (p && p.stat) for (const [k, v] of Object.entries(p.stat)) st[k] += v;
  }
  const lv = DATA.dragon.levelBonus[clamp(level, 1, DATA.dragon.maxLevel)] || 0;
  for (const k of Object.keys(st)) st[k] = clamp(st[k] + lv + bonus, 0, 10);
  return st;
}

export function teamInfo(state) {
  const bonus = facilityBonus(state, 'teamStat');
  return state.team.filter((k) => state.dex[k]).map((key) => {
    const genome = genomeOf(state, key);
    const level = state.dex[key].level;
    return { key, genome, level, name: dragonName(genome), stats: dragonStats(genome, level, bonus), skill: lineageById(genome.lineage).skill };
  });
}

// チームの得意: いちばん高い1体 + 残りの3割。0〜10
export function teamStats(team) {
  const out = {};
  for (const s of DATA.stats) {
    const vals = team.map((d) => d.stats[s.id]).sort((a, b) => b - a);
    const v = vals.length ? vals[0] + vals.slice(1).reduce((a, b) => a + b, 0) * 0.3 : 0;
    out[s.id] = Math.round(clamp(v, 0, 10) * 10) / 10;
  }
  return out;
}

export function toggleTeam(state, key) {
  const i = state.team.indexOf(key);
  if (i >= 0) { state.team.splice(i, 1); return true; }
  if (!state.dex[key] || state.team.length >= DATA.dragon.teamMax) return false;
  state.team.push(key);
  return true;
}

// 図鑑: 場所の pool から作れる種類。系統がいちばん速く入れかわる順に並べ、似た形が続かないようにする
export function dexPage(locId) {
  const loc = locationById(locId);
  const slots = [...DATA.speciesSlots].reverse(); // tail → wings → horns → lineage（最後がいちばん内側）
  let list = [{}];
  for (const slot of slots) {
    const next = [];
    for (const g of list) for (const p of loc.pool[slot]) next.push({ ...g, [slot]: p.id });
    list = next;
  }
  return list;
}

export function dexProgress(state, locId) {
  const page = dexPage(locId);
  return { found: page.filter((g) => state.dex[dragonKey(g)]).length, total: page.length };
}

// ---------- バトル ----------
export function chooseBattle(goblinId, rng) {
  const gob = goblinById(goblinId);
  const pick = pickWeighted(gob.battles, rng);
  return { battle: battleById(pick.id), quirk: { ...pick.quirk } };
}

// すべてのバトルに渡す共通の入口
export function battleInput(state, goblinId, battleId, quirk, opts = {}) {
  const team = teamInfo(state);
  return {
    battle: battleById(battleId),
    goblin: goblinById(goblinId),
    quirk: quirk || {},
    team,
    stats: teamStats(team),
    advantage: !!opts.advantage,
    seed: opts.seed ?? 1,
  };
}

// 0〜10 の得意を 0〜1 に
export const statK = (stats, id) => clamp((stats[id] || 0) / 10, 0, 1);

export function battleReward(grade, rng) {
  const r = DATA.battleRewards[grade] || DATA.battleRewards.fail;
  return {
    grade,
    eggs: r.eggs,
    shards: r.shards[1] > 0 ? randInt(rng, r.shards[0], r.shards[1]) : 0,
    stones: rng() < r.stoneChance ? 1 : 0,
    steal: r.steal || 0,
  };
}

// ---------- 探索フィールド ----------
// 座標: x は左右（0〜width）、y は奥行き（0 が手前のスタート、大きいほど奥）
export function generateField(state, locId, rng) {
  const E = DATA.explore;
  const loc = locationById(locId);
  const W = E.width, D = E.depth;
  const f = { loc: locId, w: W, d: D, bands: [], rects: [], obstacles: [], items: [], goblins: [], tracks: [], start: { x: W / 2, y: 90 } };
  // 道をふさぐ地形の帯（すき間＝橋・坂・切れ目がある）
  for (let i = 0; i < E.bandCount; i++) {
    const type = loc.field.barriers[i % loc.field.barriers.length];
    const y0 = (D * (i + 1)) / (E.bandCount + 1) - 40 + (rng() - 0.5) * 120;
    const th = type === 'river' ? 90 : type === 'cliff' ? 70 : 60;
    const nGaps = rng() < 0.5 ? 1 : 2;
    const gaps = [];
    for (let k = 0; k < nGaps; k++) {
      const gw = 110 + rng() * 30;
      const seg = W / nGaps;
      const gx = seg * k + 40 + rng() * (seg - gw - 80);
      gaps.push({ x0: gx, x1: gx + gw });
    }
    const band = { type, y0, y1: y0 + th, gaps };
    f.bands.push(band);
    let x = 0;
    for (const g of gaps) {
      if (g.x0 > x) f.rects.push({ x0: x, x1: g.x0, y0, y1: y0 + th, type });
      x = g.x1;
    }
    if (x < W) f.rects.push({ x0: x, x1: W, y0, y1: y0 + th, type });
  }
  const inGapLane = (x, y, pad) => f.bands.some((b) => y > b.y0 - 110 && y < b.y1 + 110 && b.gaps.some((g) => x > g.x0 - pad && x < g.x1 + pad));
  const nearBand = (y, pad) => f.bands.some((b) => y > b.y0 - pad && y < b.y1 + pad);
  // 木や岩（キャラが前後に回り込める）
  let tries = 0;
  while (f.obstacles.length < E.obstacles && tries++ < 2000) {
    const r = 20 + rng() * 16;
    const x = 30 + rng() * (W - 60), y = 220 + rng() * (D - 320);
    if (nearBand(y, r + 30) || inGapLane(x, y, 30)) continue;
    if (f.obstacles.some((o) => Math.hypot(o.x - x, o.y - y) < o.r + r + 60)) continue;
    f.obstacles.push({ x, y, r, v: rng() });
  }
  // 歩ける場所の格子（届く場所にだけ物を置く）
  const reach = reachGrid(f, f.start);
  const cells = [];
  for (let gy = 0; gy < reach.rows; gy++) for (let gx = 0; gx < reach.cols; gx++) {
    if (reach.d[gy][gx] >= 0) cells.push({ x: (gx + 0.5) * reach.cell, y: (gy + 0.5) * reach.cell, d: reach.d[gy][gx] });
  }
  const used = [];
  const free = (x, y, minD) => used.every((u) => Math.hypot(u.x - x, u.y - y) > minD)
    && f.obstacles.every((o) => Math.hypot(o.x - x, o.y - y) > o.r + 40) && !nearBand(y, 40);
  const place = (filter, minD = 160) => {
    for (let k = 0; k < 300; k++) {
      const c = cells[Math.floor(rng() * cells.length)];
      if (!c || !filter(c) || !free(c.x, c.y, minD)) continue;
      used.push(c);
      return { x: c.x, y: c.y };
    }
    return null;
  };
  used.push(f.start);
  // 卵の巣は奥へ行くほど見つかる。宝箱は左右の端（寄り道）に
  for (let i = 0; i < E.nests; i++) {
    const lo = (D * (i + 0.6)) / (E.nests + 0.6);
    const p = place((c) => c.y > lo - 200 && c.y < lo + 300);
    if (p) f.items.push({ kind: 'nest', ...p, egg: rollEgg(state, locId, rng), taken: false });
  }
  for (let i = 0; i < E.chests; i++) {
    const p = place((c) => (c.x < W * 0.22 || c.x > W * 0.78) && c.y > 300);
    if (p) f.items.push({ kind: 'chest', ...p, taken: false });
  }
  for (let i = 0; i < E.springs; i++) {
    const p = place((c) => c.y > D * 0.3);
    if (p) f.items.push({ kind: 'spring', ...p, taken: false });
  }
  // ゴブリンと、そこへ続く足跡
  for (let i = 0; i < E.goblins; i++) {
    const lo = 450 + (i * (D - 600)) / E.goblins;
    const p = place((c) => c.y > lo && c.y < lo + (D - 600) / E.goblins, 220);
    if (!p) continue;
    const gob = pickWeighted(loc.goblins, rng).id;
    const g = { id: i, goblin: gob, x: p.x, y: p.y, hx: p.x, hy: p.y, noticed: false, done: false };
    f.goblins.push(g);
    const path = pathBack(reach, p, f.start, 9);
    path.forEach((q, k) => f.tracks.push({ x: q.x, y: q.y, ang: q.ang, gob: i, k }));
  }
  return f;
}

function rectHitsCircle(r, x, y, rad) {
  const cx = clamp(x, r.x0, r.x1), cy = clamp(y, r.y0, r.y1);
  return Math.hypot(cx - x, cy - y) < rad;
}

export function blocked(f, x, y, r) {
  if (x < r || x > f.w - r || y < r || y > f.d - r) return true;
  for (const rc of f.rects) if (rectHitsCircle(rc, x, y, r)) return true;
  for (const o of f.obstacles) if (Math.hypot(o.x - x, o.y - y) < o.r * 0.75 + r) return true;
  return false;
}

// 壁にそってすべるように動く
export function moveCircle(f, pos, dx, dy, r) {
  const steps = Math.max(1, Math.ceil(Math.hypot(dx, dy) / 6));
  let { x, y } = pos;
  for (let i = 0; i < steps; i++) {
    const sx = dx / steps, sy = dy / steps;
    if (!blocked(f, x + sx, y + sy, r)) { x += sx; y += sy; continue; }
    if (!blocked(f, x + sx, y, r)) x += sx;
    else if (!blocked(f, x, y + sy, r)) y += sy;
  }
  return { x, y };
}

export function reachGrid(f, from, cell = 30) {
  const cols = Math.ceil(f.w / cell), rows = Math.ceil(f.d / cell);
  const r = DATA.explore.playerR;
  const d = [];
  for (let gy = 0; gy < rows; gy++) d.push(new Array(cols).fill(-2));
  for (let gy = 0; gy < rows; gy++) for (let gx = 0; gx < cols; gx++) {
    if (!blocked(f, (gx + 0.5) * cell, (gy + 0.5) * cell, r)) d[gy][gx] = -1;
  }
  const sx = Math.floor(from.x / cell), sy = Math.floor(from.y / cell);
  const q = [[sx, sy]];
  if (d[sy] && d[sy][sx] === -1) d[sy][sx] = 0;
  for (let qi = 0; qi < q.length; qi++) {
    const [x, y] = q[qi];
    for (const [ax, ay] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + ax, ny = y + ay;
      if (ny < 0 || nx < 0 || ny >= rows || nx >= cols || d[ny][nx] !== -1) continue;
      d[ny][nx] = d[y][x] + 1;
      q.push([nx, ny]);
    }
  }
  return { cell, cols, rows, d };
}

// ゴブリンの場所からスタート方向へ戻る道すじ（足跡用）
function pathBack(reach, from, to, n) {
  const { cell, d } = reach;
  let gx = Math.floor(from.x / cell), gy = Math.floor(from.y / cell);
  const pts = [];
  let last = { x: from.x, y: from.y };
  for (let step = 0; step < 40 && pts.length < n; step++) {
    let best = null;
    for (const [ax, ay] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const v = d[gy + ay]?.[gx + ax];
      if (v >= 0 && v < d[gy][gx] && (!best || v < best.v)) best = { x: gx + ax, y: gy + ay, v };
    }
    if (!best) break;
    gx = best.x; gy = best.y;
    if (step % 2 === 1) {
      const p = { x: (gx + 0.5) * cell, y: (gy + 0.5) * cell };
      p.ang = Math.atan2(last.y - p.y, last.x - p.x);
      pts.push(p);
      last = p;
    }
  }
  return pts;
}
