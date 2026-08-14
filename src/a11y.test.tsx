import { render } from '@testing-library/react'
import { axe, toHaveNoViolations } from 'jest-axe'
import { expect, it, vi } from 'vitest'
import { initialTasks } from './data'
import { TaskBoard } from './components/TaskBoard'
import { TaskModal } from './components/TaskModal'

expect.extend(toHaveNoViolations)
const common={tasks:initialTasks,view:'list' as const,search:'',department:'',status:'',setSearch:vi.fn(),setDepartment:vi.fn(),setStatus:vi.fn(),onAdd:vi.fn(),onEdit:vi.fn(),onDelete:vi.fn(),onStatus:vi.fn()}

it('has no detectable accessibility violations in task list',async()=>{const {container}=render(<TaskBoard {...common}/>);expect(await axe(container)).toHaveNoViolations()})
it('has no detectable accessibility violations in task modal',async()=>{const {container}=render(<TaskModal task={initialTasks[0]} tasks={initialTasks} onClose={vi.fn()} onSave={()=>[]}/>);expect(await axe(container)).toHaveNoViolations()})
