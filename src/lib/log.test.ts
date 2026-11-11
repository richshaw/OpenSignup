import { Writable } from 'node:stream';
import { DrizzleQueryError } from 'drizzle-orm';
import pino from 'pino';
import { describe, expect, it } from 'vitest';
import { logOptions } from './log';

const QUERY = 'select "id", "payload" from "oauth_records" where "oauth_records"."id" = $1';

function capture() {
  const lines: string[] = [];
  const stream = new Writable({
    write(chunk: Buffer, _enc, done) {
      lines.push(chunk.toString());
      done();
    },
  });
  return { logger: pino(logOptions, stream), output: () => lines.join('') };
}

function driverError(): Error {
  // The shape postgres.js gives a unique violation, `detail` included.
  return Object.assign(new Error('duplicate key value violates unique constraint "x_pkey"'), {
    name: 'PostgresError',
    code: '23505',
    detail: 'Key (email)=(pat@example.com) already exists.',
  });
}

function queryError() {
  return new DrizzleQueryError(
    QUERY,
    ['FAKE_TOKEN', 'pat@example.com', 'Pat Example'],
    driverError(),
  );
}

describe('log: query errors', () => {
  it('logs the query and the driver error, never the params or the detail', () => {
    const { logger, output } = capture();
    logger.error({ err: queryError() }, 'oauth: server error');
    const out = output();

    expect(out).not.toContain('FAKE_TOKEN');
    expect(out).not.toContain('pat@example.com');
    expect(out).not.toContain('Pat Example');
    const line = JSON.parse(out) as { err: { message: string; stack: string; code: string } };
    expect(line.err.code).toBe('23505');
    expect(line.err.stack).toMatch(/^DrizzleQueryError: Failed query: /);
    expect(line.err.message).toContain(QUERY);
    expect(line.err.message).toContain('duplicate key value violates unique constraint "x_pkey"');
    expect(line.err.stack).toContain('log.test.ts');
  });

  it('scrubs a query error that is the cause of another error', () => {
    const { logger, output } = capture();
    const wrapped = new Error('unhandled', { cause: queryError() });
    logger.error({ err: wrapped }, 'unhandled route error');
    const out = output();

    expect(out).not.toContain('FAKE_TOKEN');
    expect(out).not.toContain('pat@example.com');
    const line = JSON.parse(out) as { err: { message: string } };
    expect(line.err.message).toContain('unhandled');
    expect(line.err.message).toContain(QUERY);
    // The original is left as it was.
    expect((wrapped.cause as DrizzleQueryError).params).toContain('FAKE_TOKEN');
  });

  // With no message of its own, pino logs the error's message as `msg`.
  it('scrubs a query error passed as the only argument', () => {
    const { logger, output } = capture();
    logger.error(queryError());
    expect(output()).not.toContain('FAKE_TOKEN');
    expect((JSON.parse(output()) as { msg: string }).msg).toContain(QUERY);
  });

  it('scrubs a query error logged under err with no message', () => {
    const { logger, output } = capture();
    logger.warn({ err: queryError() });
    expect(output()).not.toContain('FAKE_TOKEN');
    expect((JSON.parse(output()) as { msg: string }).msg).toContain(QUERY);
  });

  it('scrubs a query error bound to a child logger', () => {
    const { logger, output } = capture();
    logger.child({ err: queryError() }).info('later');
    expect(output()).not.toContain('FAKE_TOKEN');
    expect(output()).not.toContain('pat@example.com');
  });

  it('logs other errors as before', () => {
    const { logger, output } = capture();
    logger.error({ err: Object.assign(new Error('boom'), { code: 'E_X' }) }, 'failed');
    const line = JSON.parse(output()) as { err: { message: string; code: string; type: string } };
    expect(line.err).toMatchObject({ message: 'boom', code: 'E_X', type: 'Error' });
  });
});
