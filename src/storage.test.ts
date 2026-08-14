import { beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { currentPhaseFor, initialAudit, initialEdges, initialKpis, initialNodes, initialTasks, initialViewport, phaseCounts } from './data'
import { SOURCE_CATALOG } from './sourceCatalog'
import { KEYS, parseImport, readBundle, saveBundle, validateBundle, validateTaskCandidate } from './storage'
import { departmentIdFor, normalizeDepartmentName, type ExportBundle, type Task } from './types'
import { emptyWeeklyState, runWeeklyBundle } from './weekly'

const bundle=():ExportBundle=>({schemaVersion:4,exportedAt:new Date().toISOString(),tasks:structuredClone(initialTasks),flow:{nodes:structuredClone(initialNodes),edges:structuredClone(initialEdges),viewport:structuredClone(initialViewport)},audit:structuredClone(initialAudit),kpis:structuredClone(initialKpis),reportBaseline:null,migrationArchive:[],weekly:emptyWeeklyState()})
beforeEach(()=>localStorage.clear())

describe('authoritative S4 plan',()=>{
  it('has exactly 73 unique IDs and the required phase distribution',()=>{expect(initialTasks).toHaveLength(73);expect(new Set(initialTasks.map((task)=>task.id)).size).toBe(73);expect([0,1,2,3,4,5,6].map((phase)=>initialTasks.filter((task)=>task.phase===phase).length)).toEqual(phaseCounts)})
  it('matches urgency, status, owner and team oracles',()=>{
    const count=(field:keyof Task,value:string)=>initialTasks.filter((task)=>task[field]===value).length
    expect(['高','中','低'].map((value)=>count('urgency',value))).toEqual([34,34,5])
    expect(['未着手','進行中','完了','保留'].map((value)=>count('status',value))).toEqual([58,15,0,0])
    expect(['鈴木','ウメノ','ロブ','ウニュ','ユウタ','浜名'].map((value)=>count('owner',value))).toEqual([20,18,14,8,8,5])
    expect(['ops-hq','operations','planning','tournament-admin','casting-relations','sales','partnerships','pr-marketing','broadcast','creative','community','education','administration'].map((value)=>count('teamId',value))).toEqual([6,6,5,5,8,8,8,5,6,6,1,1,8])
  })
  it('preserves representative values, dependencies and blocker semantics',()=>{
    expect(initialTasks.find((task)=>task.id==='P0-01')).toMatchObject({rawTeam:'キャスティング',teamId:'casting-relations',team:'キャスティング・渉外チーム',owner:'ロブ',assignees:['ウメノ（講師経由の伝手）'],rawAssignees:'ウメノ（講師経由の伝手）',personKeys:['ウメノ'],urgency:'高',deadline:'即時（〜8/18）',deadlineDate:'2026-08-18',status:'未着手'})
    expect(initialTasks.find((task)=>task.id==='P0-01')?.notes.join(' ')).toContain('旧期限「7月中」は超過')
    expect(initialTasks.find((task)=>task.id==='P2-12')?.dependencies).toEqual(['P2-10'])
    for(const id of ['P3-05','P4-09','P5-04','P6-05'])expect(initialTasks.find((task)=>task.id===id)).toMatchObject({status:'未着手',dependencies:['P0-07'],holdReason:'スン業務委託契約待ち（P0-07）'})
    expect(initialTasks.find((task)=>task.id==='P3-05')).toMatchObject({rawAssignees:'鈴木、ウメノ、（スン※契約後）',personKeys:['鈴木','ウメノ','スン']})
    expect(initialTasks.find((task)=>task.id==='P1-05')?.team).toBe('大会運営チーム（Tournament Admin）')
  })
  it('matches all 73 Markdown rows field-for-field and by exact source line',()=>{
    const path='C:\\Users\\81904\\OneDrive\\デスクトップ\\新しいフォルダー (2)\\OneDrive\\デスクトップ\\EXCEL ×TBC\\eスポーツ大会_開催設計_全タスクリスト.md'
    const lines=readFileSync(path,'utf8').split(/\r?\n/);if(lines.at(-1)==='')lines.pop();expect(lines).toHaveLength(300)
    const sourceRows=lines.map((line,index)=>({line,index:index+1})).filter(({line})=>/^\| P[0-6]-\d{2} \|/.test(line))
    expect(sourceRows).toHaveLength(73)
    sourceRows.forEach(({line,index},taskIndex)=>{const cells=line.split('|').slice(1,-1).map((cell)=>cell.trim()),[id,title,rawTeam,owner,rawAssignees,rawUrgency,deadline,status]=cells,task=initialTasks[taskIndex],teamId=departmentIdFor(rawTeam),team=normalizeDepartmentName(rawTeam);expect(task,`${id} line ${index}`).toMatchObject({id,title,rawTeam,teamId,team,owner,rawAssignees,assignees:rawAssignees.split(/[、,]/).map((value)=>value.trim()).filter(Boolean),urgency:rawUrgency==='🔴'?'高':rawUrgency==='🟡'?'中':'低',deadline,status});expect(task.sourceRefs[0]).toMatchObject({sourceId:'S4',lineStart:index,lineEnd:index,sha256:SOURCE_CATALOG.S4.sha256})})
  })
  it('tracks every task to S4 exact line and keeps the previous three sources',()=>{expect(Object.keys(SOURCE_CATALOG)).toEqual(['S1','S2','S3','S4']);expect(SOURCE_CATALOG.S4).toMatchObject({sha256:'D24C5785D0AA8D3D4995767EAB565016E346149294ABEB0E0133C163C0E2BE87',maxLine:300});expect(initialTasks.find((task)=>task.id==='P6-07')?.sourceRefs[0]).toMatchObject({sourceId:'S4',lineStart:220,lineEnd:220})})
  it('does not manufacture exact dates for ambiguous deadlines',()=>{expect(initialTasks.find((task)=>task.id==='P2-12')?.deadlineDate).toBeUndefined();expect(initialTasks.find((task)=>task.id==='P4-01')?.deadlineDate).toBeUndefined();expect(initialTasks.find((task)=>task.id==='P3-08')?.deadlineDate).toBe('2027-01-15')})
  it('selects Phase 0 on the source as-of date and documents September precedence',()=>{expect(currentPhaseFor(new Date('2026-08-14T12:00:00+09:00'))).toBe(0);expect(currentPhaseFor(new Date('2026-09-15T12:00:00+09:00'))).toBe(1);expect(currentPhaseFor(new Date('2026-10-01T00:00:00+09:00'))).toBe(2)})
})

describe('schema v4 validation and migration',()=>{
  it('accepts the initial bundle',()=>expect(validateBundle(bundle())).toEqual([]))
  it('rejects unknown raw teams instead of falling back to administration',()=>{expect(departmentIdFor('未知チーム')).toBeUndefined();expect(normalizeDepartmentName('未知チーム')).toBeUndefined();const value=bundle();value.tasks[0].rawTeam='未知チーム';expect(validateBundle(value).some((issue)=>issue.path.endsWith('rawTeam'))).toBe(true)})
  it('archives a v2 bundle exactly while activating P73 once',()=>{
    const legacyTasks=[{id:'T-001',title:'ユーザー編集済み',status:'レビュー',custom:{memo:'保持'}}]
    const legacy={schemaVersion:2,exportedAt:new Date().toISOString(),tasks:legacyTasks,flow:bundle().flow,audit:[]}
    localStorage.setItem(KEYS.legacyBundle,JSON.stringify(legacy));const migrated=readBundle()
    expect(migrated.ok).toBe(true);expect(migrated.value.tasks).toHaveLength(73);expect(migrated.value.migrationArchive).toHaveLength(1);expect(migrated.value.migrationArchive[0].tasks).toEqual(legacyTasks)
    const second=readBundle();expect(second.value.tasks).toHaveLength(73);expect(second.value.migrationArchive).toHaveLength(1)
  })
  it('imports schema v2 atomically into the same archive model',()=>{const legacy={schemaVersion:2,exportedAt:new Date().toISOString(),tasks:[{id:'T-999',title:'custom'}],flow:bundle().flow,audit:[]};const result=parseImport(JSON.stringify(legacy));expect(result.ok).toBe(true);expect(result.value.tasks).toHaveLength(73);expect(result.value.migrationArchive[0].tasks).toEqual(legacy.tasks)})
  it('migrates schema v3 to v4 without losing flow, audit, KPI, baseline or migrationArchive',()=>{const current=bundle(),{weekly:_,...legacy}=current,archive={fromSchema:2,migratedAt:new Date().toISOString(),reason:'保持確認',tasks:[{id:'T-1'}]};void _;const v3={...legacy,schemaVersion:3,migrationArchive:[archive],flow:{...legacy.flow,viewport:{x:44,y:55,zoom:1.4}}};localStorage.setItem(KEYS.legacyV3,JSON.stringify(v3));const result=readBundle();expect(result.ok).toBe(true);expect(result.value).toMatchObject({schemaVersion:4,flow:{viewport:{x:44,y:55,zoom:1.4}},migrationArchive:[archive],weekly:{lastRun:null,runs:[],completions:{},tombstones:[]}});expect(result.value.audit).toEqual(v3.audit);expect(result.value.kpis).toEqual(v3.kpis)})
  it('rejects blank and zero-width hold reasons',()=>{for(const reason of ['', '   ', '\u200b']){const task={...initialTasks[0],status:'保留' as const,holdReason:reason};expect(validateTaskCandidate(task,initialTasks).some((issue)=>issue.path.endsWith('holdReason'))).toBe(true)}})
  it('rejects missing dependency and cycles',()=>{const missing={...initialTasks[0],dependencies:['P9-99']};expect(validateTaskCandidate(missing,initialTasks).some((issue)=>issue.message.includes('存在しない'))).toBe(true);const a={...initialTasks[0],dependencies:['P0-02']},b={...initialTasks[1],dependencies:['P0-01']};expect(validateTaskCandidate(a,initialTasks.map((task)=>task.id===b.id?b:task)).some((issue)=>issue.message.includes('循環'))).toBe(true)})
  it('atomically rejects malicious source, flow, edge and audit bundles',()=>{
    localStorage.setItem('sentinel','unchanged')
    const variants:ExportBundle[]=[]
    const emptySource=bundle();emptySource.tasks[0].sourceRefs=[];variants.push(emptySource)
    const wrongS4=bundle();wrongS4.tasks[0].sourceRefs[0]={...wrongS4.tasks[0].sourceRefs[0],lineStart:89,lineEnd:89};variants.push(wrongS4)
    const unknownTeam=bundle();unknownTeam.tasks[0].rawTeam='存在しないチーム';variants.push(unknownTeam)
    const badCanvas=bundle();badCanvas.flow.nodes[0].data={...badCanvas.flow.nodes[0].data,taskIds:['P9-99']};variants.push(badCanvas)
    const duplicateEdge=bundle();duplicateEdge.flow.edges.push({...duplicateEdge.flow.edges[0]});variants.push(duplicateEdge)
    const badAudit=bundle();badAudit.audit=[{} as never];variants.push(badAudit)
    const negativeKpi=bundle();negativeKpi.kpis[0].actual=-1;variants.push(negativeKpi)
    variants.forEach((value)=>{const result=parseImport(JSON.stringify(value));expect(result.ok).toBe(false);expect(localStorage.getItem('sentinel')).toBe('unchanged')})
    const infinite=bundle();infinite.flow.nodes[0].position.x=Number.POSITIVE_INFINITY;expect(validateBundle(infinite).some((issue)=>issue.path.includes('flow.nodes'))).toBe(true);const infiniteKpi=bundle();infiniteKpi.kpis[0].actual=Number.POSITIVE_INFINITY;expect(validateBundle(infiniteKpi).some((issue)=>issue.path==='kpis')).toBe(true)
  })
  it('validates every audit field and rejects duplicate audit IDs',()=>{const invalid=bundle();invalid.audit.push({...invalid.audit[0]});expect(validateBundle(invalid).some((issue)=>issue.message.includes('監査ログID'))).toBe(true);const missing=bundle();missing.audit=[{} as never];expect(validateBundle(missing).filter((issue)=>issue.path.startsWith('audit')).length).toBeGreaterThan(5)})
  it('does not mutate persisted state when storage fails',()=>{const value=bundle(),spy=vi.spyOn(Storage.prototype,'setItem').mockImplementation(()=>{throw new DOMException('quota','QuotaExceededError')});expect(saveBundle(value).ok).toBe(false);spy.mockRestore()})
  it('rejects malformed weekly snapshots and forged S4 references on auto tasks',()=>{const value=bundle();value.weekly={lastRun:{runId:'weekly:2026-W33',scheduledFor:'2026-08-10T00:00:00+09:00',ranAt:'2026-08-14T00:00:00.000Z',trigger:'manual',missedWeekCount:0,addedStickyCount:1,autoTaskCount:0,outcome:'success',reasons:[],snapshot:{completed:-1,total:73,phaseProgress:{} as never,highUrgencyRemaining:1,blockers:0,kpis:[]}},runs:[],completions:{},tombstones:[]};expect(validateBundle(value).some((issue)=>issue.path.startsWith('weekly'))).toBe(true);const generated=runWeeklyBundle(bundle(),new Date('2026-08-14T12:00:00+09:00'),'manual'),auto=generated.tasks.find((task)=>task.createdByDepartment)!;auto.sourceRefs=[initialTasks[0].sourceRefs[0]];expect(validateBundle(generated).some((issue)=>issue.path.endsWith('sourceRefs'))).toBe(true)})
  it('atomically rejects semantically forged weekly snapshots, schedules, links and provenance',()=>{
    localStorage.setItem('weekly-sentinel','unchanged');const valid=runWeeklyBundle(bundle(),new Date('2026-08-14T12:00:00+09:00'),'manual'),variants:ExportBundle[]=[]
    const impossible=structuredClone(valid),impossibleRun=impossible.weekly.runs[0];impossibleRun.snapshot.completed=999;impossibleRun.snapshot.total=73;impossible.weekly.lastRun=structuredClone(impossibleRun);variants.push(impossible)
    const wrongMonday=structuredClone(valid),wrongRun=wrongMonday.weekly.runs[0];wrongRun.scheduledFor='2030-01-07T00:00:00+09:00';wrongMonday.weekly.lastRun=structuredClone(wrongRun);const wrongSummary=wrongMonday.flow.nodes.find((node)=>node.id===`weekly-summary:${wrongRun.runId}`)!;wrongSummary.data={...wrongSummary.data,scheduledFor:wrongRun.scheduledFor};variants.push(wrongMonday)
    const noSummary=structuredClone(valid);noSummary.flow.nodes=noSummary.flow.nodes.filter((node)=>!node.id.startsWith('weekly-summary:'));variants.push(noSummary)
    const danglingSummary=structuredClone(valid);danglingSummary.flow.nodes.push({id:'weekly-summary:weekly:2030-W01',position:{x:1,y:1},data:{weeklyKind:'summary',runId:'weekly:2030-W01',scheduledFor:'2029-12-31T00:00:00+09:00',snapshot:valid.weekly.runs[0].snapshot,taskIds:[]}});variants.push(danglingSummary)
    const completedSource=bundle();completedSource.tasks[0]={...completedSource.tasks[0],status:'完了',updatedAt:'2026-08-12T00:00:00.000Z'};const danglingCompletion=runWeeklyBundle(completedSource,new Date('2026-08-14T12:00:00+09:00'),'manual');danglingCompletion.flow.nodes=danglingCompletion.flow.nodes.filter((node)=>node.id!=='weekly-complete:P0-01');variants.push(danglingCompletion)
    const forged=structuredClone(valid),auto=forged.tasks.find((task)=>task.createdByDepartment==='esports_progress_control')!;auto.fingerprint=`${auto.fingerprint}:forged`;variants.push(forged)
    variants.forEach((value)=>{expect(validateBundle(value).length).toBeGreaterThan(0);expect(parseImport(JSON.stringify(value)).ok).toBe(false);expect(localStorage.getItem('weekly-sentinel')).toBe('unchanged')})
  })
})
