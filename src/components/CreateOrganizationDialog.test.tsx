/* eslint-disable @typescript-eslint/no-explicit-any -- repository boundary payload assertions */
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { CreateOrganizationDialog } from './CreateOrganizationDialog'
import type { SupabaseWorkspaceRepository } from '../cloud/repository'

const repository=(createOrganization=vi.fn())=>({createOrganization}) as unknown as SupabaseWorkspaceRepository
const fillValid=async(user:ReturnType<typeof userEvent.setup>)=>{
  await user.type(screen.getByLabelText('組織名'),'新組織')
  await user.type(screen.getByLabelText('識別子（英小文字・数字・ハイフン）'),'new-org')
  await user.type(screen.getByLabelText('プロジェクト名'),'新製品公開')
  await user.type(screen.getByLabelText('目的（20〜4000文字）'),'新製品を安全に公開し、利用者の業務時間を短縮するためのプロジェクトです。')
  await user.type(screen.getByLabelText('既知のタスク（任意・改行区切り）'),'要件を確認する\n設計する\n制作する\n公開する\n振り返る')
}

describe('CreateOrganizationDialog',()=>{
  it('moves focus input -> preview -> error summary and exposes invalid fields',async()=>{
    const user=userEvent.setup()
    render(<CreateOrganizationDialog repository={repository()} onCreated={vi.fn()} onClose={vi.fn()}/>)
    await waitFor(()=>expect(screen.getByLabelText('組織名')).toHaveFocus())
    await user.click(screen.getByRole('button',{name:'作成内容を確認'}))
    await waitFor(()=>expect(screen.getByRole('alert')).toHaveFocus())
    expect(screen.getByLabelText('組織名')).toHaveAttribute('aria-invalid','true')
    await fillValid(user)
    await user.click(screen.getByRole('button',{name:'作成内容を確認'}))
    const heading=await screen.findByRole('heading',{name:'作成内容を確認'})
    await waitFor(()=>expect(heading).toHaveFocus())
    const project=screen.getByLabelText('プロジェクト名')
    await user.clear(project);await user.type(project,'修正した製品公開')
    expect(project).toHaveValue('修正した製品公開')
  })

  it('preserves over-limit text, shows a counter, and rejects normalized duplicate names',async()=>{
    const user=userEvent.setup(),organizations=[{id:'existing',name:'ＮＥＸＵＳ　ＯＰＳ',slug:'existing',status:'active' as const,stateVersion:1,role:'owner' as const}]
    render(<CreateOrganizationDialog repository={repository()} organizations={organizations} onCreated={vi.fn()} onClose={vi.fn()}/>)
    expect(screen.getByRole('heading',{name:'利用中の組織'})).toBeVisible()
    fireEvent.change(screen.getByLabelText('目的（20〜4000文字）'),{target:{value:'あ'.repeat(4001)}})
    expect(screen.getByLabelText('目的（20〜4000文字）')).toHaveValue('あ'.repeat(4001))
    expect(screen.getByText('4001 / 4000文字')).toBeVisible()
    await user.type(screen.getByLabelText('組織名'),'nexus ops')
    await user.click(screen.getByRole('button',{name:'作成内容を確認'}))
    expect(screen.getByRole('alert')).toHaveTextContent('同じ名前の組織が既にあります')
    expect(screen.getByLabelText('目的（20〜4000文字）')).toHaveAttribute('aria-invalid','true')
  })

  it('suppresses duplicate submits, reports real progress, blocks close, and reuses run id on retry',async()=>{
    const user=userEvent.setup(),calls:string[]=[],createOrganization=vi.fn()
      .mockImplementationOnce(async(_input,_draft,runId,onProgress)=>{calls.push(runId);onProgress('組織を保存しています');throw new Error('再読込に失敗しました')})
      .mockImplementationOnce((_input,_draft,runId,onProgress)=>{calls.push(runId);onProgress('初期データを確認しています');return new Promise(()=>undefined)})
    render(<CreateOrganizationDialog repository={repository(createOrganization)} onCreated={vi.fn()} onClose={vi.fn()}/>)
    await fillValid(user);await user.click(screen.getByRole('button',{name:'作成内容を確認'}));await screen.findByRole('heading',{name:'作成内容を確認'})
    const create=screen.getByRole('button',{name:'この内容で組織を作成'})
    await user.click(create)
    expect(await screen.findByRole('alert')).toHaveTextContent('再読込に失敗しました')
    await user.click(create);await user.click(create)
    expect(createOrganization).toHaveBeenCalledTimes(2)
    expect(calls[0]).toBe(calls[1])
    expect(create).toHaveAttribute('aria-disabled','true')
    expect(screen.getByRole('status')).toHaveTextContent('初期データを確認しています')
    await user.click(screen.getByRole('button',{name:'新しい組織の作成を閉じる'}))
    expect(screen.getByRole('status')).toHaveTextContent('作成処理中のため閉じられません')
  })

  it('keeps an unsaved draft unless discard is explicitly confirmed',async()=>{
    const user=userEvent.setup(),onClose=vi.fn(),confirm=vi.spyOn(window,'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true)
    render(<CreateOrganizationDialog repository={repository()} onCreated={vi.fn()} onClose={onClose}/>)
    await user.type(screen.getByLabelText('組織名'),'編集中');await user.keyboard('{Escape}')
    expect(confirm).toHaveBeenCalledTimes(1);expect(onClose).not.toHaveBeenCalled();expect(screen.getByLabelText('組織名')).toHaveValue('編集中')
    await user.click(screen.getByRole('button',{name:'新しい組織の作成を閉じる'}))
    expect(confirm).toHaveBeenCalledTimes(2);expect(onClose).toHaveBeenCalledTimes(1);confirm.mockRestore()
  })

  it('edits owner/deadline, adds and removes tasks, and submits a phase-consistent rekeyed preview',async()=>{
    const user=userEvent.setup();let submitted:any;const createOrganization=vi.fn((_input,draft)=>{submitted=draft;return new Promise(()=>undefined)})
    render(<CreateOrganizationDialog repository={repository(createOrganization)} onCreated={vi.fn()} onClose={vi.fn()}/>)
    await fillValid(user);await user.click(screen.getByRole('button',{name:'作成内容を確認'}));await screen.findByRole('heading',{name:'作成内容を確認'})
    const originalId=screen.getAllByText(/内部ID: C/)[0].textContent
    fireEvent.change(screen.getByLabelText('タスク 1のフェーズ'),{target:{value:'2'}})
    fireEvent.change(screen.getByLabelText('タスク 1の責任者'),{target:{value:'責任者A'}})
    fireEvent.change(screen.getByLabelText('タスク 1の期限'),{target:{value:'2026-09-30'}})
    await user.click(screen.getByRole('button',{name:'タスクを追加'}));expect(screen.getAllByText(/内部ID: C/)).toHaveLength(6)
    await user.click(screen.getAllByRole('button',{name:'削除'}).at(-1)!);expect(screen.getAllByText(/内部ID: C/)).toHaveLength(5)
    await user.click(screen.getByRole('button',{name:'この内容で組織を作成'}))
    expect(submitted.bundle.tasks[0]).toMatchObject({phase:2,owner:'責任者A',deadlineDate:'2026-09-30'});expect(submitted.bundle.tasks[0].id).toMatch(/^C2-/);expect(`内部ID: ${submitted.bundle.tasks[0].id}`).not.toBe(originalId);expect(submitted.bundle.flow.nodes.find((node:any)=>node.id==='phase-2').data.taskIds).toContain(submitted.bundle.tasks[0].id);expect(screen.getByLabelText('タスク 1の責任者')).toBeDisabled()
  })

  it.each(['','   ','\u200b'])('rejects a non-visible preview task owner %#',async(owner)=>{
    const user=userEvent.setup(),createOrganization=vi.fn()
    render(<CreateOrganizationDialog repository={repository(createOrganization)} onCreated={vi.fn()} onClose={vi.fn()}/>)
    await fillValid(user);await user.click(screen.getByRole('button',{name:'作成内容を確認'}));await screen.findByRole('heading',{name:'作成内容を確認'})
    const input=screen.getByLabelText('タスク 1の責任者');fireEvent.change(input,{target:{value:owner}})
    await user.click(screen.getByRole('button',{name:'この内容で組織を作成'}))
    expect(createOrganization).not.toHaveBeenCalled();expect(await screen.findByRole('alert')).toHaveTextContent('責任者は空白・制御文字・ゼロ幅文字だけではない1〜120文字');expect(input).toHaveAttribute('aria-invalid','true')
  })
})
