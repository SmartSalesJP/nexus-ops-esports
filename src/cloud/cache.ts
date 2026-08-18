import { validateBundle } from '../storage'
import type { ExportBundle } from '../types'

export const CLOUD_CACHE_PREFIX='nexus.cloud.cache.v1:'
export const IMPORT_MARKER_PREFIX='nexus.cloud.import.v1:'

export interface CloudCacheEnvelope {schemaVersion:1;organizationId:string;stateVersion:number;verifiedAt:string;bundle:ExportBundle}
export interface ImportSuccessMarker {schemaVersion:1;organizationId:string;stateVersion:number;manifestId:string;semanticFingerprint:string;verifiedAt:string}
type StorageLike=Pick<Storage,'getItem'|'setItem'|'removeItem'>

const cacheKey=(organizationId:string)=>`${CLOUD_CACHE_PREFIX}${organizationId}`
const markerKey=(organizationId:string)=>`${IMPORT_MARKER_PREFIX}${organizationId}`
const validIso=(value:unknown)=>typeof value==='string'&&!Number.isNaN(Date.parse(value))

export function writeCloudCache(organizationId:string,stateVersion:number,bundle:ExportBundle,storage:StorageLike=localStorage):{ok:boolean;error?:string;value?:CloudCacheEnvelope}{
  const issues=validateBundle(bundle);if(issues.length)return{ok:false,error:`cache検証エラー: ${issues[0].path} ${issues[0].message}`}
  const value:CloudCacheEnvelope={schemaVersion:1,organizationId,stateVersion,verifiedAt:new Date().toISOString(),bundle},serialized=JSON.stringify(value)
  try{storage.setItem(cacheKey(organizationId),serialized);if(storage.getItem(cacheKey(organizationId))!==serialized)return{ok:false,error:'cloud cacheのread-backが一致しません'};return{ok:true,value}}catch(cause){return{ok:false,error:`cloud cacheを保存できません: ${cause instanceof Error?cause.message:'不明なエラー'}`}}
}

export function readCloudCache(organizationId:string,storage:StorageLike=localStorage):CloudCacheEnvelope|null{
  try{const raw=storage.getItem(cacheKey(organizationId));if(!raw)return null;const value=JSON.parse(raw) as Partial<CloudCacheEnvelope>;if(value.schemaVersion!==1||value.organizationId!==organizationId||!Number.isSafeInteger(value.stateVersion)||!validIso(value.verifiedAt)||validateBundle(value.bundle).length)return null;return value as CloudCacheEnvelope}catch{return null}
}

export function removeCloudCache(organizationId:string,storage:StorageLike=localStorage){try{storage.removeItem(cacheKey(organizationId))}catch{/* revoked cache is ignored even when storage is unavailable */}}

export function writeImportMarker(marker:Omit<ImportSuccessMarker,'schemaVersion'|'verifiedAt'>,storage:StorageLike=localStorage):boolean{
  const value:ImportSuccessMarker={schemaVersion:1,...marker,verifiedAt:new Date().toISOString()},serialized=JSON.stringify(value)
  try{storage.setItem(markerKey(marker.organizationId),serialized);return storage.getItem(markerKey(marker.organizationId))===serialized}catch{return false}
}

export const cloudCacheKey=cacheKey
export const importMarkerKey=markerKey
