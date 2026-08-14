import { expect, test } from '@playwright/test'

test.beforeEach(async({page})=>{await page.goto('/');await page.evaluate(()=>localStorage.clear());await page.reload()})

test('task CRUD persists across reload and has no console errors',async({page})=>{
  const errors:string[]=[];page.on('console',(message)=>{if(['error','warning'].includes(message.type()))errors.push(message.text())})
  await page.getByRole('button',{name:'新規タスク'}).click()
  await page.getByLabel('タスク名 *').fill('E2E回帰タスク')
  await page.getByLabel('責任者 / 担当').fill('検証担当')
  await page.getByRole('button',{name:'保存する'}).click()
  await expect(page.getByRole('heading',{name:'E2E回帰タスク'})).toBeVisible()
  await page.reload();await expect(page.getByRole('heading',{name:'E2E回帰タスク'})).toBeVisible();expect(errors).toEqual([])
})

test('keyboard-only canvas controls connect and save viewport bundle',async({page})=>{
  await page.getByRole('tab',{name:'キャンバス'}).click()
  await page.getByLabel('接続元').selectOption('n1');await page.getByLabel('接続先').selectOption('n3');await page.getByRole('button',{name:'接続',exact:true}).click();await page.getByRole('button',{name:'保存',exact:true}).click()
  await expect(page.getByRole('status')).toContainText('キャンバスを保存しました')
})

test('invalid JSON import is rejected atomically',async({page})=>{
  const before=await page.locator('.task-card').count();await page.locator('#json-import').setInputFiles({name:'bad.json',mimeType:'application/json',buffer:Buffer.from('{bad')});await expect(page.getByRole('alert')).toContainText('JSON構文エラー');expect(await page.locator('.task-card').count()).toBe(before)
})
