import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { navierStrings } from '../../../components/research/navier1823/strings';
import { parameters } from '../../../components/research/navier1823/model';
import { STRINGS } from '../../../components/research/i18n';
import feher from '../../../components/research/feher2026/main-copy.json';
import { translations } from '../../../components/research/feher2026/strings';
import { findPost } from '../../blog';
import { methods } from '../../engine/steps/methods/second-order';
import { sheetSpec } from '../../excel-import/schema';
import { readRegistry } from '../../../../scripts/result-changes/registry.mjs';
import { allDictFor } from '../locales/all';
import { PUBLIC_LOCALES } from '../offered';

const italian = allDictFor('it');
const rows = (slug: string) => findPost(slug)!.i18n.it!.blocks.flatMap(block => block.k === 'table' ? block.rows : []);

it.skip('known wrong result: #2595 — Navier reports the benchmark modulus unambiguously', () => {
  expect(navierStrings('it').method.replaceAll(' ', '')).toContain(`E=${parameters.e}MPa`);
});

it.skip.each([feher.it, translations.it])('known wrong result: #2595 — Fehér identifies the control that restarts the solve', copy => {
  expect(copy.runNote).toMatch(/angolo opposto.*calcolo riparte automaticamente/);
});

it.skip('known wrong result: #2595 — the research catalog has an Italian status heading', () => {
  expect(STRINGS.it.status).toBe('Stato');
});

it.skip.each([105, 106, 107])('known wrong result: #2595 — release 0.6.4 links advisory %i with its scope', number => {
  const release = (version: string) => readFileSync(new URL(`../../../../../docs/releases/v0.6.${version}.it.md`, import.meta.url), 'utf8');
  const id = 'SA-2026-' + number;
  const prior = release('3').split('\n').find(line => line.startsWith('| [' + id + ']'))!;
  const current = release('4').split('\n').find(line => line.includes(id))!;
  expect(current.split('|')[1]).toBe(prior.split('|')[1]);
  if (number === 105) expect(current).toContain('coppia concentrata piana ripristinata');
});

it.skip('known wrong result: #2595 — the lesson counts the registered second-order methods', () => {
  const row = rows('learn-structural-analysis-step-by-step').find(([group]) => group === 'Secondo ordine e instabilità')!;
  expect(row[1]).toBe(String(methods.length));
  expect(row[2]).toMatch(/φ.*matrice geometrica.*numero di modi.*autovalori/);
});

it.skip('known wrong result: #2595 — the Italian release shows its recheck quantities with decimal commas', () => {
  const release = rows('stabileo-0-3-0');
  expect(release.filter(([id]) => id.startsWith('SA-'))).toHaveLength(5);
  for (const [id, , ...values] of release.filter(([id]) => id.startsWith('SA-'))) {
    const advisory = rows('safety-advisories').find(row => row[0] === id && row.slice(2).includes(values[0].replace('.', ',')));
    expect(advisory?.slice(2, 4), id).toEqual(values);
  }
});

it.skip.each(['1,2D + 1,6W', '0,9D + 1,6H', '1,2D + 1,6H'])('known wrong result: #2595 — consistent load factors for %s', combination => {
  const page = JSON.stringify(findPost('safety-advisories')!.i18n.it).replaceAll(' ', '');
  const compact = combination.replaceAll(' ', '');
  expect(page).toContain(compact);
  expect(page).not.toContain(compact.replace(',6', '.6'));
  expect(page).not.toContain(compact.replaceAll(',', '.'));
});

it.skip('known wrong result: #2595 — Materials help distinguishes the template header from a mass-density header', () => {
  const rho = sheetSpec('Materials')!.columns.find(column => column.key === 'rho')!;
  expect(italian[rho.helpKey!]).toContain(rho.unit);
  expect(italian[rho.helpKey!]).toMatch(/densità di massa.*kg\/m³/);
});

it.skip.each([
  ['tooltip.supFixed.desc', /ux.*uz.*uy/i],
  ['tooltip.supPinned.desc', /ux.*uz.*uy/i],
  ['tooltip.supRollerX.desc', /uz.*uy/i],
  ['tooltip.supRollerY.desc', /ux.*uz.*uy/i],
  ['tooltip.supSpring.desc', /kx.*kz.*ky/i],
  ['ctx.rotate90cw', /orario.*↻/],
  ['ctx.rotate90ccw', /antiorario.*↺/],
  ...['results.measureUtilisation', 'results.resistance', 'tooltip.diagColorMap.desc', 'pro.varStressRatio', 'demo.results.stressDesc'].map(key => [key, /σvm\/fy/] as const),
  ['design.status.fail', /^Non verifica$/],
  ['design.status.unavailable', /^Non valutato$/],
  ['design.counts.fail', /^non verificano$/],
  ['design.counts.unavailable', /^non valutati$/],
  ['design.overlay.unavailable', /^non valutato$/],
  ['float.thermalUniformTip', /^ΔT:/],
  ['steel.tc.staggerG', /^g interasse trasversale \(mm\)$/],
  ['weld.process.submergedArc', /9 mm.*gola teorica.*3 mm/],
] as const)('known wrong result: #2595 — %s identifies its physical quantity or state', (key, expected) => {
  expect(italian[key]).toMatch(expected);
});

it.skip.each(['de', 'fr'] as const)('known wrong result: #2595 — %s uses the same flange coefficients in classification and refusal', locale => {
  const dictionary = allDictFor(locale);
  const coefficients = (key: string) => dictionary[key].match(/\d+[.,]\d+(?=·?√)/g);
  expect(coefficients('steel.f62.classified')).toEqual(coefficients('steel.f62.missing.slendernessLimits'));
  expect(dictionary['c301.d.uShearLag']).toContain('0,9');
});

it.skip.each(PUBLIC_LOCALES)('known wrong result: #2595 — %s retires the implemented plastic-cap remedy', locale => {
  expect(allDictFor(locale)).not.toHaveProperty(['steel.assume.route.implementCap']);
});

it.skip('known wrong result: #2595 — worked CIRSOC coefficients use Italian decimals and preserve clause numbering', () => {
  for (const [key, value] of Object.entries(italian)) {
    if (/^(c301\.|steel\.tc\.calc\.)/.test(key)) expect(value, key).not.toMatch(/(?<![.\w])\d+\.\d+/u);
  }
  expect(italian['c301.f.cbDefault']).toMatch(/Cb = 1(?:,000)? \(F\.1\.1/);
});

it.skip('known wrong result: #2595 — the endpoint notice identifies the original tip thrust and the additional load', () => {
  const notice = readRegistry().changes.find(change => change.id === 'pdelta-span-axial')!;
  expect(notice.explanation.it).toMatch(/−P.*punta.*\+P alla base.*N = -P.*-900.*-750.*\+P all’estremità.*zero/);
});
