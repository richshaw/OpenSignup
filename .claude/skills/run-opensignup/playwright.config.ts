// The repo's e2e suite, for a container without Playwright's own browser downloads:
// Chromium comes from /opt/pw-browsers, and the iPhone 14 project runs on Chromium
// because there is no WebKit. Run from the repo root:
//   pnpm exec playwright test --config .claude/skills/run-opensignup/playwright.config.ts
import path from 'node:path';
import { defineConfig, devices } from '@playwright/test';
import base from '../../../playwright.config';

const root = process.cwd();
const launchOptions = { executablePath: process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium' };
const { defaultBrowserType: _webkit, ...iphone } = devices['iPhone 14'];

export default defineConfig({
  ...base,
  // Paths in the base config are relative to its own directory, not this one.
  testDir: path.join(root, 'tests/e2e'),
  globalSetup: path.join(root, 'tests/e2e/global-setup.ts'),
  outputDir: path.join(root, 'test-results'),
  reporter: 'list',
  webServer:
    base.webServer && !Array.isArray(base.webServer)
      ? { ...base.webServer, cwd: root }
      : base.webServer,
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'], launchOptions } },
    {
      name: 'mobile-safari',
      use: { ...iphone, browserName: 'chromium', launchOptions },
      testIgnore: /oauth-consent\.spec\.ts/,
    },
  ],
});
