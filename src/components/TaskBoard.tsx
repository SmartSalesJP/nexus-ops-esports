import { useEffect, useRef, useState } from 'react'
import { AlertTriangle, CalendarDays, Clock3, FileCheck2, Link2, Plus, RotateCcw, Save, Search, Trash2, UserRound, UsersRound } from 'lucide-react'
import { departmentName, organizationUnits, people, statuses, urgencies, type Status, type Task, type ValidationIssue } from '../types'
import { initialTasks } from '../data'
import { checklistProgress, isMilestoneChecklist, milestoneCompletionIssues } from '../checklistTemplates'
import type { TaskResultSheet } from '../types'
import { personKeysFor } from '../planData'

export type DueView=''|'soon'|'overdue'
type StatusChangeResult={ok:boolean;issues?:string[]}
type Props={tasks:Task[];taskResults?:TaskResultSheet[];view:'kanban'|'list';search:string;department:string;status:string;phase:string;person:string;dueView:DueView;groupByTeam:boolean;readOnly?:boolean;busy?:boolean;setSearch:(value:string)=>void;setDepartment:(value:string)=>void;setStatus:(value:string)=>void;setPhase:(value:string)=>void;setPerson:(value:string)=>void;setDueView:(value:DueView)=>void;onAdd:()=>void;onSave?:(task:Task)=>Promise<ValidationIssue[]>;onDirty?:(dirty:boolean)=>void;onResult?:(task:Task)=>void;onDelete:(task:Task)=>void;onStatus:(id:string,status:Status,holdReason?:string)=>Promise<StatusChangeResult>}
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
const meaningful=(value:string)=>value.replace(/[\s\u200b-\u200d\ufeff]/gu,'').length>0
const inlineTriggerId=(taskId:string,field:string)=>`task-inline-trigger-${taskId}-${field}`

function StatusSelect({task,onStatus,disabled,describedBy,onResult}:{task:Task;onStatus:Props['onStatus'];disabled?:boolean;describedBy?:string;onResult?:()=>void}){
  const [value,setValue]=useState<Status>(task.status),[pending,setPending]=useState(false),[holdOpen,setHoldOpen]=useState(false),[holdReason,setHoldReason]=useState(task.holdReason),[issues,setIssues]=useState<string[]>([])
  useEffect(()=>{if(!pending)setValue(task.status)},[pending,task.status])
  const save=async(next:Status,reason?:string)=>{setPending(true);setIssues([]);const result=reason===undefined?await onStatus(task.id,next):await onStatus(task.id,next,reason);setPending(false);if(result?.ok){setValue(next);setHoldOpen(false);return true}setValue(task.status);if(result)setIssues(result.issues??['状態を保存できませんでした。']);return false}
  const change=(next:Status)=>{if(next==='保留'){setHoldReason(task.holdReason);setHoldOpen(true);setIssues([]);return}void save(next)}
  return <div className="status-control" aria-busy={pending}>
    <select className="status-select" id={`status-card-${task.id}`} aria-label={`${task.title}のステータス`} aria-describedby={[describedBy,issues.length?`status-error-${task.id}`:undefined].filter(Boolean).join(' ')||undefined} value={value} disabled={disabled||pending} onChange={(event)=>change(event.target.value as Status)}>{statuses.map((item)=><option key={item}>{item}</option>)}</select>
    {pending&&<span className="inline-save-state" role="status">保存中…</span>}
    {holdOpen&&<div className="inline-hold-editor"><label htmlFor={`status-hold-${task.id}`}>保留理由</label><textarea id={`status-hold-${task.id}`} autoFocus maxLength={1000} value={holdReason} onChange={(event)=>setHoldReason(event.target.value)}/><div className="form-actions"><button type="button" disabled={pending||!meaningful(holdReason)} onClick={()=>void save('保留',holdReason)}>理由と状態を保存</button><button type="button" disabled={pending} onClick={()=>{setHoldOpen(false);setValue(task.status);setIssues([])}}>取消</button></div></div>}
    {issues.length>0&&<div className="inline-status-error" id={`status-error-${task.id}`} role="alert"><span>{issues[0]}</span>{onResult&&issues.some((issue)=>issue.includes('チェック')||issue.includes('確認')||issue.includes('証跡')||issue.includes('項目'))&&<button type="button" onClick={onResult}>不足項目を確認</button>}</div>}
  </div>
}

const fieldReset=(draft:Task,baseline:Task,name:string):Task=>{
  if(name==='teamId')return{...draft,teamId:baseline.teamId,team:baseline.team,rawTeam:baseline.rawTeam,owner:baseline.owner}
  if(name==='rawAssignees')return{...draft,rawAssignees:baseline.rawAssignees,assignees:baseline.assignees,personKeys:baseline.personKeys}
  if(name==='dependencies'||name==='notes')return{...draft,[name]:baseline[name]}
  if(Object.hasOwn(baseline,name))return{...draft,[name]:baseline[name as keyof Task]}
  return draft
}

function InlineTaskEditor({draft,baseline,focusField,saving,onChange,onSave,onDiscard}:{draft:Task;baseline:Task;focusField:string;saving:boolean;onChange:(task:Task)=>void;onSave:()=>Promise<ValidationIssue[]>;onDiscard:()=>void}){
  const formRef=useRef<HTMLFormElement>(null),saveButtonRef=useRef<HTMLButtonElement>(null),restoreFailureFocus=useRef(false),[issues,setIssues]=useState<ValidationIssue[]>([])
  useEffect(()=>{const field=formRef.current?.elements.namedItem(focusField);if(field instanceof HTMLElement)field.focus()},[focusField])
  useEffect(()=>{if(saving||!restoreFailureFocus.current)return;const frame=requestAnimationFrame(()=>{saveButtonRef.current?.focus();restoreFailureFocus.current=false});return()=>cancelAnimationFrame(frame)},[issues,saving])
  const set=<K extends keyof Task>(key:K,value:Task[K])=>onChange({...draft,[key]:value})
  const submit=async(event?:React.FormEvent)=>{event?.preventDefault();setIssues([]);const next=await onSave();restoreFailureFocus.current=next.length>0;setIssues(next)}
  const keyDown=(event:React.KeyboardEvent<HTMLFormElement>)=>{const field=event.target;if(!(field instanceof HTMLInputElement||field instanceof HTMLTextAreaElement||field instanceof HTMLSelectElement)||event.nativeEvent.isComposing||event.keyCode===229)return;if(event.key==='Escape'){event.preventDefault();onChange(fieldReset(draft,baseline,field.name));return}if(event.key==='Enter'&&field instanceof HTMLInputElement&&!event.ctrlKey&&!event.metaKey){event.preventDefault();formRef.current?.requestSubmit();return}if(event.key==='Enter'&&(event.ctrlKey||event.metaKey)){event.preventDefault();formRef.current?.requestSubmit()}}
  return <form ref={formRef} className="inline-task-form" aria-busy={saving} onSubmit={submit} onKeyDown={keyDown}>
    <fieldset className="inline-task-fields" disabled={saving}><legend className="sr-only">タスク編集項目</legend>
    <label>タスク名<textarea name="title" required rows={2} value={draft.title} onChange={(event)=>set('title',event.target.value)}/></label>
    <div className="inline-task-grid"><label>担当チーム<select name="teamId" value={draft.teamId} onChange={(event)=>{const teamId=event.target.value as Task['teamId'],team=departmentName(teamId);if(team)onChange({...draft,teamId,team,rawTeam:team,owner:organizationUnits.find((unit)=>unit.id===teamId)?.owner??draft.owner})}}>{organizationUnits.map((unit)=><option key={unit.id} value={unit.id}>{unit.name}</option>)}</select></label><label>責任者<input name="owner" required value={draft.owner} onChange={(event)=>set('owner',event.target.value)}/></label><label>担当者<input name="rawAssignees" value={draft.rawAssignees} onChange={(event)=>{const rawAssignees=event.target.value;onChange({...draft,rawAssignees,assignees:rawAssignees.split(/[、,]/).map((value)=>value.trim()).filter(Boolean),personKeys:personKeysFor(rawAssignees)})}}/></label><label>緊急度<select name="urgency" value={draft.urgency} onChange={(event)=>set('urgency',event.target.value as Task['urgency'])}>{urgencies.map((urgency)=><option key={urgency}>{urgency}</option>)}</select></label><label>期限<input name="deadline" value={draft.deadline} onChange={(event)=>set('deadline',event.target.value)}/></label><label>判定日<input name="deadlineDate" type="date" value={draft.deadlineDate??''} onChange={(event)=>set('deadlineDate',event.target.value||undefined)}/></label></div>
    <label>保留理由 / 解除条件<textarea name="holdReason" rows={2} value={draft.holdReason} onChange={(event)=>set('holdReason',event.target.value)}/></label>
    <label>依存タスクID<input name="dependencies" value={draft.dependencies.join('、')} onChange={(event)=>set('dependencies',event.target.value.split(/[、,]/).map((value)=>value.trim()).filter(Boolean))}/></label>
    <label>注意事項<textarea name="notes" rows={2} value={draft.notes.join('\n')} onChange={(event)=>set('notes',event.target.value.split('\n').map((value)=>value.trim()).filter(Boolean))}/></label>
    </fieldset>
    {issues.length>0&&<div className="form-errors" role="alert"><b>保存できません</b><ul>{issues.slice(0,5).map((issue)=><li key={`${issue.path}-${issue.message}`}>{issue.message}</li>)}</ul></div>}
    <div className="inline-task-actions"><button ref={saveButtonRef} className="button primary" type="submit" disabled={saving}><Save size={16}/>{saving?'保存中…':'変更を保存'}</button><button className="button ghost" type="button" disabled={saving} onClick={onDiscard}><RotateCcw size={16}/>変更を破棄</button>{saving&&<span className="inline-save-state" role="status">タスクを保存中です。編集欄は一時的に無効です。</span>}<span>単一行はEnter、全体はCtrl/Cmd+Enterで保存。Escapeで現在欄を取消。</span></div>
  </form>
}

function TaskCard({task,tasks,result,phase5,editing,draft,baseline,focusField,saving,textDirty,onStartEdit,onDraft,onSave,onDiscard,onResult,onDelete,onStatus,readOnly}:{task:Task;tasks:Task[];result?:TaskResultSheet;phase5:boolean;editing:boolean;draft?:Task;baseline?:Task;focusField:string;saving:boolean;textDirty:boolean;onStartEdit:(field:string)=>void;onDraft:(task:Task)=>void;onSave:()=>Promise<ValidationIssue[]>;onDiscard:()=>void;onResult:Props['onResult'];onDelete:Props['onDelete'];onStatus:Props['onStatus'];readOnly?:boolean}){
  const due=deadlineState(task),blocked=isBlocked(task,tasks),milestone=isMilestoneChecklist(task),progress=checklistProgress(result?.checklistItems),completionIssues=milestoneCompletionIssues(task,result),completionWarningId=completionIssues.length?`milestone-completion-${task.id}`:undefined,resultLabel=milestone?(result?.checklistItems===undefined?'チェックリストを作成':progress.total===0?'チェック項目を追加':`チェックリスト ${progress.completed}/${progress.total}`):'成果シート'
  const trigger=(field:string,label:string,content:React.ReactNode)=><button id={inlineTriggerId(task.id,field)} type="button" className="inline-edit-trigger" disabled={readOnly} onClick={()=>onStartEdit(field)} aria-label={`${label}を直接編集`}>{content}</button>
  return <article className={`task-card urgency-${task.urgency} ${due.kind==='overdue'&&task.urgency==='高'?'critical-overdue':''} ${phase5?'phase5-check':''}`} data-task-id={task.id}>
    <div className="task-card-head"><span className="task-id">{task.id}</span><span className={`urgency-badge urgency-${task.urgency}`}>緊急度 {task.urgency}</span></div>
    {editing&&draft&&baseline?<InlineTaskEditor draft={draft} baseline={baseline} focusField={focusField} saving={saving} onChange={onDraft} onSave={onSave} onDiscard={onDiscard}/>:<><h3>{readOnly?task.title:trigger('title','タスク名',task.title)}</h3><p className="department-pill">{readOnly?task.team:trigger('teamId','担当チーム',task.team)}</p><div className="task-meta"><span><UserRound size={15}/>責任者 <b>{readOnly?task.owner:trigger('owner','責任者',task.owner)}</b></span><span><UsersRound size={15}/>担当 {readOnly?(task.rawAssignees||'未割当'):trigger('rawAssignees','担当者',task.rawAssignees||'未割当')}</span></div><div className={`deadline deadline-${due.kind}`}><CalendarDays size={15}/><span>{readOnly?task.deadline:trigger('deadline','期限',task.deadline||'未入力')}</span><b>{due.label}</b></div></>}
    {blocked&&<div className="blocked-label"><Link2 size={14}/>ブロック中：{task.dependencies.filter((id)=>tasks.find((item)=>item.id===id)?.status!=='完了').join('、')} 完了待ち</div>}
    {task.status==='保留'&&<div className="hold-reason"><Clock3 size={14}/><b>保留理由</b> {task.holdReason}</div>}
    {task.holdReason&&task.status!=='保留'&&<div className="hold-reason"><Clock3 size={14}/><b>解除条件</b> {task.holdReason}</div>}
    {task.notes.map((note)=><p className="task-note" key={note}><AlertTriangle size={14}/>{note}</p>)}
    {task.createdByDepartment&&<div className={`automation-note ${task.automationDisabled?'is-disabled':''}`}><b>全体進行管理部の提案 · {task.approvalState}</b><span>{task.reason}</span><span>成果物: {task.expectedDeliverable}</span>{task.automationDisabled&&<span>自動提案を無効化済み</span>}</div>}
    <div className="source-line">{task.sourceRefs.length?`出典 ${task.sourceRefs.map((source)=>`${source.sourceId}:${source.lineStart}-${source.lineEnd}`).join(', ')}`:`内部provenance ${task.provenance?.ruleId??'なし'}`}</div>
    {completionWarningId&&<div id={completionWarningId} className={`milestone-completion-warning ${task.status==='完了'?'is-invalid-complete':''}`}><AlertTriangle size={14}/><span><b>{task.status==='完了'?'完了状態とチェックリストが不整合です。':'完了にはチェックリストの確認が必要です。'}</b> {completionIssues[0]}</span>{onResult&&<button type="button" onClick={()=>onResult(task)}>不足項目を確認</button>}</div>}
    <div className="card-actions"><StatusSelect task={task} onStatus={onStatus} disabled={readOnly||textDirty} describedBy={completionWarningId} onResult={onResult?()=>onResult(task):undefined}/>{onResult&&<button onClick={()=>onResult(task)} aria-label={`${task.title}の${resultLabel}`}><FileCheck2 size={16}/>{resultLabel}</button>}<button onClick={()=>onDelete(task)} aria-label={`${task.title}を削除`} disabled={readOnly||textDirty||authoritativeIds.has(task.id)} title={authoritativeIds.has(task.id)?'S4正本タスクは削除できません':'削除'}><Trash2 size={16}/>削除</button></div>
  </article>
}

export function TaskBoard(props:Props){
  const {onDirty}=props,phaseRefs=useRef<Array<HTMLButtonElement|null>>([]),searchRef=useRef<HTMLInputElement>(null),headingRef=useRef<HTMLHeadingElement>(null),restoreTriggerFocus=useRef<{taskId:string;field:string;filteredOut:boolean}|null>(null),query=props.search.trim().toLowerCase(),[session,setSession]=useState<{taskId:string;baseline:Task;draft:Task;focusField:string}|null>(null),[saving,setSaving]=useState(false),[focusNotice,setFocusNotice]=useState('')
  const textDirty=!!session&&JSON.stringify(session.draft)!==JSON.stringify(session.baseline)
  const matchesCurrentFilters=(task:Task)=>{const due=deadlineState(task);return(!query||searchText(task).includes(query))&&(!props.department||task.teamId===props.department)&&(!props.status||task.status===props.status)&&(!props.phase||String(task.phase)===props.phase)&&(!props.person||taskPeople(task).has(props.person))&&(!props.dueView||(props.dueView==='overdue'?due.kind==='overdue':typeof due.days==='number'&&due.days>=0&&due.days<=7))}
  useEffect(()=>{onDirty?.(textDirty)},[onDirty,textDirty])
  useEffect(()=>{if(session||!restoreTriggerFocus.current)return;const target=restoreTriggerFocus.current,frame=requestAnimationFrame(()=>{const trigger=target.filteredOut?null:document.getElementById(inlineTriggerId(target.taskId,target.field));if(trigger)trigger.focus();else{(searchRef.current??headingRef.current)?.focus();setFocusNotice('保存したタスクは現在の絞り込み条件に一致しなくなりました。')}restoreTriggerFocus.current=null});return()=>cancelAnimationFrame(frame)},[session])
  useEffect(()=>{if(!session||textDirty)return;const current=props.tasks.find((task)=>task.id===session.taskId);if(current&&JSON.stringify(current)!==JSON.stringify(session.baseline))setSession({...session,baseline:structuredClone(current),draft:structuredClone(current)})},[props.tasks,session,textDirty])
  const startEdit=(task:Task,focusField:string)=>{if(props.readOnly)return;if(session&&session.taskId!==task.id&&textDirty)return;setFocusNotice('');setSession(session?.taskId===task.id?{...session,focusField}:{taskId:task.id,baseline:structuredClone(task),draft:structuredClone(task),focusField})}
  const save=async()=>{if(!session||saving)return[{path:'save',message:'保存処理中です'}];if(!props.onSave)return[{path:'save',message:'保存処理が利用できません'}];setSaving(true);try{const candidate={...session.draft,updatedAt:new Date().toISOString()},issues=await props.onSave(candidate);if(!issues.length){restoreTriggerFocus.current={taskId:session.taskId,field:session.focusField,filteredOut:!matchesCurrentFilters(candidate)};setSession(null)}return issues}finally{setSaving(false)}}
  const discard=()=>{setSession(null);onDirty?.(false)}
  const filtered=props.tasks.filter(matchesCurrentFilters).sort((a,b)=>Number(deadlineState(b).kind==='overdue'&&b.urgency==='高')-Number(deadlineState(a).kind==='overdue'&&a.urgency==='高')||a.id.localeCompare(b.id))
  const phaseKeys=['','0','1','2','3','4','5','6'],phaseLabel=(value:string)=>value===''?'全体':`Phase ${value}`
  const onPhaseKey=(event:React.KeyboardEvent,index:number)=>{let next=index;if(event.key==='ArrowRight')next=(index+1)%phaseKeys.length;else if(event.key==='ArrowLeft')next=(index-1+phaseKeys.length)%phaseKeys.length;else if(event.key==='Home')next=0;else if(event.key==='End')next=phaseKeys.length-1;else return;event.preventDefault();props.setPhase(phaseKeys[next]);phaseRefs.current[next]?.focus()}
  const renderCard=(task:Task)=><TaskCard key={task.id} task={task} tasks={props.tasks} result={props.taskResults?.find((item)=>item.taskId===task.id)} phase5={task.phase===5} editing={session?.taskId===task.id} draft={session?.taskId===task.id?session.draft:undefined} baseline={session?.taskId===task.id?session.baseline:undefined} focusField={session?.focusField??''} saving={saving} textDirty={textDirty} onStartEdit={(field)=>startEdit(task,field)} onDraft={(draft)=>setSession((current)=>current&&current.taskId===task.id?{...current,draft}:current)} onSave={save} onDiscard={discard} onResult={props.onResult} onDelete={props.onDelete} onStatus={props.onStatus} readOnly={props.readOnly}/>
  const renderCards=(items:Task[])=>props.view==='kanban'?<div className={`task-grid ${props.phase==='5'?'phase5-grid':''}`}>{items.map(renderCard)}</div>:<div className="task-list">{items.map(renderCard)}</div>
  return <section aria-labelledby="tasks-title">
    <div className="phase-tabs" role="tablist" aria-label="Phaseフィルタ">{phaseKeys.map((value,index)=><button ref={(element)=>{phaseRefs.current[index]=element}} role="tab" aria-selected={props.phase===value} tabIndex={props.phase===value?0:-1} className={props.phase===value?'active':''} onKeyDown={(event)=>onPhaseKey(event,index)} onClick={()=>props.setPhase(value)} key={value||'all'}>{phaseLabel(value)}<small>{value===''?props.tasks.length:props.tasks.filter((task)=>String(task.phase)===value).length}</small></button>)}</div>
    <div className="section-heading"><div><span className="eyebrow">MISSION CONTROL</span><h2 id="tasks-title" ref={headingRef} tabIndex={-1}>タスク進行表</h2><p>{filtered.length} / {props.tasks.length} 件を表示</p></div><button className="button primary" disabled={props.readOnly} onClick={props.onAdd}><Plus size={17}/>新規タスク</button></div>
    {focusNotice&&<p className="inline-filter-notice" role="status" aria-live="polite">{focusNotice}</p>}
    <div className="person-filters" aria-label="担当者フィルタ">{people.map((person)=>{const related=props.tasks.filter((task)=>taskPeople(task).has(person)),high=related.filter((task)=>task.urgency==='高'&&task.status!=='完了').length;return <button key={person} aria-pressed={props.person===person} onClick={()=>props.setPerson(props.person===person?'':person)}><span>{person}</span><small><b>{high}</b> 高 / {related.length}件</small></button>})}</div>
    <div className="filters" role="search">
      <label className="search" htmlFor="task-search"><Search size={16}/><span className="sr-only">タスクを検索</span><input ref={searchRef} id="task-search" value={props.search} onChange={(event)=>props.setSearch(event.target.value)} placeholder="ID・タスク・担当・出典を検索"/></label>
      <select aria-label="チームで絞り込み" value={props.department} onChange={(event)=>props.setDepartment(event.target.value)}><option value="">13チームすべて</option>{organizationUnits.map((unit)=><option value={unit.id} key={unit.id}>{unit.name}</option>)}</select>
      <select aria-label="状態で絞り込み" value={props.status} onChange={(event)=>props.setStatus(event.target.value)}><option value="">状態すべて</option>{statuses.map((value)=><option key={value}>{value}</option>)}</select>
      <button aria-pressed={props.dueView==='soon'} onClick={()=>props.setDueView(props.dueView==='soon'?'':'soon')}><CalendarDays size={15}/>期限7日前</button>
      <button aria-pressed={props.dueView==='overdue'} onClick={()=>props.setDueView(props.dueView==='overdue'?'':'overdue')}><AlertTriangle size={15}/>期限超過</button>
    </div>
    {filtered.length===0?<div className="empty"><Search/><h3>該当するタスクがありません</h3></div>:props.groupByTeam?<div className="team-groups">{organizationUnits.map((unit)=>{const items=filtered.filter((task)=>task.teamId===unit.id);if(!items.length)return null;const remaining=items.filter((task)=>task.status!=='完了').length,high=items.filter((task)=>task.urgency==='高'&&task.status!=='完了').length;return <section key={unit.id} className="team-group" aria-labelledby={`team-${unit.id}`}><header><div><span className="eyebrow">TEAM</span><h3 id={`team-${unit.id}`}>{unit.name}</h3></div><p>責任者 <b>{unit.owner}</b> · 未完了 {remaining}件 · 高緊急 {high}件</p></header>{renderCards(items)}</section>})}</div>:renderCards(filtered)}
  </section>
}
