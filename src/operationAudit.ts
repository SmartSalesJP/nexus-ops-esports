import type { AuditClassification, AuditItem } from './types'

export const createOperationAuditEntry=(
  issueId:string,
  classification:AuditClassification,
  action:string,
  detail:string,
  files:string[],
  before:string,
  after:string,
  at=new Date().toISOString(),
):AuditItem=>({
  id:`a-${Date.now()}-${Math.random().toString(16).slice(2)}`,
  issueId,
  classification,
  targetVersion:'0.3.0',
  files,
  before,
  after,
  evidence:['localStorage bundle v3への保存結果'],
  retest:'未実施（操作時点）',
  residualRisk:'外部サービスとの同期は対象外',
  round:3,
  at,
  action:`操作履歴 · ${action}`,
  detail:`通常操作の記録（監査指摘の修正ではない）。${detail}`,
})
