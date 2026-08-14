import { beforeEach, describe, expect, it, vi } from 'vitest'
import { initialAudit, initialEdges, initialKpis, initialNodes, initialTasks, initialViewport } from './data'
import { KEYS, saveBundle, validateBundle } from './storage'
import type { ExportBundle } from './types'
import { canonicalFingerprint, emptyWeeklyState, isoWeekJst, runWeeklyBundle, shouldCatchUp, syncTaskCompletion, weeklySchedule } from './weekly'

const bundle=():ExportBundle=>({schemaVersion:4,exportedAt:'2026-08-10T00:00:00.000Z',tasks:structuredClone(initialTasks),flow:{nodes:structuredClone(initialNodes),edges:structuredClone(initialEdges),viewport:structuredClone(initialViewport)},audit:structuredClone(initialAudit),kpis:structuredClone(initialKpis),reportBaseline:null,migrationArchive:[],weekly:emptyWeeklyState()})
beforeEach(()=>localStorage.clear())

describe('Asia/Tokyo ISO week scheduler',()=>{
  it('uses JST Monday 00:00 across UTC date and ISO-year boundaries',()=>{
    expect(isoWeekJst(new Date('2025-12-28T14:59:59Z')).runId).toBe('weekly:2025-W52')
    expect(isoWeekJst(new Date('2025-12-28T15:00:00Z')).runId).toBe('weekly:2026-W01')
    expect(weeklySchedule(new Date('2026-08-14T12:00:00+09:00'))).toMatchObject({runId:'weekly:2026-W33',scheduledFor:'2026-08-10T00:00:00+09:00',nextScheduledFor:'2026-08-17T00:00:00+09:00'})
  })
  it('keeps a fixed +09:00 schedule in winter and summer without DST shifts',()=>{
    expect(weeklySchedule(new Date('2026-01-07T12:00:00+09:00')).scheduledFor).toMatch(/T00:00:00\+09:00$/)
    expect(weeklySchedule(new Date('2026-07-07T12:00:00+09:00')).scheduledFor).toMatch(/T00:00:00\+09:00$/)
  })
})

describe('weekly bundle mutation',()=>{
  it('adds one completion sticky per task and one summary per week without changing user graph or viewport',()=>{
    const source=bundle(),userNodes=structuredClone(source.flow.nodes),edges=structuredClone(source.flow.edges),viewport=structuredClone(source.flow.viewport)
    source.tasks[0]={...source.tasks[0],status:'完了',updatedAt:'2026-08-12T03:00:00.000Z'}
    const next=runWeeklyBundle(source,new Date('2026-08-14T12:00:00+09:00'),'catch-up')
    expect(next.flow.nodes.filter((node)=>node.id==='weekly-complete:P0-01')).toHaveLength(1)
    expect(next.flow.nodes.filter((node)=>node.id==='weekly-summary:weekly:2026-W33')).toHaveLength(1)
    expect(next.flow.nodes.filter((node)=>!node.id.startsWith('weekly-'))).toEqual(userNodes)
    expect(next.flow.edges).toEqual(edges);expect(next.flow.viewport).toEqual(viewport)
    expect(validateBundle(next)).toEqual([])
  })
  it('is idempotent for the same week and preserves user-moved managed-node positions',()=>{
    const first=runWeeklyBundle(bundle(),new Date('2026-08-14T12:00:00+09:00'),'catch-up'),summaryId='weekly-summary:weekly:2026-W33'
    const moved={...first,flow:{...first.flow,nodes:first.flow.nodes.map((node)=>node.id===summaryId?{...node,position:{x:987,y:654}}:node)}}
    const second=runWeeklyBundle(moved,new Date('2026-08-15T12:00:00+09:00'),'manual')
    expect(new Set(second.tasks.map((task)=>task.id)).size).toBe(second.tasks.length)
    expect(second.tasks.filter((task)=>task.createdRunId==='weekly:2026-W33')).toHaveLength(first.tasks.filter((task)=>task.createdRunId==='weekly:2026-W33').length)
    expect(second.flow.nodes.filter((node)=>node.id===summaryId)).toHaveLength(1)
    expect(second.flow.nodes.find((node)=>node.id===summaryId)?.position).toEqual({x:987,y:654})
    expect(second.weekly.runs.filter((run)=>run.runId==='weekly:2026-W33')).toHaveLength(1)
    expect(second.audit.filter((item)=>item.id==='weekly-audit:weekly:2026-W33')).toHaveLength(1)
  })
  it('returns the entire bundle unchanged for identical input in the same week',()=>{const first=runWeeklyBundle(bundle(),new Date('2026-08-14T12:00:00+09:00'),'catch-up'),second=runWeeklyBundle(first,new Date('2026-08-15T22:00:00+09:00'),'manual');expect(second).toBe(first);expect(second).toEqual(first)})
  it('freezes the first run snapshot while completion current state is synchronized separately',()=>{
    const source=bundle(),only=source.tasks[0];source.tasks=[only];source.flow={nodes:[],edges:[],viewport:{x:0,y:0,zoom:1}};source.audit=[];source.kpis=source.kpis.map((kpi)=>({...kpi,actual:kpi.target}))
    const first=runWeeklyBundle(source,new Date('2026-08-10T00:00:00+09:00'),'scheduled'),originalRun=structuredClone(first.weekly.lastRun),at='2026-08-12T03:00:00.000Z',completed={...only,status:'完了' as const,updatedAt:at},synced=syncTaskCompletion(first.flow,first.weekly,completed,at),changed={...first,exportedAt:at,tasks:first.tasks.map((task)=>task.id===completed.id?completed:task),flow:synced.flow,weekly:synced.weekly}
    const rerun=runWeeklyBundle(changed,new Date('2026-08-13T12:00:00+09:00'),'manual')
    expect(originalRun?.snapshot).toMatchObject({completed:0,total:1});expect(rerun).toBe(changed);expect(rerun.weekly.lastRun).toEqual(originalRun);expect(rerun.weekly.completions[only.id].currentStatus).toBe('完了');expect(rerun.flow.nodes.find((node)=>node.id===`weekly-complete:${only.id}`)?.data.currentStatus).toBe('完了')
  })
  it('keeps the full 73-task bundle unchanged after a persisted status transition and same-week rerun',()=>{
    const first=runWeeklyBundle(bundle(),new Date('2026-08-10T00:00:00+09:00'),'scheduled'),at='2026-08-12T03:00:00.000Z',source=first.tasks.find((task)=>task.id==='P0-01')!,completed={...source,status:'完了' as const,updatedAt:at},synced=syncTaskCompletion(first.flow,first.weekly,completed,at),changed={...first,exportedAt:at,tasks:first.tasks.map((task)=>task.id===completed.id?completed:task),flow:synced.flow,weekly:synced.weekly}
    const rerun=runWeeklyBundle(changed,new Date('2026-08-13T12:00:00+09:00'),'manual')
    expect(rerun).toBe(changed);expect(rerun).toEqual(changed)
  })
  it('retains truthful completion history when a task is reopened',()=>{
    const source=bundle(),completed={...source.tasks[0],status:'完了' as const,updatedAt:'2026-08-14T01:00:00.000Z'},first=syncTaskCompletion(source.flow,source.weekly,completed,'2026-08-14T01:00:00.000Z'),reopened={...completed,status:'進行中' as const,updatedAt:'2026-08-15T01:00:00.000Z'},second=syncTaskCompletion(first.flow,first.weekly,reopened,'2026-08-15T01:00:00.000Z')
    expect(second.weekly.completions['P0-01']).toMatchObject({firstSeen:'2026-08-14T01:00:00.000Z',lastConfirmed:'2026-08-14T01:00:00.000Z',currentStatus:'進行中'})
    expect(second.flow.nodes.find((node)=>node.id==='weekly-complete:P0-01')).toMatchObject({className:expect.stringContaining('is-reopened'),data:{currentStatus:'進行中'}})
  })
  it('catches up only the current week and records skipped weeks without fabricated summaries',()=>{
    const first=runWeeklyBundle(bundle(),new Date('2026-08-10T00:00:00+09:00'),'scheduled')
    expect(shouldCatchUp(first.weekly,new Date('2026-08-31T09:00:00+09:00'))).toBe(true)
    const caught=runWeeklyBundle(first,new Date('2026-08-31T09:00:00+09:00'),'catch-up')
    expect(caught.weekly.lastRun).toMatchObject({runId:'weekly:2026-W36',missedWeekCount:2})
    expect(caught.flow.nodes.filter((node)=>String(node.id).startsWith('weekly-summary:')).map((node)=>node.id)).toEqual(['weekly-summary:weekly:2026-W33','weekly-summary:weekly:2026-W36'])
  })
  it('creates review-required provenance tasks without S4 references and honors tombstones',()=>{
    const first=runWeeklyBundle(bundle(),new Date('2026-08-14T12:00:00+09:00'),'manual'),auto=first.tasks.find((task)=>task.createdByDepartment==='esports_progress_control')!
    expect(auto).toMatchObject({status:'未着手',approvalState:'要確認',sourceRefs:[],createdRunId:'weekly:2026-W33'})
    expect(auto.fingerprint).toBeTruthy();expect(auto.reason).toBeTruthy();expect(auto.expectedDeliverable).toBeTruthy()
    const removed={...first,tasks:first.tasks.filter((task)=>task.id!==auto.id),weekly:{...first.weekly,tombstones:[...first.weekly.tombstones,auto.fingerprint!]}}
    const next=runWeeklyBundle(removed,new Date('2026-08-17T12:00:00+09:00'),'manual')
    expect(next.tasks.some((task)=>task.fingerprint===auto.fingerprint)).toBe(false)
  })
  it('canonicalizes dependency roles so order, week changes and tombstones cannot duplicate a proposal',()=>{
    const make=(dependencies:string[])=>{const value=bundle();value.tasks=value.tasks.map((task)=>task.id==='P0-01'?{...task,dependencies}:task);return value},find=(value:ExportBundle)=>value.tasks.find((task)=>task.provenance?.ruleId==='dependency-readiness'&&task.provenance.sourceTaskId==='P0-01')!
    const a=runWeeklyBundle(make(['P0-02','P0-03','P0-02']),new Date('2026-08-14T12:00:00+09:00'),'manual'),b=runWeeklyBundle(make(['P0-03','P0-02']),new Date('2026-08-14T12:00:00+09:00'),'manual'),autoA=find(a),autoB=find(b)
    expect(autoA.provenance).toEqual({ruleId:'dependency-readiness',sourceTaskId:'P0-01',dependencyIds:['P0-02','P0-03']});expect(autoA.fingerprint).toBe(autoB.fingerprint);expect(autoA.id).toBe(autoB.id);expect(autoA.fingerprint).toBe(canonicalFingerprint(autoA.provenance!))
    const nextWeek=runWeeklyBundle(a,new Date('2026-08-17T12:00:00+09:00'),'manual');expect(nextWeek.tasks.filter((task)=>task.fingerprint===autoA.fingerprint)).toHaveLength(1)
    const blocked=make(['P0-03','P0-02']);blocked.weekly.tombstones=[autoA.fingerprint!];const tombstoned=runWeeklyBundle(blocked,new Date('2026-08-17T12:00:00+09:00'),'manual');expect(tombstoned.tasks.some((task)=>task.fingerprint===autoA.fingerprint)).toBe(false)
  })
  it('leaves the previously persisted bundle byte-for-byte unchanged when atomic storage fails',()=>{
    const original=bundle(),serialized=JSON.stringify(original);localStorage.setItem(KEYS.bundle,serialized)
    const next=runWeeklyBundle(original,new Date('2026-08-14T12:00:00+09:00'),'manual'),spy=vi.spyOn(Storage.prototype,'setItem').mockImplementation(()=>{throw new DOMException('quota','QuotaExceededError')})
    expect(saveBundle(next).ok).toBe(false);expect(localStorage.getItem(KEYS.bundle)).toBe(serialized);spy.mockRestore()
  })
})
