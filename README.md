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
| `src/dragon.js` | ドラゴン描画。系統ごとの骨組み（`DATA.lineages[].skeleton`）にパーツを接続 |
| `src/battles/*.js` | バトル5種（追跡・罠解除・包囲・防衛・太鼓）。1ファイル1種類 |
| `src/scenes/*.js` | 拠点・探索先えらび・探索・バトルの枠・図鑑 |
| `src/draw.js` / `src/ui.js` | 共通描画（文字の自動縮小・折り返し）/ 入力（タップ・スティック・複数の指） |

## 拡張のしかた
- **場所**: `DATA.locations` に1件追加（`theme`・`field`・`eggTable`・`goblins`・`pool`）。図鑑ページも自動で増えます。
- **バトル**: `src/battles/<名前>.js` を足し、`DATA.battles` に1行追加。ゴブリンの `battles` で使うバトルと癖（`quirk`）を指定します。
  - バトルは `export default function (input, env)` を持ち、`update(dt)` / `draw(ctx, area, t, info)` / `result` / `timeUp()` を返します。
  - `input` は全バトル共通（連れているドラゴン・得意・ゴブリン・癖・有利かどうか）。結果は `great` / `good` / `fail` の3段階。
- **ドラゴンの系統**: `DATA.lineages` に骨組み（胴・首・しっぽの点列、脚、翼の根元、背骨）を1件追加。
- **パーツ**: `DATA.parts.<種類>` に1件追加。図鑑の種類は「系統・角・翼・しっぽ」の組み合わせです。
- **ゴブリン・卵・施設**: `DATA.goblins` / `DATA.eggs` / `DATA.facilities` に追加。

## テスト
```bash
npm test
```
