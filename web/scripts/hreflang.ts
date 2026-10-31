import type { Locale } from '../src/lib/i18n/offered';

/** The languages a captured page declares in its own hreflang set (x-default excluded), in `order`. */
export function declaredLocales(head: string, order: readonly Locale[]): Locale[] {
  const declared = new Set<string>();
  for (const tag of head.match(/<link\b[^>]*>/g) ?? []) {
    if (!/\brel="alternate"/.test(tag)) continue;
    const lang = tag.match(/\bhreflang="([^"]+)"/)?.[1];
    if (lang && lang !== 'x-default') declared.add(lang);
  }
  return order.filter((l) => declared.has(l));
}
