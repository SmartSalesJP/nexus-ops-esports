import { AlertTriangle, CalendarDays, GripVertical, Pencil, Plus, Search, Trash2, UserRound } from 'lucide-react'
import { organizationUnits, statuses, type Status, type Task } from '../types'

type Props={tasks:Task[];view:'kanban'|'list';search:string;department:string;status:string;setSearch:(v:string)=>void;setDepartment:(v:string)=>void;setStatus:(v:string)=>void;onAdd:()=>void;onEdit:(t:Task)=>void;onDelete:(t:Task)=>void;onStatus:(id:string,s:Status)=>void}
const priorityClass=(priority:Task['priority'])=>`priority priority-${priority}`
const searchText=(task:Task)=>[
  task.id,task.title,task.description,task.departmentId,task.department,task.owner,task.assignmentStatus,task.timing,task.dateStatus,task.publicationStatus,task.asOf,task.priority,task.status,task.dependencies,task.risk,
  task.conflictingSourceRefs.join(' '),task.sources.map((source)=>`${source.sourceId} ${source.fileName} ${source.lineStart}-${source.lineEnd} ${source.confidence}`).join(' '),
].join(' ').toLowerCase()

function StatusSelect({task,onStatus,compact=false}:{task:Task;onStatus:Props['onStatus'];compact?:boolean}){
  const id=`status-${compact?'card':'row'}-${task.id}`
  return <><label className="sr-only" htmlFor={id}>{task.title}のステータス</label><select id={id} value={task.status} onChange={(event)=>onStatus(task.id,event.target.value as Status)}>{statuses.map((status)=><option key={status}>{status}</option>)}</select></>
}

function Card({task,onEdit,onDelete,onStatus}:Pick<Props,'onEdit'|'onDelete'|'onStatus'>&{task:Task}){
  return <article className="task-card" draggable onDragStart={(event)=>event.dataTransfer.setData('text/task-id',task.id)} tabIndex={0}>
    <div className="task-card-head"><span className="task-id"><GripVertical size={14}/>{task.id}</span><span className={priorityClass(task.priority)}>{task.priority}</span></div>
    <h3>{task.title}</h3><p className="department-pill" title={`組織ID: ${task.departmentId}`}>{task.department}</p>
    <div className="task-meta"><span><UserRound size={14}/>{task.owner||'未割当'}（{task.assignmentStatus}）</span><span><CalendarDays size={14}/>{task.timing||'未設定'}（{task.dateStatus}）</span></div>
    <div className="uncertainty"><span>{task.publicationStatus}</span><span>基準日 {task.asOf}</span>{task.conflictingSourceRefs.map((reference)=><span className="conflict-ref" key={reference}>競合: {reference}</span>)}</div>
    {task.risk&&<p className="risk"><AlertTriangle size={14}/>{task.risk}</p>}
    <div className="card-actions"><button onClick={()=>onEdit(task)} aria-label={`${task.title}を編集`}><Pencil size={15}/>編集</button><button onClick={()=>onDelete(task)} aria-label={`${task.title}を削除`}><Trash2 size={15}/>削除</button><StatusSelect task={task} onStatus={onStatus} compact/></div>
  </article>
}

export function TaskBoard(props:Props){
 const query=props.search.trim().toLowerCase()
 const filtered=props.tasks.filter((task)=>(!query||searchText(task).includes(query))&&(!props.department||task.departmentId===props.department)&&(!props.status||task.status===props.status))
 return <section aria-labelledby="tasks-title">
  <div className="section-heading"><div><span className="eyebrow">MISSION CONTROL</span><h2 id="tasks-title">タスク進行表</h2><p>{filtered.length} / {props.tasks.length} 件を表示</p></div><button className="button primary" onClick={props.onAdd}><Plus size={17}/>新規タスク</button></div>
  <div className="filters" role="search">
    <label className="search" htmlFor="task-search"><Search size={16}/><span className="sr-only">タスクを検索</span><input id="task-search" value={props.search} onChange={(event)=>props.setSearch(event.target.value)} placeholder="部署・出典・詳細・状態・時期も検索"/></label>
    <div><label className="sr-only" htmlFor="department-filter">部署で絞り込み</label><select id="department-filter" aria-label="部署で絞り込み" value={props.department} onChange={(event)=>props.setDepartment(event.target.value)}><option value="">すべての部署</option>{organizationUnits.map((unit)=><option value={unit.id} key={unit.id}>{unit.name}</option>)}</select></div>
    <div><label className="sr-only" htmlFor="status-filter">状態で絞り込み</label><select id="status-filter" aria-label="状態で絞り込み" value={props.status} onChange={(event)=>props.setStatus(event.target.value)}><option value="">すべての状態</option>{statuses.map((status)=><option key={status}>{status}</option>)}</select></div>
  </div>
  {filtered.length===0?<div className="empty"><Search/><h3>該当するタスクがありません</h3><p>検索条件を変更するか、新しいタスクを追加してください。</p></div>:props.view==='kanban'?<div className="kanban">{statuses.map((status)=><div className="kanban-column" key={status} onDragOver={(event)=>event.preventDefault()} onDrop={(event)=>{const id=event.dataTransfer.getData('text/task-id');if(id)props.onStatus(id,status)}}><div className="column-head"><span className={`status-dot status-${status}`}/><h3>{status}</h3><b>{filtered.filter((task)=>task.status===status).length}</b></div><div className="column-cards">{filtered.filter((task)=>task.status===status).map((task)=><Card key={task.id} task={task} onEdit={props.onEdit} onDelete={props.onDelete} onStatus={props.onStatus}/>)}</div></div>)}</div>:
  <div className="table-wrap"><table><thead><tr><th>タスク</th><th>部署</th><th>責任者</th><th>時期</th><th>公開</th><th>状態</th><th>出典 / リスク</th><th>操作</th></tr></thead><tbody>{filtered.map((task)=><tr key={task.id}>
    <td data-label="タスク"><b>{task.title}</b><small>{task.id} · 依存: {task.dependencies||'なし'}</small></td>
    <td data-label="部署">{task.department}<small>{task.departmentId}</small></td>
    <td data-label="責任者">{task.owner||'未割当'}<small>{task.assignmentStatus}</small></td>
    <td data-label="時期">{task.timing}<small>{task.dateStatus} / 基準日 {task.asOf}</small></td>
    <td data-label="公開">{task.publicationStatus}{task.conflictingSourceRefs.map((reference)=><small key={reference}>競合: {reference}</small>)}</td>
    <td data-label="状態"><StatusSelect task={task} onStatus={props.onStatus}/></td>
    <td data-label="出典 / リスク" className="risk-cell">{task.sources.map((source)=><small key={`${source.sourceId}-${source.lineStart}`}>{source.sourceId}:{source.lineStart}-{source.lineEnd} {source.confidence}</small>)}{task.risk}</td>
    <td data-label="操作"><div className="row-actions"><button onClick={()=>props.onEdit(task)} aria-label={`${task.title}を編集`}><Pencil size={16}/></button><button onClick={()=>props.onDelete(task)} aria-label={`${task.title}を削除`}><Trash2 size={16}/></button></div></td>
  </tr>)}</tbody></table></div>}
 </section>
}
