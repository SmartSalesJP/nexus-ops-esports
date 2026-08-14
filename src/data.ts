import type { Edge, Node, Viewport } from '@xyflow/react'
import type { AuditItem, KpiValue } from './types'
export { currentPhaseFor, initialTasks, phaseCounts } from './planData'

export const initialNodes:Node[]=[
  {id:'phase-0',position:{x:40,y:100},data:{label:'Phase 0｜体制再構築',taskIds:['P0-01','P0-07']}},
  {id:'phase-2',position:{x:310,y:100},data:{label:'Phase 2｜営業・出演',taskIds:['P2-05','P2-10','P2-12']}},
  {id:'phase-5',position:{x:580,y:100},data:{label:'Phase 5｜大会当日',taskIds:['P5-01','P5-04']}},
]
export const initialEdges:Edge[]=[{id:'plan-e1',source:'phase-0',target:'phase-2'},{id:'plan-e2',source:'phase-2',target:'phase-5'}]
export const initialViewport:Viewport={x:0,y:0,zoom:1}
export const initialKpis:KpiValue[]=[
  {id:'concurrent',label:'同時接続',target:5000,unit:'人',actual:null},
  {id:'pv',label:'配信PV',target:10000,unit:'PV',actual:null},
  {id:'profit',label:'粗利',target:300,unit:'万円',actual:null},
  {id:'sponsors',label:'スポンサー',target:30,unit:'社',actual:null},
  {id:'schools',label:'参加校',target:120,unit:'校',actual:null},
  {id:'participants',label:'参加者',target:600,unit:'人',actual:null},
]
export const initialAudit:AuditItem[]=[{
  id:'plan-v3-integration',issueId:'PLAN-V3',classification:'data',targetVersion:'0.3.0',files:['src/planData.ts','src/storage.ts'],before:'旧39件をschema v2で表示',after:'S4の73件を正本化し旧bundleは移行アーカイブへ保持',evidence:['S4 SHA-256 D24C5785D0AA8D3D4995767EAB565016E346149294ABEB0E0133C163C0E2BE87','Phase件数 9/10/18/10/11/8/7'],retest:'unit/UI/a11y/E2E',residualRisk:'開催日は2027年3月内で日付未確定',round:3,at:'2026-08-14T21:20:23+09:00',action:'全タスクリスト統合',detail:'担当者別サマリーを重複登録せず、73件を一意IDで取り込んだ。'
}]
