import { describe, expect, it } from 'vitest'
import { readAuthCallbackError, readSupabaseConfig } from './config'

const key='sb_publishable_12345678901234567890'

describe('Supabase public configuration',()=>{
  it('returns null without both public values',()=>{expect(readSupabaseConfig({}, {origin:'https://example.github.io'})).toBeNull();expect(readSupabaseConfig({VITE_SUPABASE_URL:'https://project.supabase.co'}, {origin:'https://example.github.io'})).toBeNull()})
  it('includes the GitHub Pages base in the magic-link redirect',()=>{expect(readSupabaseConfig({VITE_SUPABASE_URL:'https://project.supabase.co',VITE_SUPABASE_PUBLISHABLE_KEY:key,BASE_URL:'/nexus-ops/'},{origin:'https://example.github.io'})).toEqual({url:'https://project.supabase.co',publishableKey:key,redirectTo:'https://example.github.io/nexus-ops/'})})
  it('rejects an insecure remote project URL',()=>{expect(readSupabaseConfig({VITE_SUPABASE_URL:'http://project.example.com',VITE_SUPABASE_PUBLISHABLE_KEY:'dummy'},{origin:'http://localhost:5173'})).toBeNull()})
  it('rejects secret keys in the browser configuration',()=>{expect(readSupabaseConfig({VITE_SUPABASE_URL:'https://project.supabase.co',VITE_SUPABASE_PUBLISHABLE_KEY:'sb_secret_never_browser'},{origin:'https://example.github.io'})).toBeNull()})
  it('rejects credentialed URLs and unsafe redirect bases',()=>{expect(readSupabaseConfig({VITE_SUPABASE_URL:'https://user:pass@project.supabase.co',VITE_SUPABASE_PUBLISHABLE_KEY:key},{origin:'https://example.github.io'})).toBeNull();expect(readSupabaseConfig({VITE_SUPABASE_URL:'https://project.supabase.co',VITE_SUPABASE_PUBLISHABLE_KEY:key,BASE_URL:'//evil.example/'},{origin:'https://example.github.io'})).toBeNull()})
  it('reports callback failures without reflecting markup',()=>{expect(readAuthCallbackError({search:'?error=access_denied&error_code=otp_expired&error_description=%3Cb%3ELink%3C%2Fb%3E+expired',hash:''})).toBe('認証コールバックエラー: b Link /b expired（otp_expired）')})
})
