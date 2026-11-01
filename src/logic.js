// ゲームロジック（DOMを使わない純粋な処理。node のテストからも呼べる）
import { DATA, part, locationById, goblinById, facilityById } from './data.js';

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
    partner: null,
    facilities: {},
    stats: { trips: 0, wins: 0, hatched: 0 },
    seen: { intro: false },
  };
  for (let i = 0; i < DATA.base.eggSlots; i++) s.nests.push(null);
  // はじめの1個は短時間で孵るようにしておく
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

// 壊れたセーブや古いセーブでも落ちないように整える
export function sanitizeState(raw, now = Date.now()) {
  const s = defaultState(now);
  if (!isObj(raw)) return s;
  s.shards = Math.max(0, Math.floor(num(raw.shards, s.shards)));
  s.stones = Math.max(0, Math.floor(num(raw.stones, s.stones)));
  if (isObj(raw.stats)) for (const k of Object.keys(s.stats)) s.stats[k] = Math.max(0, num(raw.stats[k], 0));
  if (isObj(raw.seen)) s.seen.intro = !!raw.seen.intro;
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
      if (!parseKey(key) || !isObj(d)) continue;
      s.dex[key] = {
        level: Math.min(DATA.dragon.maxLevel, Math.max(1, Math.floor(num(d.level, 1)))),
        shiny: !!d.shiny,
        count: Math.max(1, Math.floor(num(d.count, 1))),
        loc: locationById(d.loc) ? d.loc : DATA.locations[0].id,
        at: num(d.at, now),
      };
    }
  }
  s.partner = typeof raw.partner === 'string' && s.dex[raw.partner] ? raw.partner : null;
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
  for (const slot of DATA.partSlots) {
    g[slot] = pickWeighted(loc.pool[slot], rng, (p) => p.w * (p.rare ? rar.rareBoost : 1)).id;
  }
  g.shiny = rng() < rar.shinyChance;
  return g;
}

export const dragonKey = (g) => DATA.partSlots.map((s) => g[s]).join('-');

export function parseKey(key) {
  if (typeof key !== 'string') return null;
  const ids = key.split('-');
  if (ids.length !== DATA.partSlots.length) return null;
  const g = {};
  for (let i = 0; i < ids.length; i++) {
    if (!part(DATA.partSlots[i], ids[i])) return null;
    g[DATA.partSlots[i]] = ids[i];
  }
  return g;
}

export function addDragon(state, genome, loc, now = Date.now()) {
  const key = dragonKey(genome);
  const d = state.dex[key];
  if (!d) {
    state.dex[key] = { level: 1, shiny: !!genome.shiny, count: 1, loc, at: now };
    if (!state.partner) state.partner = key;
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

export function dragonName(g) {
  return part('color', g.color).word + part('body', g.body).word;
}

export function dragonSkills(g, level) {
  const list = [part('color', g.color).skill];
  if (level >= DATA.dragon.bodySkillLevel) list.push(part('body', g.body).skill);
  return list;
}

export function dragonPower(level) {
  return DATA.dragon.powerByLevel[Math.min(level, DATA.dragon.maxLevel)] || 0;
}

export function partnerInfo(state) {
  const key = state.partner;
  const d = key && state.dex[key];
  if (!d) return null;
  const genome = { ...parseKey(key), shiny: d.shiny };
  return { key, genome, level: d.level, power: dragonPower(d.level), skills: dragonSkills(genome, d.level), name: dragonName(genome) };
}

// 図鑑: 場所の pool から作れる組み合わせをすべて並べる
export function dexPage(locId) {
  const loc = locationById(locId);
  let list = [{}];
  for (const slot of DATA.partSlots) {
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
export function createBattle(state, goblinId, egg, rng) {
  const gob = goblinById(goblinId);
  const partner = partnerInfo(state);
  const b = {
    goblin: gob.id,
    egg,
    hp: gob.hp,
    maxHp: gob.hp,
    gauge: 0,
    turn: 0,
    intent: null,
    history: [],
    partner,
    usedSkills: [],
    escapeMul: Math.max(0.3, 1 - facilityBonus(state, 'escapeSlow')),
    result: null,
  };
  b.intent = nextIntent(b, rng);
  return b;
}

export function nextIntent(b, rng) {
  const gob = goblinById(b.goblin);
  const opts = Object.entries(gob.intents).map(([id, w]) => ({ id, w }));
  const h = b.history;
  // 同じ予告が3回続かないようにする
  const banned = h.length >= 2 && h[h.length - 1] === h[h.length - 2] ? h[h.length - 1] : null;
  return pickWeighted(opts.filter((o) => o.id !== banned), rng).id;
}

function finishTurn(b, rng, damage, gaugeAdd) {
  b.hp = Math.max(0, b.hp - damage);
  b.gauge = Math.max(0, Math.min(DATA.battle.gaugeMax, b.gauge + gaugeAdd));
  b.turn++;
  b.history.push(b.intent);
  if (b.hp <= 0) b.result = 'win';
  else if (b.gauge >= DATA.battle.gaugeMax) b.result = 'lose';
  else b.intent = nextIntent(b, rng);
}

export function battleAct(b, action, rng) {
  if (b.result) return null;
  const gob = goblinById(b.goblin);
  const intent = b.intent;
  const matched = DATA.battle.intents[intent].best === action;
  const power = b.partner ? b.partner.power : 0;
  let damage = 0;
  if (matched) damage = DATA.battle.baseDamage + power;
  else if (action === 'counter') damage = DATA.battle.counterMissDamage;
  const gaugeAdd = Math.round((matched ? gob.gaugeGood : gob.gaugeBad) * b.escapeMul);
  finishTurn(b, rng, damage, gaugeAdd);
  return { action, intent, matched, damage, gaugeAdd };
}

export function battleSkill(b, skillId, rng) {
  if (b.result || !b.partner || !b.partner.skills.includes(skillId) || b.usedSkills.includes(skillId)) return null;
  const sk = DATA.skills[skillId];
  const intent = b.intent;
  const damage = sk.damage > 0 ? sk.damage + Math.max(0, b.partner.power - 1) : 0;
  const gaugeAdd = sk.gauge > 0 ? Math.round(sk.gauge * b.escapeMul) : sk.gauge;
  b.usedSkills.push(skillId);
  finishTurn(b, rng, damage, gaugeAdd);
  return { skill: skillId, intent, matched: true, damage, gaugeAdd };
}

export function battleReward(b, rng) {
  const gob = goblinById(b.goblin);
  if (b.result !== 'win') return { shards: DATA.battle.loseShards, stones: 0 };
  return { shards: randInt(rng, ...gob.reward.shards), stones: rng() < gob.reward.stoneChance ? 1 : 0 };
}

// ---------- 探索マップ ----------
export function generateMap(state, locId, rng) {
  const E = DATA.explore;
  const { cols, rows } = E;
  const start = { c: Math.floor(cols / 2), r: rows - 1 };
  const tiles = [];
  for (let r = 0; r < rows; r++) {
    const row = [];
    for (let c = 0; c < cols; c++) {
      const nearStart = Math.abs(c - start.c) + Math.abs(r - start.r) <= 1;
      row.push({ block: !nearStart && rng() < E.blockRate, item: null, seen: false, var: rng() });
    }
    tiles.push(row);
  }
  const map = { loc: locId, cols, rows, tiles, start };
  // つながっていない場所はブロックをはずす
  const reach = distances(map, start);
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    if (!tiles[r][c].block && reach[r][c] < 0) tiles[r][c].block = true;
  }
  const free = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    if (!tiles[r][c].block && !(c === start.c && r === start.r)) free.push({ c, r, d: reach[r][c] });
  }
  // 遠いほど良いものを置きやすいように、手前からではなくシャッフル
  for (let i = free.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [free[i], free[j]] = [free[j], free[i]];
  }
  const take = (n, mk) => { for (let i = 0; i < n && free.length; i++) { const p = free.pop(); tiles[p.r][p.c].item = mk(); } };
  take(E.visibleEggs, () => ({ kind: 'egg', egg: rollEgg(state, locId, rng) }));
  take(E.shardSpots, () => ({ kind: 'shards', n: randInt(rng, ...E.shardsPerSpot) }));
  take(E.grassSpots, () => {
    const k = pickWeighted(E.grassTable, rng).kind;
    const hidden = k === 'egg' ? { kind: 'egg', egg: rollEgg(state, locId, rng) }
      : k === 'shards' ? { kind: 'shards', n: randInt(rng, ...E.shardsPerSpot) }
      : { kind: k };
    return { kind: 'grass', hidden };
  });
  return map;
}

const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

export function distances(map, from) {
  const d = map.tiles.map((row) => row.map(() => -1));
  d[from.r][from.c] = 0;
  const q = [from];
  while (q.length) {
    const p = q.shift();
    for (const [dc, dr] of DIRS) {
      const c = p.c + dc, r = p.r + dr;
      if (c < 0 || r < 0 || c >= map.cols || r >= map.rows) continue;
      if (map.tiles[r][c].block || d[r][c] >= 0) continue;
      d[r][c] = d[p.r][p.c] + 1;
      q.push({ c, r });
    }
  }
  return d;
}

export function findPath(map, from, to) {
  const d = distances(map, from);
  if (d[to.r]?.[to.c] == null || d[to.r][to.c] < 0) return null;
  const path = [to];
  let cur = to;
  while (d[cur.r][cur.c] > 0) {
    for (const [dc, dr] of DIRS) {
      const c = cur.c + dc, r = cur.r + dr;
      if (d[r]?.[c] === d[cur.r][cur.c] - 1) { cur = { c, r }; break; }
    }
    path.unshift(cur);
  }
  return path.slice(1);
}
