// The commit this build was made from, inlined by next.config.mjs at build
// time (see NEXT_PUBLIC_COMMIT_SHA there). Empty when the build had neither a
// GIT_COMMIT_SHA build arg nor a git checkout; Next inlines an unset value as
// the literal 'undefined'.
const COMMIT_HASH = /^[0-9a-f]{7,40}$/i;

/**
 * The first 7 characters of the build's commit, or null when it isn't known.
 * Anything that doesn't look like a commit hash counts as unknown, so a stray
 * build arg can't put odd text in the footer.
 */
export function shortCommit(
  raw: string | undefined = process.env.NEXT_PUBLIC_COMMIT_SHA,
): string | null {
  const value = raw?.trim() ?? '';
  return COMMIT_HASH.test(value) ? value.slice(0, 7).toLowerCase() : null;
}
