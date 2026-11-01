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

// ---------- 360°の描画（骨組みを回して投影） ----------
test('3D投影: 向きに合わせて回り、奥にある部品から描く', async () => {
  const R = await import('../src/rig.js');
  const D = await import('../src/dragon.js');
  const right = R.view(0, 0.3).p([10, 0, 0]);
  assert.ok(right.x > 9 && Math.abs(right.d) < 1e-9, '右向きなら前は画面の右');
  const away = R.view(Math.PI / 2, 0.3).p([10, 0, 0]);
  assert.ok(Math.abs(away.x) < 1e-9 && away.d > 0 && away.y < 0, '奥向きなら前は奥（画面の上）');
  assert.ok(R.view(-Math.PI / 2, 0.3).facing([1, 0, 0]) > 0.9, '手前向きなら顔はこちらを向く');
  const g = { lineage: 'quad', horns: 'branch', wings: 'leaf', fins: 'mane', tail: 'leaf', pattern: 'spots', ornament: 'none', color: 'moss' };
  assert.equal(D.dragonPieceOrder(g, Math.PI / 2)[0], 'head', '奥を向くと頭が一番奥');
  assert.equal(D.dragonPieceOrder(g, -Math.PI / 2)[0], 'tail', '手前を向くとしっぽが一番奥');
  assert.equal(R.turnToward(0, 3, 0.5), 0.5, '向きはなめらかに回る');
  assert.ok(Math.abs(R.turnToward(3, -3, 0.1) - 3.1) < 1e-9, '近い回り方で回る');
});

// ---------- ゴブリンの行動 ----------
const E = DATA.explore;
const flatField = (bands = []) => ({ w: 960, d: 2600, bands, rects: bands.flatMap((b) => { const out = []; let x = 0; for (const gp of b.gaps) { out.push({ x0: x, x1: gp.x0, y0: b.y0, y1: b.y1, type: b.type }); x = gp.x1; } out.push({ x0: x, x1: 960, y0: b.y0, y1: b.y1, type: b.type }); return out; }), obstacles: [], items: [], tracks: [], goblins: [] });
const addGob = (f, id, x, y, yaw) => { const g = { id: f.goblins.length, goblin: id, x, y, hx: x, hy: y, noticed: false, done: false, ai: L.newGoblinAI(() => 0.5) }; g.ai.yaw = yaw; f.goblins.push(g); return g; };
const run = (f, p, sec, rng = L.makeRng(3)) => { let last = null; const events = []; for (let i = 0; i < sec * 30; i++) { const r = L.updateGoblins(f, p, 1 / 30, rng); events.push(...r.events); if (r.contact) { last = r; break; } } return { last, events }; };

test('ゴブリン: 見回りは家のまわりから離れない（種類ごとの癖）', () => {
  for (const gob of DATA.goblins) {
    const f = flatField();
    const g = addGob(f, gob.id, 480, 1200, 0);
    let moved = 0, px = g.x, py = g.y;
    for (let i = 0; i < 30 * 30; i++) {
      L.updateGoblins(f, { x: 480, y: 100 }, 1 / 30, L.makeRng(i));
      moved += Math.hypot(g.x - px, g.y - py); px = g.x; py = g.y;
      assert.ok(Math.hypot(g.x - g.hx, g.y - g.hy) < E.patrolR * 1.3, gob.id);
      assert.equal(g.ai.state, 'patrol');
    }
    assert.ok(moved > 40, `${gob.id} は歩き回る`);
  }
});

test('ゴブリン: 前の視界に入ると気づく。後ろや横は近くないと気づかない。走ると遠くから、茂みでは近くでないと気づく', () => {
  const at = (dx, dy, running = false, bands = []) => {
    const f = flatField(bands);
    const g = addGob(f, 'brute', 480, 1200, 0);
    return L.goblinSees(f, g, { x: 480 + dx, y: 1200 + dy, running });
  };
  const view = DATA.goblins.find((g) => g.id === 'brute').ai.view;
  assert.ok(at(view * 0.8, 0), '前');
  assert.ok(!at(-view * 0.8, 0), '後ろの同じ距離は見えない');
  assert.ok(!at(0, view * 0.6), '横も見えにくい');
  assert.ok(at(-20, 0), 'すぐ後ろなら気づく');
  assert.ok(!at(view * 1.2, 0) && at(view * 1.2, 0, true), '走ると気づかれる距離がのびる');
  const bush = [{ type: 'bush', y0: 1150, y1: 1170, gaps: [{ x0: 0, x1: 960 }] }];
  assert.ok(!at(view * 0.7, 0, false, bush), '茂みのそばでは縮む');
  const cliff = [{ type: 'cliff', y0: 1300, y1: 1360, gaps: [{ x0: 400, x1: 560 }] }];
  assert.ok(!at(0, view * 0.3 + 160, false, cliff) && !at(view * 0.5, 200, false, cliff), '崖の向こうは見えない');
});

test('ゴブリン: 気づく（！で止まる）→ 追跡 → 触れたらバトル', () => {
  const f = flatField();
  const g = addGob(f, 'brute', 480, 1200, 0);
  const p = { x: 620, y: 1200 };
  const r1 = L.updateGoblins(f, p, 1 / 30, L.makeRng(1));
  assert.equal(g.ai.state, 'notice');
  assert.ok(r1.events.some((e) => e.kind === 'notice' && e.g === g));
  const x0 = g.x;
  for (let i = 0; i < 10; i++) L.updateGoblins(f, p, 1 / 30);
  assert.equal(g.x, x0, '気づいた瞬間は短く止まる');
  const { last } = run(f, p, 5);
  assert.ok(last && last.contact === g, '追いかけてきて触れる');
  assert.equal(last.advantage, false, '正面から捕まると有利にならない');
});

test('ゴブリン: 気づかれる前に後ろから触れると有利。足跡に気づいていても有利', () => {
  const f = flatField();
  const g = addGob(f, 'shield', 480, 1200, Math.PI);
  g.ai.wait = 99; // 立ち止まって見回している
  g.ai.yaw = Math.PI;
  const r = L.updateGoblins(f, { x: 500, y: 1200 }, 1 / 30);
  assert.equal(r.contact, g);
  assert.ok(r.advantage);
  const f2 = flatField();
  const g2 = addGob(f2, 'brute', 480, 1200, 0);
  g2.noticed = true;
  g2.ai.state = 'chase';
  assert.ok(L.updateGoblins(f2, { x: 500, y: 1200 }, 1 / 30).advantage);
});

test('ゴブリン: 見えなくなると「？」で探し、見つからなければ見回りに戻る', () => {
  const f = flatField([{ type: 'cliff', y0: 1300, y1: 1360, gaps: [{ x0: 400, x1: 560 }] }]);
  const g = addGob(f, 'brute', 480, 1200, Math.PI / 2);
  const p = { x: 480, y: 1290 };
  L.updateGoblins(f, p, 1 / 30);
  assert.equal(g.ai.state, 'notice');
  for (let i = 0; i < 30; i++) L.updateGoblins(f, p, 1 / 30);
  assert.equal(g.ai.state, 'chase');
  // 崖の向こうへ渡るとあきらめる
  p.y = 1420;
  const evs = [];
  for (let i = 0; i < 3; i++) evs.push(...L.updateGoblins(f, p, 1 / 30).events);
  assert.equal(g.ai.state, 'lost');
  assert.ok(evs.some((e) => e.kind === 'giveup'));
  // 探す → 戻る → 見回り
  let back = false;
  for (let i = 0; i < 30 * 20 && g.ai.state !== 'patrol'; i++) { L.updateGoblins(f, { x: 900, y: 2500 }, 1 / 30); if (g.ai.state === 'back') back = true; }
  assert.ok(back, '戻る');
  assert.equal(g.ai.state, 'patrol');
  assert.ok(Math.hypot(g.x - g.hx, g.y - g.hy) < 20, '家に戻っている');
});

test('ゴブリン: 離れて見失うと探す。1体が気づくと近くの仲間も少し遅れて気づく', () => {
  const f = flatField();
  const g = addGob(f, 'brute', 480, 1200, 0);
  const mate = addGob(f, 'shield', 380, 1250, Math.PI);
  mate.ai.wait = 99;
  const far = addGob(f, 'shaman', 480, 2400, Math.PI);
  far.ai.wait = 99;
  const p = { x: 600, y: 1200 };
  L.updateGoblins(f, p, 1 / 30);
  assert.equal(g.ai.state, 'notice');
  assert.equal(mate.ai.state, 'patrol', 'すぐには気づかない');
  assert.ok(mate.ai.alert > 0);
  for (let i = 0; i < 30; i++) L.updateGoblins(f, p, 1 / 30);
  assert.ok(['notice', 'chase'].includes(mate.ai.state), '少し遅れて気づく');
  assert.equal(far.ai.state, 'patrol', '遠くの仲間は気づかない');
  // 速さ：足の速いものはプレイヤーより速く、斧持ちは遅い
  const ai = (id) => DATA.goblins.find((x) => x.id === id).ai;
  assert.ok(ai('sneak').run > E.speed && ai('brute').run < E.speed);
  // 一定の距離を離れるとあきらめる
  const f2 = flatField();
  const g2 = addGob(f2, 'brute', 480, 1200, 0);
  g2.ai.state = 'chase';
  L.updateGoblins(f2, { x: 480 + ai('brute').view * E.giveUpK + 40, y: 1200 }, 1 / 30);
  assert.equal(g2.ai.state, 'lost');
});
