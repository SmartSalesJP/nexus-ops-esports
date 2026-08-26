export const RPC={
  organizationCreationCapability:'rpc_organization_creation_capability',
  createOrganization:'rpc_create_organization',
  updateWorkspaceSettings:'rpc_update_workspace_settings',
  listOrganizations:'rpc_list_my_organizations',
  listMemberships:'rpc_list_memberships',
  readWorkspace:'rpc_read_snapshot',
  applyChanges:'rpc_apply_changes',
  saveWeekly:'rpc_save_weekly',
  importV4:'rpc_import_v4',
  manageMembership:'rpc_manage_membership',
} as const

export type WorkspaceRole='owner'|'editor'|'viewer'
export type WorkspaceStatus='active'|'archived'
export type EntityType='task'|'task_result'|'flow_node'|'flow_edge'|'flow_viewport'|'client_audit'|'kpi'|'report_baseline'|'migration_archive'|'weekly_run'|'weekly_completion'|'weekly_tombstone'|'weekly_meta'

export interface OrganizationSummary {
  id:string
  name:string
  slug:string
  status:WorkspaceStatus
  stateVersion:number
  role:WorkspaceRole
}

export interface CloudEntity {
  entityType:EntityType
  entityId:string
  payload:unknown
  ordinal:number
  version:number
}

export interface WorkspaceReadResponse {
  schemaVersion:4
  organization:Omit<OrganizationSummary,'role'>
  role:WorkspaceRole
  entities:CloudEntity[]
  importState:{status:'empty'|'imported'|'populated_without_manifest';manifestCount:number;lastManifestAt:string|null}
  workspaceProfile:import('../types').WorkspaceProfile|null
  workspaceConfig:import('../types').WorkspaceConfig|null
  readAt:string
}

export interface OrganizationCreationCapability { allowed:boolean;activeOwnerCount:number;reason:string }
export interface CreateOrganizationResponse extends ApplyChangesResponse {name:string;slug:string;status:WorkspaceStatus;role:'owner'}

export interface EntityChange {
  entityType:EntityType
  entityId:string
  op:'upsert'|'delete'
  expectedVersion:number
  payload?:unknown
  ordinal?:number
  semanticFingerprint?:string
  references?:Array<{kind:string;entityType:EntityType;entityId:string}>
}

export interface ApplyChangesResponse {
  organizationId:string
  stateVersion:number
  runId:string
  operation:string
  changedCount:number
  idempotent:boolean
  committedAt:string
}

export interface Membership {
  userId:string
  role:WorkspaceRole
  version:number
  createdAt:string
  updatedAt:string
  createdBy:string
  updatedBy:string
}

export interface MembershipMutationResponse {
  organizationId:string
  stateVersion:number
  runId:string
  userId:string
  role:WorkspaceRole|null
  action:'upsert'|'remove'
  previousMembershipVersion:number|null
  membershipVersion:number|null
  idempotent:boolean
  committedAt:string
}

export interface ImportResponse extends ApplyChangesResponse {
  manifestId:string
  manifestStatus:'completed'|'already_imported'
}
