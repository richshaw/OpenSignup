import { describe, expect, it } from 'vitest';
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

  it('keeps the date placeholder out of shared text', () => {
    // The prompt renderer replaces only the first {{TODAY}} it finds.
    for (const rule of [FIELD_TYPE_GUIDE, ...RULES_IN_BOTH]) {
      expect(rule).not.toContain('{{TODAY}}');
    }
  });
});

describe('neverInventRule', () => {
  it.each(['drafter', 'assistant'] as const)('opens and closes the same way for the %s', (who) => {
    const rule = neverInventRule(who);
    expect(rule.startsWith(NEVER_INVENT_HEAD)).toBe(true);
    expect(rule.endsWith(NEVER_INVENT_TAIL)).toBe(true);
  });

  it('tells the drafter to fall back to placeholder slots', () => {
    expect(neverInventRule('drafter')).toContain('placeholder');
  });

  it('tells the assistant to ask instead, since it can', () => {
    const rule = neverInventRule('assistant');
    expect(rule).toContain('ask');
    expect(rule).not.toContain('placeholder');
  });
});
