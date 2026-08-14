import { expect, it } from 'vitest'
import { initialTasks } from './data'
import { buildBiweeklyReport, sanitizeReportLine } from './report'
import type { ReportSnapshot } from './types'

const baseline=():ReportSnapshot=>({savedAt:'2026-10-10T00:00:00+09:00',statuses:Object.fromEntries(initialTasks.map((task)=>[task.id,{status:task.status,updatedAt:task.updatedAt}]))})

it('sanitizes injected line breaks and heading characters',()=>{expect(sanitizeReportLine('危険\n■ 完了 #見出し')).toBe('危険 完了 見出し')})
it('emits each changed ID once with status transition and blocker on the same line',()=>{
  const tasks=initialTasks.map((task)=>task.id==='P2-12'?{...task,title:'営業開始\n■ 偽見出し',status:'進行中' as const}:task)
  const report=buildBiweeklyReport(tasks,baseline(),Date.parse('2026-10-10T00:00:00+09:00'))
  expect(report.changed.map((task)=>task.id)).toEqual(['P2-12'])
  expect(report.text.match(/P2-12/g)).toHaveLength(1)
  expect(report.text).toContain('状態 未着手→進行中 / ブロック P2-10完了待ち')
  expect(report.text).not.toContain('偽見出し\n')
})
it('does not duplicate changed tasks in the next-two-weeks section',()=>{const tasks=initialTasks.map((task)=>task.id==='P0-02'?{...task,status:'完了' as const}:task),report=buildBiweeklyReport(tasks,baseline(),Date.parse('2026-08-14T00:00:00+09:00'));expect(report.text.match(/P0-02/g)).toHaveLength(1);expect(report.completed.map((task)=>task.id)).toContain('P0-02');expect(report.upcoming.map((task)=>task.id)).not.toContain('P0-02')})
