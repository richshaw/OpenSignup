import { DrizzleQueryError } from 'drizzle-orm';
import pino from 'pino';

const isDev = process.env.NODE_ENV !== 'production';

// How far down an error's `cause` chain to look for a query error.
const MAX_CAUSE_DEPTH = 8;

/**
 * A `DrizzleQueryError` puts every bind value of the failed query in its
 * `message`, its `stack` and an enumerable `params`. Those values are refresh
 * tokens (oidc-provider looks records up by their own value), participant
 * emails and names, and more, so this stands in an error that keeps the query
 * text and the driver's own message and `code`, and nothing else. The
 * driver's `detail` is left out too: for a unique violation it reads
 * `Key (...)=(...) already exists`, with the row's values in it.
 */
function withoutParams(err: DrizzleQueryError): Error {
  const safe = new Error(`Failed query: ${err.query}`);
  safe.name = 'DrizzleQueryError';
  // Keep the frames, never the header: the header is the message, params
  // included. A stack that doesn't start with it keeps no frames at all.
  const header = `${err.name}: ${err.message}`;
  const frames = err.stack?.startsWith(header) ? err.stack.slice(header.length) : '';
  safe.stack = `${safe.name}: ${safe.message}${frames}`;
  if (err.cause instanceof Error) {
    const driver = new Error(err.cause.message);
    driver.name = err.cause.name;
    driver.stack = `${driver.name}: ${driver.message}`;
    safe.cause = driver;
    // The serializer flattens a cause into the message and stack, so the
    // driver's code goes on the error itself to reach the log line.
    const code = (err.cause as { code?: unknown }).code;
    if (typeof code === 'string') Object.assign(safe, { code });
  }
  return safe;
}

/** The error with any query error in its `cause` chain swapped for its safe stand-in. */
function scrubQueryErrors(err: unknown, depth = 0): unknown {
  if (err instanceof DrizzleQueryError) return withoutParams(err);
  if (!(err instanceof Error) || depth >= MAX_CAUSE_DEPTH) return err;
  const cause = scrubQueryErrors(err.cause, depth + 1);
  if (cause === err.cause) return err;
  // A copy with the same prototype and own properties, so the standard
  // serializer reads it exactly as it would have read the original.
  const copy = Object.create(
    Object.getPrototypeOf(err) as object,
    Object.getOwnPropertyDescriptors(err),
  ) as Error;
  Object.defineProperty(copy, 'cause', {
    value: cause,
    enumerable: Object.prototype.propertyIsEnumerable.call(err, 'cause'),
    writable: true,
    configurable: true,
  });
  return copy;
}

// Everything but where the lines go, so a test can send them to its own stream.
export const logOptions = {
  level: process.env.LOG_LEVEL ?? (isDev ? 'debug' : 'info'),
  base: { service: 'signup' },
  // pino copies an error's message into `msg` before any serializer runs
  // (`log.error(err)`, or `{ err }` with no message), so the hook scrubs the
  // error on the way in. The serializer catches `err` bound on a child logger.
  hooks: {
    logMethod(args, method) {
      const [first] = args;
      if (first instanceof Error) {
        args[0] = scrubQueryErrors(first);
      } else if (first && typeof first === 'object' && 'err' in first) {
        args[0] = { ...first, err: scrubQueryErrors(first.err) };
      }
      method.apply(this, args);
    },
  },
  serializers: {
    err: (err: unknown) => pino.stdSerializers.err(scrubQueryErrors(err) as Error),
  },
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      '*.password',
      '*.token',
      '*.editToken',
      // A sign-up's idempotency key brings back its edit link.
      '*.idempotencyKey',
      '*.apiKey',
      '*.RESEND_API_KEY',
      '*.SMTP_PASSWORD',
      '*.LLM_API_KEY',
      '*.headers.authorization',
    ],
    remove: true,
  },
} satisfies pino.LoggerOptions;

export const log = pino({
  ...logOptions,
  ...(isDev && {
    transport: {
      target: 'pino-pretty',
      options: { colorize: true, translateTime: 'HH:MM:ss.l' },
    },
  }),
});
