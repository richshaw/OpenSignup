import { describe, expect, it } from 'vitest';
import { FIELD_TYPES } from '@/schemas/slot-fields';
import {
  FIELD_TYPE_GUIDE,
  NEVER_INVENT_HEAD,
  NEVER_INVENT_TAIL,
  RULES_IN_BOTH,
  neverInventRule,
} from './signup-rules';

describe('shared signup rules', () => {
  it('has no empty rule', () => {
    expect(RULES_IN_BOTH.length).toBeGreaterThan(0);
    for (const rule of [FIELD_TYPE_GUIDE, ...RULES_IN_BOTH]) {
      expect(rule.trim()).not.toBe('');
    }
  });

  // A bullet per type, not just the word: "enum" and "time" also turn up in other bullets.
  it.each(FIELD_TYPES)('has a field type guide bullet for %s', (fieldType) => {
    expect(FIELD_TYPE_GUIDE).toMatch(new RegExp(`^- ${fieldType}\\s+→`, 'm'));
  });
});

describe('neverInventRule', () => {
  it.each(['drafter', 'assistant'] as const)('opens and closes the same way for the %s', (who) => {
    const rule = neverInventRule(who);
    expect(rule.startsWith(NEVER_INVENT_HEAD)).toBe(true);
    expect(rule.endsWith(NEVER_INVENT_TAIL)).toBe(true);
  });

  it.each(['drafter', 'assistant'] as const)('joins the %s parts with one space each', (who) => {
    const rule = neverInventRule(who);
    expect(rule.startsWith(`${NEVER_INVENT_HEAD} `)).toBe(true);
    expect(rule.endsWith(`. ${NEVER_INVENT_TAIL}`)).toBe(true);
    expect(rule).not.toContain('  ');
  });

  it('tells the drafter to fall back to placeholder slots', () => {
    expect(neverInventRule('drafter')).toContain('produce 1-3 placeholder slots');
  });

  it('tells the assistant to ask for what the slots need, since it can', () => {
    const rule = neverInventRule('assistant');
    expect(rule).toContain('If something the slots need is missing, ask for it.');
    expect(rule).not.toContain('placeholder');
  });
});
