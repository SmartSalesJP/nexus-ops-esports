# NEXUS OPS — eスポーツ大会運用アプリ

2027年3月開催予定のVALORANT全国学生大会を、Phase 0〜6の73タスクで管理するローカルファーストアプリです。タスク進行表を正本とし、キャンバスは企画補助として扱います。

## 起動と検証

Node.js 20以上、pnpm 11.19.0を使用します。

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm dev
```

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm test:ui
pnpm test:a11y
pnpm test:e2e
pnpm build
pnpm audit --audit-level=moderate
```

## 正本データ

- S4: `eスポーツ大会_開催設計_全タスクリスト.md`
- SHA-256: `D24C5785D0AA8D3D4995767EAB565016E346149294ABEB0E0133C163C0E2BE87`
- 300行、タスク73件、Phase件数 `9/10/18/10/11/8/7`
- S1〜S3はsource catalogから削除せず、S4を追加しています。
- 原文の担当チーム略称は13チームの安定IDと正式表示名へ正規化し、各タスクはS4の原行へ追跡できます。
- 担当欄は括弧内の役割・`※契約後`を含む原文を保持し、担当者フィルタ専用の`personKeys`を別に導出します。責任者は担当者件数へ混ぜません。

スン担当4件は原表どおり初期状態を「未着手」とし、P0-07未完了によるブロックと契約待ち解除条件を状態とは別に表示します。加藤は離脱済みのため初期タスクへ割り当てません。Riot関連は公式一次情報の再確認事項として表示し、第三者の噂を検証済み事実として表示しません。

## 主な機能

- 実行日からの現在Phase判定、全体/Phase 0〜6タブ、Phase別完了率
- 高/中/低の色・文字表示、高緊急かつ期限超過の非点滅強調
- 主要8名の担当者フィルタと高緊急残数/全件バッジ
- 7日前/超過ビュー。確定日を持たない相対・範囲期限は判定しません
- 2027年3月開始までの日数（大会当日は未確定と明記）、手入力KPI実績
- 保留理由必須の状態変更、依存関係とブロック表示、循環検証
- 比較基準を保存する隔週報告とLINE貼付用テキスト。1 ID 1行で状態遷移・block理由を併記し、改行や見出し文字を無害化
- 13チーム別ビュー、Phase 5モバイルチェック操作
- S4正本73件は削除不可。custom taskのみ参照整合性を維持して削除可能
- CRUD、JSON import/export、キャンバス、監査ログ、保存失敗通知、reduced motion、キーボード操作
- task削除、canvas、import、KPI、報告基準を含む操作audit

## schema v3移行

保存キーは `nexus.bundle.v3` です。初期表示と初期復元はP系73件だけをアクティブ正本にします。旧 `nexus.bundle.v2` を検出すると、旧T系タスク（ユーザー編集・追加を含む）を `migrationArchive` に元オブジェクトのまま1回だけ退避し、flow/viewport/auditを保持してP系73件を有効化します。旧タスクは集計へ混ぜませんが、JSON exportで回収できます。再読込でアーカイブは増殖しません。

importはschema 2/3に対応し、上限・必須項目・列挙・原文チームと13チームIDの一致・正本S4期待行・出典必須・依存参照・循環・finite座標・canvas task参照・edge ID・audit全項目/ID・KPI finite/非負を検証後、原子的に保存します。ブラウザデータ削除には耐えられないため、定期的にJSONを書き出してください。

詳細は [S4統合仕様](docs/full-tasklist-integration.md) と `docs/verification/` を参照してください。
