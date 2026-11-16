import { describe, expect, it } from 'vitest';
import { serviceError } from '@/lib/errors';
import { codeRefusal } from './code-refusal';

describe('codeRefusal', () => {
  it('says a code past its time has expired', () => {
    const error = serviceError('already_consumed', 'that code has expired — request a new link', {
      details: { reason: 'code_expired' },
    });
    expect(codeRefusal(error)).toBe('expired');
  });

  it('says a code that isn’t six digits, or matches nothing live, is wrong', () => {
    for (const reason of ['code_malformed', 'code_invalid'] as const) {
      const error = serviceError('invalid_input', 'that code is not valid', {
        field: 'code',
        details: { reason },
      });
      expect(codeRefusal(error)).toBe('wrong');
    }
  });

  // As the form read a refusal before reasons: by its code.
  it('falls back on the code for a refusal with no reason it knows', () => {
    expect(codeRefusal(serviceError('internal', 'could not read the sign-in link'))).toBe('wrong');
    expect(codeRefusal(serviceError('invalid_input', 'that code is not valid'))).toBe('wrong');
    expect(codeRefusal(serviceError('already_consumed', 'that code has expired'))).toBe('expired');
    const other = serviceError('invalid_input', 'too long', {
      details: { reason: 'name_too_long' },
    });
    expect(codeRefusal(other)).toBe('wrong');
  });
});
