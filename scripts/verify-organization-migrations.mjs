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
const unparenthesizedJsonTextConcat=/\|\|\s*[a-z_][\w.]*(?:\s*->\s*'[^']+')*\s*->>/i
const badJsonConcatProbes=[
  "select 'phase-' || phase.value->>'code'",
  "select '^C' || change.value->'payload'->>'phase'",
  "select 'phase-' ||\n  task.value\n    -> 'payload'\n    ->> 'phase'",
]
const goodJsonConcatProbes=[
  "select 'phase-' || (phase.value->>'code')",
  "select '^C' || (change.value->'payload'->>'phase')",
  "select 'phase-' ||\n  (task.value\n    -> 'payload'\n    ->> 'phase')",
]

if(badJsonConcatProbes.some((probe)=>!unparenthesizedJsonTextConcat.test(probe)))
  fail('JSON concatenation guard does not reject every unsafe probe')
if(goodJsonConcatProbes.some((probe)=>unparenthesizedJsonTextConcat.test(probe)))
  fail('JSON concatenation guard rejects a parenthesized safe probe')

if(/\bpg_catalog\.coalesce\s*\(/i.test(`${first}\n${hardening}`))
  fail('COALESCE is SQL syntax and must not be schema-qualified')
if(unparenthesizedJsonTextConcat.test(`${first}\n${hardening}`))
  fail('JSON text extraction used in concatenation must be parenthesized')
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
const executorEnd=hardening.indexOf('\n$$;',executor)
const executorBody=hardening.slice(executor,executorEnd)
const settingsEnd=hardening.indexOf('\n$$;',settingsRpc)
const settingsBody=hardening.slice(settingsRpc,settingsEnd)
const settingsLock=settingsBody.indexOf('for update;')
const ownerRecheck=settingsBody.indexOf(
  "if app_private.membership_role(p_organization_id,v_actor) is distinct from 'owner' then",
  settingsLock+1,
)
const settingsRunLookup=settingsBody.indexOf('select run.* into v_existing_run',ownerRecheck+1)
if(!(settingsLock>=0&&ownerRecheck>settingsLock&&settingsRunLookup>ownerRecheck))
  fail('settings RPC must recheck owner after its organization lock and before run replay')
const versionGuard="app_private.is_valid_nonnegative_bigint_text"
if(!executorBody.includes(versionGuard)||!settingsBody.includes(versionGuard))
  fail('both the shared executor and settings wrapper must validate versions before bigint casts')
const helper=hardening.indexOf('create function app_private.is_valid_nonnegative_bigint_text(')
const helperEnd=hardening.indexOf('\n$$;',helper)
const helperBody=hardening.slice(helper,helperEnd)
if(!(helper>=0&&helper<executor
  &&helperBody.includes("between 1 and 19")
  &&helperBody.includes("p_value ~ '^[0-9]+$'")
  &&helperBody.includes("p_value <= '9223372036854775807'")))
  fail('expectedVersion helper must reject non-digits, overlong values, and values above bigint max')
const executorVersionGuard=executorBody.indexOf(versionGuard)
const executorVersionCast=executorBody.indexOf("(c.value->>'expectedVersion')::bigint")
const settingsVersionGuard=settingsBody.indexOf(versionGuard)
const settingsFirstWrite=settingsBody.indexOf('update app_private.workspace_profiles')
if(!(executorVersionGuard>=0&&executorVersionCast>executorVersionGuard
  &&settingsVersionGuard>=0&&settingsFirstWrite>settingsVersionGuard))
  fail('expectedVersion validation must precede executor casts and settings writes')
const statements=hardening.split(';').map(normalize).filter(Boolean)
if(statements.at(-1)!==normalize(finalCreateGrant))
  fail('authenticated create grant must be the final migration statement')
const grantCount=statements.filter((statement)=>statement===normalize(finalCreateGrant)).length
if(grantCount!==1)fail('authenticated create grant must appear exactly once')

stdout.write('organization migration fresh/upgrade ordering: ok\n')
