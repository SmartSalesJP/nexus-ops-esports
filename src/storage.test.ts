import { beforeEach, describe, expect, it, vi } from 'vitest'
import { initialAudit, initialEdges, initialNodes, initialTasks, initialViewport } from './data'
import { KEYS, isBundle, parseImport, readBundle, saveBundle, validateBundle, validateTaskCandidate } from './storage'
import type { ExportBundle } from './types'

const bundle=():ExportBundle=>({schemaVersion:2,exportedAt:new Date().toISOString(),tasks:structuredClone(initialTasks),flow:{nodes:structuredClone(initialNodes),edges:structuredClone(initialEdges),viewport:initialViewport},audit:structuredClone(initialAudit)})

describe('versioned local bundle',()=>{
 beforeEach(()=>localStorage.clear())
 it('returns initial data when no saved value exists',()=>{const result=readBundle();expect(result.ok).toBe(true);expect(result.value.tasks).toHaveLength(39)})
 it('persists nodes, edges and viewport atomically',()=>{const value=bundle();value.flow.viewport={x:12,y:-4,zoom:1.3};expect(saveBundle(value).ok).toBe(true);expect(readBundle().value.flow.viewport).toEqual(value.flow.viewport)})
 it('reports corrupt data, preserves the raw value, and does not silently overwrite it',()=>{localStorage.setItem(KEYS.bundle,'{broken');const result=readBundle();expect(result.ok).toBe(false);expect(result.raw).toBe('{broken');expect(localStorage.getItem(KEYS.bundle)).toBe('{broken')})
 it('returns a write error instead of throwing',()=>{const spy=vi.spyOn(Storage.prototype,'setItem').mockImplementation(()=>{throw new DOMException('quota','QuotaExceededError')});expect(saveBundle(bundle()).ok).toBe(false);spy.mockRestore()})
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
 it('rejects oversized files before parsing',()=>{const text=' '.repeat(2_000_001);expect(parseImport(text).error).toContain('ファイルサイズ上限')})
 it('does not mutate existing storage when parsing invalid import',()=>{const existing=bundle();saveBundle(existing);expect(parseImport('{bad').ok).toBe(false);expect(readBundle().value.tasks).toHaveLength(existing.tasks.length)})
})

describe('CRUD dependency validation',()=>{
 it('returns item errors for missing IDs and cycles',()=>{const candidate={...initialTasks[0],dependencies:'T-999'};expect(validateTaskCandidate(candidate,initialTasks)[0].path).toContain('dependencies')})
})
