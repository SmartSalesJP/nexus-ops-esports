import { describe, expect, it } from 'vitest'
import { initialTasks } from './data'
import { buildQuestOrder, questAssigneeKeys, questComparisonReason, questsForAssignee, taskDeadlineState, UNASSIGNED_QUEST_KEY } from './questOrder'
import type { Task } from './types'

const reference=new Date('2026-08-24T12:00:00+09:00')
const base=structuredClone(initialTasks[0])
const task=(id:string,changes:Partial<Task>={}):Task=>({...structuredClone(base),id,title:id,phase:0,owner:'責任者',rawAssignees:'鈴木',assignees:['鈴木'],personKeys:['鈴木'],urgency:'中',deadline:'未定',deadlineDate:undefined,status:'未着手',holdReason:'',dependencies:[],notes:[],updatedAt:'2026-08-24T00:00:00.000Z',...changes})

describe('quest order engine',()=>{
  it('normalizes major, shared, dynamic and unassigned assignees without adding owners',()=>{
    expect(questAssigneeKeys(task('A',{owner:'ロブ',rawAssignees:'鈴木、鈴木（窓口）、学生スタッフ（当日）',assignees:['鈴木','鈴木（窓口）','学生スタッフ（当日）'],personKeys:['鈴木']}))).toEqual(['鈴木','学生スタッフ'])
    expect(questAssigneeKeys(task('B',{rawAssignees:'全員',assignees:['全員'],personKeys:['鈴木','ユウタ','ウメノ','ロブ','浜名','ウニュ','原田','スン']}))).not.toContain('全員')
    expect(questAssigneeKeys(task('C',{owner:'鈴木',rawAssignees:'',assignees:[],personKeys:[]}))).toEqual([UNASSIGNED_QUEST_KEY])
  })

  it('uses exact deadline bands at overdue, today, seven, eight and unknown boundaries',()=>{
    expect(taskDeadlineState(task('A',{deadlineDate:'2026-08-23'}),reference).kind).toBe('overdue')
    expect(taskDeadlineState(task('B',{deadlineDate:'2026-08-24'}),reference).kind).toBe('today')
    expect(taskDeadlineState(task('C',{deadlineDate:'2026-08-31'}),reference).kind).toBe('soon')
    expect(taskDeadlineState(task('D',{deadlineDate:'2026-09-01'}),reference).kind).toBe('future')
    expect(taskDeadlineState(task('E'),reference).kind).toBe('unknown')
    expect(taskDeadlineState(task('F',{deadlineDate:'2026-08-24'}),new Date('2026-08-23T14:59:59Z')).kind).toBe('soon')
    expect(taskDeadlineState(task('G',{deadlineDate:'2026-08-24'}),new Date('2026-08-23T15:00:00Z')).kind).toBe('today')
  })

  it('sorts ready tasks by deadline band, urgency, status, unlock count, date, phase and ASCII id',()=>{
    const tasks=[
      task('Z',{deadlineDate:'2026-08-23',urgency:'低'}),
      task('P',{deadlineDate:'2026-08-24',urgency:'高',status:'未着手'}),
      task('O',{deadlineDate:'2026-08-24',urgency:'高',status:'進行中'}),
      task('D',{deadlineDate:'2026-08-25',urgency:'中'}),
      task('C',{deadlineDate:'2026-08-25',urgency:'中'}),
      task('W',{dependencies:['C']}),
      task('N',{urgency:'高'}),
    ]
    expect(buildQuestOrder(tasks,reference).ready.map((entry)=>entry.task.id)).toEqual(['Z','O','P','C','D','N'])
    expect(buildQuestOrder(tasks,reference).ready.find((entry)=>entry.task.id==='C')?.unlockCount).toBe(1)
    const ids=(values:Task[])=>buildQuestOrder(values,reference).ready.map((entry)=>entry.task.id)
    expect(ids([task('LOW',{deadlineDate:'2026-08-24',urgency:'低'}),task('HIGH',{deadlineDate:'2026-08-24',urgency:'高'})])).toEqual(['HIGH','LOW'])
    expect(ids([task('NOT-STARTED',{deadlineDate:'2026-08-24',urgency:'高'}),task('IN-PROGRESS',{deadlineDate:'2026-08-24',urgency:'高',status:'進行中'})])).toEqual(['IN-PROGRESS','NOT-STARTED'])
    expect(ids([task('EARLY',{deadlineDate:'2026-08-25'}),task('UNLOCK',{deadlineDate:'2026-08-26'}),task('WAITER',{dependencies:['UNLOCK']})])).toEqual(['UNLOCK','EARLY'])
    expect(ids([task('LATE',{deadlineDate:'2026-08-26'}),task('EARLY',{deadlineDate:'2026-08-25'})])).toEqual(['EARLY','LATE'])
    expect(ids([task('PHASE-1',{deadlineDate:'2026-08-25',phase:1}),task('PHASE-0',{deadlineDate:'2026-08-25',phase:0})])).toEqual(['PHASE-0','PHASE-1'])
    expect(ids([task('ASCII-B',{deadlineDate:'2026-08-25'}),task('ASCII-A',{deadlineDate:'2026-08-25'})])).toEqual(['ASCII-A','ASCII-B'])
  })

  it('keeps waiting tasks out of ready and promotes a dependent only after confirmed completion',()=>{
    const dependency=task('A',{deadlineDate:'2026-08-30'}),dependent=task('B',{dependencies:['A'],deadlineDate:'2026-08-24',urgency:'高'})
    const before=buildQuestOrder([dependent,dependency],reference)
    expect(before.ready.map((entry)=>entry.task.id)).toEqual(['A'])
    expect(before.waiting[0].waitingReasons[0]).toContain('A A の完了待ち')
    const after=buildQuestOrder([dependent,{...dependency,status:'完了'}],reference)
    expect(after.ready.map((entry)=>entry.task.id)).toEqual(['B'])
  })

  it('reports hold and dependency reasons together',()=>{
    const order=buildQuestOrder([task('A'),task('B',{status:'保留',holdReason:'承認待ち',dependencies:['A']})],reference)
    expect(order.waiting[0].waitingReasons).toEqual(['保留: 承認待ち','A A の完了待ち'])
  })

  it('reports missing, self and multi-node cycles with explicit paths and always terminates',()=>{
    const source=[task('A',{dependencies:['B']}),task('B',{dependencies:['A']}),task('C',{dependencies:['C']}),task('D',{dependencies:['MISSING']})],order=buildQuestOrder(source,reference)
    expect(order.ready).toHaveLength(0)
    expect(order.waiting.find((entry)=>entry.task.id==='A')?.waitingReasons.join(' ')).toContain('循環依存: A → B → A')
    expect(order.waiting.find((entry)=>entry.task.id==='C')?.waitingReasons.join(' ')).toContain('循環依存: C → C')
    expect(order.waiting.find((entry)=>entry.task.id==='D')?.waitingReasons).toContain('欠落依存 MISSING: タスクが存在しません')
    expect(buildQuestOrder([...source].reverse(),reference).waiting.map((entry)=>[entry.task.id,entry.cyclePath])).toEqual(order.waiting.map((entry)=>[entry.task.id,entry.cyclePath]))
  })

  it('moves completed work to the completion log and keeps disabled automation in the authoritative quest set',()=>{
    const order=buildQuestOrder([task('A',{status:'完了',updatedAt:'2026-08-24T00:00:00.000Z'}),task('D',{status:'完了',updatedAt:'2026-08-25T00:00:00+09:00'}),task('B',{automationDisabled:true}),task('C')],reference)
    expect(order.ready.map((entry)=>entry.task.id)).toEqual(['B','C'])
    expect(order.completed.map((entry)=>entry.task.id)).toEqual(['D','A'])
    expect(order.entries.find((entry)=>entry.task.id==='B')?.task.automationDisabled).toBe(true)
  })

  it('explains the first comparator difference against the adjacent lower task',()=>{
    const order=buildQuestOrder([task('A',{deadlineDate:'2026-08-24'}),task('B',{deadlineDate:'2026-08-25'}),task('C',{deadlineDate:'2026-08-25'})],reference)
    expect(questComparisonReason(order.ready[0],order.ready[1])).toBe('Bより期限帯が高い')
    expect(questComparisonReason(order.ready[1],order.ready[2])).toBe('Cと同条件のためID順で先')
  })

  it('projects one shared task once into each assignee queue',()=>{
    const shared=task('A',{rawAssignees:'鈴木、ユウタ',assignees:['鈴木','ユウタ'],personKeys:['鈴木','ユウタ']}),order=buildQuestOrder([shared],reference)
    expect(questsForAssignee(order,'鈴木').ready.map((entry)=>entry.task.id)).toEqual(['A'])
    expect(questsForAssignee(order,'ユウタ').ready.map((entry)=>entry.task.id)).toEqual(['A'])
    expect(order.entries.map((entry)=>entry.task.id)).toEqual(['A'])
  })

  it('is permutation invariant, uses ID as a unique tie-break and never mutates input',()=>{
    const original=[task('C'),task('A'),task('B')],snapshot=structuredClone(original)
    const forward=buildQuestOrder(original,reference).ready.map((entry)=>entry.task.id),reverse=buildQuestOrder([...original].reverse(),reference).ready.map((entry)=>entry.task.id)
    expect(forward).toEqual(['A','B','C']);expect(reverse).toEqual(forward);expect(original).toEqual(snapshot)
  })

  it('handles 500 tasks with up to 256 dependencies in under one second',()=>{
    const tasks=Array.from({length:500},(_,index)=>task(`T${String(index).padStart(3,'0')}`,{dependencies:Array.from({length:Math.min(index,256)},(_item,offset)=>`T${String(index-offset-1).padStart(3,'0')}`)}))
    const started=performance.now(),order=buildQuestOrder(tasks,reference),elapsed=performance.now()-started
    expect(order.entries).toHaveLength(500);expect(elapsed).toBeLessThan(1000)
  })
})
