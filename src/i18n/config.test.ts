import { describe, expect, it } from 'vitest';
import { CATALOG_LOCALES, SHIPPED } from './config';

describe('SHIPPED', () => {
  it('ships English to every audience, since English fills every gap', () => {
    for (const locales of Object.values(SHIPPED)) {
      expect(locales).toContain('en');
    }
  });

  it('ships only languages that have a catalog', () => {
    for (const locales of Object.values(SHIPPED)) {
      for (const locale of locales) expect(CATALOG_LOCALES).toContain(locale);
    }
  });
});
