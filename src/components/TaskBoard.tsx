import { useRef } from 'react'
import { AlertTriangle, CalendarDays, Clock3, FileCheck2, Link2, Pencil, Plus, Search, Trash2, UserRound, UsersRound } from 'lucide-react'
import { organizationUnits, people, statuses, type Status, type Task } from '../types'
import { initialTasks } from '../data'

export type DueView=''|'soon'|'overdue'
type Props={tasks:Task[];view:'kanban'|'list';search:string;department:string;status:string;phase:string;person:string;dueView:DueView;groupByTeam:boolean;readOnly?:boolean;setSearch:(value:string)=>void;setDepartment:(value:string)=>void;setStatus:(value:string)=>void;setPhase:(value:string)=>void;setPerson:(value:string)=>void;setDueView:(value:DueView)=>void;onAdd:()=>void;onEdit:(task:Task)=>void;onResult?:(task:Task)=>void;onDelete:(task:Task)=>void;onStatus:(id:string,status:Status)=>void}
const today=()=>{const parts=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date()).filter((part)=>part.type!=='literal').map((part)=>[part.type,part.value]));return`${parts.year}-${parts.month}-${parts.day}`}
// eslint-disable-next-line react-refresh/only-export-components
export const deadlineState=(task:Task,reference=today())=>{
  const legacyOverdue=task.notes.some((note)=>note.includes('旧期限')&&note.includes('超過'))
  if(!task.deadlineDate)return {kind:'unknown' as const,label:task.deadline.includes('継続')?'継続 / 日付未確定':'日付未確定'}
  const days=Math.ceil((Date.parse(`${task.deadlineDate}T00:00:00+09:00`)-Date.parse(`${reference}T00:00:00+09:00`))/86_400_000)
  if(legacyOverdue)return {kind:'overdue' as const,label:`旧期限超過 / 改訂期限まで${days}日`,days}
  if(days<0)return {kind:'overdue' as const,label:`${Math.abs(days)}日超過`,days}
  if(days===0)return {kind:'today' as const,label:'本日期限',days}
  if(days<=7)return {kind:'soon' as const,label:`期限まで${days}日`,days}
  return {kind:'future' as const,label:`期限まで${days}日`,days}
}
const searchText=(task:Task)=>[task.id,task.title,task.team,task.owner,...task.assignees,task.deadline,task.status,task.urgency,...task.notes,task.reason??'',...(task.rationaleCodes??[]),...task.sourceRefs.map((source)=>`${source.sourceId}:${source.lineStart}-${source.lineEnd}`)].join(' ').toLowerCase()
const taskPeople=(task:Task)=>new Set(task.personKeys)
const isBlocked=(task:Task,tasks:Task[])=>task.dependencies.some((id)=>tasks.find((item)=>item.id===id)?.status!=='完了')
const authoritativeIds=new Set(initialTasks.map((task)=>task.id))

function StatusSelect({task,onStatus,readOnly}:{task:Task;onStatus:Props['onStatus'];readOnly?:boolean}){return <select className="status-select" id={`status-card-${task.id}`} aria-label={`${task.title}のステータス`} value={task.status} disabled={readOnly} onChange={(event)=>onStatus(task.id,event.target.value as Status)}>{statuses.map((value)=><option key={value}>{value}</option>)}</select>}
function TaskCard({task,tasks,phase5,onEdit,onResult,onDelete,onStatus,readOnly}:{task:Task;tasks:Task[];phase5:boolean;onEdit:Props['onEdit'];onResult:Props['onResult'];onDelete:Props['onDelete'];onStatus:Props['onStatus'];readOnly?:boolean}){
  const due=deadlineState(task),blocked=isBlocked(task,tasks)
  return <article className={`task-card urgency-${task.urgency} ${due.kind==='overdue'&&task.urgency==='高'?'critical-overdue':''} ${phase5?'phase5-check':''}`} data-task-id={task.id}>
    <div className="task-card-head"><span className="task-id">{task.id}</span><span className={`urgency-badge urgency-${task.urgency}`}>緊急度 {task.urgency}</span></div>
    <h3>{task.title}</h3>
    <p className="department-pill">{task.team}</p>
    <div className="task-meta"><span><UserRound size={15}/>責任者 <b>{task.owner}</b></span><span><UsersRound size={15}/>担当 {task.rawAssignees||'未割当'}</span></div>
    <div className={`deadline deadline-${due.kind}`}><CalendarDays size={15}/><span>{task.deadline}</span><b>{due.label}</b></div>
    {blocked&&<div className="blocked-label"><Link2 size={14}/>ブロック中：{task.dependencies.filter((id)=>tasks.find((item)=>item.id===id)?.status!=='完了').join('、')} 完了待ち</div>}
    {task.status==='保留'&&<div className="hold-reason"><Clock3 size={14}/><b>保留理由</b> {task.holdReason}</div>}
    {task.holdReason&&task.status!=='保留'&&<div className="hold-reason"><Clock3 size={14}/><b>解除条件</b> {task.holdReason}</div>}
    {task.notes.map((note)=><p className="task-note" key={note}><AlertTriangle size={14}/>{note}</p>)}
    {task.createdByDepartment&&<div className={`automation-note ${task.automationDisabled?'is-disabled':''}`}><b>全体進行管理部の提案 · {task.approvalState}</b><span>{task.reason}</span><span>成果物: {task.expectedDeliverable}</span>{task.automationDisabled&&<span>自動提案を無効化済み</span>}</div>}
    <div className="source-line">{task.sourceRefs.length?`出典 ${task.sourceRefs.map((source)=>`${source.sourceId}:${source.lineStart}-${source.lineEnd}`).join(', ')}`:`内部provenance ${task.provenance?.ruleId??'なし'}`}</div>
    <div className="card-actions"><StatusSelect task={task} onStatus={onStatus} readOnly={readOnly}/>{onResult&&<button onClick={()=>onResult(task)} aria-label={`${task.title}の成果シート`}><FileCheck2 size={16}/>成果シート</button>}<button disabled={readOnly} onClick={()=>onEdit(task)} aria-label={`${task.title}を編集`}><Pencil size={16}/>編集</button><button onClick={()=>onDelete(task)} aria-label={`${task.title}を削除`} disabled={readOnly||authoritativeIds.has(task.id)} title={authoritativeIds.has(task.id)?'S4正本タスクは削除できません':'削除'}><Trash2 size={16}/>削除</button></div>
  </article>
}

export function TaskBoard(props:Props){
  const phaseRefs=useRef<Array<HTMLButtonElement|null>>([]),query=props.search.trim().toLowerCase()
  const filtered=props.tasks.filter((task)=>{
    const due=deadlineState(task)
    return (!query||searchText(task).includes(query))&&(!props.department||task.teamId===props.department)&&(!props.status||task.status===props.status)&&(!props.phase||String(task.phase)===props.phase)&&(!props.person||taskPeople(task).has(props.person))&&(!props.dueView||(props.dueView==='overdue'?due.kind==='overdue':(typeof due.days==='number'&&due.days>=0&&due.days<=7)))
  }).sort((a,b)=>Number(deadlineState(b).kind==='overdue'&&b.urgency==='高')-Number(deadlineState(a).kind==='overdue'&&a.urgency==='高')||a.id.localeCompare(b.id))
  const phaseKeys=['','0','1','2','3','4','5','6'],phaseLabel=(value:string)=>value===''?'全体':`Phase ${value}`
  const onPhaseKey=(event:React.KeyboardEvent,index:number)=>{let next=index;if(event.key==='ArrowRight')next=(index+1)%phaseKeys.length;else if(event.key==='ArrowLeft')next=(index-1+phaseKeys.length)%phaseKeys.length;else if(event.key==='Home')next=0;else if(event.key==='End')next=phaseKeys.length-1;else return;event.preventDefault();props.setPhase(phaseKeys[next]);phaseRefs.current[next]?.focus()}
  const renderCards=(items:Task[])=>props.view==='kanban'?<div className={`task-grid ${props.phase==='5'?'phase5-grid':''}`}>{items.map((task)=><TaskCard key={task.id} task={task} tasks={props.tasks} phase5={task.phase===5} onEdit={props.onEdit} onResult={props.onResult} onDelete={props.onDelete} onStatus={props.onStatus} readOnly={props.readOnly}/>)}</div>:<div className="task-list">{items.map((task)=><TaskCard key={task.id} task={task} tasks={props.tasks} phase5={task.phase===5} onEdit={props.onEdit} onResult={props.onResult} onDelete={props.onDelete} onStatus={props.onStatus} readOnly={props.readOnly}/>)}</div>
  return <section aria-labelledby="tasks-title">
    <div className="phase-tabs" role="tablist" aria-label="Phaseフィルタ">{phaseKeys.map((value,index)=><button ref={(element)=>{phaseRefs.current[index]=element}} role="tab" aria-selected={props.phase===value} tabIndex={props.phase===value?0:-1} className={props.phase===value?'active':''} onKeyDown={(event)=>onPhaseKey(event,index)} onClick={()=>props.setPhase(value)} key={value||'all'}>{phaseLabel(value)}<small>{value===''?props.tasks.length:props.tasks.filter((task)=>String(task.phase)===value).length}</small></button>)}</div>
    <div className="section-heading"><div><span className="eyebrow">MISSION CONTROL</span><h2 id="tasks-title">タスク進行表</h2><p>{filtered.length} / {props.tasks.length} 件を表示</p></div><button className="button primary" disabled={props.readOnly} onClick={props.onAdd}><Plus size={17}/>新規タスク</button></div>
    <div className="person-filters" aria-label="担当者フィルタ">{people.map((person)=>{const related=props.tasks.filter((task)=>taskPeople(task).has(person)),high=related.filter((task)=>task.urgency==='高'&&task.status!=='完了').length;return <button key={person} aria-pressed={props.person===person} onClick={()=>props.setPerson(props.person===person?'':person)}><span>{person}</span><small><b>{high}</b> 高 / {related.length}件</small></button>})}</div>
    <div className="filters" role="search">
      <label className="search" htmlFor="task-search"><Search size={16}/><span className="sr-only">タスクを検索</span><input id="task-search" value={props.search} onChange={(event)=>props.setSearch(event.target.value)} placeholder="ID・タスク・担当・出典を検索"/></label>
      <select aria-label="チームで絞り込み" value={props.department} onChange={(event)=>props.setDepartment(event.target.value)}><option value="">13チームすべて</option>{organizationUnits.map((unit)=><option value={unit.id} key={unit.id}>{unit.name}</option>)}</select>
      <select aria-label="状態で絞り込み" value={props.status} onChange={(event)=>props.setStatus(event.target.value)}><option value="">状態すべて</option>{statuses.map((value)=><option key={value}>{value}</option>)}</select>
      <button aria-pressed={props.dueView==='soon'} onClick={()=>props.setDueView(props.dueView==='soon'?'':'soon')}><CalendarDays size={15}/>期限7日前</button>
      <button aria-pressed={props.dueView==='overdue'} onClick={()=>props.setDueView(props.dueView==='overdue'?'':'overdue')}><AlertTriangle size={15}/>期限超過</button>
    </div>
    {filtered.length===0?<div className="empty"><Search/><h3>該当するタスクがありません</h3></div>:props.groupByTeam?<div className="team-groups">{organizationUnits.map((unit)=>{const items=filtered.filter((task)=>task.teamId===unit.id);if(!items.length)return null;const remaining=items.filter((task)=>task.status!=='完了').length,high=items.filter((task)=>task.urgency==='高'&&task.status!=='完了').length;return <section key={unit.id} className="team-group" aria-labelledby={`team-${unit.id}`}><header><div><span className="eyebrow">TEAM</span><h3 id={`team-${unit.id}`}>{unit.name}</h3></div><p>責任者 <b>{unit.owner}</b> · 未完了 {remaining}件 · 高緊急 {high}件</p></header>{renderCards(items)}</section>})}</div>:renderCards(filtered)}
  </section>
}
