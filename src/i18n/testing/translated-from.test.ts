import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { loadTranslatedFrom, markTranslated } from './translated-from';

const EN = {
  participant: {
    dialog: { done: 'Done', cancel: 'Cancel' },
    title: 'Sign up',
  },
  email: { subject: 'You signed up' },
};

/** Translates everything but `participant.title`. */
const SV = {
  participant: { dialog: { done: 'Klar', cancel: 'Avbryt' } },
  email: { subject: 'Du är anmäld' },
};

describe('markTranslated', () => {
  it("records a named message, and every one under a named section, from today's English", () => {
    const { record, marked } = markTranslated(EN, SV, {}, ['participant.dialog', 'email.subject']);
    expect(record).toEqual({
      'participant.dialog.done': 'Done',
      'participant.dialog.cancel': 'Cancel',
      'email.subject': 'You signed up',
    });
    expect(marked.map(({ key }) => key)).toEqual([
      'participant.dialog.done',
      'participant.dialog.cancel',
      'email.subject',
    ]);
  });

  it('leaves the entries it is not told about as they were, stale ones included', () => {
    const before = { 'participant.dialog.done': 'Finished', 'email.subject': 'Signed up' };
    const { record, marked } = markTranslated(EN, SV, before, ['participant.dialog.done']);
    expect(record).toEqual({ 'participant.dialog.done': 'Done', 'email.subject': 'Signed up' });
    expect(marked).toEqual([{ key: 'participant.dialog.done', was: 'Finished' }]);
  });

  it("says nothing changed for a message already recorded from today's English", () => {
    const before = { 'email.subject': 'You signed up' };
    expect(markTranslated(EN, SV, before, ['email']).marked).toEqual([]);
  });

  it('skips a named message with no translation yet', () => {
    const { record, untranslated } = markTranslated(EN, SV, {}, ['participant']);
    expect(untranslated).toEqual(['participant.title']);
    expect(Object.keys(record)).not.toContain('participant.title');
  });

  it('drops an entry for a message English or the translation no longer has, named or not', () => {
    const before = {
      'participant.dialog.done': 'Done',
      'participant.gone': 'Deleted from English',
      'participant.title': 'Sign up',
    };
    const { record, dropped } = markTranslated(EN, SV, before, []);
    expect(record).toEqual({ 'participant.dialog.done': 'Done' });
    expect(dropped).toEqual(['participant.gone', 'participant.title']);
  });

  it("keeps en.json's order", () => {
    const before = { 'email.subject': 'You signed up', 'participant.dialog.done': 'Done' };
    const { record } = markTranslated(EN, SV, before, ['participant.dialog.cancel']);
    expect(Object.keys(record)).toEqual([
      'participant.dialog.done',
      'participant.dialog.cancel',
      'email.subject',
    ]);
  });

  it('says which names match no English message, rather than taking a prefix of a word', () => {
    expect(markTranslated(EN, SV, {}, ['participant.dia', 'emails', 'email']).unknown).toEqual([
      'participant.dia',
      'emails',
    ]);
  });
});

describe('loadTranslatedFrom', () => {
  let dir: string;
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("reads each language's record, and none from a folder that isn't there", () => {
    dir = mkdtempSync(path.join(tmpdir(), 'translated-from-'));
    writeFileSync(path.join(dir, 'sv.json'), '{ "email.subject": "You signed up" }');
    mkdirSync(path.join(dir, 'notes'));
    expect(loadTranslatedFrom(dir)).toEqual({ sv: { 'email.subject': 'You signed up' } });
    expect(loadTranslatedFrom(path.join(dir, 'missing'))).toEqual({});
  });

  it('refuses a record that is not a flat map of keys to text', () => {
    dir = mkdtempSync(path.join(tmpdir(), 'translated-from-'));
    writeFileSync(path.join(dir, 'sv.json'), '{ "email": { "subject": "You signed up" } }');
    expect(() => loadTranslatedFrom(dir)).toThrow(/sv\.json should map each key/);
  });
});
