import { describe, expect, it } from 'vitest';
import { CATALOG_LOCALES } from '@/i18n/config';
import { getStandInTranslator, getTestTranslator } from '@/i18n/testing/translator';
import { serviceError } from '@/lib/errors';
import { statusRefusal } from './status-refusal';

const en = getTestTranslator('organizer.signup.refusal');

describe('statusRefusal', () => {
  it('tells a viewer they cannot edit, not the guard’s text', () => {
    const e = serviceError('forbidden', 'your role cannot modify this workspace');
    expect(statusRefusal(e, 'publish', en)).toBe('You don’t have edit access.');
    expect(statusRefusal(e, 'close', en)).toBe('You don’t have edit access.');
    expect(statusRefusal(e, 'reopen', en)).toBe('You don’t have edit access.');
  });

  it('says a deleted signup is no longer available', () => {
    expect(statusRefusal(serviceError('not_found', 'signup not found'), 'close', en)).toBe(
      'This signup is no longer available.',
    );
    expect(statusRefusal(serviceError('not_found', 'signup not found'), 'reopen', en)).toBe(
      'This signup is no longer available.',
    );
  });

  it('asks for a reload when the status changed under the page', () => {
    const e = serviceError('conflict', 'cannot closed a signup that is draft', {
      field: 'status',
    });
    expect(statusRefusal(e, 'close', en)).toBe(
      'This signup changed since the page loaded. Reload to see the latest.',
    );
  });

  it('asks for a reload when a reopen finds the signup no longer closed', () => {
    const e = serviceError('conflict', 'cannot open a signup that is open', {
      field: 'status',
    });
    expect(statusRefusal(e, 'reopen', en)).toBe(
      'This signup changed since the page loaded. Reload to see the latest.',
    );
  });

  it('asks for a slot when publishing an empty signup', () => {
    const e = serviceError('conflict', 'publish requires at least one slot');
    expect(statusRefusal(e, 'publish', en)).toBe('Add a slot before publishing.');
  });

  it('asks for a slot when reopening a signup with none left', () => {
    const e = serviceError('conflict', 'reopen requires at least one slot', { field: 'slots' });
    expect(statusRefusal(e, 'reopen', en)).toBe('Add a slot before reopening.');
    // Publish's line stays its own.
    expect(statusRefusal(e, 'publish', en)).toBe('Add a slot before publishing.');
  });

  it('falls back to a plain retry message', () => {
    const e = serviceError('internal', 'boom');
    expect(statusRefusal(e, 'publish', en)).toBe('Couldn’t publish. Try again.');
    expect(statusRefusal(e, 'close', en)).toBe('Couldn’t close the signup. Try again.');
    expect(statusRefusal(e, 'reopen', en)).toBe('Couldn’t reopen the signup. Try again.');
  });

  it('falls back to the retry line for a reopen conflict on anything but the status or slots', () => {
    const e = serviceError('conflict', 'something else', { field: 'title' });
    expect(statusRefusal(e, 'reopen', en)).toBe('Couldn’t reopen the signup. Try again.');
  });

  it.each(CATALOG_LOCALES.filter((locale) => locale !== 'en'))(
    'words each refusal from the catalog in %s, but a viewer’s, which #939 moves',
    (locale) => {
      const t = getStandInTranslator(locale, 'organizer.signup.refusal');
      const words = (key: string) => `organizer.signup.refusal.${key} in ${locale}`;
      expect(statusRefusal(serviceError('not_found', 'gone'), 'close', t)).toBe(words('gone'));
      expect(statusRefusal(serviceError('conflict', 'x', { field: 'status' }), 'reopen', t)).toBe(
        words('changed'),
      );
      expect(statusRefusal(serviceError('conflict', 'x'), 'publish', t)).toBe(
        words('addSlotToPublish'),
      );
      expect(statusRefusal(serviceError('conflict', 'x', { field: 'slots' }), 'reopen', t)).toBe(
        words('addSlotToReopen'),
      );
      expect(statusRefusal(serviceError('internal', 'x'), 'publish', t)).toBe(
        words('publishFailed'),
      );
      expect(statusRefusal(serviceError('internal', 'x'), 'close', t)).toBe(words('closeFailed'));
      expect(statusRefusal(serviceError('internal', 'x'), 'reopen', t)).toBe(words('reopenFailed'));
      expect(statusRefusal(serviceError('forbidden', 'x'), 'publish', t)).toBe(
        'You don’t have edit access.',
      );
    },
  );
});
