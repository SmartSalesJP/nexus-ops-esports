# 別PC用：GitHub公開・Supabase共有化 一気通貫プロンプト

このファイルは、公開作業に使うWindowsノートPCのCodexへ、全文をそのままコピー＆ペーストしてください。

## 貼り付け前に用意するもの

1. このプロジェクトフォルダー全体
   - C:\Users\81904\OneDrive\ドキュメント\ChatGPT\EXCEL×TBC
   - OneDrive同期、USB、または安全なファイル転送でノートPCへコピーしてください。
2. 元PCの最新データ
   - 元PCで http://127.0.0.1:5173/ を開き、上部の「書き出し」からschema v4 JSONを保存してください。
   - JSONはOneDriveまたはUSBでノートPCへ移してください。
   - このJSONがない場合、元PCのブラウザにしかないステータス変更は移行できません。
3. GitHubアカウント
4. Supabaseアカウント
5. 共有確認に使う2人分のメールアドレスまたは2つのテストアカウント

---

# ここから下を別PCのCodexへ貼り付ける

あなたはこの作業を、調査、実装、外部サービス設定、データ移行、検証、GitHub公開、最終報告まで一気通貫で担当してください。

## 目的

React / TypeScript / Vite製のeスポーツ大会進行管理アプリをGitHubへ安全に公開し、Supabase Auth・Postgres・RLSを使って、許可された複数ユーザーが同じ組織のタスク状態、キャンバス、監査ログ、KPI、隔週報告、週次状態を共有できるようにしてください。

対象フォルダーの候補:

    C:\Users\81904\OneDrive\ドキュメント\ChatGPT\EXCEL×TBC

別PCでパスが異なる場合は、package.json、pnpm-lock.yaml、src、.gitがあるフォルダーを読み取り専用で探索し、正しいプロジェクトを特定してください。

既知の現状:

- Gitリポジトリは存在するが、GitHub remoteは未設定
- 現在のブランチはmaster
- package managerはpnpm 11.19.0
- React 18、TypeScript、Vite 6
- 保存正本はブラウザlocalStorageのnexus.bundle.v4
- schema v4にはtasks、flow、audit、kpis、reportBaseline、migrationArchive、weeklyが含まれる
- src/storage.tsに全量検証、旧schema移行、原子的localStorage保存がある
- Viteのbaseは未設定
- 最終既知コミットは8480496

## 作業原則

- 安全に進められる工程は自律的に進めてください。
- 完全無対話は約束しないでください。本人ログイン、公開範囲、課金、データ正本、破壊的変更など重要な選択が必要な時だけ停止してください。
- 質問は可能な限り一度にまとめ、推奨値と影響を短く提示してください。回答後は停止地点から再開し、最後まで進めてください。
- CLIやサービス仕様が変わっている場合は、GitHub、Vite、Supabaseの公式ドキュメントだけで確認してください。
- 既存のユーザー変更を保持してください。無断のreset、checkoutによる破棄、force push、履歴改変、repository削除、Supabase project削除、remote DB reset、テーブルdropは禁止です。
- 作業中は60秒以上無言にせず、短い進捗を知らせてください。
- 作成担当とは別の独立チェック担当を使い、初回レビューでは必ず問題点を探してください。必須修正を直して再レビューし、必須修正0件になるまで完了にしないでください。

## 公開物の情報境界（push・deploy前の最優先停止条件）

Supabase AuthとRLSが保護するのはDatabase APIです。GitHub repository、Git履歴、GitHub PagesのHTML・JavaScript・source map・assetはログイン画面では保護できません。

現行ソースには、氏名、契約、単価、利益配分、予算、交渉先、学校、出演者候補、LINE由来情報が含まれる可能性があります。作業tree、全Git履歴、docs、distを検査し、initialTasks、organizationUnits、people、KPI初期値も対象にしてください。

- 本番bundleへ実業務の初期データを埋め込まない。
- 未認証で取得できるbundleには、空schema、一般的な列挙値、秘密でないUI文言だけを含める。
- 実データは認証とRLS合格後にSupabaseから取得する。
- test fixtureは本番import graphとdistから除外する。
- source mapを公開する場合も機密情報がないことを検査する。
- git add .やgit add -Aで無差別stageしない。公開対象をallowlistで明示stageする。
- この引継ぎMarkdownやローカル絶対パスを公開repositoryへ自動stageしない。

追跡済み履歴またはdistに公開禁止情報がある場合は即停止し、本人に次のいずれかを選択させてください。

1. repositoryとサイトのアクセス制限を実測できる別構成
2. 明示承認を得た新しいsanitized repositoryとsanitized history
3. 公開禁止情報を完全に除去した別成果物

既存履歴を保持したままpublic repositoryへpushしないでください。ログイン画面があることを公開対策として扱わないでください。

## 最初の読み取り確認と一括質問

最初にAGENTS.mdとプロジェクト全体を確認し、次を記録してください。

- git status、現在branch、HEAD、remote、未追跡ファイル
- Node.js、pnpm、gh、Supabase CLIの有無とversion
- package.json、lockfile、Vite設定、ルーティング方式
- localStorage v4のキー、型、件数、読書き箇所、既存validator
- 現在のテスト構成と既知のエラー
- 秘密情報、個人情報、LINE由来の会話、契約・金額・人名など公開前に確認が必要な情報
- GitHubとSupabaseの現在のログイン先、対象owner・organizationへの操作権限

次が明示されていなければ、一度の質問にまとめてください。

1. GitHub owner（個人またはorganization）
2. repository名
3. repository visibility（public/private）
4. Pagesサイトを誰まで閲覧可能にするか
5. Supabase organization、project名、region、plan
6. 推奨の招待制メール認証でよいか
7. 初期ownerのメールアドレス
8. 2ユーザー確認に使う別メールまたはテストアカウント
9. 元PCから書き出したschema v4 JSONの場所
10. そのJSONを正本として空のクラウドへ初回移行してよいか
11. 既存データに公開禁止の個人情報・営業秘密が含まれるか
12. Supabaseは新規projectか既存projectか、dev/staging/productionのどれか
13. 少人数向けDashboard招待と、継続運用向けEdge Function招待のどちらにするか

推奨初期値:

- サイトはURLを知っていてもログインしなければ業務データを見られない
- Authは招待制のメールmagic link
- 公開signupは無効
- roleはowner、editor、viewer
- 最初は1 organization
- クラウドDBが空の状態で、元PCから書き出した1つのJSONだけを正本として移行

GitHub ownerとvisibilityは推測しないでください。private repositoryで現在のGitHubプランではPages公開要件を満たせない場合、勝手にpublicへ変更せず選択を求めてください。

## 事前保全

変更前に以下を行ってください。

- 現在HEADを記録し、安全なbackup branchまたはtagを作成
- 未コミット変更がある場合は、所有者と内容を確認して保全
- .env、認証情報、秘密鍵、token、DB接続文字列、個人データdumpがGit対象や履歴にないかsecret scan
- .env作成前に.gitignoreへ.env.local、.env.*.local、Supabase CLIの一時・秘密ファイルを追加し、.env.exampleだけを追跡可能にする
- git check-ignore .env.localとgit ls-filesで.env.localが非追跡であることを実証
- 元のschema v4 JSONのSHA-256、サイズ、schema、主要件数を記録
- 既存テストを実行し、変更前からの失敗と変更後の失敗を区別
- Node.js 20以上、pnpm、gh、Supabase CLIがなければ公式手順で導入
- インストールやブラウザログインで本人操作が必要な時だけ依頼

秘密が見つかった場合はpushを停止し、削除だけで済ませず、漏えい範囲と鍵のrotation要否を報告してください。

## GitHub公開

1. gh --versionとgh auth status --hostname github.comを確認し、hostとログイン名を表示する。
2. 未認証ならgh auth login --web等を開始し、ブラウザ認証だけ依頼する。
3. ログインユーザーが確認済みownerへrepositoryを作成できることを本人に確認する。別アカウントなら停止する。
4. 確認済みowner、repository名、visibilityで、auto-init、README、license追加なしの空repositoryを作る。
5. 既存repositoryが存在した場合は、owner、URL、内容の一致を確認するまでpushしない。
6. 既存masterの履歴を失わず、default branchをmainへ安全に移行する。ただしsanitized historyが必要な場合は本人承認なしに既存履歴を公開しない。
7. originを無断で上書きしない。
8. 公開前にstaged diffとsecret scanを再確認する。

公開順序:

1. 公開情報検査、local test、local build、distのsecret・個人情報scan、独立レビューを完了する。
2. 本人による情報公開承認後、作業branchをpushする。
3. CIはpull_requestと作業branchで実行し、permissionsはcontents: readだけとする。production Supabaseやproduction test accountへ接続しない。
4. CI合格と独立レビュー後にmainへ統合する。
5. deploy workflowはmain pushとworkflow_dispatchだけで実行する。
6. deploy後に公開URL、Auth、RLS、2ユーザーsmokeを行う。

## Supabaseの共有設計

### 認証

- Supabase Authを使用する。
- 未認証では共有データを一切読書きできない。
- 最初は招待制メール認証を基本とし、公開signupはowner確認なしに有効化しない。
- sign-in、magic link callback、session復元、sign-out、期限切れ、認証エラーを実装する。
- 本番Site URLとRedirect URLは最終GitHub Pages URLのrepository pathを含む完全URLにする。
- localhost用redirectは本番とは別に限定登録する。
- productionで広すぎるwildcardを使用しない。
- 認証済みでもorganization memberでなければ共有データへアクセスできない。

招待方式を実装前に次から選択してください。

- 少人数向け: Supabase DashboardのAuth管理者がユーザーを招待し、確認済みAuth user UUIDだけをownerがmembershipへ追加する。フロントからAuth admin APIを呼ばない。
- 継続運用向け: 認証済みEdge Functionで呼出者JWT、organization owner role、招待先、期限、再利用防止を検証してからAuth admin inviteを行う。service roleまたはsecret keyはEdge Function server runtimeだけに置く。

公開signup無効時、通常magic linkから未登録ユーザーを自動作成しない設定を確認してください。

初期ownerは、本人指定メールとSupabase Auth上のuser UUIDを管理者が照合した後、一度だけ管理者操作でorganizationとowner membershipを作ってください。メールやUUIDをmigrationへcommitせず、最初にアクセスしたユーザーをownerにする方式は禁止です。最後のownerの削除・降格もDB側で禁止してください。

### organizationとrole

最低限、organizationsとorganization_membersを作ってください。

- owner: organization設定、membership、共有データの読書き
- editor: membership変更不可、共有データの読書き
- viewer: 読取りのみ
- authenticated non-member: 読取り・書込み不可
- anon: 読取り・書込み不可

初期organizationと最初のownerを安全にbootstrapする手順をmigrationまたは権限検査付きRPCとして再現可能にしてください。

### データモデル

schema v4全体を1つの巨大JSON行だけで保存しないでください。最低限、次をorganization配下の個別行として保持してください。

- tasks
- canvas nodes、edges、viewport
- KPIs
- report baseline
- migration archive
- weekly runs、completion、tombstone、metadata
- 既存の業務audit
- サーバー側変更監査
- import fingerprintとmigration manifest

各共有entityは最低限、organization_id、安定ID、schema/type、payloadまたは型付き列、version、created_at、updated_at、created_by、updated_byを持たせてください。

PK、FK、NOT NULL、unique、check、必要なindexを設定してください。updated_at、actor、versionはクライアント申告だけを信用せず、DB側で管理してください。

更新はentity単位の楽観ロックにし、期待versionが違う時は上書きせず競合を返してください。週次処理や初回importなど複数entityの更新は、権限検査付きSQL function/RPCで1トランザクションにしてください。

共有entityのINSERT、UPDATE、DELETEは権限検査付きRPCを正規経路とし、authenticated roleの直接table DMLをrevokeするか、DB triggerで同じ検査を強制してください。UPDATEはDB内でorganization、ID、expected versionが一致する行だけを更新し、version、updated_at、updated_byをserver側で更新してください。0件更新を成功扱いせず、権限拒否、未存在、競合を情報漏えいしない形で扱ってください。直接REST UPDATEでversion検査を迂回できないことをテストしてください。

競合時:

- last-write-winsで相手の更新を消さない
- 未保存候補を保持またはJSON export可能にする
- 最新版の再読込、差分確認、再適用をUIで案内する

### RLS

- publicなど外部APIに露出する全業務tableでRLSを有効化する。
- SELECT、INSERT、UPDATE、DELETEを個別に定義する。
- policyではauth.uid()が対象organizationの有効なmembershipを持つことを確認する。
- 書込みはroleも検証する。
- USINGとWITH CHECKを正しく設定する。
- anon、non-member、退会済みuser、別organization userを拒否する。
- server auditの一般ユーザーによるUPDATEとDELETEを禁止する。
- 必要ならFORCE ROW LEVEL SECURITYを検討する。
- organization_id、created_by、作成時の安定IDを一般UPDATEで変更できないようにする。
- entity IDは必要に応じてorganization_idとの複合一意制約にする。
- edgeからnode、weeklyからtaskなどの参照はorganization_idを含むcomposite FKまたは同等のDB検査で別organization参照を禁止する。
- membershipのorganization_idとuser_idを一般UPDATEできないようにする。
- role変更とmembership削除は対象organizationのownerだけに許可し、最後のownerを削除・降格できないようにする。
- 両方のorganizationに所属するeditorを使い、organization移動とcross-org参照が拒否されることをテストする。

security definer関数を使う場合:

- search_pathを空または安全な固定値にする
- 完全修飾名を使用
- 関数内でauth.uid()、organization、roleを再検証
- PUBLICのEXECUTEをrevoke
- 必要なauthenticated roleだけへgrant

### 監査

DB triggerまたは安全なfunctionで、actor、organization、entity、operation、変更前後、version、server timestampを記録してください。一般クライアントから監査行を改ざん・削除できないようにしてください。秘密値や不要な個人情報は監査へ保存しないでください。

### API keyとSecret

ブラウザで使えるのはSupabase Project URLとpublishable key（旧anon key相当）だけです。publishable keyは静的JSから見えるため、RLSを本当の安全境界にしてください。

以下はフロントエンド、VITE_変数、Git、公開artifact、ブラウザログ、最終報告へ絶対に入れないでください。

- service_roleまたはsecret key
- Supabase DB password
- Supabase access token
- GitHub tokenまたはPAT
- OAuth client secret
- private key

ローカル値は追跡されない.env.localへ置き、.env.exampleには変数名とダミー値だけを置いてください。GitHub Actionsには必要なProject URLとpublishable keyだけをRepository VariablesまたはSecretsとして設定し、service_roleはActionsにも置かないでください。

## Supabase migration

- Supabase CLIをproject dev dependencyとしてversion固定する。
- supabase login後にsupabase projects listでログイン先を確認する。
- 新規projectか既存projectか、dev/staging/productionのどれかを明示する。
- supabase link前後にproject ref、organization、region、environmentを表示し、本人確認を得る。
- DB passwordとaccess tokenをコマンド引数、shell history、ログ、最終報告へ出さない。
- supabase/migrationsへ、schema、constraints、indexes、RLS、functions、triggers、grantsを順序付きSQLで保存する。
- Dashboardだけの再現不能なDDLは禁止する。
- clean local DBでmigrationを最初から再生する。
- remoteへはlink後、db push --dry-runとmigration listを確認してからdb pushする。
- push直前に対象project refとenvironmentを表示する。
- productionに対するdb reset --linkedは禁止する。
- 破壊的差分や対象project不一致があれば停止する。
- Supabase生成TypeScript型をアプリで使用し、schema変更と同期する。

## localStorage schema v4の初回移行

重要: localStorageはscheme、host、portごとに別です。元PCのlocalhostとGitHub Pages、別PCのlocalhostは別originです。GitHub Pagesから元PCのlocalStorageを直接読めると仮定しないでください。

移行経路:

1. 同一originにnexus.bundle.v4がある場合の検出
2. 元PCから書き出したschema v4 JSONを選択する安全なimport UI

既存変更データがあるのにJSON exportがなければ、初期73件だけで移行完了扱いにせず、元PCで「書き出し」してファイルを移すよう依頼して停止してください。

移行要件:

- 読込み前にnexus.bundle.v4、該当v3/v2のraw文字列を変更せずbackup
- backupへ日時、source origin、schema、SHA-256、サイズを付与
- src/storage.tsのmigrationとvalidateBundleを再利用
- schema v4以外、破損、上限超過を拒否
- 移行実行者が対象organizationのownerであることをRPC内でも確認
- 全業務tableとimport manifestが空であることをRPC内で再検査
- remoteに1件でも既存データまたはmanifestがあれば停止し、この作業では未定義のmerge/replaceを行わない
- 同一originのraw backupはダウンロード可能な別ファイル・別媒体へ保存し、read-back、SHA-256、サイズ、schema、件数を検証。別localStorage keyだけではbackup完了にしない
- 移行先organization名・ID、source件数、remote件数を表示して明示確認
- raw file SHA-256と、key/entity順を正規化してexportedAt等の非意味的変動を除外したsemantic SHA-256を記録
- organization_idとsemantic fingerprintのunique制約で同じJSONの再実行を冪等化
- 件数は固定73件と決めつけず、source JSON自身の全entity件数を正とする。baseline 73 IDとの差分は診断し、追加task、tombstone、weekly生成taskを削除しない
- 1トランザクションでimport
- serverから再読込し、schema v4 bundleを再構築してvalidateBundleを通す
- sourceとserverのfingerprintまたはsemantic equalityを確認
- 成功確認前は元localStorage、backup、export JSONを削除・上書きしない
- 成功後も元データを自動削除せず、移行済みmarkerとmanifestだけを保存
- invalid JSON、同一import 2回、通信断、別organization、remote既存データをテスト

## アプリ実装

現在のsrc/storage.tsのvalidatorとschema v4組立てを保持しつつ、保存先をrepository/storage adapterへ分離してください。

- Supabase cloud repositoryを本番正本にする。
- localStorageは検証済みcache、export、移行元として扱う。
- 認証完了前は共有編集画面を表示しない。
- organization選択と現在roleを表示する。
- cloud entityからschema v4 bundleを再構築し、既存validator合格後にReact stateへ反映する。
- 保存候補を全量検証し、entity差分とexpected versionを送る。
- server確認後にcacheを更新する。
- 通信失敗を成功表示しない。
- Realtime購読または安全な再取得で別ユーザー更新を反映する。
- 保留理由、task CRUD、canvas、KPI、隔週報告、週次処理、監査、JSON import/exportを維持する。
- busy、error、offline、conflict、read-only viewer、session expiryを明示する。
- Supabase未設定時は白画面にせず、秘密を含まない設定不足画面を出す。

## ViteとGitHub Pages

ownerとrepository名が確定してからbaseを決めてください。

- project siteがhttps://OWNER.github.io/REPO/ならbaseは/REPO/
- repository名がOWNER.github.ioのuser/org siteならbaseは/
- custom domainならbaseは/
- local開発は/を維持する

vite.configはserve時に/、production build時に確定済みの/REPO/または/を返す条件分岐として実装し、両方をテストしてください。

Auth callbackは実装前に1方式へ固定してください。

- root callback方式ならhttps://OWNER.github.io/REPO/を正確に使い、query、hash、code交換をrootで処理する。
- /auth/callback route方式ならHashRouterまたは実測済み404 fallbackを実装する。

Supabase Site URL、Redirect URL、magic-link email template、コードのredirectToを同じ方式へ揃え、直リンクとreloadを実測してください。

コード、Actions、Supabase AuthのSite URL/Redirect URLで同じ本番URLを使ってください。React Routerがある場合はbasename、HashRouter、404 fallbackのどれを採るか明記し、直リンク、reload、Auth callbackを実測してください。

GitHub Pages workflowは公式のconfigure-pages、upload-pages-artifact、deploy-pagesを使用し、action versionまたはcommit SHAを確認してください。

権限:

- CIは原則contents: read
- deployはcontents: read、pages: write、id-token: write
- contents: writeなど不要な権限は禁止
- github-pages environmentを使用
- artifactはdist
- default branch pushとworkflow_dispatchに対応
- concurrencyを設定
- deployment URLを出力

lockfileを使用した再現可能install、固定Node系統、lint、typecheck、test、build合格後だけdeployしてください。

## 必須テスト

PowerShellで次を実行してください。

    pnpm install --frozen-lockfile
    pnpm lint
    pnpm typecheck
    pnpm test
    pnpm test:ui
    pnpm test:a11y
    pnpm test:e2e
    pnpm build
    pnpm audit --audit-level=moderate

Supabase local環境または再現可能なSQLテストも使用してください。

### Secret検査

- .env.localなどがgit ls-filesにない
- repository全体とGit履歴のsecret scanが合格
- build済みJSにservice_role、DB password、個人token、OAuth secretがない
- publishable key以外の特権鍵をブラウザが受け取らない

### RLS検査

実際のpublishable key経由で次を確認してください。

- anonのread、insert、update、deleteが拒否
- non-memberが対象organizationを読めず書けない
- viewerは読めるが書けない
- editorはentityを更新できるがmembershipを変えられない
- ownerはmembershipとentityを管理できる
- 別organizationのentity IDを指定してもアクセスできない
- version不一致更新は既存データを変えない
- server auditを一般クライアントが改ざん・削除できない

200と空配列を本当の書込み成功と誤認しないでください。書込み後のread-back、version、auditまで確認してください。

### 移行検査

- raw backupが先に作られる
- 移行先organizationを確認できる
- 同じJSONを2回importしても重複しない
- import fingerprintとmanifestが残る
- invalidデータや通信失敗でlocal/remote正本を失わない
- serverから再構築したschema v4がvalidateBundleに合格
- 成功確認まで元localStorageが残る

### 2ユーザー実機確認

ownerと別ユーザーを、別ブラウザprofileまたは別端末で確認してください。

1. ownerが別ユーザーをeditorとして追加
2. editorがtaskのstatusを変更
3. owner側に変更、actor、version、server auditが反映
4. 同じentityを双方が旧versionから更新し、一方だけ成功、もう一方は競合表示
5. viewerへ変更後は書込み不可
6. membership削除後は再読込みも更新も不可
7. logout、再login、別端末でも共有状態を復元

2人目の認証操作だけは短く依頼してください。確認できない場合は完了扱いにしないでください。

### 公開URL

- CI workflow成功
- Pages deploy成功
- 公開URLが200
- JS、CSS、画像、fontなど全assetが200
- asset URLが正しい/REPO/配下で、/assetsの404がない
- console errorがない
- Auth画面が表示される
- magic linkから正しいPages pathへ戻る
- login後にorganizationと共有データを読める
- reload後もsessionと状態を保持
- mobile viewportでも主要操作が可能

Pages反映待ちは数分間、適切な間隔で再試行してください。

## Gitと公開

- 実装前に作業branchを作る。
- 意図ごとに確認可能なcommitを作る。
- 作成担当とは別の独立レビューで必須修正0件を確認する。
- 作業branchをpushする前に、公開情報検査、local test/build、dist scan、独立レビューを合格させる。remote CIはpush後、Pages・Auth・RLS・2ユーザー・公開URL確認はmain deploy後に実施し、前述の公開順序どおり段階ごとにgateを適用する。
- Pages sourceをGitHub Actionsへ設定する。
- Actions完了と実URLを確認する。
- mainへ統合する前後のSHAを記録する。
- branch protection、必須CI、force push禁止を可能な範囲で設定する。

## ロールバック

次を実際に使える手順としてdocsへ保存してください。

- アプリ: 変更前commit自体をrevertしない。変更前SHAより後に作ったdeployment commit群をgit revertして新しいrollback commitを作り、対象SHAを事前確認する
- Pages: 直前の正常commitを再deploy
- rollback先と現在のDB schemaの互換性を先に確認する
- Supabase移行後は旧localStorage書込み版を業務利用可能な状態で再deployしない。互換版がなければmaintenance/read-only画面をdeployする
- DB: destructive rollbackではなくforward-fix、事前export、version historyから復元
- db pushと初回import前に、利用planで実際に使えるschema/data backupまたは空DB証跡を取得し、保存先、SHA、復元コマンド、plan上の制限を記録する。PITRがあると推測しない
- entity: server audit/versionから旧内容を新versionとして復元
- migration: import fingerprintとmanifestから対象organizationと行を特定
- 緊急時: RLSを無効化せず、editorのwriteを止める
- down migrationが必要でもdata dropは自動実行しない

テスト用entityで「更新、旧版復元、新versionと監査確認」を1回実測してください。

## 即時停止条件

次の場合は勝手に迂回せず停止してください。

- GitHub owner、visibility、既存repositoryの扱いが不明
- privateからpublicへの変更が必要
- 課金またはplan変更が必要
- 未コミット変更と作業が衝突
- secretがGit履歴またはartifactから検出
- 元データがあるのにexport/backupを取得できない
- 移行先organizationが曖昧、remoteに既存データがある
- anon write、non-member access、viewer writeが1つでも成功
- migrationの対象や差分が不明
- 2ユーザー確認ができない
- CI、build、E2E、Pages asset、Auth redirect、公開URL smokeが失敗
- 破壊的DB操作、force push、repository/project削除が必要
- repository、Git履歴、distに氏名、契約、金額、交渉情報など公開禁止情報が残る
- Pagesサイトの実閲覧範囲が要求と一致しない
- GitHubまたはSupabaseのログイン先、対象projectが回答と一致しない
- Auth招待方式または初期owner bootstrapが未確定
- organization_id変更、cross-org参照、直接UPDATEによるversion検査迂回が可能
- backupファイルのread-backまたはrollback互換性を確認できない

停止条件が解消されるまで成功と報告しないでください。

## 完了条件

以下をすべて満たすまで完了にしないでください。

- GitHub repository作成、remote設定、main push
- GitHub Pages公開
- Supabase migration適用
- Auth、organization、role、RLSが有効
- schema v4 JSONのbackup、冪等import、server read-back成功
- 既存機能が維持される
- 2ユーザーで共有、競合、viewer、退会後拒否を確認
- 全テスト、RLS test、secret scan、Actions、公開URL smokeが合格
- 独立レビューの必須修正0件
- rollback手順と検証結果を保存

## 最終報告

秘密値、メールアドレス、氏名、招待token、DB接続情報、業務データ本文を含めず、user ID、fingerprint、project refも必要最小限に短縮またはマスクして、次をまとめてください。

- GitHub repository URL、owner、visibility、default branch
- GitHub Pages URL
- commit SHA、rollback tag/commit
- GitHub Actions run URLと結果
- Supabase project refの非秘密部分、region、migration一覧
- Auth、organization、role、RLS、entity version、server auditの概要
- localStorage移行元、移行先organization、backup、import fingerprint、entity/task件数、read-back結果
- 2ユーザー確認結果
- 全テストコマンドと結果
- role別RLS検証表
- 公開URL、asset、Auth redirectのsmoke結果
- secret scan結果
- rollback確認結果
- 残課題、未検証事項、手動で維持すべき設定

「ページが表示された」だけで完了にせず、共有データの安全な保存と2ユーザー確認まで完了してください。

## 公式資料

- Vite GitHub Pages: https://vite.dev/guide/static-deploy.html
- GitHub Pages custom workflows: https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages
- Supabase Auth: https://supabase.com/docs/guides/auth
- Supabase React: https://supabase.com/docs/guides/getting-started/tutorials/with-react
- Supabase RLS: https://supabase.com/docs/guides/database/postgres/row-level-security
- Supabase CLI workflow: https://supabase.com/docs/guides/local-development/cli-workflows

# ここまで
