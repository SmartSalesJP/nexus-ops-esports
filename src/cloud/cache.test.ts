import { describe, expect, it } from 'vitest'
import { initialAudit, initialEdges, initialKpis, initialNodes, initialTasks, initialViewport } from '../data'
import type { ExportBundle } from '../types'
import { emptyWeeklyState } from '../weekly'
import { cloudCacheKey, readCloudCache, removeCloudCache, writeCloudCache } from './cache'

const bundle:ExportBundle={schemaVersion:4,exportedAt:'2026-08-17T00:00:00.000Z',tasks:structuredClone(initialTasks),flow:{nodes:structuredClone(initialNodes),edges:structuredClone(initialEdges),viewport:structuredClone(initialViewport)},audit:structuredClone(initialAudit),kpis:structuredClone(initialKpis),reportBaseline:null,migrationArchive:[],weekly:emptyWeeklyState()}

describe('organization cloud cache',()=>{
  it('round-trips a verified envelope without touching the migration source',()=>{localStorage.clear();localStorage.setItem('nexus.bundle.v4','migration-source');expect(writeCloudCache('org-1',7,bundle).ok).toBe(true);const cached=readCloudCache('org-1');expect(cached?.organizationId).toBe('org-1');expect(cached?.stateVersion).toBe(7);expect(cached?.bundle.tasks).toHaveLength(bundle.tasks.length);expect(cached?.verifiedAt).toBeTruthy();expect(localStorage.getItem('nexus.bundle.v4')).toBe('migration-source');removeCloudCache('org-1');expect(localStorage.getItem(cloudCacheKey('org-1'))).toBeNull();expect(localStorage.getItem('nexus.bundle.v4')).toBe('migration-source')})
})
