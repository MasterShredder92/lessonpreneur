import path from 'node:path'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'
import { defineConfig, devices } from '@playwright/test'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.resolve(__dirname, '.env.local') })

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: 'list',
  use: {
    baseURL: process.env.E2E_BASE_URL || 'http://localhost:5173',
    trace: 'on-first-retry',
    ...devices['Desktop Chrome'],
  },
  webServer: process.env.E2E_NO_SERVER
    ? undefined
    : {
        command: 'npm run dev',
        url: 'http://localhost:5173',
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
})
