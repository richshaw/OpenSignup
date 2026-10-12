// Where a URL shown for copying by hand may wrap: after each run of / - ? & =,
// so a slug never splits mid-word. Render the pieces with <wbr> between them;
// <wbr> adds nothing to a copy, so the pieces join back to exactly the URL.
export function urlBreakSegments(url: string): string[] {
  // No lookbehind: it ships untranspiled, and Safari before 16.4 can't parse
  // it, which would break the whole sign-up sheet's chunk.
  const pieces = url.match(/[^/\-?&=]*[/\-?&=]*/g)!.filter((p) => p !== '');
  return pieces.length > 0 ? pieces : [''];
}
