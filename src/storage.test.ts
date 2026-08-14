import { beforeEach, describe, expect, it, vi } from 'vitest'
import { deriveDateStatus, initialAudit, initialEdges, initialNodes, initialTasks, initialViewport } from './data'
import { KEYS, isBundle, parseImport, readBundle, saveBundle, validateBundle, validateTaskCandidate } from './storage'
import type { ExportBundle } from './types'

const bundle=():ExportBundle=>({schemaVersion:2,exportedAt:new Date().toISOString(),tasks:structuredClone(initialTasks),flow:{nodes:structuredClone(initialNodes),edges:structuredClone(initialEdges),viewport:initialViewport},audit:structuredClone(initialAudit)})

describe('versioned local bundle',()=>{
 beforeEach(()=>localStorage.clear())
 it('returns initial data when no saved value exists',()=>{const result=readBundle();expect(result.ok).toBe(true);expect(result.value.tasks).toHaveLength(39)})
 it('persists nodes, edges and viewport atomically',()=>{const value=bundle();value.flow.viewport={x:12,y:-4,zoom:1.3};expect(saveBundle(value).ok).toBe(true);expect(readBundle().value.flow.viewport).toEqual(value.flow.viewport)})
 it('reports corrupt data, preserves the raw value, and does not silently overwrite it',()=>{localStorage.setItem(KEYS.bundle,'{broken');const result=readBundle();expect(result.ok).toBe(false);expect(result.raw).toBe('{broken');expect(localStorage.getItem(KEYS.bundle)).toBe('{broken')})
 it('returns a LoadResult when localStorage read throws and calls getItem only once',()=>{const spy=vi.spyOn(Storage.prototype,'getItem').mockImplementation(()=>{throw new DOMException('denied','SecurityError')});const result=readBundle();expect(result.ok).toBe(false);expect(result.error).toContain('取得できません');expect(spy).toHaveBeenCalledTimes(1);spy.mockRestore()})
 it('returns a write error instead of throwing',()=>{const spy=vi.spyOn(Storage.prototype,'setItem').mockImplementation(()=>{throw new DOMException('quota','QuotaExceededError')});expect(saveBundle(bundle()).ok).toBe(false);spy.mockRestore()})
 it('migrates legacy department display names by stable ID and persists the formal name',()=>{const value=bundle();value.tasks[2].department='運営' as never;localStorage.setItem(KEYS.bundle,JSON.stringify(value));const result=readBundle();expect(result.ok).toBe(true);expect(result.value.tasks[2].department).toBe('運営チーム');expect(JSON.parse(localStorage.getItem(KEYS.bundle)!).tasks[2].department).toBe('運営チーム')})
})

describe('complete import validation',()=>{
 it('accepts a valid schema v2 bundle',()=>expect(isBundle(bundle())).toBe(true))
 it('rejects unsupported schema versions and invalid datetime',()=>{const value={...bundle(),schemaVersion:1,exportedAt:'x'};const paths=validateBundle(value).map((issue)=>issue.path);expect(paths).toContain('schemaVersion');expect(paths).toContain('exportedAt')})
 it('rejects duplicate IDs, dangling refs, self refs, and cycles',()=>{
   const duplicate=bundle();duplicate.tasks.push({...duplicate.tasks[0]});expect(validateBundle(duplicate).some((issue)=>issue.message.includes('重複'))).toBe(true)
   const dangling=bundle();dangling.tasks[0].dependencies='T-999';expect(validateBundle(dangling).some((issue)=>issue.message.includes('存在しない'))).toBe(true)
   const self=bundle();self.tasks[0].dependencies=self.tasks[0].id;expect(validateBundle(self).some((issue)=>issue.message.includes('自己参照'))).toBe(true)
   const cycle=bundle();cycle.tasks[0].dependencies=cycle.tasks[1].id;cycle.tasks[1].dependencies=cycle.tasks[0].id;expect(validateBundle(cycle).some((issue)=>issue.message.includes('循環'))).toBe(true)
 })
 it('rejects node/edge duplicates, dangling edges and invalid task refs',()=>{
   const duplicate=bundle();duplicate.flow.nodes.push({...duplicate.flow.nodes[0]});expect(validateBundle(duplicate).some((issue)=>issue.path==='flow.nodes'&&issue.message.includes('重複'))).toBe(true)
   const dangling=bundle();dangling.flow.edges[0]={...dangling.flow.edges[0],target:'missing'};expect(validateBundle(dangling).some((issue)=>issue.message.includes('接続先'))).toBe(true)
   const refs=bundle();refs.flow.nodes[0]={...refs.flow.nodes[0],data:{...refs.flow.nodes[0].data,taskIds:['T-999']}};expect(validateBundle(refs).some((issue)=>issue.path.includes('taskIds'))).toBe(true)
 })
 it('rejects malformed required source fields and enum values',()=>{const value=bundle();value.tasks[0]={...value.tasks[0],priority:'invalid' as never,sources:[{...value.tasks[0].sources[0],sha256:'bad'}]};const issues=validateBundle(value);expect(issues.some((issue)=>issue.path.endsWith('.priority'))).toBe(true);expect(issues.some((issue)=>issue.path.endsWith('.sha256'))).toBe(true)})
 it('rejects forged source metadata and out-of-range source lines',()=>{const value=bundle();value.tasks[0].sources=[{...value.tasks[0].sources[0],fileName:'fake.txt',sha256:'A'.repeat(64),asOf:'2020-01-01',lineEnd:9999}];const paths=validateBundle(value).map((issue)=>issue.path);expect(paths).toContain('tasks[0].sources[0].fileName');expect(paths).toContain('tasks[0].sources[0].sha256');expect(paths).toContain('tasks[0].sources[0].asOf');expect(paths).toContain('tasks[0].sources[0].lineEnd')})
 it('rejects invalid audit enums/types/duplicate IDs',()=>{const value=bundle();value.audit=[...value.audit,{...value.audit[0]}];value.audit[0]={...value.audit[0],classification:'fake' as never,issueId:123 as never};const issues=validateBundle(value);expect(issues.some((issue)=>issue.path.endsWith('.classification'))).toBe(true);expect(issues.some((issue)=>issue.path.endsWith('.issueId'))).toBe(true);expect(issues.some((issue)=>issue.path==='audit'&&issue.message.includes('重複'))).toBe(true)})
 it('rejects a self-connected flow edge',()=>{const value=bundle();value.flow.edges[0]={...value.flow.edges[0],target:value.flow.edges[0].source};expect(validateBundle(value).some((issue)=>issue.message.includes('自己接続'))).toBe(true)})
 it('rejects oversized files before parsing',()=>{const text=' '.repeat(2_000_001);expect(parseImport(text).error).toContain('ファイルサイズ上限')})
 it('does not mutate existing storage when parsing invalid import',()=>{const existing=bundle();saveBundle(existing);expect(parseImport('{bad').ok).toBe(false);expect(readBundle().value.tasks).toHaveLength(existing.tasks.length)})
})

describe('CRUD dependency validation',()=>{
 it('returns item errors for missing IDs and cycles',()=>{const candidate={...initialTasks[0],dependencies:'T-999'};expect(validateTaskCandidate(candidate,initialTasks)[0].path).toContain('dependencies')})
 it('rejects a cycle closed by a later edit',()=>{const first={...initialTasks[0],dependencies:''},second={...initialTasks[1],dependencies:''};const afterFirst=[{...first,dependencies:second.id},second];expect(validateTaskCandidate(afterFirst[0],[first,second])).toEqual([]);const issues=validateTaskCandidate({...second,dependencies:first.id},afterFirst);expect(issues.some((issue)=>issue.message.includes('循環'))).toBe(true)})
})

describe('round 2 source, organization and date regressions',()=>{
 it('uses the complete S3 schedule range for March, February and 8-to-3 tasks',()=>{for(const id of ['T-003','T-018','T-019']){const ref=initialTasks.find((task)=>task.id===id)!.sources.find((source)=>source.sourceId==='S3'&&source.lineStart===432);expect(ref?.lineEnd).toBe(468)}})
 it('uses all 13 formal organization names from S2',()=>{expect(new Set(initialTasks.map((task)=>task.department))).toEqual(new Set(['運営本部','運営チーム','企画チーム','大会運営チーム（Tournament Admin）','キャスティング・渉外チーム','営業チーム','パートナーシップチーム','広報・マーケティングチーム','映像・配信チーム','クリエイティブチーム','コミュニティ運営チーム','教育・育成チーム','管理部']))})
 it('does not classify an undated month range as overdue',()=>expect(deriveDateStatus('7月〜10月')).toBe('要再確認'))
 it('records both sides of the school-name publication conflict',()=>{for(const id of ['T-014','T-018','T-019','T-022']){const task=initialTasks.find((item)=>item.id===id)!;expect(task.conflictingSourceRefs).toEqual(expect.arrayContaining([expect.stringContaining('S1:198-201'),expect.stringContaining('S3:85-90')]))}})
})
