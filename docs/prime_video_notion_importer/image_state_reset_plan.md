# 画像状態リセット改善 実行計画

作成日: 2026-07-03

## 目的

Prime Video の別作品ページへ移動したあと、サイドパネルの Prime Video → Notion Importer を起動した際に、前作品のサムネイル、ページカバー、画像候補が残らないようにする。

## 手順

1. `popup.js` の `imageCandidates`、`currentImageIndex`、`pageCoverIndex`、カルーセルDOMの更新条件を確認する。
2. 別作品データを受け取ったときに画像選択状態とカルーセルDOMを確実にリセットする。
3. 画像URLが変わった場合は、画像枚数が同じでもカルーセルを再描画する。
4. `content.js` でSPA遷移後に古いscript内画像を優先しすぎないよう、現在ページの `og:image` と表示中画像を画像候補へ含める。
5. `manifest.json`、`popup.js`、`popup.html`、`CHANGELOG.md` のバージョンを `1.26.0` に揃える。
6. JS構文チェックと差分確認を行い、実Chromeで未確認の範囲を明記する。
