/**
 * The dashboard's count line. The list stops at WORKSPACE_LIST_LIMIT, so when
 * the workspace has more, say how many of them are showing (#848).
 */
export function signupCountLabel(shown: number, total: number): string {
  if (total <= shown) return `${shown} total`;
  return `Showing the newest ${shown} of ${total}`;
}
