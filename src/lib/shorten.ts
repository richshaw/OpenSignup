const ELLIPSIS = '…';

/**
 * Cut `text` to at most `max` characters, ending with an ellipsis. It cuts at
 * the last space when there is one in the second half, so a word isn't split,
 * and never between the two halves of an emoji.
 */
export function shortenToLimit(text: string, max: number): string {
  if (text.length <= max) return text;
  const budget = max - ELLIPSIS.length;
  let head = text.slice(0, budget);
  if (/[\uD800-\uDBFF]$/.test(head)) head = head.slice(0, -1);
  if (!/\s/.test(text.charAt(head.length))) {
    const lastSpace = head.search(/\s\S*$/);
    if (lastSpace >= budget / 2) head = head.slice(0, lastSpace);
  }
  const trimmed = head.replace(/[\s,;:.\-–—]+$/, '');
  return `${trimmed || head}${ELLIPSIS}`;
}
