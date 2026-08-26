import type { Edge, Node, Viewport } from '@xyflow/react'
import { initialAudit, initialEdges, initialKpis, initialNodes, initialTasks, initialViewport } from './data'
import { SOURCE_CATALOG } from './sourceCatalog'
import { auditClassifications, checklistStatuses, deliverableAccessStates, deliverableTypes, departmentIdFor, departmentIds, departmentName, organizationUnits, people, sourceConfidences, statuses, urgencies, verificationStates, type AuditItem, type AutoTaskProvenance, type ExportBundle, type FlowData, type LoadResult, type Task, type ValidationIssue, type WorkspaceConfig } from './types'
import { canonicalFingerprint, canonicalProvenance, canonicalizeLegacyFingerprint, emptyWeeklyState, normalizeAutoTask, scheduledForRunId } from './weekly'
import { hasBoundedVisibleText } from './workspace'

export const KEYS={bundle:'nexus.bundle.v4',legacyV3:'nexus.bundle.v3',legacyBundle:'nexus.bundle.v2',legacyTasks:'nexus.tasks.v1',legacyFlow:'nexus.flow.v1',legacyAudit:'nexus.audit.v1',weeklyFailure:'nexus.weekly.failure.v1'} as const
export const LIMITS={fileBytes:2_000_000,tasks:500,nodes:500,edges:2_000,audit:2_000} as const
const initialFlow:FlowData={nodes:initialNodes,edges:initialEdges,viewport:initialViewport}
const now=()=>new Date().toISOString()
const fallback=():ExportBundle=>({schemaVersion:4,exportedAt:now(),tasks:initialTasks,taskResults:[],flow:initialFlow,audit:initialAudit,kpis:initialKpis,reportBaseline:null,migrationArchive:[],weekly:emptyWeeklyState()})
const isObject=(value:unknown):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value)
const semanticJson=(value:unknown):string=>Array.isArray(value)?`[${value.map(semanticJson).join(',')}]`:isObject(value)?`{${Object.keys(value).sort().map((key)=>`${JSON.stringify(key)}:${semanticJson(value[key])}`).join(',')}}`:(JSON.stringify(value)??'undefined')
const isIso=(value:unknown)=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(value)&&!Number.isNaN(Date.parse(value))
const hasContent=(value:unknown)=>typeof value==='string'&&value.replace(/[\s\u200b-\u200d\ufeff]/gu,'').length>0
const checklistItemKeys=new Set(['id','title','status','acceptanceCriteria','assignee','reviewer','reviewedAt','evidenceMemo','holdReason'])
const isDate=(value:unknown)=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&!Number.isNaN(Date.parse(`${value}T00:00:00Z`))
export const isSafeHttpsUrl=(value:string)=>{if(!value||value.trim()!==value||/[\\\s]/u.test(value)||Array.from(value).some((character)=>{const code=character.charCodeAt(0);return code<=31||code===127})||value.startsWith('//'))return false;try{const authority=value.slice('https://'.length).split(/[/?#]/,1)[0],rawHost=authority.replace(/:\d+$/,'');if(!value.startsWith('https://')||!authority||/[^\u0020-\u007E]/u.test(rawHost)||rawHost.startsWith('[')||rawHost.endsWith(']'))return false;const url=new URL(value),hostname=url.hostname;if(url.protocol!=='https:'||url.username||url.password||!hostname||url.port==='0'||hostname.includes(':')||hostname.includes('..')||(/^[\d.]+$/.test(rawHost)&&rawHost!==hostname))return false;if(/^\d+(?:\.\d+){3}$/.test(hostname))return hostname.split('.').every((part)=>String(Number(part))===part&&Number(part)<=255);return hostname.length<=253&&hostname.split('.').every((label)=>/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(label))}catch{return false}}
const authoritativeById=new Map(initialTasks.map((task)=>[task.id,task]))
const stringArray=(value:unknown)=>Array.isArray(value)&&value.length>0&&value.every((item)=>typeof item==='string'&&item.trim().length>0)

function validateTask(value:unknown,index:number,issues:ValidationIssue[],config?:WorkspaceConfig):value is Task{
  const path=`tasks[${index}]`
  if(!isObject(value)){issues.push({path,message:'タスクはオブジェクトである必要があります'});return false}
  for(const field of ['id','title','teamId','team','rawTeam','owner','rawAssignees','urgency','deadline','status','holdReason','updatedAt'] as const)if(typeof value[field]!=='string')issues.push({path:`${path}.${field}`,message:'文字列の必須項目です'})
  if(typeof value.owner==='string'&&!hasBoundedVisibleText(value.owner,120))issues.push({path:`${path}.owner`,message:'責任者は空白・制御文字・ゼロ幅文字だけではない1〜120文字です'})
  const autoId=typeof value.id==='string'&&/^AUTO-\d{4}-W\d{2}-\d{2}$/.test(value.id)
  if(typeof value.id==='string'&&!/^[PC][0-6]-\d{2}$/.test(value.id)&&!autoId)issues.push({path:`${path}.id`,message:'P0-01、C0-01またはAUTO-YYYY-Www-NN形式が必要です'})
  if(!Number.isInteger(value.phase)||Number(value.phase)<0||Number(value.phase)>6)issues.push({path:`${path}.phase`,message:'0〜6の整数が必要です'})
  if(typeof value.id==='string'&&/^[PC]/.test(value.id)&&Number(value.id[1])!==value.phase)issues.push({path:`${path}.phase`,message:'IDのPhaseと一致しません'})
  const configured=config?.departments.find((item)=>item.id===value.teamId)
  if(config&&!configured)issues.push({path:`${path}.teamId`,message:'workspaceで採用された部門IDが必要です'})
  else if(!config&&!departmentIds.includes(value.teamId as never))issues.push({path:`${path}.teamId`,message:'13チームの安定IDが必要です'})
  else if(value.team!==(configured?.name??departmentName(value.teamId as Task['teamId'])))issues.push({path:`${path}.team`,message:'部門IDの表示名と一致しません'})
  if(typeof value.rawTeam==='string'){const mapped=config?.departments.find((item)=>item.name===value.rawTeam)?.id??departmentIdFor(value.rawTeam);if(!mapped)issues.push({path:`${path}.rawTeam`,message:'未知の原文チーム名です'});else if(mapped!==value.teamId)issues.push({path:`${path}.rawTeam`,message:'原文チーム名と安定IDが一致しません'})}
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
  if(Array.isArray(value.sourceRefs)&&value.sourceRefs.length===0&&!autoId&&!config)issues.push({path:`${path}.sourceRefs`,message:'通常タスクには1件以上の出典が必要です'})
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
  if(!config&&expected&&Array.isArray(value.sourceRefs)){const expectedSource=expected.sourceRefs[0],hasExpected=value.sourceRefs.some((ref)=>isObject(ref)&&ref.sourceId==='S4'&&ref.sha256===expectedSource.sha256&&ref.lineStart===expectedSource.lineStart&&ref.lineEnd===expectedSource.lineEnd);if(!hasExpected)issues.push({path:`${path}.sourceRefs`,message:'正本IDに対応するS4行参照が必要です'})}
  if(autoId){
    if(Array.isArray(value.sourceRefs)&&value.sourceRefs.length!==0)issues.push({path:`${path}.sourceRefs`,message:'自動タスクはS4出典を偽装せず空配列にします'})
    for(const field of ['reason','expectedDeliverable','createdRunId','fingerprint'] as const)if(typeof value[field]!=='string'||!String(value[field]).trim())issues.push({path:`${path}.${field}`,message:'自動タスクの必須provenance項目です'})
    if(typeof value.createdRunId==='string'&&(!/^weekly:\d{4}-W\d{2}$/.test(value.createdRunId)||!String(value.id).startsWith(`AUTO-${value.createdRunId.replace('weekly:','')}-`)))issues.push({path:`${path}.createdRunId`,message:'自動IDの週とcreatedRunIdが一致しません'})
    if(value.createdBy!=='esports_progress_control')issues.push({path:`${path}.createdBy`,message:'作成者が不正です'})
    if(value.createdByDepartment!=='esports_progress_control')issues.push({path:`${path}.createdByDepartment`,message:'作成部署が不正です'})
    if(value.approvalState!=='要確認'&&value.approvalState!=='承認'&&value.approvalState!=='却下')issues.push({path:`${path}.approvalState`,message:'承認状態が不正です'})
    if(typeof value.automationDisabled!=='boolean')issues.push({path:`${path}.automationDisabled`,message:'無効化状態が必要です'})
    if(!Array.isArray(value.rationaleCodes)||value.rationaleCodes.length===0||value.rationaleCodes.some((item)=>typeof item!=='string'||!item.trim()))issues.push({path:`${path}.rationaleCodes`,message:'根拠コードが必要です'})
    if(!isObject(value.provenance)||typeof value.provenance.ruleId!=='string'||!value.provenance.ruleId.trim()||!Array.isArray(value.provenance.dependencyIds)||value.provenance.dependencyIds.some((id)=>typeof id!=='string'||!id.trim())||(value.provenance.sourceTaskId!==undefined&&typeof value.provenance.sourceTaskId!=='string'))issues.push({path:`${path}.provenance`,message:'役割別の内部provenanceが不正です'})
    else {const provenance={ruleId:value.provenance.ruleId,...(typeof value.provenance.sourceTaskId==='string'?{sourceTaskId:value.provenance.sourceTaskId}:{}),dependencyIds:value.provenance.dependencyIds as string[],...(typeof value.provenance.kpiId==='string'?{kpiId:value.provenance.kpiId as AutoTaskProvenance['kpiId']}:{})} as AutoTaskProvenance;if(JSON.stringify(provenance)!==JSON.stringify(canonicalProvenance(provenance)))issues.push({path:`${path}.provenance`,message:'dependencyIdsは重複なしの辞書順である必要があります'});if(value.fingerprint!==canonicalFingerprint(provenance))issues.push({path:`${path}.fingerprint`,message:'canonical provenanceと一致しません'})}
  }
  return true
}

function validateGraph(tasks:Task[],issues:ValidationIssue[]){
  const ids=new Set(tasks.map((task)=>task.id)),byId=new Map(tasks.map((task)=>[task.id,task]))
  tasks.forEach((task,index)=>{if(new Set(task.dependencies).size!==task.dependencies.length)issues.push({path:`tasks[${index}].dependencies`,message:'依存IDが重複しています'});task.dependencies.forEach((id)=>{if(id===task.id)issues.push({path:`tasks[${index}].dependencies`,message:'自己参照はできません'});else if(!ids.has(id))issues.push({path:`tasks[${index}].dependencies`,message:`存在しない依存ID: ${id}`})})})
  const visiting=new Set<string>(),visited=new Set<string>()
  const visit=(id:string):boolean=>{if(visiting.has(id))return true;if(visited.has(id))return false;visiting.add(id);const cycle=(byId.get(id)?.dependencies??[]).some(visit);visiting.delete(id);visited.add(id);return cycle}
  tasks.forEach((task,index)=>{if(visit(task.id))issues.push({path:`tasks[${index}].dependencies`,message:'循環依存があります'})})
}

function validateFlow(value:unknown,issues:ValidationIssue[],tasks:Task[],config?:WorkspaceConfig):value is FlowData{
  const validTaskIds=new Set(tasks.map((task)=>task.id))
  if(!isObject(value)||!Array.isArray(value.nodes)||!Array.isArray(value.edges)||!isObject(value.viewport)){issues.push({path:'flow',message:'nodes/edges/viewportが必要です'});return false}
  if(value.nodes.length>LIMITS.nodes||value.edges.length>LIMITS.edges)issues.push({path:'flow',message:'件数上限を超えています'})
  const validateTaskData=(data:Record<string,unknown>,path:string,isNode:boolean)=>{
    const taskIds=data.taskIds
    if(taskIds!==undefined&&(!Array.isArray(taskIds)||taskIds.some((id)=>typeof id!=='string'||!id||!validTaskIds.has(id))))issues.push({path:`${path}.taskIds`,message:'存在しないactive task参照があります'})
    if(typeof data.taskId==='string'&&!validTaskIds.has(data.taskId))issues.push({path:`${path}.taskId`,message:'存在しないactive task参照があります'})
    if(data.targetType!=='task')return
    if(typeof data.targetId!=='string'||!data.targetId||!validTaskIds.has(data.targetId))issues.push({path:`${path}.targetId`,message:'有効なtask targetIdが必要です'})
    if(typeof data.taskId!=='string'||!data.taskId||!validTaskIds.has(data.taskId))issues.push({path:`${path}.taskId`,message:'有効なtaskIdが必要です'})
    if(typeof data.targetId==='string'&&typeof data.taskId==='string'&&data.targetId!==data.taskId)issues.push({path:`${path}.taskId`,message:'taskIdはtargetIdと一致する必要があります'})
    if(isNode&&(!Array.isArray(taskIds)||(typeof data.taskId==='string'&&!taskIds.includes(data.taskId))))issues.push({path:`${path}.taskIds`,message:'task-target nodeはtaskIdを含むtaskIdsが必要です'})
  }
  const ids:string[]=[];(value.nodes as unknown[]).forEach((node,index)=>{if(!isObject(node)||typeof node.id!=='string'||!node.id||!isObject(node.position)||typeof node.position.x!=='number'||!Number.isFinite(node.position.x)||typeof node.position.y!=='number'||!Number.isFinite(node.position.y)||!isObject(node.data))issues.push({path:`flow.nodes[${index}]`,message:'id/finite position/dataが必要です'});else{ids.push(node.id);const refs=node.data.taskIds;if(refs!==undefined&&(!Array.isArray(refs)||refs.some((id)=>typeof id!=='string'||!validTaskIds.has(id))))issues.push({path:`flow.nodes[${index}].data.taskIds`,message:'存在しないタスク参照があります'});if(node.id.startsWith('weekly-complete:')&&(node.data.weeklyKind!=='completion'||typeof node.data.taskId!=='string'||node.id!==`weekly-complete:${node.data.taskId}`||!validTaskIds.has(node.data.taskId)))issues.push({path:`flow.nodes[${index}].data`,message:'完了付箋メタデータが不正です'});if(node.id.startsWith('weekly-summary:')&&(node.data.weeklyKind!=='summary'||typeof node.data.runId!=='string'||node.id!==`weekly-summary:${node.data.runId}`))issues.push({path:`flow.nodes[${index}].data`,message:'週次summaryメタデータが不正です'})}})
  ;(value.nodes as unknown[]).forEach((node,index)=>{if(isObject(node)&&isObject(node.data))validateTaskData(node.data,`flow.nodes[${index}].data`,true)})
  const idSet=new Set(ids);if(idSet.size!==ids.length)issues.push({path:'flow.nodes',message:'ノードIDが重複しています'})
  const edgeIds:string[]=[];(value.edges as unknown[]).forEach((edge,index)=>{if(!isObject(edge)||typeof edge.id!=='string'||!edge.id||typeof edge.source!=='string'||typeof edge.target!=='string'||!idSet.has(String(edge.source))||!idSet.has(String(edge.target))||edge.source===edge.target)issues.push({path:`flow.edges[${index}]`,message:'接続が不正です'});else{edgeIds.push(edge.id);if(isObject(edge.data))validateTaskData(edge.data,`flow.edges[${index}].data`,false)}})
  if(new Set(edgeIds).size!==edgeIds.length)issues.push({path:'flow.edges',message:'エッジIDが重複しています'})
  if(config){config.phases.forEach((phase)=>{const node=(value.nodes as unknown[]).find((item)=>isObject(item)&&item.id===`phase-${phase.code}`);if(!isObject(node)||!isObject(node.data)||node.data.label!==phase.name)issues.push({path:`flow.nodes.phase-${phase.code}`,message:'workspaceのフェーズ表示名と一致するノードが必要です'});else{const actual=Array.isArray(node.data.taskIds)?node.data.taskIds:[],expected=tasks.filter((task)=>task.phase===phase.code).map((task)=>task.id);if(actual.length!==expected.length||expected.some((id)=>!actual.includes(id)))issues.push({path:`flow.nodes.phase-${phase.code}.data.taskIds`,message:'フェーズに属する全タスクと一致する必要があります'})}});config.phases.slice(1).forEach((phase,index)=>{if(!(value.edges as unknown[]).some((item)=>isObject(item)&&item.source===`phase-${index}`&&item.target===`phase-${phase.code}`))issues.push({path:`flow.edges.phase-${index}`,message:'連続するフェーズ間の接続が必要です'})})}
  if(typeof value.viewport.x!=='number'||!Number.isFinite(value.viewport.x)||typeof value.viewport.y!=='number'||!Number.isFinite(value.viewport.y)||typeof value.viewport.zoom!=='number'||!Number.isFinite(value.viewport.zoom)||Number(value.viewport.zoom)<=0)issues.push({path:'flow.viewport',message:'finite x/y/正のzoomが必要です'})
  return true
}

function validateWeekly(value:unknown,issues:ValidationIssue[],tasks:Task[],flow:unknown,kpis:unknown,config?:WorkspaceConfig){
  if(!isObject(value)||!Array.isArray(value.runs)||!isObject(value.completions)||!Array.isArray(value.tombstones)){issues.push({path:'weekly',message:'週次状態が不正です'});return}
  if(value.runs.length>104)issues.push({path:'weekly.runs',message:'保持上限104週を超えています'})
  const runIds:string[]=[],runsById=new Map<string,Record<string,unknown>>()
  value.runs.forEach((run,index)=>{
    const path=`weekly.runs[${index}]`;if(!isObject(run)){issues.push({path,message:'週次実行はオブジェクトです'});return}
    for(const field of ['runId','scheduledFor','ranAt','trigger','outcome'] as const)if(typeof run[field]!=='string')issues.push({path:`${path}.${field}`,message:'文字列が必要です'})
    if(typeof run.runId==='string'){runIds.push(run.runId);runsById.set(run.runId,run);if(!/^weekly:\d{4}-W\d{2}$/.test(run.runId))issues.push({path:`${path}.runId`,message:'weekly:YYYY-Www形式が必要です'});if(scheduledForRunId(run.runId)!==run.scheduledFor)issues.push({path:`${path}.scheduledFor`,message:'runIdに対応するJST月曜00:00と一致しません'})}
    if(!isIso(run.scheduledFor)||!isIso(run.ranAt)||Date.parse(String(run.ranAt))<Date.parse(String(run.scheduledFor)))issues.push({path,message:'実行日時は予定日時以後の有効な日時が必要です'})
    for(const field of ['missedWeekCount','addedStickyCount','autoTaskCount'] as const)if(!Number.isInteger(run[field])||Number(run[field])<0)issues.push({path:`${path}.${field}`,message:'0以上の整数が必要です'})
    if(run.trigger!=='scheduled'&&run.trigger!=='catch-up'&&run.trigger!=='manual')issues.push({path:`${path}.trigger`,message:'実行契機が不正です'})
    if(run.outcome!=='success')issues.push({path:`${path}.outcome`,message:'保存済みrunはsuccessのみです'})
    if(!Array.isArray(run.reasons)||run.reasons.some((reason)=>typeof reason!=='string'))issues.push({path:`${path}.reasons`,message:'理由配列が必要です'})
    if(!isObject(run.snapshot))issues.push({path:`${path}.snapshot`,message:'snapshotが必要です'})
    else {const snapshot=run.snapshot,phaseKeys=(config?.phases.map((item)=>String(item.code))??['0','1','2','3','4','5','6']).sort().join(',');for(const field of ['completed','total','highUrgencyRemaining','blockers'] as const)if(!Number.isInteger(snapshot[field])||Number(snapshot[field])<0)issues.push({path:`${path}.snapshot.${field}`,message:'0以上の整数が必要です'});if(Number(snapshot.completed)>Number(snapshot.total)||Number(snapshot.highUrgencyRemaining)>Number(snapshot.total)||Number(snapshot.blockers)>Number(snapshot.total))issues.push({path:`${path}.snapshot`,message:'集計値はtotal以下である必要があります'});if(!isObject(snapshot.phaseProgress)||Object.keys(snapshot.phaseProgress).sort().join(',')!==phaseKeys)issues.push({path:`${path}.snapshot.phaseProgress`,message:'workspace設定のPhaseが必要です'});else{let phaseCompleted=0,phaseTotal=0;Object.entries(snapshot.phaseProgress).forEach(([phase,item])=>{if(!isObject(item)||!Number.isInteger(item.completed)||!Number.isInteger(item.total)||!Number.isInteger(item.rate)||Number(item.completed)<0||Number(item.total)<0||Number(item.completed)>Number(item.total)||Number(item.rate)!==Math.round(Number(item.completed)/Math.max(Number(item.total),1)*100))issues.push({path:`${path}.snapshot.phaseProgress.${phase}`,message:'completed/total/rateの意味整合が不正です'});else{phaseCompleted+=Number(item.completed);phaseTotal+=Number(item.total)}});if(phaseCompleted!==snapshot.completed||phaseTotal!==snapshot.total)issues.push({path:`${path}.snapshot.phaseProgress`,message:'Phase合計と全体集計が一致しません'})}if(!Array.isArray(snapshot.kpis)||snapshot.kpis.some((kpi)=>!isObject(kpi)||typeof kpi.id!=='string'||typeof kpi.label!=='string'||typeof kpi.target!=='number'||!Number.isFinite(kpi.target)||!(kpi.actual===null||(typeof kpi.actual==='number'&&Number.isFinite(kpi.actual)&&kpi.actual>=0))))issues.push({path:`${path}.snapshot.kpis`,message:'KPI snapshotが不正です'})}
  })
  if(new Set(runIds).size!==runIds.length)issues.push({path:'weekly.runs',message:'runIdが重複しています'})
  if(value.lastRun===null){if(runIds.length)issues.push({path:'weekly.lastRun',message:'runsがある場合は最終runが必要です'})}else if(!isObject(value.lastRun)||typeof value.lastRun.runId!=='string'||semanticJson(value.lastRun)!==semanticJson(runsById.get(value.lastRun.runId)))issues.push({path:'weekly.lastRun',message:'runs内の同一runと全項目一致する必要があります'})
  const taskIds=new Set(tasks.map((task)=>task.id)),flowNodes:Record<string,unknown>[]=isObject(flow)&&Array.isArray(flow.nodes)?flow.nodes.filter(isObject):[],completions=value.completions as Record<string,unknown>
  Object.entries(completions).forEach(([id,entry])=>{const task=tasks.find((item)=>item.id===id);if(!task)issues.push({path:`weekly.completions.${id}`,message:'存在するactive taskが必要です'});if(!isObject(entry)){issues.push({path:`weekly.completions.${id}`,message:'完了履歴が不正です'});return}if(entry.taskId!==id||!isIso(entry.firstSeen)||!isIso(entry.lastConfirmed)||typeof entry.completedWeek!=='string'||scheduledForRunId(String(entry.completedWeek))===null||Date.parse(String(entry.lastConfirmed))<Date.parse(String(entry.firstSeen))||!statuses.includes(entry.currentStatus as never)||task?.status!==entry.currentStatus||(entry.basis!=='status-change'&&entry.basis!=='inferred-from-updatedAt'))issues.push({path:`weekly.completions.${id}`,message:'完了履歴がtask現在状態と整合しません'});const node=flowNodes.find((item)=>item.id===`weekly-complete:${id}`);if(!node||!isObject(node.data)||node.data.taskId!==id||node.data.firstSeen!==entry.firstSeen||node.data.lastConfirmed!==entry.lastConfirmed||node.data.completedWeek!==entry.completedWeek||node.data.basis!==entry.basis||node.data.currentStatus!==entry.currentStatus)issues.push({path:`flow.nodes.weekly-complete:${id}`,message:'completion履歴と付箋が相互一致しません'})})
  flowNodes.forEach((node)=>{if(typeof node.id==='string'&&node.id.startsWith('weekly-complete:')){const id=node.id.slice('weekly-complete:'.length);if(!Object.hasOwn(completions,id))issues.push({path:`flow.nodes.${node.id}`,message:'対応するcompletion履歴がありません'})}if(typeof node.id==='string'&&node.id.startsWith('weekly-summary:')){const runId=node.id.slice('weekly-summary:'.length),run=runsById.get(runId);if(!run||!isObject(node.data)||node.data.runId!==runId||node.data.scheduledFor!==run.scheduledFor||semanticJson(node.data.snapshot)!==semanticJson(run.snapshot))issues.push({path:`flow.nodes.${node.id}`,message:'weekly runとsummary付箋が相互一致しません'})}})
  runIds.forEach((runId)=>{if(!flowNodes.some((node)=>node.id===`weekly-summary:${runId}`))issues.push({path:`weekly.runs.${runId}`,message:'対応するsummary付箋がありません'})})
  tasks.forEach((task,index)=>{if(task.createdByDepartment!=='esports_progress_control')return;const provenance=task.provenance;if(!provenance)return;if(provenance.sourceTaskId&&!taskIds.has(provenance.sourceTaskId))issues.push({path:`tasks[${index}].provenance.sourceTaskId`,message:'存在するsource taskが必要です'});provenance.dependencyIds.forEach((id)=>{if(!taskIds.has(id))issues.push({path:`tasks[${index}].provenance.dependencyIds`,message:`存在しないdependency provenance: ${id}`})});if(provenance.kpiId&&(!Array.isArray(kpis)||!kpis.some((item)=>isObject(item)&&item.id===provenance.kpiId)))issues.push({path:`tasks[${index}].provenance.kpiId`,message:'存在するKPIが必要です'});if(task.fingerprint!==canonicalFingerprint(provenance))issues.push({path:`tasks[${index}].fingerprint`,message:'canonical fingerprintと一致しません'})})
  if(value.tombstones.length>500||value.tombstones.some((item)=>typeof item!=='string'||!item.trim()||canonicalizeLegacyFingerprint(item)!==item)||new Set(value.tombstones).size!==value.tombstones.length)issues.push({path:'weekly.tombstones',message:'canonicalで一意なfingerprint配列が必要です'})
}

function validateAudit(value:unknown,issues:ValidationIssue[]){
  if(!Array.isArray(value)){issues.push({path:'audit',message:'監査ログ配列が必要です'});return}
  if(value.length>LIMITS.audit)issues.push({path:'audit',message:'監査ログ件数上限を超えています'})
  const ids:string[]=[]
  value.forEach((item,index)=>{const path=`audit[${index}]`;if(!isObject(item)){issues.push({path,message:'監査ログはオブジェクトです'});return}for(const field of ['id','issueId','targetVersion','before','after','retest','residualRisk','action','detail'] as const)if(typeof item[field]!=='string'||!String(item[field]).trim())issues.push({path:`${path}.${field}`,message:'空でない文字列が必要です'});if(typeof item.id==='string')ids.push(item.id);if(!auditClassifications.includes(item.classification as never))issues.push({path:`${path}.classification`,message:'監査分類が不正です'});if(typeof item.targetVersion==='string'&&!/^\d+\.\d+\.\d+$/.test(item.targetVersion))issues.push({path:`${path}.targetVersion`,message:'semverが必要です'});if(!isIso(item.at))issues.push({path:`${path}.at`,message:'ISO日時が必要です'});if(!Number.isInteger(item.round)||Number(item.round)<1)issues.push({path:`${path}.round`,message:'1以上の整数が必要です'});for(const field of ['files','evidence'] as const)if(!stringArray(item[field]))issues.push({path:`${path}.${field}`,message:'空でない文字列配列が必要です'})})
  if(new Set(ids).size!==ids.length)issues.push({path:'audit',message:'監査ログIDが重複しています'})
}

export function validateBundle(value:unknown,config?:WorkspaceConfig):ValidationIssue[]{
  const issues:ValidationIssue[]=[]
  if(!isObject(value))return[{path:'$',message:'JSONルートはオブジェクトです'}]
  let effectiveConfig=config
  if(value.workspaceProfile!==undefined){const profile=value.workspaceProfile;if(!isObject(profile)||typeof profile.projectName!=='string'||!hasContent(profile.projectName)||profile.projectName.length>120||typeof profile.purpose!=='string'||profile.purpose.trim().length<20||profile.purpose.length>4000||typeof profile.knownTasks!=='string'||profile.knownTasks.length>8000||profile.generatorVersion!=='nexus-local-v1'||!isIso(profile.createdAt))issues.push({path:'workspaceProfile',message:'プロジェクト名・目的・generator・作成日時を含む有効なprofileが必要です'})}
  if(value.workspaceConfig!==undefined){const candidate=value.workspaceConfig,candidateTerminology=isObject(candidate)&&isObject(candidate.terminology)?candidate.terminology:null,phaseNames=isObject(candidate)&&Array.isArray(candidate.phases)?candidate.phases.map((phase)=>isObject(phase)?String(phase.name).normalize('NFKC').trim().toLocaleLowerCase('ja-JP'):''):[],departmentValues=isObject(candidate)&&Array.isArray(candidate.departments)?candidate.departments:[],departmentIdsInConfig=departmentValues.map((department)=>isObject(department)?String(department.id):''),departmentNames=departmentValues.map((department)=>isObject(department)?String(department.name).normalize('NFKC').trim().toLocaleLowerCase('ja-JP'):''),valid=isObject(candidate)&&candidate.version===1&&Array.isArray(candidate.phases)&&candidate.phases.length>=3&&candidate.phases.length<=7&&candidate.phases.every((phase,index)=>isObject(phase)&&phase.code===index&&typeof phase.name==='string'&&hasContent(phase.name)&&phase.name.length<=120)&&new Set(phaseNames).size===phaseNames.length&&Array.isArray(candidate.departments)&&candidate.departments.length>=2&&candidate.departments.length<=12&&candidate.departments.every((department)=>isObject(department)&&departmentIds.includes(department.id as never)&&typeof department.name==='string'&&hasContent(department.name)&&department.name.length<=120&&typeof department.owner==='string'&&hasBoundedVisibleText(department.owner,120))&&new Set(departmentIdsInConfig).size===departmentIdsInConfig.length&&new Set(departmentNames).size===departmentNames.length&&!!candidateTerminology&&['task','phase','department'].every((key)=>typeof candidateTerminology[key]==='string'&&hasContent(candidateTerminology[key])&&String(candidateTerminology[key]).length<=20);if(!valid)issues.push({path:'workspaceConfig',message:'一意な3〜7フェーズ・一意な2〜12部門・表示用語を含む有効なconfigが必要です'});else if(config&&semanticJson(config)!==semanticJson(candidate))issues.push({path:'workspaceConfig',message:'現在の組織設定と異なるconfigは読み込めません'});else if(!config)effectiveConfig=candidate as unknown as WorkspaceConfig}
  if(value.schemaVersion!==4)issues.push({path:'schemaVersion',message:'対応バージョンは4です'})
  if(!isIso(value.exportedAt))issues.push({path:'exportedAt',message:'ISO日時が必要です'})
  const activeTasks:Task[]=Array.isArray(value.tasks)?value.tasks as Task[]:[]
  if(!Array.isArray(value.tasks))issues.push({path:'tasks',message:'配列が必要です'})
  else {if(value.tasks.length>LIMITS.tasks)issues.push({path:'tasks',message:'件数上限を超えています'});value.tasks.forEach((task,index)=>validateTask(task,index,issues,effectiveConfig));const ids=activeTasks.map((task)=>task.id),fingerprints=activeTasks.map((task)=>task.fingerprint).filter((item):item is string=>typeof item==='string');if(new Set(ids).size!==ids.length)issues.push({path:'tasks',message:'タスクIDが重複しています'});if(new Set(fingerprints).size!==fingerprints.length)issues.push({path:'tasks',message:'自動タスクfingerprintが重複しています'});validateGraph(activeTasks,issues)}
  const validTaskIds=new Set<string>(Array.isArray(value.tasks)?(value.tasks as unknown[]).filter(isObject).map((task)=>String(task.id)):[])
  if(value.taskResults!==undefined&&!Array.isArray(value.taskResults))issues.push({path:'taskResults',message:'成果シート配列が必要です'})
  else if(Array.isArray(value.taskResults)) {
    const resultIds:string[]=[],resultTaskIds:string[]=[]
    value.taskResults.forEach((result,index)=>{
      const path=`taskResults[${index}]`
      if(!isObject(result)){issues.push({path,message:'オブジェクトが必要です'});return}
      for(const [field,limit] of [['resultBody',10000],['verificationSummary',4000],['nextStep',4000],['completionCriteria',4000],['verificationMemo',10000]] as const)if(typeof result[field]!=='string'||result[field].length>limit)issues.push({path:`${path}.${field}`,message:`${limit}文字以下の文字列が必要です`})
      if(typeof result.taskId!=='string'||result.taskId.length>244||!validTaskIds.has(result.taskId))issues.push({path:`${path}.taskId`,message:'244文字以下で存在するtaskへの参照が必要です'})
      if(typeof result.id!=='string'||result.id.length>256||result.id!==`task-result:${result.taskId}`)issues.push({path:`${path}.id`,message:'256文字以下のtask-result:<taskId>形式が必要です'})
      if(!verificationStates.includes(result.verificationState as never))issues.push({path:`${path}.verificationState`,message:'確認状態が不正です'})
      if(result.verifiedBy!==undefined&&(typeof result.verifiedBy!=='string'||result.verifiedBy.length>200))issues.push({path:`${path}.verifiedBy`,message:'200文字以下です'})
      if(result.verifiedAt!==undefined&&!isIso(result.verifiedAt))issues.push({path:`${path}.verifiedAt`,message:'ISO日時が必要です'})
      if(!isIso(result.updatedAt))issues.push({path:`${path}.updatedAt`,message:'ISO日時が必要です'})
      if(!Array.isArray(result.deliverables)||result.deliverables.length>32)issues.push({path:`${path}.deliverables`,message:'32件以下の配列が必要です'})
      else {const ids:string[]=[];result.deliverables.forEach((item,itemIndex)=>{const itemPath=`${path}.deliverables[${itemIndex}]`;if(!isObject(item)){issues.push({path:itemPath,message:'オブジェクトが必要です'});return}if(typeof item.id!=='string'||!item.id.trim())issues.push({path:`${itemPath}.id`,message:'一意IDが必要です'});else ids.push(item.id);if(typeof item.title!=='string'||!item.title.trim()||item.title.length>200)issues.push({path:`${itemPath}.title`,message:'1〜200文字が必要です'});if(!deliverableTypes.includes(item.type as never))issues.push({path:`${itemPath}.type`,message:'種別が不正です'});if(typeof item.href!=='string'||item.href.length>2048||!isSafeHttpsUrl(item.href))issues.push({path:`${itemPath}.href`,message:'userinfoなしのhttps URLが必要です'});if(item.note!==undefined&&(typeof item.note!=='string'||item.note.length>1000))issues.push({path:`${itemPath}.note`,message:'1000文字以下です'});if(!deliverableAccessStates.includes(item.accessState as never))issues.push({path:`${itemPath}.accessState`,message:'アクセス状態が不正です'});if(item.lastCheckedAt!==undefined&&!isIso(item.lastCheckedAt))issues.push({path:`${itemPath}.lastCheckedAt`,message:'ISO日時が必要です'})});if(new Set(ids).size!==ids.length)issues.push({path:`${path}.deliverables`,message:'IDが重複しています'})}
      if(Array.isArray(result.deliverables))result.deliverables.forEach((item,itemIndex)=>{if(isObject(item)&&typeof item.id==='string'&&item.id.length>100)issues.push({path:`${path}.deliverables[${itemIndex}].id`,message:'100文字以下のIDが必要です'})})
      if(result.checklistItems!==undefined&&!Array.isArray(result.checklistItems))issues.push({path:`${path}.checklistItems`,message:'64件以下の配列が必要です'})
      else if(Array.isArray(result.checklistItems)){const ids:string[]=[];if(result.checklistItems.length>64)issues.push({path:`${path}.checklistItems`,message:'64件以下です'});result.checklistItems.forEach((item,itemIndex)=>{const itemPath=`${path}.checklistItems[${itemIndex}]`;if(!isObject(item)){issues.push({path:itemPath,message:'オブジェクトが必要です'});return}const unknown=Object.keys(item).filter((key)=>!checklistItemKeys.has(key));if(unknown.length)issues.push({path:itemPath,message:`未対応の項目キーです: ${unknown.join(', ')}`});if(typeof item.id!=='string'||!hasContent(item.id)||item.id.length>100)issues.push({path:`${itemPath}.id`,message:'1〜100文字の一意IDが必要です'});else ids.push(item.id);if(!hasContent(item.title)||String(item.title).length>500)issues.push({path:`${itemPath}.title`,message:'1〜500文字の実施項目が必要です'});if(!checklistStatuses.includes(item.status as never))issues.push({path:`${itemPath}.status`,message:'状態が不正です'});if(!hasContent(item.acceptanceCriteria)||String(item.acceptanceCriteria).length>1000)issues.push({path:`${itemPath}.acceptanceCriteria`,message:'1〜1000文字の受入条件が必要です'});for(const [field,limit] of [['assignee',200],['reviewer',200],['reviewedAt',40],['evidenceMemo',2000],['holdReason',1000]] as const)if(typeof item[field]!=='string'||item[field].length>limit)issues.push({path:`${itemPath}.${field}`,message:`${limit}文字以下の文字列が必要です`});if(typeof item.reviewedAt==='string'&&item.reviewedAt!==''&&!isIso(item.reviewedAt))issues.push({path:`${itemPath}.reviewedAt`,message:'空またはISO日時が必要です'});if(item.status==='完了'){for(const field of ['title','acceptanceCriteria','reviewer','reviewedAt','evidenceMemo'] as const)if(!hasContent(item[field]))issues.push({path:`${itemPath}.${field}`,message:'完了項目の必須値です'})}if(item.status==='保留'&&!hasContent(item.holdReason))issues.push({path:`${itemPath}.holdReason`,message:'保留理由が必要です'})});if(new Set(ids).size!==ids.length)issues.push({path:`${path}.checklistItems`,message:'IDが重複しています'})}
      if(typeof result.id==='string')resultIds.push(result.id);if(typeof result.taskId==='string')resultTaskIds.push(result.taskId)
    })
    if(new Set(resultIds).size!==resultIds.length||new Set(resultTaskIds).size!==resultTaskIds.length)issues.push({path:'taskResults',message:'1 taskに1枚の成果シートです'})
  }
  validateFlow(value.flow,issues,activeTasks,effectiveConfig)
  validateAudit(value.audit,issues)
  if(!Array.isArray(value.kpis)||value.kpis.some((kpi)=>!isObject(kpi)||typeof kpi.id!=='string'||typeof kpi.target!=='number'||!Number.isFinite(kpi.target)||kpi.target<0||!(kpi.actual===null||(typeof kpi.actual==='number'&&Number.isFinite(kpi.actual)&&kpi.actual>=0))))issues.push({path:'kpis',message:'KPIはfiniteかつ0以上である必要があります'})
  if(!(value.reportBaseline===null||(isObject(value.reportBaseline)&&isIso(value.reportBaseline.savedAt)&&isObject(value.reportBaseline.statuses))))issues.push({path:'reportBaseline',message:'比較基準が不正です'})
  else if(isObject(value.reportBaseline))Object.entries(value.reportBaseline.statuses as Record<string,unknown>).forEach(([id,entry])=>{if(!isObject(entry)||!statuses.includes(entry.status as never)||!isIso(entry.updatedAt))issues.push({path:`reportBaseline.statuses.${id}`,message:'statusとupdatedAtが不正です'})})
  if(!Array.isArray(value.migrationArchive))issues.push({path:'migrationArchive',message:'移行アーカイブ配列が必要です'})
  else value.migrationArchive.forEach((archive,index)=>{if(!isObject(archive)||!Number.isInteger(archive.fromSchema)||!isIso(archive.migratedAt)||typeof archive.reason!=='string'||!archive.reason.trim()||!Array.isArray(archive.tasks))issues.push({path:`migrationArchive[${index}]`,message:'移行メタデータが不正です'})})
  validateWeekly(value.weekly,issues,activeTasks,value.flow,value.kpis,effectiveConfig)
  return issues
}
export const isBundle=(value:unknown):value is ExportBundle=>validateBundle(value).length===0

function migrate(value:unknown):{bundle:ExportBundle;changed:boolean}|null{
  if(!isObject(value))return null
  if(value.schemaVersion===4){
    const bundle=value as unknown as ExportBundle
    const normalized=Array.isArray(bundle.tasks)?bundle.tasks.map(normalizeAutoTask):[],savedIds=new Set(normalized.map(({task})=>task.id)),missing=bundle.workspaceConfig?[]:initialTasks.filter((task)=>!savedIds.has(task.id)),tasks=[...normalized.map(({task})=>task),...missing],tombstones=bundle.weekly&&Array.isArray(bundle.weekly.tombstones)?Array.from(new Set(bundle.weekly.tombstones.map(canonicalizeLegacyFingerprint))):bundle.weekly?.tombstones,runs=new Map((bundle.weekly?.runs??[]).map((run)=>[run.runId,run])),nodes=(bundle.flow?.nodes??[]).map((node)=>{if(!node.id.startsWith('weekly-summary:'))return node;const run=runs.get(node.id.slice('weekly-summary:'.length));if(!run||node.data.snapshot!==undefined&&node.data.scheduledFor!==undefined)return node;return{...node,data:{...node.data,scheduledFor:run.scheduledFor,snapshot:run.snapshot}}}),flowChanged=JSON.stringify(nodes)!==JSON.stringify(bundle.flow?.nodes)
    const taskResults=Array.isArray(bundle.taskResults)?bundle.taskResults:[],changed=missing.length>0||!Array.isArray(bundle.taskResults)||normalized.some((item)=>item.changed)||JSON.stringify(tombstones)!==JSON.stringify(bundle.weekly?.tombstones)||flowChanged
    return {bundle:changed?{...bundle,tasks,taskResults,flow:{...bundle.flow,nodes},weekly:{...bundle.weekly,tombstones:tombstones??[]},exportedAt:now()}:bundle,changed}
  }
  if(value.schemaVersion===3&&Array.isArray(value.tasks)){
    const savedIds=new Set((value.tasks as Task[]).map((task)=>task.id)),missing=initialTasks.filter((task)=>!savedIds.has(task.id))
    return {changed:true,bundle:{...(value as unknown as Omit<ExportBundle,'schemaVersion'|'weekly'|'taskResults'>),schemaVersion:4,tasks:[...(value.tasks as Task[]),...missing],taskResults:[],exportedAt:now(),weekly:emptyWeeklyState()}}
  }
  if(value.schemaVersion===2&&Array.isArray(value.tasks)){
    const flow=isObject(value.flow)?value.flow as unknown as FlowData:initialFlow
    const audit=Array.isArray(value.audit)?value.audit as AuditItem[]:[]
    return {changed:true,bundle:{schemaVersion:4,exportedAt:now(),tasks:initialTasks,taskResults:[],flow,audit:[...initialAudit,...audit],kpis:initialKpis,reportBaseline:null,migrationArchive:[{fromSchema:2,migratedAt:now(),reason:'旧39件を重複表示せず、S4の73件を正本化',tasks:value.tasks}],weekly:emptyWeeklyState()}}
  }
  return null
}

export function readBundle():LoadResult<ExportBundle>{
  const clean=fallback();let raw:string|null
  try{raw=localStorage.getItem(KEYS.bundle);if(raw===null)raw=localStorage.getItem(KEYS.legacyV3);if(raw===null)raw=localStorage.getItem(KEYS.legacyBundle)}catch(error){return{ok:false,value:clean,error:`保存データを取得できません: ${error instanceof Error?error.message:'不明なエラー'}`}}
  if(raw===null)return{ok:true,value:clean}
  try{const migrated=migrate(JSON.parse(raw));if(!migrated)return{ok:false,value:clean,error:'保存データのschemaに対応していません',raw};const issues=validateBundle(migrated.bundle);if(issues.length)return{ok:false,value:clean,error:`保存データが不正です: ${issues[0].path} ${issues[0].message}`,raw};if(migrated.changed)localStorage.setItem(KEYS.bundle,JSON.stringify(migrated.bundle));return{ok:true,value:migrated.bundle,raw}}
  catch(error){return{ok:false,value:clean,error:`保存データを読み込めません: ${error instanceof Error?error.message:'不明なエラー'}`,raw}}
}
export function saveBundle(bundle:ExportBundle):LoadResult<ExportBundle>{try{const issues=validateBundle(bundle);if(issues.length)return{ok:false,value:bundle,error:`保存前検証エラー: ${issues[0].path} ${issues[0].message}`};const serialized=JSON.stringify(bundle);localStorage.setItem(KEYS.bundle,serialized);if(localStorage.getItem(KEYS.bundle)!==serialized)return{ok:false,value:bundle,error:'保存後の再読込が一致しません'};return{ok:true,value:bundle}}catch(error){return{ok:false,value:bundle,error:`保存できません: ${error instanceof Error?error.message:'不明なエラー'}`}}}
export function parseImport(text:string):LoadResult<ExportBundle>{const clean=fallback();if(new Blob([text]).size>LIMITS.fileBytes)return{ok:false,value:clean,error:`ファイルサイズ上限${LIMITS.fileBytes} bytesを超えています`};try{const migrated=migrate(JSON.parse(text));if(!migrated)return{ok:false,value:clean,error:'schemaVersion 2、3、4のみ読み込めます'};const issues=validateBundle(migrated.bundle,migrated.bundle.workspaceConfig);return issues.length?{ok:false,value:clean,error:issues.slice(0,5).map((issue)=>`${issue.path}: ${issue.message}`).join(' / ')}:{ok:true,value:migrated.bundle}}catch(error){return{ok:false,value:clean,error:`JSON構文エラー: ${error instanceof Error?error.message:'不明なエラー'}`}}}
export function validateTaskCandidate(candidate:Task,current:Task[],config?:WorkspaceConfig):ValidationIssue[]{const tasks=current.some((task)=>task.id===candidate.id)?current.map((task)=>task.id===candidate.id?candidate:task):[candidate,...current];return validateBundle({...fallback(),tasks},config).filter((issue)=>issue.path.startsWith('tasks'))}
export const resetBundle=()=>saveBundle(fallback())
export const loadTasks=()=>readBundle().value.tasks
export const loadFlow=()=>readBundle().value.flow
export const loadAudit=()=>readBundle().value.audit
export const saveTasks=(tasks:Task[])=>saveBundle({...readBundle().value,tasks,exportedAt:now()})
export const saveFlow=(flow:FlowData)=>saveBundle({...readBundle().value,flow,exportedAt:now()})
export const saveAudit=(audit:AuditItem[])=>saveBundle({...readBundle().value,audit,exportedAt:now()})
export { organizationUnits }
export type { Edge,Node,Viewport }
