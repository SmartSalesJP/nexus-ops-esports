import { validateBundle } from '../storage'
import type { ExportBundle, WorkspaceConfig } from '../types'
import type { CloudEntity, EntityChange, EntityType } from './contracts'

const key=(type:EntityType,id:string)=>`${type}\u0000${id}`
const ordered=<T>(entities:CloudEntity[],type:EntityType)=>entities.filter((entity)=>entity.entityType===type).sort((a,b)=>a.ordinal-b.ordinal||a.entityId.localeCompare(b.entityId)).map((entity)=>entity.payload as T)
const singleton=<T>(entities:CloudEntity[],type:EntityType,id='singleton')=>entities.find((entity)=>entity.entityType===type&&entity.entityId===id)?.payload as T|undefined
const withoutId=<T>(value:{id:string}&T):T=>{const {id:_,...rest}=value;void _;return rest as T}

const orderPersistedJson=(value:unknown):unknown=>Array.isArray(value)?value.map(orderPersistedJson):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map((key)=>[key,orderPersistedJson((value as Record<string,unknown>)[key])])):value

/** Compare the JSON representation persisted by Supabase without depending on jsonb object-key order. */
export function canonicalJson(value:unknown):string{
  const persisted=JSON.stringify(value)
  return persisted===undefined?'undefined':JSON.stringify(orderPersistedJson(JSON.parse(persisted) as unknown))
}

export function bundleToEntities(bundle:ExportBundle):CloudEntity[]{
  const rows:CloudEntity[]=[]
  const add=(entityType:EntityType,entityId:string,payload:Record<string,unknown>,ordinal=0)=>rows.push({entityType,entityId,payload,ordinal,version:0})
  bundle.tasks.forEach((value,index)=>add('task',value.id,value as unknown as Record<string,unknown>,index))
  ;(bundle.taskResults??[]).forEach((value,index)=>add('task_result',value.id,value as unknown as Record<string,unknown>,index))
  bundle.flow.nodes.forEach((value,index)=>add('flow_node',value.id,value as unknown as Record<string,unknown>,index))
  bundle.flow.edges.forEach((value,index)=>add('flow_edge',value.id,value as unknown as Record<string,unknown>,index))
  add('flow_viewport','singleton',{id:'singleton',...bundle.flow.viewport})
  bundle.audit.forEach((value,index)=>add('client_audit',value.id,value as unknown as Record<string,unknown>,index))
  bundle.kpis.forEach((value,index)=>add('kpi',value.id,value as unknown as Record<string,unknown>,index))
  add('report_baseline','singleton',{id:'singleton',value:bundle.reportBaseline})
  bundle.migrationArchive.forEach((value,index)=>{const id=`${value.fromSchema}:${value.migratedAt}`;add('migration_archive',id,{id,...value},index)})
  bundle.weekly.runs.forEach((value,index)=>add('weekly_run',value.runId,{id:value.runId,...value},index))
  Object.entries(bundle.weekly.completions).sort(([a],[b])=>a.localeCompare(b)).forEach(([id,value],index)=>add('weekly_completion',id,{id,...value},index))
  bundle.weekly.tombstones.forEach((value,index)=>add('weekly_tombstone',value,{id:value,fingerprint:value},index))
  add('weekly_meta','singleton',{id:'singleton',lastRunId:bundle.weekly.lastRun?.runId??null})
  return rows
}

export function entitiesToBundle(entities:CloudEntity[],exportedAt:string,config?:WorkspaceConfig):ExportBundle{
  const duplicates=new Set<string>(),seen=new Set<string>()
  for(const entity of entities){const id=key(entity.entityType,entity.entityId);if(seen.has(id))duplicates.add(id);seen.add(id)}
  if(duplicates.size)throw new Error('クラウドentity IDが重複しています')
  const viewportPayload=singleton<{id:string;x:number;y:number;zoom:number}>(entities,'flow_viewport'),reportPayload=singleton<{id:string;value:ExportBundle['reportBaseline']}>(entities,'report_baseline'),weeklyMetadata=singleton<{id:string;lastRunId:string|null}>(entities,'weekly_meta')
  if(!viewportPayload||!reportPayload||!weeklyMetadata)throw new Error('クラウドbundleの必須metadataがありません')
  const runs=ordered<{id:string}&ExportBundle['weekly']['runs'][number]>(entities,'weekly_run').map(withoutId),lastRun=weeklyMetadata.lastRunId===null?null:runs.find((run)=>run.runId===weeklyMetadata.lastRunId)??null
  const tombstones=ordered<{id:string;fingerprint:unknown}>(entities,'weekly_tombstone').map((value)=>value.fingerprint).filter((value):value is string=>typeof value==='string')
  const completions=Object.fromEntries(entities.filter((entity)=>entity.entityType==='weekly_completion').map((entity)=>[entity.entityId,withoutId(entity.payload as {id:string}&ExportBundle['weekly']['completions'][string])])) as ExportBundle['weekly']['completions']
  const bundle:ExportBundle={schemaVersion:4,exportedAt,tasks:ordered(entities,'task'),taskResults:ordered(entities,'task_result'),flow:{nodes:ordered(entities,'flow_node'),edges:ordered(entities,'flow_edge'),viewport:withoutId(viewportPayload)},audit:ordered(entities,'client_audit'),kpis:ordered(entities,'kpi'),reportBaseline:reportPayload.value,migrationArchive:ordered<{id:string}&ExportBundle['migrationArchive'][number]>(entities,'migration_archive').map(withoutId),weekly:{lastRun,runs,completions,tombstones}}
  const issues=validateBundle(bundle,config)
  if(issues.length)throw new Error(`クラウドデータ検証エラー: ${issues[0].path} ${issues[0].message}`)
  return bundle
}

export function diffEntities(current:CloudEntity[],candidate:ExportBundle):EntityChange[]{
  const before=new Map(current.map((entity)=>[key(entity.entityType,entity.entityId),entity])),after=bundleToEntities(candidate),changes:EntityChange[]=[]
  for(const entity of after){const previous=before.get(key(entity.entityType,entity.entityId));before.delete(key(entity.entityType,entity.entityId));if(!previous||canonicalJson(previous.payload)!==canonicalJson(entity.payload)||previous.ordinal!==entity.ordinal)changes.push({entityType:entity.entityType,entityId:entity.entityId,op:'upsert',expectedVersion:previous?.version??0,payload:entity.payload,ordinal:entity.ordinal,...referencesFor(entity),...semanticFingerprintFor(entity)})}
  for(const entity of before.values())changes.push({entityType:entity.entityType,entityId:entity.entityId,op:'delete',expectedVersion:entity.version})
  return changes
}

function referencesFor(entity:CloudEntity):Pick<EntityChange,'references'>{
  const payload=entity.payload as Record<string,unknown>,references:Array<{kind:string;entityType:EntityType;entityId:string}>=[]
  if(entity.entityType==='task'){
    if(Array.isArray(payload.dependencies))for(const id of payload.dependencies)if(typeof id==='string')references.push({kind:'dependency',entityType:'task',entityId:id})
    if(typeof payload.createdRunId==='string')references.push({kind:'created_run',entityType:'weekly_run',entityId:payload.createdRunId})
    const provenance=payload.provenance as Record<string,unknown>|undefined
    if(typeof provenance?.sourceTaskId==='string')references.push({kind:'provenance_source',entityType:'task',entityId:provenance.sourceTaskId})
    if(Array.isArray(provenance?.dependencyIds))for(const id of provenance.dependencyIds)if(typeof id==='string')references.push({kind:'provenance_dependency',entityType:'task',entityId:id})
    if(typeof provenance?.kpiId==='string')references.push({kind:'provenance_kpi',entityType:'kpi',entityId:provenance.kpiId})
  }
  if(entity.entityType==='task_result'&&typeof payload.taskId==='string')references.push({kind:'task',entityType:'task',entityId:payload.taskId})
  if(entity.entityType==='flow_node'){
    const data=payload.data as Record<string,unknown>|undefined
    if(Array.isArray(data?.taskIds))for(const id of data.taskIds)if(typeof id==='string')references.push({kind:'task',entityType:'task',entityId:id})
    if(typeof data?.taskId==='string')references.push({kind:'task',entityType:'task',entityId:data.taskId})
    if(data?.targetType==='task'&&typeof data.targetId==='string')references.push({kind:'task',entityType:'task',entityId:data.targetId})
    if(typeof data?.runId==='string')references.push({kind:'weekly_run',entityType:'weekly_run',entityId:data.runId})
  }
  if(entity.entityType==='flow_edge'){
    if(typeof payload.source==='string')references.push({kind:'source',entityType:'flow_node',entityId:payload.source})
    if(typeof payload.target==='string')references.push({kind:'target',entityType:'flow_node',entityId:payload.target})
    const data=payload.data as Record<string,unknown>|undefined
    if(Array.isArray(data?.taskIds))for(const id of data.taskIds)if(typeof id==='string')references.push({kind:'task',entityType:'task',entityId:id})
    if(typeof data?.taskId==='string')references.push({kind:'task',entityType:'task',entityId:data.taskId})
    if(data?.targetType==='task'&&typeof data.targetId==='string'&&data.targetId!==data.taskId)references.push({kind:'task',entityType:'task',entityId:data.targetId})
  }
  if(entity.entityType==='weekly_completion'&&typeof payload.taskId==='string')references.push({kind:'task',entityType:'task',entityId:payload.taskId})
  if(entity.entityType==='weekly_meta'&&typeof payload.lastRunId==='string')references.push({kind:'last_run',entityType:'weekly_run',entityId:payload.lastRunId})
  return{references}
}

function semanticFingerprintFor(entity:CloudEntity):Pick<EntityChange,'semanticFingerprint'>{
  if(entity.entityType==='task'){const value=(entity.payload as {fingerprint?:unknown}).fingerprint;if(typeof value==='string'&&value)return{semanticFingerprint:value}}
  return{}
}
