import { describe, expect, it } from 'vitest'
import { initialTasks } from './data'
import { checklistTemplate, milestoneCompletionIssues, milestoneStatusTransitionIssues } from './checklistTemplates'
import type { Task } from './types'

const automatic=(source:Task,id='AUTO-2026-W33-01'):Task=>({...source,id,title:`${source.id} マイルストーンチェックリスト作成`,status:'未着手',sourceRefs:[],provenance:{ruleId:'milestone-checklist',sourceTaskId:source.id,dependencyIds:[]},createdBy:'esports_progress_control',createdByDepartment:'esports_progress_control',expectedDeliverable:'実施項目、受入条件、確認者を含むマイルストーンチェックリスト'})

describe('milestone checklist templates',()=>{
  it.each([
    ['P0-01','YUKISHIROさんへ開催時期変更を連絡する'],
    ['P0-02','スタッフ派遣の必要条件を確認する'],
    ['P0-04','責任者再編案をLINEグループに提示する'],
    ['P0-05','タスク進行表に全タスクを登録する'],
    ['P0-06','隔週進捗報告テンプレートを作成する'],
  ])('provides the reviewed W33 template for %s',(id,first)=>{const source=initialTasks.find((task)=>task.id===id)!,items=checklistTemplate(automatic(source),source);expect(items).toHaveLength(3);expect(items[0].title).toBe(first);expect(items.every((item)=>item.status==='未着手'&&item.reviewer===''&&item.reviewedAt===''&&item.evidenceMemo==='')).toBe(true);expect(new Set(items.map((item)=>item.id)).size).toBe(items.length)})
  it('builds a safe generic template from the source task without reusing AUTO expectedDeliverable',()=>{const source=initialTasks.find((task)=>task.id==='P1-01')!,task=automatic(source,'AUTO-2026-W34-03'),items=checklistTemplate(task,source);expect(items).toHaveLength(3);expect(items[0].title).toContain(source.title);expect(items[1].acceptanceCriteria).toContain(source.title);expect(items[1].acceptanceCriteria).toContain('完了条件を確認');expect(items[1].acceptanceCriteria).not.toContain(task.expectedDeliverable!);expect(items.every((item)=>item.status==='未着手')).toBe(true)})
  it('blocks AUTO completion until every item and the overall verification are complete',()=>{const source=initialTasks[0],task=automatic(source),item={...checklistTemplate(task,source)[0],status:'完了' as const,reviewer:'reviewer',reviewedAt:'2026-08-17T00:00:00.000Z',evidenceMemo:'evidence'},result={id:`task-result:${task.id}` as const,taskId:task.id,resultBody:'',verificationState:'適合' as const,verificationSummary:'',deliverables:[],checklistItems:[item],nextStep:'',completionCriteria:'',verificationMemo:'',updatedAt:'2026-08-17T00:00:00.000Z'};expect(milestoneCompletionIssues(task)).toContainEqual(expect.stringContaining('構造化チェックリスト'));expect(milestoneCompletionIssues(task,{...result,verificationState:'未確認'})).toContainEqual(expect.stringContaining('適合'));expect(milestoneCompletionIssues(task,{...result,checklistItems:[{...item,status:'進行中'}]})).toContainEqual(expect.stringContaining('未完了'));expect(milestoneCompletionIssues(task,result)).toEqual([])})
  it('uses one transition guard while allowing legacy completed tasks to move away from complete',()=>{const task=automatic(initialTasks[0]),completed={...task,status:'完了' as const};expect(milestoneStatusTransitionIssues(task,completed)).toContainEqual(expect.stringContaining('構造化チェックリスト'));expect(milestoneStatusTransitionIssues(completed,{...completed,title:'edited legacy task'})).toEqual([]);expect(milestoneStatusTransitionIssues(completed,{...completed,status:'進行中'})).toEqual([])})
})
