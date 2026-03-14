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
import type { Translations } from './types';

const dicts: Record<string, Translations> = { es, en, pt, de, fr, it, tr, hi, ja, ko, ru, zh, ar, id };

// Migrate old storage keys
if (typeof localStorage !== 'undefined') {
	for (const key of ['lang', 'lang-manual']) {
		const old = localStorage.getItem(`dedaliano-${key}`);
		if (old !== null && localStorage.getItem(`stabileo-${key}`) === null) {
			localStorage.setItem(`stabileo-${key}`, old);
			localStorage.removeItem(`dedaliano-${key}`);
		}
	}
}

function detectBrowserLocale(): string {
	if (typeof navigator === 'undefined') return 'en';
	for (const lang of navigator.languages ?? [navigator.language]) {
		const code = lang.split('-')[0].toLowerCase();
		if (code in dicts) return code;
	}
	return 'en';
}

function getInitialLocale(): string {
	if (typeof localStorage === 'undefined') return detectBrowserLocale();
	// Only use stored locale if user explicitly chose it (flag set by setLocale)
	if (localStorage.getItem('stabileo-lang-manual') === '1') {
		const stored = localStorage.getItem('stabileo-lang');
		if (stored && stored in dicts) return stored;
	}
	// Otherwise auto-detect from browser and clear any stale stored value
	const detected = detectBrowserLocale();
	localStorage.setItem('stabileo-lang', detected);
	return detected;
}

let _locale = $state<string>(getInitialLocale());

export function t(key: string): string {
	const dict = dicts[_locale] ?? dicts.en;
	return (dict as any)[key] ?? (dicts.en as any)[key] ?? key;
}

export function setLocale(loc: string) {
	_locale = loc;
	if (typeof localStorage !== 'undefined') {
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
