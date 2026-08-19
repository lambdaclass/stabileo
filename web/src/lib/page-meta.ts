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

let original: {
	title: string;
	lang: string;
	tags: (string | null)[];
	alternates: string[];
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

export function applyPageMeta(meta: { title: string; description: string; locale: PublicLocale }) {
	if (!original) {
		original = {
			title: document.title,
			lang: document.documentElement.lang,
			tags: META_TAGS.map(([sel, attr]) => document.querySelector(sel)?.getAttribute(attr) ?? null),
			alternates: readAlternates()
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
}
