import { useEffect, useId, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { assignmentStatuses, dateStatuses, departmentName, organizationUnits, priorities, publicationStatuses, sourceConfidences, statuses, type SourceRef, type Task, type ValidationIssue } from '../types'

type Props = { task?: Task | null; tasks:Task[]; onClose:()=>void; onSave:(task:Task)=>ValidationIssue[] }
const blank = (): Task => ({
  id:`T-${Date.now()}`,title:'',description:'',departmentId:'ops-hq',department:'運営本部',owner:'',assignmentStatus:'未確定',timing:'',dateStatus:'要再確認',publicationStatus:'公開可否未確定',asOf:new Date().toISOString().slice(0,10),conflictingSourceRefs:[],priority:'中',status:'未着手',dependencies:'',sources:[{sourceId:'S2',fileName:'━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━.md',sha256:'0D4C5D9A238730E0CCE56228F19C9F53BC781DB1F73EC54DD4438DAA68AB519F',lineStart:1,lineEnd:1,asOf:'2026-08-14',confidence:'low'}],risk:'',updatedAt:new Date().toISOString(),
})

const sourceMeta:Record<SourceRef['sourceId'],Pick<SourceRef,'fileName'|'sha256'|'asOf'>>={
  S1:{fileName:'[LINE]excel esports academy.txt',sha256:'ACFEC279A0C9D539E9898BBD54DCA9A8A94554E73FB28CF27E6C6763AE589CFD',asOf:'2026-08-05'},
  S2:{fileName:'━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━.md',sha256:'0D4C5D9A238730E0CCE56228F19C9F53BC781DB1F73EC54DD4438DAA68AB519F',asOf:'2026-08-14'},
  S3:{fileName:'eスポーツ人材発掘・育成プロジェクト（仮）.md',sha256:'C8C5319F92133BE52C9A02B53CC60D59310BE37D3E250BF842970B2C37190BB9',asOf:'2026-08-14'},
}

export function TaskModal({task,tasks,onClose,onSave}:Props){
  const [draft,setDraft]=useState<Task>(task ?? blank())
  const [issues,setIssues]=useState<ValidationIssue[]>([])
  const dialogRef=useRef<HTMLDivElement>(null),originRef=useRef<HTMLElement|null>(null),uid=useId()
  useEffect(()=>{
    originRef.current=document.activeElement as HTMLElement
    const dialog=dialogRef.current
    const focusable=()=>Array.from(dialog?.querySelectorAll<HTMLElement>('button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])')??[])
    focusable()[0]?.focus()
    const onKey=(event:KeyboardEvent)=>{
      if(event.key==='Escape'){event.preventDefault();onClose();return}
      if(event.key!=='Tab')return
      const items=focusable();if(!items.length)return
      const first=items[0],last=items[items.length-1]
      if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus()}
      else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus()}
    }
    addEventListener('keydown',onKey)
    return()=>{removeEventListener('keydown',onKey);originRef.current?.focus()}
  },[onClose])
  const set=<K extends keyof Task>(key:K,value:Task[K])=>setDraft((current)=>({...current,[key]:value}))
  const setSource=(change:Partial<SourceRef>)=>setDraft((current)=>({...current,sources:[{...(current.sources[0]??blank().sources[0]),...change}]}))
  const submit=(event:React.FormEvent)=>{event.preventDefault();const next={...draft,updatedAt:new Date().toISOString()};const found=onSave(next);setIssues(found)}
  const fieldError=(name:string)=>issues.find((issue)=>issue.path.endsWith(`.${name}`)||issue.path===name)?.message
  const id=(name:string)=>`${uid}-${name}`
  const Field=({name,label,children,wide=false}:{name:string;label:string;children:React.ReactNode;wide?:boolean})=><div className={`field ${wide?'wide':''}`}><label htmlFor={id(name)}>{label}</label>{children}{fieldError(name)&&<span className="field-error" id={id(`${name}-error`)}>{fieldError(name)}</span>}</div>
  return <div className="modal-backdrop" onMouseDown={(event)=>event.target===event.currentTarget&&onClose()}>
    <div ref={dialogRef} className="modal" role="dialog" aria-modal="true" aria-labelledby={id('modal-title')}>
     <form onSubmit={submit}>
      <div className="modal-head"><div><span className="eyebrow">TASK EDITOR</span><h2 id={id('modal-title')}>{task?'タスクを編集':'新規タスク'}</h2></div><button className="icon-button" type="button" onClick={onClose} aria-label="閉じる"><X size={18}/></button></div>
      {issues.length>0&&<div className="form-errors" role="alert"><b>保存できません</b><ul>{issues.slice(0,5).map((issue)=><li key={`${issue.path}-${issue.message}`}>{issue.message}</li>)}</ul></div>}
      <div className="form-grid">
        <Field name="title" label="タスク名 *" wide><input id={id('title')} value={draft.title} onChange={(event)=>set('title',event.target.value)} required/></Field>
        <Field name="description" label="詳細" wide><textarea id={id('description')} value={draft.description} onChange={(event)=>set('description',event.target.value)} rows={3}/></Field>
        <Field name="departmentId" label="担当部署"><select id={id('departmentId')} value={draft.departmentId} onChange={(event)=>{const departmentId=event.target.value as Task['departmentId'];setDraft((current)=>({...current,departmentId,department:departmentName(departmentId)}))}}>{organizationUnits.map((unit)=><option value={unit.id} key={unit.id}>{unit.name}</option>)}</select></Field>
        <Field name="owner" label="責任者 / 担当"><input id={id('owner')} value={draft.owner} onChange={(event)=>set('owner',event.target.value)}/></Field>
        <Field name="assignmentStatus" label="責任者の確定状態"><select id={id('assignmentStatus')} value={draft.assignmentStatus} onChange={(event)=>set('assignmentStatus',event.target.value as Task['assignmentStatus'])}>{assignmentStatuses.map((value)=><option key={value}>{value}</option>)}</select></Field>
        <Field name="timing" label="期限 / 時期"><input id={id('timing')} value={draft.timing} onChange={(event)=>set('timing',event.target.value)}/></Field>
        <Field name="dateStatus" label="期限状態"><select id={id('dateStatus')} value={draft.dateStatus} onChange={(event)=>set('dateStatus',event.target.value as Task['dateStatus'])}>{dateStatuses.map((value)=><option key={value}>{value}</option>)}</select></Field>
        <Field name="publicationStatus" label="公開可否"><select id={id('publicationStatus')} value={draft.publicationStatus} onChange={(event)=>set('publicationStatus',event.target.value as Task['publicationStatus'])}>{publicationStatuses.map((value)=><option key={value}>{value}</option>)}</select></Field>
        <Field name="asOf" label="情報基準日"><input id={id('asOf')} type="date" value={draft.asOf} onChange={(event)=>set('asOf',event.target.value)}/></Field>
        <Field name="priority" label="優先度"><select id={id('priority')} value={draft.priority} onChange={(event)=>set('priority',event.target.value as Task['priority'])}>{priorities.map((value)=><option key={value}>{value}</option>)}</select></Field>
        <Field name="status" label="ステータス"><select id={id('status')} value={draft.status} onChange={(event)=>set('status',event.target.value as Task['status'])}>{statuses.map((value)=><option key={value}>{value}</option>)}</select></Field>
        <Field name="dependencies" label="依存ID" wide><input id={id('dependencies')} placeholder="T-001, T-002" value={draft.dependencies} onChange={(event)=>set('dependencies',event.target.value)} list={id('task-ids')}/><datalist id={id('task-ids')}>{tasks.filter((item)=>item.id!==draft.id).map((item)=><option key={item.id} value={item.id}/>)}</datalist></Field>
        <Field name="conflictingSourceRefs" label="競合する出典参照" wide><input id={id('conflictingSourceRefs')} placeholder="S1:136-217, S3:90" value={draft.conflictingSourceRefs.join(', ')} onChange={(event)=>set('conflictingSourceRefs',event.target.value.split(',').map((value)=>value.trim()).filter(Boolean))}/></Field>
        <Field name="sources" label="主要出典" wide><div className="source-editor"><div><label htmlFor={id('sourceId')}>資料</label><select id={id('sourceId')} value={draft.sources[0]?.sourceId??'S2'} onChange={(event)=>{const sourceId=event.target.value as SourceRef['sourceId'];setSource({sourceId,...sourceMeta[sourceId]})}}>{(['S1','S2','S3'] as const).map((value)=><option key={value}>{value}</option>)}</select></div><div><label htmlFor={id('lineStart')}>開始行</label><input id={id('lineStart')} type="number" min="1" value={draft.sources[0]?.lineStart??1} onChange={(event)=>setSource({lineStart:Number(event.target.value)})}/></div><div><label htmlFor={id('lineEnd')}>終了行</label><input id={id('lineEnd')} type="number" min="1" value={draft.sources[0]?.lineEnd??1} onChange={(event)=>setSource({lineEnd:Number(event.target.value)})}/></div><div><label htmlFor={id('confidence')}>確度</label><select id={id('confidence')} value={draft.sources[0]?.confidence??'low'} onChange={(event)=>setSource({confidence:event.target.value as SourceRef['confidence']})}>{sourceConfidences.map((value)=><option key={value}>{value}</option>)}</select></div></div></Field>
        <Field name="risk" label="リスク / 要確認" wide><textarea id={id('risk')} value={draft.risk} onChange={(event)=>set('risk',event.target.value)} rows={2}/></Field>
      </div>
      <div className="modal-actions"><button className="button ghost" type="button" onClick={onClose}>キャンセル</button><button className="button primary" type="submit">保存する</button></div>
     </form>
    </div>
  </div>
}
