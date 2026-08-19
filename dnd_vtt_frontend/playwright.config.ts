import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  retries: process.env['CI'] ? 2 : 0,
  reporter: process.env['CI'] ? 'github' : 'list',
  use: { baseURL: 'http://127.0.0.1:3100', trace: 'retain-on-failure' },
  webServer: process.env['PW_EXTERNAL_SERVER'] ? undefined : {
    command: 'npm --prefix ../dnd_vtt_backend run start',
    url: 'http://127.0.0.1:3100/',
    reuseExistingServer: !process.env['CI'],
    timeout: 120_000,
    env: { ...process.env, PORT: '3100', DB_PATH: '../dnd_vtt_frontend/test-results/e2e.db' },
  },
  projects: [
    { name: 'desktop-chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'phone', use: { ...devices['Pixel 7'] } },
    { name: 'tablet', use: { ...devices['iPad (gen 7)'], browserName: 'chromium' } },
  ],
});
