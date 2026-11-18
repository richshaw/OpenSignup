import { describe, expect, it } from 'vitest';
import { signupTabPath } from './organizer-paths';

describe('signupTabPath', () => {
  it('builds each tab’s path under the signup', () => {
    expect(signupTabPath('sig_abc', 'build')).toBe('/app/signups/sig_abc/build');
    expect(signupTabPath('sig_abc', 'preview')).toBe('/app/signups/sig_abc/preview');
    expect(signupTabPath('sig_abc', 'responses')).toBe('/app/signups/sig_abc/responses');
    expect(signupTabPath('sig_abc', 'settings')).toBe('/app/signups/sig_abc/settings');
  });
});
