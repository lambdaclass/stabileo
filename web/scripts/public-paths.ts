import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Locale } from '../src/lib/i18n/offered';
import { publishedLocales } from '../src/lib/i18n/published';
import { RESEARCH_GALLERY, RESEARCH_PAPER_PATHS, researchLastReview } from '../src/components/research/locales';
import { blogTranslations } from './blog-translations';
import { TOOL_IDS } from '../src/components/tools/calculators';
import { BATCH_IDS } from '../src/components/tools/batch';
import toolReviews from '../../research/tools/batches/VALIDATION.json';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * A post's last change, for its sitemap entry: `updated` when the post states one, else its
 * publication date. The build day said every post changed on every deploy, which teaches a
 * crawler to ignore lastmod.
 */
export const POST_LASTMOD = new Map<string, string>();
/** A post's publication day, for its feed entry and its card. */
export const POST_DATE = new Map<string, string>();

(globalThis as { __BLOG_TRANSLATIONS__?: readonly string[] }).__BLOG_TRANSLATIONS__ ??= blogTranslations(ROOT);

/** The languages a public path is written in, which are the only ones it is built, listed and linked in. */
export function writtenIn(path: string): Locale[] {
  return [...publishedLocales(path)];
}

/** Every public route, without its language prefix. Posts are read from the bundle. */
export async function publicPaths(): Promise<string[]> {
  const source = await readFile(join(ROOT, 'src/lib/blog/index.ts'), 'utf8');
  const imports = [...source.matchAll(/from '\.\/posts\/([\w-]+)'/g)].map((m) => m[1]);
  const slugs: string[] = [];
  for (const file of imports) {
    const post = await readFile(join(ROOT, `src/lib/blog/posts/${file}.ts`), 'utf8');
    const slug = post.match(/slug:\s*'([^']+)'/)?.[1];
    if (slug) {
      slugs.push(slug);
      const published = post.match(/\bdate:\s*'(\d{4}-\d{2}-\d{2})'/)?.[1];
      const day = post.match(/\bupdated:\s*'(\d{4}-\d{2}-\d{2})'/)?.[1] ?? published;
      if (day) POST_LASTMOD.set(`/blog/${slug}`, day);
      if (published) POST_DATE.set(`/blog/${slug}`, published);
    }
  }
  if (slugs.length === 0) throw new Error('prerender: found no blog posts — the scan is broken');
  POST_LASTMOD.set('/blog', [...POST_LASTMOD.values()].sort().at(-1)!);
  const reviewed = (batch: string) => toolReviews.batches.find((b) => b.id === batch)!.reviews.map((r) => r.date).sort().at(-1)!;
  for (const id of TOOL_IDS) POST_LASTMOD.set(`/tools/${id}`, reviewed('tools-batch-1'));
  for (const id of BATCH_IDS) POST_LASTMOD.set(`/tools/${id}`, reviewed('tools-batch-2'));
  POST_LASTMOD.set('/tools', [reviewed('tools-batch-1'), reviewed('tools-batch-2')].sort().at(-1)!);
  // Standing pages, read from their own files, with their last edit for the sitemap.
  const pageIndex = await readFile(join(ROOT, 'src/lib/blog/pages/index.ts'), 'utf8');
  const pageFiles = [...pageIndex.matchAll(/from '\.\/([\w-]+)'/g)].map((m) => m[1]);
  const pages: string[] = [];
  for (const file of pageFiles) {
    const src = await readFile(join(ROOT, `src/lib/blog/pages/${file}.ts`), 'utf8');
    const pagePath = src.match(/\bpath:\s*'(\/[\w-]+)'/)?.[1];
    if (!pagePath) continue;
    pages.push(pagePath);
    const day = src.match(/\bupdated:\s*'(\d{4}-\d{2}-\d{2})'/)?.[1];
    if (day) POST_LASTMOD.set(pagePath, day);
  }
  const research = [RESEARCH_GALLERY, ...RESEARCH_PAPER_PATHS];
  for (const path of research) {
    const day = researchLastReview(path);
    if (day) POST_LASTMOD.set(path, day);
  }
  return ['/', ...pages, '/blog', ...slugs.map((s) => `/blog/${s}`), '/paper', ...research, '/tools', '/tools/simply-supported-beam', '/tools/cantilever-beam', '/tools/column-buckling', '/tools/continuous-beam', '/tools/portal-frame', '/tools/truss-2d', '/tools/influence-line', '/tools/beam-natural-frequency', '/examples', '/examples/beam-frame', '/examples/slab-on-columns', '/examples/earthquake-frame', '/examples/rc-column', '/examples/outrigger', '/examples/tower'];
}

