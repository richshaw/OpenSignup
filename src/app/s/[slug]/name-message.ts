/**
 * Participant-facing copy for an `invalid_input` on `name`, from signing up or
 * from the edit page: the name was blank once trimmed, or longer than
 * `NameSchema` allows. The server's text ("name is required", "Check the value
 * of \"name\".") is written for API callers, not participants.
 */
export const NAME_INVALID = {
  message: 'Enter your name, up to 100 characters.',
} as const;

/** `NAME_INVALID` for an `invalid_input` on `name`, null for anything else. */
export function nameMessage(
  error: { code?: string; field?: string } | null | undefined,
): typeof NAME_INVALID | null {
  return error?.code === 'invalid_input' && error.field === 'name' ? NAME_INVALID : null;
}
