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
- Asia/Tokyo基準の週次進行ループ。月曜00:00以後の初回起動で当週をcatch-upし、手動「今すぐ週次更新」にも対応
- 完了タスクを1 ID 1枚の付箋へ同期し、初回完了確認日時・ISO週・担当・Phase・現在状態を表示。再オープン後も履歴を消しません
- 1週1枚のsummary付箋に完了数、Phase別進捗、高緊急残、blocker、KPIを保存
- 全体進行管理部の決定論的ルール（依存準備、期限/成果物確認、KPI計測・分析、milestone checklist）による要確認タスク提案。編集・削除・無効化が可能です

## schema v4移行と週次実行

保存キーは `nexus.bundle.v4` です。schema v3はtasks/flow/viewport/audit/KPI/reportBaseline/migrationArchiveを保持したまま、空の週次状態を追加して一度だけ移行します。旧 `nexus.bundle.v2` を検出した場合も、旧T系タスク（ユーザー編集・追加を含む）を `migrationArchive` に元オブジェクトのまま退避し、S4のP系73件を有効化します。再読込でアーカイブは増殖しません。

週次処理は、task・canvas node・週次run・auditをメモリ上で組み立て、schema全量検証後に単一bundleとして保存し、直後に同じ文字列を再読込して一致確認します。検証/保存失敗時はReact状態を更新せず、正本へ部分的なtask/node/auditを残しません。自動タスクは `AUTO-YYYY-Www-NN`、`sourceRefs: []` とし、S4出典を偽装せず内部provenance・fingerprint・根拠コード・期待成果物・承認状態を保持します。削除した自動タスクのfingerprintはtombstoneに保存し、同根拠での復活を止めます。

ブラウザが閉じている間はJavaScriptを実行できないため、厳密な月曜00:00実行は保証しません。次回起動時に過去週を捏造せず「当週1回」だけcatch-upし、飛ばした週数をsummaryへ記録します。Codexや外部schedulerはlocalStorageを直接編集せず、週次タスク/threadを起動して検証・報告する副系としてください。アプリ内catch-upが正です。詳細は [週次進行ループ運用](docs/weekly-progress-loop.md) を参照してください。

importはschema 2/3/4に対応し、上限・必須項目・列挙・原文チームと13チームIDの一致・正本S4期待行・出典必須・依存参照・循環・finite座標・canvas task参照・edge ID・audit全項目/ID・KPI finite/非負・週次run/snapshot/completion/tombstoneを検証後、原子的に保存します。ブラウザデータ削除には耐えられないため、定期的にJSONを書き出してください。

詳細は [S4統合仕様](docs/full-tasklist-integration.md) と `docs/verification/` を参照してください。
