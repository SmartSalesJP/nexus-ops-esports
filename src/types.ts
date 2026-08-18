import type { Edge, Node, Viewport } from '@xyflow/react'

export const organizationUnits = [
  { id: 'ops-hq', name: '運営本部', owner: '鈴木', aliases: ['運営本部'] },
  { id: 'operations', name: '運営チーム', owner: 'ウメノ', aliases: ['運営チーム'] },
  { id: 'planning', name: '企画チーム', owner: 'ウメノ', aliases: ['企画チーム'] },
  { id: 'tournament-admin', name: '大会運営チーム（Tournament Admin）', owner: 'ウメノ', aliases: ['大会運営', '大会運営チーム'] },
  { id: 'casting-relations', name: 'キャスティング・渉外チーム', owner: 'ロブ', aliases: ['キャスティング', 'キャスティング・渉外'] },
  { id: 'sales', name: '営業チーム', owner: 'ユウタ', aliases: ['営業チーム'] },
  { id: 'partnerships', name: 'パートナーシップチーム', owner: '鈴木', aliases: ['パートナーシップ'] },
  { id: 'pr-marketing', name: '広報・マーケティングチーム', owner: '浜名', aliases: ['広報・マーケ'] },
  { id: 'broadcast', name: '映像・配信チーム', owner: 'ロブ', aliases: ['映像・配信'] },
  { id: 'creative', name: 'クリエイティブチーム', owner: '鈴木', aliases: ['クリエイティブ'] },
  { id: 'community', name: 'コミュニティ運営チーム', owner: 'ウメノ', aliases: ['コミュニティ運営'] },
  { id: 'education', name: '教育・育成チーム', owner: 'ウメノ', aliases: ['教育・育成'] },
  { id: 'administration', name: '管理部', owner: 'ウニュ', aliases: ['管理部'] },
] as const

export const statuses = ['未着手', '進行中', '完了', '保留'] as const
export const urgencies = ['高', '中', '低'] as const
export const people = ['鈴木', 'ユウタ', 'ウメノ', 'ロブ', '浜名', 'ウニュ', '原田', 'スン'] as const
export const sourceConfidences = ['high', 'medium', 'low'] as const
export const departmentIds=organizationUnits.map((unit)=>unit.id)
export type DepartmentId = typeof organizationUnits[number]['id']
export type Department = typeof organizationUnits[number]['name']
export type Status = typeof statuses[number]
export type Urgency = typeof urgencies[number]
export type SourceConfidence = typeof sourceConfidences[number]

export interface SourceRef {
  sourceId: 'S1' | 'S2' | 'S3' | 'S4'
  fileName: string
  sha256: string
  lineStart: number
  lineEnd: number
  asOf: string
  confidence: SourceConfidence
}

export interface Task {
  id: string
  title: string
  phase: 0 | 1 | 2 | 3 | 4 | 5 | 6
  teamId: DepartmentId
  team: Department
  rawTeam: string
  owner: string
  assignees: string[]
  rawAssignees: string
  personKeys: string[]
  urgency: Urgency
  deadline: string
  deadlineDate?: string
  status: Status
  holdReason: string
  dependencies: string[]
  notes: string[]
  sourceRefs: SourceRef[]
  updatedAt: string
  reason?: string
  expectedDeliverable?: string
  createdBy?: 'esports_progress_control'
  createdByDepartment?: 'esports_progress_control'
  createdRunId?: string
  provenance?: AutoTaskProvenance
  fingerprint?: string
  rationaleCodes?: string[]
  approvalState?: '要確認' | '承認' | '却下'
  automationDisabled?: boolean
}

export const verificationStates=['未確認','確認中','適合','要修正','確認不能'] as const
export const deliverableTypes=['excel','google-sheets','google-docs','notion','url','file','other'] as const
export const deliverableAccessStates=['未確認','利用可能','権限不足','リンク切れ'] as const
export type VerificationState=typeof verificationStates[number]
export type DeliverableType=typeof deliverableTypes[number]
export type DeliverableAccessState=typeof deliverableAccessStates[number]
export interface Deliverable { id:string; title:string; type:DeliverableType; href:string; note?:string; accessState:DeliverableAccessState; lastCheckedAt?:string }
export interface TaskResultSheet { id:`task-result:${string}`; taskId:string; resultBody:string; verificationState:VerificationState; verificationSummary:string; verifiedBy?:string; verifiedAt?:string; deliverables:Deliverable[]; nextStep:string; completionCriteria:string; verificationMemo:string; updatedAt:string }

export interface AutoTaskProvenance { ruleId:string; sourceTaskId?:string; dependencyIds:string[]; kpiId?:KpiValue['id'] }

export interface KpiValue { id: 'concurrent'|'pv'|'profit'|'sponsors'|'schools'|'participants'; label:string; target:number; unit:string; actual:number|null }
export interface ReportSnapshot { savedAt:string; statuses:Record<string,{status:Status;updatedAt:string}> }
export interface MigrationArchive { fromSchema: number; migratedAt:string; reason:string; tasks:unknown[] }

export const auditClassifications = ['data','validation','persistence','accessibility','quality','security','runtime'] as const
export type AuditClassification = typeof auditClassifications[number]
export interface AuditItem { id:string; issueId:string; classification:AuditClassification; targetVersion:string; files:string[]; before:string; after:string; evidence:string[]; retest:string; residualRisk:string; round:number; at:string; action:string; detail:string }
export interface FlowData { nodes:Node[]; edges:Edge[]; viewport:Viewport }
export interface CompletionHistory { taskId:string; firstSeen:string; lastConfirmed:string; completedWeek:string; basis:'status-change'|'inferred-from-updatedAt'; currentStatus:Status }
export interface WeeklySnapshot { completed:number; total:number; phaseProgress:Record<string,{completed:number;total:number;rate:number}>; highUrgencyRemaining:number; blockers:number; kpis:KpiValue[] }
export interface WeeklyRun {
  runId:string
  scheduledFor:string
  ranAt:string
  trigger:'scheduled'|'catch-up'|'manual'
  missedWeekCount:number
  addedStickyCount:number
  autoTaskCount:number
  outcome:'success'
  reasons:string[]
  snapshot:WeeklySnapshot
}
export interface WeeklyState { lastRun:WeeklyRun|null; runs:WeeklyRun[]; completions:Record<string,CompletionHistory>; tombstones:string[] }
export interface ExportBundle { schemaVersion:4; exportedAt:string; tasks:Task[]; taskResults?:TaskResultSheet[]; flow:FlowData; audit:AuditItem[]; kpis:KpiValue[]; reportBaseline:ReportSnapshot|null; migrationArchive:MigrationArchive[]; weekly:WeeklyState }
export interface ValidationIssue { path:string; message:string }
export interface LoadResult<T> { ok:boolean; value:T; error?:string; raw?:string }

export const departmentName=(id:DepartmentId)=>organizationUnits.find((unit)=>unit.id===id)?.name
export const departmentIdFor=(name:string):DepartmentId|undefined=>organizationUnits.find((unit)=>unit.name===name||unit.aliases.some((alias)=>alias===name))?.id
export const normalizeDepartmentName=(name:string)=>{const id=departmentIdFor(name);return id?departmentName(id):undefined}
