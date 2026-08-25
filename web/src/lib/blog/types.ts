/**
 * The blog's content model.
 *
 * A post is structured data, not a string of HTML. Two reasons, and both are
 * about the same thing — a post has to exist in three languages:
 *
 *  - A translator edits sentences, not markup. Handing them a paragraph at a
 *    time means a Portuguese post cannot end up with an unclosed tag or a lost
 *    table row, and a missing translation is a missing field the tests can see
 *    rather than a page that renders half in English.
 *  - Nothing here is ever passed to `{@html}`. The renderer maps each block to
 *    an element, so a post cannot inject markup into the page even by accident.
 *
 * The block set is deliberately small. It covers what an engineering article
 * needs — prose, headings, lists, a pull quote, a table of numbers — and
 * stops. A post that wants something else is a reason to add a block kind
 * here, with a renderer and a test, not a reason to reach for raw HTML.
 */
import type { PublicLocale } from '../i18n/store.svelte';

export type Block =
  | { k: 'h'; t: string }
  | { k: 'p'; t: string }
  | { k: 'ul'; items: string[] }
  | { k: 'ol'; items: string[] }
  | { k: 'quote'; t: string }
  /** An aside: a caveat, a definition, something set apart from the argument. */
  | { k: 'note'; t: string }
  | { k: 'table'; caption: string; head: string[]; rows: string[][] }
  /**
   * The editor, running on the model the passage is about. `query` is the
   * argument list for /app/basic; `label` says what the reader is opening.
   * It renders as a placeholder until clicked — see PostEmbed.svelte.
   */
  | { k: 'embed'; query: string; label: string };

/** One post in one language. */
export type PostBody = {
  title: string;
  /** One or two sentences. The index card and the meta description use it. */
  excerpt: string;
  blocks: Block[];
};

export type Post = {
  /**
   * The URL segment, and the same in every language: `/blog/<slug>`. A link
   * that changes when the reader changes language is a link that breaks when
   * it is shared, so the slug is English and stable even on the Spanish page.
   */
  slug: string;
  /** ISO date (YYYY-MM-DD). Publication, not last edit. */
  date: string;
  /** People, not dictionary keys — names are not translated. */
  authors: string[];
  /** `blog.tag.*` dictionary keys, so the tags themselves translate. */
  tagKeys: string[];
  i18n: Record<PublicLocale, PostBody>;
};

/** Every word the post renders, for the reading-time estimate. */
export function wordCount(body: PostBody): number {
  const parts: string[] = [body.title, body.excerpt];
  for (const b of body.blocks) {
    if (b.k === 'p' || b.k === 'h' || b.k === 'quote' || b.k === 'note') parts.push(b.t);
    else if (b.k === 'ul' || b.k === 'ol') parts.push(...b.items);
    else if (b.k === 'embed') parts.push(b.label);
    else parts.push(b.caption, ...b.head, ...b.rows.flat());
  }
  return parts.join(' ').split(/\s+/).filter(Boolean).length;
}

/** Reading time in whole minutes, never zero. 200 wpm, the usual estimate. */
export function readingMinutes(body: PostBody): number {
  return Math.max(1, Math.round(wordCount(body) / 200));
}
