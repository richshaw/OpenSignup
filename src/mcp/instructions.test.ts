import { describe, expect, it } from 'vitest';
import {
  RULES_IN_BOTH,
  USE_CAPACITY_NOT_DUPLICATE_ROWS,
  USE_DATE_AND_TIME_FIELDS,
  neverInventRule,
} from '@/lib/signup-rules';
import { buildInstructions } from './instructions';

// A stand-in list: the builder takes its tools as an argument, so this file
// loads no tool module and needs no service mocks.
const tools = [
  { name: 'list_things', annotations: { readOnlyHint: true } },
  { name: 'make_thing', annotations: {} },
  { name: 'drop_thing', annotations: { destructiveHint: true } },
  { name: 'wipe_things', annotations: { destructiveHint: true } },
];
const text = buildInstructions(tools);
const lines = text.split('\n');

describe('buildInstructions', () => {
  it('carries every rule it shares with the Magic Compose prompt, word for word', () => {
    for (const rule of RULES_IN_BOTH) expect(text).toContain(rule);
  });

  it('tells the assistant to ask rather than fill gaps with placeholders', () => {
    expect(text).toContain(neverInventRule('assistant'));
    expect(text).not.toContain('placeholder');
  });

  it('carries the two rules written for assistants', () => {
    expect(text).toContain(USE_DATE_AND_TIME_FIELDS);
    expect(text).toContain(USE_CAPACITY_NOT_DUPLICATE_ROWS);
  });

  it('ends with the tools it was given, in order', () => {
    // Last, so a client that cuts the text short loses the list that
    // tools/list repeats anyway, not a rule.
    expect(lines.at(-1)).toBe('Tools: list_things, make_thing, drop_thing, wipe_things.');
  });

  it('lists exactly the destructive tools as ones to ask about first', () => {
    const ask = lines.filter((l) => l.startsWith('- Ask the organizer before'));
    expect(ask).toEqual(['- Ask the organizer before you call: drop_thing, wipe_things.']);
  });

  it('drops that line when no tool is destructive', () => {
    const safe = buildInstructions(tools.filter((t) => !t.annotations.destructiveHint));
    expect(safe).not.toContain('Ask the organizer before you call:');
  });

  it('says which link to give when, and to show slots as a table', () => {
    for (const word of ['links.preview', 'links.edit', 'links.public', 'publish_signup', 'table']) {
      expect(text).toContain(word);
    }
  });

  it('has no line left blank by a missing rule', () => {
    expect(text).not.toMatch(/undefined|\n\n\n|^- *$/m);
  });
});
