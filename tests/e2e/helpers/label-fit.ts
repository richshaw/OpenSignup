import { expect, type Locator } from '@playwright/test';

/**
 * How many lines the text in `el` takes, and whether `el` cuts it off: its
 * content is wider than its box, as a label too long for a button of fixed
 * width, or one that `truncate` ends with "…", is. Lines are counted from
 * its text alone, so an icon beside a label isn't taken for a line of its
 * own. Runs in the page.
 */
function measureLabel(el: Element): { lines: number; spills: boolean } {
  const tops: number[] = [];
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (!node.textContent?.trim()) continue;
    const range = document.createRange();
    range.selectNodeContents(node);
    for (const rect of range.getClientRects()) if (rect.width > 0) tops.push(rect.top);
  }
  tops.sort((a, b) => a - b);
  const lines = tops.filter((top, i) => i === 0 || top - tops[i - 1]! > 2).length;
  return { lines, spills: el.scrollWidth > el.clientWidth };
}

/** Checks `target`'s label is on one line and fits its box. */
export async function expectOneLine(target: Locator, where: string): Promise<void> {
  expect(await target.evaluate(measureLabel), `"${await target.textContent()}" ${where}`).toEqual({
    lines: 1,
    spills: false,
  });
}
