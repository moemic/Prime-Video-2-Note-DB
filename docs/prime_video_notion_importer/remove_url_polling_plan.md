# URLポーリング削除 実行計画

作成日: 2026-07-03

## 目的

Prime Video のページ切替検知で、1秒ごとの `location.href` ポーリングをやめ、`history.pushState`、`history.replaceState`、`popstate` の履歴イベント検知だけを残す。

## 手順

1. `content.js` のURL変更検知処理を確認する。
2. `setInterval(notifyPrimeLocationChanged, 1000)` を削除する。
3. `pushState`、`replaceState`、`popstate` による通知は維持する。
4. 軽微な挙動調整としてバージョンを `1.28.2` に更新し、`manifest.json`、`popup.js`、`popup.html`、`CHANGELOG.md` を揃える。
5. `npm run check:version`、JS構文チェック、一時indexでpre-commit相当チェックを実行する。
