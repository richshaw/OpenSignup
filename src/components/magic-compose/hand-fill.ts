import { STARTER_PROMPTS } from '@/lib/magic-compose/templates';

/** The longest one-line description that comes over as the title. */
const TITLE_LIKE_MAX_LENGTH = 60;

/**
 * The most a carried value may take up in the query string, once encoded.
 * Node refuses a request whose request line and headers pass 16 KB (431), and
 * 2,000 CJK characters already encode to 18 KB, so the text is cut to this
 * before it goes in. 8,000 leaves room for cookies, and still carries more
 * than the form's 2,000-character description limit of plain English.
 */
const CARRIED_MAX_ENCODED_LENGTH = 8000;

/** `text` cut, at a whole character, to fit `max` once form-encoded. */
function fitEncoded(text: string, max: number): string {
  let used = 0;
  let end = 0;
  for (const char of text) {
    used += new URLSearchParams({ c: char }).toString().length - 2;
    if (used > max) break;
    end += char.length;
  }
  return text.slice(0, end);
}

/**
 * The manual New signup form, with what the organizer typed carried over, so
 * leaving Magic Compose doesn't drop it: a short line ("Pumpkin carving") as
 * the title, anything longer as the description. The form cuts each to its
 * limit. A starter example nobody changed isn't the organizer's own words, so
 * it opens the blank form, as it did before anything was carried.
 */
export function handFillHref(prompt: string): string {
  const text = prompt.trim();
  const params = new URLSearchParams({ manual: '1' });
  if (text && !STARTER_PROMPTS.some((s) => s.body.trim() === text)) {
    const titleLike = !text.includes('\n') && text.length <= TITLE_LIKE_MAX_LENGTH;
    params.set(titleLike ? 'title' : 'description', fitEncoded(text, CARRIED_MAX_ENCODED_LENGTH));
  }
  return `/app/signups/new?${params}`;
}
