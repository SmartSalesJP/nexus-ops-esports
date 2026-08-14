# 反証監査 Round 2 修正記録

対象版: 0.2.1 / 基準日: 2026-08-14 / 監査ログ記録時刻: 2026-08-14T20:40:06+09:00

Round 1の実装・ログを保持したまま、R2-M01〜R2-M07を追補した。

| ID | 目的 | 根拠となる変更 | 受入確認 | 残留リスク |
| --- | --- | --- | --- | --- |
| R2-M01 | 日程参照範囲の是正 | `src/data.ts`, `src/sourceCatalog.ts` | T-003/T-018/T-019がS3:432–468 | 入力改版時の行ずれ |
| R2-M02 | 編集順序による循環回避を封止 | `src/storage.ts` | 後編集で閉じる循環をunitで拒否 | 同時タブ編集 |
| R2-M03 | import完全検証 | `src/storage.ts` | 不正監査列挙、数値issueId、監査ID重複、偽装出典、範囲外行、自己辺をunitで拒否 | 将来schema |
| R2-M04 | 13組織名の正式化 | `src/types.ts`, `src/storage.ts` | S2見出し完全一致、旧名bundle再読込 | 外部独自表示名 |
| R2-M05 | 日付と公開競合の誤認防止 | `src/data.ts`, `TaskBoard.tsx` | 月範囲は要再確認、競合出典を一覧/カード表示 | 開催年・公開判断待ち |
| R2-M06 | 読取失敗の安全化 | `src/storage.ts`, `src/App.test.tsx` | getItem 1回、SecurityErrorをalert表示 | ブラウザ削除 |
| R2-M07 | 回帰証跡拡張 | tests, `e2e/app.spec.ts` | unit 33、UI 8、a11y 2、E2E 12 | Chromium以外 |

詳細なコマンド結果は `docs/verification/round-2-final.md` に記録する。R1文書と監査項目は削除・上書きしていない。

最終受入で判明した時刻と通常操作ログの事実性是正は、監査Roundを増やさず `docs/acceptance-correction-round-2.md` に追記した。
