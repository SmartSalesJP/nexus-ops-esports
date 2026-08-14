# 週次進行ループ運用

## 実行責務

- アプリ内catch-upを正とします。Asia/Tokyoの月曜00:00を週境界にし、その週の初回起動で `weekly:YYYY-Www` を実行します。
- ブラウザ停止中の厳密00:00実行は保証できません。複数週空いた場合は当週だけを作り、`missedWeekCount` に未実行週数を記録します。過去週の状態は推測しません。
- 「今すぐ週次更新」は当週runの初回 `scheduledFor`、`ranAt`、`trigger`、snapshotを変更しません。同じ入力で再実行した場合は `exportedAt` とauditを含むbundle全体を変更しません。完了・再オープンの現在状態はtask別completionへ分離し、初回snapshotを遡及変更しません。
- Codex定期automationを併用する場合、その責務はこのtask/threadを毎週起動し、進行管理部として検証してユーザーへ報告することです。localStorageやexport JSONを直接編集しません。

## 保存と復旧

週次実行は `tasks + flow + audit + weekly` を1個のschema v4 bundleに構成し、全量validatorを通した後に1回保存し、再読込文字列が一致した場合だけ画面状態へ反映します。失敗情報は可能な場合のみ `nexus.weekly.failure.v1` へ別保存します。正本bundleを失敗情報で上書きしたり、初期73件へ暗黙に戻したりしません。

## 付箋

- 完了付箋: `weekly-complete:<taskId>`。taskごとに1枚です。`firstSeen`、`lastConfirmed`、完了ISO週、担当、Phase、現在状態を持ちます。アプリ操作で完了した場合はその状態変更時刻、既存完了を週次処理で初めて検出した場合はtask更新日時を「推定」と明記します。未完了へ戻しても付箋を消さず再オープン表示に変えます。
- summary: `weekly-summary:<runId>`。1週1枚です。完了数、Phase 0〜6、高緊急残、blocker、KPI、未実行週数を保存します。
- 既存付箋を再同期するときはユーザーが移動した座標を保持します。通常node/edge/viewportは変更しません。

## 自動提案ルール

外部AI APIは使用しません。入力bundleだけから次を決定論的に判定します。

- 未完了依存がある（依存整合4点。単独で提案条件を満たす）
- 期限7日以内3点 + 高緊急2点（合計5点）で、成果物・完了確認taskがない
- 14日以内milestone 3点 + checklist欠落2点（合計5点）
- KPI実績未入力、または目標未達。原因を断定せず、計測/入力確認または差分分析/対策案作成を提案

生成taskは未着手・要確認で、正本Pタスクを変更/削除しません。内部provenance、fingerprint、作成部署、作成runId、根拠コード、理由、期待成果物を保持します。S4 `sourceRefs` は付けません。ユーザーは通常の編集・削除ができ、編集画面で無効化できます。削除時はtombstoneを残して同根拠の再生成を抑止します。

## 検証記録

2026-08-14（Asia/Tokyo）に、型検査、ESLint、production build、Vitest 7 files / 51 tests、Playwright Chromium desktop 11 + mobile 11 = 22 testsを完走しました。週次回帰では、73taskの完了状態変更後に同週手動実行しても保存文字列が完全一致すること、初回snapshotが固定されること、再オープン状態がcompletion付箋へ反映されることを確認しています。ブラウザ停止中の月曜00:00実行には外部スケジューラが必要であり、アプリ単体では次回起動時catch-upです。
