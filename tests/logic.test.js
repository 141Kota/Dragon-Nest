import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DATA, part, locationById, goblinById } from '../src/data.js';
import * as L from '../src/logic.js';
import { loadState, saveState, SAVE_KEY } from '../src/save.js';

const memStorage = () => {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), m };
};

test('データ: 最初の実装範囲（場所3・ゴブリン2・パーツ各5・施設2〜3）', () => {
  assert.equal(DATA.locations.length, 3);
  assert.equal(DATA.goblins.length, 2);
  for (const slot of DATA.partSlots) assert.equal(DATA.parts[slot].length, 5, slot);
  assert.ok(DATA.facilities.length >= 2 && DATA.facilities.length <= 3);
});

test('データ: 参照がすべて解決できる', () => {
  for (const loc of DATA.locations) {
    for (const e of loc.eggTable) assert.ok(DATA.eggs[e.egg], e.egg);
    for (const g of loc.goblins) assert.ok(goblinById(g.id), g.id);
    for (const slot of DATA.partSlots) for (const p of loc.pool[slot]) assert.ok(part(slot, p.id), `${loc.id}.${slot}.${p.id}`);
  }
  for (const e of Object.values(DATA.eggs)) {
    assert.ok(DATA.rarities[e.rarity]);
    assert.ok(DATA.rarities[e.rarity].hatchSec <= 30 * 60, '最長30分');
  }
  for (const b of DATA.parts.body) assert.ok(DATA.skills[b.skill]);
  for (const c of DATA.parts.color) assert.ok(DATA.skills[c.skill] && c.shiny);
  for (const g of DATA.goblins) for (const k of Object.keys(g.intents)) assert.ok(DATA.battle.intents[k]);
});

test('卵とドラゴン: 場所の pool からだけパーツが出る', () => {
  const st = L.defaultState(0);
  const rng = L.makeRng(1);
  for (const loc of DATA.locations) {
    for (let i = 0; i < 200; i++) {
      const egg = L.rollEgg(st, loc.id, rng);
      const g = L.rollGenome(egg, rng);
      for (const slot of DATA.partSlots) assert.ok(loc.pool[slot].some((p) => p.id === g[slot]));
      assert.deepEqual(L.parseKey(L.dragonKey(g)), Object.fromEntries(DATA.partSlots.map((s) => [s, g[s]])));
    }
  }
});

test('図鑑: 組み合わせ数とレベルアップ', () => {
  const st = L.defaultState(0);
  st.dex = {};
  st.partner = null;
  assert.equal(L.dexPage('forest').length, 64);
  const g = L.dexPage('forest')[0];
  const a = L.addDragon(st, g, 'forest', 0);
  assert.ok(a.isNew);
  assert.equal(st.partner, a.key, '最初のドラゴンが相棒になる');
  for (let i = 0; i < 10; i++) L.addDragon(st, g, 'forest', 0);
  assert.equal(st.dex[a.key].level, DATA.dragon.maxLevel);
  assert.equal(L.dexProgress(st, 'forest').found, 1);
  const p = L.partnerInfo(st);
  assert.equal(p.skills.length, 2, 'Lv3以上でからだの技も使える');
});

test('孵化: 時間・アプリ再開時の判定・ぬくもり石・探索で短縮', () => {
  const st = L.defaultState(1000);
  st.storage.push(L.newEgg(st, 'forest_rare', 'forest'));
  assert.ok(L.placeEgg(st, 1, 0, 1000));
  const dur = DATA.rarities.rare.hatchSec;
  assert.equal(L.nestStatus(st.nests[1], 1000).ready, false);
  assert.equal(L.nestStatus(st.nests[1], 1000 + dur * 1000).ready, true, '時間が過ぎていれば孵化済み');
  st.stones = 1;
  assert.ok(L.useStone(st, 1, 1000));
  assert.equal(st.stones, 0);
  L.reduceHatch(st, 100);
  const remain = L.nestStatus(st.nests[1], 1000).remain;
  assert.equal(remain, dur - DATA.items.stone.reduceSec - 100);
  const res = L.hatchNest(st, 0, L.makeRng(3), 1000 + 60000);
  assert.ok(res && res.isNew);
  assert.equal(st.nests[0], null);
});

test('施設: 巣が増える・孵化が速くなる・かけらが足りないと建たない', () => {
  const st = L.defaultState(0);
  st.shards = 0;
  assert.equal(L.upgradeFacility(st, 'straw'), false);
  st.shards = 100;
  assert.ok(L.upgradeFacility(st, 'straw'));
  assert.equal(st.nests.length, DATA.base.eggSlots + 1);
  assert.ok(L.upgradeFacility(st, 'hearth'));
  assert.ok(L.hatchDuration(st, 'forest_common') < DATA.rarities.common.hatchSec);
  L.upgradeFacility(st, 'straw');
  assert.equal(L.upgradeFacility(st, 'straw'), false, '最大レベル');
});

test('バトル: 予告に合う行動が有利で、3〜4手前後で決着する', () => {
  const st = L.defaultState(0);
  for (const gob of DATA.goblins) {
    // すべて正解
    const b = L.createBattle(st, gob.id, { uid: 1, egg: 'forest_common', loc: 'forest' }, L.makeRng(5));
    let n = 0;
    while (!b.result) { L.battleAct(b, DATA.battle.intents[b.intent].best, L.makeRng(n)); n++; }
    assert.equal(b.result, 'win');
    assert.ok(n >= 3 && n <= 4, `${gob.id} 正解だけで ${n}手`);
    // すべて不正解
    const c = L.createBattle(st, gob.id, { uid: 1, egg: 'forest_common', loc: 'forest' }, L.makeRng(6));
    let m = 0;
    while (!c.result) {
      const wrong = Object.keys(DATA.battle.actions).find((a) => a !== DATA.battle.intents[c.intent].best && a !== 'counter');
      L.battleAct(c, wrong, L.makeRng(m)); m++;
    }
    assert.equal(c.result, 'lose');
    assert.ok(m >= 3 && m <= 4, `${gob.id} 不正解だけで ${m}手`);
  }
});

test('バトル: 相棒の技は1回だけ・相棒がいると強い', () => {
  const st = L.defaultState(0);
  const g = L.dexPage('volcano')[0];
  L.addDragon(st, g, 'volcano', 0);
  const b = L.createBattle(st, 'brute', { uid: 1, egg: 'forest_common', loc: 'forest' }, L.makeRng(1));
  const sk = b.partner.skills[0];
  assert.ok(L.battleSkill(b, sk, L.makeRng(2)));
  assert.equal(L.battleSkill(b, sk, L.makeRng(2)), null);
  const r = L.battleAct(b, DATA.battle.intents[b.intent].best, L.makeRng(3));
  if (!b.result || b.result === 'win') assert.equal(r.damage, DATA.battle.baseDamage + b.partner.power);
});

test('探索マップ: 歩ける場所はつながり、経路が見つかる', () => {
  const st = L.defaultState(0);
  for (let seed = 1; seed < 40; seed++) {
    const map = L.generateMap(st, 'forest', L.makeRng(seed));
    const d = L.distances(map, map.start);
    let items = 0;
    for (let r = 0; r < map.rows; r++) for (let c = 0; c < map.cols; c++) {
      const t = map.tiles[r][c];
      if (!t.block) assert.ok(d[r][c] >= 0);
      if (t.item) { items++; const p = L.findPath(map, map.start, { c, r }); assert.equal(p.length, d[r][c]); }
    }
    assert.ok(items > 0);
  }
});

test('セーブ: 保存と読み込み・壊れたデータでも落ちない', () => {
  const s = memStorage();
  const st = L.defaultState(0);
  st.shards = 42;
  assert.ok(saveState(st, s));
  assert.equal(loadState(s, 0).shards, 42);
  s.setItem(SAVE_KEY, '{壊れた');
  assert.equal(loadState(s, 0).shards, DATA.base.startShards);
  s.setItem(SAVE_KEY, JSON.stringify({ shards: 'x', dex: { 'no-such-key': {} }, nests: [{ egg: { egg: 'nope' } }], storage: [null, 3], facilities: { straw: 99 } }));
  const z = loadState(s, 0);
  assert.equal(z.shards, DATA.base.startShards);
  assert.deepEqual(z.dex, {});
  assert.equal(z.facilities.straw, 2);
  assert.equal(z.nests.length, DATA.base.eggSlots + 2);
  const throwing = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('full'); } };
  assert.ok(loadState(throwing, 0));
  assert.equal(saveState(st, throwing), false);
  assert.ok(loadState(null, 0));
});
