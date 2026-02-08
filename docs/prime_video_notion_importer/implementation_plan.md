# Prime Video 2 Note Importer 実装計画

Prime Videoの作品ページから情報を抽出し、Notionのデータベースに自動登録するChrome拡張機能を開発します。

## ユーザー確認事項
> [!NOTE]
> データベース「動画鑑賞リスト」を正常に特定できました。以下のプロパティ名を使用して実装します。
>    - タイトル: `Name` (title型)
>    - URL: `URL` (url型)
>    - 概要: `概要` (rich_text型)
>    - 視聴済み: `鑑賞終了` (checkbox型)
>    - サムネ: `カバー画像` (files型)
>    - ステータス: `ステータス` (select型。登録時に「鑑賞終了」をセット)


## Proposed Changes

### [Chrome Extension Component]

#### [NEW] [manifest.json](file:///Users/takahiro/Library/Mobile%20Documents/i iCloud~md~obsidian/Documents/Projects/chrome%E6%8B%A1%E5%BC%B5%E6%A9%9F%E8%83%BD%20-%20Prime%20Video%202%20Note%E3%82%A4%E3%83%B3%E3%83%9D%E3%83%BC%E3%82%AF/manifest.json)
Manifest V3 形式での定義。必要な権限（activeTab, scripting, storage）とホスト権限（amazon.co.jp, api.notion.com）を設定します。

#### [NEW] [popup.html](file:///Users/takahiro/Library/Mobile%20Documents/iCloud~md~obsidian/Documents/Projects/chrome%E6%8B%A1%E5%BC%B5%E6%A9%9F%E8%83%BD%20-%20Prime%20Video%202%20Note%E3%82%A4%E3%83%B3%E3%83%9D%E3%83%BC%E3%82%AF/popup.html)
設定（Token, Database ID）と実行ボタンを持つシンプルなUI。

#### [NEW] [popup.js](file:///Users/takahiro/Library/Mobile%20Documents/iCloud~md~obsidian/Documents/Projects/chrome%E6%8B%A1%E5%BC%B5%E6%A9%9F%E8%83%BD%20-%20Prime%20Video%202%20Note%E3%82%A4%E3%83%B3%E3%83%9D%E3%83%BC%E3%82%AF/popup.js)
ポップアップUIの制御、設定の保存、Content Scriptへのメッセージ送信。

#### [NEW] [content.js](file:///Users/takahiro/Library/Mobile%20Documents/iCloud~md~obsidian/Documents/Projects/chrome%E6%8B%A1%E5%BC%B5%E6%A9%9F%E8%83%BD%20-%20Prime%20Video%202%20Note%E3%82%A4%E3%83%B3%E3%83%9D%E3%83%BC%E3%82%AF/content.js)
Prime Videoページからタイトル、概要、サムネイルURLをOGPおよびDOMから抽出するロジック。

### [UI Redesign and Feature Expansion]

#### [MODIFY] [popup.html](file:///Users/takahiro/Library/Mobile%20Documents/iCloud~md~obsidian/Documents/Projects/chrome%E6%8B%A1%E5%BC%B5%E6%A9%9F%E8%83%BD%20-%20Prime%20Video%202%20Note%E3%82%A4%E3%83%B3%E3%83%9D%E3%83%BC%E3%82%AF/popup.html)
Obsidian拡張機能を参考に、プレビューと編集機能を持つリッチなUIに変更します。
- カバー画像プレビューエリア
- タイトル編集フィールド
- タグ入力フィールド（カンマ区切りでNotionのマルチセレクトに対応）
- レーティング入力（星5段階、Notionのセレクトに対応）
- メモ（概要）編集エリア
- 大きな「Notionに保存」ボタン

#### [MODIFY] [popup.js](file:///Users/takahiro/Library/Mobile%20Documents/iCloud~md~obsidian/Documents/Projects/chrome%E6%8B%A1%E5%BC%B5%E6%A9%9F%E8%83%BD%20-%20Prime%20Video%202%20Note%E3%82%A4%E3%83%B3%E3%83%9D%E3%83%BC%E3%82%AF/popup.js)
UI変更に伴うロジックの更新。
- ページロード時に抽出データをフォームに反映
- ユーザーが編集した内容を収集して送信
- タグとレーティングの処理ロジック追加

#### [MODIFY] [background.js](file:///Users/takahiro/Library/Mobile%20Documents/iCloud~md~obsidian/Documents/Projects/chrome%E6%8B%A1%E5%BC%B5%E6%A9%9F%E8%83%BD%20-%20Prime%20Video%202%20Note%E3%82%A4%E3%83%B3%E3%83%9D%E3%83%BC%E3%82%AF/background.js)
新しいデータフィールド（タグ、レーティング）をNotion APIリクエストに含めるように更新。
- `ジャンル` (multi_select) ← タグ入力から
- `オススメ度` (select) ← 星評価から

---


## 検証計画

### 手動検証
1. **初期設定**: 拡張機能を読み込み、ポップアップからNotionのTokenとDatabase IDを入力して保存できるか確認。
2. **抽出テスト**: Prime Videoの作品ページ（例：『不滅のあなたへ』）を開き、拡張機能をクリックして「保存」を実行。
3. **Notion側確認**: 指定したデータベースに正しいタイトル、概要、URL、視聴済みチェック、およびサムネイル（カバー画像含む）が登録されているか確認。

### 自動テスト
- 現時点ではブラウザ拡張機能のため、まずは手動検証を優先します。
