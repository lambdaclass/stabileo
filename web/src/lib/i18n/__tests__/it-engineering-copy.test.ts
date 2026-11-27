import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { readRegistry } from '../../../../scripts/result-changes/registry.mjs';
import { gameStrings } from '../../../components/diagram-game/strings';
import { translations as fairclough } from '../../../components/research/fairclough2026/translations';
import { translations as feher } from '../../../components/research/feher2026/strings';
import feherMain from '../../../components/research/feher2026/main-copy.json';
import { translations as gayNeto } from '../../../components/research/gayNeto2014/strings';
import { checkLabel } from '../../../components/research/grossman2026/check-labels';
import { exampleStrings } from '../../../components/examples/strings';
import bars from '../../blog/translations/it/bars-or-finite-elements';
import torsion from '../../blog/translations/it/torsion-bredt-saint-venant';
import flexure from '../../blog/translations/it/verificacion-flexion-cirsoc-201';
import { f62Report } from '../../engine/steel/flange-local-buckling';
import { STRINGS } from '../../../components/research/i18n';
import notices from '../../provenance/result-change-translations/it.json';
import { allDictFor } from '../locales/all';
import { unfinishedProClaims } from '../pro-copy';

const italian = allDictFor('it');

it.each([
  ['legal.usageIncluded', /dati d’uso anonimi è attiva.*progetti salvati.*disattivato/],
  ['steps.m.crossBeams.help', /1\/2.*bloccato.*0.*incernierato/],
  ['steps.m.crossBeams.introWhy', /1\/2.*bloccato.*0.*incernierato/],
  ['steps.frames.cross.distIntro', /1\/2.*bloccato.*0.*incernierato/],
  ['steps.trusses.compat.hinges', /rigidezza condensata.*campata.*taglio e momento/],
  ['steps.trusses.compat.inext.mixed', /rigidezza condensato.*campata.*taglio e momento/],
  ['steps.cuts.load.caption', /forza risultante con segno.*momento primo.*coppia/],
  ['steps.cuts.seg.why', /forza con segno.*momento primo.*coppia.*unilaterali/],
  ['steps.trusses.sections.intro', /sforzi normali nelle aste sezionate/],
  ['steps.trusses.sections.cutCaption', /sforzi normali nelle aste sezionate/],
  ['course.plastic.trace.min', /nessuna sezione.*prima.*insieme/],
  ['course.second-order.opts.help.n', /rigidezza esatta per N costante.*primo ordine/],
  ['course.second-order.pd.convergenceNote', /N costante.*primo ordine/],
  ['course.second-order.doc.bk.det.count', /primo salto.*sopra zero/],
  ['steel.status.DEMAND_UNAVAILABLE', /^Sollecitazione non disponibile$/],
  ['conn.checkState.exceeded', /^Limite superato$/],
  ['joint.state.exceeded', /^Limite superato$/],
  ['steel.tc.weldNoHoles', /saldato con fori richiede una verifica indipendente/],
  ['steel.tc.calc.u', /min\(1 − x̄\/L, 0,9\)/],
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

it('known wrong result: #2595 — spring tension and honeycomb half-distance', () => {
  expect(STRINGS.it.springsPrestress).toBe('Pretensione');
  expect(STRINGS.it.springsCornerDistance).toBe('Semidistanza tra i vertici opposti ℓ');
  expect(STRINGS.it.formExportNote).toMatch(/carico verticale/);
});

it('known wrong result: #2595 — notices give dimensionless coefficients', () => {
  expect(notices['cirsoc-combinations-and-loads'].explanation).toContain('f₂·S = 0,70·S');
  expect(notices['cirsoc201-strain-compatibility'].explanation).toContain('√(f′c / MPa) ≤ 8,3');
});

it.each([
  ['PRO è in sviluppo per i carichi applicati ai nodi.', true],
  ['In PRO è in sviluppo l’intelligenza artificiale.', false],
  ['In PRO è in sviluppo il modulo AI.', false],
] as const)('known wrong result: #2595 — %s', (sentence, unfinished) => {
  expect(unfinishedProClaims(sentence, 'it', { aboutPro: false })).toEqual(unfinished ? [sentence] : []);
});

it('known wrong result: #2595 — Euler comparison uses a force', () => {
  expect(exampleStrings.it['tower.about']).toMatch(/carico critico in sommità.*π²EI/);
});

it('known wrong result: #2595 — shell displacement keeps its sign and millimetres', () => {
  const shell = bars.blocks.find(block => block.k === 'embed' && block.query === 'example=deep-beam-shell');
  expect(shell?.k === 'embed' && shell.label).toContain('−0,0519 mm');
  expect(bars.blocks.flatMap(block => block.k === 'table' ? block.rows.flat() : [])).toContain('12,500');
});

it('known wrong result: #2595 — closed and slit tube constants retain their scale', () => {
  const row = torsion.blocks.flatMap(block => block.k === 'table' ? block.rows : []).find(row => row[0] === 'J [mm⁴]');
  expect(row?.slice(1).map(cell => Number(cell.replaceAll(' ', '').replace(',', '.')))).toEqual([4286875, 15833, 271]);
});

it('known wrong result: #2595 — minimum steel follows the illustrated effective depth', () => {
  const table = flexure.blocks.find(block => block.k === 'table' && block.head.includes('As,min [cm²]'));
  if (table?.k !== 'table') throw new Error('Missing minimum-steel table');
  expect(table.rows).toHaveLength(4);
  const depth = 400 - 25 - 8 - 20 / 2;
  const minimum = (1.4 / 420) * 200 * depth / 100;
  for (const row of table.rows) expect(row[2]).toBe(minimum.toFixed(2).replace('.', ','));
});

it.each([
  ['I', 'bf/tf', 10], ['H', 'bf/tf', 10],
  ['C', 'bf/tf', 20], ['U', 'bf/tf', 20],
  ['T', null, null],
] as const)('shows the calculated flange slenderness convention for %s', (shape, formula, expected) => {
  const report = f62Report({ shape, b: 0.2, tf: 0.01 });
  expect(report.slendernessFormula).toBe(formula);
  expect(report.flangeSlenderness).toBe(expected);
});

it('identifies each released recheck once in the Italian 0.6.2 notes', () => {
  const notes = readFileSync(new URL('../../../../../docs/releases/v0.6.2.it.md', import.meta.url), 'utf8');
  const rows = [...notes.matchAll(/^\| (\d+) \| \[([^\]]+)\]\(\.\.\/(results-changes\/[^)#]+)(?:#[^)]+)?\) \|$/gm)];
  const released = readRegistry().changes.filter(change => change.resultsVersion >= 81 && change.resultsVersion <= 95);
  expect(rows.map(([, version, , path]) => version + ' docs/' + path).sort())
    .toEqual(released.map(change => change.resultsVersion + ' ' + change.changelog.file).sort());
  expect(new Set(rows.map(([, , label]) => label)).size).toBe(released.length);
});

it.skip('known wrong result: #2595 — each release link identifies its published Italian notice', () => {
  const notes = readFileSync(new URL('../../../../../docs/releases/v0.6.2.it.md', import.meta.url), 'utf8');
  const rows = [...notes.matchAll(/^\| (\d+) \| \[([^\]]+)\]\(\.\.\/(results-changes\/[^)#]+)(?:#[^)]+)?\) \|$/gm)];
  const released = readRegistry().changes.filter(change => change.resultsVersion >= 81 && change.resultsVersion <= 95);
  expect(rows.map(([, version, label, path]) => `${version} docs/${path} ${label}`).sort()).toEqual(
    released.map(change => `${change.resultsVersion} ${change.changelog.file} ${change.title.it}`).sort());
});

it.each([
  [gameStrings.it.level, 'Livello'],
  [fairclough.it.area, 'Area della sezione trasversale'],
  [feher.it.tabs.path, 'Percorso'],
  [gayNeto.it.code, 'Codice di riferimento (BSD-3-Clause)'],
  [checkLabel({ id: 'square-shear', name: 'square lattice shear modulus' }, 'it'), 'Reticolo quadrato: modulo di taglio nullo'],
])('labels the published control or benchmark as %s', (actual, expected) => {
  expect(actual).toBe(expected);
});

it('describes the same automatic Fehér recalculation in both builds', () => {
  expect(feherMain.it.runNote).toMatch(/confermi.*calcolo riparte automaticamente/);
  expect(feher.it.runNote).toBe(feherMain.it.runNote);
});

it('identifies the loaded arc and the outstanding Fehér comparison', () => {
  expect(feher.it.why.items.some(item => /prima metà della lunghezza d’arco.*luce orizzontale resta da eseguire/.test(item.body))).toBe(true);
});

it.each([
  ['M(e1) per element', /momento flettente.*elemento per elemento/],
  ['V(e2) per element', /taglio.*elemento per elemento/],
  ['moment at half its plateau', /metà del valore di plateau/],
  ['last node on the seabed', /ultimo nodo sul fondale/],
] as const)('labels the specific Gay Neto comparison %s', (reference, quantity) => {
  const entry = Object.entries(gayNeto.it.checkLabels).find(([name]) => name.includes(reference));
  expect(entry?.[1]).toMatch(quantity);
});
