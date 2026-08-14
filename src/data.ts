import type { Edge, Node, Viewport } from '@xyflow/react'
import { sourceRef } from './sourceCatalog'
import { departmentIdFor, normalizeDepartmentName, type AuditItem, type Priority, type SourceRef, type Status, type Task } from './types'

const s1School = sourceRef('S1', 136, 217)
const s1Riot = sourceRef('S1', 233, 289, 'medium')
const s2 = (start: number, end: number) => sourceRef('S2', start, end)
const s3Strategy = sourceRef('S3', 7, 90)
const s3Schedule = sourceRef('S3', 432, 468)
const publicationConflictSources=[sourceRef('S1',198,201),sourceRef('S3',85,90)]

type Row = [string, string, string, string, string, Priority, Status, string, SourceRef[], string]
const rows: Row[] = [
  ['T-001','全体ロードマップと意思決定ゲートを確定','運営本部','鈴木','7月〜3月（年未確定）','緊急','進行中','', [s2(12,19),s3Schedule], '開催年と各ゲートの定量条件が未確定'],
  ['T-002','KPI定義と月次レビュー様式を作成','運営本部','鈴木','7月','高','未着手','T-001',[s2(13,19),sourceRef('S3',404,430)],'測定方法と責任者が曖昧'],
  ['T-003','3月開催日の候補と会場要件を整理','運営','ウメノ','3月（年未確定）','緊急','未着手','T-001',[s1School,s3Schedule],'開催年・会場・収容人数が未確定'],
  ['T-004','現場運営マニュアル初版を作成','運営','ウメノ','開催6週間前','高','未着手','T-003, T-010',[s2(33,40)],'会場仕様と大会方式の変更影響'],
  ['T-005','イベント企画4案の採否と順序を決定','企画','ユウタ','8月','高','進行中','T-001',[s2(56,63),sourceRef('S3',91,335)],'実行能力・権利確認前に告知しない'],
  ['T-006','大会フォーマットと参加区分を確定','企画','ユウタ','10月まで','高','未着手','T-005, T-024',[s1School,s2(56,63)],'高校・専門・大学の区分設計が未確定'],
  ['T-007','大会ルール・ペナルティ草案を作成','大会運営','ウメノ','開催10週間前','緊急','未着手','T-006, T-008',[s2(56,60),s2(77,86)],'ゲーム公式規約との不整合リスク'],
  ['T-008','Riot Games関連の最新規約・許諾要件を確認','管理部','ウニュ','企画確定前／年未確定','緊急','未着手','',[s1Riot],'最新規約要確認。資料内の説明は公式確認前のため断定しない'],
  ['T-009','エントリー・対戦表・結果管理手順を設計','大会運営','ウメノ','開催8週間前','高','未着手','T-006, T-007',[s2(77,86)],'個人情報・当日オペレーション負荷'],
  ['T-010','出演候補と交渉優先順位リストを作成','キャスティング・渉外','ロブ','9月〜12月','高','未着手','T-005',[s2(101,109)],'出演可否・費用・権利条件は未確認'],
  ['T-011','実況・解説・ゲスト契約条件を整理','キャスティング・渉外','ロブ','開催10週間前','中','未着手','T-010, T-008',[s2(101,109)],'契約・肖像・配信二次利用条件'],
  ['T-012','スポンサー提案資料と協賛3プランを作成','営業','ユウタ','12月','緊急','未着手','T-002, T-005',[s2(122,129),sourceRef('S3',354,402)],'提供価値の実績根拠不足'],
  ['T-013','スポンサー候補リストと営業パイプラインを作成','営業','ユウタ','12月〜開催前','高','未着手','T-012',[s2(122,129)],'契約確度・予算時期の不一致'],
  ['T-014','高校・専門学校・大学の3部門との連携条件確認','パートナーシップ','鈴木','7月〜10月','緊急','進行中','T-001',[s1School,s2(144,150)],'学校名・ロゴ使用・参加条件は部門ごとに要確認'],
  ['T-015','eスポーツチーム・協力団体との提携案を作成','パートナーシップ','鈴木','9月〜12月','中','未着手','T-005',[s2(144,150),s3Strategy],'相手方の合意は未取得'],
  ['T-016','Discord開設と運用ポリシーを整備','コミュニティ運営','ウメノ','7月','緊急','未着手','T-008',[s2(231,237),s3Schedule],'モデレーション・未成年者対応'],
  ['T-017','Discord 100名到達施策を実行','コミュニティ運営','ウメノ','9月','高','未着手','T-016, T-019',[sourceRef('S3',432,444)],'目標の根拠・獲得単価未確定'],
  ['T-018','SNS・告知・広告・メディア対応計画を作成','広報・マーケティング','ユウタ','8月〜3月（年未確定）','高','未着手','T-005, T-008',[s2(164,172),s3Schedule,...publicationConflictSources],'公開前の権利・日程確認'],
  ['T-019','参加者募集キャンペーンを設計','広報・マーケティング','ユウタ','2月（年未確定）','緊急','未着手','T-006, T-014, T-018',[s2(164,172),s3Schedule,...publicationConflictSources],'募集期間不足・学校側承認遅延'],
  ['T-020','配信・OBS・画面・カメラ・音響要件を設計','映像・配信','ロブ','開催8週間前','高','未着手','T-003, T-006',[s2(186,195)],'会場回線と機材の未確定'],
  ['T-021','Watch Party企画と運営可否を確認','映像・配信','ロブ','開催10週間前','中','未着手','T-008, T-020',[s2(186,195),s1Riot],'最新規約要確認・配信権利リスク'],
  ['T-022','ブランド・LP・Web・募集クリエイティブを制作','クリエイティブ','鈴木','1月〜2月（年未確定）','高','未着手','T-005, T-008, T-018',[s2(209,218)],'名称・ロゴ・素材権利の確認待ち'],
  ['T-023','配信画面とSNS動画テンプレートを制作','クリエイティブ','鈴木','開催6週間前','中','未着手','T-020, T-022',[s2(209,218)],'制作工数と素材不足'],
  ['T-024','育成カリキュラム・練習日程を設計','教育・育成','ウメノ','11月','高','未着手','T-005, T-014',[s2(251,259),s1School],'講師確保と学校時間割'],
  ['T-025','コーチ・メンター候補の条件を定義','教育・育成','ウメノ','10月','中','未着手','T-005, T-008',[s2(251,259),sourceRef('S3',91,335)],'報酬・権利・安全管理'],
  ['T-026','大会利用可能予算5〜10万円仮説を再確認','管理部','ウニュ','企画確定時','緊急','未着手','T-003, T-005, T-020',[sourceRef('S1',198,217)],'金額は学校側予算の利用可能額に関する仮説。全体予算ではない'],
  ['T-027','契約・個人情報・未成年者同意の雛形を準備','管理部','ウニュ','募集開始前','緊急','未着手','T-008, T-009, T-011',[s2(274,284)],'専門家確認が必要'],
  ['T-028','当日リスク台帳と緊急連絡網を作成','管理部','ウニュ','開催4週間前','高','未着手','T-003, T-004, T-020',[s2(274,284)],'事故・配信障害・体調不良対応'],
  ['T-029','クリップ利用・面談・未成年者同意の確認票を整備','管理部','ウニュ','発掘・募集開始前','緊急','未着手','T-008, T-016, T-019, T-027',[sourceRef('S3',91,210),s2(274,284)],'肖像・著作権・保護者同意・面談時の個人情報を責任者確認'],
  ['T-030','会場設営・受付・スタッフ・撤収計画を作成','運営','原田','開催4週間前','高','未着手','T-003, T-004',[s2(33,40)],'担当者と当日動線が未確定'],
  ['T-031','AI・配信ツール・業務システム開発範囲を決定','クリエイティブ','鈴木','企画確定後','中','未着手','T-001, T-020',[s2(209,218)],'開発責任者・要件・予算が未確定'],
  ['T-032','人気投票・ファン交流イベントを設計','コミュニティ運営','ウメノ','募集開始前','中','未着手','T-016, T-018',[s2(231,237)],'投票公正性と未成年者対応'],
  ['T-033','ボランティア・学生スタッフ管理手順を作成','コミュニティ運営','ウメノ','開催6週間前','高','未着手','T-004, T-016',[s2(231,237)],'労務区分と安全管理を要確認'],
  ['T-034','講習会・勉強会・メンター制度を設計','教育・育成','ウメノ','育成開始前','高','未着手','T-024, T-025',[s2(251,259)],'講師責任と実施日程が未確定'],
  ['T-035','請求・支払・経理フローを整備','管理部','ウニュ','契約締結前','緊急','未着手','T-012, T-027',[s2(274,284)],'承認者・口座・証憑保管方法が未確定'],
  ['T-036','議事録・各種申請の台帳を整備','管理部','ウニュ','即時','高','未着手','T-001, T-008',[s2(274,284),sourceRef('S1',233,289)],'申請先・期限・責任者が未確定'],
  ['T-037','事業戦略・進捗管理・定例MTG運用を確立','運営本部','鈴木','即時','緊急','進行中','T-001',[s2(12,19)],'意思決定者と会議頻度を要再確認'],
  ['T-038','コンテンツ・演出・参加者特典・年間企画を設計','企画','ユウタ','企画確定前','高','未着手','T-005',[s2(56,63)],'実施費用と権利条件が未確定'],
  ['T-039','企業共同企画・自治体連携・新規パートナー開拓','パートナーシップ','鈴木','企画確定前','高','未着手','T-001, T-015',[s2(144,150)],'相手方合意と公開可否が未確定'],
]

export const deriveDateStatus=(timing:string,asOf='2026-08-14'):Task['dateStatus']=>{
  if(timing.includes('年未確定'))return '年未確定'
  if(/\d{1,2}月\s*[〜～-]\s*\d{1,2}月/.test(timing))return '要再確認'
  const match=timing.match(/(^|\D)(\d{1,2})月/);if(!match)return '要再確認'
  const month=Number(match[2]),currentMonth=Number(asOf.slice(5,7))
  return month<currentMonth?'期限超過':month===currentMonth?'期限内':'将来'
}
const conflictIds=new Set(['T-014','T-018','T-019','T-022'])
export const initialTasks: Task[] = rows.map(([id,title,rawDepartment,owner,timing,priority,status,dependencies,rawSources,risk]) => {
  const department=normalizeDepartmentName(rawDepartment),sources=conflictIds.has(id)?[...rawSources,...publicationConflictSources.filter((candidate)=>!rawSources.some((item)=>item.sourceId===candidate.sourceId&&item.lineStart===candidate.lineStart))]:rawSources
  return {
  id,title,description:'',departmentId:departmentIdFor(department),department,owner,
  assignmentStatus: owner ? '要再確認' : '未確定', timing,
  dateStatus:deriveDateStatus(timing),publicationStatus:'公開可否未確定',asOf:'2026-08-14',conflictingSourceRefs:conflictIds.has(id)?['S1:198-201 学校名使用可','S3:85-90 専門学校名公開不可（公開前）']:[],priority,status,dependencies,sources,risk,updatedAt:'2026-08-14T00:00:00+09:00',
}})

export const sourceDutyTaskMap: Record<string, string[]> = {
  'S2:13-19':['T-001','T-002','T-037'], 'S2:34-40':['T-003','T-004','T-030'], 'S2:57-63':['T-005','T-006','T-007','T-038'],
  'S2:78-86':['T-007','T-009','T-016'], 'S2:102-109':['T-010','T-011'], 'S2:123-129':['T-012','T-013'],
  'S2:145-150':['T-014','T-015','T-039'], 'S2:165-172':['T-018','T-019'], 'S2:187-195':['T-020','T-021'],
  'S2:210-218':['T-022','T-023','T-031'], 'S2:232-237':['T-016','T-032','T-033'], 'S2:252-259':['T-024','T-025','T-034'],
  'S2:275-284':['T-026','T-027','T-028','T-029','T-035','T-036'],
}

export const initialNodes: Node[] = [
  { id:'n1', position:{x:40,y:80}, data:{label:'発掘・募集\nT-016 / T-017',taskIds:['T-016','T-017']}, style:{width:180} },
  { id:'n2', position:{x:290,y:80}, data:{label:'企画・選考\nT-005 / T-006',taskIds:['T-005','T-006']}, style:{width:180} },
  { id:'n3', position:{x:540,y:80}, data:{label:'育成・コミュニティ\nT-024',taskIds:['T-024']}, style:{width:190} },
  { id:'n4', position:{x:800,y:80}, data:{label:'3月イベント\n年未確定'}, style:{width:180} },
  { id:'n5', position:{x:540,y:250}, data:{label:'スポンサー価値\nT-012 / T-013',taskIds:['T-012','T-013']}, style:{width:190} },
  { id:'n6', position:{x:800,y:250}, data:{label:'就業支援・再発掘'}, style:{width:180} },
]
export const initialEdges: Edge[] = [
  {id:'e1',source:'n1',target:'n2',animated:true},{id:'e2',source:'n2',target:'n3'},{id:'e3',source:'n3',target:'n4',animated:true},{id:'e4',source:'n3',target:'n5'},{id:'e5',source:'n4',target:'n6'},{id:'e6',source:'n5',target:'n4'},
]
export const initialViewport: Viewport = { x: 0, y: 0, zoom: 1 }

type AuditRow = [string, AuditItem['classification'], string[], string, string, string, string]
const auditRows:AuditRow[] = [
  ['R1-M01','quality',['docs/verification/file-hashes.txt'],'対象ファイルハッシュなし','SHA-256と検証日時を記録','manifest再計算・照合','コミットは秘書担当'],
  ['R1-M02','data',['src/data.ts'],'T-014/T-026の意味が誤り','指定文言と意味へ訂正','unit/E2E表示','入力内容は要再確認'],
  ['R1-M03','data',['src/types.ts','src/components/TaskBoard.tsx','src/components/TaskModal.tsx'],'未確定情報が自由文','確定状態・基準日・競合出典を構造化','UI/a11y','責任者確認待ち'],
  ['R1-M04','data',['src/types.ts','src/data.ts','src/storage.ts'],'出典が単一文字列','SHA-256・実行範囲付き配列','unit import検証','入力現版に依存'],
  ['R1-M05','data',['src/data.ts','docs/source-duty-map.md'],'S2業務に不足','安定ID・39タスク・全業務対応表','unit件数・文書照合','粒度は運用調整可'],
  ['R1-M06','runtime',['src/components/TaskBoard.tsx'],'限定検索','部署・出典・詳細・状態・時期を横断','UI test','大量件数の索引なし'],
  ['R1-M07','validation',['src/storage.ts','src/components/TaskModal.tsx'],'部分的依存検査','存在・自己参照・重複・循環を項目表示','unit/UI','同時編集は対象外'],
  ['R1-M08','validation',['src/storage.ts','src/App.tsx'],'部分import検証','schema v2完全検証・原子的拒否','unit/E2E','将来schema移行が必要'],
  ['R1-M09','persistence',['src/types.ts','src/storage.ts','src/components/ProjectCanvas.tsx'],'viewportなし・分割保存','viewport付きbundle一括保存','unit/E2E再読込','localStorage容量上限'],
  ['R1-M10','persistence',['src/storage.ts','src/App.tsx'],'例外時に無言初期化','例外通知・raw保護','unit','ブラウザ削除は回復不能'],
  ['R1-M11','accessibility',['src/components/TaskModal.tsx'],'dialog・label・trap不足','dialog、全label、trap、Esc、起点復帰','UI/axe','支援技術差'],
  ['R1-M12','accessibility',['src/components/ProjectCanvas.tsx'],'ドラッグ必須','select接続・解除・4方向移動','desktop/mobile E2E','20px単位移動'],
  ['R1-M13','accessibility',['src/components/TaskBoard.tsx','src/styles.css'],'mobileセル見出し欠落','全tdにdata-label','UI/E2E 390×844','320px未満は対象外'],
  ['R1-M14','quality',['src/types.ts','src/components/AuditLog.tsx'],'action/detailのみ・28件誤記','全監査項目・Markdown・39件','unit/UI','docsを外部証跡として併用'],
  ['R1-M15','quality',['eslint.config.js','playwright.config.ts','docs/verification'],'lint代用・UI検査なし','独立scriptと3周検証','全script 0','Chromium以外未確認'],
  ['R1-M16','security',['package.json','pnpm-lock.yaml'],'Vite5/Vitest2・advisoryあり','Vite6.4.3/Vitest3.2.6/Playwright1.55.1','pnpm audit 0','将来advisory'],
  ['R1-R01','quality',['README.md','package.json'],'npm/pnpm混在','pnpm＋frozen lockfileへ統一','frozen install','Corepack環境依存'],
  ['R1-R02','accessibility',['src/App.tsx','src/components/TaskModal.tsx'],'errorもstatus','error=alert、成功=status','axe/E2E','confirmは標準UI'],
]
const round1Audit: AuditItem[] = auditRows.map(([issueId,classification,files,before,after,retest,residualRisk],index)=>({
  id:`r1-${index+1}`,issueId,classification,targetVersion:'0.2.0',files,before,after,evidence:['CHANGELOG.md','docs/audit-round-1.md','docs/verification/'],retest,residualRisk,round:1,at:'2026-08-14T20:09:33+09:00',action:'反証監査Round 1修正',detail:`${issueId}を修正し、受入検証を実施した。`,
}))

const round2AuditRows:AuditRow[] = [
  ['R2-M01','data',['src/data.ts','src/sourceCatalog.ts'],'主要日程タスクのS3参照範囲が部分的','T-003/T-018/T-019をS3:432-468へ統一','unit/source map照合','入力ファイル改版時は再採番'],
  ['R2-M02','validation',['src/storage.ts'],'編集順序によって依存循環を閉じられる','編集後グラフ全体をDFS検査','unit循環回帰','同時タブ編集は対象外'],
  ['R2-M03','validation',['src/storage.ts','src/sourceCatalog.ts'],'importの監査・出典・flow検査が不十分','列挙・ID・重複・固定メタデータ・行上限・自己辺を拒否','unit/正常・異常import E2E','将来schemaは移行実装が必要'],
  ['R2-M04','data',['src/types.ts','src/storage.ts'],'組織表示名がS2見出しと不一致','S2見出しどおりの13名称と旧名移行','unit/再読込','外部連携は安定ID利用が必要'],
  ['R2-M05','data',['src/data.ts','src/components/TaskBoard.tsx'],'年なし期間を期限超過と誤分類し公開競合が見えにくい','期間は要再確認、学校名公開競合を構造化表示','unit/UI','開催年と公開判断は責任者確認待ち'],
  ['R2-M06','persistence',['src/storage.ts','src/App.test.tsx'],'読取例外時の再読取・再throw余地','getItemを1回に限定しSecurityErrorをUI通知','unit/App test','ブラウザデータ削除は回復不能'],
  ['R2-M07','quality',['e2e/app.spec.ts','docs/verification/'],'E2E証跡がCRUD・復元・失敗・幅・動き軽減を網羅しない','desktop/mobile各6件と33 unitへ拡張','全品質コマンド','Chromium以外は未確認'],
]
const round2Audit:AuditItem[]=round2AuditRows.map(([issueId,classification,files,before,after,retest,residualRisk],index)=>({
  id:`r2-${index+1}`,issueId,classification,targetVersion:'0.2.1',files,before,after,evidence:['CHANGELOG.md','docs/audit-round-2.md','docs/verification/round-2-final.md'],retest,residualRisk,round:2,at:'2026-08-14T20:40:06+09:00',action:'反証監査Round 2修正',detail:`${issueId}を修正し、回帰検証を実施した。`,
}))

export const initialAudit:AuditItem[]=[...round1Audit,...round2Audit]
