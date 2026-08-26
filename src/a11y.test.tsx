import { fireEvent, render, screen } from '@testing-library/react'
import { axe, toHaveNoViolations } from 'jest-axe'
import { expect, it, vi } from 'vitest'
import { initialTasks } from './data'
import { TaskBoard } from './components/TaskBoard'
import { QuestBoard } from './components/QuestBoard'
import { TaskModal } from './components/TaskModal'
import App from './App'
import CloudRoot from './cloud/CloudRoot'
import { TaskResultSheet } from './components/TaskResultSheet'
import { checklistTemplate } from './checklistTemplates'
import type { Task, TaskResultSheet as TaskResult } from './types'
import { CreateOrganizationDialog } from './components/CreateOrganizationDialog'
import { WorkspaceSettingsDialog } from './components/WorkspaceSettingsDialog'
import type { SupabaseWorkspaceRepository } from './cloud/repository'
import { generateWorkspaceDraft } from './workspace'
expect.extend(toHaveNoViolations)
vi.setConfig({testTimeout:15_000})
const common={tasks:initialTasks,view:'list' as const,search:'',department:'',status:'',phase:'0',person:'',dueView:'' as const,groupByTeam:false,setSearch:vi.fn(),setDepartment:vi.fn(),setStatus:vi.fn(),setPhase:vi.fn(),setPerson:vi.fn(),setDueView:vi.fn(),onAdd:vi.fn(),onEdit:vi.fn(),onDelete:vi.fn(),onStatus:vi.fn()}
it('has no detectable accessibility violations in task board',async()=>{const {container}=render(<TaskBoard {...common}/>);expect(await axe(container)).toHaveNoViolations()})
it('has no detectable accessibility violations in quest overview and detail',async()=>{const {container}=render(<QuestBoard tasks={initialTasks} onStatus={vi.fn().mockResolvedValue({ok:true})}/>);expect(await axe(container)).toHaveNoViolations();fireEvent.click(screen.getByRole('button',{name:'鈴木さんの実行順を開く'}));expect(await axe(container)).toHaveNoViolations()})
it('has no detectable accessibility violations in task modal',async()=>{const {container}=render(<TaskModal task={initialTasks[0]} tasks={initialTasks} onClose={vi.fn()} onSave={()=>[]}/>);expect(await axe(container)).toHaveNoViolations()})
it('has no detectable accessibility violations in the integrated app',async()=>{localStorage.clear();const {container}=render(<App/>);expect(await axe(container)).toHaveNoViolations()})
it('has no detectable accessibility violations in the Supabase auth gate',async()=>{localStorage.clear();vi.stubEnv('VITE_SUPABASE_URL','https://example.supabase.co');vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY','sb_publishable_accessibility_test_123456');const {container}=render(<CloudRoot/>);await screen.findByRole('heading',{name:'共有ワークスペースへログイン'});expect(await axe(container)).toHaveNoViolations();vi.unstubAllEnvs()})
it('has no detectable accessibility violations in the configured local-only mode',async()=>{localStorage.clear();localStorage.setItem('nexus.app.mode.v1','local');vi.stubEnv('VITE_SUPABASE_URL','https://example.supabase.co');vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY','sb_publishable_accessibility_test_123456');const {container}=render(<CloudRoot/>);await screen.findByRole('button',{name:'共有ログインへ切り替える'});expect(await axe(container)).toHaveNoViolations();localStorage.clear();vi.unstubAllEnvs()})
it('has no detectable accessibility violations in organization creation input',async()=>{const repository={createOrganization:vi.fn()} as unknown as SupabaseWorkspaceRepository,{container}=render(<CreateOrganizationDialog repository={repository} onCreated={vi.fn()} onClose={vi.fn()}/>);expect(await axe(container)).toHaveNoViolations()})
it('has no detectable accessibility violations in organization settings',async()=>{const draft=generateWorkspaceDraft({organizationName:'商品開発部',slug:'product-team',projectName:'秋の新商品',purpose:'顧客の声を反映した新商品を安全に発売するための計画です。',knownTasks:'顧客調査\n試作品レビュー',phaseCount:4,phaseTerm:'段階',departmentTerm:'担当',taskTerm:'作業'}),{container}=render(<WorkspaceSettingsDialog profile={draft.profile} config={draft.config} busy={false} onSave={vi.fn()} onClose={vi.fn()}/>);expect(await axe(container)).toHaveNoViolations()})
const milestone=()=>{const source=initialTasks[0],task={...source,id:'AUTO-2026-W33-01',title:'P0-01 マイルストーンチェックリスト作成',sourceRefs:[],provenance:{ruleId:'milestone-checklist',sourceTaskId:'P0-01',dependencyIds:[]},createdBy:'esports_progress_control',createdByDepartment:'esports_progress_control'} as Task;return{source,task}}
const savedResult=(task:Task,checklistItems:TaskResult['checklistItems']):TaskResult=>({id:`task-result:${task.id}`,taskId:task.id,resultBody:'',verificationState:'適合',verificationSummary:'確認済み',deliverables:[],checklistItems,nextStep:'',completionCriteria:'',verificationMemo:'',updatedAt:'2026-08-19T03:00:00.000Z'})
it('has no detectable accessibility violations in the empty milestone checklist',async()=>{const {source,task}=milestone(),{container}=render(<TaskResultSheet task={task} sourceTask={source} value={savedResult(task,[])} onBack={vi.fn()} onSave={vi.fn()}/>);expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();expect(await axe(container)).toHaveNoViolations()})
it('has no detectable accessibility violations after applying the milestone template',async()=>{const {source,task}=milestone(),{container}=render(<TaskResultSheet task={task} sourceTask={source} onBack={vi.fn()} onSave={vi.fn()}/>);fireEvent.click(screen.getByRole('button',{name:'テンプレートを使用'}));expect(await axe(container)).toHaveNoViolations()})
it('has no detectable accessibility violations in a saved completed milestone checklist',async()=>{const {source,task}=milestone(),items=checklistTemplate(task,source).map((item)=>({...item,status:'完了' as const,reviewer:'確認者',reviewedAt:'2026-08-19T03:00:00.000Z',evidenceMemo:'証跡'})),{container}=render(<TaskResultSheet task={task} sourceTask={source} value={savedResult(task,items)} onBack={vi.fn()} onSave={vi.fn()}/>);expect(await axe(container)).toHaveNoViolations()})
