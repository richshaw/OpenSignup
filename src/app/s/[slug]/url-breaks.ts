// Where a URL shown for copying by hand may wrap: after each run of / - ? & =,
// so a slug never splits mid-word. Render the pieces with <wbr> between them;
// <wbr> adds nothing to a copy, so the pieces join back to exactly the URL.
export function urlBreakSegments(url: string): string[] {
  return url.split(/(?<=[/\-?&=])(?![/\-?&=])/);
}
