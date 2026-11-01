# Dragon Nest（ドラゴンの巣）

卵を探して拾い、孵してドラゴンを集める iPhone Safari 向けのゲームです（縦画面・タップとドラッグ）。
仕様は [docs/game_spec.md](docs/game_spec.md)。

## 遊び方
- リポジトリ直下の `index.html` を開くと起動します（GitHub Pages でそのまま公開できます）。
- ローカルで試すときは ES Modules のため HTTP サーバー経由で開いてください（例: `python3 -m http.server`）。
- パソコンでは探索・追跡を矢印キー / WASD でも動かせます。

## 構成
| ファイル | 役割 |
| --- | --- |
| `src/data.js` | **データ定義（場所・卵・ゴブリン・バトル・ドラゴンの系統とパーツ・施設）を1か所に集約** |
| `src/logic.js` | ロジック（孵化・図鑑・チームと得意・バトルの入口と報酬・探索フィールド）。DOM なし |
| `src/rig.js` | 骨組み描画の共通部品。体を1つの連続した輪郭で描き、線の太さと光の向き（左上）を全キャラでそろえる |
| `src/dragon.js` | ドラゴン描画。しっぽの先〜胴〜首〜頭を1本の背骨にし、角・背びれ・翼を背骨の決まった点に接続。息・追従・羽ばたきも骨組みから作る |
| `src/figures.js` | プレイヤーとゴブリン（同じ骨組み方式）。立ち・歩き・勝利・失敗の動き |
| `src/battles/*.js` | バトル5種（追跡・罠解除・包囲・防衛・太鼓）。1ファイル1種類 |
| `src/scenes/*.js` | 拠点・探索先えらび・探索・バトルの枠・図鑑 |
| `src/draw.js` / `src/ui.js` | 共通描画（色・文字の自動縮小・折り返し）/ 入力（タップ・スティック・複数の指・スクロール） |

### 入力とスクロール
- スクロールできる画面では、ボタンの上から触ってもドラッグでスクロールできます。指が 8px（`DRAG_PX`）以上動いたらスクロールとして扱い、ボタンの反応は取り消します。
- 縦のパン操作（`touch-action: pan-y` 相当）は `src/ui.js` が自分で扱います。ブラウザに任せると iOS Safari ではドラッグ中に `pointercancel` が来るため、canvas は `touch-action: none` のままにしています。

### バトルの背景
- 説明カード・バトル中・結果はどれも、探索していたフィールドをそのまま背景に映します（`explore.backdrop()`。暗くする幕は掛けず、カメラだけ少し寄る）。
- 説明カードと結果は画面の下に小さく出し、フィールドとキャラを隠しません。

## 拡張のしかた
- **場所**: `DATA.locations` に1件追加（`theme`・`field`・`eggTable`・`goblins`・`pool`）。図鑑ページも自動で増えます。
- **バトル**: `src/battles/<名前>.js` を足し、`DATA.battles` に1行追加。ゴブリンの `battles` で使うバトルと癖（`quirk`）を指定します。
  - バトルは `export default function (input, env)` を持ち、`update(dt)` / `draw(ctx, area, t, info)` / `result` / `timeUp()` を返します。
  - `input` は全バトル共通（連れているドラゴン・得意・ゴブリン・癖・有利かどうか）。結果は `great` / `good` / `fail` の3段階。
- **ドラゴンの系統**: `DATA.lineages` に骨組み（胴・首・しっぽの点列、脚、翼の根元、背骨）を1件追加。
- **パーツ**: `DATA.parts.<種類>` に1件追加。図鑑の種類は「系統・角・翼・しっぽ」の組み合わせです。
- **ゴブリン**: `DATA.goblins` に追加。`look.build`（slim / broad / stocky / robe）と `look.gear`（sack / club / drum / shield）で体格と装備が変わります。
- **卵・施設**: `DATA.eggs` / `DATA.facilities` に追加。

## テスト
```bash
npm test
```
