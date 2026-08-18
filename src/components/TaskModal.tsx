import { useEffect, useId, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { sourceRef } from '../sourceCatalog'
import { departmentName, organizationUnits, statuses, urgencies, type Task, type ValidationIssue } from '../types'
import { personKeysFor } from '../planData'

type Props={task?:Task|null;tasks:Task[];dirty?:boolean;onClose:()=>void;onDiscard?:()=>void;onSave:(task:Task)=>ValidationIssue[]|Promise<ValidationIssue[]>;onDirty?:(dirty:boolean)=>void}
const nextId=(tasks:Task[])=>{for(let phase=0;phase<=6;phase++)for(let number=1;number<=99;number++){const id=`P${phase}-${String(number).padStart(2,'0')}`;if(!tasks.some((task)=>task.id===id))return id}return'P6-99'}
const blank=(tasks:Task[]):Task=>{const id=nextId(tasks);return{id,title:'',phase:Number(id[1]) as Task['phase'],teamId:'planning',team:'企画チーム',rawTeam:'企画チーム',owner:'ウメノ',assignees:[],rawAssignees:'',personKeys:[],urgency:'中',deadline:'',status:'未着手',holdReason:'',dependencies:[],notes:[],sourceRefs:[sourceRef('S4',276,300,'medium')],updatedAt:new Date().toISOString()}}
const meaningful=(value:string)=>value.replace(/[\s\u200B-\u200D\uFEFF]/g,'').length>0

export function TaskModal({task,tasks,dirty=false,onClose,onDiscard,onSave,onDirty}:Props){
  const [draft,setDraft]=useState<Task>(task??blank(tasks)),[issues,setIssues]=useState<ValidationIssue[]>([]),[saving,setSaving]=useState(false)
  const dialogRef=useRef<HTMLDivElement>(null),originRef=useRef<HTMLElement|null>(null),initialDraft=useRef(structuredClone(draft)),submitLock=useRef(false),uid=useId()
  useEffect(()=>onDirty?.(JSON.stringify(draft)!==JSON.stringify(initialDraft.current)),[draft,onDirty])
  useEffect(()=>{originRef.current=document.activeElement as HTMLElement;const dialog=dialogRef.current,focusable=()=>Array.from(dialog?.querySelectorAll<HTMLElement>('button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled])')??[]);focusable()[0]?.focus();const onKey=(event:KeyboardEvent)=>{if(event.key==='Escape'){event.preventDefault();onClose();return}if(event.key!=='Tab')return;const items=focusable(),first=items[0],last=items.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus()}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus()}};addEventListener('keydown',onKey);return()=>{removeEventListener('keydown',onKey);originRef.current?.focus()}},[onClose])
  const set=<K extends keyof Task>(key:K,value:Task[K])=>{onDirty?.(true);setDraft((current)=>({...current,[key]:value}))}
  const id=(name:string)=>`${uid}-${name}`
  const submit=async(event:React.FormEvent)=>{event.preventDefault();if(submitLock.current)return;if(draft.status==='保留'&&!meaningful(draft.holdReason)){setIssues([{path:'holdReason',message:'保留理由を入力してください'}]);return}submitLock.current=true;setSaving(true);try{const result=onSave({...draft,updatedAt:new Date().toISOString()});setIssues(result instanceof Promise?await result:result)}finally{submitLock.current=false;setSaving(false)}}
  const Field=({name,label,children,wide=false}:{name:string;label:string;children:React.ReactNode;wide?:boolean})=><div className={`field ${wide?'wide':''}`}><label htmlFor={id(name)}>{label}</label>{children}{issues.find((issue)=>issue.path.endsWith(name))&&<span className="field-error">{issues.find((issue)=>issue.path.endsWith(name))?.message}</span>}</div>
  return <div className="modal-backdrop" onMouseDown={(event)=>event.target===event.currentTarget&&onClose()}><div ref={dialogRef} className="modal" role="dialog" aria-modal="true" aria-labelledby={id('title-heading')}><form onSubmit={submit}>
    <div className="modal-head"><div><span className="eyebrow">TASK EDITOR</span><h2 id={id('title-heading')}>{task?'タスクを編集':'新規タスク'}</h2></div><button className="icon-button" type="button" onClick={onClose} aria-label="閉じる"><X size={18}/></button></div>
    {issues.length>0&&<div className="form-errors" role="alert"><b>保存できません</b><ul>{issues.slice(0,5).map((issue)=><li key={`${issue.path}-${issue.message}`}>{issue.message}</li>)}</ul></div>}
    <div className="form-grid">
      <Field name="id" label="タスクID *"><input id={id('id')} value={draft.id} onChange={(event)=>set('id',event.target.value)} required readOnly={!!task}/></Field>
      <Field name="phase" label="Phase"><select id={id('phase')} value={draft.phase} onChange={(event)=>set('phase',Number(event.target.value) as Task['phase'])}>{[0,1,2,3,4,5,6].map((phase)=><option key={phase} value={phase}>Phase {phase}</option>)}</select></Field>
      <Field name="title" label="タスク名 *" wide><textarea id={id('title')} value={draft.title} onChange={(event)=>set('title',event.target.value)} required rows={2}/></Field>
      <Field name="teamId" label="担当チーム"><select id={id('teamId')} value={draft.teamId} onChange={(event)=>{const teamId=event.target.value as Task['teamId'],team=departmentName(teamId);if(!team)return;setDraft((current)=>({...current,teamId,team,rawTeam:team,owner:organizationUnits.find((unit)=>unit.id===teamId)?.owner??current.owner}))}}>{organizationUnits.map((unit)=><option value={unit.id} key={unit.id}>{unit.name}</option>)}</select></Field>
      <Field name="owner" label="責任者"><input id={id('owner')} value={draft.owner} onChange={(event)=>set('owner',event.target.value)} required/></Field>
      <Field name="assignees" label="担当者（読点区切り）" wide><input id={id('assignees')} value={draft.rawAssignees} onChange={(event)=>{const rawAssignees=event.target.value;setDraft((current)=>({...current,rawAssignees,assignees:rawAssignees.split(/[、,]/).map((value)=>value.trim()).filter(Boolean),personKeys:personKeysFor(rawAssignees)}))}}/></Field>
      <Field name="urgency" label="緊急度"><select id={id('urgency')} value={draft.urgency} onChange={(event)=>set('urgency',event.target.value as Task['urgency'])}>{urgencies.map((value)=><option key={value}>{value}</option>)}</select></Field>
      <Field name="status" label="状態"><select id={id('status')} value={draft.status} onChange={(event)=>set('status',event.target.value as Task['status'])}>{statuses.map((value)=><option key={value}>{value}</option>)}</select></Field>
      <Field name="deadline" label="期限（原文）"><input id={id('deadline')} value={draft.deadline} onChange={(event)=>set('deadline',event.target.value)}/></Field>
      <Field name="deadlineDate" label="判定用の確定日"><input id={id('deadlineDate')} type="date" value={draft.deadlineDate??''} onChange={(event)=>set('deadlineDate',event.target.value||undefined)}/></Field>
      <Field name="holdReason" label="保留理由 / 解除条件" wide><textarea id={id('holdReason')} value={draft.holdReason} onChange={(event)=>set('holdReason',event.target.value)} required={draft.status==='保留'} rows={2}/></Field>
      <Field name="dependencies" label="依存タスクID（読点区切り）" wide><input id={id('dependencies')} value={draft.dependencies.join('、')} onChange={(event)=>set('dependencies',event.target.value.split(/[、,]/).map((value)=>value.trim()).filter(Boolean))}/></Field>
      <Field name="notes" label="注意事項（改行区切り）" wide><textarea id={id('notes')} value={draft.notes.join('\n')} onChange={(event)=>set('notes',event.target.value.split('\n').map((value)=>value.trim()).filter(Boolean))} rows={3}/></Field>
      {draft.createdByDepartment&&<Field name="automationDisabled" label="この根拠の自動タスクを無効化する" wide><div className="automation-toggle"><input id={id('automationDisabled')} type="checkbox" checked={draft.automationDisabled??false} onChange={(event)=>set('automationDisabled',event.target.checked)}/><span>{draft.automationDisabled?'無効（週次更新で再提案しません）':'有効'}</span></div></Field>}
    </div>
    <div className="modal-actions">{dirty?<button className="button ghost" type="button" disabled={saving} onClick={onDiscard??onClose}>変更を破棄</button>:<button className="button ghost" type="button" disabled={saving} onClick={onClose}>キャンセル</button>}<button className="button primary" type="submit" disabled={saving}>{saving?'保存中…':'保存する'}</button></div>
  </form></div></div>
}
