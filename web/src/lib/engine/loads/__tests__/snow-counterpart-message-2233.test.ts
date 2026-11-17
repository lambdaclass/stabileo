import { expect, it } from 'vitest';
import { expandCombinations } from '../combination-cases';
import { completeSnowPair } from './snow-pair-coverage-2233-fixture';
import { allDictFor } from '../../../i18n/locales/all';

for (const basis of [undefined, 'flatRoof'] as const) {
  const key = basis === 'flatRoof' ? 'snow.refused.flatRoofCase' : 'snow.refused.physicalCase';
  const spec = { id: 'S', label: 'S', refs: [], notes: [], terms: [{ symbol: 'S' as const, factor: 1, snowBasis: basis }] };
  const snow = completeSnowPair.filter(c => c.type === 'S');
  const incomplete = snow.filter(c => !(c.alternatives === 'B' && c.snowBasis === basis));
  const onlyOpposite = snow.filter(c => c.snowBasis !== basis);
  for (const [kind, cases] of [
    ['partial groups', incomplete],
    ['opposite basis only', onlyOpposite],
    ['ungrouped opposite only', onlyOpposite.slice(0, 1).map(({ alternatives, ...c }) => c)],
    ['mismatched groups', snow.map(c => c.snowBasis === basis ? { ...c, alternatives: `other-${c.alternatives}` } : c)],
  ] as const) {
    it(`known wrong result: #2233 ${key} identifies the requested counterpart for ${kind}`, () => {
      let refusal: unknown;
      try { expandCombinations([spec], cases); } catch (error) { refusal = error; }
      expect(refusal).toMatchObject({ key, params: undefined, message: key });
    });
  }

  it(`#2233 complete ${basis ?? 'physical'} coverage still returns the selected cases`, () => {
    expect(expandCombinations([spec], snow)[0]!.factors)
      .toEqual(snow.filter(c => c.snowBasis === basis).map(c => ({ caseId: c.id, factor: 1 })));
    const ungrouped = snow.filter(c => c.alternatives === 'A').map(({ alternatives, ...c }) => c);
    expect(expandCombinations([spec], ungrouped)[0]!.factors)
      .toEqual(ungrouped.filter(c => c.snowBasis === basis).map(c => ({ caseId: c.id, factor: 1 })));
    expect(expandCombinations([{ ...spec, terms: [{ ...spec.terms[0]!, factor: 0 }] }], incomplete))
      .toEqual([{ name: 'S', factors: [], purpose: 'strength', specId: 'S' }]);
  });
}

const translations = {
  en: 'This combination requires a separate physical snow case. Regenerate snow loads before generating combinations.',
  es: 'Esta combinación requiere un caso separado de nieve física. Regenere las cargas de nieve antes de generar combinaciones.',
  pt: 'Esta combinação exige um caso separado de neve física. Gere novamente as cargas de neve antes das combinações.',
  de: 'Diese Kombination benötigt einen eigenen physikalischen Schneelastfall. Schneelasten vor den Kombinationen neu erzeugen.',
  fr: 'Cette combinaison exige un cas distinct de neige physique. Régénérez les charges de neige avant les combinaisons.',
  tr: 'Bu birleşim ayrı bir fiziksel kar yükü durumu gerektirir. Birleşimleri oluşturmadan önce kar yüklerini yeniden üretin.',
  hu: 'Ehhez a kombinációhoz külön fizikai hótehereset szükséges. A kombinációk létrehozása előtt generálja újra a hóterheket.',
};

for (const [locale, message] of Object.entries(translations)) {
  it(`known wrong result: #2233 ${locale} distinguishes physical from flat-roof snow refusals`, () => {
    const dict = allDictFor(locale);
    expect(dict['snow.refused.physicalCase']).toBe(message);
    expect(dict['snow.refused.flatRoofCase']).toBeTruthy();
    expect(dict['snow.refused.flatRoofCase']).not.toBe(message);
  });
}
