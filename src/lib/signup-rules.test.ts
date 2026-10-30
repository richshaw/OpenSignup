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

  it('tells the drafter to ask when the prompt does not say what people sign up for', () => {
    // The vague soccer prompt used to get placeholder slots; it gets questions now.
    expect(neverInventRule('drafter')).toContain(
      `If the prompt doesn't say what people sign up for (e.g. "make a signup for my kid's soccer team") and carries no answers to your questions, don't draft: ask, with the QUESTIONS reply.`,
    );
  });

  it('tells the drafter that a list or a schedule already says what, so it drafts', () => {
    // Without this, models asked about item lists and handed the items back as options.
    const rule = neverInventRule('drafter');
    expect(rule).toContain(
      `Named items, roles or tasks, or dated practices, sessions or shifts, already say what: don't ask about it. An event with no item or role ("family movie night on March 3") doesn't: ask.`,
    );
    expect(rule).toContain('A prompt that lists items or roles drafts, with or without dates.');
  });

  it('asks when, not what, for a prompt whose every slot would be a placeholder', () => {
    // "Snack sign up" got three "TBD: Event" rows and nothing usable (#687).
    const rule = neverInventRule('drafter');
    expect(rule).toContain(
      'so every slot would be a "TBD:" placeholder (e.g. "snack duty for the soccer team"), ask about "when", not "what".',
    );
  });

  it('keeps placeholder slots for answers that leave the dates out', () => {
    const rule = neverInventRule('drafter');
    expect(rule).toContain(
      'Where the answers leave the dates or times out, produce 1-3 placeholder slots',
    );
  });

  it('tells the assistant to ask for what the slots need, since it can', () => {
    const rule = neverInventRule('assistant');
    expect(rule).toContain('If something the slots need is missing, ask for it.');
    expect(rule).not.toContain('placeholder');
  });
});
