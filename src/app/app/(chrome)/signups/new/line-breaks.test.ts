import { describe, expect, it } from 'vitest';
import { DESCRIPTION_MAX_LENGTH } from '@/schemas/signups';
import { lfLineBreaks } from './line-breaks';

describe('lfLineBreaks', () => {
  it('turns the \\r\\n a browser sends for each line break into \\n', () => {
    expect(lfLineBreaks('one\r\ntwo\r\n\r\nthree')).toBe('one\ntwo\n\nthree');
  });

  it('leaves text that already uses \\n as it is', () => {
    expect(lfLineBreaks('one\ntwo')).toBe('one\ntwo');
  });

  it('counts a full textarea the way the browser did', () => {
    // 1,996 letters and 4 line breaks: 2,000 in the textarea, 2,004 as sent.
    const sent = `${'a'.repeat(499)}\r\n`.repeat(4);
    expect(sent).toHaveLength(DESCRIPTION_MAX_LENGTH + 4);
    expect(lfLineBreaks(sent)).toHaveLength(DESCRIPTION_MAX_LENGTH);
  });
});
