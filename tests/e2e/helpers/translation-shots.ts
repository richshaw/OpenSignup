import { test, type Page } from '@playwright/test';

/**
 * Set by `pnpm translation:screenshots`. Off, nothing is written, so CI and
 * an ordinary e2e run are unchanged.
 */
const CAPTURE = process.env.TRANSLATION_SCREENSHOTS === '1';

/**
 * Saves the page as it shows now to
 * `translation-review/<locale>/screens/<project>/<name>.png` when
 * `TRANSLATION_SCREENSHOTS=1`, for a translation's review in context
 * (docs/translating.md, and the `translate` skill). The folder is gitignored.
 *
 * Call it once a screen or state is on the page and checked, with a name
 * that says which it is, so the reviewer can tell them apart. The whole page
 * by default; just what's on screen with `{ sheet: true }`, for the sign-up
 * sheet, which sits over the page where a whole-page shot would lose it. The
 * phone-sized project the flag adds (playwright.config.ts) saves its own copy.
 */
export async function translationShot(
  page: Page,
  locale: string,
  name: string,
  { sheet = false }: { sheet?: boolean } = {},
): Promise<void> {
  if (!CAPTURE) return;
  // Fonts, focus and the sheet's opening settle after the last action.
  await page.waitForTimeout(300);
  const project = test.info().project.name;
  await page.screenshot({
    path: `translation-review/${locale}/screens/${project}/${name}.png`,
    fullPage: !sheet,
    animations: 'disabled',
  });
}
