import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir:'./e2e',fullyParallel:false,retries:0,workers:1,reporter:'list',
  use:{baseURL:'http://127.0.0.1:4173',trace:'retain-on-failure'},
  webServer:{command:'pnpm run dev --host 127.0.0.1 --port 4173',url:'http://127.0.0.1:4173',reuseExistingServer:false,timeout:120_000},
  projects:[{name:'chromium-desktop',use:{...devices['Desktop Chrome']}},{name:'chromium-mobile',use:{browserName:'chromium',viewport:{width:390,height:844},isMobile:true,hasTouch:true}}],
})
