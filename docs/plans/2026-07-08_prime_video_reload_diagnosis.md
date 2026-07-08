# Prime Video 読み込み停止調査計画

作成日: 2026-07-08

## 背景

Prime Video の画面を開いてリロードしているが、画面が全く読み込まれなくなったとの報告がある。Chrome 拡張機能側の content script、popup、service worker、または直近変更が Prime Video ページ本体へ負荷や例外を与えていないかを確認する。

## 実行方針

1. リポジトリ状態を確認し、未コミット差分と直近変更を把握する。
2. `manifest.json`、`content.js`、`popup.js`、`background.js` を中心に、Prime Video ページ読み込みに関与する処理を確認する。
3. 再現ループとして、少なくとも静的検査、バージョン整合性、該当 JavaScript の構文検査を実行する。
4. Chrome 側での実ページ検証が必要な場合は、こちらでできる範囲とユーザー操作が必要な範囲を分けて報告する。
5. 原因がコード側にある場合は、最小修正、バージョン更新、`CHANGELOG.md` 更新、`npm run check:version` を行う。

## 仮説の初期候補

- content script のページ常駐処理が Prime Video のリロード時に例外や高負荷を起こしている。
- SPA 履歴検知、画像抽出、またはメッセージ処理がリロード中の DOM に過剰に触れている。
- 拡張機能の読み込み設定や権限、manifest の変更により Prime Video ページで不正な注入が起きている。
- Prime Video 側、Chrome 側、ネットワーク側の一時障害で、リポジトリ側の変更とは独立している。

## 検証コマンド候補

- `git status --short`
- `git diff --stat`
- `npm run check:version`
- `node --check content.js`
- `node --check popup.js`
- `node --check background.js`
