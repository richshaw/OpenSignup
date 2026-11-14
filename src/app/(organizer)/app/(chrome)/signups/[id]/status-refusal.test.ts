import { describe, expect, it } from 'vitest';
import { serviceError } from '@/lib/errors';
import { statusRefusal } from './status-refusal';

describe('statusRefusal', () => {
  it('tells a viewer they cannot edit, not the guard’s text', () => {
    const e = serviceError('forbidden', 'your role cannot modify this workspace');
    expect(statusRefusal(e, 'publish')).toBe('You don’t have edit access.');
    expect(statusRefusal(e, 'close')).toBe('You don’t have edit access.');
    expect(statusRefusal(e, 'reopen')).toBe('You don’t have edit access.');
  });

  it('says a deleted signup is no longer available', () => {
    expect(statusRefusal(serviceError('not_found', 'signup not found'), 'close')).toBe(
      'This signup is no longer available.',
    );
    expect(statusRefusal(serviceError('not_found', 'signup not found'), 'reopen')).toBe(
      'This signup is no longer available.',
    );
  });

  it('asks for a reload when the status changed under the page', () => {
    const e = serviceError('conflict', 'cannot closed a signup that is draft', {
      field: 'status',
    });
    expect(statusRefusal(e, 'close')).toBe(
      'This signup changed since the page loaded. Reload to see the latest.',
    );
  });

  it('asks for a reload when a reopen finds the signup no longer closed', () => {
    const e = serviceError('conflict', 'cannot open a signup that is open', {
      field: 'status',
    });
    expect(statusRefusal(e, 'reopen')).toBe(
      'This signup changed since the page loaded. Reload to see the latest.',
    );
  });

  it('asks for a slot when publishing an empty signup', () => {
    const e = serviceError('conflict', 'publish requires at least one slot');
    expect(statusRefusal(e, 'publish')).toBe('Add a slot before publishing.');
  });

  it('asks for a slot when reopening a signup with none left', () => {
    const e = serviceError('conflict', 'reopen requires at least one slot', { field: 'slots' });
    expect(statusRefusal(e, 'reopen')).toBe('Add a slot before reopening.');
    // Publish's line stays its own.
    expect(statusRefusal(e, 'publish')).toBe('Add a slot before publishing.');
  });

  it('falls back to a plain retry message', () => {
    const e = serviceError('internal', 'boom');
    expect(statusRefusal(e, 'publish')).toBe('Couldn’t publish. Try again.');
    expect(statusRefusal(e, 'close')).toBe('Couldn’t close the signup. Try again.');
    expect(statusRefusal(e, 'reopen')).toBe('Couldn’t reopen the signup. Try again.');
  });

  it('falls back to the retry line for a reopen conflict on anything but the status or slots', () => {
    const e = serviceError('conflict', 'something else', { field: 'title' });
    expect(statusRefusal(e, 'reopen')).toBe('Couldn’t reopen the signup. Try again.');
  });
});
