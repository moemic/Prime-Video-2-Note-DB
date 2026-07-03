# 画像カルーセル操作改善 実行計画

作成日: 2026-07-03

## 目的

Prime Video → Notion Importer の画像候補カルーセルを、左右ボタンの単発クリックだけでなく、ホイールスクロールとボタン長押しで移動できるようにする。

## 手順

1. `popup.js` の `prevBtn` / `nextBtn`、`slideIndex`、`updateSlidePosition()` の現状を確認する。
2. 画像候補エリア上のホイール操作を横移動として扱う。
3. 左右ボタンの長押しで連続移動できるようにする。
4. `slideIndex` が範囲外に出ないように制御する。
5. 操作性改善としてバージョンを `1.28.0` に更新し、`manifest.json`、`popup.js`、`popup.html`、`CHANGELOG.md` を揃える。
6. `npm run check:version`、JS構文チェック、一時indexでのpre-commit相当チェックを実行する。
