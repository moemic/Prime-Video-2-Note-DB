# Prime Videoを開くボタン追加 実行計画

作成日: 2026-07-03

## 目的

Chrome拡張機能のUIから Amazon Prime Video のトップページを新しいタブで開けるようにする。

## 手順

1. `popup.html` と `popup.js` のヘッダー構造を確認する。
2. ヘッダー右側に「Prime Videoを開く」ボタンを追加する。
3. ボタン押下時に `chrome.tabs.create({ url: "https://www.amazon.co.jp/gp/video/storefront" })` を実行する。
4. 既存の更新ボタンと並べても崩れないようにCSSを調整する。
5. 新機能追加としてバージョンを `1.29.0` に更新し、`manifest.json`、`popup.js`、`popup.html`、`CHANGELOG.md` を揃える。
6. `npm run check:version`、JS構文チェック、一時indexでpre-commit相当チェックを実行する。
