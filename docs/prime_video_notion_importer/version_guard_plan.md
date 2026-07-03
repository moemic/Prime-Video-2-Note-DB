# バージョン管理自動化 実行計画

作成日: 2026-07-03

## 目的

Chrome拡張機能のコード、UI、機能、ドキュメントを変更したときに、バージョン更新漏れとバージョン表記の不一致を自動検出する。

## 手順

1. 既存の `package.json`、Git hook、バージョン運用ルールを確認する。
2. `manifest.json`、`popup.js`、`popup.html`、`CHANGELOG.md` のバージョン一致を検査するスクリプトを追加する。
3. 対象ファイルが変更された場合、`manifest.json` のバージョンがHEADから更新されているか検査する。
4. `npm run check:version` で手動実行できるようにする。
5. `.githooks/pre-commit` を追加し、コミット前に自動チェックを実行する。
6. `git config core.hooksPath .githooks` でこの作業コピーのhookを有効化する。
7. `AGENTS.md` と `CHANGELOG.md` に運用を追記し、バージョンを `1.27.0` に揃える。
8. 追加チェック、JS構文チェック、Git hook設定確認を実行する。
