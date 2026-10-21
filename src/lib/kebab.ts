/**
 * Lowercase kebab-case with accents stripped: the text rule behind signup
 * slugs and field refs. No Node imports, so the builder can use it too.
 */
export function toKebab(input: string): string {
  return input
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
