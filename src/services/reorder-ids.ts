import { serviceError, type ServiceError } from '@/lib/errors';

export function everyIdOnceError(
  ids: string[],
  currentIds: string[],
  noun: 'slot' | 'field',
): ServiceError | null {
  const known = new Set(currentIds);
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const id of ids) (seen.has(id) ? duplicates : seen).add(id);
  const unknown = [...seen].filter((id) => !known.has(id));
  const missing = currentIds.filter((id) => !seen.has(id));
  if (duplicates.size === 0 && unknown.length === 0 && missing.length === 0) return null;

  const field = `${noun}Ids`;
  return serviceError(
    'invalid_input',
    `${field} must list every ${noun} of the signup exactly once`,
    {
      field,
      details: {
        ...(missing.length > 0 ? { missing } : {}),
        ...(unknown.length > 0 ? { unknown } : {}),
        ...(duplicates.size > 0 ? { duplicates: [...duplicates] } : {}),
      },
      suggestion:
        `call get_signup to see the ids of its ${noun}s, then send every one of them once, ` +
        'in the order you want them shown',
    },
  );
}
