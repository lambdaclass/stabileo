import { afterAll, describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import BucklingCertificate from '../advanced/BucklingCertificate.svelte';
import { setLocale } from '../../lib/i18n';
import { ensureLocale } from '../../lib/i18n/store.svelte';
import { formatSeparated } from '../../lib/utils/certificate-format';
import type { BucklingCertificate as Certificate } from '../../lib/engine/wasm-solver';

afterAll(() => setLocale('en'));

const reason = 'computed load factor 4691.397553909858 exceeds certified upper bound 4688.92209616787';
const refused: Certificate = {
  status: 'uncertified',
  reason,
  refusal: { code: 'computedAboveUpperBound', lambdaComputed: 4691.397553909858, lambdaUpper: 4688.92209616787 },
};

describe('a buckling factor above its certified upper bound', () => {
  it.each([
    ['en', 'λ_cr not certified: computed load factor 4691.39 exceeds certified upper bound 4688.93'],
    ['es', 'λ_cr no certificado: el factor de carga calculado 4691.39 supera la cota superior certificada 4688.93'],
    ['pt', 'λ_cr não certificado: o fator de carga calculado 4691.39 excede o limite superior certificado 4688.93'],
    ['de', 'λ_cr nicht zertifiziert: der berechnete Lastfaktor 4691.39 überschreitet die zertifizierte obere Schranke 4688.93'],
    ['fr', 'λ_cr non certifié\u00a0: le facteur de charge calculé 4691.39 dépasse la borne supérieure certifiée 4688.93'],
    ['tr', 'λ_cr sertifikalı değil: hesaplanan yük katsayısı 4691.39, sertifikalı üst sınır 4688.93 değerini aşıyor'],
  ])('is refused in %s by its code, not the English reason', async (locale, expected) => {
    await ensureLocale(locale);
    setLocale(locale);
    const html = render(BucklingCertificate, { props: { certificate: refused } }).body;
    expect(html).toContain(expected);
    if (locale !== 'en') expect(html).not.toContain(reason);
  });

  it('shows the engine reason for a refusal without a code', () => {
    setLocale('es');
    const html = render(BucklingCertificate, { props: { certificate: { status: 'uncertified', reason: 'dimension mismatch' } } }).body;
    expect(html).toContain('λ_cr no certificado: dimension mismatch');
  });
});

describe('formatSeparated', () => {
  it('rounds the exceeding value down and the bound up, with digits enough to keep them apart', () => {
    expect(formatSeparated(4691.397553909858, 4688.92209616787)).toEqual(['4691.39', '4688.93']);
    const [above, below] = formatSeparated(2 + 1e-12, 2);
    expect(Number(above)).toBeGreaterThan(Number(below));
    expect(Number(above)).toBeLessThanOrEqual(2 + 1e-12);
    expect(Number(below)).toBeGreaterThanOrEqual(2);
  });
});
