import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PUBLIC_LOCALES } from '../src/lib/i18n/offered';
import { ALLOWED_SEGMENTS, ALLOWED_SEGMENT_PATTERNS, ALLOWED_HEAD_STRINGS } from './translation-allowlist';

export const MAX_ENGLISH_SHARE = 0.05;
const MIN_WORDS = 4;

export type GateFailure = { page: string; locale: string; rule: string; offending: string[] };

function decode(s: string): string {
  return s
    .replace(/&nbsp;|&#160;/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/g, '&');
}

function attributes(tag: string): Record<string, string> {
  return Object.fromEntries([...tag.matchAll(/([\w:-]+)="([^"]*)"/g)].map(([, k, v]) => [k.toLowerCase(), decode(v)]));
}

export type HeadStrings = { lang: string; title: string; description: string; ogTitle: string; ogDescription: string };

export function headStrings(html: string): HeadStrings {
  const metas = [...html.matchAll(/<meta\b[^>]*>/gi)].map(([t]) => attributes(t));
  const meta = (key: 'name' | 'property', value: string) => metas.find((m) => m[key] === value)?.content ?? '';
  return {
    lang: html.match(/<html\b[^>]*\blang="([^"]*)"/i)?.[1] ?? '',
    title: decode(html.match(/<title>([^<]*)<\/title>/i)?.[1] ?? '').trim(),
    description: meta('name', 'description'),
    ogTitle: meta('property', 'og:title'),
    ogDescription: meta('property', 'og:description'),
  };
}

const DROPPED = /<(script|style|svg|pre|code|math|template|noscript)\b[\s\S]*?<\/\1>/gi;
const BLOCK = /<\/?(?:p|li|h[1-6]|td|th|dt|dd|figcaption|caption|blockquote|div|section|article|header|footer|nav|main|aside|ul|ol|dl|table|tr|thead|tbody|tfoot|figure|label|button|option|select|summary|details|form|fieldset|legend|br|hr)\b[^>]*>/gi;

const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);

function declaredElsewhere(tag: string, locale: string): boolean {
  const a = attributes(tag);
  return a.translate === 'no' || (!!a.lang && a.lang.split('-')[0].toLowerCase() !== locale);
}

/** `html` without the elements it marks `translate="no"` or as written in a language other than `locale`. */
export function withoutDeclared(html: string, locale: string): string {
  const open = /<([a-z][\w-]*)\b[^>]*>/gi;
  let out = '';
  let from = 0;
  for (let m = open.exec(html); m; m = open.exec(html)) {
    const name = m[1].toLowerCase();
    if (VOID.has(name) || m[0].endsWith('/>') || !declaredElsewhere(m[0], locale)) continue;
    const tags = new RegExp(`<(/?)${name}\\b[^>]*>`, 'gi');
    tags.lastIndex = m.index + m[0].length;
    let depth = 1;
    let end = html.length;
    for (let t = tags.exec(html); t; t = tags.exec(html)) {
      depth += t[1] ? -1 : 1;
      if (depth === 0) {
        end = t.index + t[0].length;
        break;
      }
    }
    out += `${html.slice(from, m.index)}\n`;
    from = end;
    open.lastIndex = end;
  }
  return out + html.slice(from);
}

/** The page's visible text in `locale`, one entry per block of at least four words. */
export function segments(html: string, locale = 'en'): string[] {
  const body = html.match(/<div id="prerender">([\s\S]*)<div id="app">/)?.[1] ?? html;
  return withoutDeclared(body, locale)
    .replace(DROPPED, '\n')
    .replace(BLOCK, '\n')
    .replace(/<[^>]+>/g, '')
    .split('\n')
    .map((s) => decode(s).replace(/\s+/g, ' ').trim())
    .filter((s) => (s.match(/\p{L}{2,}/gu) ?? []).length >= MIN_WORDS);
}

function occurrences(text: string, phrase: string): number[] {
  const found: number[] = [];
  for (let at = text.indexOf(phrase); at >= 0; at = text.indexOf(phrase, at + 1)) {
    const before = text[at - 1], after = text[at + phrase.length];
    if (!(before && /[\p{L}\p{N}]/u.test(before)) && !(after && /[\p{L}\p{N}]/u.test(after))) found.push(at);
  }
  return found;
}

/** A block's sentences of at least four words, so a translated lead cannot hide English after it. */
function sentences(block: string): string[] {
  return block.split(/(?<=[.!?])\s+/).filter((s) => (s.match(/\p{L}{2,}/gu) ?? []).length >= MIN_WORDS);
}

function allowedSegment(s: string): boolean {
  return ALLOWED_SEGMENTS.has(s) || ALLOWED_SEGMENT_PATTERNS.some((re) => re.test(s));
}

/** Rules 1 and 2 for one page against its English original. */
export function compareWithEnglish(page: string, locale: string, html: string, english: string): GateFailure[] {
  const failures: GateFailure[] = [];
  const own = headStrings(html);
  const en = headStrings(english);
  if (own.lang !== locale) failures.push({ page, locale, rule: '<html lang> is not the page language', offending: [own.lang || '(none)'] });
  const head = (['title', 'description', 'ogTitle', 'ogDescription'] as const)
    .filter((k) => !own[k] || (own[k] === en[k] && !ALLOWED_HEAD_STRINGS.has(own[k])))
    .map((k) => `${k}: ${own[k] || '(missing)'}`);
  if (head.length) failures.push({ page, locale, rule: 'head strings are missing or the English ones', offending: head });

  const ownSegments = segments(html, locale).filter((s) => !allowedSegment(s));
  if (ownSegments.length === 0) {
    failures.push({ page, locale, rule: 'no visible text to check', offending: [] });
    return failures;
  }
  const englishSegments = segments(english);
  const englishSet = new Set(englishSegments);
  const englishSentences = new Set(englishSegments.flatMap(sentences));
  const chars = (xs: string[]) => xs.reduce((n, s) => n + s.length, 0);
  const englishChars = (s: string) => {
    if (englishSet.has(s)) return s.length;
    const covered = new Uint8Array(s.length);
    for (const x of englishSentences) for (const at of occurrences(s, x)) covered.fill(1, at, at + x.length);
    return covered.reduce((n, c) => n + c, 0);
  };
  const same = ownSegments.filter((s) => 2 * englishChars(s) > s.length);
  const countShare = same.length / ownSegments.length;
  const charShare = ownSegments.reduce((n, s) => n + englishChars(s), 0) / chars(ownSegments);
  if (countShare > MAX_ENGLISH_SHARE || charShare > MAX_ENGLISH_SHARE) {
    failures.push({
      page,
      locale,
      rule: `${same.length}/${ownSegments.length} text blocks (${(100 * countShare).toFixed(1)}%, ${(100 * charShare).toFixed(1)}% of characters) are the English page's text; at most ${100 * MAX_ENGLISH_SHARE}% may be`,
      offending: ownSegments.filter((s) => englishChars(s) > 0),
    });
  }
  return failures;
}

function isFile(p: string): boolean {
  return existsSync(p) && statSync(p).isFile();
}

function indexFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    if (e.isDirectory()) return indexFiles(p);
    return e.name === 'index.html' ? [p] : [];
  });
}

/** `/es/blog/x/` for `<dist>/es/blog/x/index.html`. */
function urlPath(dist: string, file: string): string {
  return `/${relative(dist, file).split(sep).slice(0, -1).join('/')}/`;
}

function hreflangs(markup: string): string[] {
  return [...markup.matchAll(/<(?:xhtml:)?link\b[^>]*>/g)]
    .map(([tag]) => attributes(tag))
    .filter((a) => a.rel === 'alternate' && a.hreflang !== undefined)
    .map((a) => `${a.hreflang} ${a.href}`)
    .sort();
}

/** Every rule over a built site; an empty list means it may be published. */
export function checkTranslations(distDir: string, origin = 'https://stabileo.com', locales: readonly string[] = PUBLIC_LOCALES): GateFailure[] {
  const dist = resolve(distDir);
  const failures: GateFailure[] = [];
  const built = new Map<string, string>();
  for (const locale of locales) for (const file of indexFiles(join(dist, locale))) built.set(urlPath(dist, file), file);
  if (![...built.keys()].some((p) => p.startsWith('/en/'))) {
    return [{ page: dist, locale: 'en', rule: 'no English pages were built', offending: [] }];
  }

  const rest = (path: string) => path.slice(path.indexOf('/', 1));
  const localeOf = (path: string) => path.split('/')[1];
  const builtIn = (r: string) => locales.filter((l) => built.has(`/${l}${r}`));

  for (const [path, file] of built) {
    const locale = localeOf(path);
    if (locale === 'en') continue;
    const english = built.get(`/en${rest(path)}`);
    if (!english) {
      failures.push({ page: path, locale, rule: 'no English page to compare with', offending: [] });
      continue;
    }
    failures.push(...compareWithEnglish(path, locale, readFileSync(file, 'utf8'), readFileSync(english, 'utf8')));
  }

  const sitemapFile = join(dist, 'sitemap.xml');
  if (!isFile(sitemapFile)) return [...failures, { page: '/sitemap.xml', locale: '-', rule: 'no sitemap', offending: [] }];
  const xml = readFileSync(sitemapFile, 'utf8');
  const entries = new Map<string, string>();
  for (const [, block] of xml.matchAll(/<url>([\s\S]*?)<\/url>/g)) {
    const loc = block.match(/<loc>([^<]+)<\/loc>/)?.[1] ?? '';
    entries.set(loc.startsWith(origin) ? loc.slice(origin.length) : loc, block);
  }
  const unbuilt = [...entries.keys()].filter((p) => !built.has(p));
  if (unbuilt.length) failures.push({ page: '/sitemap.xml', locale: '-', rule: 'sitemap lists pages that were not built', offending: unbuilt });
  const unlisted = [...built.keys()].filter((p) => !entries.has(p));
  if (unlisted.length) failures.push({ page: '/sitemap.xml', locale: '-', rule: 'built pages missing from the sitemap', offending: unlisted });

  for (const [path, file] of built) {
    const locale = localeOf(path);
    const expected = builtIn(rest(path)).map((l) => `${l} ${origin}/${l}${rest(path)}`).sort();
    const declared = hreflangs(readFileSync(file, 'utf8'));
    const declaredLocales = declared.filter((l) => !l.startsWith('x-default '));
    if (declaredLocales.join('\n') !== expected.join('\n')) {
      failures.push({ page: path, locale, rule: 'page hreflang set is not the set of languages the page was built in', offending: [`declared: ${declaredLocales.join(', ') || '(none)'}`, `built:    ${expected.join(', ')}`] });
    }
    const xDefault = declared.filter((l) => l.startsWith('x-default '));
    const expectedDefault = builtIn(rest(path)).includes('en') ? [`x-default ${origin}/en${rest(path)}`] : [];
    if (xDefault.join('\n') !== expectedDefault.join('\n')) {
      failures.push({ page: path, locale, rule: 'x-default is not the single English version of this page', offending: [`declared: ${xDefault.join(', ') || '(none)'}`, `expected: ${expectedDefault.join(', ') || '(none)'}`] });
    }
    const entry = entries.get(path);
    if (entry !== undefined && hreflangs(entry).join('\n') !== declared.join('\n')) {
      failures.push({ page: path, locale, rule: 'sitemap hreflang set differs from the page', offending: [`sitemap: ${hreflangs(entry).join(', ') || '(none)'}`, `page:    ${declared.join(', ') || '(none)'}`] });
    }
  }
  return failures;
}

export function formatFailures(failures: readonly GateFailure[]): string {
  return failures
    .map((f) => `${f.page} [${f.locale}] ${f.rule}${f.offending.map((o) => `\n    ${o}`).join('')}`)
    .join('\n');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const dist = process.argv[2] ?? 'dist';
  const failures = checkTranslations(dist);
  if (failures.length) {
    console.error(`translation gate: ${failures.length} failure(s) in ${resolve(dist)}\n${formatFailures(failures)}`);
    process.exit(1);
  }
  console.log(`translation gate: every page in ${resolve(dist)} is translated and the sitemap and hreflang agree`);
}
