import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { initialTasks } from '../data'
import type { Task, ValidationIssue } from '../types'
import { TaskModal } from './TaskModal'

describe('TaskModal UI',()=>{
 it('is an accessible modal and restores focus on Escape',async()=>{const close=vi.fn();const trigger=document.createElement('button');document.body.append(trigger);trigger.focus();render(<TaskModal task={initialTasks[0]} tasks={initialTasks} onClose={close} onSave={()=>[]}/>);expect(screen.getByRole('dialog')).toHaveAttribute('aria-modal','true');await userEvent.keyboard('{Escape}');expect(close).toHaveBeenCalled();trigger.remove()})
 it('shows item validation errors without closing',()=>{render(<TaskModal task={{...initialTasks[0],title:''}} tasks={initialTasks} onClose={vi.fn()} onSave={()=>[{path:'tasks[0].title',message:'空にできません'}]}/>);fireEvent.submit(screen.getByRole('dialog').querySelector('form')!);expect(screen.getByRole('alert')).toHaveTextContent('空にできません')})
 it('has explicit labels for every form control',()=>{const {container}=render(<TaskModal task={initialTasks[0]} tasks={initialTasks} onClose={vi.fn()} onSave={()=>[]}/>);const controls=Array.from(container.querySelectorAll('input,select,textarea'));expect(controls.every((control)=>control.id&&container.querySelector(`label[for="${control.id}"]`))).toBe(true)})
 it('lets users disable an automatic proposal while preserving its provenance',()=>{const provenance={ruleId:'test',sourceTaskId:'P0-01',dependencyIds:[]},auto:Task={...initialTasks[0],id:'AUTO-2026-W33-01',sourceRefs:[],reason:'確認理由',expectedDeliverable:'確認記録',createdBy:'esports_progress_control',createdByDepartment:'esports_progress_control',createdRunId:'weekly:2026-W33',provenance,fingerprint:`progress-control:${JSON.stringify({ruleId:'test',sourceTaskId:'P0-01',dependencyIds:[],kpiId:null})}`,rationaleCodes:['TEST'],approvalState:'要確認',automationDisabled:false},save=vi.fn<(task:Task)=>ValidationIssue[]>().mockReturnValue([]);render(<TaskModal task={auto} tasks={[...initialTasks,auto]} onClose={vi.fn()} onSave={save}/>);fireEvent.click(screen.getByLabelText('この根拠の自動タスクを無効化する'));fireEvent.submit(screen.getByRole('dialog').querySelector('form')!);expect(save.mock.calls[0][0]).toMatchObject({automationDisabled:true,provenance:{ruleId:'test',sourceTaskId:'P0-01',dependencyIds:[]}})})
})
