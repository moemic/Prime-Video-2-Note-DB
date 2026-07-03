# 画像抽出回帰修正 実行計画

作成日: 2026-07-03

## 目的

Prime Video のロゴやキャンペーンバナーではなく、作品のサムネイル、ページカバー、その他画像を取得できる状態へ戻す。あわせて、サイドパネルを開いたまま作品ページを切り替えた場合も自動で再取得する。

## 手順

1. `content.js` の広すぎるDOM画像収集を撤回する。
2. 作品画像は `packshot`、`titleshot`、`heroshot`、`covershot` の埋め込みデータを優先し、`og:image` は補助に戻す。
3. ロゴ、透明画像、sprite、キャンペーン由来画像などを候補から除外するフィルタを強める。
4. content script でPrime VideoのSPA URL変更を検知し、サイドパネルへページ変更を通知する。
5. `popup.js` 側でページ変更通知を受けたら、短い待機後に自動再抽出する。
6. 不具合修正としてバージョンを `1.27.1` に更新し、`manifest.json`、`popup.js`、`popup.html`、`CHANGELOG.md` を揃える。
7. `npm run check:version`、JS構文チェック、一時indexでのpre-commit相当チェックを実行する。
