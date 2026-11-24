import ts from 'typescript';
import { EXAMPLE_PATHS } from '../src/lib/public-surface';
import { publicFeatureEnabled } from '../src/lib/features';
import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Locale } from '../src/lib/i18n/offered';
import { publishedLocales } from '../src/lib/i18n/published';
import { RESEARCH_GALLERY, RESEARCH_PAPER_PATHS, researchLastReview } from '../src/components/research/locales';
import { blogTranslations } from './blog-translations';
import { TOOLS, toolLastmod, toolPaths } from '../src/components/tools/registry';
import toolReviews from '../../research/tools/batches/VALIDATION.json';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export { buildPublicFeatures } from './build-public-features';
import { buildPublicFeatures } from './build-public-features';

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
  return [...publishedLocales(path, buildPublicFeatures())];
}

function metadata(source: string): Record<string, string> {
  const file = ts.createSourceFile('page.ts', source, ts.ScriptTarget.Latest, true);
  for (const statement of file.statements) {
    if (!ts.isVariableStatement(statement) || !statement.modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword)) continue;
    for (const declaration of statement.declarationList.declarations) {
      let value = declaration.initializer;
      while (value && (ts.isAsExpression(value) || ts.isSatisfiesExpression(value))) value = value.expression;
      if (!value || !ts.isObjectLiteralExpression(value)) continue;
      const values: Record<string, string> = {};
      for (const property of value.properties) {
        if (ts.isPropertyAssignment(property) && (ts.isIdentifier(property.name) || ts.isStringLiteral(property.name)) && ts.isStringLiteral(property.initializer)) {
          values[property.name.text] = property.initializer.text;
        }
      }
      if (values.slug || values.path) return values;
    }
  }
  throw new Error('Public page has no static exported route metadata');
}

/** Every public route, without its language prefix. Posts are read from the bundle. */
export async function publicPaths(): Promise<string[]> {
  const flags = buildPublicFeatures();
  const source = await readFile(join(ROOT, 'src/lib/blog/index.ts'), 'utf8');
  const imports = [...source.matchAll(/from '\.\/posts\/([\w-]+)'/g)].map((m) => m[1]);
  const slugs: string[] = [];
  const postLastmods: string[] = [];
  for (const file of imports) {
    const post = await readFile(join(ROOT, `src/lib/blog/posts/${file}.ts`), 'utf8');
    const fields = metadata(post);
    const slug = fields.slug;
    if (slug) {
      slugs.push(slug);
      const published = fields.date;
      const day = fields.updated ?? published;
      if (day) {
        POST_LASTMOD.set(`/blog/${slug}`, day);
        postLastmods.push(day);
      }
      if (published) POST_DATE.set(`/blog/${slug}`, published);
    }
  }
  if (slugs.length === 0) throw new Error('prerender: found no blog posts — the scan is broken');
  POST_LASTMOD.set('/blog', postLastmods.sort().at(-1)!);
  const publishedTools = TOOLS.filter(tool => publicFeatureEnabled(`/tools/${tool.id}`, flags));
  for (const tool of publishedTools) POST_LASTMOD.set(`/tools/${tool.id}`, toolLastmod(tool, toolReviews.batches));
  POST_LASTMOD.set('/tools', publishedTools.map((tool) => toolLastmod(tool, toolReviews.batches)).sort().at(-1)!);
  // Standing pages, read from their own files, with their last edit for the sitemap.
  const pageIndex = await readFile(join(ROOT, 'src/lib/blog/pages/index.ts'), 'utf8');
  const pageFiles = [...pageIndex.matchAll(/from '\.\/([\w-]+)'/g)].map((m) => m[1]);
  const pages: string[] = [];
  for (const file of pageFiles) {
    const src = await readFile(join(ROOT, `src/lib/blog/pages/${file}.ts`), 'utf8');
    const fields = metadata(src);
    const pagePath = fields.path;
    if (!pagePath) continue;
    pages.push(pagePath);
    const day = fields.updated;
    if (day) POST_LASTMOD.set(pagePath, day);
  }
  const research = [RESEARCH_GALLERY, ...RESEARCH_PAPER_PATHS];
  for (const path of research) {
    const day = researchLastReview(path);
    if (day) POST_LASTMOD.set(path, day);
  }
  return ['/', ...pages, '/blog', ...slugs.map((s) => `/blog/${s}`), '/paper', ...research, ...toolPaths(), ...(flags.tools ? [] : EXAMPLE_PATHS), '/diagram-game'].filter(path => publicFeatureEnabled(path, flags));
}

