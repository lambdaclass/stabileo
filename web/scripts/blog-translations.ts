import { readdirSync } from 'node:fs';
import { join } from 'node:path';

export type PublicationGroup = { locales: string[]; pages: string[] };

export function blogTranslations(webRoot: string): PublicationGroup[] {
  const dir = join(webRoot, 'src/lib/blog/translations');
  const byPage = new Map<string, string[]>();
  for (const locale of readdirSync(dir).sort()) {
    for (const file of readdirSync(join(dir, locale))) {
      if (!file.endsWith('.ts')) continue;
      const page = file.slice(0, -3);
      const locales = byPage.get(page) ?? [];
      locales.push(locale);
      byPage.set(page, locales);
    }
  }
  const groups = new Map<string, PublicationGroup>();
  for (const page of [...byPage.keys()].sort()) {
    const locales = byPage.get(page)!;
    const key = JSON.stringify(locales);
    const group = groups.get(key) ?? { locales, pages: [] };
    group.pages.push(page);
    groups.set(key, group);
  }
  return [...groups.values()];
}
