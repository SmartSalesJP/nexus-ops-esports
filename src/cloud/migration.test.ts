import { describe, expect, it } from 'vitest'
import { initialAudit, initialEdges, initialKpis, initialNodes, initialTasks, initialViewport } from '../data'
import type { ExportBundle } from '../types'
import { emptyWeeklyState } from '../weekly'
import { inspectMigrationSource, semanticBundleFingerprint } from './migration'

const bundle=(exportedAt='2026-08-17T00:00:00.000Z'):ExportBundle=>({schemaVersion:4,exportedAt,tasks:structuredClone(initialTasks),flow:{nodes:structuredClone(initialNodes),edges:structuredClone(initialEdges),viewport:structuredClone(initialViewport)},audit:structuredClone(initialAudit),kpis:structuredClone(initialKpis),reportBaseline:null,migrationArchive:[],weekly:emptyWeeklyState()})

describe('cloud migration evidence',()=>{
  it('keeps raw and semantic fingerprints distinct',async()=>{const first=bundle(),second=bundle('2026-08-18T00:00:00.000Z'),raw=JSON.stringify(first),inspected=await inspectMigrationSource({storageKey:'nexus.bundle.v4',raw,sourceOrigin:'https://example.test#nexus.bundle.v4'});expect(inspected.prepared?.raw).toBe(raw);expect(inspected.prepared?.sourceSize).toBe(new TextEncoder().encode(raw).byteLength);expect(inspected.prepared?.sourceEntityCount).toBeGreaterThan(first.tasks.length);expect(inspected.prepared?.semanticFingerprint).toBe(await semanticBundleFingerprint(second))})
  it('retains corrupt raw for backup while refusing import preparation',async()=>{const raw='{broken',inspected=await inspectMigrationSource({storageKey:'nexus.bundle.v4',raw,sourceOrigin:'test'});expect(inspected.raw).toBe(raw);expect(inspected.rawSha256).toHaveLength(64);expect(inspected.prepared).toBeUndefined();expect(inspected.error).toBeTruthy()})
})
