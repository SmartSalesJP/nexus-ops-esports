import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import gsap from 'gsap'
import { Activity, AlertTriangle, Columns3, Download, FileUp, List, Network, RotateCcw, ScrollText, ShieldCheck } from 'lucide-react'
import { TaskBoard } from './components/TaskBoard'
import { TaskModal } from './components/TaskModal'
import { ProjectCanvas } from './components/ProjectCanvas'
import { AuditLog } from './components/AuditLog'
import { initialAudit, initialEdges, initialNodes, initialTasks, initialViewport } from './data'
import { parseImport, readBundle, resetBundle, saveBundle, validateTaskCandidate } from './storage'
import { type AuditClassification, type AuditItem, type ExportBundle, type FlowData, type Status, type Task, type ValidationIssue } from './types'

type Page='tasks'|'canvas'|'audit'
const nav=[{id:'tasks' as Page,label:'進行表',icon:Columns3},{id:'canvas' as Page,label:'キャンバス',icon:Network},{id:'audit' as Page,label:'修正ログ',icon:ScrollText}]
const initialResult=readBundle()
const now=()=>new Date().toISOString()

export default function App(){
 const [tasks,setTasks]=useState<Task[]>(initialResult.value.tasks),[flow,setFlow]=useState<FlowData>(initialResult.value.flow),[audit,setAudit]=useState<AuditItem[]>(initialResult.value.audit)
 const [page,setPage]=useState<Page>('tasks'),[view,setView]=useState<'kanban'|'list'>('kanban'),[search,setSearch]=useState(''),[department,setDepartment]=useState(''),[status,setStatus]=useState('')
 const [modal,setModal]=useState<{open:boolean;task?:Task|null}>({open:false}),[notice,setNotice]=useState(''),[error,setError]=useState(initialResult.error??'')
 const shell=useRef<HTMLDivElement>(null),fileRef=useRef<HTMLInputElement>(null)
 useLayoutEffect(()=>{if(matchMedia('(prefers-reduced-motion: reduce)').matches)return;const context=gsap.context(()=>{gsap.from('[data-shell-anim]',{y:12,autoAlpha:0,duration:.42,ease:'power2.out',stagger:.045})},shell);return()=>context.revert()},[])
 useEffect(()=>{if(!notice)return;const id=setTimeout(()=>setNotice(''),2600);return()=>clearTimeout(id)},[notice])
 const auditEntry=(issueId:string,classification:AuditClassification,action:string,detail:string,files:string[],before:string,after:string):AuditItem=>({id:`a-${Date.now()}-${Math.random().toString(16).slice(2)}`,issueId,classification,targetVersion:'0.2.0',files,before,after,evidence:['localStorage bundle v2への保存結果'],retest:'操作後の再読込で確認',residualRisk:'外部サービスとの同期は対象外',round:1,at:now(),action,detail})
 const commit=(nextTasks:Task[],nextFlow:FlowData,nextAudit:AuditItem[],success:string)=>{
   const bundle:ExportBundle={schemaVersion:2,exportedAt:now(),tasks:nextTasks,flow:nextFlow,audit:nextAudit}
   const result=saveBundle(bundle)
   if(!result.ok){setError(result.error??'保存に失敗しました');return false}
   setTasks(nextTasks);setFlow(nextFlow);setAudit(nextAudit);setError('');setNotice(success);return true
 }
 const saveTask=(task:Task):ValidationIssue[]=>{
   const issues=validateTaskCandidate(task,tasks);if(issues.length)return issues
   const exists=tasks.some((item)=>item.id===task.id),nextTasks=exists?tasks.map((item)=>item.id===task.id?task:item):[task,...tasks]
   const nextAudit=[auditEntry(exists?'CRUD-UPDATE':'CRUD-CREATE','validation',exists?'タスク編集':'タスク追加',`${task.id} ${task.title}`,['src/App.tsx'],exists?'旧タスク値':'未登録',exists?'検証済み新タスク値':'検証済み新規タスク'),...audit]
   if(commit(nextTasks,flow,nextAudit,'タスクを保存しました'))setModal({open:false})
   return []
 }
 const removeTask=(task:Task)=>{
   if(!confirm(`「${task.title}」を削除しますか？依存関係とキャンバス参照からも解除します。`))return
   const nextTasks=tasks.filter((item)=>item.id!==task.id).map((item)=>({...item,dependencies:item.dependencies.split(',').map((id)=>id.trim()).filter((id)=>id&&id!==task.id).join(', ')}))
   const nextFlow={...flow,nodes:flow.nodes.map((node)=>{const refs=(node.data as {taskIds?:unknown}).taskIds;return Array.isArray(refs)&&refs.includes(task.id)?{...node,data:{...node.data,taskIds:refs.filter((id)=>id!==task.id),label:String(node.data.label).replace(new RegExp(`\\n?${task.id}`,'g'),'')}}:node})}
   const nextAudit=[auditEntry('CRUD-DELETE','validation','タスク削除',`${task.id} ${task.title}`,['src/App.tsx'],'タスク・依存・キャンバス参照あり','参照整合性を維持して削除'),...audit]
   commit(nextTasks,nextFlow,nextAudit,'タスクと参照を削除しました')
 }
 const changeStatus=(id:string,nextStatus:Status)=>{const nextTasks=tasks.map((task)=>task.id===id?{...task,status:nextStatus,updatedAt:now()}:task);const nextAudit=[auditEntry('CRUD-STATUS','validation','状態変更',`${id} → ${nextStatus}`,['src/App.tsx'],'旧状態',nextStatus),...audit];commit(nextTasks,flow,nextAudit,`${id} を「${nextStatus}」に変更しました`)}
 const saveCanvas=(nextFlow:FlowData)=>{const nextAudit=[auditEntry('R1-M09','persistence','キャンバス保存',`ノード${nextFlow.nodes.length}件・接続${nextFlow.edges.length}件・viewport`,['src/components/ProjectCanvas.tsx'],'個別保存','bundle一括保存'),...audit];commit(tasks,nextFlow,nextAudit,'キャンバスを保存しました')}
 const reset=()=>{if(!confirm('ローカルの変更を破棄して初期データへ復元しますか？'))return;const result=resetBundle();if(!result.ok){setError(result.error??'初期化できません');return}setTasks(initialTasks);setFlow({nodes:initialNodes,edges:initialEdges,viewport:initialViewport});setAudit(initialAudit);setError('');setNotice('初期データへ復元しました')}
 const exportJson=()=>{const bundle:ExportBundle={schemaVersion:2,exportedAt:now(),tasks,flow,audit};const url=URL.createObjectURL(new Blob([JSON.stringify(bundle,null,2)],{type:'application/json'}));const anchor=document.createElement('a');anchor.href=url;anchor.download=`nexus-ops-${new Date().toISOString().slice(0,10)}.json`;anchor.click();URL.revokeObjectURL(url);setNotice('JSONを書き出しました')}
 const importJson=async(file?:File)=>{
   if(!file)return;setError('')
   try{
     const result=parseImport(await file.text());if(!result.ok){setError(result.error??'読み込みに失敗しました');return}
     const imported=result.value,nextAudit=[auditEntry('R1-M08','validation','JSONインポート',`${imported.tasks.length}件を原子的に読み込み`,['src/storage.ts'],'既存状態','完全検証済みbundle'),...imported.audit]
     const next={...imported,audit:nextAudit,exportedAt:now()};const saved=saveBundle(next)
     if(!saved.ok){setError(saved.error??'保存できません');return}
     setTasks(next.tasks);setFlow(next.flow);setAudit(next.audit);setNotice('データを読み込みました')
   } catch(cause){setError(cause instanceof Error?cause.message:'JSONを読み込めませんでした')}
   finally{if(fileRef.current)fileRef.current.value=''}
 }
 const complete=tasks.filter((task)=>task.status==='完了').length,progress=Math.round(complete/Math.max(tasks.length,1)*100),riskCount=tasks.filter((task)=>task.priority==='緊急'||task.risk.includes('要確認')||task.dateStatus==='期限超過').length
 return <div className="app" ref={shell}>
  <div className="atmosphere" aria-hidden="true"/><header className="topbar" data-shell-anim><div className="brand"><div className="brand-mark">N</div><div><b>NEXUS OPS</b><span>ESPORTS PROJECT CONTROL</span></div></div><div className="top-actions"><button className="icon-text" onClick={exportJson}><Download size={16}/>書き出し</button><button className="icon-text" onClick={()=>fileRef.current?.click()}><FileUp size={16}/>読み込み</button><label className="sr-only" htmlFor="json-import">JSONファイルを読み込む</label><input id="json-import" className="sr-only" ref={fileRef} type="file" accept="application/json,.json" onChange={(event)=>importJson(event.target.files?.[0])}/><button className="icon-text" onClick={reset}><RotateCcw size={16}/>初期復元</button></div></header>
  <div className="app-shell"><aside className="sidebar" data-shell-anim><nav aria-label="主要メニュー">{nav.map((item)=>{const Icon=item.icon;return <button key={item.id} className={page===item.id?'active':''} onClick={()=>setPage(item.id)}><Icon size={19}/><span>{item.label}</span></button>})}</nav><div className="sidebar-note"><ShieldCheck size={18}/><p><b>LOCAL FIRST</b>データはこのブラウザ内に一括保存されます。</p></div></aside>
   <main><section className="hero" data-shell-anim><div><span className="eyebrow">PROJECT / ACADEMY CIRCUIT</span><h1>大会を、継続する育成基盤へ。</h1><p>3月開催想定（<b>開催年は未確定</b>）。権利・許諾・公開可否は、公開前に責任者が再確認してください。</p></div><div className="risk-banner"><AlertTriangle size={18}/><span>Riot Games / VALORANT関連</span><b>最新規約を要確認</b></div></section>
    <section className="metric-grid" data-shell-anim aria-label="進捗サマリー"><article><span>全タスク</span><b>{tasks.length}</b><small>安定ID付き13部署</small></article><article><span>完了率</span><b>{progress}%</b><div className="progress"><i style={{width:`${progress}%`}}/></div></article><article><span>進行中</span><b>{tasks.filter((task)=>task.status==='進行中').length}</b><small>レビュー {tasks.filter((task)=>task.status==='レビュー').length}件</small></article><article><span>高注意</span><b>{riskCount}</b><small>緊急 / 期限超過 / 要確認</small></article></section>
    <div className="truth-note" data-shell-anim><Activity size={18}/><p><b>進捗の正本はタスク進行表です。</b> キャンバスは構想整理と依存関係の可視化に使用します。</p></div>
    <div className="page-tabs" data-shell-anim role="tablist" aria-label="ページ切替">{nav.map((item)=>{const Icon=item.icon;return <button role="tab" aria-selected={page===item.id} key={item.id} className={page===item.id?'active':''} onClick={()=>setPage(item.id)}><Icon size={17}/>{item.label}</button>})}{page==='tasks'&&<div className="view-switch"><button className={view==='kanban'?'active':''} onClick={()=>setView('kanban')} aria-label="カンバン表示"><Columns3 size={17}/></button><button className={view==='list'?'active':''} onClick={()=>setView('list')} aria-label="一覧表示"><List size={17}/></button></div>}</div>
    <div className="page-panel" key={page}>{page==='tasks'?<TaskBoard tasks={tasks} view={view} search={search} department={department} status={status} setSearch={setSearch} setDepartment={setDepartment} setStatus={setStatus} onAdd={()=>setModal({open:true})} onEdit={(task)=>setModal({open:true,task})} onDelete={removeTask} onStatus={changeStatus}/>:page==='canvas'?<ProjectCanvas key={JSON.stringify(flow.nodes.map((node)=>node.id))} initialFlow={flow} tasks={tasks} onSave={saveCanvas}/>:<AuditLog items={audit}/>}</div>
   </main>
  </div>
  {notice&&<div className="toast" role="status" aria-live="polite">{notice}</div>}
  {error&&<div className="toast error" role="alert" aria-live="assertive">{error}</div>}
  {modal.open&&<TaskModal task={modal.task} tasks={tasks} onClose={()=>setModal({open:false})} onSave={saveTask}/>} 
 </div>
}
