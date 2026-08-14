# 反証監査 Round 1 修正報告

検証日時: 2026-08-14（Asia/Tokyo）  
対象版: 0.2.0  
担当: eスポーツ修正開発部

## 結果

R1-M01〜M16、R1-R01/R02をコード、テスト、文書へ対応しました。入力3資料のSHA-256は監査票の正式値と一致しました。T-014とT-026を指定文言へ訂正し、S2業務不足をT-030〜T-039で補完、初期データを39件にしました。

## 受入結果

| ゲート | 結果 | 証拠 |
| --- | --- | --- |
| データ/出典 | PASS | `src/data.ts`, `docs/source-duty-map.md`, unit 12件 |
| CRUD/import/保存耐障害 | PASS | `src/storage.ts`, unit 12件、E2E import拒否 |
| UI/アクセシビリティ | PASS | UI 7件、axe 2件、E2E 390×844 |
| 静的品質 | PASS | lint 0、typecheck 0、build 0 |
| セキュリティ | PASS | `pnpm audit --audit-level=moderate`: 0 vulnerabilities |
| 実ブラウザ | PASS | Chromium desktop/mobile計6件 |

## 3周

1. 静的: lint、typecheck、build、audit。
2. 機能: unit、UI、a11y、desktop/mobile E2E。
3. 耐障害: 破損localStorage保護、quota例外、oversize、schema/列挙/日時、重複/参照切れ/循環、原子的import拒否。

個別コマンド結果は `docs/verification/round-1-static.md`、`round-2-functional.md`、`round-3-resilience.md` を参照してください。

## 残留リスク

- 開催年、責任者、公開可否、Riot Games関連の規約・許諾は業務責任者の再確認が必要です。
- E2EはChromiumのみです。Safari/Firefox固有差は未確認です。
- 保存はlocalStorageのため、ブラウザデータ削除・端末故障・別端末同期には対応しません。
- 法務、契約、個人情報、未成年者同意は専門家確認を代替しません。
