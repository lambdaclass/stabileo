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
import { PUBLIC_LOCALES, type PublicLocale } from '../i18n/store.svelte';

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
  | { k: 'embed'; query: string; label: string; mode?: 'basic' | 'pro' }
  /**
   * A pointer to another post. `t` is the sentence that says why the reader
   * would follow it; the target's title is looked up in the reader's language
   * and rendered as a real, crawlable link.
   *
   * It exists because no post linked to any other: each one competed alone,
   * reachable only from the index. Posts on neighbouring questions that point
   * at each other are how a reader — and a crawler — finds the next one.
   */
  | { k: 'link'; slug: string; t: string }
  /**
   * A pointer to a document outside the blog: an advisory's full text, a
   * verification report, an issue. `t` says why the reader would follow it;
   * `label` is the link text. Only the project's own repository is allowed
   * (the content test enforces it), so a post cannot send readers anywhere
   * we do not publish.
   */
  | { k: 'ext'; href: string; label: string; t: string };

export type Localized<T> = Record<'en' | 'es' | 'pt', T> & Partial<Record<PublicLocale, T>>;

export function inLocale<T>(texts: Localized<T>, locale: PublicLocale): T {
  return texts[locale] ?? texts.en;
}

export function writtenIn(texts: Localized<unknown>): PublicLocale[] {
  return PUBLIC_LOCALES.filter((l) => texts[l]);
}

/** Attaches `translations/<locale>/<id>.ts` bodies to the items they name, so a language arrives as files only. */
export function addTranslations<T extends { i18n: Localized<unknown> }>(
  items: T[],
  id: (item: T) => string,
  modules: Record<string, unknown>,
): void {
  for (const [path, body] of Object.entries(modules)) {
    const m = /translations\/([a-z]{2})\/(.+)\.ts$/.exec(path);
    const item = m && items.find((i) => id(i) === m[2]);
    if (!m || !item) throw new Error(`blog translation without a match: ${path}`);
    (item.i18n as Record<string, unknown>)[m[1]] = body;
  }
}

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
  /**
   * ISO date of the last substantive edit, when there was one after publication: search engines
   * read it as `dateModified` / `article:modified_time`, and the sitemap as the page's lastmod.
   */
  updated?: string;
  /**
   * Where the post sits in the series, lowest first. NOT the date.
   *
   * The index used to sort newest-first, which is right for a blog that
   * accumulates and wrong for four posts that build on each other: the one
   * that frames the whole argument is the oldest, so recency order buried it
   * at the bottom and opened with the most specialised piece instead.
   *
   * The dates still run in the same direction, so nothing looks shuffled —
   * this is what decides, and the dates are free to stop agreeing later.
   */
  order: number;
  /** People, not dictionary keys — names are not translated. */
  authors: string[];
  /** `blog.tag.*` dictionary keys, so the tags themselves translate. */
  tagKeys: string[];
  i18n: Localized<PostBody>;
};

/**
 * Every word the post renders, for the reading-time estimate.
 *
 * A link block renders its lead and the target post's title; the title lives
 * in the other post, so the caller resolves it (`postReadingMinutes` does).
 */
export function wordCount(body: PostBody, linkTitle?: (slug: string) => string | undefined): number {
  const parts: string[] = [body.title, body.excerpt];
  for (const b of body.blocks) {
    if (b.k === 'link') parts.push(b.t, linkTitle?.(b.slug) ?? '');
    else if (b.k === 'ext') parts.push(b.t, b.label);
    else if (b.k === 'p' || b.k === 'h' || b.k === 'quote' || b.k === 'note') parts.push(b.t);
    else if (b.k === 'ul' || b.k === 'ol') parts.push(...b.items);
    else if (b.k === 'embed') parts.push(b.label);
    else parts.push(b.caption, ...b.head, ...b.rows.flat());
  }
  return parts.join(' ').split(/\s+/).filter(Boolean).length;
}

/** Reading time in whole minutes, never zero. 200 wpm, the usual estimate. */
export function readingMinutes(body: PostBody, linkTitle?: (slug: string) => string | undefined): number {
  return Math.max(1, Math.round(wordCount(body, linkTitle) / 200));
}
