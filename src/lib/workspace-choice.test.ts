import { describe, expect, it } from 'vitest';
import { chooseWorkspaceId } from './workspace-choice';

const hints = { invalid: 'pass a workspace id', noDefault: 'pick a workspace' };

describe('chooseWorkspaceId', () => {
  it('uses the workspace it was given', () => {
    expect(chooseWorkspaceId('ws_2', 'ws_default', hints)).toEqual({ ok: true, value: 'ws_2' });
  });

  it('falls back to the default workspace when none is given', () => {
    for (const missing of [undefined, null]) {
      expect(chooseWorkspaceId(missing, 'ws_default', hints)).toEqual({
        ok: true,
        value: 'ws_default',
      });
    }
  });

  it('refuses a blank workspaceId instead of quietly using the default', () => {
    for (const blank of ['', '   ']) {
      const r = chooseWorkspaceId(blank, 'ws_default', hints);
      expect(r.ok).toBe(false);
      if (r.ok) continue;
      expect(r.error).toMatchObject({
        code: 'invalid_input',
        message: 'workspaceId must not be empty',
        field: 'workspaceId',
        suggestion: 'pass a workspace id',
      });
    }
  });

  it('refuses a workspaceId that is not a string', () => {
    for (const wrong of [123, ['ws_2'], { id: 'ws_2' }, true]) {
      const r = chooseWorkspaceId(wrong, 'ws_default', hints);
      expect(r.ok).toBe(false);
      if (r.ok) continue;
      expect(r.error).toMatchObject({
        code: 'invalid_input',
        message: 'workspaceId must be a string',
        field: 'workspaceId',
        suggestion: 'pass a workspace id',
      });
    }
  });

  it('explains itself when there is no default workspace either', () => {
    const r = chooseWorkspaceId(undefined, null, hints);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toMatchObject({
      code: 'invalid_input',
      message: 'no workspace given and the account has no default workspace',
      field: 'workspaceId',
      suggestion: 'pick a workspace',
    });
  });
});
