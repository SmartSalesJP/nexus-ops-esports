import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import CloudRoot from './CloudRoot'

const auth=vi.hoisted(()=>({
  getSession:vi.fn(),
  onAuthStateChange:vi.fn(),
  signInWithOtp:vi.fn(),
  signOut:vi.fn(),
}))
const createClientMock=vi.hoisted(()=>vi.fn())

vi.mock('@supabase/supabase-js',()=>({createClient:createClientMock}))

const LOCAL_MODE_KEY='nexus.app.mode.v1'
const configure=()=>{
  vi.stubEnv('VITE_SUPABASE_URL','https://example.supabase.co')
  vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY','sb_publishable_cloud_root_test_1234567890')
}

beforeEach(()=>{
  localStorage.clear()
  vi.clearAllMocks()
  configure()
  auth.getSession.mockResolvedValue({data:{session:null},error:null})
  auth.onAuthStateChange.mockReturnValue({data:{subscription:{unsubscribe:vi.fn()}}})
  auth.signInWithOtp.mockResolvedValue({data:{session:null,user:null},error:null})
  auth.signOut.mockResolvedValue({error:null})
  createClientMock.mockReturnValue({auth})
})

afterEach(()=>{localStorage.clear();vi.unstubAllEnvs()})

describe('CloudRoot local-only mode',()=>{
  it('opens the local app without invoking OTP and remembers the selection',async()=>{
    const user=userEvent.setup()
    render(<CloudRoot/>)
    await screen.findByRole('heading',{name:'共有ワークスペースへログイン'})
    await user.click(screen.getByRole('button',{name:'メールなしでこの端末だけで使う'}))
    expect(await screen.findByRole('note')).toHaveTextContent('共有・同期はされず')
    expect(screen.getByRole('button',{name:'共有ログインへ切り替える'})).toBeInTheDocument()
    expect(localStorage.getItem(LOCAL_MODE_KEY)).toBe('local')
    expect(auth.signInWithOtp).not.toHaveBeenCalled()
  })

  it('restores the remembered local mode without creating a Supabase client',async()=>{
    localStorage.setItem(LOCAL_MODE_KEY,'local')
    const first=render(<CloudRoot/>)
    expect(await screen.findByRole('button',{name:'共有ログインへ切り替える'})).toBeInTheDocument()
    expect(createClientMock).not.toHaveBeenCalled()
    expect(auth.getSession).not.toHaveBeenCalled()
    first.unmount()
    render(<CloudRoot/>)
    expect(await screen.findByRole('button',{name:'共有ログインへ切り替える'})).toBeInTheDocument()
    expect(createClientMock).not.toHaveBeenCalled()
    expect(auth.getSession).not.toHaveBeenCalled()
  })

  it('returns from local mode to the shared login flow',async()=>{
    localStorage.setItem(LOCAL_MODE_KEY,'local')
    const user=userEvent.setup()
    render(<CloudRoot/>)
    await user.click(await screen.findByRole('button',{name:'共有ログインへ切り替える'}))
    expect(await screen.findByRole('heading',{name:'共有ワークスペースへログイン'})).toBeInTheDocument()
    expect(localStorage.getItem(LOCAL_MODE_KEY)).toBeNull()
    expect(createClientMock).toHaveBeenCalledTimes(1)
    expect(auth.getSession).toHaveBeenCalledTimes(1)
  })

  it('blocks the shared-login switch while a local draft is dirty',async()=>{
    localStorage.setItem(LOCAL_MODE_KEY,'local')
    const user=userEvent.setup()
    render(<CloudRoot/>)
    const switchButton=await screen.findByRole('button',{name:'共有ログインへ切り替える'})
    await user.click(screen.getByRole('tab',{name:'全タスク'}))
    await user.type(screen.getByLabelText('同時接続の実績'),'12')
    expect(switchButton).toBeDisabled()
    expect(switchButton).toHaveAttribute('title','未保存の変更を保存または破棄してから切り替えてください')
    await user.click(screen.getByRole('button',{name:'KPI変更を破棄'}))
    expect(switchButton).toBeEnabled()
  })
})

it('prioritizes an expired Auth callback over a remembered local mode',async()=>{
  localStorage.setItem(LOCAL_MODE_KEY,'local')
  history.replaceState(history.state,'','/?error=access_denied&error_code=otp_expired&error_description=Magic+link+expired')
  render(<CloudRoot/>)
  expect(await screen.findByRole('heading',{name:'共有ワークスペースへログイン'})).toBeInTheDocument()
  expect(screen.getByRole('alert')).toHaveTextContent('認証コールバックエラー: Magic link expired（otp_expired）')
  expect(localStorage.getItem(LOCAL_MODE_KEY)).toBeNull()
  expect(createClientMock).toHaveBeenCalledTimes(1)
  expect(auth.getSession).toHaveBeenCalledTimes(1)
  expect(location.search).toBe('')
})

it('keeps the invited-email OTP request contract',async()=>{
  render(<CloudRoot/>)
  await screen.findByRole('heading',{name:'共有ワークスペースへログイン'})
  fireEvent.change(screen.getByLabelText('メールアドレス'),{target:{value:'invited@example.com'}})
  fireEvent.click(screen.getByRole('button',{name:'マジックリンクを送信'}))
  await waitFor(()=>expect(auth.signInWithOtp).toHaveBeenCalledWith({email:'invited@example.com',options:{emailRedirectTo:'http://localhost:3000/',shouldCreateUser:false}}))
  expect(await screen.findByRole('status')).toHaveTextContent('ログインリンクを送信しました')
})
