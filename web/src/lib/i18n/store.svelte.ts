// Only the public pages' entries at first (vite.config.ts, `publicI18nPlugin`): the landing and
// the blog load this module, and the whole dictionaries were most of what they downloaded. The
// application registers the rest when it loads (`full-dictionaries.ts`), before it renders.
import {
  es as publicEs, en as publicEn, pt as publicPt,
  de as publicDe, fr as publicFr, tr as publicTr,
} from 'virtual:public-i18n';
import type { Translations } from './types';
import { OFFERED_LOCALES, PUBLIC_LOCALES, type Locale } from './offered';

// A key a language lacks renders in English. The steel keys live only in `locales/steel/*`,
// so a bundled dictionary registered without its steel half shows raw keys instead.
const PUBLIC_DICTS: Record<Locale, Translations> = {
  es: publicEs, en: publicEn, pt: publicPt, de: publicDe, fr: publicFr, tr: publicTr,
};
const dicts: Record<string, Translations> = Object.fromEntries(
  OFFERED_LOCALES.map((l) => [l, { ...PUBLIC_DICTS[l] }]),
);

const LAZY_LOCALES: Record<string, () => Promise<{ default: Translations }>> = {
  de: () => import('./locales/full/de'),
  fr: () => import('./locales/full/fr'),
  tr: () => import('./locales/full/tr'),
};
const pendingLoads = new Map<string, Promise<void>>();

// Read by every lookup: a dictionary that arrives late re-renders what was drawn in English.
let _revision = $state(0);

let appDictionaries = false;

/** Register a lazy public feature without enabling application locale loading. */
export function registerFeatureDictionaries(feature: Record<string, Translations>): void {
  for (const loc in feature) Object.assign(dicts[loc], feature[loc]);
  _revision++;
}

/** The whole dictionaries (main, steel, steps), registered once by `full-dictionaries.ts`. */
export function registerDictionaries(full: Record<'es' | 'en' | 'pt', Translations>): void {
  for (const loc of ['es', 'en', 'pt'] as const) Object.assign(dicts[loc], full[loc]);
  appDictionaries = true;
}

/** Resolves once `loc`'s whole dictionary is registered, or has failed to load and left English; at once for the bundled languages. */
export function ensureLocale(loc: string): Promise<void> {
  const load = LAZY_LOCALES[loc];
  if (!load || !isOfferedLocale(loc)) return Promise.resolve();
  let pending = pendingLoads.get(loc);
  if (!pending) {
    pending = load().then(
      (m) => {
        Object.assign(dicts[loc], m.default);
        _revision++;
      },
      (err) => {
        pendingLoads.delete(loc);
        console.warn(`i18n: the ${loc} dictionary did not load; showing English until it does`, err);
      },
    );
    pendingLoads.set(loc, pending);
  }
  return pending;
}

/** Safe localStorage check — vitest defines localStorage but without working methods. */
function hasLocalStorage(): boolean {
	try {
		return typeof localStorage !== 'undefined' && typeof localStorage.getItem === 'function';
	} catch { return false; }
}

// Migrate old storage keys
if (hasLocalStorage()) {
	for (const key of ['lang', 'lang-manual']) {
		const old = localStorage.getItem(`dedaliano-${key}`);
		if (old !== null && localStorage.getItem(`stabileo-${key}`) === null) {
			localStorage.setItem(`stabileo-${key}`, old);
			localStorage.removeItem(`dedaliano-${key}`);
		}
	}
}

export { OFFERED_LOCALES, PUBLIC_LOCALES };
export type OfferedLocale = Locale;

/** Whether a bare language code is one the app offers. */
export function isOfferedLocale(code: string): code is OfferedLocale {
	return (OFFERED_LOCALES as readonly string[]).includes(code);
}

/**
 * The browser's preference, narrowed to what is offered.
 *
 * Matched against what is OFFERED, not against what exists, and on the BARE code so that
 * `es-AR`, `pt-BR`, `de-AT`, `fr-CA` and `tr-TR` all land where they should. Anything else
 * (`ja`, `it`) falls through to English.
 */
function detectBrowserLocale(): OfferedLocale {
	if (typeof navigator === 'undefined') return 'en';
	for (const lang of navigator.languages ?? [navigator.language]) {
		if (!lang) continue;
		const code = lang.split('-')[0].toLowerCase();
		if (isOfferedLocale(code)) return code;
	}
	return 'en';
}

function getInitialLocale(): string {
	if (!hasLocalStorage()) return detectBrowserLocale();
	// Only use stored locale if user explicitly chose it (flag set by setLocale)
	if (localStorage.getItem('stabileo-lang-manual') === '1') {
		const stored = localStorage.getItem('stabileo-lang');
		// A stored locale that is not offered (an Italian chosen when the picker listed fourteen)
		// falls through to detection rather than being honoured: the selector would have no
		// option to show for it, which is the invalid state to avoid.
		if (stored && isOfferedLocale(stored)) return stored;
	}
	// Otherwise auto-detect from browser and clear any stale stored value
	const detected = detectBrowserLocale();
	localStorage.setItem('stabileo-lang', detected);
	return detected;
}

let _locale = $state<string>(getInitialLocale());

export function t(key: string): string {
	return lookup(key, _locale);
}

function lookup(key: string, locale: string): string {
	void _revision;
	const dict = dicts[locale] ?? dicts.en;
	return (dict as any)[key] ?? (dicts.en as any)[key] ?? key;
}

/**
 * Translate at an explicit locale, without touching the active one.
 *
 * Report and export writers need this: a user may want a Spanish PDF while reading an
 * English UI, and flipping `_locale` to achieve that would persist to localStorage and
 * re-render the whole app mid-export.
 */
export function tAt(key: string, locale: string): string {
	if (locale !== _locale && appDictionaries && !pendingLoads.has(locale)) void ensureLocale(locale);
	return lookup(key, locale);
}

/**
 * Every locale the app ships — which is now exactly what it offers.
 *
 * For the full set on disk, including the ones not offered, use
 * `allShippedLocales()` from ./locales/all.ts. That module is gate-only: see
 * the note there about what importing it costs.
 */
export function shippedLocales(): string[] {
	return Object.keys(dicts);
}

/** A locale's raw dictionary. Gate use only. */
export function dictFor(locale: string): Record<string, string> {
	return (dicts[locale] ?? {}) as Record<string, string>;
}

/**
 * Translate with `{placeholder}` interpolation.
 *
 * `t()` has no parameter support, so PR15's design messages (which carry element
 * ids, utilizations and dimensions) go through this. Missing params are left as the
 * literal placeholder so an omission is visible rather than silently blank.
 */
export function tp(key: string, params?: Record<string, string | number>): string {
	const raw = t(key);
	if (!params) return raw;
	return raw.replace(/\{(\w+)\}/g, (m, name) => {
		const v = params[name];
		return v === undefined || v === null ? m : String(v);
	});
}

/**
 * Switch language, and persist that the choice was the user's.
 *
 * A code that is not offered is REFUSED rather than stored. The picker's value is bound to
 * `i18n.locale`, and a `<select>` whose value matches none of its options renders blank — so
 * accepting `de` here would leave the control showing nothing, in a language nobody chose, and
 * would persist that state across reloads. Refusing keeps the app on the language it is already
 * speaking, which is the only state that is both valid and true.
 *
 * This guard is the one deliberate difference from `be1c63b4`, which narrowed detection and the
 * picker but left this entry point open. Nothing in the app calls it with an unoffered code
 * today; it is here so that nothing can.
 */
export function setLocale(loc: string) {
	if (!isOfferedLocale(loc)) return;
	_locale = loc;
	// A public page needs only its own entries; the whole dictionary is the application's.
	if (appDictionaries) void ensureLocale(loc);
	if (hasLocalStorage()) {
		localStorage.setItem('stabileo-lang', loc);
		localStorage.setItem('stabileo-lang-manual', '1');
	}
}

/** A label set inside a sentence: lowercased by the language's own rules, except in German, whose nouns keep their capital. */
export function inSentence(label: string, locale: string = _locale): string {
	return locale === 'de' ? label : label.toLocaleLowerCase(locale);
}

/** A phrase that may open with a lowercase label ("{what} çiz"), with its first letter raised by the language's own rules. */
export function capitalized(text: string, locale: string = _locale): string {
	return text.charAt(0).toLocaleUpperCase(locale) + text.slice(1);
}

/** Set of all translations for a given key (across every locale). */
function allTranslations(key: string): Set<string> {
	const s = new Set<string>();
	for (const dict of Object.values(dicts)) {
		const v = (dict as any)[key];
		if (v) s.add(v);
	}
	return s;
}

/** Returns true if `name` matches any locale's default structure name, or the untranslated key an older save may carry. */
export function isDefaultName(name: string): boolean {
	return name === 'tabBar.newStructure' || allTranslations('tabBar.newStructure').has(name);
}

export const i18n = {
	get locale() {
		return _locale;
	},
	set locale(v: string) {
		setLocale(v);
	},
	t,
	setLocale
};

export type PublicLocale = Locale;

function isPublicLocale(loc: string): loc is PublicLocale {
	return (PUBLIC_LOCALES as readonly string[]).includes(loc);
}

/** The active locale if the landing speaks it, English otherwise. */
function publicLocale(): PublicLocale {
	return isPublicLocale(_locale) ? _locale : 'en';
}

/** `t()` constrained to the landing's public locales. */
export function tPublic(key: string): string {
	return lookup(key, publicLocale());
}

/** `tPublic()` with `{placeholder}` interpolation, for the blog's reading time. */
export function tpPublic(key: string, params?: Record<string, string | number>): string {
	const raw = tPublic(key);
	if (!params) return raw;
	return raw.replace(/\{(\w+)\}/g, (m, name) => {
		const v = params[name];
		return v === undefined || v === null ? m : String(v);
	});
}

/** Reactive read-only view of the locale the landing is rendering in. */
export const publicI18n = {
	get locale(): PublicLocale {
		return publicLocale();
	}
};

/**
 * Set the locale from the landing's selector. This is a real, persisted, manual
 * choice and it applies to the whole application, exactly as the app's own
 * language selector does.
 */
export function setPublicLocale(loc: PublicLocale) {
	setLocale(loc);
}
