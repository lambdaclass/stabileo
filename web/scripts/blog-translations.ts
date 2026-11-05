import { readdirSync } from 'node:fs';
import { join } from 'node:path';

/** `<locale>/<id>` for every file in src/lib/blog/translations, the value of `__BLOG_TRANSLATIONS__`. */
export function blogTranslations(webRoot: string): string[] {
  const dir = join(webRoot, 'src/lib/blog/translations');
  return readdirSync(dir).flatMap((locale) => readdirSync(join(dir, locale)).filter((f) => f.endsWith('.ts')).map((f) => `${locale}/${f.slice(0, -3)}`)).sort();
}
