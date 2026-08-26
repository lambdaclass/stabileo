/**
 * Public URLs carry their language in the path: `/es/blog/x`, `/en`, `/pt`.
 *
 * ── Why, since the app detects the language perfectly well on its own ──
 *
 * Because a search engine stores ONE version of a URL. Googlebot crawls with a
 * single locale, so `stabileo.com/` was indexed in English and the Spanish and
 * Portuguese pages existed at no address anything could store — for a product
 * whose market searches in Spanish and whose differentiator is an Argentine
 * code. There is no header- or script-based way around it: `hreflang`, the
 * mechanism Google defines for multilingual sites, points at URLs, so the
 * languages need URLs to point at.
 *
 * ── The shape ──
 *
 *   /                      x-default. English content, plus a script that
 *                          sends a Spanish or Portuguese browser onward.
 *   /es  /en  /pt          the landing, per language
 *   /es/blog               the index
 *   /es/blog/<slug>        a post — the slug does NOT translate, so the same
 *                          post is one link in three languages, differing only
 *                          in the prefix
 *
 * No language is privileged: `/es/` is not shorter than `/pt/`. The root is a
 * doorway rather than a home, which is what lets the three be equals.
 *
 * The editor is deliberately NOT in here. `/app/basic`, `/demo` and shared
 * model links keep the URLs they have always had: they are not content, nobody
 * should reach them from a search, and changing them would break links people
 * already hold.
 */
import { PUBLIC_LOCALES, type PublicLocale } from './store.svelte';

/** Where the site lives. Used for canonical and hreflang, which must be absolute. */
export const SITE_ORIGIN = 'https://stabileo.com';

/** The language a browser that speaks none of ours is sent to. */
export const DEFAULT_PUBLIC_LOCALE: PublicLocale = 'en';

function isPublic(code: string): code is PublicLocale {
	return (PUBLIC_LOCALES as readonly string[]).includes(code);
}

export type PublicRoute = {
	/** The language the prefix asked for, or null at the bare root. */
	locale: PublicLocale | null;
	/** What is left after the prefix: '/', '/blog', '/blog/<slug>'. */
	path: string;
};

/**
 * Split a pathname into its language prefix and the route under it.
 *
 * `/es/blog/x` → { locale: 'es', path: '/blog/x' }
 * `/blog/x`    → { locale: null, path: '/blog/x' }  (an old link; still works)
 * `/`          → { locale: null, path: '/' }
 */
export function parsePublicPath(pathname: string): PublicRoute {
	const segments = pathname.split('/').filter(Boolean);
	if (segments.length > 0 && isPublic(segments[0])) {
		const rest = segments.slice(1).join('/');
		return { locale: segments[0], path: rest ? `/${rest}` : '/' };
	}
	return { locale: null, path: pathname === '' ? '/' : pathname };
}

/** `('/blog/x', 'pt')` → `/pt/blog/x`. The root of a language has no trailing slash. */
export function publicHref(path: string, locale: PublicLocale): string {
	const clean = path === '/' ? '' : path.startsWith('/') ? path : `/${path}`;
	return `/${locale}${clean}`;
}

/** The same, absolute. Canonical and hreflang may not be relative. */
export function publicUrl(path: string, locale: PublicLocale): string {
	return `${SITE_ORIGIN}${publicHref(path, locale)}`;
}

/**
 * Every language's address for one route, plus x-default — the `hreflang` set
 * a page declares so a crawler can find its siblings.
 */
export function alternateUrls(path: string): Array<{ hreflang: string; href: string }> {
	return [
		...PUBLIC_LOCALES.map((l) => ({ hreflang: l, href: publicUrl(path, l) })),
		/*
		 * x-default points at the English version OF THIS PAGE.
		 *
		 * Two decisions, and only the first one is about language. The locale
		 * is English because a browser that speaks none of the three has to
		 * land somewhere, and `/` cannot be it: `/` serves English and declares
		 * `/en` as its canonical, so naming `/` here would point the default at
		 * a URL that is not canonical for itself.
		 *
		 * The PATH is `path`, and this used to be `'/'` — which meant every
		 * page on the site, every post included, told a crawler that readers it
		 * could not match by language should be sent to the English HOME PAGE
		 * instead of to that page. That is not a default, it is a redirect away
		 * from the content, and it applied to the whole hreflang set at once.
		 */
		{ hreflang: 'x-default', href: publicUrl(path, DEFAULT_PUBLIC_LOCALE) }
	];
}

/** Routes that exist in every language. Posts are appended by the caller. */
export const STATIC_PUBLIC_PATHS = ['/', '/blog'] as const;

/**
 * The language to send a browser to from the bare root.
 *
 * Not the app's own detection: that one falls back through fourteen shipped
 * dictionaries and answers questions this does not need to ask. Here there are
 * three doors and a default.
 */
export function preferredPublicLocale(languages: readonly string[]): PublicLocale {
	for (const tag of languages) {
		const code = tag.split('-')[0].toLowerCase();
		if (isPublic(code)) return code;
	}
	return DEFAULT_PUBLIC_LOCALE;
}
