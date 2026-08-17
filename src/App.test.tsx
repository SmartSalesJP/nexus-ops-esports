import { StrictMode } from 'react'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { initialAudit, initialEdges, initialKpis, initialNodes, initialTasks, initialViewport } from './data'
import { KEYS, saveBundle } from './storage'
import type { ExportBundle } from './types'
import { emptyWeeklyState, runWeeklyBundle } from './weekly'

const bundle=():ExportBundle=>({schemaVersion:4,exportedAt:'2026-08-16T00:00:00.000Z',tasks:structuredClone(initialTasks),flow:{nodes:structuredClone(initialNodes),edges:structuredClone(initialEdges),viewport:structuredClone(initialViewport)},audit:structuredClone(initialAudit),kpis:structuredClone(initialKpis),reportBaseline:null,migrationArchive:[],weekly:emptyWeeklyState()})

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
  const consoleError=vi.spyOn(console,'error').mockImplementation(()=>{}),full=runWeeklyBundle(bundle(),new Date(),'manual'),oldTasks=full.tasks.filter((task)=>task.provenance?.ruleId!=='milestone-deliverable-acceptance'),old={...full,tasks:oldTasks.map((task)=>task.id==='P0-05'?{...task,status:'未着手' as const,updatedAt:'2026-08-16T03:00:00.000Z'}:task)},frozenRuns=structuredClone(old.weekly.runs),frozenSummaries=structuredClone(old.flow.nodes.filter((node)=>node.id.startsWith('weekly-summary:'))),canonicalBefore=structuredClone(old.tasks.filter((task)=>!task.createdByDepartment))
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
  const full=runWeeklyBundle(bundle(),new Date(),'manual'),old={...full,tasks:full.tasks.filter((task)=>task.provenance?.ruleId!=='milestone-deliverable-acceptance')}
  expect(old.tasks).toHaveLength(99);expect(saveBundle(old).ok).toBe(true);const persisted=localStorage.getItem(KEYS.bundle),originalSetItem=Storage.prototype.setItem
  const storageSpy=vi.spyOn(Storage.prototype,'setItem').mockImplementation(function(this:Storage,key:string,value:string){if(key===KEYS.bundle)throw new DOMException('quota','QuotaExceededError');return originalSetItem.call(this,key,value)})
  vi.resetModules();const {default:App}=await import('./App');render(<StrictMode><App/></StrictMode>)
  await waitFor(()=>expect(screen.getByRole('alert')).toHaveTextContent('週次更新を保存できませんでした'))
  expect(localStorage.getItem(KEYS.bundle)).toBe(persisted)
  expect(screen.getByText('全タスク').parentElement).toHaveTextContent('99')
  expect(JSON.parse(localStorage.getItem(KEYS.weeklyFailure)!)).toMatchObject({runId:'weekly:2026-W34',error:expect.stringContaining('保存できません')})
  storageSpy.mockRestore();cleanup();vi.useRealTimers()
})
