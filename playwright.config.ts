import { defineConfig, devices } from '@playwright/test';

const baseURL = process.env.E2E_BASE_URL ?? 'http://localhost:3000';

/**
 * Chromium on Linux saves a download only under a name the locale's
 * character set can write: in the C locale, a container's default,
 * "Räksmörgås.ics" becomes "download". People's desktops use UTF-8.
 */
const utf8Downloads = {
  launchOptions: { env: { ...process.env, LC_CTYPE: 'C.UTF-8' } as Record<string, string> },
};

/**
 * `pnpm translation:screenshots` sets TRANSLATION_SCREENSHOTS=1, and these
 * specs then save a screenshot of each participant screen they check in a
 * language other than English (`translationShot`), for a translation's
 * review (docs/translating.md). With the flag they also run at a phone's
 * width, in Chromium, so the screenshots show where longer words wrap.
 */
const TRANSLATION_SPECS = /swedish-signup\.spec\.ts$/;

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  globalSetup: './tests/e2e/global-setup.ts',
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    // Production server: run `pnpm build` first. Locally an already-running
    // `pnpm dev` on :3000 is reused instead.
    command: 'pnpm start',
    // Shows the seeded Swedish signup in Swedish though Swedish hasn't shipped
    // (`signupLocale` in src/i18n/config.ts), and nothing else: it can't make
    // Swedish anybody's choice. A server you start yourself for these specs
    // needs it too.
    env: { E2E_UNSHIPPED_LOCALES: 'sv' },
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        ...utf8Downloads,
      },
    },
    {
      name: 'mobile-safari',
      use: { ...devices['iPhone 14'] },
      // The OAuth consent smoke is stateful (one seeded organizer, one grant);
      // two projects running it at once would revoke each other's tokens.
      // The response-header checks send requests, not taps, so a second
      // device adds nothing but calls against the shared per-IP token limit.
      testIgnore: /(oauth-consent|response-headers)\.spec\.ts/,
    },
    ...(process.env.TRANSLATION_SCREENSHOTS === '1'
      ? [
          {
            name: 'chromium-phone',
            testMatch: TRANSLATION_SPECS,
            use: {
              ...devices['Pixel 7'],
              viewport: { width: 390, height: 844 },
              deviceScaleFactor: 2,
              ...utf8Downloads,
            },
          },
        ]
      : []),
  ],
});
