import { useState } from 'react'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { initialTasks } from '../data'
import type { Status, Task } from '../types'
import { QuestBoard } from './QuestBoard'

const base=structuredClone(initialTasks[0])
const task=(id:string,changes:Partial<Task>={}):Task=>({...structuredClone(base),id,title:`${id}の業務`,owner:'責任者',rawAssignees:'鈴木',assignees:['鈴木'],personKeys:['鈴木'],urgency:'中',deadline:'未定',deadlineDate:undefined,status:'未着手',holdReason:'',dependencies:[],notes:[],updatedAt:'2026-08-24T00:00:00.000Z',...changes})

function Stateful({initial,onAttempt=async()=>({ok:true})}:{initial:Task[];onAttempt?:(id:string,status:Status)=>Promise<{ok:boolean;issues?:string[]}>}){
  const [tasks,setTasks]=useState(initial)
  return <QuestBoard tasks={tasks} onStatus={async(id,status)=>{const result=await onAttempt(id,status);if(result.ok)setTasks((current)=>current.map((item)=>item.id===id?{...item,status,updatedAt:'2026-08-24T01:00:00.000Z'}:item));return result}}/>
}

function StatefulWithUnrelatedRerender({initial}:{initial:Task[]}){
  const [tasks,setTasks]=useState(initial),[renderCount,setRenderCount]=useState(0)
  return <><button type="button" onClick={()=>{setTasks((current)=>[...current]);setRenderCount((value)=>value+1)}}>無関係な再描画 {renderCount}</button><QuestBoard tasks={tasks} onStatus={async(id,status)=>{setTasks((current)=>current.map((item)=>item.id===id?{...item,status,updatedAt:'2026-08-24T01:00:00.000Z'}:item));return{ok:true}}}/></>
}

describe('QuestBoard',()=>{
  it('starts with every assignee overview including dynamic and unassigned next actions',()=>{
    render(<QuestBoard tasks={[task('A'),task('B',{rawAssignees:'学生スタッフ（当日）',assignees:['学生スタッフ（当日）'],personKeys:[]}),task('C',{rawAssignees:'',assignees:[],personKeys:[]})]} onStatus={vi.fn()}/>)
    expect(screen.getByRole('heading',{name:'全担当者の次アクション'})).toBeVisible()
    expect(screen.getByRole('button',{name:'鈴木さんの実行順を開く'})).toBeVisible()
    expect(screen.getByRole('button',{name:'学生スタッフさんの実行順を開く'})).toBeVisible()
    expect(screen.getByRole('button',{name:'未割当の実行順を開く'})).toBeVisible()
    expect(screen.getAllByText('#1 システム推奨').length).toBeGreaterThanOrEqual(3)
  })

  it('opens an assignee detail with now, ordered next, waiting and collapsed completion log',async()=>{
    const user=userEvent.setup(),tasks=[task('A',{urgency:'高',status:'進行中'}),task('B'),task('C',{dependencies:['A']}),task('D',{status:'保留',holdReason:'承認待ち'}),task('E',{status:'完了'})]
    render(<QuestBoard tasks={tasks} onStatus={vi.fn().mockResolvedValue({ok:true})}/>)
    await user.click(screen.getByRole('button',{name:'鈴木さんの実行順を開く'}))
    expect(screen.getByRole('heading',{name:'鈴木さんの実行順'})).toBeVisible()
    const now=screen.getByRole('heading',{name:'今やる'}).closest('section')!;expect(within(now).getByText('Aの業務')).toBeVisible();expect(within(now).getByText('#1 システム推奨')).toBeVisible()
    const next=screen.getByRole('heading',{name:'次にやる'}).closest('section')!;expect(within(next).getByText('Bの業務')).toBeVisible();expect(within(next).getByText('#2')).toBeVisible()
    const waiting=screen.getByRole('heading',{name:/解除待ち/}).closest('section')!;expect(within(waiting).getByText(/A Aの業務 の完了待ち/)).toBeVisible();expect(within(waiting).getByText(/保留: 承認待ち/)).toBeVisible()
    const log=screen.getByText(/完了ログ/).closest('details')!;expect(log).not.toHaveAttribute('open');expect(within(log).getByText('Eの業務')).toBeInTheDocument()
  })

  it('lets an editor complete now, reranks only after success, announces and focuses the new number one',async()=>{
    const user=userEvent.setup();render(<Stateful initial={[task('A',{urgency:'高'}),task('B')]}/>)
    await user.click(screen.getByRole('button',{name:'鈴木さんの実行順を開く'}));const select=within(screen.getByRole('heading',{name:'今やる'}).closest('section')!).getByLabelText('状態');await user.selectOptions(select,'完了')
    await vi.waitFor(()=>expect(document.querySelector<HTMLElement>('[data-quest-now="true"]')).toHaveAttribute('data-task-id','B'))
    await vi.waitFor(()=>expect(document.querySelector<HTMLElement>('[data-quest-now="true"]')).toHaveFocus())
    expect(screen.getByRole('status')).toHaveTextContent('Aを「完了」に変更しました。次の「今やる」はBです。')
  })

  it('keeps rank, value and focus when persistence or a completion gate fails',async()=>{
    const user=userEvent.setup(),attempt=vi.fn().mockResolvedValue({ok:false,issues:['完了には確認済みチェックリストが必要です']});render(<Stateful initial={[task('A'),task('B')]} onAttempt={attempt}/>)
    await user.click(screen.getByRole('button',{name:'鈴木さんの実行順を開く'}));const select=within(screen.getByRole('heading',{name:'今やる'}).closest('section')!).getByLabelText('状態');select.focus();await user.selectOptions(select,'完了')
    expect(await screen.findByRole('alert')).toHaveTextContent('完了には確認済みチェックリストが必要です');expect(select).toHaveValue('未着手');expect(select).toHaveFocus();expect(document.querySelector('[data-quest-now="true"]')).toHaveAttribute('data-task-id','A')
    const back=screen.getByRole('button',{name:'全担当者へ戻る'});back.focus();document.dispatchEvent(new Event('visibilitychange'));await new Promise((resolve)=>requestAnimationFrame(resolve));expect(back).toHaveFocus()
  })

  it('requires a meaningful hold reason and sends it through the shared status route',async()=>{
    const user=userEvent.setup(),save=vi.fn().mockResolvedValue({ok:true});render(<QuestBoard tasks={[task('A')]} onStatus={save}/>)
    await user.click(screen.getByRole('button',{name:'鈴木さんの実行順を開く'}));await user.selectOptions(screen.getByLabelText('状態'),'保留');const reason=screen.getByLabelText('保留理由 / 解除条件'),button=screen.getByRole('button',{name:'理由と状態を保存'});expect(button).toBeDisabled();await user.type(reason,'承認待ち');await user.click(button);expect(save).toHaveBeenCalledWith('A','保留','承認待ち')
  })

  it('is browse-only for viewers and never calls persistence',async()=>{
    const user=userEvent.setup(),save=vi.fn();render(<QuestBoard tasks={[task('A')]} readOnly onStatus={save}/>)
    await user.click(screen.getByRole('button',{name:'鈴木さんの実行順を開く'}));expect(screen.queryByLabelText('状態')).not.toBeInTheDocument();expect(screen.getByText('状態 未着手')).toBeVisible();expect(save).not.toHaveBeenCalled()
  })

  it('supports keyboard overview selection and returning to the overview',async()=>{
    const user=userEvent.setup();render(<QuestBoard tasks={[task('A')]} onStatus={vi.fn()}/>)
    const open=screen.getByRole('button',{name:'鈴木さんの実行順を開く'});open.focus();await user.keyboard('{Enter}');expect(screen.getByRole('heading',{name:'鈴木さんの実行順'})).toBeVisible();await user.click(screen.getByRole('button',{name:'全担当者へ戻る'}));expect(screen.getByRole('heading',{name:'全担当者の次アクション'})).toBeVisible();await vi.waitFor(()=>expect(screen.getByRole('button',{name:'鈴木さんの実行順を開く'})).toHaveFocus())
  })

  it('focuses the new number one when the previous number one moves to waiting, and keeps the same task for other transitions',async()=>{
    const user=userEvent.setup();render(<Stateful initial={[task('A',{urgency:'高'}),task('B')]}/>)
    await user.click(screen.getByRole('button',{name:'鈴木さんの実行順を開く'}))
    await user.selectOptions(screen.getByRole('combobox',{name:'Aの業務の状態'}),'進行中')
    await vi.waitFor(()=>expect(screen.getByRole('article',{name:'Aの業務'})).toHaveFocus())
    expect(screen.getByRole('status')).toBeEmptyDOMElement()
    await user.selectOptions(screen.getByRole('combobox',{name:'Aの業務の状態'}),'未着手')
    await vi.waitFor(()=>expect(screen.getByRole('article',{name:'Aの業務'})).toHaveFocus())
    await user.selectOptions(screen.getByRole('combobox',{name:'Aの業務の状態'}),'保留')
    await user.type(screen.getByLabelText('保留理由 / 解除条件'),'承認待ち')
    await user.click(screen.getByRole('button',{name:'理由と状態を保存'}))
    await vi.waitFor(()=>expect(screen.getByRole('article',{name:'Bの業務'})).toHaveFocus())
    expect(screen.getByRole('status')).toHaveTextContent('Aを「保留」に変更しました。次の「今やる」はBです。')
  })

  it('consumes a successful focus and live request once across unrelated and visibility rerenders',async()=>{
    const user=userEvent.setup();render(<StatefulWithUnrelatedRerender initial={[task('A',{urgency:'高'}),task('B')]}/>)
    await user.click(screen.getByRole('button',{name:'鈴木さんの実行順を開く'}));await user.selectOptions(screen.getByRole('combobox',{name:'Aの業務の状態'}),'完了')
    await vi.waitFor(()=>expect(screen.getByRole('article',{name:'Bの業務'})).toHaveFocus())
    const live=screen.getByRole('status'),mutations:MutationRecord[]=[];const observer=new MutationObserver((records)=>mutations.push(...records));observer.observe(live,{childList:true,characterData:true,subtree:true})
    const rerender=screen.getByRole('button',{name:/無関係な再描画/});await user.click(rerender);expect(rerender).toHaveFocus();document.dispatchEvent(new Event('visibilitychange'));await new Promise((resolve)=>requestAnimationFrame(resolve));expect(rerender).toHaveFocus();expect(mutations).toHaveLength(0);observer.disconnect()
  })

  it('uses task-specific accessible names and concrete adjacent ranking reasons without zero-unlock or English ready text',async()=>{
    const user=userEvent.setup(),result=vi.fn();render(<QuestBoard tasks={[task('A',{urgency:'高'}),task('B')]} onStatus={vi.fn().mockResolvedValue({ok:true})} onResult={result}/>)
    await user.click(screen.getByRole('button',{name:'鈴木さんの実行順を開く'}))
    expect(screen.getByRole('article',{name:'Aの業務'})).toBeVisible()
    expect(screen.getByRole('combobox',{name:'Aの業務の状態'})).toBeVisible()
    await user.click(screen.getByRole('button',{name:'Aの業務の成果シート'}));expect(result).toHaveBeenCalled()
    expect(screen.getByText(/Bより緊急度が高い/)).toBeVisible()
    expect(screen.queryByText(/0件を直接/)).not.toBeInTheDocument()
    expect(document.body).not.toHaveTextContent(/ready/i)
    expect(screen.getByRole('group',{name:'Aの業務の順番の理由'})).toBeInTheDocument()
  })

  it('shows five next tasks initially and loads ten more while preserving ordered ranks',async()=>{
    const user=userEvent.setup(),tasks=Array.from({length:17},(_item,index)=>task(String.fromCharCode(65+index)))
    render(<QuestBoard tasks={tasks} onStatus={vi.fn().mockResolvedValue({ok:true})}/>)
    await user.click(screen.getByRole('button',{name:'鈴木さんの実行順を開く'}))
    const next=screen.getByRole('heading',{name:'次にやる'}).closest('section')!
    expect(within(next).getAllByRole('listitem')).toHaveLength(5)
    expect(within(next).getByText('#6')).toBeVisible()
    await user.click(within(next).getByRole('button',{name:'次の10件を表示（残り11件）'}))
    expect(within(next).getAllByRole('listitem')).toHaveLength(15)
    expect(within(next).getByText('#16')).toBeVisible()
    expect(within(next).getByRole('button',{name:'次の1件を表示（残り1件）'})).toBeVisible()
  })

  it('distinguishes locked work from a truly completed assignee',()=>{
    render(<QuestBoard tasks={[task('A',{status:'保留',holdReason:'承認待ち'}),task('B',{status:'完了',rawAssignees:'ユウタ',assignees:['ユウタ'],personKeys:['ユウタ']})]} onStatus={vi.fn()}/>)
    const locked=screen.getByRole('heading',{name:'鈴木'}).closest('article')!,complete=screen.getByRole('heading',{name:'ユウタ'}).closest('article')!
    expect(within(locked).getByText('今すぐ着手できません')).toBeVisible();expect(locked).not.toHaveClass('is-complete')
    expect(within(complete).getByText('担当タスクはすべて完了')).toBeVisible();expect(complete).toHaveClass('is-complete')
  })

  it('refreshes the deadline at JST midnight and on visibility wake without writing, then clears its timer',()=>{
    vi.useFakeTimers();vi.setSystemTime(new Date('2026-08-24T14:59:59.000Z'));const save=vi.fn(),view=render(<QuestBoard tasks={[task('A',{deadlineDate:'2026-08-24'})]} onStatus={save}/>)
    fireEvent.click(screen.getByRole('button',{name:'鈴木さんの実行順を開く'}));expect(screen.getByText('本日期限')).toBeVisible()
    act(()=>vi.advanceTimersByTime(1_100));expect(screen.getByText('1日超過')).toBeVisible()
    act(()=>{vi.setSystemTime(new Date('2026-08-26T03:00:00.000Z'));document.dispatchEvent(new Event('visibilitychange'))});expect(screen.getByText('2日超過')).toBeVisible();expect(save).not.toHaveBeenCalled()
    view.unmount();expect(vi.getTimerCount()).toBe(0);vi.useRealTimers()
  })

  it('renders a 500-dynamic-assignee overview from the pre-indexed queues in under two seconds',()=>{
    const tasks=Array.from({length:500},(_item,index)=>task(`D${index}`,{rawAssignees:`担当${index}`,assignees:[`担当${index}`],personKeys:[]})),started=performance.now();render(<QuestBoard tasks={tasks} onStatus={vi.fn()}/>);const elapsed=performance.now()-started
    expect(screen.getByRole('button',{name:'担当499さんの実行順を開く'})).toBeVisible();expect(elapsed).toBeLessThan(2_000)
  })
})
