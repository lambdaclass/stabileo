import { evidence } from '../../../components/research/grossman2026/evidence';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { expect, it } from 'vitest';
import { gameStrings } from '../../../components/diagram-game/strings';
import { exampleStrings } from '../../../components/examples/strings';
import { mohrTranslations } from '../../../components/mohr/i18n';
import { translations as feher } from '../../../components/research/feher2026/strings';
import mainCopy from '../../../components/research/feher2026/main-copy.json';
import { checkLabel } from '../../../components/research/grossman2026/check-labels';
import { STRINGS } from '../../../components/research/i18n';
import { findPost } from '../../blog';
import { findStandingPage } from '../../blog/pages';
import { CHANGELOG, itemsByArea } from '../../changelog';
import { f62Report } from '../../engine/steel/flange-local-buckling';
import { readRegistry } from '../../../../scripts/result-changes/registry.mjs';
import { allDictFor } from '../locales/all';
import { unfinishedProClaims } from '../pro-copy';

const italian = allDictFor('it');
const notices = readRegistry().changes;

it.each([
  ["course.influence.doc.mb.principle", "l’opposto della proiezione"],
  ["course.influence.states.why", "resta presente nelle posizioni assegnate"],
  ["course.influence.states.pattern", "ogni passaggio per lo zero"],
  ["course.plastic.kin.positionLead", "massimo |M|"],
  ["course.plastic.kin.positionWhy", "|M| = Mp"],
  ["course.kinematics.req.mechanism", "gli svincoli e la connessione"],
  ["course.kinematics.req.noUnknowns", "possono essere diverse da zero e si recuperano"],
  ["course.dynamics.ui.explain.freq", "modi poco smorzati"],
  ["course.second-order.doc.intro.so-buckling-phi", "numero, con molteplicità"],
  ["course.second-order.doc.bk.det.what", "contati con molteplicità"],
  ["steps.m.so-buckling-phi.help", "contati con molteplicità"],
  ["course.second-order.doc.bk.det.count", "più il numero di carichi"],
  ["course.second-order.doc.compare.why.phi", "anche senza carichi di campata"],
  ["course.second-order.doc.compare.rigid", "accordo è approssimato"],
  ["course.second-order.doc.bk.det.caption", "per i salti nei poli occorre il conteggio"],
  ["course.statics.gh.verdict.hyper", "cinematicamente stabile"],
  ["course.statics.vw.thermalLead", "α·Δt/h è la curvatura libera"],
  ["seismic.derivation.distTopHeavy", "2·T2 = 2·{t2}"],
  ["diag.tooltip.SANITY_MODULUS_IMPLAUSIBLE", "dipende da esso"],
  ["steel.sheet.loadHeightTop", "posizioni del carico valutate in F.2.2"],
  ["generator.assume.latticeBasesPinnedNoOutOfPlane", "dai vincoli traslazionali alla base"],
  ["generator.webPattern.pratt", "carichi gravitazionali"],
  ["generator.webPattern.howe", "carichi gravitazionali"],
  ["c301.d.uShearLag", "U = min(1 − x̄/L, 0,9)"],
  ["steel.grades.subtitle", "sola scelta della classe"],
  ["steel.e4.gap.warpingConstant", "la sezione selezionata non la dichiara"],
  ["steel.e4.notImplemented", "per questa selezione"],
  ["steel.f62.classificationUnavailable", "Fy positiva"],
  ["steel.f62.missing.slendernessLimits", "valore positivo di Fy"],
  ["steps.m.crossNoSway.help", "1/2 della correzione se bloccato e 0 se incernierato"],
  ["steps.frames.fem.modifiedWhy", "metà della correzione di rilascio"],
  ["steps.m.virtualWork.help", "∫N(x)n(x)/(EA) dx"],
  ["steps.m.virtualWork.principleWhy", "m(M/EI + κT) + n(N/EA + εT)"],
  ["steps.trusses.compat.inext.mechanism", "risolvere il sistema ridotto"],
  ["steps.cuts.reac.indeterminate", "iperstaticità esterna"],
] as const)('known wrong result: #2595 — %s', (key, expected) => {
  expect(italian[key]).toContain(expected);
});

it.each([
  ["mohr.rotation", mohrTranslations.it["mohr.rotation"], "normale al piano"],
  ["tag.nonZeroAtRelease", gameStrings.it["tag.nonZeroAtRelease"], "libero senza coppia"],
  ["tag.inflectionMisplaced", gameStrings.it["tag.inflectionMisplaced"], "momento nullo da solo non basta"],
  ["outrigger.about", exampleStrings.it["outrigger.about"], "rigidezza flessionale finita"],
  ["springsPrestressControl", STRINGS.it["springsPrestressControl"], "Pretensione"],
  ["springsPrestressLabel", STRINGS.it["springsPrestressLabel"], "Pretensione"],
  ["formEditorLabel", STRINGS.it["formEditorLabel"], "stesso carico verticale, senza pretensione"],
  ["springsStripSeries", STRINGS.it["springsStripSeries"], "Stabileo, striscia"],
  ["lost", feher.it["lost"], "possibile interpretazione fisica"],
  ["dilution-floppy", checkLabel(evidence.flatMap(group => group.checks).find(check => check.id === 'dilution-floppy')!, 'it'), "max |G|/k ≤ 1e-6"],
  ["plate mesh release note", JSON.stringify(CHANGELOG.map(entry => itemsByArea(entry, 'it'))), "Il generatore della mesh"],
] as const)('known wrong result: #2595 — %s', (_label, actual, expected) => {
  expect(actual).toContain(expected);
});

it.each([
  ["linear-small-displacement-warning", "lunghezza dell’asta supera 0,1,"],
  ["mirrored-moments-2d-in-3d", "invertiva il segno"],
  ["modal-mechanism-refused", "filtro separato dell’app"],
  ["modal-physical-mass-range", "impedendo all’analisi modale"],
  ["shell-envelope-per-component", "Von Mises di membrana"],
] as const)('known wrong result: #2595 — published notice %s', (id, expected) => {
  const notice = notices.find(change => change.id === id);
  expect(notice?.explanation.it).toContain(expected);
});

it.each([
  ["bars-or-finite-elements", "it", "spostamento interpolato tra i nodi"],
  ["bars-or-finite-elements", "it", "travi e il carico qui confrontati"],
  ["conceptual-side-advanced-tools", "it", "matrice ridotta 6×6"],
  ["page-cirsoc", "it", "a parità di impostazioni di analisi e versione del solutore"],
  ["page-cirsoc", "it", "fessurazione, copriferro"],
  ["page-privacy", "it", "quando lo alleghi a un feedback o lo salvi nel cloud"],
  ["page-reliability", "it", "con due eccezioni"],
  ["research-tools-and-checking-our-tests", "it", "−1,951 % a 4×4 a −0,036 %"],
  ["safety-advisories", "it", "anche senza inversione di segno"],
  ["safety-advisories", "it", "i carichi pertinenti sono assenti"],
  ["safety-advisories", "it", "solo grado di libertà passato da elastico a bloccato"],
  ["stabileo-0-5-0", "it", "ventuno corretti, con la verifica"],
  ["stabileo-0-5-0", "it", "Ventuno sono corretti."],
  ["stabileo-0-5-0", "it", "grado di libertà privo di massa"],
  ["torsion-bredt-saint-venant", "it", "15% è fuori dall’ipotesi"],
  ["torsion-bredt-saint-venant", "it", "compatibilità della rotazione torsionale"],
  ["torsion-bredt-saint-venant", "it", "parete chiusa sottile monocellulare"],
  ["torsion-bredt-saint-venant", "it", "una sola cella chiusa"],
  ["torsion-bredt-saint-venant", "it", "τmax ≈ T·t / J"],
  ["torsion-bredt-saint-venant", "it", "nulla sul piano medio"],
  ["torsion-bredt-saint-venant", "it", "τmax (aperto)"],
  ["torsion-bredt-saint-venant", "it", "tensioni normali longitudinali"],
  ["when-results-change", "it", "3,477"],
  ["verificacion-flexion-cirsoc-201", "hu", "táblázat d = 35,7 cm"],
  ["verificacion-flexion-cirsoc-201", "tr", "§9.6.1.3"],
  ["verificacion-flexion-cirsoc-201", "zh", "§9.6.1.3"],
] as const)('known wrong result: #2595 — %s (%s) includes %s', (slug, locale, expected) => {
  const body = slug.startsWith('page-')
    ? findStandingPage('/' + slug.slice(5))?.i18n[locale]
    : findPost(slug)?.i18n[locale];
  expect(JSON.stringify(body)).toContain(expected);
});

it.each(Array.from({ length: 10 }, (_, i) => 54 + i))('known wrong result: #2595 — release status of advisory %i', number => {
  const blocks = findPost('safety-advisories')!.i18n.it!.blocks;
  const row = blocks.flatMap(block => block.k === 'table' ? block.rows : []).find(row => row[0] === 'SA-2026-0' + number);
  expect(row?.[3]).toBe(number === 56 ? 'Irrisolto: verifica indipendente prima dell’uso' : 'Risolto nella 0.6.0');
  expect(blocks.find(block => block.k === 'note')?.t).toContain('nella 0.6.0, tranne SA-2026-056');
});

it.each([
  ['0.4.0', 'Se servono risultati dinamici, usa un’analisi che rappresenti gli offset fisici'],
  ['0.6.3', 'sostituirla con il consueto peso verso il basso applicato all’intero modello'],
])('known wrong result: #2595 — release %s recovery action', (version, action) => {
  const notes = readFileSync(new URL(`../../../../../docs/releases/v${version}.it.md`, import.meta.url), 'utf8');
  expect(notes).toContain(action);
});

it.each([
  ['hu-HU', 'Kész. Bezárhatja ezt az ablakot.'],
  ['it-IT', 'Fatto. Puoi chiudere questa finestra.'],
  ['en-US', 'Done. You can close this window.'],
])('known wrong result: #2595 — OAuth callback in %s', (language, expected) => {
  const html = readFileSync(new URL('../../../../public/oauth-callback.html', import.meta.url), 'utf8');
  const message = { textContent: '' };
  runInNewContext(html.split('<script>')[1].split('</script>')[0], {
    URLSearchParams, location: { search: '', pathname: '/' }, history: { replaceState() {} },
    navigator: { language }, document: { getElementById: () => message }, setTimeout() {},
  });
  expect(message.textContent).toBe(expected);
});

it.each([
  ['en', 'automatically'], ['es', 'automáticamente'], ['pt', 'automaticamente'],
  ['hu', 'automatikusan'], ['it', 'automaticamente'], ['zh', '自动'],
] as const)('known wrong result: #2595 — both Fehér controls reflect a committed change in %s', (locale, automatic) => {
  expect(mainCopy[locale].runNote).toContain(automatic);
  expect(feher[locale].runNote).toBe(mainCopy[locale].runNote);
});

it('known wrong result: #2595 — uppercase Italian preposition in a PRO claim', () => {
  const claim = 'PRO È IN BETA ED È RISERVATO AI CLIENTI';
  expect(unfinishedProClaims(claim, 'it', { aboutPro: false })).toEqual([claim]);
  const aboutClients = 'PRO È IN BETA E INVIA IL MODULO AI CLIENTI';
  expect(unfinishedProClaims(aboutClients, 'it', { aboutPro: false })).toEqual([aboutClients]);
  expect(unfinishedProClaims('IN PRO IL MODULO AI È IN BETA', 'it', { aboutPro: false })).toEqual([]);
});

it.each(['I', 'H', 'C', 'U'])('known wrong result: #2595 — substitute the reported outstand in the %s equation', shape => {
  const tf = 0.01;
  const report = f62Report({ shape, b: 0.2, tf });
  expect(report.slendernessFormula).toBe('bf/tf');
  expect(report.flangeSlenderness).toBe(report.bfM! / tf);
});

it('uses Italian decimal commas for all three buckling coefficients and their comparisons', () => {
  const blocks = findPost('when-results-change')!.i18n.it!.blocks;
  const table = blocks.find(block => block.k === 'table' && block.caption?.includes('SA-2026-042'));
  expect(table?.k === 'table' && table.rows.map(row => row.slice(1))).toEqual([
    ['3,477', '4,972 (+43 %)', '3,542 (+1,9 %)'],
    ['2,961', '4,972 (+68 %)', '3,056 (+3,2 %)'],
    ['7,837', '4,972 (−37 %)', '7,889 (+0,7 %)'],
  ]);
});

it.each(['en', 'es', 'pt', 'de', 'fr', 'tr', 'hu', 'it', 'zh', 'nl'] as const)(
  'known wrong result: #2595 — %s shows both the raw and capped D.3.2 factor',
  locale => {
    const dict = allDictFor(locale);
    const template = dict['c301.d.uShearLag'];
    expect(template.trim()).toBe(dict['steel.tc.calc.u']);
    for (const offset of [15, 10, 5]) {
      const length = 100;
      const raw = 1 - offset / length;
      const values: Record<string, number> = { xBar: offset, L: length, raw, U: Math.min(raw, 0.9) };
      const trace = template.replace(/\{(\w+)\}/g, (_, key: string) => String(values[key]));
      expect(trace).toContain(`1 − ${offset}/${length} = ${raw}`);
      checkCappedTrace(trace, values.U);
    }
  },
);

it.each(['de', 'fr'] as const)('known wrong result: #2595 — %s prints the decimal comma in both caps', locale => {
  for (const key of ['c301.d.uShearLag', 'steel.tc.calc.u']) {
    expect(allDictFor(locale)[key]).toContain('0,9)');
  }
});

function checkCappedTrace(trace: string, expected: number) {
  const match = /U = min\(1 − x̄\/L, 0[.,]9\) = (\d+(?:[.,]\d+)?)\s+\(D\.3\.2\)$/.exec(trace);
  expect(match).not.toBeNull();
  expect(Number(match![1].replace(',', '.'))).toBe(expected);
}

it('known wrong result: #2595 — detects the uncapped substitution in the governing result', () => {
  expect(() => checkCappedTrace('U = min(1 − x̄/L, 0.9) = 0.95  (D.3.2)', 0.9)).toThrow();
});

it('known wrong result: #2613 — Dutch tension traces show raw and capped values independently', () => {
  for (const key of ['c301.d.uShearLag', 'steel.tc.calc.u']) {
    const trace = allDictFor('nl')[key].replace('{raw}', '0,95').replace('{U}', '0,9').trim();
    checkCappedTrace(trace, 0.9);
  }
});
