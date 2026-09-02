# Web Spreadsheet

ブラウザだけで動く **Excel 風スプレッドシート**です。サーバー不要。`index.html` を開けば使えます。

Excel ファイル（`.xlsx`）との互換はありません。保存は独自形式 **`.wss.json`** です。計算式には Excel 関数に加えて **JavaScript 式**が使えます。

- リポジトリ: [toyfer/web-spreadsheet](https://github.com/toyfer/web-spreadsheet)
- 起動: `index.html` をダブルクリック、またはローカルサーバーで開く

## 起動

```bash
# どれでも可。ファイルを直接開いても動きます
open index.html
```

Chrome / Edge / Firefox / Safari の現行版を想定しています。データは端末内（メモリ + `localStorage` 自動保存 + ファイル保存）だけで完結します。

## Excel に寄せた操作

| 操作 | 動き |
| --- | --- |
| クリック / ドラッグ | セル選択・範囲選択 |
| 入力開始 | 文字を打つと上書き編集（Excel と同じ） |
| `F2` / ダブルクリック | セル内編集 |
| `Enter` / `Tab` | 確定して下 / 右へ移動。`Shift` で逆方向 |
| `Esc` | 編集キャンセル |
| 矢印 / `Shift`+矢印 | 移動 / 選択拡張 |
| `Ctrl`+矢印 | データの端へジャンプ |
| `Ctrl+Home` / `Ctrl+End` | A1 / 使用範囲の末尾 |
| `Ctrl+Space` / `Shift+Space` | 列全体 / 行全体 |
| フィルハンドル（選択枠右下） | ドラッグでコピー／数列フィル |
| `Ctrl+D` / `Ctrl+R` | 下へフィル / 右へフィル |
| `Ctrl+C` `X` `V` | コピー・切り取り・貼り付け（TSV。他アプリとも可） |
| `Ctrl+Z` / `Ctrl+Y` | 元に戻す / やり直し |
| `Ctrl+B` `I` `U` | 太字・斜体・下線 |
| `Delete` | 内容クリア（書式は残す） |
| `Ctrl+Enter` | 選択範囲に同じ値 |
| `Alt+=` | 自動 SUM |
| `Ctrl+;` | 今日の日付 |
| `F9` | 再計算 |
| `Ctrl+\`` | 数式の表示切替 |
| 列・行ヘッダー端 | 幅・高さのドラッグ変更 |
| シートタブ | 切替・ダブルクリックで改名・右クリックメニュー |
| `F1` | ショートカット一覧 |

ステータスバーには Excel と同様、選択範囲の **平均・個数・合計** が出ます。数式バーと名前ボックスもあります。

## 数式

セル先頭を `=` にすると計算します。

### Excel 関数

`SUM` `AVERAGE` `COUNT` `COUNTA` `MIN` `MAX` `IF` `IFS` `AND` `OR` `NOT` `ROUND` `INT` `ABS` `SQRT` `POWER` `MOD` `PI` `SIN` `COS` … `LEFT` `RIGHT` `MID` `LEN` `TRIM` `UPPER` `LOWER` `CONCAT` `TEXTJOIN` `TODAY` `NOW` `YEAR` `MONTH` `DAY` `VLOOKUP` `HLOOKUP` `INDEX` `MATCH` `COUNTIF` `SUMIF` `SUMIFS` `AVERAGEIF` `SUMPRODUCT` `UNIQUE` `SORT` `FILTER` `MEDIAN` `STDEV` など。

例:

```
=SUM(A1:A10)
=IF(B2>100,"OK","NG")
=VLOOKUP(A2,A1:C20,3,FALSE)
=B2*C2
```

相対参照・絶対参照（`$A$1`）はフィル時にシフトされます。シート間参照は `売上!D7` の形式です。循環参照は `#CIRC!` になります。

### JavaScript 式

`Math.` や `.filter` / `.map` / アロー関数があると JS として評価します。範囲は配列になります。

```
=Math.round(D7*1.1)
=Math.sqrt(B2)
=C2:C5.filter(x => x > 0).length
=A1:A10.reduce((s,x)=>s+x,0)
```

利用できる識別子はセル参照、上記関数、`Math`、`Date` です（ブラウザのグローバルは渡しません）。

## 保存形式

拡張子 **`.wss.json`**。中身は JSON です。

```json
{
  "magic": "WSS1",
  "name": "Book1",
  "active": 0,
  "zoom": 1,
  "grid": true,
  "sheets": [
    {
      "name": "Sheet1",
      "rows": 200,
      "cols": 40,
      "cells": { "0,0": { "v": "Hello", "s": { "b": true } } },
      "colW": {},
      "rowH": {},
      "merges": [],
      "freeze": [0, 0]
    }
  ]
}
```

- `v` … 入力値（数式は `"=SUM(A1:A3)"` のような文字列）
- `s` … 書式（太字、色、表示形式など）
- Excel / Google スプレッドシートのファイルは開けません

初回起動時はサンプルブックが入ります。編集内容は約 8 秒ごとに `localStorage` へ自動保存され、次回同じブラウザで復元します。ファイルメニューの「保存」で `.wss.json` をダウンロードできます。

## ファイル構成

| ファイル | 内容 |
| --- | --- |
| `index.html` | 画面（リボン・数式バー・グリッド・シートタブ） |
| `styles.css` | Excel に近いクロームとグリッド |
| `app.js` | 仮想化グリッド、選択、編集、数式、保存 |

依存ライブラリはありません。

## 制限

- 最大おおよそ 2000 行 × 256 列（仮想スクロール）
- グラフ・ピボット・条件付き書式・印刷レイアウトは未実装
- `.xlsx` の読み書きなし
- 共同編集なし（完全クライアント）
