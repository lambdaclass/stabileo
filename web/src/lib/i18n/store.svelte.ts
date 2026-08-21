import es from './locales/es';
import en from './locales/en';
import pt from './locales/pt';
import de from './locales/de';
import fr from './locales/fr';
import it from './locales/it';
import tr from './locales/tr';
import hi from './locales/hi';
import ja from './locales/ja';
import ko from './locales/ko';
import ru from './locales/ru';
import zh from './locales/zh';
import ar from './locales/ar';
import id from './locales/id';
import steelEs from './locales/steel/es';
import steelEn from './locales/steel/en';
import steelPt from './locales/steel/pt';
import type { Translations } from './types';

/**
 * The shipped dictionaries.
 *
 * `steel/*` is folded in here rather than pasted into `es.ts` and `en.ts`. Those two files
 * are being edited heavily by PR #125 and PR #132 at the same time as this branch, and a
 * hundred keys inserted through the middle of them would be a hundred merge conflicts for
 * no benefit — a key is worth the same whichever module it arrives from. Fold them into the
 * main dictionaries once both PRs have landed; until then this costs nothing.
 *
 * Portuguese is folded in for the same reason the other two are, and is NOT optional the way
 * the remaining locales are: `OFFERED_LOCALES` is es/en/pt, and `pro-flow-coverage.test.ts`
 * requires every key a PRO surface renders to exist in all three. The metallic family is new
 * PRO surface, so leaving it to fall back would be exactly the silent English that gate was
 * written to stop. The other eleven locales are not offered in the picker and keep falling
 * back, which is what already happens for most namespaces outside `design.*`.
 */
const dicts: Record<string, Translations> = {
  es: { ...es, ...steelEs },
  en: { ...en, ...steelEn },
  pt: { ...pt, ...steelPt },
  de, fr, it, tr, hi, ja, ko, ru, zh, ar, id,
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

/** Every locale the app ships. Used by the locale-parity gate. */
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
// The application ships fourteen languages and keeps all of them. The public
// landing page deliberately offers only two, because only `en` and `es` have a
// complete `landing.*` dictionary — the other twelve are ~97 keys short each,
// so `t()`'s silent English fallback renders them as a half-translated page.
// Offering a language the marketing copy does not actually speak is worse than
// not offering it.
//
// Nothing here mutates the application's locale. A visitor whose browser is set
// to French reads the landing in English and still gets a French editor.
// ─────────────────────────────────────────────────────────────────────────────

export const PUBLIC_LOCALES = ['en', 'es'] as const;
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
