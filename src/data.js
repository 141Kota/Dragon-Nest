// =============================================================
//  DragonNest データ定義（内容を増やすときは、ここだけ触ればよい）
//  - 場所:       locations に1件追加（theme / field / eggTable / goblins / pool）
//  - 卵:         eggs に1件追加し、場所の eggTable から参照
//  - ゴブリン:   goblins に1件追加（battles で使うバトルと癖を指定）
//  - バトル:     src/battles/<file>.js を足し、battles に1行追加
//  - ドラゴン:   lineages（系統＝骨組み）と parts（各パーツ）に追加
//  - 施設:       facilities に1件追加（effect.type はロジックで合算）
// =============================================================

export const DATA = {
  version: 2,

  // ---------- 得意（4種類） ----------
  stats: [
    { id: 'pow', name: '力', color: '#c8644a' },
    { id: 'spd', name: '速さ', color: '#4f9fb0' },
    { id: 'dex', name: '器用さ', color: '#8fae4f' },
    { id: 'wit', name: '知恵', color: '#9a7ac8' },
  ],

  // ---------- ドラゴンの系統（骨組み） ----------
  // 横から見た右向きの座標で書く（地面は y=70。点は [x, y, 半径]）。描くときは 3D（前後・左右・高さ）に起こし、
  // 脚・腕・翼は左右に振り分け、向きに合わせて回して投影する。脚は far: false のものを左右の対で使う。
  // chains の各点列は根元→先端。parts は同じ系統の接続点（wing / spine / heads）に合わせて描かれる。
  // motion: 歩き方と待機の動き（slither くねる / stride 歩幅のある歩き / spread 翼を広げる / stomp 二足で踏む / sway 首を揺らす / drift 漂う）
  lineages: [
    {
      id: 'serpent', name: '蛇型', word: 'ヘビ竜', skill: '巻きつき', base: { pow: 2, spd: 3, dex: 4, wit: 2 },
      skeleton: {
        motion: 'slither',
        tail: { pts: [[-30, 58, 16], [-70, 62, 12], [-100, 52, 8], [-112, 34, 4]], sway: 6 },
        body: { pts: [[-30, 58, 17], [0, 64, 18], [30, 52, 17], [36, 22, 15], [18, -4, 14]] },
        necks: [{ pts: [[18, -4, 14], [12, -30, 12], [32, -52, 11]], sway: 4, head: { r: 17, snout: 14, ang: 0.15 } }],
        legs: [],
        wing: { at: [24, 10], scale: 0.55 },
        spine: { chain: 'body', from: 0.1, to: 1 },
      },
    },
    {
      id: 'quad', name: '四足型', word: '地竜', skill: '体当たり', base: { pow: 4, spd: 3, dex: 2, wit: 2 },
      skeleton: {
        motion: 'stride',
        tail: { pts: [[-36, 20, 16], [-72, 30, 11], [-104, 46, 6], [-122, 40, 3]], sway: 8 },
        body: { pts: [[-38, 20, 27], [-6, 14, 30], [26, 14, 26]] },
        necks: [{ pts: [[26, 10, 18], [46, -14, 14], [56, -32, 12]], sway: 3, head: { r: 19, snout: 13, ang: 0.1 } }],
        legs: [
          { hip: [-30, 30], knee: [-36, 50], foot: [-30, 70], w: 15, far: true },
          { hip: [18, 30], knee: [22, 50], foot: [24, 70], w: 14, far: true },
          { hip: [-22, 32], knee: [-28, 52], foot: [-20, 70], w: 16 },
          { hip: [28, 32], knee: [32, 52], foot: [34, 70], w: 15 },
        ],
        wing: { at: [-2, -6], scale: 0.8 },
        spine: { chain: 'body', from: 0, to: 1 },
      },
    },
    {
      id: 'wyvern', name: '翼竜型', word: '翼竜', skill: '急降下', base: { pow: 3, spd: 4, dex: 2, wit: 2 },
      skeleton: {
        motion: 'spread',
        tail: { pts: [[-16, 18, 12], [-56, 26, 8], [-96, 22, 5], [-128, 8, 2]], sway: 10 },
        body: { pts: [[-16, 18, 18], [6, 4, 19], [20, -12, 15]] },
        necks: [{ pts: [[20, -12, 11], [40, -40, 9], [58, -52, 8]], sway: 4, head: { r: 14, snout: 18, ang: 0.25 } }],
        legs: [
          { hip: [-6, 22], knee: [8, 44], foot: [-2, 70], w: 11, far: true },
          { hip: [2, 24], knee: [16, 46], foot: [8, 70], w: 12 },
        ],
        wing: { at: [6, -10], scale: 1.35 },
        spine: { chain: 'neck', from: 0, to: 0.8 },
      },
    },
    {
      id: 'biped', name: '二足型', word: '立ち竜', skill: '岩投げ', base: { pow: 3, spd: 2, dex: 3, wit: 3 },
      skeleton: {
        motion: 'stomp',
        tail: { pts: [[-14, 46, 18], [-52, 60, 13], [-90, 66, 8], [-118, 64, 3]], sway: 5 },
        body: { pts: [[-8, 46, 25], [0, 14, 24], [8, -16, 19]] },
        necks: [{ pts: [[8, -16, 15], [16, -36, 14], [26, -50, 13]], sway: 2, head: { r: 21, snout: 12, ang: 0.05 } }],
        legs: [
          { hip: [-12, 46], knee: [6, 56], foot: [-4, 70], w: 16, far: true },
          { hip: [0, 48], knee: [18, 58], foot: [10, 70], w: 18 },
        ],
        arms: [{ hip: [12, -2], knee: [26, 10], foot: [34, 4], w: 8 }],
        wing: { at: [-6, -10], scale: 0.6 },
        spine: { chain: 'body', from: 0.2, to: 1 },
      },
    },
    {
      id: 'hydra', name: '多頭型', word: '三つ首竜', skill: '三つの息', base: { pow: 4, spd: 1, dex: 2, wit: 4 },
      skeleton: {
        motion: 'sway',
        tail: { pts: [[-40, 32, 18], [-72, 44, 11], [-98, 54, 5]], sway: 5 },
        body: { pts: [[-40, 32, 30], [-6, 26, 34], [24, 28, 28]] },
        necks: [
          { pts: [[4, 6, 13], [-6, -30, 11], [4, -62, 10]], sway: 4, head: { r: 14, snout: 10, ang: -0.1 }, far: true },
          { pts: [[18, 8, 13], [30, -26, 11], [44, -50, 10]], sway: 4, head: { r: 15, snout: 11, ang: 0.05 } },
          { pts: [[26, 14, 13], [52, 0, 11], [72, -16, 10]], sway: 4, head: { r: 14, snout: 11, ang: 0.2 } },
        ],
        legs: [
          { hip: [-30, 44], knee: [-34, 56], foot: [-30, 70], w: 17, far: true },
          { hip: [14, 44], knee: [16, 56], foot: [18, 70], w: 16, far: true },
          { hip: [-22, 48], knee: [-24, 58], foot: [-20, 70], w: 18 },
          { hip: [22, 46], knee: [24, 58], foot: [26, 70], w: 17 },
        ],
        wing: { at: [-14, 2], scale: 0.7 },
        spine: { chain: 'body', from: 0, to: 0.8 },
      },
    },
    {
      id: 'wisp', name: '浮遊型', word: '浮き竜', skill: '霧まとい', base: { pow: 1, spd: 3, dex: 3, wit: 4 },
      skeleton: {
        motion: 'drift',
        float: 8,
        tail: { pts: [[-18, 6, 13], [-50, 0, 9], [-78, -18, 6], [-100, -10, 3], [-112, 8, 2]], sway: 12 },
        body: { pts: [[-18, 6, 24], [4, 2, 27]] },
        necks: [{ pts: [[4, -6, 18], [18, -20, 18], [24, -28, 18]], sway: 2, head: { r: 25, snout: 7, ang: 0 } }],
        legs: [
          { hip: [-8, 24], knee: [-10, 34], foot: [-6, 40], w: 8, far: true },
          { hip: [10, 24], knee: [10, 34], foot: [14, 40], w: 9 },
        ],
        wing: { at: [-6, -16], scale: 0.85 },
        spine: { chain: 'tail', from: 0, to: 0.7 },
      },
    },
  ],

  // ---------- パーツ（各5種類。stat は得意への加算） ----------
  partSlots: ['horns', 'wings', 'fins', 'tail', 'pattern', 'ornament', 'color'],
  partSlotNames: { horns: '角', wings: '翼', fins: '背びれ', tail: 'しっぽ', pattern: '模様', ornament: '飾り', color: '色' },
  // 図鑑の種類を決めるパーツ（シルエットが変わるもの）。残りは個体ごとの違い
  speciesSlots: ['lineage', 'horns', 'wings', 'tail'],

  parts: {
    horns: [
      { id: 'nub', name: '丸い角', adj: '丸角の', stat: { wit: 1 }, style: { kind: 'spike', len: 12, w: 11, bend: 0.1, n: 2 } },
      { id: 'single', name: '一本角', adj: '一本角の', stat: { pow: 1 }, style: { kind: 'spike', len: 30, w: 10, bend: 0.2, n: 1 } },
      { id: 'branch', name: '枝分かれの角', adj: '枝角の', stat: { dex: 1 }, style: { kind: 'branch', len: 28, w: 7, bend: 0.3, n: 2 } },
      { id: 'curl', name: '巻き角', adj: '巻き角の', stat: { wit: 1 }, style: { kind: 'curl', len: 26, w: 10, bend: 1, n: 2 } },
      { id: 'great', name: '大きな角', adj: '大角の', stat: { pow: 2 }, style: { kind: 'spike', len: 44, w: 14, bend: 0.5, n: 2 } },
    ],
    wings: [
      { id: 'none', name: '翼なし', stat: { dex: 1 }, style: { kind: 'none' } },
      { id: 'small', name: '小さな翼', stat: { spd: 1 }, style: { kind: 'membrane', span: 46, h: 34 } },
      { id: 'great', name: '大きな翼', stat: { spd: 2 }, style: { kind: 'membrane', span: 92, h: 70 } },
      { id: 'feather', name: '羽根の翼', stat: { spd: 1, wit: 1 }, style: { kind: 'feather', span: 70 } },
      { id: 'leaf', name: '葉の翼', stat: { dex: 1, spd: 1 }, style: { kind: 'leaf', span: 58 } },
    ],
    fins: [
      { id: 'none', name: 'なし', stat: {}, style: { kind: 'none' } },
      { id: 'spikes', name: 'とげ', stat: { pow: 1 }, style: { kind: 'spikes', size: 12 } },
      { id: 'plates', name: '板', stat: { pow: 1 }, style: { kind: 'plates', size: 15 } },
      { id: 'sail', name: '帆', stat: { spd: 1 }, style: { kind: 'sail', size: 20 } },
      { id: 'mane', name: 'たてがみ', stat: { wit: 1 }, style: { kind: 'mane', size: 14 } },
    ],
    tail: [
      { id: 'plain', name: '細いしっぽ', stat: { spd: 1 }, style: { len: 1.0, tip: 'plain' } },
      { id: 'club', name: 'こぶのしっぽ', stat: { pow: 1 }, style: { len: 0.8, tip: 'club' } },
      { id: 'blade', name: 'ひれのしっぽ', stat: { spd: 1 }, style: { len: 1.1, tip: 'blade' } },
      { id: 'leaf', name: '葉のしっぽ', stat: { dex: 1 }, style: { len: 1.0, tip: 'leaf' } },
      { id: 'flame', name: '炎のしっぽ', stat: { pow: 1 }, style: { len: 1.15, tip: 'flame' } },
    ],
    pattern: [
      { id: 'plain', name: '無地' },
      { id: 'spots', name: 'ぶち' },
      { id: 'stripes', name: 'しま' },
      { id: 'scales', name: 'うろこ' },
      { id: 'rings', name: '輪' },
    ],
    ornament: [
      { id: 'none', name: 'なし', stat: {} },
      { id: 'armor', name: '鎧', stat: { pow: 1 } },
      { id: 'gem', name: '額の宝石', stat: { wit: 1 } },
      { id: 'scar', name: '古い傷', stat: { pow: 1 } },
      { id: 'charm', name: '首飾り', stat: { dex: 1 } },
    ],
    color: [
      { id: 'moss', name: '苔色', main: '#5d7f4e', light: '#8faa72', dark: '#2f4a2e', belly: '#c9c7a0', accent: '#2c3f2a', eye: '#e8c35a', horn: '#d8ccb0',
        shiny: { main: '#b08a3e', light: '#dcc07a', dark: '#5f4520', belly: '#efe2bd', accent: '#4a3518' } },
      { id: 'pine', name: '松葉色', main: '#3f6a62', light: '#6f9a8e', dark: '#1f3a36', belly: '#b8c7b0', accent: '#1a2e2b', eye: '#f0d070', horn: '#cfc4a8',
        shiny: { main: '#8a8fb8', light: '#bfc2e0', dark: '#3d4066', belly: '#e6e6f2', accent: '#2a2c4a' } },
      { id: 'tide', name: '潮色', main: '#3f6f93', light: '#77a2c0', dark: '#1e3954', belly: '#c8d6d8', accent: '#18304a', eye: '#f2d68a', horn: '#e0d8c4',
        shiny: { main: '#9b6f9e', light: '#c9a2c8', dark: '#4e3052', belly: '#efdcec', accent: '#3a2040' } },
      { id: 'pearl', name: '貝殻色', main: '#9c8a7a', light: '#c9b9a6', dark: '#4f4238', belly: '#ebe1d2', accent: '#3d332c', eye: '#5fb0c0', horn: '#f0e8d8',
        shiny: { main: '#5f9ea0', light: '#9ccfcf', dark: '#2a5254', belly: '#e0f2ef', accent: '#1e3c3e' } },
      { id: 'ember', name: '熾火色', main: '#9a4632', light: '#c97a5a', dark: '#4e1f16', belly: '#e0b48a', accent: '#3a1510', eye: '#ffcf5a', horn: '#e6d6bc',
        shiny: { main: '#3f3a4f', light: '#6c6584', dark: '#1a1724', belly: '#f0a050', accent: '#ff9b3d' } },
      { id: 'obsidian', name: '黒曜色', main: '#4a4250', light: '#776c80', dark: '#1e1a24', belly: '#a89a8a', accent: '#c4553a', eye: '#ff8a3d', horn: '#c8bca8',
        shiny: { main: '#a8a8b8', light: '#d8d8e4', dark: '#4e4e60', belly: '#f2f2f6', accent: '#6a8ad0' } },
    ],
  },

  dragon: {
    maxLevel: 5,
    teamMax: 3,
    // レベルごとの得意の加算
    levelBonus: [0, 0, 1, 1, 2, 3],
  },

  // ---------- 卵 ----------
  rarities: {
    first: { name: 'はじめて', hatchSec: 20, shinyChance: 0, rareBoost: 1, stars: 1 },
    common: { name: 'ふつう', hatchSec: 180, shinyChance: 0.03, rareBoost: 1, stars: 1 },
    rare: { name: 'レア', hatchSec: 600, shinyChance: 0.08, rareBoost: 3, stars: 2 },
    epic: { name: '特別', hatchSec: 1800, shinyChance: 0.25, rareBoost: 6, stars: 3 },
  },

  eggs: {
    first: { name: 'はじめての卵', rarity: 'first', shell: '#d8cfb8', shellDark: '#8f8268', mark: '#6f8f5a', pattern: 'spots' },
    forest_common: { name: '森の卵', rarity: 'common', shell: '#a9bf92', shellDark: '#55704a', mark: '#3f5a36', pattern: 'spots' },
    forest_rare: { name: '苔むした卵', rarity: 'rare', shell: '#7f9f6a', shellDark: '#3a5232', mark: '#d8c46a', pattern: 'zigzag' },
    sea_common: { name: '浜の卵', rarity: 'common', shell: '#a9c4d2', shellDark: '#4f7088', mark: '#2f5470', pattern: 'stripes' },
    sea_rare: { name: '真珠の卵', rarity: 'rare', shell: '#e2dcd8', shellDark: '#9a8c94', mark: '#b07a90', pattern: 'spots' },
    volcano_common: { name: '火山の卵', rarity: 'common', shell: '#c99a7e', shellDark: '#7a4a36', mark: '#a8402f', pattern: 'zigzag' },
    volcano_rare: { name: '溶岩の卵', rarity: 'rare', shell: '#4d4048', shellDark: '#241c22', mark: '#ff8a3d', pattern: 'stripes' },
    star: { name: '星の卵', rarity: 'epic', shell: '#3a4478', shellDark: '#1a2048', mark: '#ffe08a', pattern: 'stars' },
  },

  // ---------- 場所 ----------
  // pool: 出る系統とパーツ（rare:true はレア卵で出やすい）
  // field: 探索フィールドの作り（barrier は道をふさぐ地形の種類）
  locations: [
    {
      id: 'forest', name: 'ささやきの森', desc: '霧の立つ深い森。苔むした岩と小川がある',
      weather: 'leaves',
      theme: {
        skyTop: '#a3c4bd', skyBottom: '#dde7d2', far: '#93b2a4', mid: '#7f9f83', ground: '#9cb878', groundDark: '#7c9a5d',
        path: '#cdbf94', obstacle: 'tree', obMain: '#5f8f5a', obDark: '#41693f', obTrunk: '#7a5a40', water: '#6fa8b4', cliff: '#a39780', bush: '#6c9a5c', accent: '#4f7a2e',
      },
      field: { barriers: ['river', 'bush', 'cliff'] },
      eggTable: [{ egg: 'forest_common', w: 72 }, { egg: 'forest_rare', w: 24 }, { egg: 'star', w: 4 }],
      goblins: [{ id: 'sneak', w: 40 }, { id: 'brute', w: 20 }, { id: 'shaman', w: 20 }, { id: 'shield', w: 20 }],
      pool: {
        lineage: [{ id: 'quad', w: 3 }, { id: 'biped', w: 2 }, { id: 'wisp', w: 2, rare: true }],
        horns: [{ id: 'branch', w: 3 }, { id: 'nub', w: 2 }],
        wings: [{ id: 'leaf', w: 3 }, { id: 'none', w: 2, rare: true }],
        fins: [{ id: 'mane', w: 3 }, { id: 'none', w: 2 }],
        tail: [{ id: 'leaf', w: 3 }, { id: 'plain', w: 2 }],
        pattern: [{ id: 'spots', w: 3 }, { id: 'stripes', w: 2 }],
        ornament: [{ id: 'none', w: 4 }, { id: 'charm', w: 1, rare: true }],
        color: [{ id: 'moss', w: 3 }, { id: 'pine', w: 2 }],
      },
    },
    {
      id: 'sea', name: 'しおかぜの浜', desc: '波が打ち寄せる浜辺。岩場と潮だまりが続く',
      weather: 'rain',
      theme: {
        skyTop: '#a0c2d8', skyBottom: '#e2ecee', far: '#90b0c4', mid: '#9cb9bc', ground: '#d9caa2', groundDark: '#b9a77e',
        path: '#ece0bf', obstacle: 'rock', obMain: '#8f9ba4', obDark: '#65717b', obTrunk: '#9aa8ae', water: '#5f9cb8', cliff: '#a99f8a', bush: '#7aa08e', accent: '#2f6a8a',
      },
      field: { barriers: ['river', 'cliff', 'river'] },
      eggTable: [{ egg: 'sea_common', w: 72 }, { egg: 'sea_rare', w: 24 }, { egg: 'star', w: 4 }],
      goblins: [{ id: 'sneak', w: 30 }, { id: 'shaman', w: 30 }, { id: 'brute', w: 20 }, { id: 'shield', w: 20 }],
      pool: {
        lineage: [{ id: 'serpent', w: 3 }, { id: 'hydra', w: 2, rare: true }, { id: 'wisp', w: 2 }],
        horns: [{ id: 'single', w: 3 }, { id: 'curl', w: 2, rare: true }],
        wings: [{ id: 'none', w: 3 }, { id: 'feather', w: 2 }],
        fins: [{ id: 'sail', w: 3 }, { id: 'spikes', w: 2 }],
        tail: [{ id: 'blade', w: 3 }, { id: 'plain', w: 2 }],
        pattern: [{ id: 'rings', w: 3 }, { id: 'scales', w: 2 }],
        ornament: [{ id: 'none', w: 4 }, { id: 'gem', w: 1, rare: true }],
        color: [{ id: 'tide', w: 3 }, { id: 'pearl', w: 2 }],
      },
    },
    {
      id: 'volcano', name: 'けむりの火山', desc: '灰の舞う黒い山。溶岩の川と崖がある',
      weather: 'ash',
      theme: {
        skyTop: '#d2a898', skyBottom: '#f0dcc8', far: '#b98c82', mid: '#a47e72', ground: '#b29a8c', groundDark: '#8f766a',
        path: '#d0b9a6', obstacle: 'crag', obMain: '#82706a', obDark: '#5e4e4e', obTrunk: '#ff7a3d', water: '#d8602e', cliff: '#8a7674', bush: '#9a7a68', accent: '#b84a2a',
      },
      field: { barriers: ['cliff', 'river', 'cliff'] },
      eggTable: [{ egg: 'volcano_common', w: 70 }, { egg: 'volcano_rare', w: 25 }, { egg: 'star', w: 5 }],
      goblins: [{ id: 'brute', w: 35 }, { id: 'sneak', w: 20 }, { id: 'shaman', w: 25 }, { id: 'shield', w: 20 }],
      pool: {
        lineage: [{ id: 'wyvern', w: 3 }, { id: 'hydra', w: 2 }, { id: 'biped', w: 2, rare: true }],
        horns: [{ id: 'great', w: 3 }, { id: 'curl', w: 2 }],
        wings: [{ id: 'great', w: 3 }, { id: 'small', w: 2 }],
        fins: [{ id: 'plates', w: 3 }, { id: 'spikes', w: 2 }],
        tail: [{ id: 'flame', w: 3, rare: true }, { id: 'club', w: 3 }],
        pattern: [{ id: 'scales', w: 3 }, { id: 'plain', w: 2 }],
        ornament: [{ id: 'scar', w: 3 }, { id: 'armor', w: 1, rare: true }],
        color: [{ id: 'ember', w: 3 }, { id: 'obsidian', w: 2 }],
      },
    },
  ],

  // ---------- バトル（1行=1種類。file は src/battles/ のファイル名） ----------
  // stats: そのバトルで効く得意（説明用）。control: ルールカードの操作アイコン
  battles: [
    { id: 'chase', file: 'chase', name: '追跡', rule: '逃げるゴブリンを追いかけて、体当たりで捕まえる', control: 'stick', time: 30, stats: ['spd', 'pow'] },
    { id: 'trap', file: 'trap', name: '罠解除', rule: '押すと隣の罠も切り替わる。全部外せば成功', control: 'tap', time: 35, stats: ['wit', 'dex'] },
    { id: 'surround', file: 'surround', name: '包囲', rule: 'ドラゴンを置いて、ゴブリンの逃げ道をふさぐ', control: 'tap', time: 40, stats: ['wit', 'pow'] },
    { id: 'defense', file: 'defense', name: '防衛', rule: '卵に近づくゴブリンをタップして追い払う', control: 'tap', time: 25, stats: ['dex', 'spd'] },
    { id: 'drum', file: 'drum', name: '太鼓', rule: '音の輪が重なった瞬間にタップして踊る', control: 'tap', time: 28, stats: ['dex', 'wit'] },
  ],

  // ---------- ゴブリン ----------
  // battles: 使うバトルと重み、quirk はバトル内の癖（各バトルのファイルが読む）
  // ai: フィールドでの行動。patrol は見回りの癖（wander うろうろ / pace 行ったり来たり / circle 巣のまわりを回る /
  //     look 立ち止まって周りを見る）、walk・run は歩く・走る速さ（プレイヤーは150）、view は気づく距離、fov は前の視界の半分の角度
  goblins: [
    {
      id: 'sneak', name: '足の速いゴブリン',
      look: { build: 'slim', skin: '#86a05e', skinDark: '#4f6538', cloth: '#5a4a6a', legs: '#4e4438', size: 0.92, ear: 1.25, hood: true, gear: 'sack' },
      ai: { patrol: 'wander', walk: 46, run: 172, view: 210, fov: 1.0, pause: 0.7 },
      battles: [
        { id: 'chase', w: 4, quirk: { speed: 1.15, jink: 1.4 } },
        { id: 'trap', w: 2, quirk: { size: 3, scramble: 3 } },
        { id: 'surround', w: 2, quirk: { rocks: 10, double: 0 } },
        { id: 'defense', w: 2, quirk: { count: 9, hp: 1, speed: 1.1 } },
        { id: 'drum', w: 1, quirk: { bpm: 96, offbeat: 0.15 } },
      ],
    },
    {
      id: 'brute', name: '斧持ちゴブリン',
      look: { build: 'broad', skin: '#93a04e', skinDark: '#5d6632', cloth: '#7e4430', legs: '#4a3a2e', size: 1.12, ear: 0.95, hood: false, gear: 'club' },
      ai: { patrol: 'pace', walk: 32, run: 124, view: 185, fov: 0.85, pause: 1.3 },
      battles: [
        { id: 'chase', w: 1, quirk: { speed: 0.9, jink: 0.6 } },
        { id: 'trap', w: 2, quirk: { size: 3, scramble: 4 } },
        { id: 'surround', w: 3, quirk: { rocks: 12, double: 0 } },
        { id: 'defense', w: 4, quirk: { count: 7, hp: 2, speed: 0.85 } },
        { id: 'drum', w: 2, quirk: { bpm: 88, offbeat: 0.05 } },
      ],
    },
    {
      id: 'shaman', name: '罠師ゴブリン',
      look: { build: 'robe', skin: '#76927e', skinDark: '#44604f', cloth: '#45567a', legs: '#3e4450', size: 0.96, ear: 1.4, hood: true, gear: 'drum' },
      ai: { patrol: 'circle', walk: 36, run: 136, view: 235, fov: 1.15, pause: 0.5 },
      battles: [
        { id: 'chase', w: 1, quirk: { speed: 1.0, jink: 2.0 } },
        { id: 'trap', w: 3, quirk: { size: 4, scramble: 4 } },
        { id: 'surround', w: 2, quirk: { rocks: 9, double: 0.25 } },
        { id: 'defense', w: 1, quirk: { count: 8, hp: 1, speed: 1.0 } },
        { id: 'drum', w: 4, quirk: { bpm: 104, offbeat: 0.3 } },
      ],
    },
    {
      id: 'shield', name: '盾持ちゴブリン',
      look: { build: 'stocky', skin: '#8a9a62', skinDark: '#56643a', cloth: '#6a5a44', legs: '#4a4034', size: 1.02, ear: 1.05, hood: false, gear: 'shield' },
      ai: { patrol: 'look', walk: 30, run: 116, view: 200, fov: 1.2, pause: 1.6 },
      battles: [
        { id: 'chase', w: 1, quirk: { speed: 0.85, jink: 0.8 } },
        { id: 'trap', w: 2, quirk: { size: 3, scramble: 5 } },
        { id: 'surround', w: 4, quirk: { rocks: 11, double: 0.1 } },
        { id: 'defense', w: 3, quirk: { count: 7, hp: 3, speed: 0.8 } },
        { id: 'drum', w: 1, quirk: { bpm: 92, offbeat: 0.1 } },
      ],
    },
  ],

  // 結果の段階ごとの報酬（fail は卵を1つ奪われる）
  battleRewards: {
    great: { name: '大成功', eggs: 2, shards: [4, 6], stoneChance: 0.6 },
    good: { name: '成功', eggs: 1, shards: [2, 4], stoneChance: 0.2 },
    fail: { name: '失敗', eggs: 0, shards: [0, 0], stoneChance: 0, steal: 1 },
  },

  // ---------- アイテム ----------
  items: {
    stone: { name: 'ぬくもり石', desc: '孵化を早める', reduceSec: 300 },
    shard: { name: '星のかけら', desc: '施設を作る材料' },
  },

  // ---------- 探索 ----------
  explore: {
    width: 960,
    depth: 2600,
    speed: 150, // 1秒に進む距離
    playerR: 16,
    bandCount: 3, // 道をふさぐ地形の帯の数
    nests: 3,
    chests: 3,
    springs: 1,
    goblins: 3,
    obstacles: 34,
    // ゴブリンの行動（見回り → 気づく → 追跡 → 見失う → 戻る）
    contactR: 34, // 触れたらバトル
    goblinR: 14,
    patrolR: 90, // 見回りの範囲（家からの距離）
    runStick: 0.75, // スティックをこれ以上倒すと走る
    runK: 1.4, // 走っていると気づかれる距離がのびる
    bushK: 0.5, // 茂みのそばでは縮む
    bushR: 45,
    sideK: 0.32, // 横や後ろは見えにくい（気づく距離にかける）
    noticePause: 0.6, // 気づいてから走り出すまで
    loseTime: 1.4, // 見えなくなってから見失うまで
    searchTime: 3.0, // 「？」で探す時間
    giveUpK: 1.8, // 追跡中、気づく距離のこの倍だけ離れるとあきらめる
    alertR: 320, // 1体が気づくと、この距離にいる仲間も少し遅れて気づく
    behindAngle: 1.9, // 後ろから触れたとみなす角度
    trackR: 34, // 足跡に気づく距離
    springReduceSec: 120,
    chestShards: [2, 4],
    chestStoneChance: 0.35,
    hatchReduceOnDepart: 90,
    bagMax: 6,
  },

  // ---------- 拠点・施設 ----------
  base: {
    eggSlots: 2,
    storageMax: 8,
    overflowShards: 2,
    startShards: 5,
    startStones: 1,
  },

  // effect.type: eggSlots / hatchSpeed / teamStat
  facilities: [
    {
      id: 'straw', name: 'わらの寝床', desc: '卵を置ける場所が1つ増える',
      maxLevel: 2, cost: [8, 20], effect: { type: 'eggSlots', perLevel: 1 }, spot: { x: -0.62, y: -0.18 }, look: 'straw',
    },
    {
      id: 'hearth', name: 'ぬくもりのかまど', desc: '卵が早く孵る（1段階で15%）',
      maxLevel: 3, cost: [6, 15, 30], effect: { type: 'hatchSpeed', perLevel: 0.15 }, spot: { x: 0.62, y: -0.2 }, look: 'hearth',
    },
    {
      id: 'tower', name: '見張り台', desc: 'バトルで全員の得意が上がる（1段階で+1）',
      maxLevel: 3, cost: [6, 15, 30], effect: { type: 'teamStat', perLevel: 1 }, spot: { x: 0.0, y: -0.66 }, look: 'tower',
    },
  ],
};

export const byId = (list, id) => list.find((x) => x.id === id) || null;
export const part = (slot, id) => (slot === 'lineage' ? byId(DATA.lineages, id) : byId(DATA.parts[slot], id));
export const locationById = (id) => byId(DATA.locations, id);
export const goblinById = (id) => byId(DATA.goblins, id);
export const facilityById = (id) => byId(DATA.facilities, id);
export const battleById = (id) => byId(DATA.battles, id);
export const lineageById = (id) => byId(DATA.lineages, id);
