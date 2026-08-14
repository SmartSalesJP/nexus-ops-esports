import type { Edge, Node, Viewport } from '@xyflow/react'

export const organizationUnits = [
  { id: 'ops-hq', name: '運営本部' },
  { id: 'operations', name: '運営' },
  { id: 'planning', name: '企画' },
  { id: 'tournament-admin', name: '大会運営' },
  { id: 'casting-relations', name: 'キャスティング・渉外' },
  { id: 'sales', name: '営業' },
  { id: 'partnerships', name: 'パートナーシップ' },
  { id: 'pr-marketing', name: '広報・マーケティング' },
  { id: 'broadcast', name: '映像・配信' },
  { id: 'creative', name: 'クリエイティブ' },
  { id: 'community', name: 'コミュニティ運営' },
  { id: 'education', name: '教育・育成' },
  { id: 'administration', name: '管理部' },
] as const

export const departments = organizationUnits.map((unit) => unit.name)
export const departmentIds = organizationUnits.map((unit) => unit.id)
export const statuses = ['未着手', '進行中', 'レビュー', '完了'] as const
export const priorities = ['緊急', '高', '中', '低'] as const
export const assignmentStatuses = ['確定', '未確定', '要再確認'] as const
export const dateStatuses = ['将来', '期限内', '期限超過', '年未確定', '要再確認'] as const
export const publicationStatuses = ['公開可', '非公開', '公開可否未確定'] as const
export const sourceConfidences = ['high', 'medium', 'low'] as const

export type Department = typeof organizationUnits[number]['name']
export type DepartmentId = typeof organizationUnits[number]['id']
export type Status = typeof statuses[number]
export type Priority = typeof priorities[number]
export type AssignmentStatus = typeof assignmentStatuses[number]
export type DateStatus = typeof dateStatuses[number]
export type PublicationStatus = typeof publicationStatuses[number]
export type SourceConfidence = typeof sourceConfidences[number]

export interface SourceRef {
  sourceId: 'S1' | 'S2' | 'S3'
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
  description: string
  departmentId: DepartmentId
  department: Department
  owner: string
  assignmentStatus: AssignmentStatus
  timing: string
  dateStatus: DateStatus
  publicationStatus: PublicationStatus
  asOf: string
  conflictingSourceRefs: string[]
  priority: Priority
  status: Status
  dependencies: string
  sources: SourceRef[]
  risk: string
  updatedAt: string
}

export type AuditClassification = 'data' | 'validation' | 'persistence' | 'accessibility' | 'quality' | 'security' | 'runtime'

export interface AuditItem {
  id: string
  issueId: string
  classification: AuditClassification
  targetVersion: string
  files: string[]
  before: string
  after: string
  evidence: string[]
  retest: string
  residualRisk: string
  round: number
  at: string
  action: string
  detail: string
}

export interface FlowData { nodes: Node[]; edges: Edge[]; viewport: Viewport }
export interface ExportBundle { schemaVersion: 2; exportedAt: string; tasks: Task[]; flow: FlowData; audit: AuditItem[] }

export interface ValidationIssue { path: string; message: string }
export interface LoadResult<T> { ok: boolean; value: T; error?: string; raw?: string }

export const departmentName = (id: DepartmentId) => organizationUnits.find((unit) => unit.id === id)?.name ?? '管理部'
export const departmentIdFor = (name: Department) => organizationUnits.find((unit) => unit.name === name)?.id ?? 'administration'
