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
	pt: 'pt_BR',
	de: 'de_DE',
	fr: 'fr_FR',
	tr: 'tr_TR'
};

const META_TAGS = [
	['meta[name="description"]', 'content'],
	['meta[property="og:title"]', 'content'],
	['meta[property="og:description"]', 'content'],
	['meta[property="og:locale"]', 'content'],
	['meta[name="twitter:title"]', 'content'],
	['meta[name="twitter:description"]', 'content'],
	['meta[property="og:image"]', 'content'],
	['meta[property="og:image:alt"]', 'content'],
	['meta[name="twitter:image"]', 'content'],
	['meta[name="twitter:image:alt"]', 'content']
] as const;

/** The site-wide card; a post has its own (rendered by scripts/prerender.ts). */
const SITE_IMAGE = 'https://stabileo.com/og/stabileo-social.png';

/** A post's own social card: its title on the site's card, one per language. */
export function postImageUrl(slug: string, locale: PublicLocale): string {
	return `https://stabileo.com/og/blog/${slug}.${locale}.png`;
}

const FEED = 'link[rel="alternate"][type="application/rss+xml"][data-page-meta]';

/** A blog page advertises its language's feed, so a reader or an aggregator can follow it. */
function setFeedLink(path: string, locale: PublicLocale) {
	document.querySelector(FEED)?.remove();
	if (!path.startsWith('/blog')) return;
	const el = document.createElement('link');
	el.setAttribute('rel', 'alternate');
	el.setAttribute('type', 'application/rss+xml');
	el.setAttribute('title', 'Stabileo — Blog');
	el.setAttribute('href', `https://stabileo.com/${locale}/blog/feed.xml`);
	el.setAttribute('data-page-meta', '');
	document.head.appendChild(el);
}

const ALTERNATE = 'meta[property="og:locale:alternate"]';
const HREFLANG = 'link[rel="alternate"][hreflang]';

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
	/** ISO day of the last substantive edit; the publication day when absent. */
	dateModified?: string;
	authors: string[];
	/** The post's topics, in the reader's language: `keywords` and `article:tag`. */
	keywords?: string[];
	/** Absolute; the page's own canonical. */
	url: string;
	locale: PublicLocale;
	/** The breadcrumb's names for the home page and the blog, in the reader's language. */
	crumbs?: { home: string; blog: string };
	/** Absolute URL of the post's own social card. */
	image?: string;
};

/*
 * The organization, with what it is and where else it lives: a search engine otherwise confuses it
 * with STABILO, the pen brand. `sameAs` are the profiles the footer links to.
 */
/** The backer and publisher. LambdaClass is its development arm, credited as the developer. */
export const ERGODIC_GROUP = {
	'@type': 'Organization',
	'@id': 'https://ergodicgroup.com/#organization',
	name: 'Ergodic Group',
	url: 'https://ergodicgroup.com/'
};

export const LAMBDA_CLASS = {
	'@type': 'Organization',
	name: 'LambdaClass',
	url: 'https://lambdaclass.com',
	parentOrganization: { '@id': ERGODIC_GROUP['@id'] }
};

const ORG = {
	'@type': 'Organization',
	'@id': 'https://stabileo.com/#organization',
	name: 'Stabileo',
	url: 'https://stabileo.com',
	logo: 'https://stabileo.com/og/stabileo-social.png',
	description: 'Stabileo is open-source structural analysis and design software (Argentine CIRSOC codes) that runs in the browser.',
	parentOrganization: ERGODIC_GROUP,
	sameAs: [
		'https://github.com/lambdaclass/stabileo',
		'https://www.linkedin.com/company/stabileo',
		'https://x.com/Stabileoapp',
		'https://www.instagram.com/stabileoapp/'
	]
};

/** The structured data a page states: a post's article and breadcrumb, or a page's own graph. */
function setStructuredData(article: ArticleMeta | undefined, graph: object[] | undefined) {
	document.querySelector(JSONLD)?.remove();
	const nodes: object[] = [];
	if (article) {
		nodes.push({
			'@type': 'BlogPosting',
			headline: article.headline,
			description: article.description,
			datePublished: article.datePublished,
			dateModified: article.dateModified ?? article.datePublished,
			inLanguage: article.locale,
			author: article.authors.map((name) => ({ '@type': 'Person', name })),
			publisher: { '@id': ORG['@id'] },
			mainEntityOfPage: { '@type': 'WebPage', '@id': article.url },
			url: article.url,
			image: article.image ?? SITE_IMAGE,
			...(article.keywords?.length ? { keywords: article.keywords.join(', ') } : {}),
			isPartOf: { '@type': 'Blog', '@id': publicUrl('/blog', article.locale) }
		});
		if (article.crumbs) {
			nodes.push({
				'@type': 'BreadcrumbList',
				itemListElement: [
					{ '@type': 'ListItem', position: 1, name: article.crumbs.home, item: publicUrl('/', article.locale) },
					{ '@type': 'ListItem', position: 2, name: article.crumbs.blog, item: publicUrl('/blog', article.locale) },
					{ '@type': 'ListItem', position: 3, name: article.headline, item: article.url }
				]
			});
		}
		nodes.push(ORG);
	}
	if (graph) nodes.push(...graph);
	if (nodes.length === 0) return;
	const el = document.createElement('script');
	el.setAttribute('type', 'application/ld+json');
	el.setAttribute('data-page-meta', '');
	el.textContent = JSON.stringify({ '@context': 'https://schema.org', '@graph': nodes });
	document.head.appendChild(el);
}

/** The Organization a page's own graph can refer to. */
export const STABILEO_ORGANIZATION = ORG;

const ARTICLE_OG = 'meta[data-page-meta-og]';

/**
 * Open Graph says what kind of thing the page is: `article` on a post, with its dates, author and
 * topics (`article:*`), `website` everywhere else, as index.html ships it.
 */
function setOgArticle(article: ArticleMeta | undefined) {
	for (const el of document.querySelectorAll(ARTICLE_OG)) el.remove();
	const type = document.querySelector('meta[property="og:type"]');
	type?.setAttribute('content', article ? 'article' : 'website');
	if (!article || !type?.parentNode) return;
	const values: [string, string][] = [
		['article:published_time', article.datePublished],
		['article:modified_time', article.dateModified ?? article.datePublished],
		...article.authors.map((a): [string, string] => ['article:author', a]),
		...(article.keywords ?? []).map((k): [string, string] => ['article:tag', k])
	];
	let after: Node = type;
	for (const [property, content] of values) {
		const el = document.createElement('meta');
		el.setAttribute('property', property);
		el.setAttribute('content', content);
		el.setAttribute('data-page-meta-og', '');
		type.parentNode.insertBefore(el, after.nextSibling);
		after = el;
	}
}

type Hreflang = { hreflang: string; href: string };

let original: {
	title: string;
	lang: string;
	tags: (string | null)[];
	alternates: string[];
	canonical: string | null;
	hreflangs: Hreflang[];
} | null = null;

function setMeta(selector: string, value: string) {
	document.querySelector(selector)?.setAttribute('content', value);
}

function readAlternates(): string[] {
	return [...document.querySelectorAll(ALTERNATE)].map((el) => el.getAttribute('content') ?? '');
}

function readHreflangs(): Hreflang[] {
	return [...document.querySelectorAll(HREFLANG)].map((el) => ({
		hreflang: el.getAttribute('hreflang') ?? '',
		href: el.getAttribute('href') ?? ''
	}));
}

/**
 * The `hreflang` set, rewritten in place after `anchor`.
 *
 * The cursor advances, exactly as `setAlternateLocales` does. Inserting every
 * element after the SAME node emits them in reverse: each one lands between
 * the anchor and the one written before it. No crawler reads them in order, so
 * nothing was broken — but two functions in one file doing the same job by
 * different means is how the one that matters eventually gets it wrong.
 */
function setHreflangs(values: Hreflang[], anchor: Element | null) {
	for (const el of document.querySelectorAll(HREFLANG)) el.remove();
	if (!anchor?.parentNode) return;
	let after: Node = anchor;
	for (const value of values) {
		const el = document.createElement('link');
		el.setAttribute('rel', 'alternate');
		el.setAttribute('hreflang', value.hreflang);
		el.setAttribute('href', value.href);
		anchor.parentNode.insertBefore(el, after.nextSibling);
		after = el;
	}
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
// A page not yet written in the reader's language shows its English text, so it names the English one as canonical.
function setLinks(path: string, locale: PublicLocale, written: readonly PublicLocale[]) {
	const own = written.includes(locale) ? locale : 'en';
	const canonical = document.querySelector('link[rel="canonical"]');
	if (canonical) canonical.setAttribute('href', publicUrl(path, own));
	setHreflangs(alternateUrls(path, written), canonical ?? document.head.lastElementChild);
	setMeta('meta[property="og:url"]', publicUrl(path, own));
}

export function applyPageMeta(meta: {
	title: string;
	description: string;
	locale: PublicLocale;
	/** The route without its language prefix: '/', '/blog', '/blog/<slug>'. */
	path: string;
	/** Present on a post; absent everywhere else. */
	article?: ArticleMeta;
	/** Schema.org nodes the page states about itself (the landing's app, the blog's index). */
	graph?: object[];
	/** The languages a post or standing page is written in; every public language otherwise. */
	written?: readonly PublicLocale[];
}) {
	const written = meta.written ?? PUBLIC_LOCALES;
	if (!original) {
		original = {
			title: document.title,
			lang: document.documentElement.lang,
			tags: META_TAGS.map(([sel, attr]) => document.querySelector(sel)?.getAttribute(attr) ?? null),
			alternates: readAlternates(),
			canonical: document.querySelector('link[rel="canonical"]')?.getAttribute('href') ?? null,
			hreflangs: readHreflangs()
		};
	}
	document.title = meta.title;
	document.documentElement.lang = meta.locale;
	setMeta('meta[name="description"]', meta.description);
	setMeta('meta[property="og:title"]', meta.title);
	setMeta('meta[property="og:description"]', meta.description);
	setMeta('meta[property="og:locale"]', OG_LOCALE[meta.locale]);
	setAlternateLocales(written.filter((l) => l !== meta.locale).map((l) => OG_LOCALE[l]));
	setMeta('meta[name="twitter:title"]', meta.title);
	setMeta('meta[name="twitter:description"]', meta.description);
	setLinks(meta.path, meta.locale, written);
	setFeedLink(meta.path, meta.locale);
	if (meta.article?.image) {
		for (const sel of ['meta[property="og:image"]', 'meta[name="twitter:image"]']) setMeta(sel, meta.article.image);
		for (const sel of ['meta[property="og:image:alt"]', 'meta[name="twitter:image:alt"]']) setMeta(sel, meta.article.headline);
	} else if (original) {
		// Back to the site's card (and its alt) on a page that has none of its own.
		META_TAGS.forEach(([sel, attr], i) => {
			if (/image/.test(sel) && original!.tags[i] !== null) document.querySelector(sel)?.setAttribute(attr, original!.tags[i]!);
		});
	}
	setOgArticle(meta.article);
	setStructuredData(meta.article, meta.graph);
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
	const canonical = document.querySelector('link[rel="canonical"]');
	if (canonical && original.canonical) canonical.setAttribute('href', original.canonical);
	/*
	 * Put the hreflang set BACK, rather than only removing what was written.
	 *
	 * The docstring at the top of this file promises the document is left as a
	 * crawler that never ran this code would have found it, and every other
	 * pair here honours it. This one deleted the tags and restored nothing, so
	 * on a prerendered page — which ships a complete hreflang set — entering
	 * the editor stripped it. No crawler is watching by then, which is exactly
	 * why it would have stayed wrong.
	 */
	setHreflangs(original.hreflangs, canonical ?? document.head.lastElementChild);
	setOgArticle(undefined);
	setStructuredData(undefined, undefined);
	document.querySelector(FEED)?.remove();
}
