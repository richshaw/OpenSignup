import { describe, it, expect } from 'vitest';
import { validate } from './fieldEditorValidation';

describe('FieldEditor validate()', () => {
  describe('name', () => {
    it('flags empty name', () => {
      const errors = validate('', 'text', '');
      expect(errors.name).toBe('Name is required.');
    });

    it('flags whitespace-only name as empty', () => {
      const errors = validate('   \t  ', 'text', '');
      expect(errors.name).toBe('Name is required.');
    });

    it('flags name longer than 80 chars', () => {
      const errors = validate('a'.repeat(81), 'text', '');
      expect(errors.name).toBe('Name must be 80 characters or fewer.');
    });

    it('measures length after trim', () => {
      const errors = validate(`   ${'a'.repeat(80)}   `, 'text', '');
      expect(errors.name).toBeUndefined();
    });

    it('accepts an 80-char name', () => {
      const errors = validate('a'.repeat(80), 'text', '');
      expect(errors.name).toBeUndefined();
    });

    it('accepts a normal name', () => {
      const errors = validate('Email', 'text', '');
      expect(errors.name).toBeUndefined();
    });
  });

  describe('choices (enum only)', () => {
    it('does not check choices for non-enum types', () => {
      const errors = validate('Email', 'text', '');
      expect(errors.choices).toBeUndefined();
    });

    it('flags empty choices for enum', () => {
      const errors = validate('Size', 'enum', '');
      expect(errors.choices).toEqual(['Add at least one choice.']);
    });

    it('treats whitespace-only lines as empty', () => {
      const errors = validate('Size', 'enum', '   \n\n  \t\n');
      expect(errors.choices).toEqual(['Add at least one choice.']);
    });

    it('accepts a single valid choice', () => {
      const errors = validate('Size', 'enum', 'Small');
      expect(errors.choices).toBeUndefined();
    });

    it('ignores blank lines between valid choices', () => {
      const errors = validate('Size', 'enum', 'Small\n\nMedium\n  \nLarge');
      expect(errors.choices).toBeUndefined();
    });

    it('flags a choice over 60 chars with its 1-based locator', () => {
      const text = ['Short', 'a'.repeat(61), 'Also short'].join('\n');
      const errors = validate('Size', 'enum', text);
      expect(errors.choices).toEqual([
        'Choice 2 must be 60 characters or fewer.',
      ]);
    });

    it('numbers choice locators among non-empty lines only', () => {
      // Blank line between two real choices; the long one is the 2nd non-empty.
      const text = ['Short', '', 'a'.repeat(61)].join('\n');
      const errors = validate('Size', 'enum', text);
      expect(errors.choices).toEqual([
        'Choice 2 must be 60 characters or fewer.',
      ]);
    });

    it('reports every over-long choice in order', () => {
      const text = ['a'.repeat(61), 'ok', 'b'.repeat(70)].join('\n');
      const errors = validate('Size', 'enum', text);
      expect(errors.choices).toEqual([
        'Choice 1 must be 60 characters or fewer.',
        'Choice 3 must be 60 characters or fewer.',
      ]);
    });

    it('flags more than 20 choices', () => {
      const text = Array.from({ length: 21 }, (_, i) => `choice-${i}`).join(
        '\n',
      );
      const errors = validate('Size', 'enum', text);
      expect(errors.choices).toEqual(['At most 20 choices allowed.']);
    });

    it('reports long-choice and 20-cap errors together', () => {
      const lines = Array.from({ length: 21 }, (_, i) =>
        i === 0 ? 'a'.repeat(61) : `choice-${i}`,
      );
      const errors = validate('Size', 'enum', lines.join('\n'));
      expect(errors.choices).toEqual([
        'Choice 1 must be 60 characters or fewer.',
        'At most 20 choices allowed.',
      ]);
    });

    it('accepts exactly 20 choices', () => {
      const text = Array.from({ length: 20 }, (_, i) => `c${i}`).join('\n');
      const errors = validate('Size', 'enum', text);
      expect(errors.choices).toBeUndefined();
    });

    it('accepts a 60-char choice', () => {
      const errors = validate('Size', 'enum', 'a'.repeat(60));
      expect(errors.choices).toBeUndefined();
    });
  });

  describe('combined', () => {
    it('returns both name and choices errors at once', () => {
      const errors = validate('', 'enum', '');
      expect(errors.name).toBe('Name is required.');
      expect(errors.choices).toEqual(['Add at least one choice.']);
    });

    it('returns no errors for a valid form', () => {
      const errors = validate('Size', 'enum', 'Small\nMedium\nLarge');
      expect(errors).toEqual({});
    });
  });
});
