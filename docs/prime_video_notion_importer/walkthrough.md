# Prime Video 2 Note Importer 完成報告

Prime Videoの情報をNotionの既存データベース「動画鑑賞リスト」に自動登録するChrome拡張機能の実装が完了しました。

## 実装内容
以下のファイルを新規作成しました：
- [manifest.json](file:///Users/takahiro/Library/Mobile%20Documents/iCloud~md~obsidian/Documents/Projects/chrome%E6%8B%A1%E5%BC%B5%E6%A9%9F%E8%83%BD%20-%20Prime%20Video%202%20Note%E3%82%A4%E3%83%B3%E3%83%9D%E3%83%BC%E3%82%AF/manifest.json)
- [popup.html](file:///Users/takahiro/Library/Mobile%20Documents/iCloud~md~obsidian/Documents/Projects/chrome%E6%8B%A1%E5%BC%B5%E6%A9%9F%E8%83%BD%20-%20Prime%20Video%202%20Note%E3%82%A4%E3%83%B3%E3%83%9D%E3%83%BC%E3%82%AF/popup.html)
- [popup.js](file:///Users/takahiro/Library/Mobile%20Documents/iCloud~md~obsidian/Documents/Projects/chrome%E6%8B%A1%E5%BC%B5%E6%A9%9F%E8%83%BD%20-%20Prime%20Video%202%20Note%E3%82%A4%E3%83%B3%E3%83%9D%E3%83%BC%E3%82%AF/popup.js)
- [content.js](file:///Users/takahiro/Library/Mobile%20Documents/iCloud~md~obsidian/Documents/Projects/chrome%E6%8B%A1%E5%BC%B5%E6%A9%9F%E8%83%BD%20-%20Prime%20Video%202%20Note%E3%82%A4%E3%83%B3%E3%83%9D%E3%83%BC%E3%82%AF/content.js)
- [background.js](file:///Users/takahiro/Library/Mobile%20Documents/iCloud~md~obsidian/Documents/Projects/chrome%E6%8B%A1%E5%BC%B5%E6%A9%9F%E8%83%BD%20-%20Prime%20Video%202%20Note%E3%82%A4%E3%83%B3%E3%83%9D%E3%83%BC%E3%82%AF/background.js)
- [icon.png](file:///Users/takahiro/Library/Mobile%20Documents/iCloud~md~obsidian/Documents/Projects/chrome%E6%8B%A1%E5%BC%B5%E6%A9%9F%E8%83%BD%20-%20Prime%20Video%202%20Note%E3%82%A4%E3%83%B3%E3%83%9D%E3%83%BC%E3%82%AF/icon.png)


## 使い方

### 1. 拡張機能のインストール
1. Google Chromeで `chrome://extensions/` を開きます。
2. 右上の「デベロッパー モード」をONにします。
3. 「パッケージ化されていない拡張機能を読み込む」をクリックし、プロジェクトフォルダ（`chrome拡張機能 - Prime Video 2 Noteインポーター`）を選択します。

### 2. 初期設定
1. ブラウザのツールバーにある拡張機能アイコンをクリックしてポップアップを開きます。
2. **Notion Token**（`ntn_...`）を入力します。
3. **Database ID**（既に `6c0e197a...` が入力されています）を確認します。
4. 設定を保存するために、適当なPrime Videoページで一度「Notionに保存」を押すと、次回からToken等が自動入力されます。

### 3. 作品の保存
1. 保存したいPrime Videoの作品詳細ページを開きます。
2. 拡張機能ボタンをクリックし、「Notionに保存」をクリックします。
3. 保存が完了すると、Notionの「動画鑑賞リスト」データベースに新しいレコードが作成されます。

## 登録される項目
- `Name`: 作品タイトル
- `URL`: 作品詳細ページのURL
- `概要`: 作品のあらすじ
- `鑑賞終了`: チェック（True）
- `ステータス`: 「鑑賞終了」
- `カバー画像`: サムネイル画像（外部URL参照）
- ページカバー画像にも同じサムネイルが設定されます。
