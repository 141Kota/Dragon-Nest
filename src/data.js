// =============================================================
//  DragonNest ゲームデータ定義（ここだけ触れば内容を増やせる）
//  - 場所を足す:   locations に1件追加（eggs / pool を指定）
//  - 卵を足す:     eggs に1件追加し、場所の eggTable から参照
//  - ゴブリン:     goblins に1件追加し、場所の goblins から参照
//  - パーツ:       parts.<種類> に1件追加（style は dragon.js の描き方）
//  - 施設:         facilities に1件追加（effect.type はロジックで合算）
// =============================================================

export const DATA = {
  version: 1,

  // ---------- ドラゴンの骨組み（全パーツ共通の接続点） ----------
  // 右向き、ローカル座標。地面は groundY。
  skeleton: {
    groundY: 72,
    torso: { x: 0, y: 22 },
    neckBack: { x: 14, y: 2 },
    neckFront: { x: 36, y: 22 },
    head: { x: 60, y: -30 },
    eye: { x: 66, y: -34 },
    hornBase: { x: 54, y: -44 },
    hornBaseFar: { x: 44, y: -42 },
    wingRoot: { x: -4, y: -4 },
    wingRootFar: { x: 8, y: -8 },
    tailRoot: { x: -36, y: 32 },
    legs: { backFar: -14, frontFar: 32, back: -26, front: 20 },
    ridge: { from: -36, to: 22 },
  },

  partSlots: ['body', 'wings', 'horns', 'tail', 'pattern', 'color'],
  partSlotNames: { body: 'からだ', wings: 'つばさ', horns: 'つの', tail: 'しっぽ', pattern: 'もよう', color: 'いろ' },

  // ---------- ドラゴンのパーツ（各5種類） ----------
  parts: {
    body: [
      { id: 'round', name: 'まんまる', word: 'まるりゅう', skill: 'roll', style: { rx: 46, ry: 36, headR: 24, snout: 9, legW: 15 } },
      { id: 'tiny', name: 'ちびっこ', word: 'ちびりゅう', skill: 'peck', style: { rx: 41, ry: 31, headR: 26, snout: 6, legW: 12 } },
      { id: 'slim', name: 'すらり', word: 'すらりゅう', skill: 'dash', style: { rx: 45, ry: 28, headR: 19, snout: 16, legW: 11 } },
      { id: 'sturdy', name: 'がっしり', word: 'いわりゅう', skill: 'slam', style: { rx: 50, ry: 35, headR: 22, snout: 14, legW: 18 } },
      { id: 'long', name: 'ながどう', word: 'ながりゅう', skill: 'coil', style: { rx: 56, ry: 28, headR: 19, snout: 17, legW: 11 } },
    ],
    wings: [
      { id: 'small', name: 'ちいさなはね', style: { kind: 'membrane', span: 40, h: 34 } },
      { id: 'leaf', name: 'はっぱのはね', style: { kind: 'leaf', span: 52 } },
      { id: 'bat', name: 'おおきなまく', style: { kind: 'membrane', span: 80, h: 64 } },
      { id: 'feather', name: 'はねかざり', style: { kind: 'feather', span: 62 } },
      { id: 'fin', name: 'ひれのはね', style: { kind: 'fin', span: 54 } },
    ],
    horns: [
      { id: 'nub', name: 'こぶづの', style: { kind: 'spike', len: 13, w: 11, bend: 0.1 } },
      { id: 'straight', name: 'まっすぐづの', style: { kind: 'spike', len: 26, w: 9, bend: 0.25 } },
      { id: 'antler', name: 'えだづの', style: { kind: 'antler', len: 28, w: 7, bend: 0.3 } },
      { id: 'curl', name: 'まきづの', style: { kind: 'spike', len: 30, w: 10, bend: 1.0 } },
      { id: 'great', name: 'おおづの', style: { kind: 'spike', len: 42, w: 14, bend: 0.55 } },
    ],
    tail: [
      { id: 'short', name: 'みじかいしっぽ', style: { len: 34, w: 15, curl: 6, tip: 'plain' } },
      { id: 'leafy', name: 'はっぱしっぽ', style: { len: 54, w: 14, curl: 16, tip: 'leaf' } },
      { id: 'finned', name: 'ひれしっぽ', style: { len: 62, w: 13, curl: 10, tip: 'fin' } },
      { id: 'club', name: 'とげしっぽ', style: { len: 52, w: 16, curl: 4, tip: 'club' } },
      { id: 'flame', name: 'ほのおしっぽ', style: { len: 58, w: 14, curl: 20, tip: 'flame' } },
    ],
    pattern: [
      { id: 'plain', name: 'むじ' },
      { id: 'spots', name: 'ぶち' },
      { id: 'stripes', name: 'しま' },
      { id: 'belly', name: 'おなかいた' },
      { id: 'scales', name: 'うろこ' },
    ],
    color: [
      {
        id: 'leaf', name: 'わかば', word: 'わかば', skill: 'vine',
        main: '#7cc76a', light: '#b5e59a', dark: '#4c8f4a', belly: '#eef6c8', accent: '#3f7a46', eye: '#2c3a2a',
        shiny: { main: '#e9d36b', light: '#fff2a6', dark: '#b39a3a', belly: '#fffbe0', accent: '#c07b2f' },
      },
      {
        id: 'sun', name: 'ひだまり', word: 'ひだまり', skill: 'sunflash',
        main: '#f4c95d', light: '#ffe8a3', dark: '#c99a32', belly: '#fff6dc', accent: '#e08a3c', eye: '#3b2f22',
        shiny: { main: '#f7f3ff', light: '#ffffff', dark: '#b7b0d9', belly: '#ffffff', accent: '#8f86d6' },
      },
      {
        id: 'sea', name: 'うみいろ', word: 'うみいろ', skill: 'bubble',
        main: '#6ab3e8', light: '#b4dcf7', dark: '#3f7bb5', belly: '#e6f5ff', accent: '#2f5f9c', eye: '#1f2c40',
        shiny: { main: '#b49cf0', light: '#dccfff', dark: '#7a62bf', belly: '#f4eeff', accent: '#5a3f9e' },
      },
      {
        id: 'coral', name: 'さんご', word: 'さんご', skill: 'song',
        main: '#f49ab0', light: '#ffd1dc', dark: '#c76a84', belly: '#fff0f3', accent: '#d9567a', eye: '#3a2230',
        shiny: { main: '#8ee0d0', light: '#c9fff4', dark: '#4fa597', belly: '#effffb', accent: '#2f8a7c' },
      },
      {
        id: 'ember', name: 'ひいろ', word: 'ひいろ', skill: 'fire',
        main: '#e8644f', light: '#ffa98f', dark: '#a8402f', belly: '#ffe3c9', accent: '#7a2a22', eye: '#2a1714',
        shiny: { main: '#4b4a63', light: '#7a789a', dark: '#2a293d', belly: '#ffcf6b', accent: '#ff9b3d' },
      },
    ],
  },

  // ---------- 技（色で1つ、Lv3でからだの技が増える） ----------
  // damage: 予告に関係なく与えるダメージ / gauge: 逃走ゲージの増減
  skills: {
    vine: { name: 'つるしばり', desc: 'つるでしばって ゲージをもどす', damage: 1, gauge: -15 },
    sunflash: { name: 'ひかりのはね', desc: 'まぶしい光でこうげき', damage: 3, gauge: 5 },
    bubble: { name: 'あわのまく', desc: 'あわで足どめ ゲージを大きくもどす', damage: 0, gauge: -25 },
    song: { name: 'さんごのうた', desc: 'うたでねむらせ ゲージをもどす', damage: 2, gauge: -10 },
    fire: { name: 'ほのおのいき', desc: 'つよいほのおでこうげき', damage: 4, gauge: 10 },
    roll: { name: 'ころがりアタック', desc: 'まるくなってたいあたり', damage: 3, gauge: 0 },
    peck: { name: 'ちびつっつき', desc: 'すばやくつつく', damage: 2, gauge: -5 },
    dash: { name: 'かぜのダッシュ', desc: 'すばやくまわりこむ', damage: 2, gauge: -10 },
    slam: { name: 'いわおとし', desc: 'おもいいちげき', damage: 4, gauge: 5 },
    coil: { name: 'ぐるぐるまき', desc: 'まきついてにがさない', damage: 1, gauge: -20 },
  },

  dragon: {
    maxLevel: 5,
    bodySkillLevel: 3, // このレベルからからだの技も使える
    powerByLevel: [0, 1, 1, 2, 2, 3], // 守る・かわす・反撃が当たったときの追加ダメージ
  },

  // ---------- 卵 ----------
  rarities: {
    first: { name: 'はじめて', hatchSec: 20, shinyChance: 0, rareBoost: 1, stars: 1 },
    common: { name: 'ふつう', hatchSec: 180, shinyChance: 0.03, rareBoost: 1, stars: 1 },
    rare: { name: 'レア', hatchSec: 600, shinyChance: 0.08, rareBoost: 3, stars: 2 },
    epic: { name: 'とくべつ', hatchSec: 1800, shinyChance: 0.25, rareBoost: 6, stars: 3 },
  },

  eggs: {
    first: { name: 'はじめてのたまご', rarity: 'first', shell: '#f3ead2', shellDark: '#d6c49a', mark: '#9fd08c', pattern: 'spots' },
    forest_common: { name: 'もりのたまご', rarity: 'common', shell: '#d9efc2', shellDark: '#9ec486', mark: '#6aa85a', pattern: 'spots' },
    forest_rare: { name: 'こけむしたたまご', rarity: 'rare', shell: '#b7dd9a', shellDark: '#6f9f57', mark: '#f2e48a', pattern: 'zigzag' },
    sea_common: { name: 'うみのたまご', rarity: 'common', shell: '#d4ebfa', shellDark: '#8fbfe0', mark: '#5f9fd6', pattern: 'stripes' },
    sea_rare: { name: 'しんじゅのたまご', rarity: 'rare', shell: '#fbf3f7', shellDark: '#d8c3d6', mark: '#f2a7c0', pattern: 'spots' },
    volcano_common: { name: 'ほのおのたまご', rarity: 'common', shell: '#f6d0b5', shellDark: '#d48d66', mark: '#e0613f', pattern: 'zigzag' },
    volcano_rare: { name: 'ようがんのたまご', rarity: 'rare', shell: '#5d4a52', shellDark: '#352a33', mark: '#ff9a4a', pattern: 'stripes' },
    star: { name: 'ほしのたまご', rarity: 'epic', shell: '#3f4a8a', shellDark: '#252c5c', mark: '#ffe58a', pattern: 'stars' },
  },

  // ---------- 場所 ----------
  // pool: 場所ごとに出るパーツと重み（rare:true はレア卵で出やすい）
  locations: [
    {
      id: 'forest', name: 'ささやきの森', desc: 'みどりのドラゴンがすむ やさしい森',
      theme: {
        skyTop: '#bfe6c9', skyBottom: '#eaf6dc', ground: '#9fd38a', groundSide: '#6fa55e', path: '#e4d9a8', pathSide: '#b9a874',
        block: 'tree', blockMain: '#5fae5a', blockDark: '#3f8443', trunk: '#8a6343', grass: '#78c06a', accent: '#3f7a46',
      },
      eggTable: [{ egg: 'forest_common', w: 72 }, { egg: 'forest_rare', w: 24 }, { egg: 'star', w: 4 }],
      goblins: [{ id: 'sneak', w: 75 }, { id: 'brute', w: 25 }],
      pool: {
        body: [{ id: 'round', w: 3 }, { id: 'tiny', w: 2, rare: true }],
        wings: [{ id: 'small', w: 3 }, { id: 'leaf', w: 2, rare: true }],
        horns: [{ id: 'nub', w: 3 }, { id: 'antler', w: 2, rare: true }],
        tail: [{ id: 'short', w: 3 }, { id: 'leafy', w: 2, rare: true }],
        pattern: [{ id: 'spots', w: 3 }, { id: 'plain', w: 2 }],
        color: [{ id: 'leaf', w: 3 }, { id: 'sun', w: 1, rare: true }],
      },
    },
    {
      id: 'sea', name: 'しおかぜの浜', desc: 'なみの音がきこえる すなはま',
      theme: {
        skyTop: '#a9dcf5', skyBottom: '#e8f7ff', ground: '#f1e2b3', groundSide: '#cdb67e', path: '#fbf3d9', pathSide: '#d9c79a',
        block: 'coral', blockMain: '#f39ab0', blockDark: '#c76a84', trunk: '#d9c79a', grass: '#8fd0c4', accent: '#2f5f9c',
      },
      eggTable: [{ egg: 'sea_common', w: 72 }, { egg: 'sea_rare', w: 24 }, { egg: 'star', w: 4 }],
      goblins: [{ id: 'sneak', w: 60 }, { id: 'brute', w: 40 }],
      pool: {
        body: [{ id: 'slim', w: 3 }, { id: 'long', w: 2, rare: true }],
        wings: [{ id: 'fin', w: 3 }, { id: 'feather', w: 2, rare: true }],
        horns: [{ id: 'nub', w: 2 }, { id: 'straight', w: 2, rare: true }],
        tail: [{ id: 'finned', w: 3 }, { id: 'short', w: 2 }],
        pattern: [{ id: 'stripes', w: 3 }, { id: 'scales', w: 2, rare: true }],
        color: [{ id: 'sea', w: 3 }, { id: 'coral', w: 1, rare: true }],
      },
    },
    {
      id: 'volcano', name: 'けむりの火山', desc: 'あつい岩がごろごろ ならぶ山',
      theme: {
        skyTop: '#f3b49a', skyBottom: '#fde3cf', ground: '#8f6b63', groundSide: '#5f4440', path: '#c9a28f', pathSide: '#94705f',
        block: 'rock', blockMain: '#6d5650', blockDark: '#463431', trunk: '#ff8a3d', grass: '#c47a52', accent: '#a8402f',
      },
      eggTable: [{ egg: 'volcano_common', w: 70 }, { egg: 'volcano_rare', w: 25 }, { egg: 'star', w: 5 }],
      goblins: [{ id: 'sneak', w: 45 }, { id: 'brute', w: 55 }],
      pool: {
        body: [{ id: 'sturdy', w: 3 }, { id: 'slim', w: 2 }],
        wings: [{ id: 'bat', w: 3 }, { id: 'small', w: 2 }],
        horns: [{ id: 'great', w: 3 }, { id: 'curl', w: 2, rare: true }],
        tail: [{ id: 'club', w: 3 }, { id: 'flame', w: 2, rare: true }],
        pattern: [{ id: 'scales', w: 3 }, { id: 'belly', w: 2 }],
        color: [{ id: 'ember', w: 3 }, { id: 'sun', w: 1, rare: true }],
      },
    },
  ],

  // ---------- ゴブリン ----------
  // gaugeGood: 予告に合う行動をしたときのゲージ増加 / gaugeBad: 合わないとき
  goblins: [
    {
      id: 'sneak', name: 'こそどろゴブリン', hp: 6, gaugeGood: 20, gaugeBad: 34,
      intents: { rush: 2, scratch: 3, steal: 4 },
      reward: { shards: [3, 5], stoneChance: 0.3 },
      look: { skin: '#8fc46a', skinDark: '#5f8f45', cloth: '#7a5a8f', size: 0.9, ear: 1.2, hood: true },
    },
    {
      id: 'brute', name: 'のっしりゴブリン', hp: 8, gaugeGood: 16, gaugeBad: 28,
      intents: { rush: 5, scratch: 3, steal: 2 },
      reward: { shards: [5, 8], stoneChance: 0.5 },
      look: { skin: '#a3b85a', skinDark: '#6f7f3a', cloth: '#a0583f', size: 1.15, ear: 0.9, hood: false },
    },
  ],

  battle: {
    gaugeMax: 100,
    baseDamage: 2, // 予告に合う行動のダメージ
    counterMissDamage: 1, // 反撃が外れても少しだけ当たる
    intents: {
      rush: { name: 'とっしん', say: 'とっしんしてくる！', best: 'guard' },
      scratch: { name: 'ひっかき', say: 'ツメをふりあげた！', best: 'dodge' },
      steal: { name: 'ぬすむ構え', say: 'たまごをもって にげるきだ！', best: 'counter' },
    },
    actions: {
      guard: { name: 'まもる', hint: 'とっしんに つよい', color: '#6aa8e8' },
      dodge: { name: 'かわす', hint: 'ひっかきに つよい', color: '#7cc76a' },
      counter: { name: 'はんげき', hint: 'ぬすむ構えに つよい', color: '#ef8a5a' },
    },
    loseShards: 1,
  },

  // ---------- アイテム ----------
  items: {
    stone: { name: 'ぬくもり石', desc: '孵化をはやめる', reduceSec: 300 },
    shard: { name: 'ほしのかけら', desc: '施設をつくる材料' },
  },

  // ---------- 探索 ----------
  explore: {
    cols: 5,
    rows: 8,
    steps: 14, // 1回の探索で歩ける歩数
    maxMove: 3, // 1タップで進めるマス数
    blockRate: 0.22,
    visibleEggs: 2,
    shardSpots: 2,
    grassSpots: 5,
    grassTable: [
      { kind: 'egg', w: 32 },
      { kind: 'shards', w: 30 },
      { kind: 'stone', w: 10 },
      { kind: 'goblin', w: 18 },
      { kind: 'none', w: 10 },
    ],
    goblinRatePerMove: 0.08,
    maxGoblins: 2,
    hatchReduceOnDepart: 90, // 出発したとき孵化を何秒縮めるか
    hatchReducePerMove: 5, // 1回移動するたび何秒縮めるか
    shardsPerSpot: [1, 3],
  },

  // ---------- 拠点・施設 ----------
  base: {
    eggSlots: 2,
    storageMax: 8,
    overflowShards: 2, // 卵があふれたときの代わりのかけら
    startShards: 5,
    startStones: 1,
  },

  // effect.type: eggSlots / hatchSpeed / escapeSlow / battlePower
  facilities: [
    {
      id: 'straw', name: 'わらのベッド', desc: 'たまごを置ける場所がふえる',
      maxLevel: 2, cost: [8, 20], effect: { type: 'eggSlots', perLevel: 1 }, spot: { x: -0.64, y: -0.16 }, look: 'straw',
    },
    {
      id: 'hearth', name: 'ぬくもりのかまど', desc: 'たまごが はやく孵る（1段階 15%）',
      maxLevel: 3, cost: [6, 15, 30], effect: { type: 'hatchSpeed', perLevel: 0.15 }, spot: { x: 0.64, y: -0.18 }, look: 'hearth',
    },
    {
      id: 'tower', name: 'みはりやぐら', desc: 'ゴブリンが にげにくくなる（1段階 10%）',
      maxLevel: 3, cost: [6, 15, 30], effect: { type: 'escapeSlow', perLevel: 0.1 }, spot: { x: 0.0, y: -0.66 }, look: 'tower',
    },
  ],
};

export const byId = (list, id) => list.find((x) => x.id === id) || null;
export const part = (slot, id) => byId(DATA.parts[slot], id);
export const locationById = (id) => byId(DATA.locations, id);
export const goblinById = (id) => byId(DATA.goblins, id);
export const facilityById = (id) => byId(DATA.facilities, id);
