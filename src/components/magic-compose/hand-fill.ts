/** The longest one-line description that comes over as the title. */
const TITLE_LIKE_MAX_LENGTH = 60;

/**
 * The manual New signup form, with what the organizer typed carried over, so
 * leaving Magic Compose doesn't drop it: a short line ("Pumpkin carving") as
 * the title, anything longer as the description. The form cuts each to its
 * limit.
 */
export function handFillHref(prompt: string): string {
  const text = prompt.trim();
  const params = new URLSearchParams({ manual: '1' });
  if (text) {
    const titleLike = !text.includes('\n') && text.length <= TITLE_LIKE_MAX_LENGTH;
    params.set(titleLike ? 'title' : 'description', text);
  }
  return `/app/signups/new?${params}`;
}
