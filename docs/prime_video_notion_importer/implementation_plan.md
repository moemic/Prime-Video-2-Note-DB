# サムネイル画像のサイズ順ソート実装計画

抽出された画像候補を取得順ではなく、ファイルサイズ（容量）が大きいもの（＝高画質なもの）から優先的に表示するように変更します。

## 変更内容

### [Component] Content Extraction (content.js)

#### [MODIFY] [content.js](file:///Users/takahiro/Library/Mobile%20Documents/iCloud~md~obsidian/Documents/Projects/chrome%E6%8B%A1%E5%BC%B5%E6%A9%9F%E8%83%BD%20-%20Prime%20Video%202%20Note%E3%82%A4%E3%83%B3%E3%83%9D%E3%83%BC%E3%82%BF%E3%83%BC/content.js)
- `getImageSize(url)` ヘルパー関数を追加.
  - `fetch(url, { method: "HEAD" })` を使用して `Content-Length` を取得します.
- メッセージハンドラーのソートロジックを更新.
  - `Promise.all` を使用して、抽出された全画像候補のサイズを並列で取得します.
  - **第1キー**: ファイルサイズ（降順）
  - **第2キー**: 発見順（昇順 / 安定ソート）
  - この順序でソートした後の上位30件をポップアップに返します.

---

### [Component] Notion API Integration (background.js)
- 変更なし.

---

## 検証計画

### 手動検証
1. Prime Videoの作品ページを開き、ポップアップを起動します.
2. 表示される画像の最初の数枚が、解像度の低いアイコン等ではなく、ポスター画像やヒーロー画像（高画質なもの）になっていることを確認します.
3. デベロッパーツールのネットワークタブで、HEADリクエストが正しく並列実行されていることを確認します.
