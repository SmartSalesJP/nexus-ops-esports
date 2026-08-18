import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach, vi } from 'vitest'

afterEach(()=>{cleanup();vi.restoreAllMocks();vi.useRealTimers();history.replaceState(history.state,'',`${location.pathname}${location.search}`)})

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}
Object.defineProperty(globalThis,'ResizeObserver',{value:ResizeObserverMock,writable:true})
Object.defineProperty(window,'matchMedia',{value:(query:string)=>({matches:false,media:query,onchange:null,addListener:()=>undefined,removeListener:()=>undefined,addEventListener:()=>undefined,removeEventListener:()=>undefined,dispatchEvent:()=>false}),writable:true})
