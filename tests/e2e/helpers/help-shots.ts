import type { Locator, Page } from '@playwright/test';

const CAPTURE = process.env.HELP_SCREENSHOTS === '1';

type Pad = number | { top: number; right: number; bottom: number; left: number };

/**
 * The part of the page that holds every one of `targets`, with `pad` pixels
 * of the page around it (the same on every side, or each side's own), in
 * whole pixels, so the file is exactly twice the size the article gives.
 * Writes `public/help/<slug>/<name>.png` when `HELP_SCREENSHOTS=1`.
 */
export async function helpShot(
  page: Page,
  slug: string,
  targets: Locator[],
  name: string,
  pad: Pad = 16,
): Promise<void> {
  if (!CAPTURE) return;
  const around = typeof pad === 'number' ? { top: pad, right: pad, bottom: pad, left: pad } : pad;
  // Fonts and focus settle after the last action.
  await page.waitForTimeout(300);
  const boxes = await Promise.all(targets.map((target) => target.boundingBox()));
  const found = boxes.filter((box) => box !== null);
  if (found.length !== targets.length) throw new Error(`${name}: not on the page`);
  const x = Math.floor(Math.min(...found.map((b) => b.x))) - around.left;
  const y = Math.floor(Math.min(...found.map((b) => b.y))) - around.top;
  const right = Math.ceil(Math.max(...found.map((b) => b.x + b.width))) + around.right;
  const bottom = Math.ceil(Math.max(...found.map((b) => b.y + b.height))) + around.bottom;
  await page.screenshot({
    path: `public/help/${slug}/${name}.png`,
    clip: { x, y, width: right - x, height: bottom - y },
    animations: 'disabled',
  });
}

/**
 * The element itself, with nothing of the page around it. Writes
 * `public/help/<slug>/<name>.png` when `HELP_SCREENSHOTS=1`.
 */
export async function helpElementShot(
  page: Page,
  slug: string,
  target: Locator,
  name: string,
): Promise<void> {
  if (!CAPTURE) return;
  // Fonts and the save indicator settle after the last action.
  await page.waitForTimeout(300);
  await target.screenshot({ path: `public/help/${slug}/${name}.png`, animations: 'disabled' });
}
