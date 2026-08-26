import type { SupabaseClient } from '@supabase/supabase-js'
import { validateBundle } from '../storage'
import type { ExportBundle } from '../types'
import { removeCloudCache, writeCloudCache, writeImportMarker } from './cache'
import {
  RPC,
  type ApplyChangesResponse,
  type CloudEntity,
  type CreateOrganizationResponse,
  type ImportResponse,
  type Membership,
  type MembershipMutationResponse,
  type OrganizationSummary,
  type OrganizationCreationCapability,
  type WorkspaceReadResponse,
  type WorkspaceRole,
} from './contracts'
import { bundleToEntities, canonicalJson, diffEntities, entitiesToBundle } from './entities'
import type { PreparedMigrationSource } from './migration'
import type { Database, Json } from './database.types'
import type { GeneratedWorkspaceDraft, WorkspaceCreationInput } from '../workspace'
import type { WorkspaceConfig, WorkspaceProfile } from '../types'

const isRecord=(value:unknown):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value)
const roles=new Set(['owner','editor','viewer']),statuses=new Set(['active','archived']),entityTypes=new Set(['task','task_result','flow_node','flow_edge','flow_viewport','client_audit','kpi','report_baseline','migration_archive','weekly_run','weekly_completion','weekly_tombstone','weekly_meta']),importStatuses=new Set(['empty','imported','populated_without_manifest'])
const number=(value:unknown)=>typeof value==='number'&&Number.isSafeInteger(value)&&value>=0
const iso=(value:unknown)=>typeof value==='string'&&!Number.isNaN(Date.parse(value))

function parseOrganization(value:unknown):OrganizationSummary{
  if(!isRecord(value)||typeof value.id!=='string'||typeof value.name!=='string'||typeof value.slug!=='string'||!statuses.has(String(value.status))||!number(value.stateVersion)||!roles.has(String(value.role)))throw new Error('organization一覧の応答が不正です')
  return value as unknown as OrganizationSummary
}

function parseRead(value:unknown):WorkspaceReadResponse{
  if(!isRecord(value)||value.schemaVersion!==4||!isRecord(value.organization)||!Array.isArray(value.entities)||!isRecord(value.importState)||!roles.has(String(value.role))||!iso(value.readAt)||!importStatuses.has(String(value.importState.status))||!number(value.importState.manifestCount)||(value.importState.lastManifestAt!==null&&typeof value.importState.lastManifestAt!=='string'))throw new Error('workspace読込応答が不正です')
  const workspaceProfile=value.workspaceProfile??null,workspaceConfig=value.workspaceConfig??null
  if(workspaceProfile!==null&&(!isRecord(workspaceProfile)||typeof workspaceProfile.projectName!=='string'||typeof workspaceProfile.purpose!=='string'||typeof workspaceProfile.knownTasks!=='string'||workspaceProfile.generatorVersion!=='nexus-local-v1'||!iso(workspaceProfile.createdAt)))throw new Error('workspace profile応答が不正です')
  if(workspaceConfig!==null&&(!isRecord(workspaceConfig)||workspaceConfig.version!==1||!Array.isArray(workspaceConfig.phases)||!Array.isArray(workspaceConfig.departments)||!isRecord(workspaceConfig.terminology)))throw new Error('workspace config応答が不正です')
  const organization={...value.organization,role:value.role}
  parseOrganization(organization)
  for(const entity of value.entities){if(!isRecord(entity)||!entityTypes.has(String(entity.entityType))||typeof entity.entityId!=='string'||!number(entity.ordinal)||!number(entity.version)||!isRecord(entity.payload))throw new Error('workspace entity応答が不正です')}
  return {...value,workspaceProfile,workspaceConfig} as unknown as WorkspaceReadResponse
}

function parseApply(value:unknown):ApplyChangesResponse{
  if(!isRecord(value)||typeof value.organizationId!=='string'||!number(value.stateVersion)||typeof value.runId!=='string'||typeof value.operation!=='string'||!number(value.changedCount)||typeof value.idempotent!=='boolean'||!iso(value.committedAt))throw new Error('workspace保存応答が不正です')
  return value as unknown as ApplyChangesResponse
}

function parseCapability(value:unknown):OrganizationCreationCapability{
  if(!isRecord(value)||typeof value.allowed!=='boolean'||!number(value.activeOwnerCount)||typeof value.reason!=='string')throw new Error('organization作成権限の応答が不正です')
  return value as unknown as OrganizationCreationCapability
}

function parseCreate(value:unknown):CreateOrganizationResponse{
  const applied=parseApply(value)
  if(!isRecord(value)||typeof value.name!=='string'||typeof value.slug!=='string'||value.status!=='active'||value.role!=='owner')throw new Error('organization作成応答が不正です')
  return {...applied,name:value.name,slug:value.slug,status:'active',role:'owner'}
}

function parseImportResponse(value:unknown):ImportResponse{
  const applied=parseApply(value)
  if(!isRecord(value)||typeof value.manifestId!=='string'||!['completed','already_imported'].includes(String(value.manifestStatus)))throw new Error('移行応答が不正です')
  return {...applied,manifestId:value.manifestId,manifestStatus:value.manifestStatus as ImportResponse['manifestStatus']}
}

function parseMembership(value:unknown):Membership{
  if(!isRecord(value)||typeof value.userId!=='string'||!roles.has(String(value.role))||!number(value.version)||!iso(value.createdAt)||!iso(value.updatedAt)||typeof value.createdBy!=='string'||typeof value.updatedBy!=='string')throw new Error('membership応答が不正です')
  return value as unknown as Membership
}

function parseMembershipMutation(value:unknown):MembershipMutationResponse{
  if(!isRecord(value)||typeof value.organizationId!=='string'||!number(value.stateVersion)||typeof value.runId!=='string'||typeof value.userId!=='string'||!['upsert','remove'].includes(String(value.action))||(value.role!==null&&!roles.has(String(value.role)))||(value.previousMembershipVersion!==null&&!number(value.previousMembershipVersion))||(value.membershipVersion!==null&&!number(value.membershipVersion))||typeof value.idempotent!=='boolean'||!iso(value.committedAt))throw new Error('membership更新応答が不正です')
  return value as unknown as MembershipMutationResponse
}

export class CloudRepositoryError extends Error{
  constructor(public readonly kind:'offline'|'conflict'|'slug_conflict'|'read_only'|'session_expired'|'access_revoked'|'remote'|'invalid',message:string){super(message);this.name='CloudRepositoryError'}
}
export type CreationProgress='入力内容を確認しています'|'組織を保存しています'|'組織一覧を確認しています'|'初期データを確認しています'|'ブラウザ保存を確認しています'

export interface LoadedWorkspace {organization:OrganizationSummary;entities:CloudEntity[];bundle:ExportBundle|null;importState:WorkspaceReadResponse['importState'];profile?:WorkspaceProfile|null;config?:WorkspaceConfig|null;cacheWarning?:string;organizationList?:OrganizationSummary[]}
export interface SaveWorkspaceResult extends LoadedWorkspace {cacheWarning?:string}
export interface ManageMembershipInput {userId:string;role:WorkspaceRole|null;action:'upsert'|'remove';expectedMembershipVersion:number}

export class SupabaseWorkspaceRepository{
  private readonly workspaces=new Map<string,LoadedWorkspace>()
  constructor(private readonly client:SupabaseClient<Database>){}

  async listOrganizations():Promise<OrganizationSummary[]>{
    const {data,error}=await this.client.rpc(RPC.listOrganizations)
    if(error)throw this.classify(error)
    if(!Array.isArray(data))throw new CloudRepositoryError('invalid','organization一覧の応答が配列ではありません')
    return data.map(parseOrganization)
  }

  async organizationCreationCapability():Promise<OrganizationCreationCapability>{
    const {data,error}=await this.client.rpc(RPC.organizationCreationCapability)
    if(error)throw this.classify(error)
    return parseCapability(data)
  }

  async createOrganization(input:WorkspaceCreationInput,draft:GeneratedWorkspaceDraft,runId=crypto.randomUUID(),onProgress?:(progress:CreationProgress)=>void):Promise<LoadedWorkspace>{
    this.requireOnline()
    onProgress?.('入力内容を確認しています')
    const issues=validateBundle(draft.bundle,draft.config);if(issues.length)throw new CloudRepositoryError('invalid',`初期workspaceが不正です: ${issues[0].path} ${issues[0].message}`)
    const changes=diffEntities([],draft.bundle)
    onProgress?.('組織を保存しています')
    const {data,error}=await this.client.rpc(RPC.createOrganization,{p_name:input.organizationName.trim(),p_slug:input.slug,p_project_name:draft.profile.projectName,p_purpose:draft.profile.purpose,p_known_tasks:draft.profile.knownTasks,p_generator_version:draft.profile.generatorVersion,p_workspace_config:draft.config as unknown as Json,p_changes:changes as unknown as Json,p_run_id:runId})
    if(error)throw this.classify(error)
    const created=parseCreate(data)
    if(created.changedCount!==changes.length)throw new CloudRepositoryError('remote','serverの初期変更件数がpreviewと一致しません')
    onProgress?.('組織一覧を確認しています')
    const list=await this.listOrganizations(),summary=list.find((item)=>item.id===created.organizationId)
    if(!summary||summary.role!=='owner'||summary.name!==created.name||summary.slug!==created.slug||summary.stateVersion!==created.stateVersion)throw new CloudRepositoryError('remote','作成後のorganization一覧read-backが一致しません')
    onProgress?.('初期データを確認しています')
    const confirmed=await this.read(created.organizationId,false)
    const profileComparable=confirmed.profile&&{projectName:confirmed.profile.projectName,purpose:confirmed.profile.purpose,knownTasks:confirmed.profile.knownTasks,generatorVersion:confirmed.profile.generatorVersion},expectedProfile={projectName:draft.profile.projectName,purpose:draft.profile.purpose,knownTasks:draft.profile.knownTasks,generatorVersion:draft.profile.generatorVersion}
    if(!confirmed.bundle||!confirmed.config||!confirmed.profile||confirmed.organization.stateVersion!==created.stateVersion||canonicalJson(bundleToComparable(confirmed.bundle))!==canonicalJson(bundleToComparable(draft.bundle))||canonicalJson(confirmed.config)!==canonicalJson(draft.config)||canonicalJson(profileComparable)!==canonicalJson(expectedProfile))throw new CloudRepositoryError('conflict','作成後のserver snapshotがpreviewと一致しません')
    onProgress?.('ブラウザ保存を確認しています')
    this.workspaces.set(created.organizationId,confirmed)
    const cached=writeCloudCache(created.organizationId,created.stateVersion,confirmed.bundle,confirmed.config)
    return{...confirmed,organizationList:list,...(!cached.ok?{cacheWarning:`組織は作成済みですがブラウザcacheを更新できません: ${cached.error??'不明なエラー'}`}:{})}
  }

  async listMemberships(organizationId:string):Promise<Membership[]>{
    const {data,error}=await this.client.rpc(RPC.listMemberships,{p_organization_id:organizationId})
    if(error)throw this.classify(error)
    if(!Array.isArray(data))throw new CloudRepositoryError('invalid','membership一覧の応答が配列ではありません')
    return data.map(parseMembership)
  }

  async updateWorkspaceSettings(organizationId:string,profile:WorkspaceProfile,config:WorkspaceConfig):Promise<SaveWorkspaceResult>{
    const current=this.current(organizationId)
    if(current.organization.role!=='owner')throw new CloudRepositoryError('read_only','組織設定はownerだけが変更できます')
    if(!current.bundle)throw new CloudRepositoryError('invalid','workspace dataを先に読み込んでください')
    this.requireOnline()
    const at=new Date().toISOString(),tasks=current.bundle.tasks.map((task)=>{const department=config.departments.find((item)=>item.id===task.teamId);return department&&(task.team!==department.name||task.rawTeam!==department.name)?{...task,team:department.name,rawTeam:department.name,updatedAt:at}:task}),nodes=current.bundle.flow.nodes.map((node)=>{const phase=config.phases.find((item)=>node.id===`phase-${item.code}`);return phase&&node.data.label!==phase.name?{...node,data:{...node.data,label:phase.name}}:node}),candidate:ExportBundle={...current.bundle,exportedAt:at,tasks,flow:{...current.bundle.flow,nodes},workspaceProfile:profile,workspaceConfig:config,audit:[{id:`workspace-settings-${crypto.randomUUID()}`,issueId:'OP-WORKSPACE-SETTINGS',classification:'persistence',targetVersion:'0.5.0',files:['workspace profile/config'],before:'保存済み組織設定',after:'owner確認済み組織設定',evidence:['rpc_update_workspace_settings'],retest:'server read-back一致確認',residualRisk:'表示名変更は既存タスクへ同期し、個別責任者は保持',round:3,at,action:'組織設定更新',detail:`${profile.projectName} / ${config.phases.length} phases / ${config.departments.length} departments`},...current.bundle.audit]}
    const issues=validateBundle(candidate,config);if(issues.length)throw new CloudRepositoryError('invalid',`組織設定が不正です: ${issues[0].path} ${issues[0].message}`)
    const changes=diffEntities(current.entities,candidate),runId=crypto.randomUUID(),{data,error}=await this.client.rpc(RPC.updateWorkspaceSettings,{p_organization_id:organizationId,p_expected_state_version:current.organization.stateVersion,p_workspace_profile:profile as unknown as Json,p_workspace_config:config as unknown as Json,p_changes:changes as unknown as Json,p_run_id:runId})
    if(error)throw this.classify(error)
    const applied=parseApply(data);if(applied.changedCount!==changes.length)throw new CloudRepositoryError('remote','serverの設定変更件数が要求と一致しません')
    const confirmed=await this.read(organizationId,false),profileComparable=confirmed.profile&&{projectName:confirmed.profile.projectName,purpose:confirmed.profile.purpose,knownTasks:confirmed.profile.knownTasks,generatorVersion:confirmed.profile.generatorVersion,createdAt:confirmed.profile.createdAt}
    if(!confirmed.bundle||!confirmed.config||!confirmed.profile||confirmed.organization.stateVersion!==applied.stateVersion||canonicalJson(bundleToComparable(confirmed.bundle))!==canonicalJson(bundleToComparable(candidate))||canonicalJson(confirmed.config)!==canonicalJson(config)||canonicalJson(profileComparable)!==canonicalJson(profile))throw new CloudRepositoryError('conflict','設定保存後のserver read-backが一致しません')
    this.workspaces.set(organizationId,confirmed);const cached=writeCloudCache(organizationId,confirmed.organization.stateVersion,confirmed.bundle,confirmed.config);return cached.ok?confirmed:{...confirmed,cacheWarning:cached.error??'組織設定は保存済みですがbrowser cacheを更新できませんでした'}
  }

  async read(organizationId:string,remember=true):Promise<LoadedWorkspace>{
    const {data,error}=await this.client.rpc(RPC.readWorkspace,{p_organization_id:organizationId})
    if(error)throw this.classify(error)
    const response=parseRead(data),organization={...response.organization,role:response.role},rawBundle=response.entities.length?entitiesToBundle(response.entities,response.readAt,response.workspaceConfig??undefined):null,bundle=rawBundle?{...rawBundle,...(response.workspaceProfile?{workspaceProfile:response.workspaceProfile}:{}),...(response.workspaceConfig?{workspaceConfig:response.workspaceConfig}:{})}:null
    if(bundle){const issues=validateBundle(bundle,response.workspaceConfig??undefined);if(issues.length)throw new CloudRepositoryError('invalid',`workspace snapshotが不正です: ${issues[0].path} ${issues[0].message}`)}
    const loaded={organization,entities:response.entities,bundle,importState:response.importState,profile:response.workspaceProfile,config:response.workspaceConfig};if(remember)this.workspaces.set(organizationId,loaded);return loaded
  }

  adopt(workspace:LoadedWorkspace){this.workspaces.set(workspace.organization.id,workspace)}
  forget(organizationId:string){this.workspaces.delete(organizationId);removeCloudCache(organizationId)}

  async save(candidate:ExportBundle,organizationId:string,operation:'changes'|'weekly'='changes'):Promise<SaveWorkspaceResult>{
    const current=this.current(organizationId)
    if(current.organization.role==='viewer')throw new CloudRepositoryError('read_only','viewerは共有データを変更できません')
    const issues=validateBundle(candidate,current.config??undefined);if(issues.length)throw new CloudRepositoryError('invalid',`保存候補が不正です: ${issues[0].path} ${issues[0].message}`)
    const changes=diffEntities(current.entities,candidate)
    if(!changes.length)return current as SaveWorkspaceResult
    this.requireOnline()
    const rpc=operation==='weekly'?RPC.saveWeekly:RPC.applyChanges
    const {data,error}=await this.client.rpc(rpc,{p_organization_id:organizationId,p_expected_state_version:current.organization.stateVersion,p_changes:changes as unknown as Json,p_run_id:crypto.randomUUID()})
    if(error)throw this.classify(error)
    const applied=parseApply(data)
    if(applied.changedCount!==changes.length)throw new CloudRepositoryError('remote','serverの変更件数が要求と一致しません')
    return this.confirmCandidate(organizationId,candidate,applied.stateVersion)
  }

  async importV4(source:PreparedMigrationSource,organizationId:string):Promise<SaveWorkspaceResult>{
    const current=this.current(organizationId)
    if(current.organization.role!=='owner')throw new CloudRepositoryError('read_only','初回移行はownerだけが実行できます')
    if(current.entities.length||current.importState.status!=='empty'||current.importState.manifestCount!==0)throw new CloudRepositoryError('conflict','remoteが空ではないため初回移行を中止しました')
    this.requireOnline()
    const runId=crypto.randomUUID(),{data,error}=await this.client.rpc(RPC.importV4,{p_organization_id:organizationId,p_expected_state_version:current.organization.stateVersion,p_run_id:runId,p_raw_sha256:source.rawSha256,p_semantic_fingerprint:source.semanticFingerprint,p_source_origin:source.sourceOrigin,p_source_size:source.sourceSize,p_source_entity_count:source.sourceEntityCount,p_entities:source.entities as unknown as Json})
    if(error)throw this.classify(error)
    const imported=parseImportResponse(data)
    if(imported.organizationId!==organizationId||(imported.manifestStatus==='completed'&&imported.changedCount!==source.sourceEntityCount)||(imported.manifestStatus==='already_imported'&&imported.changedCount!==0))throw new CloudRepositoryError('remote','移行結果のorganizationまたはentity件数が一致しません')
    const confirmed=await this.confirmCandidate(organizationId,source.bundle,imported.stateVersion)
    if(confirmed.entities.length!==source.sourceEntityCount)throw new CloudRepositoryError('remote','移行後のserver entity件数が移行元と一致しません')
    const marked=writeImportMarker({organizationId,stateVersion:confirmed.organization.stateVersion,manifestId:imported.manifestId,semanticFingerprint:source.semanticFingerprint})
    return marked?confirmed:{...confirmed,cacheWarning:'移行成功マーカーをブラウザへ保存できませんでした'}
  }

  async manageMembership(organizationId:string,input:ManageMembershipInput):Promise<{workspace:LoadedWorkspace;memberships:Membership[];mutation:MembershipMutationResponse}>{
    const current=this.current(organizationId)
    if(current.organization.role!=='owner')throw new CloudRepositoryError('read_only','membership管理はownerだけが実行できます')
    this.requireOnline()
    const {data,error}=await this.client.rpc(RPC.manageMembership,{p_organization_id:organizationId,p_user_id:input.userId,p_role:input.role!,p_action:input.action,p_expected_state_version:current.organization.stateVersion,p_expected_membership_version:input.expectedMembershipVersion,p_run_id:crypto.randomUUID()})
    if(error)throw this.classify(error)
    const mutation=parseMembershipMutation(data),workspace=await this.read(organizationId),memberships=await this.listMemberships(organizationId),target=memberships.find((item)=>item.userId===input.userId)
    if(workspace.organization.stateVersion!==mutation.stateVersion)throw new CloudRepositoryError('remote','membership更新後のstate versionが一致しません')
    if(input.action==='remove'&&target)throw new CloudRepositoryError('remote','membership削除のread-backが一致しません')
    if(input.action==='upsert'&&(!target||target.role!==input.role||target.version!==mutation.membershipVersion))throw new CloudRepositoryError('remote','membership更新のread-backが一致しません')
    return{workspace,memberships,mutation}
  }

  private current(organizationId:string){const current=this.workspaces.get(organizationId);if(!current)throw new CloudRepositoryError('invalid','workspaceを先に読み込んでください');return current}
  private requireOnline(){if(!navigator.onLine)throw new CloudRepositoryError('offline','オフラインです。未保存候補はブラウザ上に保持します')}
  private async confirmCandidate(organizationId:string,candidate:ExportBundle,expectedStateVersion:number):Promise<SaveWorkspaceResult>{
    const confirmed=await this.read(organizationId,false)
    if(confirmed.organization.stateVersion!==expectedStateVersion)throw new CloudRepositoryError('conflict','保存後のserver state versionが保存結果と一致しません。最新版を確認してください')
    if(!confirmed.bundle||canonicalJson(bundleToComparable(confirmed.bundle))!==canonicalJson(bundleToComparable(candidate)))throw new CloudRepositoryError('conflict','保存後のserver read-backが候補と一致しません。最新版を確認してください')
    this.workspaces.set(organizationId,confirmed)
    const cached=writeCloudCache(organizationId,confirmed.organization.stateVersion,confirmed.bundle,confirmed.config)
    return cached.ok?confirmed:{...confirmed,cacheWarning:cached.error??'検証済みcloud cacheを更新できませんでした'}
  }

  private classify(error:{message:string;code?:string;status?:number}):CloudRepositoryError{
    const message=error.message||'Supabase request failed',normalized=message.toLowerCase()
    if(!navigator.onLine||normalized.includes('failed to fetch')||normalized.includes('network'))return new CloudRepositoryError('offline','通信できません。ネットワークを確認してください')
    if(error.status===401||error.code==='PGRST301'||normalized.includes('jwt')&&normalized.includes('expired'))return new CloudRepositoryError('session_expired','セッションの有効期限が切れました。再ログインしてください')
    if(error.code==='23505'&&(normalized.includes('slug')||normalized.includes('organizations_slug')))return new CloudRepositoryError('slug_conflict','識別子が既に使われています')
    if(error.status===409||error.code==='40001'||error.code==='23505'||normalized.includes('conflict')||normalized.includes('version')||normalized.includes('already exists'))return new CloudRepositoryError('conflict','別の利用者の更新と競合しました。最新版を確認してください')
    if(error.status===403||error.code==='42501'||error.code==='P0002'||normalized.includes('membership')||normalized.includes('organization access'))return new CloudRepositoryError('access_revoked','organizationへのアクセス権がありません。workspaceを閉じました')
    if(normalized.includes('viewer')||normalized.includes('read-only'))return new CloudRepositoryError('read_only','viewerはこの変更を実行できません')
    if((error.status??0)>=500)return new CloudRepositoryError('remote','serverで一時的な問題が発生しました。入力内容を保持したまま再試行できます')
    return new CloudRepositoryError('remote','serverへの要求を完了できませんでした。入力内容を確認して再試行してください')
  }
}

const bundleToComparable=(bundle:ExportBundle)=>bundleToEntities(bundle).map(({entityType,entityId,payload,ordinal})=>({entityType,entityId,payload,ordinal}))
