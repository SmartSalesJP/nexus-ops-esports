import type { Node } from '@xyflow/react'
import type { AuditItem, AutoTaskProvenance, CompletionHistory, ExportBundle, FlowData, KpiValue, Task, WeeklyRun, WeeklySnapshot, WeeklyState } from './types'

const DAY=86_400_000
const JST=9*60*60*1000
export const emptyWeeklyState=():WeeklyState=>({lastRun:null,runs:[],completions:{},tombstones:[]})

const dateOnlyJst=(date:Date)=>{const shifted=new Date(date.getTime()+JST);return {year:shifted.getUTCFullYear(),month:shifted.getUTCMonth()+1,day:shifted.getUTCDate()}}
const pad=(value:number)=>String(value).padStart(2,'0')
const ymd=(date:Date)=>`${date.getUTCFullYear()}-${pad(date.getUTCMonth()+1)}-${pad(date.getUTCDate())}`

export function isoWeekJst(date:Date){
  const part=dateOnlyJst(date),target=new Date(Date.UTC(part.year,part.month-1,part.day))
  target.setUTCDate(target.getUTCDate()+4-(target.getUTCDay()||7))
  const weekYear=target.getUTCFullYear(),yearStart=new Date(Date.UTC(weekYear,0,1))
  const week=Math.ceil((((target.getTime()-yearStart.getTime())/DAY)+1)/7)
  return {year:weekYear,week,runId:`weekly:${weekYear}-W${pad(week)}`}
}

export function weeklySchedule(date:Date){
  const part=dateOnlyJst(date),plain=new Date(Date.UTC(part.year,part.month-1,part.day)),weekday=plain.getUTCDay()||7
  plain.setUTCDate(plain.getUTCDate()-(weekday-1))
  const scheduledFor=`${ymd(plain)}T00:00:00+09:00`,next=new Date(plain);next.setUTCDate(next.getUTCDate()+7)
  return {...isoWeekJst(date),scheduledFor,nextScheduledFor:`${ymd(next)}T00:00:00+09:00`}
}

export function scheduledForRunId(runId:string){
  const match=/^weekly:(\d{4})-W(\d{2})$/.exec(runId);if(!match)return null
  const year=Number(match[1]),week=Number(match[2]),jan4=new Date(Date.UTC(year,0,4)),weekday=jan4.getUTCDay()||7,monday=new Date(jan4)
  monday.setUTCDate(jan4.getUTCDate()-(weekday-1)+(week-1)*7)
  const result=`${ymd(monday)}T00:00:00+09:00`
  return weeklySchedule(new Date(result)).runId===runId?result:null
}

const canonicalDependencies=(ids:readonly string[])=>Array.from(new Set(ids)).sort((a,b)=>a.localeCompare(b))
export function canonicalProvenance(value:AutoTaskProvenance):AutoTaskProvenance{return {ruleId:value.ruleId,...(value.sourceTaskId?{sourceTaskId:value.sourceTaskId}:{}),dependencyIds:canonicalDependencies(value.dependencyIds),...(value.kpiId?{kpiId:value.kpiId}:{})}}
export function canonicalFingerprint(value:AutoTaskProvenance){const provenance=canonicalProvenance(value);return`progress-control:${JSON.stringify({ruleId:provenance.ruleId,sourceTaskId:provenance.sourceTaskId??null,dependencyIds:provenance.dependencyIds,kpiId:provenance.kpiId??null})}`}
export function canonicalizeLegacyFingerprint(value:string){
  if(value.startsWith('progress-control:{'))return value
  const match=/^progress-control:([^:]+):([^:]*):([^:]*)$/.exec(value);if(!match)return value
  const sourceIds=match[2].split('+').filter(Boolean),ruleId=match[1],sourceTaskId=sourceIds[0],dependencyIds=ruleId==='dependency-readiness'?sourceIds.slice(1):[]
  return canonicalFingerprint({ruleId,...(sourceTaskId?{sourceTaskId}:{}),dependencyIds,...(match[3]?{kpiId:match[3] as KpiValue['id']}:{})})
}

export function normalizeAutoTask(task:Task){
  if(task.createdByDepartment!=='esports_progress_control')return {task,changed:false}
  const raw=task.provenance as unknown as {ruleId?:unknown;sourceTaskId?:unknown;dependencyIds?:unknown;sourceTaskIds?:unknown;kpiId?:unknown}
  if(typeof raw?.ruleId!=='string')return {task,changed:false}
  if(!Array.isArray(raw.sourceTaskIds)){const next=task.createdBy==='esports_progress_control'?task:{...task,createdBy:'esports_progress_control' as const};return{task:next,changed:next!==task}}
  const legacyIds=Array.isArray(raw.sourceTaskIds)?raw.sourceTaskIds.filter((id):id is string=>typeof id==='string'):[],sourceTaskId=typeof raw.sourceTaskId==='string'?raw.sourceTaskId:legacyIds[0]
  const dependencyIds=Array.isArray(raw.dependencyIds)?raw.dependencyIds.filter((id):id is string=>typeof id==='string'):raw.ruleId==='dependency-readiness'?legacyIds.slice(1):[]
  const provenance=canonicalProvenance({ruleId:raw.ruleId,...(sourceTaskId?{sourceTaskId}:{}),dependencyIds,...(typeof raw.kpiId==='string'?{kpiId:raw.kpiId as KpiValue['id']}:{})}),next={...task,createdBy:'esports_progress_control' as const,provenance,fingerprint:canonicalFingerprint(provenance)}
  return {task:next,changed:JSON.stringify(next)!==JSON.stringify(task)}
}

export function shouldCatchUp(weekly:WeeklyState,date:Date){return weeklySchedule(date).runId!==weekly.lastRun?.runId}

const phaseSnapshot=(tasks:Task[])=>Object.fromEntries([0,1,2,3,4,5,6].map((phase)=>{const items=tasks.filter((task)=>task.phase===phase&&!task.automationDisabled),completed=items.filter((task)=>task.status==='完了').length;return [String(phase),{completed,total:items.length,rate:Math.round(completed/Math.max(items.length,1)*100)}]}))
export function createWeeklySnapshot(tasks:Task[],kpis:KpiValue[]):WeeklySnapshot{
  const active=tasks.filter((task)=>!task.automationDisabled),completed=active.filter((task)=>task.status==='完了').length
  return {completed,total:active.length,phaseProgress:phaseSnapshot(active),highUrgencyRemaining:active.filter((task)=>task.urgency==='高'&&task.status!=='完了').length,blockers:active.filter((task)=>task.status!=='完了'&&task.dependencies.some((id)=>tasks.find((candidate)=>candidate.id===id)?.status!=='完了')).length,kpis:structuredClone(kpis)}
}

const completionNode=(history:CompletionHistory,task:Task,position:{x:number;y:number}):Node=>({
  id:`weekly-complete:${task.id}`,position,
  className:`weekly-sticky weekly-completion ${history.currentStatus==='完了'?'is-current':'is-reopened'}`,
  data:{weeklyKind:'completion',label:`${history.currentStatus==='完了'?'✓ 完了':'↺ 再オープン'} ${task.id}\n${task.title}\n完了日時: ${history.firstSeen}${history.basis==='inferred-from-updatedAt'?'（更新日時から推定）':''}\n週: ${history.completedWeek}\n担当: ${task.rawAssignees||task.owner}\nPhase ${task.phase}\n現在: ${history.currentStatus}`,taskIds:[task.id],taskId:task.id,firstSeen:history.firstSeen,lastConfirmed:history.lastConfirmed,completedWeek:history.completedWeek,basis:history.basis,currentStatus:history.currentStatus},
})

const managedPosition=(flow:FlowData,index:number)=>{const user=flow.nodes.filter((node)=>!String(node.id).startsWith('weekly-')),maxX=user.length?Math.max(...user.map((node)=>node.position.x)):0,minY=user.length?Math.min(...user.map((node)=>node.position.y)):0;return{x:maxX+360+(index%2)*300,y:minY+Math.floor(index/2)*230}}

export function syncTaskCompletion(flow:FlowData,weekly:WeeklyState,task:Task,at:string,basis:'status-change'|'inferred-from-updatedAt'='status-change',confirmedAt=at){
  const completions={...weekly.completions},existing=completions[task.id]
  if(task.status==='完了')completions[task.id]=existing?(existing.currentStatus==='完了'?existing:{...existing,lastConfirmed:confirmedAt,currentStatus:task.status}):{taskId:task.id,firstSeen:at,lastConfirmed:confirmedAt,completedWeek:isoWeekJst(new Date(at)).runId,basis,currentStatus:task.status}
  else if(existing)completions[task.id]=existing.currentStatus===task.status?existing:{...existing,currentStatus:task.status}
  const history=completions[task.id]
  if(!history)return {flow,weekly:{...weekly,completions},added:false}
  const id=`weekly-complete:${task.id}`,index=Object.keys(completions).sort().indexOf(task.id),found=flow.nodes.find((node)=>node.id===id),next=completionNode(history,task,found?.position??managedPosition(flow,index))
  const nodes=found?flow.nodes.map((node)=>node.id===id?{...next,position:node.position}:node):[...flow.nodes,next]
  return {flow:{...flow,nodes},weekly:{...weekly,completions},added:!found}
}

type Proposal=Pick<Task,'title'|'phase'|'teamId'|'team'|'rawTeam'|'owner'|'assignees'|'rawAssignees'|'personKeys'|'urgency'|'deadline'|'deadlineDate'|'dependencies'> & AutoTaskProvenance & {reason:string;expectedDeliverable:string;rationaleCodes:string[]}
const dueDays=(task:Task,scheduledFor:string)=>task.deadlineDate===undefined?null:Math.ceil((Date.parse(`${task.deadlineDate}T00:00:00+09:00`)-Date.parse(scheduledFor))/DAY)
const hasFollowup=(tasks:Task[],sourceId:string,pattern:RegExp)=>tasks.some((task)=>task.dependencies.includes(sourceId)&&pattern.test(task.title))

function proposalsFor(tasks:Task[],kpis:KpiValue[],scheduledFor:string):Proposal[]{
  const base=tasks.filter((task)=>!task.createdByDepartment&&!task.automationDisabled&&task.status!=='完了'),out:Proposal[]=[]
  for(const task of base){
    const unmet=canonicalDependencies(task.dependencies.filter((id)=>tasks.find((candidate)=>candidate.id===id)?.status!=='完了'))
    if(unmet.length&&!hasFollowup(tasks,task.id,/準備|依存|確認/))out.push({...task,ruleId:'dependency-readiness',sourceTaskId:task.id,dependencyIds:unmet,dependencies:[],reason:`${task.id} は未完了依存 ${unmet.join('、')} があり、準備・確認タスクが見当たりません。`,expectedDeliverable:'依存解消条件、担当、確認日時を記した準備メモ',rationaleCodes:['DEPENDENCY_UNMET_4'],title:`${task.id} 依存解消の準備・確認`,urgency:'高'})
    const days=dueDays(task,scheduledFor),deadlineScore=days!==null&&days>=0&&days<=7?3:0,urgencyScore=task.urgency==='高'?2:0
    if(deadlineScore+urgencyScore>=5&&!hasFollowup(tasks,task.id,/成果物|提出|完了確認|レビュー/))out.push({...task,ruleId:'deadline-deliverable-check',sourceTaskId:task.id,dependencyIds:[],dependencies:[task.id],reason:`${task.id} は期限7日以内かつ高緊急ですが、成果物・完了確認タスクが見当たりません。`,expectedDeliverable:'成果物の所在、受入条件、確認者、確認結果',rationaleCodes:['DEADLINE_7D_3','HIGH_URGENCY_2'],title:`${task.id} 成果物・完了確認`,urgency:'高'})
    const milestoneScore=days!==null&&days>=0&&days<=14?3:0,checklistMissing=!hasFollowup(tasks,task.id,/マイルストーン|チェックリスト/)
    if(milestoneScore+(checklistMissing?2:0)>=5&&checklistMissing)out.push({...task,ruleId:'milestone-checklist',sourceTaskId:task.id,dependencyIds:[],dependencies:[],reason:`${task.id} は14日以内のマイルストーン候補ですが、チェックリストが見当たりません。`,expectedDeliverable:'実施項目、受入条件、確認者を含むマイルストーンチェックリスト',rationaleCodes:['MILESTONE_14D_3','CHECKLIST_MISSING_2'],title:`${task.id} マイルストーンチェックリスト作成`})
  }
  for(const kpi of kpis.filter((item)=>item.actual===null||item.actual<item.target)){
    const missing=kpi.actual===null
    out.push({ruleId:`kpi-${missing?'missing':'below-target'}`,dependencyIds:[],kpiId:kpi.id,reason:missing?`${kpi.label} の実績が未入力です。原因は断定せず、計測と入力を確認します。`:`${kpi.label} の実績が目標値未満です。原因は断定せず、分析と対策案を確認します。`,expectedDeliverable:missing?'計測根拠付きKPI実績値':'差分分析と承認前の対策案',rationaleCodes:[missing?'KPI_ACTUAL_MISSING':'KPI_BELOW_TARGET'],title:missing?`KPI「${kpi.label}」実績の計測・入力確認`:`KPI「${kpi.label}」差分分析・対策案作成`,phase:(base.map((task)=>task.phase).sort()[0]??0),teamId:'ops-hq',team:'運営本部',rawTeam:'運営本部',owner:'鈴木',assignees:[],rawAssignees:'',personKeys:[],urgency:missing?'中':'高',deadline:'次回週次更新まで',dependencies:[]})
  }
  return out
}

function autoTasks(tasks:Task[],kpis:KpiValue[],runId:string,scheduledFor:string,ranAt:string,tombstones:string[]){
  const known=new Set(tasks.map((task)=>task.fingerprint).filter(Boolean)),blocked=new Set(tombstones),created:Task[]=[],reasons:string[]=[]
  const weekId=runId.replace(/^weekly:/,''),used=tasks.map((task)=>new RegExp(`^AUTO-${weekId}-(\\d{2})$`).exec(task.id)).filter(Boolean).map((match)=>Number(match?.[1])),start=Math.max(0,...used)
  proposalsFor(tasks,kpis,scheduledFor).forEach((proposal)=>{const provenance=canonicalProvenance(proposal),key=canonicalFingerprint(provenance);if(known.has(key)||blocked.has(key))return;const number=start+created.length+1,id=`AUTO-${weekId}-${pad(number)}`;created.push({id,title:proposal.title,phase:proposal.phase,teamId:proposal.teamId,team:proposal.team,rawTeam:proposal.rawTeam,owner:proposal.owner,assignees:proposal.assignees,rawAssignees:proposal.rawAssignees,personKeys:proposal.personKeys,urgency:proposal.urgency,deadline:proposal.deadline,deadlineDate:proposal.deadlineDate,status:'未着手',holdReason:'',dependencies:proposal.dependencies,notes:[],sourceRefs:[],updatedAt:ranAt,reason:proposal.reason,expectedDeliverable:proposal.expectedDeliverable,createdBy:'esports_progress_control',createdByDepartment:'esports_progress_control',createdRunId:runId,provenance,fingerprint:key,rationaleCodes:proposal.rationaleCodes,approvalState:'要確認',automationDisabled:false});known.add(key);reasons.push(proposal.reason)})
  return {tasks:[...tasks,...created],created,reasons}
}

const summaryNode=(run:WeeklyRun,position:{x:number;y:number}):Node=>({id:`weekly-summary:${run.runId}`,position,className:'weekly-sticky weekly-summary',data:{weeklyKind:'summary',runId:run.runId,scheduledFor:run.scheduledFor,snapshot:run.snapshot,taskIds:[],label:`週次サマリー ${run.runId.replace('weekly:','')}\n完了 ${run.snapshot.completed}/${run.snapshot.total}\n高緊急残 ${run.snapshot.highUrgencyRemaining} / blocker ${run.snapshot.blockers}\n自動追加 ${run.autoTaskCount}件\n未実行週 ${run.missedWeekCount}週`}})
const missedWeeks=(last:WeeklyRun|null,scheduledFor:string)=>last?Math.max(0,Math.round((Date.parse(scheduledFor)-Date.parse(last.scheduledFor))/(7*DAY))-1):0
const stableHash=(value:string)=>{let hash=2166136261;for(let index=0;index<value.length;index++){hash^=value.charCodeAt(index);hash=Math.imul(hash,16777619)}return(hash>>>0).toString(16).padStart(8,'0')}

export function runWeeklyBundle(bundle:ExportBundle,date:Date,trigger:WeeklyRun['trigger']):ExportBundle{
  const ranAt=date.toISOString(),schedule=weeklySchedule(date),existingRun=bundle.weekly.runs.find((item)=>item.runId===schedule.runId),generated=autoTasks(bundle.tasks,bundle.kpis,schedule.runId,schedule.scheduledFor,ranAt,bundle.weekly.tombstones)
  let flow=bundle.flow,weekly={...bundle.weekly,completions:{...bundle.weekly.completions}},addedStickyCount=0
  generated.tasks.forEach((task)=>{const normalized=task.status==='完了'&&!weekly.completions[task.id]?{...task,updatedAt:task.updatedAt||ranAt}:task,result=syncTaskCompletion(flow,weekly,normalized,normalized.updatedAt,'inferred-from-updatedAt',ranAt);flow=result.flow;weekly=result.weekly;if(result.added)addedStickyCount++})
  if(existingRun){
    let audit=bundle.audit
    if(generated.created.length){const fingerprints=generated.created.map((task)=>task.fingerprint??task.id).sort(),auditItem:AuditItem={id:`weekly-audit:${existingRun.runId}:delta:${stableHash(fingerprints.join('|'))}`,issueId:'OP-WEEKLY-RUN-DELTA',classification:'persistence',targetVersion:'0.4.0',files:['src/weekly.ts','src/App.tsx'],before:'同一週の固定snapshot',after:`追加自動task ${generated.created.length}件`,evidence:['固定snapshotを変更せず差分だけをschema v4 bundleへ保存'],retest:'週次差分実行時の全量検証',residualRisk:'自動提案は要確認',round:4,at:ranAt,action:'操作履歴 · 週次進行差分',detail:`${existingRun.runId}。${generated.reasons.join(' / ')}`};audit=[auditItem,...audit.filter((item)=>item.id!==auditItem.id)]}
    const candidate={...bundle,tasks:generated.tasks,flow,weekly:{...weekly,lastRun:bundle.weekly.lastRun,runs:bundle.weekly.runs},audit}
    return JSON.stringify(candidate)===JSON.stringify(bundle)?bundle:{...candidate,exportedAt:ranAt}
  }
  const snapshot=createWeeklySnapshot(bundle.tasks,bundle.kpis),run:WeeklyRun={runId:schedule.runId,scheduledFor:schedule.scheduledFor,ranAt,trigger,missedWeekCount:missedWeeks(weekly.lastRun,schedule.scheduledFor),addedStickyCount:addedStickyCount+Number(!flow.nodes.some((node)=>node.id===`weekly-summary:${schedule.runId}`)),autoTaskCount:generated.created.length,outcome:'success',reasons:generated.reasons,snapshot}
  const summaryId=`weekly-summary:${schedule.runId}`,found=flow.nodes.find((node)=>node.id===summaryId),node=summaryNode(run,found?.position??managedPosition(flow,Object.keys(weekly.completions).length));flow={...flow,nodes:found?flow.nodes.map((item)=>item.id===summaryId?{...node,position:item.position}:item):[...flow.nodes,node]}
  const runs=[...weekly.runs.filter((item)=>item.runId!==run.runId),run].sort((a,b)=>a.scheduledFor.localeCompare(b.scheduledFor)).slice(-104),keptRunIds=new Set(runs.map((item)=>item.runId));flow={...flow,nodes:flow.nodes.filter((item)=>!item.id.startsWith('weekly-summary:')||keptRunIds.has(item.id.slice('weekly-summary:'.length)))}
  weekly={...weekly,lastRun:run,runs}
  const auditItem:AuditItem={id:`weekly-audit:${run.runId}`,issueId:'OP-WEEKLY-RUN',classification:'persistence',targetVersion:'0.4.0',files:['src/weekly.ts','src/App.tsx'],before:existingRun?'同一週の既存bundle':'週次未実行bundle',after:`付箋追加 ${run.addedStickyCount}件 / 自動task ${run.autoTaskCount}件`,evidence:['schema v4全量validator通過後の単一bundle保存'],retest:'週次実行時の全量検証',residualRisk:'ブラウザ停止中の厳密00:00実行は保証せず、次回起動時に当週分をcatch-up',round:4,at:ranAt,action:'操作履歴 · 週次進行更新',detail:`${run.runId} (${trigger})。未実行週 ${run.missedWeekCount}。${run.reasons.join(' / ')||'新規提案なし'}`}
  return {...bundle,exportedAt:ranAt,tasks:generated.tasks,flow,weekly,audit:[auditItem,...bundle.audit.filter((item)=>item.id!==auditItem.id)]}
}
