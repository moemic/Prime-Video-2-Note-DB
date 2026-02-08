# 既存データの取得と更新機能の実装計画

Notionに既に同じ作品が登録されている場合、その既存ページから「オススメ度」「ジャンル（タグ）」「概要」を読み込み、UIに反映させます。ユーザーがこれらを編集して保存すると、新規作成ではなく既存ページの情報を更新（上書き）するようにします。

## ユーザーレビューが必要な項目

> [!IMPORTANT]
> - 重複が見つかった場合、既存の設定（星、タグ、概要）が現在のページから抽出されたデータよりも優先してUIにロードされます。
> - 保存ボタンを押すと、既存のNotionページが更新されます。
> - コメント（純正コメント機能）については、Notion APIの性質上「既存コメントの編集」ではなく「新しいコメントの追記」として処理します。

## 変更内容

### [Component] Notion API Integration (background.js)

#### [MODIFY] [background.js](file:///Users/takahiro/Library/Mobile%20Documents/iCloud~md~obsidian/Documents/Projects/chrome%E6%8B%A1%E5%BC%B5%E6%A9%9F%E8%83%BD%20-%20Prime%20Video%202%20Note%E3%82%A4%E3%83%B3%E3%83%9D%E3%83%BC%E3%82%BF%E3%83%BC/background.js)
- `checkDuplicateTitle` を拡張し、見つかったページの `properties` 全体を返すように変更。
- `updateNotionPage` 関数を新規作成（`PATCH /v1/pages/{page_id}`）。
- `CREATE_NOTION_PAGE` メッセージハンドラーを拡張し、`pageId` が指定されている場合は更新処理を行うように分岐。

---

### [Component] UI & Logic (popup.js)

#### [MODIFY] [popup.js](file:///Users/takahiro/Library/Mobile%20Documents/iCloud~md~obsidian/Documents/Projects/chrome%E6%8B%A1%E5%BC%B5%E6%A9%9F%E8%83%BD%20-%20Prime%20Video%202%20Note%E3%82%A4%E3%83%B3%E3%83%9D%E3%83%BC%E3%82%BF%E3%83%BC/popup.js)
- `existingPageId` 変数を追加。
- `checkDuplicate` の結果を受け取った後、`Name`（タイトル）以外の属性をUIに反映するロジックを追加。
  - レーティングを星表示に反映。
  - 既存タグをリストに追加し、UIを更新。
  - 概要（概要プロパティ）をテキストエリアにセット。
- 保存ボタン押下時、`existingPageId` があれば `pageId` をペイロードに含めて送信。
- ページ更新後、ボタンのテキストを「更新完了」などに変更してフィードバック。

---

## 検証計画

### 手動検証
1. 既に評価（★3）とタグ（アクション）が登録されている作品のページを開く。
2. ポップアップを開いた際、自動的に★3とタグ「アクション」がUIにセットされることを確認。
3. ★を5に変更し、タグに「おすすめ」を追加して「Notionに保存」を押す。
4. Notion側の既存ページが★5、タグ「アクション, おすすめ」に更新されていることを確認。
5. 未登録の作品では、通常通り抽出されたデータがセットされ、新規登録されることを確認。
