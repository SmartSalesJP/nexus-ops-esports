import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { CheckCircle2, ChevronDown, ChevronLeft, Clock3, FileCheck2, Flag, KeyRound, Link2, Play, UserRound } from 'lucide-react'
import { checklistProgress, isMilestoneChecklist } from '../checklistTemplates'
import { buildQuestOrder, jstDateKey, questAssigneeLabel, questComparisonReason, type QuestEntry } from '../questOrder'
import { statuses, type Status, type Task, type TaskResultSheet } from '../types'

type StatusChangeResult={ok:boolean;issues?:string[]}
type Props={tasks:Task[];taskResults?:TaskResultSheet[];readOnly?:boolean;busy?:boolean;onResult?:(task:Task)=>void;onStatus:(id:string,status:Status,holdReason?:string)=>Promise<StatusChangeResult>}

const meaningful=(value:string)=>value.replace(/[\s\u200b-\u200d\ufeff]/gu,'').length>0

function QuestStatus({task,readOnly,busy,onStatus,onConfirmed}:{task:Task;readOnly?:boolean;busy?:boolean;onStatus:Props['onStatus'];onConfirmed:(taskId:string,status:Status)=>void}){
  const [value,setValue]=useState(task.status),[pending,setPending]=useState(false),[holdOpen,setHoldOpen]=useState(false),[holdReason,setHoldReason]=useState(task.holdReason),[issues,setIssues]=useState<string[]>([]),[failureRequest,setFailureRequest]=useState<{sequence:number}|null>(null)
  const controlRef=useRef<HTMLSelectElement>(null),failureSequenceRef=useRef(0),handledFailureSequenceRef=useRef(0)
  useEffect(()=>{if(!pending)setValue(task.status)},[pending,task.status])
  useEffect(()=>{
    if(!failureRequest||handledFailureSequenceRef.current>=failureRequest.sequence||pending||busy||issues.length===0||value!==task.status)return
    const control=controlRef.current
    if(!control||control.disabled)return
    handledFailureSequenceRef.current=failureRequest.sequence
    control.focus()
    setFailureRequest((current)=>current?.sequence===failureRequest.sequence?null:current)
  },[busy,failureRequest,issues,pending,task.status,value])
  if(readOnly)return <span className="quest-status-readonly">状態 {task.status}</span>
  const save=async(next:Status,reason?:string)=>{setPending(true);setIssues([]);const result=reason===undefined?await onStatus(task.id,next):await onStatus(task.id,next,reason);setPending(false);if(result.ok){setValue(next);setHoldOpen(false);onConfirmed(task.id,next);return}failureSequenceRef.current+=1;setValue(task.status);setIssues(result.issues??['状態を保存できませんでした。']);setFailureRequest({sequence:failureSequenceRef.current})}
  const change=(next:Status)=>{if(next==='保留'){setHoldReason(task.holdReason);setHoldOpen(true);setIssues([]);return}void save(next)}
  return <div className="quest-status" aria-busy={pending}>
    <label htmlFor={`quest-status-${task.id}`}>状態</label><select ref={controlRef} id={`quest-status-${task.id}`} aria-label={`${task.title}の状態`} value={value} disabled={pending||busy} onChange={(event)=>change(event.target.value as Status)}>{statuses.map((status)=><option key={status}>{status}</option>)}</select>
    {pending&&<span role="status">保存中…</span>}
    {holdOpen&&<div className="quest-hold-editor"><label htmlFor={`quest-hold-${task.id}`}>保留理由 / 解除条件</label><textarea id={`quest-hold-${task.id}`} autoFocus maxLength={1000} value={holdReason} onChange={(event)=>setHoldReason(event.target.value)}/><div><button type="button" disabled={pending||!meaningful(holdReason)} onClick={()=>void save('保留',holdReason)}>理由と状態を保存</button><button type="button" disabled={pending} onClick={()=>{setHoldOpen(false);setValue(task.status);setIssues([])}}>取消</button></div></div>}
    {issues.length>0&&<div className="quest-save-error" role="alert">{issues[0]}</div>}
  </div>
}

function QuestCard({entry,rank,current=false,compact=false,comparison,readOnly,busy,onStatus,onResult,onConfirmed,result}:{entry:QuestEntry;rank?:number;current?:boolean;compact?:boolean;comparison?:string;readOnly?:boolean;busy?:boolean;onStatus:Props['onStatus'];onResult?:Props['onResult'];onConfirmed:(taskId:string,status:Status)=>void;result?:TaskResultSheet}){
  const task=entry.task,headingId=useId(),progress=checklistProgress(result?.checklistItems),milestone=isMilestoneChecklist(task),resultLabel=milestone?(result?.checklistItems===undefined?'チェックリストを作成':`チェックリスト ${progress.completed}/${progress.total}`):'成果シート',assigneeCount=entry.assigneeKeys.length,assigneeLabel=assigneeCount>1?`共同担当・${assigneeCount}名 ${task.rawAssignees}`:`担当 ${task.rawAssignees||'未割当'}`
  return <article className={`quest-card quest-${entry.bucket} ${current?'is-current':''} ${compact?'is-compact':''}`} data-task-id={task.id} {...(current?{'data-quest-now':'true'}:{})} tabIndex={-1} aria-current={current?'step':undefined} aria-labelledby={headingId}>
    <header><div>{rank!==undefined&&<span className="quest-rank">#{rank} {rank===1?'システム推奨':''}</span>}<span className={`urgency-badge urgency-${task.urgency}`}>緊急度 {task.urgency}</span></div><b className="task-id">{task.id}</b></header>
    <h3 id={headingId}>{task.title}</h3>
    <div className="quest-meta"><span><UserRound size={15}/>{assigneeLabel}</span><span>{task.team}</span><span>{entry.deadline.label}</span><span><Link2 size={14}/>{task.dependencies.length?`依存 ${task.dependencies.join('、')}`:'依存なし'}</span></div>
    {comparison&&<p className="quest-comparison">{comparison}</p>}
    {entry.reasonChips.length>0&&<div className="quest-reasons" aria-label="順位理由">{entry.reasonChips.map((reason)=><span key={reason}>{reason}</span>)}</div>}
    {entry.waitingReasons.length>0&&<ul className="quest-wait-reasons">{entry.waitingReasons.map((reason)=><li key={reason}><Link2 size={14}/>{reason}</li>)}</ul>}
    <details className="quest-explanation" aria-label={`${task.title}の順番の理由`}><summary><ChevronDown className="quest-chevron" size={16}/>この順番の理由</summary><p>{entry.bucket==='ready'?`期限帯、緊急度、状態、直接実行可能にする件数、期限日、Phase、IDの順で比較しています。${entry.unlockCount?`このタスクの完了で${entry.unlockCount}件を直接実行可能にします。`:'直接実行可能にする後続タスクはありません。'}`:`今やる候補から外し、解除条件をすべて表示しています。条件解消後に順位を再計算します。`}</p></details>
    <footer><QuestStatus task={task} readOnly={readOnly} busy={busy} onStatus={onStatus} onConfirmed={onConfirmed}/>{onResult&&<button type="button" className="button ghost" aria-label={`${task.title}の成果シート`} disabled={busy} onClick={()=>onResult(task)}><FileCheck2 size={16}/>{resultLabel}</button>}</footer>
  </article>
}

function useLiveJstDateKey(){
  const [key,setKey]=useState(()=>jstDateKey(new Date()))
  useEffect(()=>{let timer=0;const refresh=()=>{setKey(jstDateKey(new Date()));schedule()},schedule=()=>{clearTimeout(timer);const now=new Date(),today=jstDateKey(now),next=Date.parse(`${today}T00:00:00+09:00`)+86_400_000;timer=window.setTimeout(refresh,Math.max(25,next-now.getTime()+25))},visible=()=>{if(document.visibilityState==='visible')refresh()};schedule();document.addEventListener('visibilitychange',visible);return()=>{clearTimeout(timer);document.removeEventListener('visibilitychange',visible)}},[])
  return key
}

export function QuestBoard({tasks,taskResults=[],readOnly=false,busy=false,onResult,onStatus}:Props){
  const referenceKey=useLiveJstDateKey(),referenceDate=useMemo(()=>new Date(`${referenceKey}T12:00:00+09:00`),[referenceKey]),order=useMemo(()=>buildQuestOrder(tasks,referenceDate),[referenceDate,tasks])
  const [selected,setSelected]=useState<string|null>(null),[announcement,setAnnouncement]=useState(''),[focusRequest,setFocusRequest]=useState<{id:string;status:Status;sequence:number;previousNowId?:string}|null>(null),[nextLimit,setNextLimit]=useState(5),headingRef=useRef<HTMLHeadingElement>(null),boardRef=useRef<HTMLElement>(null),focusSequenceRef=useRef(0),handledFocusSequenceRef=useRef(0)
  const resultByTask=useMemo(()=>new Map(taskResults.map((result)=>[result.taskId,result])),[taskResults])
  const queuesByAssignee=useMemo(()=>{const queues=new Map<string,{ready:QuestEntry[];waiting:QuestEntry[];completed:QuestEntry[]}>();for(const key of order.assigneeKeys)queues.set(key,{ready:[],waiting:[],completed:[]});for(const bucket of ['ready','waiting','completed'] as const)for(const entry of order[bucket])for(const key of entry.assigneeKeys)queues.get(key)?.[bucket].push(entry);return queues},[order])
  const selectedQuests=selected?queuesByAssignee.get(selected)??null:null
  useEffect(()=>{
    if(!focusRequest||handledFocusSequenceRef.current>=focusRequest.sequence)return
    const changedTask=tasks.find((task)=>task.id===focusRequest.id)
    if(!changedTask||changedTask.status!==focusRequest.status)return
    const frame=requestAnimationFrame(()=>{
      if(handledFocusSequenceRef.current>=focusRequest.sequence)return
      handledFocusSequenceRef.current=focusRequest.sequence
      const root=boardRef.current,newNow=root?.querySelector<HTMLElement>('[data-quest-now="true"]'),newNowId=newNow?.dataset.taskId,rankChanged=focusRequest.previousNowId!==newNowId
      const original=[...(root?.querySelectorAll<HTMLElement>('.quest-card[data-task-id]')??[])].find((element)=>element.dataset.taskId===focusRequest.id&&!element.closest('details:not([open])'))
      const movedOutOfReady=focusRequest.id===focusRequest.previousNowId&&!selectedQuests?.ready.some((entry)=>entry.task.id===focusRequest.id)
      const target=focusRequest.status==='完了'||movedOutOfReady?newNow??headingRef.current:original??newNow??headingRef.current
      target?.focus()
      if(rankChanged)setAnnouncement(newNowId?`${focusRequest.id}を「${focusRequest.status}」に変更しました。次の「今やる」は${newNowId}です。`:`${focusRequest.id}を「${focusRequest.status}」に変更しました。今すぐ実行できるタスクはありません。`)
      else setAnnouncement('')
      setFocusRequest((current)=>current?.sequence===focusRequest.sequence?null:current)
    })
    return()=>cancelAnimationFrame(frame)
  },[focusRequest,selectedQuests,tasks])
  const confirmed=(id:string,status:Status)=>{focusSequenceRef.current+=1;setFocusRequest({id,status,sequence:focusSequenceRef.current,previousNowId:selectedQuests?.ready[0]?.task.id})}
  if(!selected)return <section ref={boardRef} className="quest-board" aria-labelledby="quest-overview-title">
    <div className="section-heading"><div><span className="eyebrow">QUEST ORDER / LIVE</span><h2 id="quest-overview-title">全担当者の次アクション</h2><p>保存済みの全タスクから、各担当者の「今やる」1件を表示します。</p></div></div>
    <p className="quest-rule-note"><Flag size={17}/><span>期限帯 → 緊急度 → 状態 → 直接解除件数 → 期限日 → Phase → IDで決定。責任者は担当者へ混ぜません。</span></p>
    <div className="quest-overview-grid">{order.assigneeKeys.map((key,index)=>{const quests=queuesByAssignee.get(key)!,next=quests.ready[0],label=questAssigneeLabel(key),allComplete=!next&&!quests.waiting.length&&quests.completed.length>0;return <article className={`quest-person-card ${allComplete?'is-complete':''}`} key={key}><header><div className="quest-person-avatar" aria-hidden="true">{label.slice(0,1)}</div><div><h3>{label}</h3><p>実行可能 {quests.ready.length} · 解除待ち {quests.waiting.length}</p></div></header>{next?<div className="quest-person-next"><span>#1 システム推奨</span><b>{next.task.id}</b><p>{next.task.title}</p><small>{next.deadline.label} · 緊急度 {next.task.urgency}</small></div>:quests.waiting.length?<div className="quest-person-empty is-locked"><KeyRound size={20}/><span>今すぐ着手できません</span></div>:<div className="quest-person-empty"><CheckCircle2 size={20}/><span>{allComplete?'担当タスクはすべて完了':'今やるタスクなし'}</span></div>}<button id={`quest-person-${index}`} type="button" className="button quest-person-open" onClick={()=>{setNextLimit(5);setAnnouncement('');setSelected(key)}} aria-label={label==='未割当'?'未割当の実行順を開く':`${label}さんの実行順を開く`}>{label==='未割当'?'未割当の実行順':'実行順を見る'}</button></article>})}</div>
  </section>
  const label=questAssigneeLabel(selected),ready=selectedQuests?.ready??[],waiting=selectedQuests?.waiting??[],completed=selectedQuests?.completed??[],now=ready[0],next=ready.slice(1)
  return <section ref={boardRef} className="quest-board quest-detail" aria-labelledby="quest-detail-title">
    <button type="button" className="button ghost quest-back" onClick={()=>{const index=order.assigneeKeys.indexOf(selected);setSelected(null);setFocusRequest(null);setAnnouncement('全担当者の次アクションへ戻りました。');requestAnimationFrame(()=>document.getElementById(`quest-person-${index}`)?.focus())}}><ChevronLeft size={17}/>全担当者へ戻る</button>
    <div className="section-heading"><div><span className="eyebrow">MY QUESTS</span><h2 id="quest-detail-title" ref={headingRef} tabIndex={-1}>{label}{label==='未割当'?'':'さん'}の実行順</h2><p>共同担当タスクは同じTask IDと共有状態で表示します。</p></div></div>
    <p className="sr-only" role="status" aria-live="polite">{announcement}</p>
    <section className="quest-now" aria-labelledby="quest-now-title"><h3 id="quest-now-title"><Play size={18}/>今やる</h3>{now?<QuestCard entry={now} rank={1} current comparison={questComparisonReason(now,next[0])} readOnly={readOnly} busy={busy} onStatus={onStatus} onResult={onResult} onConfirmed={confirmed} result={resultByTask.get(now.task.id)}/>:<div className="quest-empty">{waiting.length?<KeyRound/>:<CheckCircle2/>}<b>{waiting.length?'今すぐ着手できません':'今すぐ実行できるタスクはありません'}</b><span>{waiting.length?'解除待ちの条件を確認してください。':'担当タスクは完了済み、または未登録です。'}</span></div>}</section>
    <section className="quest-next" aria-labelledby="quest-next-title"><h3 id="quest-next-title"><Flag size={18}/>次にやる</h3>{next.length?<><ol start={2}>{next.slice(0,nextLimit).map((entry,index)=><li key={entry.task.id}><QuestCard entry={entry} rank={index+2} compact comparison={questComparisonReason(entry,next[index+1])} readOnly={readOnly} busy={busy} onStatus={onStatus} onResult={onResult} onConfirmed={confirmed} result={resultByTask.get(entry.task.id)}/></li>)}</ol>{next.length>nextLimit&&<button type="button" className="button ghost quest-load-more" onClick={()=>setNextLimit((value)=>Math.min(value+10,next.length))}>次の{Math.min(10,next.length-nextLimit)}件を表示（残り{next.length-nextLimit}件）</button>}</>:<p className="quest-section-empty">次の実行可能タスクはありません。</p>}</section>
    <section className="quest-waiting" aria-labelledby="quest-waiting-title"><h3 id="quest-waiting-title"><Clock3 size={18}/>解除待ち <span>{waiting.length}</span></h3>{waiting.length?<ol>{waiting.map((entry)=><li key={entry.task.id}><QuestCard entry={entry} readOnly={readOnly} busy={busy} onStatus={onStatus} onResult={onResult} onConfirmed={confirmed} result={resultByTask.get(entry.task.id)}/></li>)}</ol>:<p className="quest-section-empty">解除待ちはありません。</p>}</section>
    <details className="quest-completed"><summary><CheckCircle2 size={18}/>完了ログ <span>{completed.length}</span></summary>{completed.length?<ol>{completed.map((entry)=><li key={entry.task.id}><QuestCard entry={entry} readOnly={readOnly} busy={busy} onStatus={onStatus} onResult={onResult} onConfirmed={confirmed} result={resultByTask.get(entry.task.id)}/></li>)}</ol>:<p className="quest-section-empty">完了ログはありません。</p>}</details>
  </section>
}
