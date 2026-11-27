import { expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { findPost } from '../../blog';
import { CHANGELOG } from '../../changelog';
import { RESULT_CHANGES } from '../../provenance/full-registry';
import { FIELD_NAMES, STRINGS } from '../../../components/research/i18n';
import { translations as riser } from '../../../components/research/gayNeto2014/strings';
import { allDictFor } from '../locales/all';
import { teAt } from '../engine-text';

const nl = allDictFor('nl');
const changelog = CHANGELOG.flatMap(entry => entry.i18n.nl.items).join('\n');

it.each([
  ["course.dynamics.mdof.shear.why", "relatief horizontaal verplaatsingsverschil Δ"],
  ["course.plastic.doc.assumptions", "|M| = Mp"],
  ["course.plastic.kin.combineLead", "even grote en tegengestelde rotaties"],
  ["course.plastic.trace.help", "vloeiteken en |M| = Mp"],
  ["course.second-order.doc.bk.modes.what", "K(λᵢ)·φ = 0"],
  ["steps.m.so-buckling-phi.help", "kniklengte af uit de berekende kritieke last"],
  ["steps.m.so-pdelta-phi.opt.axialRigid.label", "Axiaal starre staven"],
  ["steps.m.so-pdelta-kg.opt.axialRigid.label", "Axiaal starre staven"],
  ["steps.m.so-buckling-phi.opt.axialRigid.label", "Axiaal starre staven"],
  ["steps.m.so-buckling-kg.opt.axialRigid.label", "Axiaal starre staven"],
  ["course.statics.gh.verdict.hyper", "kinematisch stabiel"],
  ["ctx.rotate90cw", "↻"],
  ["ctx.rotate90ccw", "↺"],
  ["stress.sigmaBiaxHelp", "Mz·y/Iz − My·z/Iy"],
  ["stress.ccCHSNote", "(R² + r²)/(4R)"],
  ["teach.unitsNote", "y door 10 gedeeld"],
  ["stress.eccentricOutKern", "verandert van teken"],
  ["fire.prot.name", "Productnaam"],
  ["groups.members", "{n} elementen"],
  ["userSpectrum.add", "Spectrum toevoegen"],
  ["steel.assume.netAreaEqualsGross", "opgegeven eindverbinding"],
  ["steel.assume.noPlasticMomentCap", "begrenst Mp tot 1,5·My"],
  ["generator.webPattern.pratt", "bij neerwaartse zwaartekrachtbelasting"],
  ["generator.webPattern.howe", "bij neerwaartse zwaartekrachtbelasting"],
  ["steel.workflow.geometry.lbDetail", "effectieve zijdelingse steunen van de drukflens"],
  ["steel.workflow.geometry.chain", "de drukflens werkelijk zijdelings steunt"],
  ["steel.rows.prop.strongInertia.why", "ry om de zwakke as"],
  ["bolted.note.combinedReducesTension", "F′nt ≤ Fnt"],
  ["weld.loading.other", "niet aan het uiteinde belast"],
  ["steel.tc.staggerS", "verspringing in de krachtrichting"],
  ["steel.tc.staggerG", "hart-op-hartafstand tussen boutrijen, dwars op de kracht"],
  ["steel.sheet.loadHeightTop", "alleen de door de toets onderzochte belastingshoogten"],
  ["steps.m.fm.help", "onafhankelijke oplegreacties of inwendige staafkrachten"],
  ["steps.frames.fem.modifiedWhy", "de helft van de correctie"],
  ["steps.trusses.compat.pLeadInext", "axiale verlenging p₃"],
  ["steps.trusses.compat.aWhy", "afhankelijke knoopverplaatsingen"],
  ["steps.trusses.compat.elong", "Axiale verlenging"],
  ["steps.m.momentArea.areasWhy", "momentoppervlakken door EI van het segment"],
])('#2613 — Dutch %s identifies the quantity or condition', (key, expected) => {
  expect(nl[key]).toContain(expected);
});

it.each([
  ["0.6.0", "| [SA-2026-051", "de component van het eigen gewicht van de as in de lengterichting van de staaf"],
  ["0.6.0", "../results-changes/2026-11-moving-loads-3d.md", "de component van het eigen gewicht van de as in de lengterichting van de staaf"],
  ["0.6.0", "| [SA-2026-054", "bepaal de getroffen staafkrachten en oplegreacties onafhankelijk"],
  ["0.6.0", "| [SA-2026-063", "de beweging in een voorgeschreven vrijheidsgraad van de masterknoop"],
  ["0.6.0", "../results-changes/2026-11-generated-structure-stability.md", "expliciete oplegvoorwaarden"],
  ["0.6.1", "Bereken getroffen beton", "Vergelijk de berekende ontwerpsnedekrachten en -momenten, belastingen"],
  ["0.6.1", "| [SA-2026-068", "niet-getoetste torsiegevallen"],
  ["0.6.2", "Bereken getroffen beton", "Vergelijk doorbuigingen, berekende ontwerpsnedekrachten en -momenten, belastingen"],
  ["0.6.2", "Hercontrole van omgerekende vlakke staafbelastingen", "vlakke staafbelastingen na onderverdeling]("],
  ["0.6.2", "Ontwerptoetsingen na correctie van 3D-opleggingen", "opnieuw uitvoeren]("],
  ["0.6.3", "| [SA-2026-091", "Controleer welke staven en beugels ter plaatse daadwerkelijk aanwezig zijn bij"],
  ["0.6.3", "../results-changes/2026-11-fixture-replay-and-framed-import.md", "import volgens het in het werkboek opgegeven assenstelsel"],
  ["0.6.3", "Vereenvoudigd Chinees ", "relatieve horizontale verplaatsing tussen opeenvolgende verdiepingen"],
  ["0.6.3", "- Er blijven open bevindingen", "oplegreacties in de verhinderde vrijheidsgraden"],
  ["0.6.3", "- **[SA-2026-056]", "waarvan de berekende respons na hernummeren, rotatie of eenhedenconversie wezenlijk verandert"],
  ["0.6.4", "- Er blijven open bevindingen", "oplegreacties in de verhinderde vrijheidsgraden"],
  ["0.6.4", "- **[SA-2026-056]", "waarvan de berekende respons na hernummeren, rotatie of eenhedenconversie wezenlijk verandert"],
])('#2613 — release %s gives the recheck at %s', (version, anchor, expected) => {
  const markdown = readFileSync(new URL(`../../../../../docs/releases/v${version}.nl.md`, import.meta.url), 'utf8');
  const matching = markdown.split('\n').filter(line => line.includes(anchor));
  expect(matching).toHaveLength(1);
  expect(matching[0]).toContain(expected);
});

it.each([
  ["safety-advisories", "misten de component van de aslast langs de staaf op schuine staven"],
  ["safety-advisories", "misten extrema"],
  ["safety-advisories", "behoud bij een bestaande kolom de werkelijke wapening, toets beide momentrichtingen en gebruik de laagste capaciteit"],
  ["safety-advisories", "waarvoor onafhankelijk is aangetoond dat buigknik maatgevend is"],
  ["torsion-bredt-saint-venant", "in de vier tabelvoorbeelden ligt de Bredt-spanning 2,4 tot 15% onder de exacte buitenvezelspanning"],
  ["torsion-bredt-saint-venant", "Vormt de dunne wand één gesloten cel? Gebruik Bredt met Aₘ binnen de middellijn"],
  ["stabileo-0-5-0", "een doorbuigend moment als positief"],
  ["stabileo-0-5-0", "Na een eenhedenconversie of hernummering moeten dezelfde fysieke resultaten volgen"],
])('#2613 — published %s explains %s', (slug, expected) => {
  expect(JSON.stringify(findPost(slug)!.i18n.nl)).toContain(expected);
});

it.each([
  ["cirsoc301-q-nonpositive-refused", "explanation", "Q tot 1,012"],
  ["cirsoc301-q-nonpositive-refused", "explanation", "1,2 %"],
  ["connector-mechanism-2d-refused", "explanation", "waar alle aangesloten staven aan die knoop scharnierend zijn verbonden"],
  ["gallery-slab-hard-walls", "explanation", "de verticale verplaatsing en de rotatie om de in het plaatvlak gelegen randnormaal zijn verhinderd. Rotatie om de randraaklijn is vrij"],
  ["warped-quad-containment", "explanation", "grenzen voor de afwijking van de vierhoek uit zijn vlak bij MITC4 en MITC9"],
  ["wind-physical-pressure-field", "title", "Gebouwclassificatie en winddrukvelden"],
])('#2613 — saved notice %s localizes its %s', (key, field, expected) => {
  const notice = RESULT_CHANGES.changes.find(change => change.id === key);
  expect(field === 'title' ? notice?.title.nl : notice?.explanation.nl).toContain(expected);
});

it.each([
  [STRINGS.nl.springsStripSeries, "Stabileo: lineaire strip van 13 × 52"],
  [STRINGS.nl.hybridModel, "Als het geschiedenisveld is ingeschakeld, wordt H bij elke stap"],
  [FIELD_NAMES.nl['limit-analysis'], "Grenslastanalyse en metselwerk"],
  [riser.nl.method, "zodat Newton lokaal kwadratisch kan convergeren nabij een reguliere oplossing op een gladde tak met ongewijzigde contact- en wrijvingstoestand"],
  [teAt({ key: 'svc.engine.axialJointMechanism', params: { node: 1 } }, 'nl'), "of de kinematische rand- en koppelvoorwaarden te schenden"],
  [changelog, "alleen de beschikbare snedekrachten en momenten te toetsen"],
  [changelog, "de ontbrekende verhindering van starre rotatie in het vlak"],
])('published engineering guidance %#', (actual, expected) => {
  expect(actual).toContain(expected);
});

it.each(Array.from({ length: 8 }, (_, i) => 100 + i))('#2613 — both Dutch notices identify the released disposition for SA-2026-%i', number => {
  const blocks = findPost('safety-advisories')!.i18n.nl!.blocks;
  const id = 'SA-2026-' + number;
  const status = number < 106 ? 'Verholpen in 0.6.4' : 'Ingedamd in 0.6.4';
  expect(blocks).toContainEqual({ k: 'note', t: id + ' — ' + status + '.' });
  const row = blocks.flatMap(b => b.k === 'table' ? b.rows : []).find(r => r[0] === id);
  expect(row?.at(-1)).toBe(status);
});

it('#2613 — all worked advisory ratios use Dutch decimal commas', () => {
  const table = (locale: 'en' | 'nl') => findPost('safety-advisories')!.i18n[locale]!.blocks
    .filter(b => b.k === 'table').find(b => b.rows.some(row => row[0] === 'SA-2026-009' && row.length === 5));
  const rows = table('en')!.rows.map(row => [row[0], ...row.slice(2, 4).map(value => value.replace('.', ','))]);
  expect(table('nl')?.rows.map(row => [row[0], ...row.slice(2, 4)])).toEqual(rows);
});

it('#2613 — Dutch buckling coefficients retain decimal magnitudes in every row', () => {
  const table = (locale: 'en' | 'nl') => findPost('when-results-change')!.i18n[locale]!.blocks
    .filter(b => b.k === 'table').find(b => b.caption?.includes('SA-2026-042'))!;
  expect(table('nl').rows.map(row => row.slice(1))).toEqual(table('en').rows.map(row => row.slice(1).map(cell => cell.replaceAll('.', ',').replace(/\s*%/g, ' %'))));
});

it('#2613 — Dutch flexure sizing uses the illustrated effective depth', () => {
  const blocks = findPost('verificacion-flexion-cirsoc-201')!.i18n.nl!.blocks;
  const table = blocks.find(b => b.k === 'table');
  expect(table?.rows.find(row => row[0] === '60')).toEqual(['60', '4,76', '2,38', 'sterkte']);
  expect(JSON.stringify(blocks)).toMatch(/31,1 kN·m.*§9\.6\.1\.2.*§9\.6\.1\.3.*4\/3/);
});
