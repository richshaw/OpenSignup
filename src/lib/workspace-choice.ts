import { serviceError, type ServiceError } from './errors';
import { err, ok, type Result } from './result';

interface WorkspaceHints {
  /** Shown when the caller passed a workspaceId that is blank or not a string. */
  invalid: string;
  /** Shown when the caller passed none and the organizer has no default. */
  noDefault: string;
}

/**
 * The workspace a create or list acts in: the id the caller gave, else the
 * organizer's default. `requested` is whatever arrived over the wire, so a
 * REST body's number or array is refused here rather than handed to a service.
 * `undefined` and `null` both mean "not given".
 */
export function chooseWorkspaceId(
  requested: unknown,
  defaultWorkspaceId: string | null,
  hints: WorkspaceHints,
): Result<string, ServiceError> {
  if (requested !== undefined && requested !== null) {
    if (typeof requested !== 'string') {
      return err(
        serviceError('invalid_input', 'workspaceId must be a string', {
          field: 'workspaceId',
          suggestion: hints.invalid,
        }),
      );
    }
    // An empty string is a caller mistake, not an omission. Falling through to
    // the default workspace would quietly act somewhere the caller did not ask for.
    if (requested.trim() === '') {
      return err(
        serviceError('invalid_input', 'workspaceId must not be empty', {
          field: 'workspaceId',
          suggestion: hints.invalid,
        }),
      );
    }
    return ok(requested);
  }
  if (defaultWorkspaceId) return ok(defaultWorkspaceId);
  return err(
    serviceError('invalid_input', 'no workspace given and the account has no default workspace', {
      field: 'workspaceId',
      suggestion: hints.noDefault,
    }),
  );
}
