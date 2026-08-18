import { render, screen } from '@testing-library/react'
import { axe, toHaveNoViolations } from 'jest-axe'
import { expect, it, vi } from 'vitest'
import { initialTasks } from './data'
import { TaskBoard } from './components/TaskBoard'
import { TaskModal } from './components/TaskModal'
import App from './App'
import CloudRoot from './cloud/CloudRoot'
expect.extend(toHaveNoViolations)
vi.setConfig({testTimeout:15_000})
const common={tasks:initialTasks,view:'list' as const,search:'',department:'',status:'',phase:'0',person:'',dueView:'' as const,groupByTeam:false,setSearch:vi.fn(),setDepartment:vi.fn(),setStatus:vi.fn(),setPhase:vi.fn(),setPerson:vi.fn(),setDueView:vi.fn(),onAdd:vi.fn(),onEdit:vi.fn(),onDelete:vi.fn(),onStatus:vi.fn()}
it('has no detectable accessibility violations in task board',async()=>{const {container}=render(<TaskBoard {...common}/>);expect(await axe(container)).toHaveNoViolations()})
it('has no detectable accessibility violations in task modal',async()=>{const {container}=render(<TaskModal task={initialTasks[0]} tasks={initialTasks} onClose={vi.fn()} onSave={()=>[]}/>);expect(await axe(container)).toHaveNoViolations()})
it('has no detectable accessibility violations in the integrated app',async()=>{localStorage.clear();const {container}=render(<App/>);expect(await axe(container)).toHaveNoViolations()})
it('has no detectable accessibility violations in the Supabase auth gate',async()=>{localStorage.clear();vi.stubEnv('VITE_SUPABASE_URL','https://example.supabase.co');vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY','sb_publishable_accessibility_test_123456');const {container}=render(<CloudRoot/>);await screen.findByRole('heading',{name:'共有ワークスペースへログイン'});expect(await axe(container)).toHaveNoViolations();vi.unstubAllEnvs()})
