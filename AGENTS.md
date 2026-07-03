<claude-mem-context>
# Memory Context

# [Prime-Video-2-Note-DB] recent context, 2026-07-03 7:09pm GMT+9

No previous sessions found.
</claude-mem-context>

# プロジェクト運用ルール

## バージョン管理

- コード、機能、UI、ドキュメントを修正した場合は、変更内容に応じて必ずバージョン番号を更新すること。
- 誤字修正、文言修正、軽微なUI調整のみの場合は、パッチバージョンを上げること。例: `1.23.0` → `1.23.1`
- 小さな機能追加、既存機能の改善、UX改善の場合は、マイナーバージョンを上げること。例: `1.23.0` → `1.24.0`
- 互換性を壊す変更、大幅な設計変更、主要機能の刷新の場合は、メジャーバージョンを上げること。例: `1.23.0` → `2.0.0`
- バージョン更新時は、少なくとも `manifest.json`、画面内のバージョン表示、JavaScript内のバージョン定数、`CHANGELOG.md` を同じバージョンへ揃えること。
- 主要な変更は `CHANGELOG.md` に日本語で記録すること。
- 変更後は `npm run check:version` を実行し、バージョン表記の一致と更新漏れがないことを確認すること。
- このリポジトリでは `.githooks/pre-commit` により、コミット前に `node scripts/check-version-sync.js --staged` が自動実行される。hookが効いていない場合は `git config core.hooksPath .githooks` を設定すること。
