import { exampleStrings } from "../../../components/examples/strings";
import bars from "../../blog/translations/it/bars-or-finite-elements";
import torsion from "../../blog/translations/it/torsion-bredt-saint-venant";
import flexure from "../../blog/translations/it/verificacion-flexion-cirsoc-201";
import { expect, it } from 'vitest';
import { STRINGS } from '../../../components/research/i18n';
import notices from '../../provenance/result-change-translations/it.json';
import { allDictFor } from '../locales/all';
import { unfinishedProClaims } from '../pro-copy';

const italian = allDictFor('it');

it.skip.each([
  ['stress.sigmaBiaxHelp', /Mz·y\/Iz − My·z\/Iy/],
  ['stress.fiberYZ3dHelp', /altezza.*z locale.*larghezza.*y locale/s],
  ['teach.unitsNote', /y in cm[, ]/],
  ['account.researchHint', /disattivata per impostazione predefinita/i],
  ['course.dynamics.mdof.orth.tableCaption', /K_i\/M_i = ω_i²/],
  ['course.kinematics.dm.introStates', /EA·\(ΔL\/L − αΔT\)/],
  ['course.plastic.trace.hinge', /\|M\| = Mp/],
  ['course.plastic.trace.yield', /\|N\| = Np/],
  ['course.influence.states.moving', /min\(0,.*max\(0,/],
  ['steps.m.compatibility.opt.inextensible.help', /N·L\/\(EA\)/],
  ['steps.trusses.compat.endsLeadTruss', /aste.*esercitano sul nodo/],
  ['steel.cb.reason.computed', /\|Mmax\|.*\|MA\|.*\|MB\|.*\|MC\|/],
  ['c301.f.ltbElastic', /min\(Mcr, Mp\)/],
  ['c301.f.ltbInelastic', /min\(Cb.*Mp\)/],
  ['c301.f.weakMp', /min\(Fy·Zy, 1[.,]5·Fy·Sy\)/],
  ['c301.demand', /rapporto = \{ratio\}/],
  ...['steel.tc.calc.yield', 'steel.tc.calc.rupture', 'c301.d.yield', 'c301.d.rupture', 'c301.e.pn', 'c301.g.vn'].map(key => [key, /·10⁻³ = \{\w+\} kN/] as const),
] as const)('known wrong result: #2595 — %s', (key, expected) => {
  expect(italian[key]).toMatch(expected);
});

it.skip('known wrong result: #2595 — spring tension and honeycomb half-distance', () => {
  expect(STRINGS.it.springsPrestress).toBe('Pretensione');
  expect(STRINGS.it.springsCornerDistance).toBe('Semidistanza tra i vertici opposti ℓ');
  expect(STRINGS.it.formExportNote).toMatch(/carico verticale/);
});

it.skip('known wrong result: #2595 — notices give dimensionless coefficients', () => {
  expect(notices['cirsoc-combinations-and-loads'].explanation).toContain('f₂·S = 0,70·S');
  expect(notices['cirsoc201-strain-compatibility'].explanation).toContain('√(f′c / MPa) ≤ 8,3');
});

it.skip.each([
  ['PRO è in sviluppo per i carichi applicati ai nodi.', true],
  ['In PRO è in sviluppo l’intelligenza artificiale.', false],
  ['In PRO è in sviluppo il modulo AI.', false],
] as const)('known wrong result: #2595 — %s', (sentence, unfinished) => {
  expect(unfinishedProClaims(sentence, 'it', { aboutPro: false })).toEqual(unfinished ? [sentence] : []);
});

it.skip('known wrong result: #2595 — Euler comparison uses a force', () => {
  expect(exampleStrings.it['tower.about']).toMatch(/carico critico in sommità.*π²EI/);
});

it.skip('known wrong result: #2595 — shell displacement keeps its sign and millimetres', () => {
  const shell = bars.blocks.find(block => block.k === 'embed' && block.query === 'example=deep-beam-shell');
  expect(shell?.k === 'embed' && shell.label).toContain('−0,0519 mm');
  expect(bars.blocks.flatMap(block => block.k === 'table' ? block.rows.flat() : [])).toContain('12,500');
});

it.skip('known wrong result: #2595 — closed and slit tube constants retain their scale', () => {
  const row = torsion.blocks.flatMap(block => block.k === 'table' ? block.rows : []).find(row => row[0] === 'J [mm⁴]');
  expect(row?.slice(1).map(cell => Number(cell.replaceAll(' ', '').replace(',', '.')))).toEqual([4286875, 15833, 271]);
});

it.skip('known wrong result: #2595 — minimum steel follows the illustrated effective depth', () => {
  const table = flexure.blocks.find(block => block.k === 'table' && block.head.includes('As,min [cm²]'));
  expect(table?.k).toBe('table');
  if (table?.k !== 'table') throw new Error('Missing minimum-steel table');
  expect(table.rows).toHaveLength(4);
  for (const row of table.rows) expect(Number(row[2].replace(',', '.'))).toBe(Number(((1.4 / 420) * 200 * (400 - 25 - 8 - 20 / 2) / 100).toFixed(2)));
});
