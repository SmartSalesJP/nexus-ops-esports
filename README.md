# NEXUS OPS — eスポーツプロジェクト運用アプリ

ローカルファーストで動く、eスポーツ人材発掘・育成プロジェクト向けのタスク管理・企画キャンバスです。進捗の正本はタスク進行表、キャンバスは企画補助です。

## 必要環境と起動

- Node.js 20以上
- pnpm 11.19.0（`packageManager`で固定）

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm dev
```

依存関係は `pnpm-lock.yaml` を正本とし、npm/yarnとの混在はサポートしません。

## 非対話の品質検査

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

初回E2Eだけ `pnpm exec playwright install chromium` が必要です。

## 主な機能

- 安定組織IDと原文どおりの13表示名、39件の初期タスク
- 責任者・期限・公開可否の確定状態、基準日、競合出典の構造化表示
- SHA-256と実行範囲を持つS1/S2/S3出典配列
- 部署・出典・詳細・状態・時期を横断する検索、部署・状態フィルター
- 依存IDの存在・自己参照・重複・循環を検査するCRUD
- schemaVersion 2の完全検証・原子的JSON import
- `nodes` / `edges` / `viewport` / 監査ログを `nexus.bundle.v2` に一括保存
- 保存・読込例外のUI通知と破損値保護
- フォーカストラップ付きモーダル、ドラッグ不要の接続・解除・ノード移動
- 全セルに見出しを持つモバイル一覧、390×844 E2E
- 指摘ID、分類、対象版、対象ファイル、before/after、証拠、再試験、残留リスク、roundを持つ監査ログとMarkdown保存

## データとimport

保存キーは `nexus.bundle.v2` です。別ブラウザ・端末へは同期されません。ブラウザデータ削除に備えて定期的にJSONを書き出してください。

importは2,000,000 bytes、タスク500件、ノード500件、接続2,000件、監査2,000件が上限です。schema、全必須項目、列挙、日時、重複、参照切れ、依存循環を検査し、1件でも不正なら既存状態を変更しません。

## 注意

- 3月開催は年未確定です。過去月表記は `期限超過` または `年未確定` として再確認対象です。
- 初期責任者と公開可否は確定情報として扱いません。
- Riot Games / VALORANT関連は、公開・契約前に最新の公式規約と許諾要件を責任者が確認してください。
- 契約、個人情報、未成年者同意、法務判断は責任者・専門家の確認が必要です。

監査対応は [docs/audit-round-1.md](docs/audit-round-1.md)、S2業務対応表は [docs/source-duty-map.md](docs/source-duty-map.md)、検証証跡は `docs/verification/` を参照してください。
