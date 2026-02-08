# Notion既存タグ取得・選択機能の実装計画

Notionデータベースの「ジャンル」プロパティから既存のタグ一覧を取得し、拡張機能のUI上で簡単に選択できるようにします。また、新規タグの入力も引き続き可能にします。

## ユーザーレビューが必要な項目

> [!IMPORTANT]
> - タグの取得はポップアップが開いたタイミングで行います。
> - Notion APIの `Retrieve a database` エンドポイントを使用するため、インテグレーションにデータベースの読み取り権限が必要です（通常はあるはずです）。

## 変更内容

### [Component] Notion API Integration (background.js)

#### [MODIFY] [background.js](file:///Users/takahiro/Library/Mobile%20Documents/iCloud~md~obsidian/Documents/Projects/chrome%E6%8B%A1%E5%BC%B5%E6%A9%9F%E8%83%BD%20-%20Prime%20Video%202%20Note%E3%82%A4%E3%83%B3%E3%83%9D%E3%83%BC%E3%82%BF%E3%83%BC/background.js)
- `GET_NOTION_TAGS` メッセージのハンドラーを追加。
- `https://api.notion.com/v1/databases/{database_id}` を叩き、`properties["ジャンル"].multi_select.options` からタグ名を取得して返却。

---

### [Component] UI (popup.html, popup.js)

#### [MODIFY] [popup.html](file:///Users/takahiro/Library/Mobile%20Documents/iCloud~md~obsidian/Documents/Projects/chrome%E6%8B%A1%E5%BC%B5%E6%A9%9F%E8%83%BD%20-%20Prime%20Video%202%20Note%E3%82%A4%E3%83%B3%E3%83%9D%E3%83%BC%E3%82%BF%E3%83%BC/popup.html)
- タグ入力欄（`#tagsContainer`）の下に、既存タグを表示するためのコンテナ（`#suggestedTags`）を追加。
- 既存タグのスタイリングを追加（クリックで選択できるチップ形式）。

#### [MODIFY] [popup.js](file:///Users/takahiro/Library/Mobile%20Documents/iCloud~md~obsidian/Documents/Projects/chrome%E6%8B%A1%E5%BC%B5%E6%A9%9F%E8%83%BD%20-%20Prime%20Video%202%20Note%E3%82%A4%E3%83%B3%E3%83%9D%E3%83%BC%E3%82%BF%E3%83%BC/popup.js)
- 初期化時に `background.js` へ既存タグの取得をリクエスト。
- 取得したタグを UI（`#suggestedTags`）にレンダリング。
- タグチップをクリックした際に、現在のタグリストに追加/削除するロジックを実装。
- 既に選択されているタグは視覚的に（背景色などで）区別する。

---

## 検証計画

### 自動テスト
- 現状、自動テスト環境がないため、手動検証を中心に行います。

### 手動検証
1. 拡張機能のアイコンをクリックしてポップアップを開く。
2. Notionデータベースに登録されている既存のタグが一覧表示されることを確認。
3. 既存のタグをクリックして選択できることを確認。
4. 選択したタグが上の入力欄に表示されることを確認。
5. 自分で新しいタグを打ち込んでEnterで追加できることを確認。
6. 「Notionに保存」ボタンを押し、正しくNotion側にタグ（既存・新規両方）が登録されることを確認。
