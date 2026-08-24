# Changelog

## 2026-08-24 — 実行順クエストビュー

- 全担当者の#1を一覧する概要と、担当者別の「今やる」「次にやる」「解除待ち」「完了ログ」を追加。従来のTaskBoardは「全タスク」で維持。
- personKeysを主要担当者の正とし、非主要実担当と未割当を動的に追加。責任者は除外し、共同担当は同一Task ID・共有状態で各担当キューへ投影。
- 順位を期限帯、緊急度、状態、直接解除件数、期限日、Phase、ASCII IDで決定論的に導出。保留、未完了/欠落依存、自己/循環依存を理由付きの解除待ちへ分離。
- `automationDisabled` を表示集合から除外しない既存意味を維持。運用サマリーの折りたたみ、先頭5件＋10件ずつの追加表示、隣接タスクとの差による順位理由、JST日付変更時の無保存再計算を追加。
- 順位・bucket・担当者選択・表示モードは永続化せず、既存の状態変更・完了ゲート・保存read-back成功後だけ再順位付け。旧#1が完了・保留等で外れた時は新#1へfocusし、完了ゲート・保存失敗時はrollback後にenabledとなった元selectへfocusを戻す。消費済みfocus/live要求はJST日付更新・可視性復帰・無関係な再描画で再発火させない。キーボード、reduced motion、360px表示、axe/E2Eを追加検証。

## 2026-08-14 — 0.4.0 / 週次進行ループ

- Asia/Tokyoの月曜00:00を境界にしたISO週runと、起動時catch-up・手動実行を追加。同一週のrun/task/node/auditは固定IDで冪等化。
- 完了taskの1 ID 1付箋、再オープン履歴、週次summary、既存node/edge/viewport・ユーザー移動座標の保持を実装。
- 決定論的な不足task提案ルールを追加。自動taskはS4出典を持たず、内部provenance・根拠・期待成果物・要確認状態を保持し、編集・削除・無効化・tombstone抑止に対応。
- schema v4へ安全移行し、週次task/node/run/auditを全量検証後に単一bundle保存・再読込確認。保存失敗時は画面状態を変更しない。
- JST/ISO年境界、固定+09:00、catch-up、冪等、完了→再オープン、悪性weekly JSON、保存失敗、schema v3移行、desktop/mobile E2Eを追加。

## 2026-08-14 — 0.3.0 / 全タスクリスト統合

- S4（SHA-256 `D24C…BE87`、300行）を権威ある計画として追加し、P0-01〜P6-07の73件へ初期データを更新。
- Phase/担当者/期限/チーム、Phase別進捗、3月開始カウント、KPI実績、依存ブロック、隔週LINE報告、Phase 5モバイル操作を追加。
- schema v3へ移行。旧v2タスクを重複表示せず移行アーカイブへ保持し、flow/viewport/auditを継承。
- 保留理由の空白・全角空白・zero-width入力拒否、S4行範囲、73件オラクル、移行冪等性をunit/E2Eで検証。

### 独立受入 G0〜G10 必須是正

- S4の73表行を全フィールド・原行番号で直接比較し、括弧内の役割と `※契約後` を含む担当原文を無損失化。検索用`personKeys`を責任者から分離。
- 正本IDのS4期待行、出典必須、未知原文チーム、finite座標、canvas task参照、edge/audit ID重複、audit全項目、KPI finite/非負をimport時に検証。
- P系正本73件を削除不可とし、custom taskだけ参照整合性を保って削除可能に変更。
- task削除、canvas保存、JSON import、KPI更新、隔週報告基準更新の操作auditを復元。
- 隔週報告をID一意化し、状態遷移とblock理由を同じ1行に記載。改行・見出し文字の注入を無害化。

## 2026-08-14 — 0.2.1 / 反証監査 Round 2

| ID | 分類 | 修正結果 | 再試験 | 残留リスク |
| --- | --- | --- | --- | --- |
| R2-M01 | 出典 | T-003/T-018/T-019の日程根拠をS3:432–468へ統一 | unit | 入力改版時は再採番 |
| R2-M02 | CRUD | 編集後グラフ全体を検査し、編集順序を使った循環を拒否 | unit | 同時タブ編集は対象外 |
| R2-M03 | import | 監査列挙・ID・重複、出典固定値・行上限、flow自己辺を完全検証 | unit/E2E | 将来schema移行が必要 |
| R2-M04 | 組織 | S2見出しどおりの13名称へ統一し、旧表示名を安定IDから安全に移行 | unit | 外部連携は安定ID必須 |
| R2-M05 | 日付/公開 | 年なし期間を要再確認とし、学校名公開可否の競合出典を表示 | unit/UI | 責任者判断待ち |
| R2-M06 | 永続化 | `getItem`を1回に限定し、SecurityErrorを再throwせずUI通知 | unit/App | ブラウザ削除は回復不能 |
| R2-M07 | 品質 | CRUD、正常import、復元、保存失敗、360/768/1440、reduced motionをE2E化 | 全script | Chromium以外は未確認 |

Round 1の記録は下記へ保持し、Round 2の詳細は `docs/audit-round-2.md`、最終検証は `docs/verification/round-2-final.md` に記録します。

### 最終受入是正（第3監査ではない）

- Round 2監査ログ時刻を、`src/data.ts` の実ファイル更新時刻に一致する `2026-08-14T20:40:06+09:00` へ訂正。
- 通常操作ログを `OP-*` とし、監査指摘IDから分離。対象版を0.2.1、再試験を `未実施（操作時点）`、表示名を `操作履歴` に統一。
- `round: 2` は現行Round 2運用期の必須メタデータとして記録するが、通常操作は監査指摘の修正ではない旨をaction/detailへ明記。
- 詳細は `docs/acceptance-correction-round-2.md` に記録。

## 2026-08-14 — 0.2.0 / 反証監査 Round 1

| ID | 分類 | 対象ファイル | before | after | 再試験 | 残留リスク |
| --- | --- | --- | --- | --- | --- | --- |
| R1-M01 | 再現性 | `docs/verification/file-hashes.txt` | コミット以外の再現情報なし | 対象ファイルSHA-256と検証日時を記録 | ハッシュ生成 | コミットは秘書担当 |
| R1-M02 | データ | `src/data.ts` | T-014/T-026の意味が誤り | 指定文言と意味へ訂正 | unit/E2E表示 | 入力内容自体は要再確認 |
| R1-M03 | データ/UI | `src/types.ts`, `src/data.ts`, `TaskModal.tsx`, `TaskBoard.tsx` | 未確定情報が自由文のみ | assignmentStatus/dateStatus/publicationStatus/asOf/conflictingSourceRefsを表示・編集 | UI/a11y/E2E | 責任者による確定待ち |
| R1-M04 | 出典 | `src/types.ts`, `src/data.ts`, `storage.ts` | 出典が単一文字列 | S1/S2/S3のSHA-256、実行範囲、基準日、確度を配列化 | unit完全検証 | 行範囲は入力ファイル現版に依存 |
| R1-M05 | 網羅性 | `src/data.ts`, `docs/source-duty-map.md` | 13表示名のみ、S2業務に不足 | 安定ID＋13正規名、39タスク、全業務対応表 | unit件数/文書照合 | タスク粒度は運用時に再調整可 |
| R1-M06 | 検索 | `TaskBoard.tsx` | ID/タイトル/担当/リスクのみ | 部署、出典、詳細、状態、時期等を横断 | UI test | 大量件数時の索引なし |
| R1-M07 | CRUD検証 | `storage.ts`, `TaskModal.tsx` | 参照切れのみ一部検査 | 存在、自己参照、重複、循環を項目エラー化 | unit/UI | 同時編集は対象外 |
| R1-M08 | import | `storage.ts`, `App.tsx` | 部分検証、状態更新が分離 | schema v2、全項目、列挙、日時、上限、nodes/edges、依存を完全検証し原子的拒否 | unit/E2E | 将来schemaは移行実装が必要 |
| R1-M09 | 永続化 | `types.ts`, `storage.ts`, `App.tsx`, `ProjectCanvas.tsx` | viewportなし、分割キー | FlowDataへviewport追加、bundle一括保存 | unit/E2E再読込 | localStorage容量上限あり |
| R1-M10 | 耐障害 | `storage.ts`, `App.tsx` | 例外時に無言で初期化 | parse/読書例外をUI通知、raw値保護 | unit | ブラウザ自体のデータ削除は回復不能 |
| R1-M11 | A11y | `TaskModal.tsx` | dialog属性・明示ラベル・trap不足 | dialog/aria-modal、全controlラベル、trap、Esc、起点復帰 | UI/a11y | 支援技術ごとの実機差 |
| R1-M12 | A11y | `ProjectCanvas.tsx` | ドラッグ必須 | 接続元/先select、接続/解除、4方向移動 | E2E desktop/mobile | 自由配置の細粒度移動は20px単位 |
| R1-M13 | mobile | `TaskBoard.tsx`, `styles.css` | mobileセル見出し欠落 | 全tdにdata-label | UI/E2E 390×844 | 320px未満は対象外 |
| R1-M14 | 監査ログ | `types.ts`, `AuditLog.tsx`, `data.ts` | action/detailのみ、28件誤記 | 指定全フィールド、Markdown保存、39件へ訂正 | unit/UI | ブラウザ外の証跡はdocsで補完 |
| R1-M15 | 品質 | `eslint.config.js`, tests, `playwright.config.ts`, `docs/verification/` | lintがtypecheck代用、UI/a11y/E2Eなし | 独立scriptと3周検証を実体化 | 全script 0 | Chromium以外は未検証 |
| R1-M16 | security | `package.json`, `pnpm-lock.yaml` | Vite 5/Vitest 2、監査脆弱性 | Vite 6.4.3、Vitest 3.2.6、Playwright 1.55.1 | pnpm audit 0 | 将来の新規advisory |
| R1-R01 | 手順 | `README.md`, `package.json` | npm/pnpm混在 | pnpm 11.19.0＋frozen lockfileへ統一 | clean install手順記載 | Corepack可用性は環境依存 |
| R1-R02 | 通知 | `App.tsx`, `TaskModal.tsx` | errorもstatus | errorはalert、成功はstatus | a11y/E2E | confirmはブラウザ標準UI |

証拠と詳細は `docs/audit-round-1.md`、3周ログは `docs/verification/` に分離して保存しています。

## 2026-08-14 — 0.1.0 / Initial build

- React + TypeScript + Viteのローカルファースト運用アプリを新規構築。
- 13組織単位・29件の初期タスク、Kanban/一覧、自由キャンバス、localStorage、JSON import/exportを実装。
