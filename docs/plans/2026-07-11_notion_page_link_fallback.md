# Notionページリンク修正計画

## 目的

重複ページの「Notionを開く」で空画面が開かないよう、Notion APIのURLが空でもページIDから有効なリンクを生成する。

## 実装内容

1. NotionページURLの生成処理を共通化する。
2. APIの `page.url` が有効な場合はそのまま使う。
3. URLが空の場合はページIDから `https://www.notion.so/{pageId}` を生成する。
4. 完全一致ページと類似候補ページの両方へ適用する。
5. URLを生成できない場合はリンクを無効化し、空タブを開かない。
6. バージョンを `1.34.1` に更新する。

## 検証

- `npm run check:notion-page-url`
- `node --check background.js`
- `node --check popup.js`
- `npm run check:version`
- `git diff --check`
