import { expect, it } from 'vitest';
import { RESULT_CHANGES } from '../full-registry';
import { assessProject } from '../applicability';
import type { FeatureSnapshot } from '../model-features';
import type { SolveStamp } from '../solve-stamp';

const id = 'directional-stirrup-legs';
const frame = (concrete: boolean): FeatureSnapshot => ({
  analysisMode: 'pro', materials: [[1, concrete
    ? { id: 1, name: 'H25', fc: 25, fy: 25, e: 25000, nu: 0.2, rho: 25 }
    : { id: 1, name: 'steel', fy: 235, e: 200000, nu: 0.3, rho: 78.5 }]] as never,
  elements: [[1, { id: 1, type: 'frame', nodeI: 1, nodeJ: 2, materialId: 1, sectionId: 1 }]] as never,
  supports: [], loads: [], loadCases: [{ id: 1, type: 'D' }],
});

it('tells saved concrete projects to recheck, without repeating the notice after recomputation', () => {
  const entry = RESULT_CHANGES.changes.find(c => c.id === id)!;
  expect(entry).toBeDefined();
  const seen = (concrete: boolean, resultsVersion: number) => assessProject(frame(concrete),
    { resultsVersion, analyses: ['linear'] } as SolveStamp, 'pro').changes.map(c => c.id);
  expect(seen(true, entry.resultsVersion - 1)).toContain(id);
  expect(seen(true, entry.resultsVersion)).not.toContain(id);
  expect(seen(false, entry.resultsVersion - 1)).not.toContain(id);
});

it('provides the saved-project notice in all six locales and links the numerical write-up', () => {
  const entry = RESULT_CHANGES.changes.find(c => c.id === id)!;
  expect(entry.changelog.file).toBe('docs/results-changes/2026-11-directional-stirrup-legs.md');
  for (const locale of ['en', 'es', 'pt', 'de', 'fr', 'tr'] as const) {
    expect(entry.title[locale].trim()).not.toBe('');
    expect(entry.explanation[locale].trim()).not.toBe('');
  }
});

for (const [locale, safetyTerms] of [
  ['es', ['corte de vigas y muros', 'torsión nula', 'distribución de los estribos de columnas', 'jaulas distintas en los extremos', 'trabas horizontales adicionales no verificadas']],
  ['pt', ['cisalhamento de vigas e paredes', 'torção nula', 'distribuição dos estribos de pilares', 'gaiolas distintas nas extremidades', 'grampos horizontais adicionais não verificados']],
  ['de', ['Querkraft von Balken und Wänden', 'Torsion null', 'Verteilung der Stützenbügel', 'unterschiedliche Bewehrungskörbe an den Balkenenden', 'ungeprüften zusätzlichen horizontalen Querbügeln']],
  ['fr', ['cisaillement des poutres et des voiles', 'torsion nulle', 'répartition des cadres de poteaux', 'cages distinctes aux extrémités', 'épingles horizontales supplémentaires non vérifiées']],
  ['tr', ['Kiriş ve perdelerin kesmesi', 'burulma sıfır', 'kolon etriyelerinin dağılımı', 'kiriş uçlarındaki farklı kafesler', 'doğrulanmamış ilave yatay çirozlar']],
] as const) {
  it(`known wrong result: #2198 ${locale} retains every safety warning`, () => {
    const entry = RESULT_CHANGES.changes.find(c => c.id === id)!;
    for (const term of safetyTerms) expect(entry.explanation[locale]).toContain(term);
  });
}
it('known wrong result: #2198 German stirrup legs use Bügelschenkel', () => {
  const entry = RESULT_CHANGES.changes.find(c => c.id === id)!;
  expect(entry.title.de).toContain('Bügelschenkel');
  expect(entry.explanation.de).toContain('wirksamen Bügelschenkel');
  expect(entry.explanation.de).not.toContain('Schnitte');
  expect(entry.explanation.de).not.toContain('Bügelschnitte');
});

it('known wrong result: #2198 — directional design notices cannot excuse unrelated analysis values', async () => {
  const { declaresMove, judge } = await import('../../legacy-projects/legacy');
  const { fieldCovered } = await import('../../../../scripts/results-snapshot/applicability.mjs');
  const { default: quantities } = await import('virtual:result-change-quantities');
  const metadata = RESULT_CHANGES.changes.find(c => c.id === 'directional-stirrup-legs')!;
  const entry = { ...metadata, quantities: quantities[metadata.id] };
  for (const dimension of ['plane2D', 'space3D']) {
    const features = [dimension, 'members', 'concreteMembers', 'analysis:linear', 'analysis:pdelta', 'analysis:nonlinear'];
    for (const family of ['base', 'case[1]', 'combo[1]', 'envelope.maxAbs', 'pdelta.results', 'nonlinear.results']) {
      for (const quantity of ['displacements[n1].uz', 'elementForces[e1].nStart', 'reactions[n1].mz']) {
        const path = `${family}.${quantity}`;
        expect(fieldCovered(entry, path, features), path).toBe(false);
        expect(declaresMove(entry, path), path).toBe(false);
        if (['base', 'case[1]', 'combo[1]'].includes(family)) {
          const before = { 'solve.ok': true, [path]: 1 };
          expect(judge(path, before, { ...before, [path]: 2 }, [entry]).kind).toBe('unexplained');
          expect(judge(path, before, before, [entry]).kind).toBe('same');
        }
      }
    }
    expect(fieldCovered(entry, 'design.rc[e1].shearVu', features)).toBe(true);
    expect(fieldCovered(entry, 'design.rc[e1].shearVu', features.filter(f => f !== 'concreteMembers'))).toBe(false);
  }
});
