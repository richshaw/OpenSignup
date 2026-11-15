/**
 * The translator for server code: server components, route handlers, emails
 * and the reminder worker. It logs what goes wrong instead of throwing, so a
 * missing message costs a log line, not a page or an email.
 *
 * The worker imports this under tsx, outside Next, so nothing from `next/*`
 * may come in here. Code that needs the request (headers, cookies) belongs in
 * a module of its own.
 */
import type { IntlError } from 'use-intl/core';
import { log } from '@/lib/log';
import type { CatalogLocale } from './config';
import { getTranslator, type Namespace } from './translator';

function logTranslationError(error: IntlError): void {
  // One line per message: the text names the key and the locale.
  log.error({ code: error.code }, error.message);
}

export function getServerTranslator<N extends Namespace>(locale: CatalogLocale, namespace: N) {
  return getTranslator(locale, namespace, { onError: logTranslationError });
}
