/**
 * A browser sends each line break in a textarea as `\r\n`, but counts it as
 * one character against `maxLength`. Turning them back into `\n` makes the
 * server count what the browser counted, and stores the description the way
 * the Build tab (which sends JSON) already does.
 */
export function lfLineBreaks(text: string): string {
  return text.replace(/\r\n/g, '\n');
}
