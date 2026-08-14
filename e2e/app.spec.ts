import { expect, test, type Page } from '@playwright/test'

const boot=async(page:Page,{reducedMotion=false}:{reducedMotion?:boolean}={})=>{
  const consoleProblems:string[]=[]
  page.on('console',(message)=>{if(['error','warning'].includes(message.type()))consoleProblems.push(message.text())})
  if(reducedMotion)await page.emulateMedia({reducedMotion:'reduce'})
  await page.goto('/');await page.evaluate(()=>localStorage.clear());await page.reload()
  return consoleProblems
}

test('create, edit and delete persist exact task values across reload',async({page})=>{
  const consoleProblems=await boot(page)
  await page.getByRole('button',{name:'新規タスク'}).click();await page.getByLabel('タスク名 *').fill('E2E回帰タスク');await page.getByLabel('責任者 / 担当').fill('検証担当');await page.getByRole('button',{name:'保存する'}).click()
  await page.getByRole('button',{name:'E2E回帰タスクを編集'}).click();await page.getByLabel('タスク名 *').fill('E2E編集済みタスク');await page.getByLabel('責任者 / 担当').fill('編集担当');await page.getByRole('button',{name:'保存する'}).click();await page.reload()
  await expect(page.getByRole('heading',{name:'E2E編集済みタスク'})).toBeVisible()
  expect(await page.evaluate(()=>{const bundle=JSON.parse(localStorage.getItem('nexus.bundle.v2')!);const task=bundle.tasks.find((item:{title:string})=>item.title==='E2E編集済みタスク');return{owner:task.owner,assignmentStatus:task.assignmentStatus}})).toEqual({owner:'編集担当',assignmentStatus:'未確定'})
  page.once('dialog',(dialog)=>dialog.accept());await page.getByRole('button',{name:'E2E編集済みタスクを削除'}).click();await page.reload();await expect(page.getByRole('heading',{name:'E2E編集済みタスク'})).toHaveCount(0)
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('nexus.bundle.v2')!).tasks.some((item:{title:string})=>item.title==='E2E編集済みタスク'))).toBe(false);expect(consoleProblems).toEqual([])
})

test('keyboard canvas connection, viewport and audit persist across reload',async({page})=>{
  const consoleProblems=await boot(page);await page.getByRole('tab',{name:'キャンバス'}).click();await page.getByLabel('接続元').selectOption('n1');await page.getByLabel('接続先').selectOption('n3');await page.getByRole('button',{name:'接続',exact:true}).click();await page.locator('.react-flow__controls-zoomin').click();await page.getByRole('button',{name:'保存',exact:true}).click();await expect(page.getByRole('status')).toContainText('キャンバスを保存しました');await page.reload()
  const saved=await page.evaluate(()=>{const value=JSON.parse(localStorage.getItem('nexus.bundle.v2')!);return{edge:value.flow.edges.some((edge:{source:string;target:string})=>edge.source==='n1'&&edge.target==='n3'),viewport:value.flow.viewport,audit:value.audit.find((item:{issueId:string})=>item.issueId==='OP-CANVAS-SAVE')}})
  expect(saved.edge).toBe(true);expect(saved.viewport.zoom).toBeGreaterThan(1);expect(saved.audit).toMatchObject({targetVersion:'0.2.1',round:2,retest:'未実施（操作時点）',action:'操作履歴 · キャンバス保存'});await page.getByRole('tab',{name:'修正ログ'}).click();await expect(page.getByText(/OP-CANVAS-SAVE/).first()).toBeVisible();expect(consoleProblems).toEqual([])
})

test('valid import restores exact viewport and audit; invalid import stays atomic',async({page})=>{
  const consoleProblems=await boot(page);await page.locator('#status-card-T-001').selectOption('レビュー')
  const valid=await page.evaluate(()=>{const value=JSON.parse(localStorage.getItem('nexus.bundle.v2')!);value.exportedAt=new Date().toISOString();value.flow.viewport={x:12,y:34,zoom:1.25};value.audit.unshift({id:'e2e-valid-import',issueId:'R2-E2E',classification:'validation',targetVersion:'0.2.1',files:['e2e/app.spec.ts'],before:'未読込',after:'読込済み',evidence:['E2E'],retest:'E2E再読込',residualRisk:'なし',round:2,at:new Date().toISOString(),action:'E2E検証記録',detail:'viewport/audit復元'});return JSON.stringify(value)})
  await page.locator('#json-import').setInputFiles({name:'valid.json',mimeType:'application/json',buffer:Buffer.from(valid)});await expect(page.getByRole('status')).toContainText('データを読み込みました');await page.reload()
  expect(await page.evaluate(()=>{const value=JSON.parse(localStorage.getItem('nexus.bundle.v2')!);return{viewport:value.flow.viewport,audit:value.audit.some((item:{id:string})=>item.id==='e2e-valid-import'),status:value.tasks.find((task:{id:string})=>task.id==='T-001').status}})).toEqual({viewport:{x:12,y:34,zoom:1.25},audit:true,status:'レビュー'})
  const before=await page.evaluate(()=>localStorage.getItem('nexus.bundle.v2'));await page.locator('#json-import').setInputFiles({name:'bad.json',mimeType:'application/json',buffer:Buffer.from('{bad')});await expect(page.getByRole('alert')).toContainText('JSON構文エラー');expect(await page.evaluate(()=>localStorage.getItem('nexus.bundle.v2'))).toBe(before);expect(consoleProblems).toEqual([])
})

test('save failure is announced and does not mutate the persisted state',async({page})=>{
  const consoleProblems=await boot(page);const before=await page.evaluate(()=>localStorage.getItem('nexus.bundle.v2'));await page.evaluate(()=>{Storage.prototype.setItem=()=>{throw new DOMException('quota','QuotaExceededError')}});await page.locator('#status-card-T-001').selectOption('レビュー');await expect(page.getByRole('alert')).toContainText('保存できません');expect(await page.evaluate(()=>localStorage.getItem('nexus.bundle.v2'))).toBe(before);expect(consoleProblems).toEqual([])
})

test('mobile list labels and 360/768/1440 layouts remain within the viewport',async({page})=>{
  const consoleProblems=await boot(page);await page.getByRole('button',{name:'一覧表示'}).click();const labels=await page.locator('tbody td').evaluateAll((cells)=>cells.map((cell)=>cell.getAttribute('data-label')));expect(labels.length).toBeGreaterThan(0);expect(labels.every(Boolean)).toBe(true)
  for(const viewport of [{width:360,height:800},{width:768,height:900},{width:1440,height:900}]){await page.setViewportSize(viewport);await expect(page.getByRole('heading',{name:'タスク進行表'})).toBeVisible();const layout=await page.evaluate(()=>({fits:document.documentElement.scrollWidth<=window.innerWidth,scrollWidth:document.documentElement.scrollWidth,innerWidth:window.innerWidth,widest:Array.from(document.querySelectorAll<HTMLElement>('body *')).map((element)=>({tag:element.tagName,className:element.className?.toString(),right:element.getBoundingClientRect().right,width:element.getBoundingClientRect().width})).filter((item)=>item.right>window.innerWidth+1).sort((a,b)=>b.right-a.right).slice(0,3)}));expect(layout,JSON.stringify({viewport,layout})).toMatchObject({fits:true,scrollWidth:viewport.width,innerWidth:viewport.width})}expect(consoleProblems).toEqual([])
})

test('reduced motion skips GSAP entrance state and applies near-zero CSS duration',async({page})=>{
  const consoleProblems=await boot(page,{reducedMotion:true});const values=await page.locator('.hero').evaluate((hero)=>({opacity:(hero as HTMLElement).style.opacity,transform:(hero as HTMLElement).style.transform,duration:getComputedStyle(document.querySelector('.page-panel')!).animationDuration}));expect(values.opacity).toBe('');expect(values.transform).toBe('');expect(Number.parseFloat(values.duration)).toBeLessThanOrEqual(0.001);expect(consoleProblems).toEqual([])
})
