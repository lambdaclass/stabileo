import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { checkLabel } from '../../../components/research/grossman2026/check-labels';
import { exampleStrings } from '../../../components/examples/strings';
import { findPost } from '../../blog';
import { readRegistry } from '../../../../scripts/result-changes/registry.mjs';
import { allDictFor } from '../locales/all';

const dictionary = allDictFor('it');
const notices = readRegistry().changes;
const release = (version: string) => readFileSync(new URL(`../../../../../docs/releases/v${version}.it.md`, import.meta.url), 'utf8');

it('known wrong result: #2595 — 0.4.0 separates coincident CIRSOC H.1 actions from partial EC3 coverage', () => {
  const limitations = release('0.4.0').split('## 6. Limiti noti')[1].split('##')[0];
  expect(limitations).toContain('CIRSOC 301 H.1');
  expect(limitations).toMatch(/EC3 §6\.3\.3[^.]*parziale/);
});

it.each(Object.keys(exampleStrings))('known wrong result: #2595 — %s describes the example’s 2025 tie spacing', locale => {
  expect(exampleStrings[locale]['rc-column.about']).toMatch(/16[^.。]*48/);
});

it.each([
  ['strip-bias', 'effetto di scala'],
  ['fig5-periodic', 'celle periodiche e strisce'],
])('known wrong result: #2595 — Grossman check %s names the measured quantity', (id, expected) => {
  expect(checkLabel({ id, name: id }, 'it')).toContain(expected);
});

it('known wrong result: #2595 — advisory release ranges agree with the rows on either side', () => {
  const blocks = findPost('safety-advisories')!.i18n.it!.blocks;
  const note = blocks.find(block => block.k === 'note')!.t;
  const rows = blocks.flatMap(block => block.k === 'table' ? block.rows : []);
  for (const [first, last, version] of [['001', '004', '0.2.0'], ['005', '020', '0.3.0']]) {
    expect(note).toContain(`da SA-2026-${first} a ${last} nella versione ${version}`);
    expect(rows.find(row => row[0] === 'SA-2026-' + last)?.[3]).toBe('Risolto nella ' + version);
    expect(rows.find(row => row[0] === 'SA-2026-' + first)?.[3]).toMatch(/^Risolto/);
  }
});

it('known wrong result: #2595 — result change 79 names the upwind snow transport length in every publication', () => {
  const notice = notices.find(row => row.id === 'snow-roof-connectivity')!;
  expect(notice.title.it).toContain('distanza di trasporto della neve');
  expect(notice.explanation.it).toContain('sopravento');
  expect(release('0.6.1')).toContain(notice.title.it);
  expect(JSON.stringify(findPost('stabileo-0-6-1')!.i18n.it!.blocks)).toContain(notice.title.it);
});

it('known wrong result: #2595 — the saved-model notice identifies a restraint and the recovery action', () => {
  const text = notices.find(row => row.id === 'constraint-cut-plane')!.explanation.it;
  expect(text).toContain('vincolo alla traslazione');
  expect(text).toContain('vincolo fuori piano');
  expect(text).toContain('Ricavalo di nuovo dal modello 3D, oppure calcola in 3D');
});

it.each([
  ['ctxHelp.influenceLine.step1', 'Rz, Rx, My'],
  ['ctxHelp.influenceLine.step1', 'uz, ux, θ'],
  ['ctxHelp.influenceLine.step2', 'M, V, N'],
  ['float.rollerGlobalLabel', 'Z verticale'],
  ['svc.unstableAllRollersY', 'in Z'],
  ['float.nodePlaneXZ', 'XZ (frontale)'],
  ['float.nodePlaneXY', 'XY (suolo)'],
  ['float.loadMomentZ', 'My'],
  ['float.loadMomentX3d', 'Momento in X'],
])('known wrong result: #2595 — model coordinate vocabulary for %s, %s', (key, expected) => {
  expect(dictionary[key]).toContain(expected);
  if (key === 'float.loadMomentX3d') expect(dictionary[key]).toBe(expected);
});

for (const locale of ['en', 'es', 'pt', 'de', 'fr', 'tr', 'hu', 'it', 'zh'] as const) {
  const dict = allDictFor(locale);
  it.each([
    ['c301.d.anHoles', 'n·dh·t'],
    ['c301.e.e4Geometry', '{ro2} × 100 mm²'],
  ])(`known wrong result: #2595 — ${locale} shows the supplied quantity in %s`, (key, expression) => {
    expect(dict[key]).toContain(expression);
  });
  it(`known wrong result: #2595 — ${locale} gives numeric moduli for every web and identifies both flanges in the F.4 calculation`, () => {
    const comma = locale === 'zh' ? '，' : ', ';
    expect(dict['c301.f.moduli']).toBe(`  Zx = {Zx} mm³${comma}Sx = {Sx} mm³`);
    expect(dict['c301.f.f4Rpc']).toContain(`Sxt = Sxc = Sx${comma}Myc = Fy·Sxc = {Myc} kN·m`);
  });
  it(`known wrong result: #2595 — ${locale} reports the governing F.4 state without a general flange exemption`, () => {
    expect(dict['c301.f.governsF4']).toContain('{name}');
    expect(dict['c301.f.governsF4']).not.toContain('Sxt = Sxc');
  });
}

it.each([
  ['en', 'on the safe side'], ['es', 'del lado seguro'], ['pt', 'a favor da segurança'],
  ['de', 'auf der sicheren Seite'], ['fr', 'du côté de la sécurité'], ['tr', 'güvenli tarafta'],
  ['hu', 'a biztonság javára'], ['it', 'a favore di sicurezza'], ['zh', '偏安全'],
] as const)('known wrong result: #2595 — %s qualifies the Case 17 approximation', (locale, claim) => {
  const text = allDictFor(locale)['steel.b41.c17'];
  expect(text).toContain('hc/hp');
  expect(text).not.toContain(claim);
});

it('known wrong result: #2595 — the DXF release example gives both bending moments in kN·m', () => {
  const paragraph = release('0.4.0').split('**Il DXF PRO')[1].split('\n\n')[0].replace(/\s+/g, ' ');
  expect(paragraph).toMatch(/momenti (?:flettenti )?di estremità/);
  expect(paragraph).toContain('320,59 kN·m');
  expect(paragraph).toMatch(/momento[^.]*49,16 kN·m/);
});
