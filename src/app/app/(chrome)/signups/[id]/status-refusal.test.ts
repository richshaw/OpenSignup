import { describe, expect, it } from 'vitest';
import { serviceError } from '@/lib/errors';
import { statusRefusal } from './status-refusal';

describe('statusRefusal', () => {
  it('tells a viewer they cannot edit, not the guard’s text', () => {
    const e = serviceError('forbidden', 'your role cannot modify this workspace');
    expect(statusRefusal(e, 'publish')).toBe('You don’t have edit access.');
    expect(statusRefusal(e, 'close')).toBe('You don’t have edit access.');
  });

  it('says a deleted signup is no longer available', () => {
    expect(statusRefusal(serviceError('not_found', 'signup not found'), 'close')).toBe(
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

  it('asks for a slot when publishing an empty signup', () => {
    const e = serviceError('conflict', 'publish requires at least one slot');
    expect(statusRefusal(e, 'publish')).toBe('Add a slot before publishing.');
  });

  it('falls back to a plain retry message', () => {
    const e = serviceError('internal', 'boom');
    expect(statusRefusal(e, 'publish')).toBe('Couldn’t publish. Try again.');
    expect(statusRefusal(e, 'close')).toBe('Couldn’t close the signup. Try again.');
  });
});
