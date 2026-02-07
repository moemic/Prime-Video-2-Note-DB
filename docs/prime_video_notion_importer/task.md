# Task List: Prime Video 2 Note Importer

## 研究と計画 (Research and Planning)
- [x] 過去の対話ログ `2026-02-07-Notion自動化提案.md` の確認
- [x] ユーザーにNotionデータベースのプロパティ名を確認 (APIで自動取得済み)
- [x] 実行計画 `implementation_plan.md` の作成

## 開発 (Development)
- [x] プロジェクトディレクトリとファイルの初期化
- [x] `manifest.json` の実装
- [x] `popup.html` および `popup.js` の実装 (初期版)
- [x] `content.js` の実装 (DOM抽出ロジック)
- [x] `background.js` の実装 (Notion API連携)
- [x] UIリデザイン (Obsidian拡張風のプレビュー＆編集画面)
- [x] タグ（ジャンル）とレーティング（オススメ度）の実装
- [x] カバー画像（サムネイル）抽出精度の改善
- [x] JSONメタデータからの画像抽出ロジック追加
- [x] 正規表現によるJSON内全画像検索ロジック
- [x] タイトルの不要なプレフィックス・サフィックス除去
- [x] 全スクリプトタグからの広範な画像検索（エスケープ文字対応）
- [x] Resource Timing APIによる読み込み済み画像リソースの抽出
- [x] 画面上の表示サイズに基づく最大画像（Visual Extraction）の検出
- [x] 横長（ランドスケープ）画像の優先抽出ロジック（アスペクト比判定）
- [x] 画像候補リストの取得と選択UIの実装
- [x] 全画像候補の収集ロジック実装（複数候補対応）
- [x] プレビューUIの改善（固定フレーム + 全体表示）
- [x] 画像選択UIのカルーセル化（複数枚表示+スライド）




## 検証 (Verification)
- [ ] Prime Videoページでの抽出テスト
- [ ] Notion APIの接続とデータ登録テスト
- [ ] ウォークスルー `walkthrough.md` の作成
