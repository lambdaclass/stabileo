/**
 * Document metadata for the public pages, applied by rewriting the tags that
 * are already in index.html.
 *
 * Not `svelte:head`. That APPENDS to the document, and index.html already
 * carries a full static set for crawlers that never run this code — emitting
 * them again produced five <title> elements and eight duplicated metas whose
 * English values contradicted each other. Rewriting in place keeps exactly one
 * of each and lets a Spanish or Portuguese page correct them.
 *
 * The originals are captured once and restored when the page unmounts, so
 * entering the application never leaves landing or blog copy behind in the tab
 * title.
 */
import { PUBLIC_LOCALES, type PublicLocale } from './i18n/store.svelte';
import { alternateUrls, publicUrl } from './i18n/public-routes';

const OG_LOCALE: Record<PublicLocale, string> = {
	en: 'en_US',
	es: 'es_AR',
	pt: 'pt_BR'
};

const META_TAGS = [
	['meta[name="description"]', 'content'],
	['meta[property="og:title"]', 'content'],
	['meta[property="og:description"]', 'content'],
	['meta[property="og:locale"]', 'content'],
	['meta[name="twitter:title"]', 'content'],
	['meta[name="twitter:description"]', 'content']
] as const;

const ALTERNATE = 'meta[property="og:locale:alternate"]';

/** The one this module writes, so restoring can remove exactly it. */
const JSONLD = 'script[type="application/ld+json"][data-page-meta]';

/**
 * What a post tells a search engine about itself, in Schema.org terms.
 *
 * This is the difference between a page of text and a result that shows an
 * author and a date. It is also the only place the authorship of the post is
 * machine-readable — the byline on screen is prose.
 */
export type ArticleMeta = {
	headline: string;
	description: string;
	/** ISO day. */
	datePublished: string;
	authors: string[];
	/** Absolute; the page's own canonical. */
	url: string;
	locale: PublicLocale;
};

function setArticleData(article: ArticleMeta | undefined) {
	document.querySelector(JSONLD)?.remove();
	if (!article) return;
	const el = document.createElement('script');
	el.setAttribute('type', 'application/ld+json');
	el.setAttribute('data-page-meta', '');
	el.textContent = JSON.stringify({
		'@context': 'https://schema.org',
		'@type': 'BlogPosting',
		headline: article.headline,
		description: article.description,
		datePublished: article.datePublished,
		inLanguage: article.locale,
		author: article.authors.map((name) => ({ '@type': 'Person', name })),
		publisher: { '@type': 'Organization', name: 'Stabileo', url: 'https://stabileo.com' },
		mainEntityOfPage: { '@type': 'WebPage', '@id': article.url },
		url: article.url,
		image: 'https://stabileo.com/og/stabileo-social.png'
	});
	document.head.appendChild(el);
}

let original: {
	title: string;
	lang: string;
	tags: (string | null)[];
	alternates: string[];
	canonical: string | null;
} | null = null;

function setMeta(selector: string, value: string) {
	document.querySelector(selector)?.setAttribute('content', value);
}

function readAlternates(): string[] {
	return [...document.querySelectorAll(ALTERNATE)].map((el) => el.getAttribute('content') ?? '');
}

/**
 * `og:locale:alternate` is one tag per language, not a comma-separated list.
 *
 * With three public languages a page has two alternates to declare, and the
 * count changes with the locale the reader picked — so the whole set is
 * rewritten rather than the single static tag patched. index.html's originals
 * are captured first and put back by `restorePageMeta`, leaving the document
 * as a crawler that never ran this code would have found it.
 */
function setAlternateLocales(values: string[]) {
	const anchor = document.querySelector('meta[property="og:locale"]');
	if (!anchor?.parentNode) return;
	for (const el of document.querySelectorAll(ALTERNATE)) el.remove();
	let after: Node = anchor;
	for (const value of values) {
		const el = document.createElement('meta');
		el.setAttribute('property', 'og:locale:alternate');
		el.setAttribute('content', value);
		anchor.parentNode.insertBefore(el, after.nextSibling);
		after = el;
	}
}

/**
 * `<link rel="canonical">` and the `hreflang` set, rewritten for this page.
 *
 * index.html ships one canonical pointing at the homepage, which is right for
 * the homepage and wrong everywhere else: every blog post was telling search
 * engines that its real address was `/`, handing its own credit to the front
 * page. The alternates are what lets a crawler discover that this page exists
 * in two other languages at all.
 *
 * Both are rewritten as a set and restored as a set, like og:locale:alternate
 * above, because the count changes with the page.
 */
function setLinks(path: string, locale: PublicLocale) {
	const canonical = document.querySelector('link[rel="canonical"]');
	if (canonical) canonical.setAttribute('href', publicUrl(path, locale));

	for (const el of document.querySelectorAll('link[rel="alternate"][hreflang]')) el.remove();
	const anchor = canonical ?? document.head.lastElementChild;
	for (const alt of alternateUrls(path)) {
		const el = document.createElement('link');
		el.setAttribute('rel', 'alternate');
		el.setAttribute('hreflang', alt.hreflang);
		el.setAttribute('href', alt.href);
		anchor?.parentNode?.insertBefore(el, anchor.nextSibling);
	}
	setMeta('meta[property="og:url"]', publicUrl(path, locale));
}

export function applyPageMeta(meta: {
	title: string;
	description: string;
	locale: PublicLocale;
	/** The route without its language prefix: '/', '/blog', '/blog/<slug>'. */
	path: string;
	/** Present on a post; absent everywhere else. */
	article?: ArticleMeta;
}) {
	if (!original) {
		original = {
			title: document.title,
			lang: document.documentElement.lang,
			tags: META_TAGS.map(([sel, attr]) => document.querySelector(sel)?.getAttribute(attr) ?? null),
			alternates: readAlternates(),
			canonical: document.querySelector('link[rel="canonical"]')?.getAttribute('href') ?? null
		};
	}
	document.title = meta.title;
	document.documentElement.lang = meta.locale;
	setMeta('meta[name="description"]', meta.description);
	setMeta('meta[property="og:title"]', meta.title);
	setMeta('meta[property="og:description"]', meta.description);
	setMeta('meta[property="og:locale"]', OG_LOCALE[meta.locale]);
	setAlternateLocales(PUBLIC_LOCALES.filter((l) => l !== meta.locale).map((l) => OG_LOCALE[l]));
	setMeta('meta[name="twitter:title"]', meta.title);
	setMeta('meta[name="twitter:description"]', meta.description);
	setLinks(meta.path, meta.locale);
	setArticleData(meta.article);
}

export function restorePageMeta() {
	if (!original) return;
	document.title = original.title;
	document.documentElement.lang = original.lang;
	META_TAGS.forEach(([sel, attr], i) => {
		const v = original!.tags[i];
		if (v !== null) document.querySelector(sel)?.setAttribute(attr, v);
	});
	setAlternateLocales(original.alternates);
	for (const el of document.querySelectorAll('link[rel="alternate"][hreflang]')) el.remove();
	const canonical = document.querySelector('link[rel="canonical"]');
	if (canonical && original.canonical) canonical.setAttribute('href', original.canonical);
	setArticleData(undefined);
}
