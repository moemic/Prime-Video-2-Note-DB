# Prime Videoカテゴリ自動登録計画

## 目的

Prime Videoページのカテゴリ情報を取得し、編集可能なタグとしてNotionの独立した `カテゴリ` プロパティへ保存する。

## 実装内容

1. ページ内のカテゴリリンクと構造化scriptデータからカテゴリ候補を抽出する。
2. 重複、空白、URLなどカテゴリではない値を除外する。
3. 拡張機能に編集可能な `Categories` 欄を追加する。
4. Notion DBに `カテゴリ` がなければmulti_select型で自動作成する。
5. 新規登録、既存値読込、更新、空欄への変更に対応する。
6. 保存完了通知へカテゴリ登録・変更を表示する。
7. バージョンを `1.36.0` に更新する。

## 検証

- `node --check content.js`
- `node --check background.js`
- `node --check popup.js`
- 既存の回帰チェック一式
- `npm run check:version`
- `git diff --check`
