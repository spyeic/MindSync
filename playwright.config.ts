import { defineConfig, devices } from '@playwright/test';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const baseURL = 'http://127.0.0.1:3137';
// Workers load the config again. Only the test runner owns the server's database.
const databaseDir = process.env.MINDSYNC_TEST_DATABASE_DIR ?? mkdtempSync(join(tmpdir(), 'mindsync-playwright-'));
if (!process.env.MINDSYNC_TEST_DATABASE_DIR) {
  process.env.MINDSYNC_TEST_DATABASE_DIR = databaseDir;
  process.on('exit', () => rmSync(databaseDir, { recursive: true, force: true }));
}

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 45_000,
  workers: 1,
  use: { baseURL, trace: 'retain-on-failure' },
  projects: [
    { name: 'desktop-chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile-webkit', use: { ...devices['iPhone 13'] } },
  ],
  webServer: {
    command: process.env.MINDSYNC_E2E_PRODUCTION === '1' ? 'npm run start' : 'npm run dev',
    url: `${baseURL}/api/health`,
    timeout: 120_000,
    env: {
      // Use a different public origin to verify invitations follow the browser address.
      HOST: '127.0.0.1', PORT: '3137', PUBLIC_BASE_URL: 'http://localhost:3137',
      DATABASE_PATH: join(databaseDir, 'test.db'), ALLOWED_ORIGINS: baseURL, TRUST_PROXY: 'false',
    },
    reuseExistingServer: false,
    gracefulShutdown: { signal: 'SIGTERM', timeout: 5000 },
  },
});
