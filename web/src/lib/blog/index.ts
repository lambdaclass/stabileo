/**
 * The blog's index: every post, newest first.
 *
 * A file, not a fetch. The site is a static bundle served from GitHub Pages
 * with no backend of its own, so posts ship with the application and are as
 * available offline as the solver is.
 */
import type { Post } from './types';
import { determinismBoundary } from './posts/determinism-boundary';
import { torsionTheories } from './posts/torsion-theories';
import { cirsoc201Flexure } from './posts/cirsoc-201-flexure';

/** Newest first. `date` is a plain ISO day, so a string sort is a date sort. */
export const POSTS: Post[] = [determinismBoundary, torsionTheories, cirsoc201Flexure].sort((a, b) => b.date.localeCompare(a.date));

export function findPost(slug: string): Post | undefined {
  return POSTS.find((p) => p.slug === slug);
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

export type { Post, PostBody, Block } from './types';
