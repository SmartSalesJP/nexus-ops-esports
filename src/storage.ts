import type { Edge, Node, Viewport } from '@xyflow/react'
import { initialAudit, initialEdges, initialNodes, initialTasks, initialViewport } from './data'
import {
  assignmentStatuses, dateStatuses, departmentIds, departments, priorities, publicationStatuses, sourceConfidences, statuses,
  type AuditItem, type ExportBundle, type FlowData, type LoadResult, type SourceRef, type Task, type ValidationIssue,
} from './types'

export const KEYS = { bundle: 'nexus.bundle.v2', legacyTasks:'nexus.tasks.v1', legacyFlow:'nexus.flow.v1', legacyAudit:'nexus.audit.v1' } as const
export const LIMITS = { fileBytes: 2_000_000, tasks: 500, nodes: 500, edges: 2_000, audit: 2_000 } as const
const initialFlow: FlowData = { nodes: initialNodes, edges: initialEdges, viewport: initialViewport }

const isObject = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value)
const isIsoDateTime = (value: unknown) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(value) && !Number.isNaN(Date.parse(value))
const isDate = (value: unknown) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`))
const values = <T extends readonly string[]>(items: T, value: unknown): value is T[number] => typeof value === 'string' && items.includes(value)
export const dependencyIds = (value: string) => value.split(',').map((item) => item.trim()).filter(Boolean)

function validateSource(value: unknown, path: string, issues: ValidationIssue[]): value is SourceRef {
  if (!isObject(value)) { issues.push({ path, message:'出典はオブジェクトである必要があります' }); return false }
  const required = ['sourceId','fileName','sha256','lineStart','lineEnd','asOf','confidence']
  required.forEach((key) => { if (!(key in value)) issues.push({ path:`${path}.${key}`, message:'必須項目です' }) })
  if (!values(['S1','S2','S3'] as const,value.sourceId)) issues.push({path:`${path}.sourceId`,message:'S1/S2/S3のいずれかが必要です'})
  if (typeof value.fileName !== 'string' || !value.fileName) issues.push({path:`${path}.fileName`,message:'空でない文字列が必要です'})
  if (typeof value.sha256 !== 'string' || !/^[A-F0-9]{64}$/.test(value.sha256)) issues.push({path:`${path}.sha256`,message:'64桁のSHA-256（大文字）が必要です'})
  if (!Number.isInteger(value.lineStart) || Number(value.lineStart) < 1) issues.push({path:`${path}.lineStart`,message:'1以上の整数が必要です'})
  if (!Number.isInteger(value.lineEnd) || Number(value.lineEnd) < Number(value.lineStart)) issues.push({path:`${path}.lineEnd`,message:'lineStart以上の整数が必要です'})
  if (!isDate(value.asOf)) issues.push({path:`${path}.asOf`,message:'YYYY-MM-DD形式が必要です'})
  if (!values(sourceConfidences,value.confidence)) issues.push({path:`${path}.confidence`,message:'許可されていない確度です'})
  return true
}

function validateTaskShape(value: unknown, index: number, issues: ValidationIssue[]): value is Task {
  const path=`tasks[${index}]`
  if (!isObject(value)) { issues.push({path,message:'タスクはオブジェクトである必要があります'}); return false }
  const strings=['id','title','description','departmentId','department','owner','assignmentStatus','timing','dateStatus','publicationStatus','asOf','priority','status','dependencies','risk','updatedAt']
  strings.forEach((key)=>{if(typeof value[key] !== 'string')issues.push({path:`${path}.${key}`,message:'文字列の必須項目です'})})
  if(typeof value.id==='string'&&!/^T-\d{3,}$/.test(value.id))issues.push({path:`${path}.id`,message:'T-001形式が必要です'})
  if(typeof value.title==='string'&&!value.title.trim())issues.push({path:`${path}.title`,message:'空にできません'})
  if(!values(departmentIds,value.departmentId))issues.push({path:`${path}.departmentId`,message:'安定組織IDが不正です'})
  if(!values(departments,value.department))issues.push({path:`${path}.department`,message:'正規表示名が不正です'})
  if(values(departmentIds,value.departmentId) && values(departments,value.department)) {
    const expected=departments[departmentIds.indexOf(value.departmentId)]; if(expected!==value.department)issues.push({path:`${path}.department`,message:'組織IDと表示名が一致しません'})
  }
  if(!values(assignmentStatuses,value.assignmentStatus))issues.push({path:`${path}.assignmentStatus`,message:'列挙値が不正です'})
  if(!values(dateStatuses,value.dateStatus))issues.push({path:`${path}.dateStatus`,message:'列挙値が不正です'})
  if(!values(publicationStatuses,value.publicationStatus))issues.push({path:`${path}.publicationStatus`,message:'列挙値が不正です'})
  if(!values(priorities,value.priority))issues.push({path:`${path}.priority`,message:'列挙値が不正です'})
  if(!values(statuses,value.status))issues.push({path:`${path}.status`,message:'列挙値が不正です'})
  if(!isDate(value.asOf))issues.push({path:`${path}.asOf`,message:'YYYY-MM-DD形式が必要です'})
  if(!isIsoDateTime(value.updatedAt))issues.push({path:`${path}.updatedAt`,message:'ISO日時が必要です'})
  if(!Array.isArray(value.conflictingSourceRefs)||value.conflictingSourceRefs.some((item)=>typeof item!=='string'))issues.push({path:`${path}.conflictingSourceRefs`,message:'文字列配列が必要です'})
  if(!Array.isArray(value.sources)||value.sources.length===0)issues.push({path:`${path}.sources`,message:'1件以上の出典が必要です'})
  else value.sources.forEach((item,i)=>validateSource(item,`${path}.sources[${i}]`,issues))
  return true
}

function validateGraph(tasks: Task[], issues: ValidationIssue[]) {
  const ids=new Set(tasks.map((task)=>task.id))
  tasks.forEach((task,index)=>{
    const deps=dependencyIds(task.dependencies)
    if(new Set(deps).size!==deps.length)issues.push({path:`tasks[${index}].dependencies`,message:'依存IDが重複しています'})
    if(deps.includes(task.id))issues.push({path:`tasks[${index}].dependencies`,message:'自己参照はできません'})
    deps.forEach((id)=>{if(!ids.has(id))issues.push({path:`tasks[${index}].dependencies`,message:`存在しない依存ID: ${id}`})})
  })
  const visiting=new Set<string>(),visited=new Set<string>(),byId=new Map(tasks.map((task)=>[task.id,task]))
  const visit=(id:string):boolean=>{if(visiting.has(id))return true;if(visited.has(id))return false;visiting.add(id);const cycle=dependencyIds(byId.get(id)?.dependencies??'').some((dep)=>byId.has(dep)&&visit(dep));visiting.delete(id);visited.add(id);return cycle}
  tasks.forEach((task,index)=>{if(visit(task.id))issues.push({path:`tasks[${index}].dependencies`,message:'循環依存があります'})})
}

const validPosition=(value:unknown)=>isObject(value)&&typeof value.x==='number'&&Number.isFinite(value.x)&&typeof value.y==='number'&&Number.isFinite(value.y)
function validateFlow(value: unknown, issues: ValidationIssue[]): value is FlowData {
  if(!isObject(value)){issues.push({path:'flow',message:'フローはオブジェクトである必要があります'});return false}
  if(!Array.isArray(value.nodes)){issues.push({path:'flow.nodes',message:'配列が必要です'});return false}
  if(!Array.isArray(value.edges)){issues.push({path:'flow.edges',message:'配列が必要です'});return false}
  if(value.nodes.length>LIMITS.nodes)issues.push({path:'flow.nodes',message:`最大${LIMITS.nodes}件です`})
  if(value.edges.length>LIMITS.edges)issues.push({path:'flow.edges',message:`最大${LIMITS.edges}件です`})
  const nodes=value.nodes as unknown[],edges=value.edges as unknown[]
  const nodeIds:string[]=[],edgeIds:string[]=[]
  nodes.forEach((node,index)=>{if(!isObject(node)||typeof node.id!=='string'||!node.id||!validPosition(node.position)||!isObject(node.data)){issues.push({path:`flow.nodes[${index}]`,message:'id/position/dataが必要です'});return}nodeIds.push(node.id)})
  edges.forEach((edge,index)=>{if(!isObject(edge)||typeof edge.id!=='string'||!edge.id||typeof edge.source!=='string'||typeof edge.target!=='string'){issues.push({path:`flow.edges[${index}]`,message:'id/source/targetが必要です'});return}edgeIds.push(edge.id)})
  if(new Set(nodeIds).size!==nodeIds.length)issues.push({path:'flow.nodes',message:'ノードIDが重複しています'})
  if(new Set(edgeIds).size!==edgeIds.length)issues.push({path:'flow.edges',message:'エッジIDが重複しています'})
  const nodeSet=new Set(nodeIds);edges.forEach((edge,index)=>{if(isObject(edge)&&(!nodeSet.has(String(edge.source))||!nodeSet.has(String(edge.target))))issues.push({path:`flow.edges[${index}]`,message:'接続先ノードが存在しません'})})
  if(!isObject(value.viewport)||typeof value.viewport.x!=='number'||typeof value.viewport.y!=='number'||typeof value.viewport.zoom!=='number'||value.viewport.zoom<=0)issues.push({path:'flow.viewport',message:'x/y/正のzoomが必要です'})
  return true
}

function validateAudit(value: unknown, issues: ValidationIssue[]): value is AuditItem[] {
  if(!Array.isArray(value)){issues.push({path:'audit',message:'配列が必要です'});return false}
  if(value.length>LIMITS.audit)issues.push({path:'audit',message:`最大${LIMITS.audit}件です`})
  const required=['id','issueId','classification','targetVersion','files','before','after','evidence','retest','residualRisk','round','at','action','detail']
  value.forEach((item,index)=>{if(!isObject(item)){issues.push({path:`audit[${index}]`,message:'オブジェクトが必要です'});return}required.forEach((key)=>{if(!(key in item))issues.push({path:`audit[${index}].${key}`,message:'必須項目です'})});if(!isIsoDateTime(item.at))issues.push({path:`audit[${index}].at`,message:'ISO日時が必要です'});if(!Number.isInteger(item.round)||Number(item.round)<1)issues.push({path:`audit[${index}].round`,message:'1以上の整数が必要です'});if(!Array.isArray(item.files)||!Array.isArray(item.evidence))issues.push({path:`audit[${index}]`,message:'files/evidenceは配列が必要です'})})
  return true
}

export function validateBundle(value: unknown): ValidationIssue[] {
  const issues:ValidationIssue[]=[]
  if(!isObject(value))return [{path:'$',message:'JSONルートはオブジェクトである必要があります'}]
  if(value.schemaVersion!==2)issues.push({path:'schemaVersion',message:'対応バージョンは2です'})
  if(!isIsoDateTime(value.exportedAt))issues.push({path:'exportedAt',message:'ISO日時が必要です'})
  if(!Array.isArray(value.tasks))issues.push({path:'tasks',message:'配列が必要です'})
  else {
    if(value.tasks.length>LIMITS.tasks)issues.push({path:'tasks',message:`最大${LIMITS.tasks}件です`})
    value.tasks.forEach((task,index)=>validateTaskShape(task,index,issues))
    const tasks=value.tasks as Task[]
    const ids=tasks.map((task)=>task.id);if(new Set(ids).size!==ids.length)issues.push({path:'tasks',message:'タスクIDが重複しています'})
    validateGraph(tasks,issues)
  }
  validateFlow(value.flow,issues)
  validateAudit(value.audit,issues)
  if(Array.isArray(value.tasks)&&isObject(value.flow)&&Array.isArray(value.flow.nodes)){
    const taskIds=new Set((value.tasks as Task[]).map((task)=>task.id))
    ;(value.flow.nodes as Node[]).forEach((node,index)=>{const refs=(node.data as {taskIds?:unknown}).taskIds;if(refs!==undefined&&(!Array.isArray(refs)||refs.some((id)=>typeof id!=='string'||!taskIds.has(id))))issues.push({path:`flow.nodes[${index}].data.taskIds`,message:'存在しないタスク参照があります'})})
  }
  return issues
}

export const isBundle=(value:unknown):value is ExportBundle=>validateBundle(value).length===0
export function validateTaskCandidate(candidate:Task,current:Task[]):ValidationIssue[]{const tasks=current.some((item)=>item.id===candidate.id)?current.map((item)=>item.id===candidate.id?candidate:item):[candidate,...current];const issues:ValidationIssue[]=[];tasks.forEach((task,index)=>validateTaskShape(task,index,issues));const ids=tasks.map((task)=>task.id);if(new Set(ids).size!==ids.length)issues.push({path:'id',message:'タスクIDが重複しています'});validateGraph(tasks,issues);return issues.filter((issue)=>issue.path==='id'||issue.path.startsWith(`tasks[${tasks.findIndex((item)=>item.id===candidate.id)}]`))}

export function readBundle():LoadResult<ExportBundle>{
  const fallback:ExportBundle={schemaVersion:2,exportedAt:new Date().toISOString(),tasks:initialTasks,flow:initialFlow,audit:initialAudit}
  try{const raw=localStorage.getItem(KEYS.bundle);if(raw===null)return{ok:true,value:fallback};const parsed:unknown=JSON.parse(raw);const issues=validateBundle(parsed);if(issues.length)return{ok:false,value:fallback,error:`保存データが不正です: ${issues[0].path} ${issues[0].message}`,raw};return{ok:true,value:parsed as ExportBundle,raw}}
  catch(error){return{ok:false,value:fallback,error:`保存データを読み込めません: ${error instanceof Error?error.message:'不明なエラー'}`,raw:localStorage.getItem(KEYS.bundle)??undefined}}
}
export function saveBundle(bundle:ExportBundle):LoadResult<ExportBundle>{try{const issues=validateBundle(bundle);if(issues.length)return{ok:false,value:bundle,error:`保存前検証エラー: ${issues[0].path} ${issues[0].message}`};localStorage.setItem(KEYS.bundle,JSON.stringify(bundle));return{ok:true,value:bundle}}catch(error){return{ok:false,value:bundle,error:`保存できません: ${error instanceof Error?error.message:'不明なエラー'}`}}}
export function parseImport(text:string):LoadResult<ExportBundle>{
  const fallback:ExportBundle={schemaVersion:2,exportedAt:new Date().toISOString(),tasks:initialTasks,flow:initialFlow,audit:initialAudit}
  if(new Blob([text]).size>LIMITS.fileBytes)return{ok:false,value:fallback,error:`ファイルサイズ上限${LIMITS.fileBytes} bytesを超えています`}
  try{const parsed:unknown=JSON.parse(text);const issues=validateBundle(parsed);return issues.length?{ok:false,value:fallback,error:issues.slice(0,5).map((issue)=>`${issue.path}: ${issue.message}`).join(' / ')}:{ok:true,value:parsed as ExportBundle}}
  catch(error){return{ok:false,value:fallback,error:`JSON構文エラー: ${error instanceof Error?error.message:'不明なエラー'}`}}
}
export const resetBundle=()=>saveBundle({schemaVersion:2,exportedAt:new Date().toISOString(),tasks:initialTasks,flow:initialFlow,audit:initialAudit})
export const loadTasks=()=>readBundle().value.tasks
export const loadFlow=()=>readBundle().value.flow
export const loadAudit=()=>readBundle().value.audit
export const saveTasks=(tasks:Task[])=>saveBundle({...readBundle().value,tasks,exportedAt:new Date().toISOString()})
export const saveFlow=(flow:FlowData)=>saveBundle({...readBundle().value,flow,exportedAt:new Date().toISOString()})
export const saveAudit=(audit:AuditItem[])=>saveBundle({...readBundle().value,audit,exportedAt:new Date().toISOString()})
export type { Edge, Node, Viewport }
