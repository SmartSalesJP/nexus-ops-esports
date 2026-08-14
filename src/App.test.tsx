import { render, screen } from '@testing-library/react'
import { expect, it, vi } from 'vitest'

it('shows an alert when initial localStorage access is denied',async()=>{
  vi.resetModules()
  const spy=vi.spyOn(Storage.prototype,'getItem').mockImplementation(()=>{throw new DOMException('denied','SecurityError')})
  const {default:App}=await import('./App')
  spy.mockRestore()
  render(<App/>)
  expect(screen.getByRole('alert')).toHaveTextContent('保存データを取得できません')
})

it('labels current operation history truthfully without claiming a retest',async()=>{
  vi.resetModules()
  const {createOperationAuditEntry}=await import('./operationAudit')
  const entry=createOperationAuditEntry('OP-TEST','runtime','テスト操作','保存内容',['src/App.tsx'],'before','after','2026-08-14T20:50:00+09:00')
  expect(entry).toMatchObject({issueId:'OP-TEST',targetVersion:'0.2.1',round:2,retest:'未実施（操作時点）',action:'操作履歴 · テスト操作',at:'2026-08-14T20:50:00+09:00'})
  expect(entry.detail).toContain('監査指摘の修正ではない')
})
