import { StrictMode } from 'react'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'
import { initialAudit, initialEdges, initialKpis, initialNodes, initialTasks, initialViewport } from './data'
import { KEYS, saveBundle, validateBundle } from './storage'
import type { ExportBundle } from './types'
import { emptyWeeklyState, runWeeklyBundle } from './weekly'
import { checklistTemplate } from './checklistTemplates'
import type { CloudControls } from './App'

const bundle=():ExportBundle=>({schemaVersion:4,exportedAt:'2026-08-16T00:00:00.000Z',tasks:structuredClone(initialTasks),taskResults:[],flow:{nodes:structuredClone(initialNodes),edges:structuredClone(initialEdges),viewport:structuredClone(initialViewport)},audit:structuredClone(initialAudit),kpis:structuredClone(initialKpis),reportBaseline:null,migrationArchive:[],weekly:emptyWeeklyState()})
vi.setConfig({testTimeout:15_000})

it('shows an alert when initial localStorage access is denied',async()=>{
  vi.resetModules()
  const spy=vi.spyOn(Storage.prototype,'getItem').mockImplementation(()=>{throw new DOMException('denied','SecurityError')})
  const {default:App}=await import('./App')
  spy.mockRestore()
  render(<App/>)
  expect(screen.getByRole('alert')).toHaveTextContent('保存データを取得できません')
})

it('labels current operation history truthfully without claiming a retest',async()=>{
  vi.resetModules()
  const {createOperationAuditEntry}=await import('./operationAudit')
  const entry=createOperationAuditEntry('OP-TEST','runtime','テスト操作','保存内容',['src/App.tsx'],'before','after','2026-08-14T20:50:00+09:00')
  expect(entry).toMatchObject({issueId:'OP-TEST',targetVersion:'0.4.0',round:3,retest:'未実施（操作時点）',action:'操作履歴 · テスト操作',at:'2026-08-14T20:50:00+09:00'})
  expect(entry.detail).toContain('監査指摘の修正ではない')
})

it('reconciles same-week rule deltas once on startup without changing the frozen run or canonical tasks',async()=>{
  vi.useFakeTimers({shouldAdvanceTime:true});vi.setSystemTime(new Date('2026-08-17T12:00:00+09:00'));localStorage.clear()
  const consoleError=vi.spyOn(console,'error').mockImplementation(()=>{}),full=runWeeklyBundle(bundle(),new Date(),'manual'),oldTasks=full.tasks.filter((task)=>task.provenance?.ruleId!=='milestone-deliverable-acceptance'),storedTasks=oldTasks.map((task)=>task.id==='P0-05'?{...task,status:'未着手' as const,updatedAt:'2026-08-16T03:00:00.000Z'}:task),old={...full,tasks:storedTasks,flow:{...full.flow,nodes:full.flow.nodes.filter((node)=>!node.id.startsWith('weekly-project:')),edges:full.flow.edges.filter((edge)=>!edge.id.startsWith('weekly-project:'))}},frozenRuns=structuredClone(full.weekly.runs),frozenSummaries=structuredClone(full.flow.nodes.filter((node)=>node.id.startsWith('weekly-summary:'))),canonicalBefore=JSON.parse(JSON.stringify(storedTasks.filter((task)=>!task.createdByDepartment)))
  expect(full.tasks).toHaveLength(103);expect(old.tasks).toHaveLength(99);expect(saveBundle(old).ok).toBe(true)
  vi.resetModules();const {default:FirstApp}=await import('./App'),first=render(<StrictMode><FirstApp/></StrictMode>)
  await waitFor(()=>expect((JSON.parse(localStorage.getItem(KEYS.bundle)!) as ExportBundle).tasks).toHaveLength(103))
  const reconciled=JSON.parse(localStorage.getItem(KEYS.bundle)!) as ExportBundle
  expect(reconciled.weekly.runs).toEqual(frozenRuns)
  expect(reconciled.flow.nodes.filter((node)=>node.id.startsWith('weekly-summary:'))).toEqual(frozenSummaries)
  expect(reconciled.tasks.filter((task)=>!task.createdByDepartment)).toEqual(canonicalBefore)
  expect(reconciled.tasks.find((task)=>task.id==='P0-05')?.status).toBe('未着手')
  expect(reconciled.audit.filter((item)=>item.issueId==='OP-WEEKLY-RUN-DELTA')).toHaveLength(1)
  first.unmount();const persisted=localStorage.getItem(KEYS.bundle);vi.resetModules();const {default:SecondApp}=await import('./App');render(<StrictMode><SecondApp/></StrictMode>)
  await waitFor(()=>expect(screen.queryByRole('alert')).not.toBeInTheDocument())
  expect(localStorage.getItem(KEYS.bundle)).toBe(persisted)
  expect((JSON.parse(localStorage.getItem(KEYS.bundle)!) as ExportBundle).tasks).toHaveLength(103)
  expect(screen.queryByRole('status')).not.toBeInTheDocument()
  expect(consoleError).not.toHaveBeenCalled()
  consoleError.mockRestore();cleanup();vi.useRealTimers()
})

it('keeps the first startup catch-up behavior when the current week has not run',async()=>{
  vi.useFakeTimers({shouldAdvanceTime:true});vi.setSystemTime(new Date('2026-08-17T12:00:00+09:00'));localStorage.clear();expect(saveBundle(bundle()).ok).toBe(true)
  vi.resetModules();const {default:App}=await import('./App');render(<StrictMode><App/></StrictMode>)
  await waitFor(()=>expect((JSON.parse(localStorage.getItem(KEYS.bundle)!) as ExportBundle).weekly.lastRun?.runId).toBe('weekly:2026-W34'))
  const stored=JSON.parse(localStorage.getItem(KEYS.bundle)!) as ExportBundle
  expect(stored.weekly.lastRun).toMatchObject({trigger:'catch-up',outcome:'success'})
  expect(stored.flow.nodes.filter((node)=>node.id==='weekly-summary:weekly:2026-W34')).toHaveLength(1)
  cleanup();vi.useRealTimers()
})

it('keeps the old bundle and React state when startup delta persistence fails',async()=>{
  vi.useFakeTimers({shouldAdvanceTime:true});vi.setSystemTime(new Date('2026-08-17T12:00:00+09:00'));localStorage.clear()
  const full=runWeeklyBundle(bundle(),new Date(),'manual'),old={...full,tasks:full.tasks.filter((task)=>task.provenance?.ruleId!=='milestone-deliverable-acceptance'),flow:{...full.flow,nodes:full.flow.nodes.filter((node)=>!node.id.startsWith('weekly-project:')),edges:full.flow.edges.filter((edge)=>!edge.id.startsWith('weekly-project:'))}}
  expect(old.tasks).toHaveLength(99);expect(saveBundle(old).ok).toBe(true);const persisted=localStorage.getItem(KEYS.bundle),originalSetItem=Storage.prototype.setItem
  const storageSpy=vi.spyOn(Storage.prototype,'setItem').mockImplementation(function(this:Storage,key:string,value:string){if(key===KEYS.bundle)throw new DOMException('quota','QuotaExceededError');return originalSetItem.call(this,key,value)})
  vi.resetModules();const {default:App}=await import('./App');render(<StrictMode><App/></StrictMode>)
  await waitFor(()=>expect(screen.getByRole('alert')).toHaveTextContent('週次更新を保存できませんでした'))
  expect(localStorage.getItem(KEYS.bundle)).toBe(persisted)
  expect(screen.getByText('全タスク').parentElement).toHaveTextContent('99')
  expect(JSON.parse(localStorage.getItem(KEYS.weeklyFailure)!)).toMatchObject({runId:'weekly:2026-W34',error:expect.stringContaining('保存できません')})
  storageSpy.mockRestore();cleanup();vi.useRealTimers()
})

it('keeps a dirty result draft and accepted URL when a newer cloud bundle is rendered',async()=>{
  vi.resetModules();const {default:App}=await import('./App'),source=runWeeklyBundle(bundle(),new Date('2026-08-17T12:00:00+09:00'),'manual'),organization={id:'org-1',name:'Org',slug:'org',status:'active' as const,stateVersion:1,role:'editor' as const},workspace={organization,entities:[],bundle:source,importState:{status:'imported' as const,manifestCount:1,lastManifestAt:'2026-08-17T00:00:00.000Z'}},cloud:CloudControls={repository:{} as CloudControls['repository'],workspace,organizations:[organization],selectedOrganizationId:organization.id,userEmail:'test@example.com',onSelectOrganization:vi.fn(),onConfirmed:vi.fn(),pendingCandidate:null,onPending:vi.fn(),onReload:vi.fn(),onSignOut:vi.fn(),onSessionExpired:vi.fn(),onAccessRevoked:vi.fn()},view=render(<App initialBundle={source} cloud={cloud}/>)
  await userEvent.click(screen.getByRole('button',{name:/YUKISHIRO.*成果シート/}))
  const input=screen.getByRole('textbox',{name:/^結果/});await userEvent.type(input,'local draft')
  const accepted=location.hash,remote={...structuredClone(source),exportedAt:'2026-08-17T01:00:00.000Z'},remoteOrganization={...organization,stateVersion:2},remoteCloud={...cloud,workspace:{...workspace,organization:remoteOrganization,bundle:remote},organizations:[remoteOrganization]}
  view.rerender(<App initialBundle={remote} cloud={remoteCloud}/>)
  expect(input).toHaveValue('local draft');expect(screen.getByText(/編集元: result/)).toBeInTheDocument()
  location.hash='#task-result/P0-02';await waitFor(()=>expect(location.hash).toBe(accepted));expect(screen.getByRole('heading',{name:'P0-01 成果シート'})).toBeInTheDocument()
})

it('allows only one same-tick KPI save and restores the saved baseline on discard',async()=>{
  localStorage.clear();vi.resetModules();const {default:App}=await import('./App');render(<App initialBundle={bundle()}/>)
  await waitFor(()=>expect(screen.getByRole('button',{name:/今すぐ週次更新/})).toBeEnabled())
  const input=screen.getByLabelText('同時接続の実績'),save=screen.getByRole('button',{name:'KPI保存'})
  fireEvent.change(input,{target:{value:'12'}});fireEvent.click(save);fireEvent.click(save)
  await waitFor(()=>expect((JSON.parse(localStorage.getItem(KEYS.bundle)!) as ExportBundle).audit.filter((item)=>item.issueId==='OP-KPI-SAVE')).toHaveLength(1));await waitFor(()=>expect(screen.queryByText(/編集元: kpi/)).not.toBeInTheDocument())
  fireEvent.change(input,{target:{value:'99'}});fireEvent.click(screen.getByRole('button',{name:'KPI変更を破棄'}));expect(input).toHaveValue(12);expect(screen.queryByText(/編集元: kpi/)).not.toBeInTheDocument()
})

it('serializes global same-tick saves through the App commit lock',async()=>{
  localStorage.clear();vi.resetModules();const {default:App}=await import('./App');render(<App initialBundle={bundle()}/>);await waitFor(()=>expect(screen.getByRole('button',{name:/今すぐ週次更新/})).toBeEnabled());const report=screen.getAllByText('隔週報告')[0].closest('button')!;fireEvent.click(report);const save=screen.getByRole('button',{name:/現在を比較基準に保存/});fireEvent.click(save);fireEvent.click(save);await waitFor(()=>expect((JSON.parse(localStorage.getItem(KEYS.bundle)!) as ExportBundle).audit.filter((item)=>item.issueId==='OP-REPORT-BASELINE')).toHaveLength(1))
})

it('allows only the baseline mutation when baseline save and weekly run start in the same tick',async()=>{
  localStorage.clear();const source=runWeeklyBundle(bundle(),new Date(),'manual');vi.resetModules();const {default:App}=await import('./App');render(<App initialBundle={source}/>);const weeklyButton=screen.getByRole('button',{name:/今すぐ週次更新/});await waitFor(()=>expect(weeklyButton).toBeEnabled());fireEvent.click(screen.getAllByText('隔週報告')[0].closest('button')!);const baselineButton=screen.getByRole('button',{name:/現在を比較基準に保存/});fireEvent.click(baselineButton);fireEvent.click(weeklyButton);await waitFor(()=>expect(localStorage.getItem(KEYS.bundle)).not.toBeNull());const stored=JSON.parse(localStorage.getItem(KEYS.bundle)!) as ExportBundle;expect(stored.audit.filter((item)=>item.issueId==='OP-REPORT-BASELINE')).toHaveLength(1);expect(stored.weekly.runs).toEqual(source.weekly.runs)
})

it('does not read or apply an import that races with an active commit',async()=>{
  localStorage.clear();const source=runWeeklyBundle(bundle(),new Date(),'manual');vi.resetModules();const {default:App}=await import('./App');render(<App initialBundle={source}/>);await waitFor(()=>expect(screen.getByRole('button',{name:/今すぐ週次更新/})).toBeEnabled());fireEvent.click(screen.getAllByText('隔週報告')[0].closest('button')!);const baselineButton=screen.getByRole('button',{name:/現在を比較基準に保存/}),text=vi.fn().mockResolvedValue(JSON.stringify(bundle())),file={text} as unknown as File;fireEvent.click(baselineButton);fireEvent.change(screen.getByLabelText('JSONファイルを読み込む'),{target:{files:[file]}});await waitFor(()=>expect(localStorage.getItem(KEYS.bundle)).not.toBeNull());expect(text).not.toHaveBeenCalled();const stored=JSON.parse(localStorage.getItem(KEYS.bundle)!) as ExportBundle;expect(stored.audit.filter((item)=>item.issueId==='OP-REPORT-BASELINE')).toHaveLength(1);expect(stored.audit.some((item)=>item.issueId==='OP-JSON-IMPORT')).toBe(false)
})

it('persists only one mutation for same-tick weekly double click',async()=>{
  localStorage.clear();const source=runWeeklyBundle(bundle(),new Date(),'manual');vi.resetModules();const {default:App}=await import('./App');render(<App initialBundle={source}/>);const weeklyButton=screen.getByRole('button',{name:/今すぐ週次更新/});await waitFor(()=>expect(weeklyButton).toBeEnabled());const original=Storage.prototype.setItem,write=vi.spyOn(Storage.prototype,'setItem').mockImplementation(function(this:Storage,key:string,value:string){return original.call(this,key,value)});fireEvent.click(weeklyButton);fireEvent.click(weeklyButton);await waitFor(()=>expect(write.mock.calls.filter(([key])=>key===KEYS.bundle)).toHaveLength(1));write.mockRestore()
})

it('releases the global mutation lock after failure so the operation can be retried',async()=>{
  localStorage.clear();const source=runWeeklyBundle(bundle(),new Date(),'manual');vi.resetModules();const {default:App}=await import('./App');render(<App initialBundle={source}/>);await waitFor(()=>expect(screen.getByRole('button',{name:/今すぐ週次更新/})).toBeEnabled());fireEvent.click(screen.getAllByText('隔週報告')[0].closest('button')!);const baselineButton=screen.getByRole('button',{name:/現在を比較基準に保存/}),original=Storage.prototype.setItem;let failed=false;const write=vi.spyOn(Storage.prototype,'setItem').mockImplementation(function(this:Storage,key:string,value:string){if(key===KEYS.bundle&&!failed){failed=true;throw new DOMException('quota','QuotaExceededError')}return original.call(this,key,value)});fireEvent.click(baselineButton);await waitFor(()=>expect(screen.getByRole('alert')).toHaveTextContent(/保存/));await waitFor(()=>expect(baselineButton).toBeEnabled());fireEvent.click(baselineButton);await waitFor(()=>expect((JSON.parse(localStorage.getItem(KEYS.bundle)!) as ExportBundle).audit.filter((item)=>item.issueId==='OP-REPORT-BASELINE')).toHaveLength(1));write.mockRestore()
})

it('blocks milestone completion until the checklist and overall verification are complete without changing the parent task',async()=>{
  vi.useFakeTimers({shouldAdvanceTime:true});vi.setSystemTime(new Date('2026-08-19T12:00:00+09:00'));localStorage.clear()
  try{
    const source=runWeeklyBundle(bundle(),new Date(),'manual'),milestone=source.tasks.find((task)=>task.provenance?.ruleId==='milestone-checklist')!,parent=source.tasks.find((task)=>task.id===milestone.provenance?.sourceTaskId)!,parentStatus=parent.status
    vi.resetModules();const {default:App}=await import('./App');const invalid=render(<App initialBundle={source}/>);await waitFor(()=>expect(screen.getByRole('button',{name:/今すぐ週次更新/})).toBeEnabled());const persistedBefore=localStorage.getItem(KEYS.bundle);fireEvent.click(screen.getByRole('tab',{name:/全体/}));const select=document.getElementById(`status-card-${milestone.id}`)!;fireEvent.change(select,{target:{value:'完了'}});expect(screen.getByRole('alert')).toHaveTextContent('完了にできません');expect(select).toHaveValue(milestone.status);fireEvent.click(screen.getByRole('button',{name:`${milestone.title}を編集`}));const invalidDialog=screen.getByRole('dialog');fireEvent.change(within(invalidDialog).getByLabelText('状態'),{target:{value:'完了'}});fireEvent.click(within(invalidDialog).getByRole('button',{name:'保存する'}));await waitFor(()=>expect(within(invalidDialog).getByRole('alert')).toHaveTextContent('完了にできません'));expect(within(invalidDialog).getByLabelText('状態')).toHaveValue('完了');expect(localStorage.getItem(KEYS.bundle)).toBe(persistedBefore);expect(source.tasks.find((task)=>task.id===milestone.id)?.status).toBe(milestone.status);expect(source.tasks.find((task)=>task.id===parent.id)?.status).toBe(parentStatus);fireEvent.click(within(invalidDialog).getByRole('button',{name:'変更を破棄'}));expect(select).toHaveValue(milestone.status);invalid.unmount();localStorage.clear()
    const completedItems=checklistTemplate(milestone,parent).map((item)=>({...item,status:'完了' as const,reviewer:'監査担当',reviewedAt:'2026-08-19T03:00:00.000Z',evidenceMemo:'証跡を確認済み'})),valid={...source,taskResults:[...(source.taskResults??[]),{id:`task-result:${milestone.id}` as const,taskId:milestone.id,resultBody:'',verificationState:'適合' as const,verificationSummary:'確認済み',deliverables:[],checklistItems:completedItems,nextStep:'',completionCriteria:'',verificationMemo:'',updatedAt:'2026-08-19T03:00:00.000Z'}]}
    expect(validateBundle(valid)).toEqual([]);cleanup();vi.resetModules();const {default:ValidApp}=await import('./App');render(<ValidApp initialBundle={valid}/>);await waitFor(()=>expect(screen.getByRole('button',{name:/今すぐ週次更新/})).toBeEnabled());fireEvent.click(screen.getByRole('tab',{name:/全体/}));fireEvent.click(screen.getByRole('button',{name:`${milestone.title}を編集`}));const validDialog=screen.getByRole('dialog');fireEvent.change(within(validDialog).getByLabelText('状態'),{target:{value:'完了'}});fireEvent.click(within(validDialog).getByRole('button',{name:'保存する'}));await waitFor(()=>expect(screen.queryByRole('dialog')).not.toBeInTheDocument());await waitFor(()=>expect((JSON.parse(localStorage.getItem(KEYS.bundle)!) as ExportBundle).tasks.find((task)=>task.id===milestone.id)?.status).toBe('完了'));expect((JSON.parse(localStorage.getItem(KEYS.bundle)!) as ExportBundle).tasks.find((task)=>task.id===parent.id)?.status).toBe(parentStatus)
  }finally{cleanup();vi.useRealTimers()}
})
