import type { SourceConfidence, SourceRef } from './types'

export const SOURCE_CATALOG = {
  S1: { fileName:'[LINE]excel esports academy.txt', sha256:'ACFEC279A0C9D539E9898BBD54DCA9A8A94554E73FB28CF27E6C6763AE589CFD', asOf:'2026-08-05', maxLine:1831 },
  S2: { fileName:'━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━.md', sha256:'0D4C5D9A238730E0CCE56228F19C9F53BC781DB1F73EC54DD4438DAA68AB519F', asOf:'2026-08-14', maxLine:375 },
  S3: { fileName:'eスポーツ人材発掘・育成プロジェクト（仮）.md', sha256:'C8C5319F92133BE52C9A02B53CC60D59310BE37D3E250BF842970B2C37190BB9', asOf:'2026-08-14', maxLine:582 },
  S4: { fileName:'eスポーツ大会_開催設計_全タスクリスト.md', sha256:'D24C5785D0AA8D3D4995767EAB565016E346149294ABEB0E0133C163C0E2BE87', asOf:'2026-08-14', maxLine:300 },
} as const
export type SourceId=keyof typeof SOURCE_CATALOG
export const sourceRef=(sourceId:SourceId,lineStart:number,lineEnd:number,confidence:SourceConfidence='high'):SourceRef=>{const {fileName,sha256,asOf}=SOURCE_CATALOG[sourceId];return{sourceId,fileName,sha256,asOf,lineStart,lineEnd,confidence}}
