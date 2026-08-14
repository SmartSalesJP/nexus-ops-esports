import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { initialTasks } from '../data'
import { TaskBoard } from './TaskBoard'

const props=()=>({tasks:initialTasks,view:'list' as const,search:'',department:'',status:'',setSearch:vi.fn(),setDepartment:vi.fn(),setStatus:vi.fn(),onAdd:vi.fn(),onEdit:vi.fn(),onDelete:vi.fn(),onStatus:vi.fn()})

describe('TaskBoard UI',()=>{
 it('renders searchable department, source, details, state and timing text',()=>{const value=props();const {rerender}=render(<TaskBoard {...value}/>);fireEvent.change(screen.getByLabelText('タスクを検索'),{target:{value:'S1'}});expect(value.setSearch).toHaveBeenCalledWith('S1');rerender(<TaskBoard {...value} search="S1"/>);expect(screen.getAllByText(/高校・専門学校・大学/).length).toBeGreaterThan(0)})
 it('uses stable department IDs as filter values',()=>{const value=props();render(<TaskBoard {...value}/>);fireEvent.change(screen.getByLabelText('部署で絞り込み'),{target:{value:'administration'}});expect(value.setDepartment).toHaveBeenCalledWith('administration')})
 it('adds data-label to every mobile table cell',()=>{const value=props();const {container}=render(<TaskBoard {...value}/>);const cells=Array.from(container.querySelectorAll('tbody td'));expect(cells.length).toBeGreaterThan(0);expect(cells.every((cell)=>cell.hasAttribute('data-label'))).toBe(true)})
 it('labels every row status select',()=>{const value=props();render(<TaskBoard {...value}/>);const row=screen.getByText(initialTasks[0].title).closest('tr');expect(within(row!).getByLabelText(`${initialTasks[0].title}のステータス`)).toBeInTheDocument()})
})
