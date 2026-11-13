import type { CatalogLocale } from '@/i18n/config';
import type en from '@/messages/en.json';

// Types every translator from the English catalog, so a missing key or a
// wrong argument fails typecheck. `en.d.json.ts`, written by next-intl's plugin
// (`createMessagesDeclaration` in next.config.mjs), gives the messages their
// literal text, which is what lets TypeScript read their arguments.
declare module 'next-intl' {
  interface AppConfig {
    Locale: CatalogLocale;
    Messages: typeof en;
  }
}
