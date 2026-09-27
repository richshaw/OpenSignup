import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { serviceError, ServiceException } from '@/lib/errors';
import { err, ok } from '@/lib/result';
import type { ToolContext } from './context';
import { defineTool } from './registry';
import { runTool, toolFailure, toolSuccess } from './results';

const ctx = { actor: { id: 'org_1' }, clientId: 'c', scopes: ['signups:read', 'signups:write'] } as ToolContext;

describe('tool results', () => {
  it('success carries the value as structuredContent and as JSON text', () => {
    const r = toolSuccess({ a: 1 });
    expect(r.isError).toBeUndefined();
    expect(r.structuredContent).toEqual({ a: 1 });
    expect(r.content).toEqual([{ type: 'text', text: '{"a":1}' }]);
  });

  it('failure keeps code, message, field, suggestion and details', () => {
    const r = toolFailure(
      serviceError('invalid_input', 'bad', { field: 'title', suggestion: 'shorten it', details: { max: 120 } }),
    );
    expect(r.isError).toBe(true);
    expect(r.structuredContent).toEqual({
      error: { code: 'invalid_input', message: 'bad', field: 'title', suggestion: 'shorten it', details: { max: 120 } },
    });
  });

  it('runTool parses arguments with the zod schema before calling the handler', async () => {
    const handler = vi.fn(async (_c: ToolContext, input: { n: number }) => ok({ doubled: input.n * 2 }));
    const def = defineTool({
      name: 'double',
      scope: 'signups:read',
      title: 'Double',
      description: 'x',
      annotations: { readOnlyHint: true },
      inputSchema: z.object({ n: z.number().int() }),
      handler,
    });
    expect((await runTool(def, ctx, { n: 2 })).structuredContent).toEqual({ doubled: 4 });
    const bad = await runTool(def, ctx, { n: 'two' });
    expect(bad.isError).toBe(true);
    expect((bad.structuredContent as { error: { code: string; field?: string } }).error).toMatchObject({
      code: 'invalid_input',
      field: 'n',
    });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('runTool refuses a tool the token has no scope for, before parsing', async () => {
    const handler = vi.fn(async () => ok({}));
    const def = defineTool({
      name: 'w',
      scope: 'signups:write',
      title: 'w',
      description: 'w',
      annotations: { readOnlyHint: false, destructiveHint: false },
      inputSchema: z.object({}),
      handler,
    });
    const r = await runTool(def, { ...ctx, scopes: ['signups:read'] }, {});
    expect(r.isError).toBe(true);
    expect((r.structuredContent as { error: { code: string; details: unknown } }).error).toMatchObject({
      code: 'forbidden',
      details: { requiredScope: 'signups:write' },
    });
    expect(handler).not.toHaveBeenCalled();
  });

  it('runTool maps err results, thrown ServiceException, and unknown errors', async () => {
    const mk = (h: () => Promise<unknown>) =>
      defineTool({
        name: 't',
        scope: 'signups:read',
        title: 't',
        description: 't',
        annotations: { readOnlyHint: true },
        inputSchema: z.object({}),
        handler: h as never,
      });
    const a = await runTool(mk(async () => err(serviceError('not_found', 'gone'))), ctx, {});
    expect((a.structuredContent as { error: { code: string } }).error.code).toBe('not_found');
    const b = await runTool(
      mk(async () => {
        throw new ServiceException(serviceError('forbidden', 'no'));
      }),
      ctx,
      {},
    );
    expect((b.structuredContent as { error: { code: string } }).error.code).toBe('forbidden');
    const c = await runTool(
      mk(async () => {
        throw new Error('db exploded');
      }),
      ctx,
      {},
    );
    expect(c.structuredContent).toEqual({ error: { code: 'internal', message: 'something went wrong' } });
    expect(JSON.stringify(c)).not.toContain('exploded');
  });
});
