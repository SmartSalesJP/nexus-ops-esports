import type { Edge, Node, Viewport } from '@xyflow/react'
import { initialAudit, initialEdges, initialKpis, initialNodes, initialTasks, initialViewport } from './data'
import { SOURCE_CATALOG } from './sourceCatalog'
import { auditClassifications, departmentIdFor, departmentIds, departmentName, organizationUnits, people, sourceConfidences, statuses, urgencies, type AuditItem, type ExportBundle, type FlowData, type LoadResult, type Task, type ValidationIssue } from './types'

export const KEYS={bundle:'nexus.bundle.v3',legacyBundle:'nexus.bundle.v2',legacyTasks:'nexus.tasks.v1',legacyFlow:'nexus.flow.v1',legacyAudit:'nexus.audit.v1'} as const
export const LIMITS={fileBytes:2_000_000,tasks:500,nodes:500,edges:2_000,audit:2_000} as const
const initialFlow:FlowData={nodes:initialNodes,edges:initialEdges,viewport:initialViewport}
const now=()=>new Date().toISOString()
const fallback=():ExportBundle=>({schemaVersion:3,exportedAt:now(),tasks:initialTasks,flow:initialFlow,audit:initialAudit,kpis:initialKpis,reportBaseline:null,migrationArchive:[]})
const isObject=(value:unknown):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value)
const isIso=(value:unknown)=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(value)&&!Number.isNaN(Date.parse(value))
const isDate=(value:unknown)=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&!Number.isNaN(Date.parse(`${value}T00:00:00Z`))
const authoritativeById=new Map(initialTasks.map((task)=>[task.id,task]))
const stringArray=(value:unknown)=>Array.isArray(value)&&value.length>0&&value.every((item)=>typeof item==='string'&&item.trim().length>0)

function validateTask(value:unknown,index:number,issues:ValidationIssue[]):value is Task{
  const path=`tasks[${index}]`
  if(!isObject(value)){issues.push({path,message:'タスクはオブジェクトである必要があります'});return false}
  for(const field of ['id','title','teamId','team','rawTeam','owner','rawAssignees','urgency','deadline','status','holdReason','updatedAt'] as const)if(typeof value[field]!=='string')issues.push({path:`${path}.${field}`,message:'文字列の必須項目です'})
  if(typeof value.id==='string'&&!/^P[0-6]-\d{2}$/.test(value.id))issues.push({path:`${path}.id`,message:'P0-01形式が必要です'})
  if(!Number.isInteger(value.phase)||Number(value.phase)<0||Number(value.phase)>6)issues.push({path:`${path}.phase`,message:'0〜6の整数が必要です'})
  if(typeof value.id==='string'&&Number(value.id[1])!==value.phase)issues.push({path:`${path}.phase`,message:'IDのPhaseと一致しません'})
  if(!departmentIds.includes(value.teamId as never))issues.push({path:`${path}.teamId`,message:'13チームの安定IDが必要です'})
  else if(value.team!==departmentName(value.teamId as Task['teamId']))issues.push({path:`${path}.team`,message:'安定IDの正式表示名と一致しません'})
  if(typeof value.rawTeam==='string'){const mapped=departmentIdFor(value.rawTeam);if(!mapped)issues.push({path:`${path}.rawTeam`,message:'未知の原文チーム名です'});else if(mapped!==value.teamId)issues.push({path:`${path}.rawTeam`,message:'原文チーム名と安定IDが一致しません'})}
  if(!urgencies.includes(value.urgency as never))issues.push({path:`${path}.urgency`,message:'高/中/低が必要です'})
  if(!statuses.includes(value.status as never))issues.push({path:`${path}.status`,message:'未着手/進行中/完了/保留が必要です'})
  if(value.status==='保留'&&typeof value.holdReason==='string'&&!value.holdReason.replace(/[\s\u200B-\u200D\uFEFF]/g,'').length)issues.push({path:`${path}.holdReason`,message:'保留理由は必須です'})
  if(value.deadlineDate!==undefined&&!isDate(value.deadlineDate))issues.push({path:`${path}.deadlineDate`,message:'YYYY-MM-DD形式が必要です'})
  for(const field of ['assignees','personKeys','dependencies','notes','sourceRefs'] as const)if(!Array.isArray(value[field]))issues.push({path:`${path}.${field}`,message:'配列が必要です'})
  if(Array.isArray(value.assignees)&&value.assignees.some((item)=>typeof item!=='string'||!item.trim()))issues.push({path:`${path}.assignees`,message:'空でない文字列配列が必要です'})
  if(Array.isArray(value.personKeys)&&(value.personKeys.some((item)=>typeof item!=='string'||!people.includes(item as never))||new Set(value.personKeys).size!==value.personKeys.length))issues.push({path:`${path}.personKeys`,message:'主要8名の一意な検索キーが必要です'})
  if(typeof value.rawAssignees==='string'&&Array.isArray(value.assignees)){const expectedAssignees=value.rawAssignees.split(/[、,]/).map((item)=>item.trim()).filter(Boolean);if(JSON.stringify(expectedAssignees)!==JSON.stringify(value.assignees))issues.push({path:`${path}.assignees`,message:'原文担当文字列と担当配列が一致しません'})}
  if(typeof value.rawAssignees==='string'&&Array.isArray(value.personKeys)){const rawAssignees=value.rawAssignees,expectedKeys=rawAssignees.includes('全員')?[...people]:people.filter((person)=>rawAssignees.includes(person));if(JSON.stringify(expectedKeys)!==JSON.stringify(value.personKeys))issues.push({path:`${path}.personKeys`,message:'原文担当から導出した検索キーと一致しません'})}
  if(Array.isArray(value.dependencies)&&value.dependencies.some((item)=>typeof item!=='string'))issues.push({path:`${path}.dependencies`,message:'文字列配列が必要です'})
  if(!isIso(value.updatedAt))issues.push({path:`${path}.updatedAt`,message:'ISO日時が必要です'})
  if(Array.isArray(value.sourceRefs)&&value.sourceRefs.length===0)issues.push({path:`${path}.sourceRefs`,message:'1件以上の出典が必要です'})
  if(Array.isArray(value.sourceRefs))value.sourceRefs.forEach((ref,sourceIndex)=>{
    const sourcePath=`${path}.sourceRefs[${sourceIndex}]`
    if(!isObject(ref)){issues.push({path:sourcePath,message:'出典はオブジェクトです'});return}
    const catalog=SOURCE_CATALOG[ref.sourceId as keyof typeof SOURCE_CATALOG]
    if(!catalog)issues.push({path:`${sourcePath}.sourceId`,message:'catalogにない出典です'})
    else {
      if(ref.fileName!==catalog.fileName||ref.sha256!==catalog.sha256||ref.asOf!==catalog.asOf)issues.push({path:sourcePath,message:'catalogメタデータと一致しません'})
      if(!Number.isInteger(ref.lineStart)||!Number.isInteger(ref.lineEnd)||Number(ref.lineStart)<1||Number(ref.lineEnd)<Number(ref.lineStart)||Number(ref.lineEnd)>catalog.maxLine)issues.push({path:sourcePath,message:'行範囲が不正です'})
      if(!sourceConfidences.includes(ref.confidence as never))issues.push({path:`${sourcePath}.confidence`,message:'確度が不正です'})
    }
  })
  const expected=typeof value.id==='string'?authoritativeById.get(value.id):undefined
  if(expected&&Array.isArray(value.sourceRefs)){const expectedSource=expected.sourceRefs[0],hasExpected=value.sourceRefs.some((ref)=>isObject(ref)&&ref.sourceId==='S4'&&ref.sha256===expectedSource.sha256&&ref.lineStart===expectedSource.lineStart&&ref.lineEnd===expectedSource.lineEnd);if(!hasExpected)issues.push({path:`${path}.sourceRefs`,message:'正本IDに対応するS4行参照が必要です'})}
  return true
}

function validateGraph(tasks:Task[],issues:ValidationIssue[]){
  const ids=new Set(tasks.map((task)=>task.id)),byId=new Map(tasks.map((task)=>[task.id,task]))
  tasks.forEach((task,index)=>{if(new Set(task.dependencies).size!==task.dependencies.length)issues.push({path:`tasks[${index}].dependencies`,message:'依存IDが重複しています'});task.dependencies.forEach((id)=>{if(id===task.id)issues.push({path:`tasks[${index}].dependencies`,message:'自己参照はできません'});else if(!ids.has(id))issues.push({path:`tasks[${index}].dependencies`,message:`存在しない依存ID: ${id}`})})})
  const visiting=new Set<string>(),visited=new Set<string>()
  const visit=(id:string):boolean=>{if(visiting.has(id))return true;if(visited.has(id))return false;visiting.add(id);const cycle=(byId.get(id)?.dependencies??[]).some(visit);visiting.delete(id);visited.add(id);return cycle}
  tasks.forEach((task,index)=>{if(visit(task.id))issues.push({path:`tasks[${index}].dependencies`,message:'循環依存があります'})})
}

function validateFlow(value:unknown,issues:ValidationIssue[],validTaskIds:Set<string>):value is FlowData{
  if(!isObject(value)||!Array.isArray(value.nodes)||!Array.isArray(value.edges)||!isObject(value.viewport)){issues.push({path:'flow',message:'nodes/edges/viewportが必要です'});return false}
  if(value.nodes.length>LIMITS.nodes||value.edges.length>LIMITS.edges)issues.push({path:'flow',message:'件数上限を超えています'})
  const ids:string[]=[];(value.nodes as unknown[]).forEach((node,index)=>{if(!isObject(node)||typeof node.id!=='string'||!node.id||!isObject(node.position)||typeof node.position.x!=='number'||!Number.isFinite(node.position.x)||typeof node.position.y!=='number'||!Number.isFinite(node.position.y)||!isObject(node.data))issues.push({path:`flow.nodes[${index}]`,message:'id/finite position/dataが必要です'});else{ids.push(node.id);const refs=node.data.taskIds;if(refs!==undefined&&(!Array.isArray(refs)||refs.some((id)=>typeof id!=='string'||!validTaskIds.has(id))))issues.push({path:`flow.nodes[${index}].data.taskIds`,message:'存在しないタスク参照があります'})}})
  const idSet=new Set(ids);if(idSet.size!==ids.length)issues.push({path:'flow.nodes',message:'ノードIDが重複しています'})
  const edgeIds:string[]=[];(value.edges as unknown[]).forEach((edge,index)=>{if(!isObject(edge)||typeof edge.id!=='string'||!edge.id||typeof edge.source!=='string'||typeof edge.target!=='string'||!idSet.has(String(edge.source))||!idSet.has(String(edge.target))||edge.source===edge.target)issues.push({path:`flow.edges[${index}]`,message:'接続が不正です'});else edgeIds.push(edge.id)})
  if(new Set(edgeIds).size!==edgeIds.length)issues.push({path:'flow.edges',message:'エッジIDが重複しています'})
  if(typeof value.viewport.x!=='number'||!Number.isFinite(value.viewport.x)||typeof value.viewport.y!=='number'||!Number.isFinite(value.viewport.y)||typeof value.viewport.zoom!=='number'||!Number.isFinite(value.viewport.zoom)||Number(value.viewport.zoom)<=0)issues.push({path:'flow.viewport',message:'finite x/y/正のzoomが必要です'})
  return true
}

function validateAudit(value:unknown,issues:ValidationIssue[]){
  if(!Array.isArray(value)){issues.push({path:'audit',message:'監査ログ配列が必要です'});return}
  if(value.length>LIMITS.audit)issues.push({path:'audit',message:'監査ログ件数上限を超えています'})
  const ids:string[]=[]
  value.forEach((item,index)=>{const path=`audit[${index}]`;if(!isObject(item)){issues.push({path,message:'監査ログはオブジェクトです'});return}for(const field of ['id','issueId','targetVersion','before','after','retest','residualRisk','action','detail'] as const)if(typeof item[field]!=='string'||!String(item[field]).trim())issues.push({path:`${path}.${field}`,message:'空でない文字列が必要です'});if(typeof item.id==='string')ids.push(item.id);if(!auditClassifications.includes(item.classification as never))issues.push({path:`${path}.classification`,message:'監査分類が不正です'});if(typeof item.targetVersion==='string'&&!/^\d+\.\d+\.\d+$/.test(item.targetVersion))issues.push({path:`${path}.targetVersion`,message:'semverが必要です'});if(!isIso(item.at))issues.push({path:`${path}.at`,message:'ISO日時が必要です'});if(!Number.isInteger(item.round)||Number(item.round)<1)issues.push({path:`${path}.round`,message:'1以上の整数が必要です'});for(const field of ['files','evidence'] as const)if(!stringArray(item[field]))issues.push({path:`${path}.${field}`,message:'空でない文字列配列が必要です'})})
  if(new Set(ids).size!==ids.length)issues.push({path:'audit',message:'監査ログIDが重複しています'})
}

export function validateBundle(value:unknown):ValidationIssue[]{
  const issues:ValidationIssue[]=[]
  if(!isObject(value))return[{path:'$',message:'JSONルートはオブジェクトです'}]
  if(value.schemaVersion!==3)issues.push({path:'schemaVersion',message:'対応バージョンは3です'})
  if(!isIso(value.exportedAt))issues.push({path:'exportedAt',message:'ISO日時が必要です'})
  if(!Array.isArray(value.tasks))issues.push({path:'tasks',message:'配列が必要です'})
  else {if(value.tasks.length>LIMITS.tasks)issues.push({path:'tasks',message:'件数上限を超えています'});value.tasks.forEach((task,index)=>validateTask(task,index,issues));const tasks=value.tasks as Task[],ids=tasks.map((task)=>task.id);if(new Set(ids).size!==ids.length)issues.push({path:'tasks',message:'タスクIDが重複しています'});validateGraph(tasks,issues)}
  const validTaskIds=new Set<string>(Array.isArray(value.tasks)?(value.tasks as unknown[]).filter(isObject).map((task)=>String(task.id)):[])
  if(Array.isArray(value.migrationArchive))value.migrationArchive.forEach((archive)=>{if(isObject(archive)&&Array.isArray(archive.tasks))archive.tasks.forEach((task)=>{if(isObject(task)&&typeof task.id==='string')validTaskIds.add(task.id)})})
  validateFlow(value.flow,issues,validTaskIds)
  validateAudit(value.audit,issues)
  if(!Array.isArray(value.kpis)||value.kpis.some((kpi)=>!isObject(kpi)||typeof kpi.id!=='string'||typeof kpi.target!=='number'||!Number.isFinite(kpi.target)||kpi.target<0||!(kpi.actual===null||(typeof kpi.actual==='number'&&Number.isFinite(kpi.actual)&&kpi.actual>=0))))issues.push({path:'kpis',message:'KPIはfiniteかつ0以上である必要があります'})
  if(!(value.reportBaseline===null||(isObject(value.reportBaseline)&&isIso(value.reportBaseline.savedAt)&&isObject(value.reportBaseline.statuses))))issues.push({path:'reportBaseline',message:'比較基準が不正です'})
  else if(isObject(value.reportBaseline))Object.entries(value.reportBaseline.statuses as Record<string,unknown>).forEach(([id,entry])=>{if(!isObject(entry)||!statuses.includes(entry.status as never)||!isIso(entry.updatedAt))issues.push({path:`reportBaseline.statuses.${id}`,message:'statusとupdatedAtが不正です'})})
  if(!Array.isArray(value.migrationArchive))issues.push({path:'migrationArchive',message:'移行アーカイブ配列が必要です'})
  else value.migrationArchive.forEach((archive,index)=>{if(!isObject(archive)||!Number.isInteger(archive.fromSchema)||!isIso(archive.migratedAt)||typeof archive.reason!=='string'||!archive.reason.trim()||!Array.isArray(archive.tasks))issues.push({path:`migrationArchive[${index}]`,message:'移行メタデータが不正です'})})
  return issues
}
export const isBundle=(value:unknown):value is ExportBundle=>validateBundle(value).length===0

function migrate(value:unknown):{bundle:ExportBundle;changed:boolean}|null{
  if(!isObject(value))return null
  if(value.schemaVersion===3){
    const bundle=value as unknown as ExportBundle
    const savedIds=new Set(Array.isArray(bundle.tasks)?bundle.tasks.map((task)=>task.id):[]),missing=initialTasks.filter((task)=>!savedIds.has(task.id))
    return {bundle:missing.length?{...bundle,tasks:[...bundle.tasks,...missing],exportedAt:now()}:bundle,changed:missing.length>0}
  }
  if(value.schemaVersion===2&&Array.isArray(value.tasks)){
    const flow=isObject(value.flow)?value.flow as unknown as FlowData:initialFlow
    const audit=Array.isArray(value.audit)?value.audit as AuditItem[]:[]
    return {changed:true,bundle:{schemaVersion:3,exportedAt:now(),tasks:initialTasks,flow,audit:[...initialAudit,...audit],kpis:initialKpis,reportBaseline:null,migrationArchive:[{fromSchema:2,migratedAt:now(),reason:'旧39件を重複表示せず、S4の73件を正本化',tasks:value.tasks}]}}
  }
  return null
}

export function readBundle():LoadResult<ExportBundle>{
  const clean=fallback();let raw:string|null
  try{raw=localStorage.getItem(KEYS.bundle);if(raw===null)raw=localStorage.getItem(KEYS.legacyBundle)}catch(error){return{ok:false,value:clean,error:`保存データを取得できません: ${error instanceof Error?error.message:'不明なエラー'}`}}
  if(raw===null)return{ok:true,value:clean}
  try{const migrated=migrate(JSON.parse(raw));if(!migrated)return{ok:false,value:clean,error:'保存データのschemaに対応していません',raw};const issues=validateBundle(migrated.bundle);if(issues.length)return{ok:false,value:clean,error:`保存データが不正です: ${issues[0].path} ${issues[0].message}`,raw};if(migrated.changed)localStorage.setItem(KEYS.bundle,JSON.stringify(migrated.bundle));return{ok:true,value:migrated.bundle,raw}}
  catch(error){return{ok:false,value:clean,error:`保存データを読み込めません: ${error instanceof Error?error.message:'不明なエラー'}`,raw}}
}
export function saveBundle(bundle:ExportBundle):LoadResult<ExportBundle>{try{const issues=validateBundle(bundle);if(issues.length)return{ok:false,value:bundle,error:`保存前検証エラー: ${issues[0].path} ${issues[0].message}`};localStorage.setItem(KEYS.bundle,JSON.stringify(bundle));return{ok:true,value:bundle}}catch(error){return{ok:false,value:bundle,error:`保存できません: ${error instanceof Error?error.message:'不明なエラー'}`}}}
export function parseImport(text:string):LoadResult<ExportBundle>{const clean=fallback();if(new Blob([text]).size>LIMITS.fileBytes)return{ok:false,value:clean,error:`ファイルサイズ上限${LIMITS.fileBytes} bytesを超えています`};try{const migrated=migrate(JSON.parse(text));if(!migrated)return{ok:false,value:clean,error:'schemaVersion 2または3のみ読み込めます'};const issues=validateBundle(migrated.bundle);return issues.length?{ok:false,value:clean,error:issues.slice(0,5).map((issue)=>`${issue.path}: ${issue.message}`).join(' / ')}:{ok:true,value:migrated.bundle}}catch(error){return{ok:false,value:clean,error:`JSON構文エラー: ${error instanceof Error?error.message:'不明なエラー'}`}}}
export function validateTaskCandidate(candidate:Task,current:Task[]):ValidationIssue[]{const tasks=current.some((task)=>task.id===candidate.id)?current.map((task)=>task.id===candidate.id?candidate:task):[candidate,...current];return validateBundle({...fallback(),tasks}).filter((issue)=>issue.path.startsWith('tasks'))}
export const resetBundle=()=>saveBundle(fallback())
export const loadTasks=()=>readBundle().value.tasks
export const loadFlow=()=>readBundle().value.flow
export const loadAudit=()=>readBundle().value.audit
export const saveTasks=(tasks:Task[])=>saveBundle({...readBundle().value,tasks,exportedAt:now()})
export const saveFlow=(flow:FlowData)=>saveBundle({...readBundle().value,flow,exportedAt:now()})
export const saveAudit=(audit:AuditItem[])=>saveBundle({...readBundle().value,audit,exportedAt:now()})
export { organizationUnits }
export type { Edge,Node,Viewport }
