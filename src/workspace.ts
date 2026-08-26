import { initialKpis, initialViewport } from './data'
import { canonicalFingerprint, emptyWeeklyState } from './weekly'
import { organizationUnits, type AuditItem, type DepartmentId, type ExportBundle, type KpiValue, type Task, type WorkspaceConfig, type WorkspaceDepartment, type WorkspacePhase, type WorkspaceProfile } from './types'

export const WORKSPACE_GENERATOR_VERSION='nexus-local-v1'

export const legacyWorkspaceConfig:WorkspaceConfig={
  version:1,
  phases:[0,1,2,3,4,5,6].map((code)=>({code:code as WorkspacePhase['code'],name:`Phase ${code}`})),
  departments:organizationUnits.map(({id,name,owner})=>({id,name,owner})),
  terminology:{task:'タスク',phase:'Phase',department:'チーム'},
}

export const workspaceConfigFor=(value?:WorkspaceConfig|null)=>value??legacyWorkspaceConfig
export const workspaceDepartmentName=(config:WorkspaceConfig,id:DepartmentId)=>config.departments.find((item)=>item.id===id)?.name
// eslint-disable-next-line no-control-regex -- control-only input is intentionally rejected.
const invisibleOnly=/^[\s\u0000-\u001F\u007F\u200B-\u200D\u2060\uFEFF]*$/u
export const hasVisibleText=(value:string)=>!invisibleOnly.test(value)
export const hasBoundedVisibleText=(value:string,max:number)=>Array.from(value).length>=1&&Array.from(value).length<=max&&hasVisibleText(value)

export interface WorkspaceCreationInput {
  organizationName:string
  slug:string
  projectName:string
  purpose:string
  knownTasks:string
  phaseCount:number
  taskTerm:string
  phaseTerm:string
  departmentTerm:string
}

export interface GeneratedWorkspaceDraft {profile:WorkspaceProfile;config:WorkspaceConfig;bundle:ExportBundle}

const replaceId=(value:unknown,before:string,after:string):unknown=>{
  if(typeof value==='string'){
    if(value===before)return after
    for(const prefix of ['task-result:','weekly-complete:','weekly-project:task:'])if(value===`${prefix}${before}`)return`${prefix}${after}`
    return value
  }
  if(Array.isArray(value))return value.map((item)=>replaceId(item,before,after))
  if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([key,item])=>[key===before?after:key,replaceId(item,before,after)]))
  return value
}

/** Moves a custom task without breaking any bundle reference. C task IDs remain
 * phase-coupled for legacy/database compatibility, so the move and every known
 * task reference are rewritten as one immutable bundle operation. */
export function moveWorkspaceTaskPhase(bundle:ExportBundle,taskId:string,phase:Task['phase']):ExportBundle{
  const task=bundle.tasks.find((item)=>item.id===taskId)
  const encodedPhase=/^C([0-6])-[0-9]{2}$/.exec(taskId)?.[1]
  if(!task||(task.phase===phase&&encodedPhase===String(phase)))return bundle
  const used=new Set(bundle.tasks.filter((item)=>item.id!==taskId).map((item)=>item.id));let sequence=1,nextId=''
  do{nextId=`C${phase}-${String(sequence++).padStart(2,'0')}`}while(used.has(nextId)&&sequence<=100)
  if(!nextId||used.has(nextId))throw new Error('移動先フェーズのタスクID上限に達しました')
  const rewritten=replaceId(bundle,taskId,nextId) as ExportBundle
  const changedFingerprints=new Map<string,string>()
  const tasks=rewritten.tasks.map((item)=>{
    if(item.provenance&&item.fingerprint){
      const nextFingerprint=canonicalFingerprint(item.provenance)
      const previousFingerprint=bundle.tasks.find((current)=>current.id===item.id)?.fingerprint
      if(previousFingerprint&&previousFingerprint!==nextFingerprint)changedFingerprints.set(previousFingerprint,nextFingerprint)
      item={...item,fingerprint:nextFingerprint}
    }
    return item.id===nextId?{...item,phase}:item
  })
  const nodes=rewritten.flow.nodes.map((node)=>{const code=Number(node.id.replace('phase-',''));return Number.isInteger(code)&&node.id===`phase-${code}`?{...node,data:{...node.data,taskIds:tasks.filter((item)=>item.phase===code).map((item)=>item.id)}}:node})
  const weekly={...rewritten.weekly,tombstones:rewritten.weekly.tombstones.map((fingerprint)=>changedFingerprints.get(fingerprint)??fingerprint)}
  return{...rewritten,tasks,flow:{...rewritten.flow,nodes},weekly}
}

const phaseSets:Record<number,string[]>={
  3:['設計','実行','完了・改善'],
  4:['構想','設計','実行','完了・改善'],
  5:['構想','調査・設計','準備','実行','完了・改善'],
  6:['構想','調査','設計','準備','実行','完了・改善'],
  7:['構想','調査','設計','準備','実行','検証','完了・改善'],
}

const departmentSignals:Array<{id:DepartmentId;words:string[]}>=([
  ['ops-hq',['全体','統括','方針','意思決定']],['operations',['運用','実行','進行','オペレーション']],['planning',['企画','計画','要件','設計']],
  ['tournament-admin',['大会','イベント','受付']],['casting-relations',['出演','登壇','渉外']],['sales',['営業','顧客','売上']],
  ['partnerships',['提携','協力','パートナー']],['pr-marketing',['広報','広告','マーケ','告知']],['broadcast',['配信','映像','収録']],
  ['creative',['制作','デザイン','コンテンツ']],['community',['コミュニティ','ユーザー','参加者']],['education',['教育','研修','育成']],
  ['administration',['管理','契約','予算','法務','経理']],
] as Array<[DepartmentId,string[]]>).map(([id,words])=>({id,words}))

const departmentDisplayName=(id:DepartmentId,text:string):string=>({
  'ops-hq':'プロジェクト統括','operations':'実行・運用','planning':'企画・設計',
  'tournament-admin':text.includes('大会')?'大会進行':text.includes('イベント')?'イベント進行':'受付・進行管理',
  'casting-relations':text.includes('登壇')?'登壇者・関係者調整':'関係者調整','sales':'顧客・営業',
  'partnerships':'外部連携','pr-marketing':'広報・情報発信',
  'broadcast':text.includes('配信')?'配信・メディア運用':'メディア運用','creative':'制作・デザイン',
  'community':text.includes('ユーザー')?'利用者支援':'コミュニティ・利用者支援','education':'研修・育成','administration':'管理・バックオフィス',
}[id])
const clean=(value:string)=>Array.from(value,(character)=>{const code=character.charCodeAt(0);return code<=31||code===127?' ':character}).join('').replace(/\s+/gu,' ').trim()
const lines=(value:string)=>value.split(/\r?\n|[。；;]/u).map((item)=>clean(item.replace(/^[-*・\d.)\s]+/u,''))).filter(Boolean)
const chooseDepartments=(text:string):WorkspaceDepartment[]=>{
  const ranked=departmentSignals.map((item)=>({...item,score:item.words.reduce((sum,word)=>sum+(text.includes(word)?1:0),0)})).filter((item)=>item.score>0).sort((a,b)=>b.score-a.score||a.id.localeCompare(b.id))
  const ids=[...new Set([...ranked.map((item)=>item.id),'planning' as DepartmentId,'operations' as DepartmentId])].slice(0,12)
  return ids.map((id)=>({id,name:departmentDisplayName(id,text),owner:'未割当'}))
}
const phaseFor=(title:string,count:number,index:number)=>{
  if(/完了|振り返|改善|報告|検証/u.test(title))return count-1
  if(/実行|公開|開始|運用|開催|提供/u.test(title))return Math.max(1,count-2)
  if(/準備|制作|構築|作成|設定/u.test(title))return Math.max(1,count-3)
  if(/調査|確認|分析|要件|設計/u.test(title))return Math.min(1,count-1)
  return index%count
}
const departmentFor=(title:string,departments:WorkspaceDepartment[],index:number)=>{
  const match=departmentSignals.find((item)=>departments.some((department)=>department.id===item.id)&&item.words.some((word)=>title.includes(word)))
  return match?.id??departments[index%departments.length].id
}
const genericTasks=(projectName:string)=>[
  `${projectName}の目的と成功条件を確定する`,`${projectName}の要件と対象範囲を整理する`,`${projectName}の担当と進行方法を決める`,
  `${projectName}の実行計画を作成する`,`${projectName}の初回成果を実行し検証する`,`${projectName}の結果を共有し改善点を整理する`,
]

export function generateWorkspaceDraft(input:WorkspaceCreationInput,at=new Date().toISOString()):GeneratedWorkspaceDraft{
  const projectName=clean(input.projectName),purpose=clean(input.purpose),knownTasks=input.knownTasks,count=Math.max(3,Math.min(7,Math.trunc(input.phaseCount)||5)),phaseNames=phaseSets[count]
  const phases=phaseNames.map((name,code)=>({code:code as WorkspacePhase['code'],name:`${clean(input.phaseTerm)||'フェーズ'} ${code}｜${name}`}))
  const departments=chooseDepartments(`${projectName} ${purpose} ${knownTasks}`)
  const requested=[...new Set(lines(knownTasks))].slice(0,20),titles=[...requested]
  for(const title of genericTasks(projectName))if(titles.length<5&&!titles.includes(title))titles.push(title)
  const tasks:Task[]=titles.slice(0,20).map((title,index)=>{
    const phase=phaseFor(title,count,index),teamId=departmentFor(title,departments,index),team=departments.find((item)=>item.id===teamId)!
    return{id:`C${phase}-${String(index+1).padStart(2,'0')}`,title,phase:phase as Task['phase'],teamId,team:team.name,rawTeam:team.name,owner:team.owner,assignees:[],rawAssignees:'',personKeys:[],urgency:index<2?'高':'中',deadline:'未設定',status:'未着手',holdReason:'',dependencies:[],notes:[`決定論generator ${WORKSPACE_GENERATOR_VERSION} により作成。preview確認済み。`],sourceRefs:[],updatedAt:at}
  })
  const nodes=phases.map((phase,index)=>({id:`phase-${phase.code}`,position:{x:60+index*260,y:120},data:{label:phase.name,taskIds:tasks.filter((task)=>task.phase===phase.code).map((task)=>task.id)}})),edges=phases.slice(1).map((phase,index)=>({id:`initial-phase-edge-${index}`,source:`phase-${index}`,target:`phase-${phase.code}`}))
  const audit:AuditItem[]=[{id:`workspace-create-${at}`,issueId:'OP-WORKSPACE-CREATE',classification:'persistence',targetVersion:'0.5.0',files:['organization creation preview'],before:'organization未作成',after:'preview確認済み初期workspace',evidence:[WORKSPACE_GENERATOR_VERSION],retest:'server read-back一致確認',residualRisk:'自動分類は利用者がpreviewで確認',round:1,at,action:'新規organization作成',detail:`${projectName} / ${tasks.length} ${clean(input.taskTerm)||'タスク'}`}]
  const kpis=structuredClone(initialKpis).map((kpi,index)=>({...kpi,label:['進行中','閲覧・到達','成果価値','協力先','対象拠点','参加者'][index],target:0,actual:null})) as KpiValue[]
  return{profile:{projectName,purpose,knownTasks,generatorVersion:WORKSPACE_GENERATOR_VERSION,createdAt:at},config:{version:1,phases,departments,terminology:{task:clean(input.taskTerm)||'タスク',phase:clean(input.phaseTerm)||'フェーズ',department:clean(input.departmentTerm)||'部門'}},bundle:{schemaVersion:4,exportedAt:at,tasks,taskResults:[],flow:{nodes,edges,viewport:structuredClone(initialViewport)},audit,kpis,reportBaseline:null,migrationArchive:[],weekly:emptyWeeklyState()}}
}

export type WorkspaceCreationField=keyof WorkspaceCreationInput
const length=(value:string)=>Array.from(value).length
export function validateWorkspaceCreationFields(input:WorkspaceCreationInput):Partial<Record<WorkspaceCreationField,string>>{
  const errors:Partial<Record<WorkspaceCreationField,string>>={}
  if(length(clean(input.organizationName))<1||length(input.organizationName.trim())>120||!hasVisibleText(input.organizationName))errors.organizationName='組織名は制御文字・空白・ゼロ幅文字だけではない1〜120文字です'
  if(!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(input.slug))errors.slug='識別子は英小文字・数字・ハイフンの1〜63文字です'
  if(length(clean(input.projectName))<1||length(input.projectName.trim())>120||!hasVisibleText(input.projectName))errors.projectName='プロジェクト名は制御文字・空白・ゼロ幅文字だけではない1〜120文字です'
  if(length(input.purpose.trim())<20||length(input.purpose)>4000||!hasVisibleText(input.purpose))errors.purpose='目的は制御文字・空白・ゼロ幅文字だけではない20〜4000文字です'
  if(length(input.knownTasks)>8000||lines(input.knownTasks).some((item)=>length(item)>500))errors.knownTasks='既知タスクは全体8000文字以下、1件500文字以下です'
  if(!Number.isInteger(input.phaseCount)||input.phaseCount<3||input.phaseCount>7)errors.phaseCount='フェーズ数は3〜7です'
  for(const [key,label] of [['taskTerm','タスク用語'],['phaseTerm','フェーズ用語'],['departmentTerm','部門用語']] as const){const value=input[key];if(!value.trim()||length(value.trim())>20||!hasVisibleText(value))errors[key]=`${label}は制御文字・空白・ゼロ幅文字だけではない1〜20文字です`}
  return errors
}
export const validateWorkspaceCreationInput=(input:WorkspaceCreationInput):string[]=>Object.values(validateWorkspaceCreationFields(input))
export const normalizedOrganizationName=(value:string)=>value.normalize('NFKC').trim().toLocaleLowerCase('ja-JP')
