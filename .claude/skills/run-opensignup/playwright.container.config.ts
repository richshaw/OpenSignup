// The repo's Playwright config, pointed at an already-installed Chromium.
// The repo pins a Playwright whose own browser build may not be installed (in
// Claude's cloud container it isn't; /opt/pw-browsers/chromium is). Paths are
// re-anchored at the repo root, since Playwright resolves them from this file.
//
//   pnpm exec playwright test -c .claude/skills/run-opensignup/playwright.container.config.ts --project=chromium
import { existsSync } from 'node:fs';
import path from 'node:path';
import { defineConfig } from '@playwright/test';
import base from '../../../playwright.config';

const root = path.resolve(__dirname, '../../..');
const executablePath =
  process.env.CHROMIUM_PATH ??
  (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);

export default defineConfig({
  ...base,
  testDir: path.join(root, 'tests/e2e'),
  globalSetup: path.join(root, 'tests/e2e/global-setup.ts'),
  outputDir: path.join(root, 'test-results'),
  reporter: [['html', { outputFolder: path.join(root, 'playwright-report'), open: 'never' }]],
  webServer: base.webServer && { ...base.webServer, cwd: root },
  projects: base.projects?.map((p) => ({
    ...p,
    use: { ...p.use, launchOptions: { ...p.use?.launchOptions, executablePath } },
  })),
});
