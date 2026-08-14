import { render } from '@testing-library/react'
import { axe, toHaveNoViolations } from 'jest-axe'
import { expect, it, vi } from 'vitest'
import { initialTasks } from './data'
import { TaskBoard } from './components/TaskBoard'
import { TaskModal } from './components/TaskModal'
import App from './App'
expect.extend(toHaveNoViolations)
const common={tasks:initialTasks,view:'list' as const,search:'',department:'',status:'',phase:'0',person:'',dueView:'' as const,groupByTeam:false,setSearch:vi.fn(),setDepartment:vi.fn(),setStatus:vi.fn(),setPhase:vi.fn(),setPerson:vi.fn(),setDueView:vi.fn(),onAdd:vi.fn(),onEdit:vi.fn(),onDelete:vi.fn(),onStatus:vi.fn()}
it('has no detectable accessibility violations in task board',async()=>{const {container}=render(<TaskBoard {...common}/>);expect(await axe(container)).toHaveNoViolations()})
it('has no detectable accessibility violations in task modal',async()=>{const {container}=render(<TaskModal task={initialTasks[0]} tasks={initialTasks} onClose={vi.fn()} onSave={()=>[]}/>);expect(await axe(container)).toHaveNoViolations()})
it('has no detectable accessibility violations in the integrated app',async()=>{localStorage.clear();const {container}=render(<App/>);expect(await axe(container)).toHaveNoViolations()})
