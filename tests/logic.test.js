import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { DATA, part, goblinById, battleById, lineageById } from '../src/data.js';
import * as L from '../src/logic.js';
import { loadState, saveState, SAVE_KEY } from '../src/save.js';

const memStorage = () => {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), m };
};
const fakeUi = { press() {}, hit() {}, stick: () => ({ active: false, x: 0, y: 0 }), keyDir: () => ({ x: 0, y: 0 }) };

test('データ: 最初の実装範囲（場所3・ゴブリン3以上・バトル5・系統5以上・パーツ各5・施設2〜3）', () => {
  assert.equal(DATA.locations.length, 3);
  assert.ok(DATA.goblins.length >= 3);
  assert.equal(DATA.battles.length, 5);
  assert.ok(DATA.lineages.length >= 5);
  for (const slot of DATA.partSlots.filter((s) => s !== 'color')) assert.equal(DATA.parts[slot].length, 5, slot);
  assert.ok(DATA.facilities.length >= 2 && DATA.facilities.length <= 3);
  assert.equal(DATA.dragon.teamMax, 3);
});

test('データ: 参照がすべて解決でき、バトルのファイルがある', () => {
  for (const loc of DATA.locations) {
    for (const e of loc.eggTable) assert.ok(DATA.eggs[e.egg], e.egg);
    for (const g of loc.goblins) assert.ok(goblinById(g.id), g.id);
    for (const slot of ['lineage', ...DATA.partSlots]) for (const p of loc.pool[slot]) assert.ok(part(slot, p.id), `${loc.id}.${slot}.${p.id}`);
  }
  for (const e of Object.values(DATA.eggs)) assert.ok(DATA.rarities[e.rarity].hatchSec <= 30 * 60, '最長30分');
  for (const g of DATA.goblins) for (const b of g.battles) assert.ok(battleById(b.id), `${g.id}.${b.id}`);
  for (const b of DATA.battles) {
    assert.ok(existsSync(new URL(`../src/battles/${b.file}.js`, import.meta.url)), b.file);
    assert.ok(b.time >= 20 && b.time <= 40, `${b.id} は20〜40秒`);
    assert.ok(b.rule.length <= 30, `${b.id} のルールは1行`);
  }
  for (const r of ['great', 'good', 'fail']) assert.ok(DATA.battleRewards[r]);
});

test('ドラゴン: 系統ごとに骨組みが違う（脚・首・浮遊・翼の大きさ）', () => {
  const sig = DATA.lineages.map((l) => {
    const s = l.skeleton;
    return [s.legs.length, s.necks.length, !!s.float, s.wing.scale, s.tail.pts.length, s.body.pts.length, !!s.arms].join('/');
  });
  assert.equal(new Set(sig).size, DATA.lineages.length);
});

test('卵とドラゴン: 場所の pool からだけ出る・種類のキーは往復できる', () => {
  const st = L.defaultState(0);
  const rng = L.makeRng(1);
  for (const loc of DATA.locations) {
    for (let i = 0; i < 200; i++) {
      const g = L.rollGenome(L.rollEgg(st, loc.id, rng), rng);
      for (const slot of ['lineage', ...DATA.partSlots]) assert.ok(loc.pool[slot].some((p) => p.id === g[slot]));
      const sp = L.parseKey(L.dragonKey(g));
      for (const s of DATA.speciesSlots) assert.equal(sp[s], g[s]);
    }
  }
});

test('図鑑: 並べたとき同じ系統が続かない', () => {
  for (const loc of DATA.locations) {
    const page = L.dexPage(loc.id);
    assert.ok(page.length >= 16);
    for (let i = 1; i < page.length; i++) assert.notEqual(page[i].lineage, page[i - 1].lineage, `${loc.id} ${i}`);
    assert.equal(new Set(page.map(L.dragonKey)).size, page.length);
  }
});

test('図鑑とチーム: レベルアップ・最初の3体は自動で連れていく・最大3体', () => {
  const st = L.defaultState(0);
  const page = L.dexPage('forest');
  for (let i = 0; i < 4; i++) L.addDragon(st, { ...page[i], fins: 'none', pattern: 'plain', ornament: 'none', color: 'moss' }, 'forest', 0);
  assert.equal(st.team.length, 3);
  const k = L.dragonKey(page[0]);
  for (let i = 0; i < 10; i++) L.addDragon(st, { ...page[0], fins: 'none', pattern: 'plain', ornament: 'none', color: 'moss' }, 'forest', 0);
  assert.equal(st.dex[k].level, DATA.dragon.maxLevel);
  assert.equal(L.toggleTeam(st, L.dragonKey(page[3])), false, '4体目は入れない');
  assert.ok(L.toggleTeam(st, k));
  assert.equal(st.team.length, 2);
  const info = L.teamInfo(st);
  const ts = L.teamStats(info);
  for (const s of DATA.stats) assert.ok(ts[s.id] >= 0 && ts[s.id] <= 10);
  // レベルが上がると得意も上がる
  const g = L.genomeOf(st, k);
  const a = L.dragonStats(g, 1), b = L.dragonStats(g, 5);
  assert.ok(DATA.stats.every((s) => b[s.id] >= a[s.id]) && DATA.stats.some((s) => b[s.id] > a[s.id]));
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
  L.reduceHatch(st, 100);
  assert.equal(L.nestStatus(st.nests[1], 1000).remain, dur - DATA.items.stone.reduceSec - 100);
  const res = L.hatchNest(st, 0, L.makeRng(3), 1000 + 60000);
  assert.ok(res && res.isNew);
  assert.deepEqual(st.team, [res.key]);
});

test('施設: 巣が増える・孵化が速くなる・見張り台で得意が上がる', () => {
  const st = L.defaultState(0);
  st.shards = 0;
  assert.equal(L.upgradeFacility(st, 'straw'), false);
  st.shards = 200;
  assert.ok(L.upgradeFacility(st, 'straw'));
  assert.equal(st.nests.length, DATA.base.eggSlots + 1);
  assert.ok(L.upgradeFacility(st, 'hearth'));
  assert.ok(L.hatchDuration(st, 'forest_common') < DATA.rarities.common.hatchSec);
  L.addDragon(st, { ...L.dexPage('forest')[0], fins: 'none', pattern: 'plain', ornament: 'none', color: 'moss' }, 'forest', 0);
  const before = L.teamInfo(st)[0].stats.pow;
  assert.ok(L.upgradeFacility(st, 'tower'));
  assert.equal(L.teamInfo(st)[0].stats.pow, Math.min(10, before + 1));
});

test('バトル: 同じ入口と出口・報酬は3段階・失敗で卵を1つ奪われる', () => {
  const st = L.defaultState(0);
  for (const gob of DATA.goblins) {
    const pick = L.chooseBattle(gob.id, L.makeRng(4));
    assert.ok(gob.battles.some((b) => b.id === pick.battle.id));
    const inp = L.battleInput(st, gob.id, pick.battle.id, pick.quirk, { advantage: true });
    assert.equal(inp.goblin.id, gob.id);
    assert.ok(inp.advantage);
  }
  const rng = L.makeRng(9);
  const great = L.battleReward('great', rng), good = L.battleReward('good', rng), fail = L.battleReward('fail', rng);
  assert.ok(great.eggs > good.eggs && good.eggs > fail.eggs);
  assert.equal(fail.steal, 1);
});

test('バトル: 5種類とも作れて、時間切れで結果が出る', async () => {
  const st = L.defaultState(0);
  L.addDragon(st, { ...L.dexPage('volcano')[0], fins: 'none', pattern: 'plain', ornament: 'none', color: 'ember' }, 'volcano', 0);
  for (const b of DATA.battles) {
    const mod = (await import(`../src/battles/${b.file}.js`)).default;
    for (const gob of DATA.goblins) {
      const q = gob.battles.find((x) => x.id === b.id).quirk;
      const inst = mod(L.battleInput(st, gob.id, b.id, q, {}), { ui: fakeUi, rng: L.makeRng(2) });
      for (let i = 0; i < 60; i++) inst.update(1 / 30, { x: 0, y: 76, w: 390, h: 600 }, 1 - i / 60);
      assert.ok(['great', 'good', 'fail'].includes(inst.timeUp()), `${b.id}/${gob.id}`);
    }
  }
});

test('バトル（包囲）: ふさげば勝ち、外周に着けば逃げられる', async () => {
  const mod = (await import('../src/battles/surround.js')).default;
  const st = L.defaultState(0);
  let wins = 0;
  for (let s = 1; s <= 40; s++) {
    const inst = mod(L.battleInput(st, 'brute', 'surround', { rocks: 12, double: 0 }, {}), { ui: fakeUi, rng: L.makeRng(s) });
    for (let k = 0; k < 50; k++) {
      const pk = inst.peek();
      if (pk.end) { if (pk.end === 'win') wins++; break; }
      const n = pk.next;
      if (n && !n.escape) inst.act(n.c, n.r);
      else break;
    }
  }
  assert.ok(wins > 10, `単純な作戦でもある程度は勝てる (${wins}/40)`);
});

test('探索: フィールドは端から端まで歩けて、物は届く場所にある', () => {
  const st = L.defaultState(0);
  for (const loc of DATA.locations) {
    for (let seed = 1; seed < 12; seed++) {
      const f = L.generateField(st, loc.id, L.makeRng(seed));
      assert.equal(f.bands.length, DATA.explore.bandCount);
      for (const b of f.bands) assert.ok(b.gaps.length >= 1, '道をふさぐ地形にはすき間がある');
      const reach = L.reachGrid(f, f.start);
      const ok = (x, y) => reach.d[Math.floor(y / reach.cell)][Math.floor(x / reach.cell)] >= 0;
      for (const it of f.items) assert.ok(ok(it.x, it.y), `${loc.id}/${seed} ${it.kind}`);
      for (const g of f.goblins) assert.ok(ok(g.x, g.y));
      assert.ok(f.items.filter((i) => i.kind === 'nest').length >= 2);
      assert.ok(f.goblins.length >= 2 && f.tracks.length > 0, '足跡がある');
      // 一番奥まで行ける
      let far = 0;
      for (let gy = 0; gy < reach.rows; gy++) if (reach.d[gy].some((v) => v >= 0)) far = gy;
      assert.ok(far * reach.cell > f.d - 200);
    }
  }
});

test('探索: 壁や岩の中には入らない', () => {
  const st = L.defaultState(0);
  const f = L.generateField(st, 'volcano', L.makeRng(5));
  const rng = L.makeRng(6);
  let p = { ...f.start };
  for (let i = 0; i < 3000; i++) {
    const a = rng() * Math.PI * 2;
    p = L.moveCircle(f, p, Math.cos(a) * 9, Math.sin(a) * 9 + 3, DATA.explore.playerR);
    assert.equal(L.blocked(f, p.x, p.y, DATA.explore.playerR), false);
  }
});

test('セーブ: 保存と読み込み・壊れたデータでも落ちない', () => {
  const s = memStorage();
  const st = L.defaultState(0);
  st.shards = 42;
  L.addDragon(st, { ...L.dexPage('sea')[1], fins: 'sail', pattern: 'rings', ornament: 'gem', color: 'tide', shiny: true }, 'sea', 0);
  assert.ok(saveState(st, s));
  const back = loadState(s, 0);
  assert.equal(back.shards, 42);
  assert.deepEqual(back.dex, st.dex);
  assert.deepEqual(back.team, st.team);
  s.setItem(SAVE_KEY, '{壊れた');
  assert.equal(loadState(s, 0).shards, DATA.base.startShards);
  s.setItem(SAVE_KEY, JSON.stringify({ shards: 'x', dex: { 'no-such-key': {}, 'quad.branch.leaf.leaf': { look: { color: 'nope' } } }, team: ['zzz', 'quad.branch.leaf.leaf'], nests: [{ egg: { egg: 'nope' } }], storage: [null, 3], facilities: { straw: 99 } }));
  const z = loadState(s, 0);
  assert.equal(z.shards, DATA.base.startShards);
  assert.deepEqual(Object.keys(z.dex), ['quad.branch.leaf.leaf']);
  assert.ok(part('color', z.dex['quad.branch.leaf.leaf'].look.color));
  assert.deepEqual(z.team, ['quad.branch.leaf.leaf']);
  assert.equal(z.facilities.straw, 2);
  assert.equal(z.nests.length, DATA.base.eggSlots + 2);
  const throwing = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('full'); } };
  assert.ok(loadState(throwing, 0));
  assert.equal(saveState(st, throwing), false);
  assert.ok(loadState(null, 0));
  assert.ok(lineageById('serpent'));
});
