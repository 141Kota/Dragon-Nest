# Dragon Nest（ドラゴンのす）

卵を探して拾い、孵してドラゴンを集める iPhone Safari 向けのゲームです（縦画面・タップのみ）。
仕様は [docs/game_spec.md](docs/game_spec.md)。

## 遊び方
- リポジトリ直下の `index.html` を開くと起動します（GitHub Pages でそのまま公開できます）。
- ローカルで試すときは ES Modules のため HTTP サーバー経由で開いてください（例: `python3 -m http.server`）。
- Safari の「ホーム画面に追加」でアプリのように使えます。

## 構成
| ファイル | 役割 |
| --- | --- |
| `src/data.js` | **データ定義（場所・卵・ゴブリン・パーツ・技・施設・数値）を1か所に集約** |
| `src/logic.js` | ゲームロジック（孵化・図鑑・バトル・探索マップ）。DOM なし |
| `src/save.js` | localStorage セーブ（失敗しても初期状態で続行） |
| `src/dragon.js` | ドラゴン描画。全パーツが `DATA.skeleton` の接続点を共有 |
| `src/draw.js` / `src/ui.js` | 共通描画部品 / キャンバスとタップ入力 |
| `src/scenes/*.js` | 拠点・探索先えらび・探索・バトル・図鑑の各画面 |

## 拡張のしかた
- **場所を足す**: `DATA.locations` に1件追加（`theme`・`eggTable`・`goblins`・`pool`）。図鑑ページも自動で増えます。
- **パーツを足す**: `DATA.parts.<種類>` に1件追加。`style` の値を変えるだけで形が変わります（新しい描き方は `dragon.js`）。
- **ゴブリン・卵・施設**: それぞれ `DATA.goblins` / `DATA.eggs` / `DATA.facilities` に追加。

## テスト
```bash
npm test
```
