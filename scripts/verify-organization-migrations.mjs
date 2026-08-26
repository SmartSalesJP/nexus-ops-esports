import { readFile } from 'node:fs/promises'
import { stdout } from 'node:process'
import { URL } from 'node:url'

const createSignature='public.rpc_create_organization(text,text,text,text,text,text,jsonb,jsonb,uuid)'
const firstPath=new URL('../supabase/migrations/20260826015357_create_organization_workspaces.sql',import.meta.url)
const hardeningPath=new URL('../supabase/migrations/20260826033322_harden_organization_workspace_settings.sql',import.meta.url)
const [firstSource,hardeningSource]=await Promise.all([readFile(firstPath,'utf8'),readFile(hardeningPath,'utf8')])
const fail=(message)=>{throw new Error(`organization migration order: ${message}`)}
const withoutComments=(source)=>source.replace(/\/\*[\s\S]*?\*\//g,'').replace(/--[^\r\n]*/g,'')
const normalize=(source)=>source.replace(/\s+/g,' ').trim().toLowerCase()
const first=withoutComments(firstSource),hardening=withoutComments(hardeningSource)
const finalCreateGrant=`grant execute on function ${createSignature} to authenticated`

if(!first.includes(`revoke all on function ${createSignature} from public, anon, authenticated, service_role;`))
  fail('migration 1 must revoke create RPC from every API role')
if(new RegExp(`grant\\s+execute\\s+on\\s+function\\s+${createSignature.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}`,'i').test(first))
  fail('migration 1 must not expose create RPC before strict hardening exists')
if(!/create or replace function app_private\.execute_changes\(/i.test(hardening))
  fail('migration 2 must upgrade the shared mutation executor in place')
if(/^\$;$/m.test(hardening))fail('migration 2 contains an unterminated dollar-quoted function body')
const guard=hardening.indexOf('not app_private.workspace_entities_match_config(')
const executor=hardening.indexOf('create or replace function app_private.execute_changes(')
const settingsRpc=hardening.indexOf('create function public.rpc_update_workspace_settings(')
const createGrant=hardening.lastIndexOf(`${finalCreateGrant};`)
if(!(executor>=0&&guard>executor&&settingsRpc>guard&&createGrant>settingsRpc))
  fail('strict shared guard, owner settings RPC, and create grant are out of order')
const statements=hardening.split(';').map(normalize).filter(Boolean)
if(statements.at(-1)!==normalize(finalCreateGrant))
  fail('authenticated create grant must be the final migration statement')
const grantCount=statements.filter((statement)=>statement===normalize(finalCreateGrant)).length
if(grantCount!==1)fail('authenticated create grant must appear exactly once')

stdout.write('organization migration fresh/upgrade ordering: ok\n')
