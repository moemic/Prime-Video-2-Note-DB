# 現在作品優先の画像再取得 実行計画

作成日: 2026-07-03

## 目的

Prime Video のSPA遷移後に、タイトルや概要は新作品へ更新されているのに画像だけ前作品の `packshot`、`titleshot`、`heroshot`、`covershot` が残る問題を修正する。

## 手順

1. 現在ページのASIN/GTI、URL上の作品ID、タイトル文字列を画像抽出のヒントとして生成する。
2. `content.js` のscript画像抽出で、ヒントに一致するscriptから取得できた画像を優先する。
3. ヒント一致scriptから画像が取れない場合は、現在ページの `og:image` を優先候補にする。
4. `og:image` も取れない場合のみ、従来どおり全scriptからの画像抽出へフォールバックする。
5. UI側はページ切替時に画像状態を即クリアし、前ページ画像を表示し続けにくくする。
6. 不具合修正としてバージョンを `1.28.1` に更新し、`manifest.json`、`popup.js`、`popup.html`、`CHANGELOG.md` を揃える。
7. `npm run check:version`、JS構文チェック、一時indexでのpre-commit相当チェックを実行する。
