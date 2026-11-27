import { expect, it } from 'vitest';
import { findPost } from '../../blog';
import { allDictFor } from '../locales/all';

it.skip.each([
  ["it", "learn-structural-analysis-step-by-step", "cinese e olandese"],
  ["it", "safety-advisories", "1,2D + 1,6W, dopo una modifica"],
  ["it", "safety-advisories", "0,9 D + 1,6 H e 1,2 D + 1,6 H"],
  ["it", "research-tools-and-checking-our-tests", "1,83 kN"],
  ["nl", "research-tools-and-checking-our-tests", "convergentie van de tweede orde"],
  ["nl", "safety-advisories", "in 0.5.0 ingedamd"],
  ["nl", "learn-structural-analysis-step-by-step", "\"Tweede orde en knik\",\"4\",\"P-Δ met φ-functies; P-Δ met een geometrische matrix (consistent of koordematrix P/L)"],
  ["nl", "end-to-end-certificates", "de regel “End-to-end gecontroleerd”"],
  ["nl", "stabileo-0-6-0", "ook als hernummeren, rotatie en eenhedenconversie dezelfde respons geven"],
  ["nl", "stabileo-0-6-1", "ook als hernummeren, rotatie en eenhedenconversie dezelfde respons geven"],
  ["nl", "stabileo-0-6-1", "Vergelijk de berekende ontwerpsnedekrachten en -momenten"],
] as const)('known wrong result: #2613 — %s article %s includes %s', (locale, slug, expected) => {
  expect(JSON.stringify(findPost(slug)?.i18n[locale]?.blocks)).toContain(expected);
});

it.skip.each(['end-to-end-certificates', 'how-stabileo-checks-its-results'])(
  'known wrong result: #2613 — %s identifies both bounds shown in the certificate figure', slug => {
    const figure = findPost(slug)?.i18n.nl?.blocks.find(block => block.k === 'img' && block.base === 'blog/certificate');
    expect(figure?.k).toBe('img');
    const nl = allDictFor('nl');
    const alt = figure?.k === 'img' ? figure.alt : '';
    expect(alt).toContain(nl['resultChecks.title']);
    expect(alt).toContain(nl['certificate.certifiedAbs'].replace('{abs}', '3,41e-16'));
    expect(alt).toContain(nl['certificate.e2eCertified'].replace('{abs}', '3,68e-15'));
  },
);

it.skip.each([
  ['it', 'stabileo-0-3-0', ['-56,67', '-41,67', '176,47', '424,3', '5,18', '4,34', '35,0']],
  ['nl', 'the-determinism-boundary', ['80,8', '1,10', '54,2', '0,43']],
  ['nl', 'torsion-bredt-saint-venant', ['11,08', '315,79']],
  ['nl', 'verificacion-flexion-cirsoc-201', ['2,6620', '3,3333']],
] as const)('known wrong result: #2613 — %s results in %s use unambiguous decimal commas', (locale, slug, values) => {
  const blocks = findPost(slug)!.i18n[locale]!.blocks;
  const cells = blocks.flatMap(block => block.k === 'table' ? block.rows.flat() : []);
  for (const value of values) expect(cells).toContain(value);
  if (slug === 'the-determinism-boundary') {
    expect(blocks.some(block => block.k === 'img' && block.caption?.includes('80,8 kN·m'))).toBe(true);
  }
  if (slug === 'verificacion-flexion-cirsoc-201') {
    expect(blocks.some(block => block.k === 'p' && block.t.includes('φ = 0,90'))).toBe(true);
  }
});
