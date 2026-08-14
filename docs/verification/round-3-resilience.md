# Round 3 — 耐障害検証

実施日: 2026-08-14 / 対象版 0.2.0

unit/E2Eで以下をPASSとしました。

- 破損localStorageを無言初期化せず、raw値を保護してエラー返却
- localStorage書込例外をthrowせずエラー返却
- schemaVersion、全必須項目、列挙、ISO日時、SHA-256、行範囲を検証
- タスク/ノード/接続の重複、依存の参照切れ・自己参照・循環を拒否
- edgeとnode.taskIdsの参照切れを拒否
- 2,000,000 bytes超のimportをparse前に拒否
- invalid JSONで既存保存値と画面状態が不変
- nodes/edges/viewport/audit/tasksのbundle一括保存と再読込
