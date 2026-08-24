import { people, type Task } from './types'

export const UNASSIGNED_QUEST_KEY='__unassigned__' as const
export type QuestBucket='ready'|'waiting'|'completed'
export type DeadlineBand='overdue'|'today'|'soon'|'future'|'unknown'

export interface QuestDeadlineState {
  kind:DeadlineBand
  label:string
  days?:number
}

export interface QuestEntry {
  task:Task
  bucket:QuestBucket
  assigneeKeys:string[]
  deadline:QuestDeadlineState
  unlockCount:number
  unmetDependencyIds:string[]
  missingDependencyIds:string[]
  cyclePath?:string[]
  waitingReasons:string[]
  reasonChips:string[]
}

export interface QuestOrder {
  assigneeKeys:string[]
  entries:QuestEntry[]
  ready:QuestEntry[]
  waiting:QuestEntry[]
  completed:QuestEntry[]
}

const DAY=86_400_000
const urgencyRank:Record<Task['urgency'],number>={高:0,中:1,低:2}
const statusRank:Record<Task['status'],number>={進行中:0,未着手:1,保留:2,完了:3}
const deadlineRank:Record<DeadlineBand,number>={overdue:0,today:1,soon:2,future:3,unknown:4}
const lexical=(a:string,b:string)=>a<b?-1:a>b?1:0

export function jstDateKey(date:Date):string{
  const parts=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(date).filter((part)=>part.type!=='literal').map((part)=>[part.type,part.value]))
  return`${parts.year}-${parts.month}-${parts.day}`
}

export function taskDeadlineState(task:Task,referenceDate:Date):QuestDeadlineState{
  const legacyOverdue=task.notes.some((note)=>note.includes('旧期限')&&note.includes('超過'))
  if(!task.deadlineDate)return{kind:'unknown',label:task.deadline.includes('継続')?'継続 / 日付未確定':'日付未確定'}
  const reference=jstDateKey(referenceDate),days=Math.ceil((Date.parse(`${task.deadlineDate}T00:00:00+09:00`)-Date.parse(`${reference}T00:00:00+09:00`))/DAY)
  if(legacyOverdue)return{kind:'overdue',label:`旧期限超過 / 改訂期限まで${days}日`,days}
  if(days<0)return{kind:'overdue',label:`${Math.abs(days)}日超過`,days}
  if(days===0)return{kind:'today',label:'本日期限',days}
  if(days<=7)return{kind:'soon',label:`期限まで${days}日`,days}
  return{kind:'future',label:`期限まで${days}日`,days}
}

const dynamicAssignee=(value:string)=>value.replace(/[（(][^）)]*[）)]/gu,'').replace(/※.*$/u,'').replace(/^[\s、,・]+|[\s、,・]+$/gu,'').trim()

export function questAssigneeKeys(task:Task):string[]{
  const keys:string[]=[],dynamic:string[]=[],seen=new Set<string>()
  for(const person of people)if(task.personKeys.includes(person)){seen.add(person);keys.push(person)}
  for(const raw of task.assignees){
    if(raw.includes('全員')||people.some((person)=>raw.includes(person)))continue
    const key=dynamicAssignee(raw)
    if(key&&!seen.has(key)){seen.add(key);dynamic.push(key)}
  }
  keys.push(...dynamic.sort(lexical))
  return keys.length?keys:[UNASSIGNED_QUEST_KEY]
}

export const questAssigneeLabel=(key:string)=>key===UNASSIGNED_QUEST_KEY?'未割当':key

function cyclePaths(tasks:Task[],included:Set<string>):Map<string,string[]>{
  const byId=new Map(tasks.map((task)=>[task.id,task])),color=new Map<string,0|1|2>(),cycles=new Map<string,string[]>()
  for(const start of [...included].sort(lexical)){
    if(color.get(start))continue
    const path:string[]=[],pathIndex=new Map<string,number>(),stack:Array<{id:string;next:number;dependencies:string[]}>=[]
    const enter=(id:string)=>{color.set(id,1);pathIndex.set(id,path.length);path.push(id);stack.push({id,next:0,dependencies:(byId.get(id)?.dependencies??[]).filter((dependency)=>included.has(dependency)).sort(lexical)})}
    enter(start)
    while(stack.length){
      const frame=stack[stack.length-1]
      if(frame.next>=frame.dependencies.length){stack.pop();pathIndex.delete(frame.id);path.pop();color.set(frame.id,2);continue}
      const dependency=frame.dependencies[frame.next++]
      const state=color.get(dependency)??0
      if(state===0){enter(dependency);continue}
      if(state===1){
        const index=pathIndex.get(dependency)
        if(index===undefined)continue
        const cycle=[...path.slice(index),dependency]
        for(const id of cycle.slice(0,-1))if(!cycles.has(id))cycles.set(id,cycle)
      }
    }
  }
  return cycles
}

function compareQuest(a:QuestEntry,b:QuestEntry):number{
  return deadlineRank[a.deadline.kind]-deadlineRank[b.deadline.kind]
    ||urgencyRank[a.task.urgency]-urgencyRank[b.task.urgency]
    ||statusRank[a.task.status]-statusRank[b.task.status]
    ||b.unlockCount-a.unlockCount
    ||lexical(a.task.deadlineDate??'9999-12-31',b.task.deadlineDate??'9999-12-31')
    ||a.task.phase-b.task.phase
    ||lexical(a.task.id,b.task.id)
}

export function questComparisonReason(higher:QuestEntry,lower?:QuestEntry):string{
  if(!lower)return'現在実行可能な唯一のタスク'
  const other=lower.task.id
  if(higher.deadline.kind!==lower.deadline.kind)return`${other}より期限帯が高い`
  if(higher.task.urgency!==lower.task.urgency)return`${other}より緊急度が高い`
  if(higher.task.status!==lower.task.status)return`${other}より進行状態が先行している`
  if(higher.unlockCount!==lower.unlockCount)return`${other}より直接実行可能にする件数が多い`
  if((higher.task.deadlineDate??'9999-12-31')!==(lower.task.deadlineDate??'9999-12-31'))return`${other}より期限日が早い`
  if(higher.task.phase!==lower.task.phase)return`${other}よりPhaseが早い`
  return`${other}と同条件のためID順で先`
}

const completedCompare=(a:QuestEntry,b:QuestEntry)=>{
  const left=Date.parse(a.task.updatedAt),right=Date.parse(b.task.updatedAt),leftTime=Number.isFinite(left)?left:Number.NEGATIVE_INFINITY,rightTime=Number.isFinite(right)?right:Number.NEGATIVE_INFINITY
  return rightTime-leftTime||lexical(a.task.id,b.task.id)
}

export function buildQuestOrder(tasks:readonly Task[],referenceDate:Date):QuestOrder{
  const eligible=[...tasks],byId=new Map(eligible.map((task)=>[task.id,task])),active=eligible.filter((task)=>task.status!=='完了'),activeIds=new Set(active.map((task)=>task.id)),cycles=cyclePaths(active,activeIds)
  const unmetById=new Map<string,string[]>(),missingById=new Map<string,string[]>()
  for(const task of active){
    const unmet:string[]=[],missing:string[]=[]
    for(const dependencyId of task.dependencies){const dependency=byId.get(dependencyId);if(!dependency)missing.push(dependencyId);else if(dependency.status!=='完了')unmet.push(dependencyId)}
    unmetById.set(task.id,unmet);missingById.set(task.id,missing)
  }
  const unlockCounts=new Map<string,number>()
  for(const task of active){
    if(task.status==='保留'||cycles.has(task.id)||(missingById.get(task.id)?.length??0)>0)continue
    const unmet=unmetById.get(task.id)??[]
    if(unmet.length===1){const dependencyId=unmet[0];unlockCounts.set(dependencyId,(unlockCounts.get(dependencyId)??0)+1)}
  }
  const entries:QuestEntry[]=eligible.map((task)=>{
    const assigneeKeys=questAssigneeKeys(task),deadline=taskDeadlineState(task,referenceDate),unmetDependencyIds=unmetById.get(task.id)??[],missingDependencyIds=missingById.get(task.id)??[],cyclePath=cycles.get(task.id),unlockCount=unlockCounts.get(task.id)??0
    if(task.status==='完了')return{task,bucket:'completed' as const,assigneeKeys,deadline,unlockCount:0,unmetDependencyIds:[],missingDependencyIds:[],waitingReasons:[],reasonChips:['完了',`更新 ${task.updatedAt}`]}
    const waitingReasons:string[]=[]
    if(task.status==='保留')waitingReasons.push(`保留: ${task.holdReason||'解除条件が未入力です'}`)
    for(const dependencyId of unmetDependencyIds){const dependency=byId.get(dependencyId);waitingReasons.push(`${dependencyId} ${dependency?.title??'不明なタスク'} の完了待ち`)}
    for(const dependencyId of missingDependencyIds)waitingReasons.push(`欠落依存 ${dependencyId}: タスクが存在しません`)
    if(cyclePath)waitingReasons.push(`循環依存: ${cyclePath.join(' → ')}`)
    const bucket:QuestBucket=waitingReasons.length?'waiting':'ready',reasonChips=[`緊急度 ${task.urgency}`,task.status,...(unlockCount?[`${unlockCount}件を直接実行可能にする`]:[]),`Phase ${task.phase}`].slice(0,4)
    return{task,bucket,assigneeKeys,deadline,unlockCount,unmetDependencyIds,missingDependencyIds,...(cyclePath?{cyclePath}:{}),waitingReasons,reasonChips}
  })
  const ready=entries.filter((entry)=>entry.bucket==='ready').sort(compareQuest),waiting=entries.filter((entry)=>entry.bucket==='waiting').sort(compareQuest),completed=entries.filter((entry)=>entry.bucket==='completed').sort(completedCompare)
  const dynamic=new Set<string>()
  for(const entry of entries)for(const key of entry.assigneeKeys)if(key!==UNASSIGNED_QUEST_KEY&&!people.includes(key as never))dynamic.add(key)
  const assigneeKeys=[...people,...[...dynamic].sort(lexical),UNASSIGNED_QUEST_KEY]
  return{assigneeKeys,entries:[...ready,...waiting,...completed],ready,waiting,completed}
}

export function questsForAssignee(order:QuestOrder,assigneeKey:string){
  const includes=(entry:QuestEntry)=>entry.assigneeKeys.includes(assigneeKey)
  return{ready:order.ready.filter(includes),waiting:order.waiting.filter(includes),completed:order.completed.filter(includes)}
}
