import pino from 'pino';

const isDev = process.env.NODE_ENV !== 'production';

export const log = pino({
  level: process.env.LOG_LEVEL ?? (isDev ? 'debug' : 'info'),
  base: { service: 'signup' },
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      '*.password',
      '*.token',
      '*.editToken',
      '*.apiKey',
      '*.RESEND_API_KEY',
      '*.SMTP_PASSWORD',
      '*.LLM_API_KEY',
      '*.GOOGLE_CLIENT_SECRET',
      '*.AUTH_SECRET',
      '*.headers.authorization',
    ],
    remove: true,
  },
  ...(isDev && {
    transport: {
      target: 'pino-pretty',
      options: { colorize: true, translateTime: 'HH:MM:ss.l' },
    },
  }),
});

