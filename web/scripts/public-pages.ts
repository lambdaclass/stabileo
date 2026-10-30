import { RESEARCH_META } from '../src/lib/research-meta';
import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const LAST_MODIFIED = new Map<string, string>();
export const POST_DATE = new Map<string, string>();

export async function publicPaths(): Promise<string[]> {
  POST_DATE.clear();
  LAST_MODIFIED.clear();
  const source = await readFile(join(ROOT, 'src/lib/blog/index.ts'), 'utf8');
  const imports = [...source.matchAll(/from '\.\/posts\/([\w-]+)'/g)].map((m) => m[1]);
  const slugs: string[] = [];
  for (const file of imports) {
    const post = await readFile(join(ROOT, `src/lib/blog/posts/${file}.ts`), 'utf8');
    const slug = post.match(/slug:\s*'([^']+)'/)?.[1];
    if (slug) {
      slugs.push(slug);
      const published = post.match(/\bdate:\s*'(\d{4}-\d{2}-\d{2})'/)?.[1];
      const updated = post.match(/\bupdated:\s*'(\d{4}-\d{2}-\d{2})'/)?.[1];
      const modified = updated ?? published;
      if (modified) LAST_MODIFIED.set(`/blog/${slug}`, modified);
      if (published) POST_DATE.set(`/blog/${slug}`, published);
    }
  }
  if (slugs.length === 0) throw new Error('prerender: found no blog posts — the scan is broken');
  const pageIndex = await readFile(join(ROOT, 'src/lib/blog/pages/index.ts'), 'utf8');
  const pageFiles = [...pageIndex.matchAll(/from '\.\/([\w-]+)'/g)].map((m) => m[1]);
  const pages: string[] = [];
  for (const file of pageFiles) {
    const src = await readFile(join(ROOT, `src/lib/blog/pages/${file}.ts`), 'utf8');
    const pagePath = src.match(/\bpath:\s*'(\/[\w/-]+)'/)?.[1];
    if (!pagePath) continue;
    pages.push(pagePath);
    const updated = src.match(/\bupdated:\s*'(\d{4}-\d{2}-\d{2})'/)?.[1];
    if (updated) LAST_MODIFIED.set(pagePath, updated);
  }
  const research = Object.keys(RESEARCH_META);
  return ['/', ...pages, '/blog', ...slugs.map((s) => `/blog/${s}`), ...research];
}
