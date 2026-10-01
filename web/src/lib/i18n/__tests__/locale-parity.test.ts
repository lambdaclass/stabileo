/**
 * Key-parity guard for the locale dictionaries.
 *
 * `t()` (see ../store.svelte.ts) falls back to `dicts.en` whenever the active
 * locale's dict is missing a key. That fallback is silent — a locale can be
 * missing an entire feature's worth of keys and nothing will error, it will
 * just quietly render English to speakers of that locale. This has already
 * happened twice (see PR78's `design.*` gap, where en/es got ~190 new keys
 * and the other 12 locales got none). This test exists so it can't happen a
 * third time without a test failure calling it out.
 *
 * Scope: `design.*` keys only, for now.
 *
 * A full `Object.keys(en).every(...)` parity check was attempted while writing
 * this test and turned up ~790 pre-existing missing keys (mostly `landing.*`
 * marketing copy) in EVERY non-en/es locale, plus 31 pre-existing missing
 * `landing.*` keys in es — drift that long predates this PR and is unrelated
 * to the RC design surface. Asserting full parity today would fail on that
 * inherited debt rather than on anything this change touched, so the check
 * below is deliberately scoped to the `design.*` namespace, which this PR
 * fully repaired (0 missing / 0 extra across all 14 dicts).
 *
 * Full key parity for es, en and pt is checked further down; the other locales
 * still carry that older debt.
 */
import { describe, it, expect } from 'vitest';
import en from '../locales/en';
import es from '../locales/es';
import ar from '../locales/ar';
import de from '../locales/de';
import fr from '../locales/fr';
import hi from '../locales/hi';
import id from '../locales/id';
import it_ from '../locales/it';
import ja from '../locales/ja';
import ko from '../locales/ko';
import pt from '../locales/pt';
import ru from '../locales/ru';
import tr from '../locales/tr';
import zh from '../locales/zh';
import type { Translations } from '../types';

const locales: Record<string, Translations> = {
	es,
	ar,
	de,
	fr,
	hi,
	id,
	it: it_,
	ja,
	ko,
	pt,
	ru,
	tr,
	zh
};

function designKeys(dict: Translations): string[] {
	return Object.keys(dict)
		.filter((k) => k.startsWith('design.'))
		.sort();
}

const enDesignKeys = designKeys(en);

describe('locale design.* key parity', () => {
	it('en has the expected design.* surface (sanity check for this test itself)', () => {
		// Guards against the reference set silently shrinking to zero (which would
		// make every other assertion in this file vacuously true).
		expect(enDesignKeys.length).toBeGreaterThan(100);
	});

	for (const [code, dict] of Object.entries(locales)) {
		it(`${code} has exactly the same design.* keys as en (no missing, no extra)`, () => {
			const localeKeys = new Set(designKeys(dict));
			const enKeys = new Set(enDesignKeys);

			const missing = enDesignKeys.filter((k) => !localeKeys.has(k));
			const extra = [...localeKeys].filter((k) => !enKeys.has(k)).sort();

			expect({ missing, extra }).toEqual({ missing: [], extra: [] });
		});
	}

	for (const [code, dict] of Object.entries(locales)) {
		it(`${code} design.* values preserve every {placeholder} token from en`, () => {
			const tokenIssues: Array<{ key: string; expected: string[]; got: string[] }> = [];
			for (const key of enDesignKeys) {
				const enTokens = [...en[key].matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
				const localeValue = dict[key];
				if (localeValue === undefined) continue; // already reported by the parity test above
				const localeTokens = [...localeValue.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
				if (JSON.stringify(enTokens) !== JSON.stringify(localeTokens)) {
					tokenIssues.push({ key, expected: enTokens, got: localeTokens });
				}
			}
			expect(tokenIssues).toEqual([]);
		});
	}
});

/*
 * es, en and pt: every key, not only design.*. Portuguese had 787 keys missing, most of the CAD
 * wizard, the RC workspace, the footing panels and the PRO report, and all of them rendered in
 * English to a Portuguese reader. The other 11 locales still carry the older debt and stay out.
 *
 * There is no allow-list: the Portuguese keys the Basic PR "draw members point to point" was to
 * bring have arrived with it.
 */
import steelEn from '../locales/steel/en';
import steelEs from '../locales/steel/es';
import steelPt from '../locales/steel/pt';

describe('locale full key parity: es, en, pt', () => {
	const main = { en, pt } as Record<string, Translations>;
	const steel = { en: steelEn, pt: steelPt } as Record<string, Translations>;

	for (const code of ['en', 'pt']) {
		it(`${code} has every es key, and none es lacks`, () => {
			const missing = [
				...Object.keys(es).filter((k) => !(k in main[code])),
				...Object.keys(steelEs).filter((k) => !(k in steel[code])),
			];
			const extra = [
				...Object.keys(main[code]).filter((k) => !(k in es)),
				...Object.keys(steel[code]).filter((k) => !(k in steelEs)),
			];
			expect({ missing, extra }).toEqual({ missing: [], extra: [] });
		});
	}

});
