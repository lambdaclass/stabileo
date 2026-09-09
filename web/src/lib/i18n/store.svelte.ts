import es from './locales/es';
import en from './locales/en';
import pt from './locales/pt';
import steelEs from './locales/steel/es';
import steelEn from './locales/steel/en';
import steelPt from './locales/steel/pt';
import type { Translations } from './types';

/**
 * The dictionaries the application actually speaks.
 *
 * ── Why only three ──
 *
 * This used to hold all fourteen on disk, so that re-enabling one was a single
 * edit. Measured on the bundle, the eleven the app refuses to switch to came
 * to 2.0 MB — the largest single item in it, ahead of the solver and ahead of
 * Three.js — shipped to every reader of a blog page written in three
 * languages. They were unreachable, not just unused: setLocale rejects an
 * unoffered code, detectBrowserLocale only returns offered ones, and no
 * production caller passes a locale to tAt.
 *
 * The other eleven now live in ./locales/all.ts, which only the gates import,
 * so the translation work is still kept and still checked. Re-enabling one is
 * still a single edit: add it here and to OFFERED_LOCALES.
 *
 * ── Why the steel spread stays ──
 *
 * `steel/*` arrived from #135 while this branch was open, and the two changes
 * rewrote the same object. The merge keeps BOTH halves, and the reason is
 * worth recording because "take the shorter one" is the obvious mistake here:
 * the metallic keys exist ONLY in `locales/steel/*` — `es.ts` has zero of
 * them — so dropping the spread does not fall back to English, it renders the
 * raw key. `pro-flow-coverage.test.ts` would catch it, but by then it reads as
 * a puzzling red rather than as this decision.
 *
 * Folding steel into es/en/pt and nothing else is #135's rule, unchanged: they
 * are the offered three, and a PRO surface must speak all of them.
 */
const dicts: Record<string, Translations> = {
  es: { ...es, ...steelEs },
  en: { ...en, ...steelEn },
  pt: { ...pt, ...steelPt },
};

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

/**
 * The locales the app OFFERS, as opposed to the ones it has files for.
 *
 * `dicts` still carries a dozen more, and they are kept rather than deleted:
 * they hold real translation work, `t()` falls back to English for any key they
 * lack, and re-enabling one is a single edit here. What they are not is
 * complete — the parity test that guards `design.*` documents roughly 790
 * missing keys in each — so offering them means offering a half-English UI
 * under a flag that promises otherwise.
 *
 * Three fully maintained languages beat fourteen partial ones.
 */
export const OFFERED_LOCALES = ['es', 'en', 'pt'] as const;
export type OfferedLocale = (typeof OFFERED_LOCALES)[number];

/** Whether a bare language code is one the app offers. */
export function isOfferedLocale(code: string): code is OfferedLocale {
	return (OFFERED_LOCALES as readonly string[]).includes(code);
}

/**
 * The browser's preference, narrowed to what is offered.
 *
 * Matched against what is OFFERED, not against what exists, and on the BARE code so that
 * `es-AR`, `pt-BR` and `en-GB` all land where they should. Anything else — `fr`, `de`, `ja` —
 * falls through to English, which is the honest answer rather than a flag the app cannot keep.
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
		// A stored locale that is no longer offered — someone who picked German before this
		// narrowed — falls through to detection rather than being honoured, which would
		// resurrect exactly the half-translated state this exists to remove. The selector would
		// also have no option to show for it, which is the invalid state to avoid.
		if (stored && isOfferedLocale(stored)) return stored;
	}
	// Otherwise auto-detect from browser and clear any stale stored value
	const detected = detectBrowserLocale();
	localStorage.setItem('stabileo-lang', detected);
	return detected;
}

let _locale = $state<string>(getInitialLocale());

export function t(key: string): string {
	return tAt(key, _locale);
}

/**
 * Translate at an explicit locale, without touching the active one.
 *
 * Report and export writers need this: a user may want a Spanish PDF while reading an
 * English UI, and flipping `_locale` to achieve that would persist to localStorage and
 * re-render the whole app mid-export.
 */
export function tAt(key: string, locale: string): string {
	const dict = dicts[locale] ?? dicts.en;
	return (dict as any)[key] ?? (dicts.en as any)[key] ?? key;
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
	if (hasLocalStorage()) {
		localStorage.setItem('stabileo-lang', loc);
		localStorage.setItem('stabileo-lang-manual', '1');
	}
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

/** Returns true if `name` matches any locale's default structure name. */
export function isDefaultName(name: string): boolean {
	return allTranslations('tabBar.newStructure').has(name);
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

// ─────────────────────────────────────────────────────────────────────────────
// Public landing locales
//
// The landing offers only the locales whose `landing.*` dictionary is
// complete, because `t()` falls back to English silently: a locale that is
// ninety keys short does not look broken, it looks like a page that switches
// to English halfway down. Offering a language the marketing copy does not
// actually speak is worse than not offering it.
//
// Portuguese joined on 2026-08-12, once all 321 landing keys were written.
// `landing-i18n-parity.test.ts` is what keeps this list and that promise in
// step — it fails if a locale here is missing copy, quotes different figures,
// names a different standard, or reads as a truncation of the English.
//
// NOTE (2026-08-19): this list is now identical to `OFFERED_LOCALES` above,
// which arrived from main when the application itself narrowed to three
// languages. They are not merged here on purpose: they answer different
// questions — one gates marketing copy, the other gates the whole UI — and
// collapsing them is the i18n workstream's call, not a side effect of a
// landing change. If they are ever meant to be one thing, this is the comment
// that should have said so.
// ─────────────────────────────────────────────────────────────────────────────

export const PUBLIC_LOCALES = ['en', 'es', 'pt'] as const;
export type PublicLocale = (typeof PUBLIC_LOCALES)[number];

function isPublicLocale(loc: string): loc is PublicLocale {
	return (PUBLIC_LOCALES as readonly string[]).includes(loc);
}

/** The active locale if the landing speaks it, English otherwise. */
function publicLocale(): PublicLocale {
	return isPublicLocale(_locale) ? _locale : 'en';
}

/** `t()` constrained to the landing's public locales. */
export function tPublic(key: string): string {
	const dict = dicts[publicLocale()];
	return (dict as any)[key] ?? (dicts.en as any)[key] ?? key;
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
