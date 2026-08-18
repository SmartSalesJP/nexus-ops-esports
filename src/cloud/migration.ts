import { KEYS, parseImport } from '../storage'
import type { ExportBundle } from '../types'
import { bundleToEntities, diffEntities } from './entities'

export interface RawMigrationSource {storageKey:string;raw:string;sourceOrigin:string}
export interface PreparedMigrationSource extends RawMigrationSource {rawSha256:string;semanticFingerprint:string;sourceSize:number;sourceEntityCount:number;bundle:ExportBundle;entities:ReturnType<typeof diffEntities>}
export interface InspectedMigrationSource extends RawMigrationSource {rawSha256:string;sourceSize:number;prepared?:PreparedMigrationSource;error?:string}
type ReadStorage=Pick<Storage,'getItem'>

export function readLocalMigrationSource(storage:ReadStorage=localStorage,origin=window.location.origin):RawMigrationSource|null{
  for(const storageKey of [KEYS.bundle,KEYS.legacyV3,KEYS.legacyBundle]){try{const raw=storage.getItem(storageKey);if(raw!==null)return{storageKey,raw,sourceOrigin:`${origin}#${storageKey}`}}catch{return null}}
  return null
}

const bytes=(value:string)=>new TextEncoder().encode(value)
export async function sha256(value:string):Promise<string>{const digest=await crypto.subtle.digest('SHA-256',bytes(value));return Array.from(new Uint8Array(digest),(part)=>part.toString(16).padStart(2,'0')).join('')}
const canonical=(value:unknown):string=>Array.isArray(value)?`[${value.map(canonical).join(',')}]`:value&&typeof value==='object'?`{${Object.entries(value as Record<string,unknown>).filter(([,item])=>item!==undefined).sort(([a],[b])=>a.localeCompare(b)).map(([key,item])=>`${JSON.stringify(key)}:${canonical(item)}`).join(',')}}`:(JSON.stringify(value)??'null')
export async function semanticBundleFingerprint(bundle:ExportBundle):Promise<string>{const entities=bundleToEntities(bundle).map(({entityType,entityId,payload})=>({entityType,entityId,payload})).sort((a,b)=>a.entityType.localeCompare(b.entityType)||a.entityId.localeCompare(b.entityId));return sha256(canonical({schemaVersion:4,entities}))}

export async function inspectMigrationSource(source:RawMigrationSource):Promise<InspectedMigrationSource>{
  const sourceSize=bytes(source.raw).byteLength,rawSha256=await sha256(source.raw),parsed=parseImport(source.raw)
  if(!parsed.ok)return{...source,sourceSize,rawSha256,error:parsed.error??'schema v4 JSONを検証できません'}
  const semanticFingerprint=await semanticBundleFingerprint(parsed.value),entities=diffEntities([],parsed.value)
  return{...source,sourceSize,rawSha256,prepared:{...source,sourceSize,rawSha256,semanticFingerprint,sourceEntityCount:entities.length,bundle:parsed.value,entities}}
}

export async function verifyRawReadback(source:InspectedMigrationSource,file:File):Promise<boolean>{const raw=await file.text();return raw===source.raw&&await sha256(raw)===source.rawSha256}
