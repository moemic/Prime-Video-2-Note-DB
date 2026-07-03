# Prime Videoボタンのホームアイコン化 実行計画

作成日: 2026-07-03

## 目的

Prime Videoを開くボタンが再生ボタンに見えないよう、ホーム画面へ移動する意図が伝わるアイコンに変更する。

## 手順

1. `popup.html` の `openPrimeBtn` 表示を確認する。
2. ボタン表示を `▶` からホーム系アイコンへ変更する。
3. 軽微なUI調整としてバージョンを `1.29.1` に更新し、`manifest.json`、`popup.js`、`popup.html`、`CHANGELOG.md` を揃える。
4. `npm run check:version`、JS構文チェック、一時indexでpre-commit相当チェックを実行する。
