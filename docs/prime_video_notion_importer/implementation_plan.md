# 重複登録チェック機能の実装計画

ポップアップが開いた際、現在表示している作品のタイトルが既にNotionデータベースに登録されていないかを自動的に検索し、ユーザーに通知する機能を実装します。

## ユーザーレビューが必要な項目

> [!NOTE]
> - チェックはタイトル（Nameプロパティ）の完全一致で行います。
> - 重複が見つかった場合でも、保存ボタンは無効化せず、警告を表示するのみに留めます（再登録したい場合もあるため）。

## 変更内容

### [Component] Notion API Integration (background.js)

#### [MODIFY] [background.js](file:///Users/takahiro/Library/Mobile%20Documents/iCloud~md~obsidian/Documents/Projects/chrome%E6%8B%A1%E5%BC%B5%E6%A9%9F%E8%83%BD%20-%20Prime%20Video%202%20Note%E3%82%A4%E3%83%B3%E3%83%9D%E3%83%BC%E3%82%BF%E3%83%BC/background.js)
- `CHECK_DUPLICATE` メッセージのハンドラーを追加。
- `POST /v1/databases/{database_id}/query` を使用し、`filter` で `Name` プロパティが指定したタイトルと一致するページを検索。
- 一致するページが見つかった場合、そのページのURL（または存在フラグ）を返す。

---

### [Component] UI (popup.html, popup.js)

#### [MODIFY] [popup.html](file:///Users/takahiro/Library/Mobile%20Documents/iCloud~md~obsidian/Documents/Projects/chrome%E6%8B%A1%E5%BC%B5%E6%A9%9F%E8%83%BD%20-%20Prime%20Video%202%20Note%E3%82%A4%E3%83%B3%E3%83%9D%E3%83%BC%E3%82%BF%E3%83%BC/popup.html)
- タイトル入力欄の直下に、重複警告を表示するための隠しエリア（`#duplicateWarning`）を追加。
- 警告メッセージ用のスタイリング（黄色背景など）を追加。

#### [MODIFY] [popup.js](file:///Users/takahiro/Library/Mobile%20Documents/iCloud~md~obsidian/Documents/Projects/chrome%E6%8B%A1%E5%BC%B5%E6%A9%9F%E8%83%BD%20-%20Prime%20Video%202%20Note%E3%82%A4%E3%83%B3%E3%83%9D%E3%83%BC%E3%82%BF%E3%83%BC/popup.js)
- `handleExtractedMessage` 内で、タイトルの抽出が完了した直後に `CHECK_DUPLICATE` をリクエスト。
- 重複が見つかった場合、警告エリアを表示し、既存ページへのリンク等を表示。

---

## 検証計画

### 手動検証
1. 既にNotionに登録済みの作品ページを開き、拡張機能ポップアップを起動する。
2. 「既に登録されています」という警告が表示されることを確認。
3. 未登録の作品ページでは警告が出ないことを確認。
4. 警告が出た状態で「Notionに保存」を押し、重複して保存できる（または必要に応じて上書きを検討するかの余地を残す）ことを確認。
