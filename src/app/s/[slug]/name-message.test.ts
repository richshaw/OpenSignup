import { describe, expect, it } from 'vitest';
import { getStandInTranslator, getTestTranslator } from '@/i18n/testing/translator';
import { NAME_MAX_LENGTH } from '@/lib/participant-limits';
import { nameMessage } from './name-message';

const t = getTestTranslator('participant.errors');

describe('nameMessage', () => {
  it('says what a name needs, with the limit NameSchema sets', () => {
    expect(nameMessage({ code: 'invalid_input', field: 'name' }, t)).toStrictEqual({
      message: `Enter your name, up to ${NAME_MAX_LENGTH} characters.`,
    });
  });

  it('takes its line from the translator it is given', () => {
    const sv = getStandInTranslator('sv', 'participant.errors');
    expect(nameMessage({ code: 'invalid_input', field: 'name' }, sv)).toStrictEqual({
      message: 'participant.errors.name in sv',
    });
  });

  it('leaves another field, every other error, and none, to the caller', () => {
    expect(nameMessage({ code: 'invalid_input', field: 'notes' }, t)).toBeNull();
    expect(nameMessage({ code: 'invalid_input' }, t)).toBeNull();
    expect(nameMessage({ code: 'conflict', field: 'name' }, t)).toBeNull();
    expect(nameMessage(null, t)).toBeNull();
    expect(nameMessage(undefined, t)).toBeNull();
  });
});
