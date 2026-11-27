import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { gameStrings } from '../../../components/diagram-game/strings';
import { exampleStrings } from '../../../components/examples/strings';
import { translations as feher } from '../../../components/research/feher2026/strings';
import { riserHook } from '../../../components/research/gayNeto2014/card';
import { checkLabel } from '../../../components/research/grossman2026/check-labels';
import { evidence } from '../../../components/research/grossman2026/evidence';
import { findPost } from '../../blog';
import { RESULT_CHANGES } from '../../provenance/full-registry';
import { OFFERED_LOCALES } from '../offered';

function release(version: string, locale: string) {
  return readFileSync(new URL(`../../../../../docs/releases/v${version}.${locale}.md`, import.meta.url), 'utf8');
}

const nl061 = findPost('stabileo-0-6-1')!.i18n.nl!;
it.skip.each([
  release('0.6.1', 'nl').split('\n').find(line => line.startsWith('Beton- en staaltoetsingen')),
  nl061.blocks.find(block => block.k === 'p' && block.t.startsWith('Beton- en staaltoetsingen')),
])('known wrong result: #2613 — Dutch completeness warning in publication %#', paragraph => {
  const text = typeof paragraph === 'string' ? paragraph : paragraph?.k === 'p' && paragraph.t;
  expect(text).toMatch(/sommige.*ontbrekende gelijktijdige.*#2096.*SA-2026-071.*0\.6\.2 of later/i);
});

for (const locale of ['it', 'nl'] as const) {
  const notes = release('0.6.0', locale).split('\n');
  const article = findPost('stabileo-0-6-0')!.i18n[locale]!;
  const notice = RESULT_CHANGES.changes.find(change => change.id === 'generated-structure-stability')!;
  it.skip.each([
    notes.find(line => line.includes('generated-structure-stability.md')),
    notes.find(line => /^- (Le strutture piane generate|Gegenereerde vlakke constructies)/.test(line)),
    article.blocks.flatMap(block => block.k === 'ul' ? block.items : []).find(line => /^(Le strutture piane generate|Gegenereerde vlakke constructies)/.test(line)),
    notice.title[locale], notice.explanation[locale],
  ])(`known wrong result: #2613 — ${locale} identifies the shed generator on surface %#`, line => {
    expect(line).toMatch(/\bsheds\b/i);
  });

  it.skip.each(['0.6.0', '0.6.1'])(`known wrong result: #2613 — ${locale} links the Hungarian edition of %s`, version => {
    const links = release(version, locale).split('\n')[2];
    expect(links).toContain(`[Magyar](v${version}.hu.md)`);
    expect(release(version, 'hu')).toMatch(/^# /);
  });
}

const seismic = RESULT_CHANGES.changes.find(change => change.id === 'seismic-shell-geometry')!;
it.skip.each([release('0.6.3', 'nl').split('\n').find(line => line.includes('seismic-shell-geometry.md')), seismic.title.nl, seismic.explanation.nl])(
  'known wrong result: #2613 — Dutch seismic geometry identifies vertex coordinates on surface %#', line => {
    expect(line).toMatch(/coördinaten.*hoekpunten/i);
  },
);

const advisory = findPost('safety-advisories')!.i18n.nl!;
it.skip.each([
  release('0.6.4', 'nl').split('\n').find(line => line.startsWith('| [SA-2026-129]')),
  advisory.blocks.flatMap(block => block.k === 'table' ? block.rows : []).find(row => row[0] === 'SA-2026-129')?.join(' '),
])('known wrong result: #2613 — Dutch moving-load advice rechecks the sweep before rebuilding its envelope on surface %#', row => {
  expect(row).toMatch(/voertuigsweeps.*onjuiste waarden.*dwarskracht.*normaalkracht.*sweeps opnieuw.*omhullenden opnieuw/i);
});

it.skip('known wrong result: #2613 — the Dutch inflection hint uses the curvature of the displayed diagram', () => {
  expect(gameStrings.nl['tag.inflectionMisplaced']).toMatch(/kromming van het diagram van teken wisselt.*nulmoment alleen/i);
});

it.skip.each(['Pn', 'Mn'] as const)('known wrong result: #2613 — Dutch interaction coordinate %s identifies the balanced point', quantity => {
  expect(exampleStrings.nl[quantity === 'Pn' ? 'r.balancedP' : 'r.balancedM']).toBe(`Balanspunt ${quantity}`);
});

it.skip('known wrong result: #2613 — Dutch Navier edge guidance distinguishes twisting restraint from free bending rotation', () => {
  expect(exampleStrings.nl['slab-on-columns.about']).toMatch(/harde scharnieroplegging.*tordeert.*buigrotatie blijft vrij/);
});

it.skip.each([
  ['it', /confermi.*vertice opposto.*automaticamente/i],
  ['nl', /bevestig.*verre hoek.*automatisch/i],
] as const)('known wrong result: #2613 — %s identifies the corner that triggers a Fehér rerun', (locale, instruction) => {
  expect(feher[locale].runNote).toMatch(instruction);
});

it.skip.each([
  ['limits', /andere evenwichten.*niet uit/],
  ['interactive', /kan de strip doorklappen/],
  ['cusp', /kan de strip.*doorklappen/],
  ['lost', /mogelijk.*doorklappen|doorklappen.*mogelijk/i],
] as const)('known wrong result: #2613 — Dutch Fehér %s distinguishes branch loss from a physical jump', (key, expected) => {
  expect(feher.nl[key]).toMatch(expected);
});

it.skip.each([
  ['nl', /helft van de booglengte.*helft van de horizontale overspanning.*nog niet/],
  ['it', /prima metà della lunghezza d’arco.*luce orizzontale resta da eseguire/],
] as const)('known wrong result: #2613 — %s identifies the outstanding half-span comparison', (locale, expected) => {
  expect(feher[locale].why.items.some(item => expected.test(item.body))).toBe(true);
});

const checks = evidence.flatMap(group => group.checks);
it.skip.each(OFFERED_LOCALES)('known wrong result: #2613 — %s shows the inclusive maximum shear check from the Grossman evidence', locale => {
  const floppy = checks.find(check => check.id === 'dilution-floppy')!;
  const rigid = checks.find(check => check.id === 'dilution-rigid')!;
  const predicate = `max |G|/k ≤ ${floppy.tolerance.toExponential()}`;
  expect(checkLabel(floppy, locale)).toContain(predicate);
  expect(checkLabel(rigid, locale)).not.toContain(predicate);
});

it.skip('known wrong result: #2613 — the Italian riser caption distinguishes peak moment from the touchdown marker', () => {
  expect(riserHook.it).toMatch(/massimo.*valore assoluto.*metà del.*plateau/);
});
