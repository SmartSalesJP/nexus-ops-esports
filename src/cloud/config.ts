export interface SupabaseBrowserConfig {url:string;publishableKey:string;redirectTo:string}

type PublicEnv={VITE_SUPABASE_URL?:string;VITE_SUPABASE_PUBLISHABLE_KEY?:string;BASE_URL?:string}
type BrowserLocation=Pick<Location,'origin'>&Partial<Pick<Location,'href'|'pathname'|'search'|'hash'>>
const publishablePattern=/^sb_publishable_[A-Za-z0-9_-]{20,}$/
const localHost=(hostname:string)=>hostname==='localhost'||hostname==='127.0.0.1'||hostname==='[::1]'

export function readSupabaseConfig(env:PublicEnv=import.meta.env,location:BrowserLocation=window.location):SupabaseBrowserConfig|null{
  const url=env.VITE_SUPABASE_URL?.trim(),publishableKey=env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim()
  if(!url||!publishableKey||!publishablePattern.test(publishableKey))return null
  let parsed:URL,site:URL
  try{parsed=new URL(url);site=new URL(location.origin)}catch{return null}
  if((parsed.protocol!=='https:'&&!localHost(parsed.hostname))||parsed.username||parsed.password||parsed.search||parsed.hash||!['','/'].includes(parsed.pathname))return null
  if(site.protocol!=='https:'&&!localHost(site.hostname))return null
  const base=env.BASE_URL?.trim()||'/'
  if(!base.startsWith('/')||base.startsWith('//')||base.includes('\\')||base.includes('?')||base.includes('#')||decodeURIComponentSafe(base).split('/').includes('..'))return null
  const redirect=new URL(base,`${site.origin}/`)
  if(redirect.origin!==site.origin||redirect.search||redirect.hash)return null
  return{url:parsed.origin,publishableKey,redirectTo:redirect.toString()}
}

export function readAuthCallbackError(location:Partial<Pick<Location,'href'|'search'|'hash'>>=window.location):string{
  const query=new URLSearchParams(location.search??''),hash=new URLSearchParams((location.hash??'').replace(/^#/,'')),get=(key:string)=>query.get(key)??hash.get(key)
  const error=get('error'),code=get('error_code'),description=get('error_description')
  if(!error&&!code&&!description)return''
  const safe=(value:string|null)=>value?Array.from(value).map((character)=>{const code=character.charCodeAt(0);return code<32||code===127||character==='<'||character==='>'?' ':character}).join('').replace(/\s+/g,' ').trim().slice(0,240):''
  const detail=safe(description)||safe(error)||'認証リンクを確認できませんでした',suffix=safe(code)
  return `認証コールバックエラー: ${detail}${suffix?`（${suffix}）`:''}`
}

const decodeURIComponentSafe=(value:string)=>{try{return decodeURIComponent(value)}catch{return value}}
