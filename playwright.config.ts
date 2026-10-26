import { defineConfig } from '@playwright/test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dataDir = mkdtempSync(join(tmpdir(), 'minna-no-kiroku-e2e-'));
export default defineConfig({
  testDir: './tests/e2e',
  workers: 1,
  use: { baseURL: 'http://127.0.0.1:4178', browserName: 'chromium', actionTimeout: 5000 },
  webServer: {
    command: 'npm run dev -- --port 4178 --strictPort',
    url: 'http://127.0.0.1:4178',
    env: { AUTH_MODE: 'development', DATABASE_PATH: join(dataDir, 'test.db'), TZ: 'Asia/Tokyo' },
    reuseExistingServer: false,
    timeout: 30000
  }
});
