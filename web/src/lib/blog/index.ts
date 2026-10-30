/**
 * The blog's index: every post, in the order they are meant to be read.
 *
 * A file, not a fetch. The site is a static bundle served from GitHub Pages
 * with no backend of its own, so posts ship with the application and are as
 * available offline as the solver is.
 */
import { readingMinutes, inLocale, addTranslations, type Post } from './types';
import type { PublicLocale } from '../i18n/store.svelte';
import { determinismBoundary } from './posts/determinism-boundary';
import { conceptualAdvanced } from './posts/conceptual-advanced';
import { cirsoc201Flexure } from './posts/cirsoc-201-flexure';
import { torsionTheories } from './posts/torsion-theories';
import { barsOrFiniteElements } from './posts/bars-or-finite-elements';
import { safetyAdvisories } from './posts/safety-advisories';
import { howStabileoChecksItsResults } from './posts/how-stabileo-checks-its-results';
import { release030 } from './posts/release-0-3-0';
import { endToEndCertificates } from './posts/end-to-end-certificates';
import { sameModelSameNumbers } from './posts/same-model-same-numbers';

/**
 * By `order`, not by date.
 *
 * Posts that build on each other are a series, not a feed: the one that
 * frames the argument is the oldest, and sorting by recency put it last and
 * opened the blog with the most specialised piece instead. See Post.order.
 */
export const POSTS: Post[] = [
  determinismBoundary,
  conceptualAdvanced,
  cirsoc201Flexure,
  torsionTheories,
  barsOrFiniteElements,
  safetyAdvisories,
  howStabileoChecksItsResults,
  release030,
  endToEndCertificates,
  sameModelSameNumbers,
].sort((a, b) => a.order - b.order);

addTranslations(POSTS, (p) => p.slug, import.meta.glob(['./translations/*/*.ts', '!./translations/*/page-*.ts'], { eager: true, import: 'default' }));

/**
 * What a reader looking for news expects: newest first (by date, then by series order). The blog
 * index and the landing's "latest post" use it. In series order the newest posts sat at the bottom
 * of the index and the landing's "latest" was the oldest post.
 */
export const POSTS_NEWEST_FIRST: Post[] = [...POSTS].sort((a, b) => b.date.localeCompare(a.date) || b.order - a.order);

export function findPost(slug: string): Post | undefined {
  return POSTS.find((p) => p.slug === slug);
}

/** Reading time of a post in one locale, counting the titles its link blocks render. */
export function postReadingMinutes(post: Post, locale: PublicLocale): number {
  const target = (slug: string) => findPost(slug);
  return readingMinutes(inLocale(post.i18n, locale), (slug) => { const p = target(slug); return p ? inLocale(p.i18n, locale).title : undefined; });
}

/**
 * The reader's own date format, from the locale they are reading in.
 *
 * `new Date('2026-08-12')` parses as UTC midnight and then prints in local
 * time, which is the previous day for anyone west of Greenwich — the post
 * would be dated the 11th in Buenos Aires. Splitting the parts sidesteps the
 * timezone entirely: the date is a calendar day, not an instant.
 */
export function formatPostDate(iso: string, locale: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(locale, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

export type { Post, PostBody, Block, Localized } from './types';
export { inLocale, writtenIn } from './types';
