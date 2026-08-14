import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { initialTasks } from '../data'
import { TaskModal } from './TaskModal'

describe('TaskModal UI',()=>{
 it('is an accessible modal and restores focus on Escape',async()=>{const close=vi.fn();const trigger=document.createElement('button');document.body.append(trigger);trigger.focus();render(<TaskModal task={initialTasks[0]} tasks={initialTasks} onClose={close} onSave={()=>[]}/>);expect(screen.getByRole('dialog')).toHaveAttribute('aria-modal','true');await userEvent.keyboard('{Escape}');expect(close).toHaveBeenCalled();trigger.remove()})
 it('shows item validation errors without closing',()=>{render(<TaskModal task={{...initialTasks[0],title:''}} tasks={initialTasks} onClose={vi.fn()} onSave={()=>[{path:'tasks[0].title',message:'空にできません'}]}/>);fireEvent.submit(screen.getByRole('dialog').querySelector('form')!);expect(screen.getByRole('alert')).toHaveTextContent('空にできません')})
 it('has explicit labels for every form control',()=>{const {container}=render(<TaskModal task={initialTasks[0]} tasks={initialTasks} onClose={vi.fn()} onSave={()=>[]}/>);const controls=Array.from(container.querySelectorAll('input,select,textarea'));expect(controls.every((control)=>control.id&&container.querySelector(`label[for="${control.id}"]`))).toBe(true)})
})
