# 監督名と登録日の追加機能の実装計画

Prime Videoのページから監督名を抽出し、Notionデータベースの「著者」プロパティに保存します。また、登録した日付を「日付」プロパティに自動設定します。

## 変更内容

### [Component] Content Extraction (content.js)

#### [MODIFY] [content.js](file:///Users/takahiro/Library/Mobile%20Documents/iCloud~md~obsidian/Documents/Projects/chrome%E6%8B%A1%E5%BC%B5%E6%A9%9F%E8%83%BD%20-%20Prime%20Video%202%20Note%E3%82%A4%E3%83%B3%E3%83%9D%E3%83%BC%E3%82%BF%E3%83%BC/content.js)
- `director` (監督名) の抽出ロジックを追加.
  - LD-JSONの `director` フィールドから取得.
  - DOM（「監督」「演出」等のラベルを持つ要素の隣）から取得するフォールバックを追加.
- メッセージ返却データに `director` を追加.

---

### [Component] Popup Logic (popup.js)

#### [MODIFY] [popup.js](file:///Users/takahiro/Library/Mobile%20Documents/iCloud~md~obsidian/Documents/Projects/chrome%E6%8B%A1%E5%BC%B5%E6%A9%9F%E8%83%BD%20-%20Prime%20Video%202%20Note%E3%82%A4%E3%83%B3%E3%83%9D%E3%83%BC%E3%82%BF%E3%83%BC/popup.js)
- `extractedData` に `director` を保持するように修正.
- 保存ボタン押下時に `date`（今日の日付：YYYY-MM-DD形式）をペイロードに含める.
- 重複チェック時に既存の「著者」情報があれば読み込むように修正.

---

### [Component] Notion API Integration (background.js)

#### [MODIFY] [background.js](file:///Users/takahiro/Library/Mobile%20Documents/iCloud~md~obsidian/Documents/Projects/chrome%E6%8B%A1%E5%BC%B5%E6%A9%9F%E8%83%BD%20-%20Prime%20Video%202%20Note%E3%82%A4%E3%83%B3%E3%83%9D%E3%83%BC%E3%82%BF%E3%83%BC/background.js)
- `properties` に「著者」（rich_text）と「日付」（date）を追加.
- `checkDuplicateTitle` で既存の「著者」プロパティを読み込む処理を追加.

---

## 検証計画

### 手動検証
1. Prime Videoの作品ページを開き、ポップアップを起動.
2. 保存後にNotionデータベースを確認し、「著者」欄に監督名、「日付」欄に今日の日付が入っていることを確認.
3. すでに登録済みの作品の場合、既存の監督名がポップアップ内で（内部的に）保持され、更新時も維持されることを確認.
