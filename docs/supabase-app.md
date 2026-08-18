# Supabaseフロントエンド接続

## 公開境界

GitHub PagesのHTML、JavaScript、CSS、source map、repository履歴はSupabase Authでは非公開になりません。本アプリでは、既に公開済みのS4静的正本と初期73タスク本文を公開seedとしてartifactへ含めます。Supabase Auth/RLSが保護するのは更新状態と共有編集データです。公開seed以外の非公開追記、利用者の個人情報、秘密情報、tokenをrepositoryや公開artifactへ含めないでください。ブラウザへ渡すSupabase値はProject URLとpublishable keyだけです。`service_role`、secret key、DB password、access tokenはフロントエンドやGitHub Actionsへ設定しません。

## ローカル設定

`.env.example`を参考に、追跡されない`.env.local`へ次だけを設定します。

```dotenv
VITE_SUPABASE_URL=https://PROJECT_REF.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_xxx
```

未設定のproduction画面は設定不足を表示します。未設定の`vite dev`は既存機能の回帰確認用ローカルモードで動き、共有されないことを上部に表示します。

## Auth callback

root callback方式です。`emailRedirectTo`は検証済みの`window.location.origin + import.meta.env.BASE_URL`から作るため、GitHub project Pagesではrepository pathを含みます。Supabase DashboardのSite URL、Redirect URL、magic-link templateも同じ完全URLにしてください。公開signupを無効化し、magic linkは`shouldCreateUser: false`で招待済みユーザーだけに送ります。callbackのquery/hashにある`error`、`error_code`、`error_description`はログイン画面へ明示し、表示時に制御文字とHTML記号を除去したうえでURLから除去します。

## データ更新

- `rpc_list_my_organizations`で有効membershipの組織を選択します。
- `rpc_read_snapshot`のentity群からschema v4 bundleを再構築し、既存`validateBundle`合格後だけ表示します。
- DB entity payloadは常に`payload.id === entityId`です。viewportは`{id:'singleton',x,y,zoom}`、報告基準は`{id:'singleton',value}`、週次metadataは`{id:'singleton',lastRunId}`として送受信し、bundle adapterだけでUI shapeへ戻します。taskのcreated run/provenance、flow nodeのweekly run、weekly metadataのlast runも`references`へ明示します。
- 更新候補を全量検証し、entity差分、entity expected version、workspace expected state versionを`rpc_apply_changes`へ送ります。
- 通常更新は`rpc_apply_changes`、週次更新は`rpc_save_weekly`を使用します。RPC成功後に必ず`rpc_read_snapshot`で再取得し、候補と一致した後だけReact stateとorganization別の`nexus.cloud.cache.v1:<organizationId>`を更新します。cache envelopeにはorganization ID、state version、server確認時刻を含めます。
- `nexus.bundle.v4`は初回移行元として不変に保ち、クラウドread-backで上書きしません。
- 競合・通信断では未保存候補をorganization別の親状態へ保持し、poll/focus同期を停止します。候補を書き出す、最新版を確認する、再適用する、または明示的に破棄するまで保持します。
- `42501`、membership失効、organization access失効は権限剥奪として扱い、該当workspaceとcloud cacheを即時に閉じてorganization一覧を再取得します。
- 権限剥奪前の未保存候補はworkspace/cacheと分離した回収一覧へorganization ID付きで残し、選択中organizationに関係なくJSON書き出しまたは明示破棄できます。
- viewerは読み取り専用です。15秒pollとwindow focus・visibility復帰で安全に再取得します。

## Membership管理

ownerだけが`rpc_list_memberships`と`rpc_manage_membership`を使用できます。画面にメールアドレスを列挙せず、確認済みAuth user UUID、role、membership versionだけを扱います。追加はexpected membership version 0、更新・削除は表示中のversionを送り、organization state versionとの二重競合検知後にworkspaceとmembership一覧をserver read-backします。現在ログイン中の自分自身は事故防止のため画面から変更しません。

## 未移行organization

entityが空でimport manifestもない場合、共有編集画面を開きません。同一originのv4/v3/v2 rawまたは選択したJSONについて、raw SHA-256、semantic fingerprint、byte数、source entity件数を表示します。壊れたrawでもバックアップ保存は可能です。保存したrawをもう一度ファイル選択してbyte一致とSHA-256一致を確認し、remote 0件、移行先organization名/slug、owner roleが揃うまで実行ボタンを有効にしません。`rpc_import_v4`成功後は`rpc_read_snapshot`でbundleと件数を再検証し、organization別cacheと成功markerを保存します。元localStorageは自動削除・更新しません。

Supabase CLIはdev dependencyとして`2.114.0`に固定しています。`src/cloud/database.types.ts`はmigrationに含まれるpublic table/RPC全体から作成しており、CIはlocal DBをresetした生成型と双方向の構造差分を型検査します。実DB migration適用後にも次を実行し、差分がないことを確認してください。

```bash
pnpm supabase gen types typescript --project-id PROJECT_REF > src/cloud/database.types.ts
```

remote advisorは認証情報を持たないPR CIでは実行しません。migrationをremoteへ適用した担当者が、GitHub Pages environmentを承認する前に次を実行し、security/performanceの全指摘を解消または記録することを手動ゲートとします。

```bash
pnpm supabase db advisors --linked
```

## GitHub Actions

Repository Variablesに`VITE_SUPABASE_URL`と`VITE_SUPABASE_PUBLISHABLE_KEY`を登録します。PRと全branchでlint、typecheck、unit/UI/a11y/E2E、`pnpm audit`、非秘密dummy publishable keyによるprebuild、repository履歴・working tree・`dist`のcredential-shaped scanを実行します。独立したDB jobはDocker上で`supabase start`、`db reset`、`supabase/tests/rls.sql`、生成Database型の双方向構造差分、`supabase stop`を実行します。default branchのbuild/deployはqualityとDB jobの両方が成功した場合だけ進み、HTTPS originと`sb_publishable_`形式をproduction build前に再検証してsecret key、service-role文字列、JWT形式を拒否します。E2Eはproduction Supabaseや本番test accountへ接続せず、未設定の開発ローカルモードで既存UIを検証します。
