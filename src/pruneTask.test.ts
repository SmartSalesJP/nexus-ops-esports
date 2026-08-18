import { describe, expect, it } from 'vitest'
import { bundleToEntities, diffEntities } from './cloud/entities'
import { initialAudit, initialKpis, initialTasks } from './data'
import { pruneTaskReferences } from './pruneTask'
import { validateBundle } from './storage'
import type { ExportBundle, Task } from './types'
import { canonicalFingerprint, emptyWeeklyState } from './weekly'

describe('task deletion pruning',()=>{
  it('prunes every real dependent entity and emits one valid final-state entity batch',()=>{
    const provenance={ruleId:'test',sourceTaskId:'P0-01',dependencyIds:['P0-02']}
    const automatic={...structuredClone(initialTasks[0]),id:'AUTO-2026-W34-99',sourceRefs:[],dependencies:[],createdBy:'esports_progress_control',createdByDepartment:'esports_progress_control',approvalState:'要確認',automationDisabled:false,rationaleCodes:['test'],reason:'test',expectedDeliverable:'test',createdRunId:'weekly:2026-W34',fingerprint:canonicalFingerprint(provenance),provenance} as Task
    const survivor={...structuredClone(initialTasks[0]),id:'P6-99',phase:6 as const,title:'survivor',dependencies:['P0-01']} as Task
    const weekly=emptyWeeklyState()
    weekly.completions['P0-01']={taskId:'P0-01',firstSeen:'2026-08-17T00:00:00.000Z',lastConfirmed:'2026-08-17T00:00:00.000Z',completedWeek:'2026-W34',basis:'status-change',currentStatus:'完了'}
    const source:ExportBundle={schemaVersion:4,exportedAt:'2026-08-17T00:00:00.000Z',tasks:[...structuredClone(initialTasks),automatic,survivor],taskResults:[{id:'task-result:P0-01',taskId:'P0-01',resultBody:'x',verificationState:'未確認',verificationSummary:'',deliverables:[],nextStep:'',completionCriteria:'',verificationMemo:'',updatedAt:'2026-08-17T00:00:00.000Z'}],flow:{nodes:[{id:'manual',position:{x:0,y:0},data:{label:'manual',taskIds:['P0-01','P0-02']}},{id:'single',position:{x:1,y:1},data:{label:'single',taskId:'P0-01'}},{id:'target',position:{x:2,y:2},data:{label:'target',targetType:'task',targetId:'P0-01'}},{id:'weekly-project:task:P0-01',position:{x:3,y:3},data:{label:'managed',targetType:'task',targetId:'P0-01'}},{id:'other',position:{x:4,y:4},data:{label:'other'}}],edges:[{id:'e1',source:'manual',target:'single'},{id:'e2',source:'manual',target:'other',data:{taskIds:['P0-01','P0-02']}},{id:'e3',source:'target',target:'other'},{id:'e4',source:'other',target:'manual',data:{targetType:'task',targetId:'P0-01'}}],viewport:{x:0,y:0,zoom:1}},audit:structuredClone(initialAudit),kpis:structuredClone(initialKpis),reportBaseline:null,migrationArchive:[],weekly}

    const next=pruneTaskReferences(source,'P0-01')
    expect(next.tasks.some((task)=>task.id==='P0-01'||task.id===automatic.id)).toBe(false)
    expect(next.tasks.find((task)=>task.id===survivor.id)?.dependencies).toEqual([])
    expect(next.taskResults).toEqual([])
    expect(next.weekly.completions['P0-01']).toBeUndefined()
    expect(next.flow.nodes.map((node)=>node.id)).toEqual(['manual','other'])
    expect(next.flow.nodes[0].data.taskIds).toEqual(['P0-02'])
    expect(next.flow.edges.map((edge)=>edge.id)).toEqual(['e2'])
    expect(next.flow.edges[0].data?.taskIds).toEqual(['P0-02'])
    expect(validateBundle(next)).toEqual([])

    const changes=diffEntities(bundleToEntities(source).map((entity)=>({...entity,version:4})),next)
    const deleted=new Set(changes.filter((change)=>change.op==='delete').map((change)=>`${change.entityType}:${change.entityId}`))
    expect([...deleted]).toEqual(expect.arrayContaining(['task:P0-01',`task:${automatic.id}`,'task_result:task-result:P0-01','weekly_completion:P0-01','flow_node:single','flow_node:target','flow_node:weekly-project:task:P0-01','flow_edge:e1','flow_edge:e3','flow_edge:e4']))
    expect(changes.filter((change)=>change.op==='upsert').flatMap((change)=>change.references??[]).some((reference)=>reference.entityType==='task'&&(reference.entityId==='P0-01'||reference.entityId===automatic.id))).toBe(false)
  })
})
