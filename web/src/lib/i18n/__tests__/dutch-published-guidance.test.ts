import { expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { findPost } from '../../blog';
import { findStandingPage } from '../../blog/pages';
import { CHANGELOG } from '../../changelog';
import { readRegistry } from '../../../../scripts/result-changes/registry.mjs';
import { allDictFor } from '../locales/all';
import { mohrTranslations } from '../../../components/mohr/i18n';
import { toolTranslations } from '../../../components/tools/translations';
import { checkLabel } from '../../../components/research/grossman2026/check-labels';
import { translations as riser } from '../../../components/research/gayNeto2014/strings';
import { translations as feher } from '../../../components/research/feher2026/strings';
import mainCopy from '../../../components/research/feher2026/main-copy.json';
import { nl as arch } from '../../../components/research/heyman1966/strings-nl';
import { STRINGS } from '../../../components/research/i18n';
import { translations as newmark } from '../../../components/research/newmark1959/i18n';
import { strings as navier } from '../../../components/research/navier1823/strings';

const registry = readRegistry();
const nl = allDictFor('nl');
const changelog = CHANGELOG.flatMap(entry => entry.i18n.nl.items).join('\n');

it.each([
  ["0.4.0", "| Modale analyses, responsspectruma", "dynamische analyse die de fysieke excentriciteiten meeneemt"],
  ["0.6.0", "../advisories/SA-2026-051-moving-loads-3d.md", "de component van de aslast in de lengterichting van de staaf"],
  ["0.6.0", "../results-changes/2026-11-moving-loads-3d.md", "de component van de aslast in de lengterichting van de staaf"],
  ["0.6.0", "- Gegenereerde vlakke constructies ", "expliciete oplegvoorwaarden"],
  ["0.6.0", "- **SA-2026-056 blijft onopgelost:*", "ook als hernummeren, rotatie en eenhedenconversie dezelfde respons geven"],
  ["0.6.1", "../advisories/SA-2026-056-constrained-shell-dynamic-invariance.md", "ook als hernummeren, rotatie en eenhedenconversie dezelfde respons geven"],
  ["0.6.2", "../advisories/SA-2026-056-constrained-shell-dynamic-invariance.md", "ook als hernummeren, rotatie en eenhedenconversie dezelfde respons geven"],
  ["0.6.2", "Genereer getroffen windbelastingen ", "bedoelde oplegvoorwaarden en de afzonderlijk verhinderde vrijheidsgraden"],
  ["0.6.2", "../advisories/SA-2026-071-incomplete-concurrent-demands.md", "in een actieve combinatie"],
  ["0.6.2", "../advisories/SA-2026-071-incomplete-concurrent-demands.md", "controleer bij elke relevante snede de vereiste gelijktijdige krachten en momenten voor elke actieve combinatie"],
  ["0.6.3", "../advisories/SA-2026-056-constrained-shell-dynamic-invariance.md", "ook als hernummeren, rotatie en eenhedenconversie dezelfde respons geven"],
  ["0.6.3", "- Werkboekimport wijst bladnamen af", "tegenstrijdige vlaggen voor expliciete randvoorwaarden"],
  ["0.6.3", "- Werkboekimport wijst bladnamen af", "Volledig opgegeven expliciete randvoorwaarden"],
  ["0.6.4", "../advisories/SA-2026-056-constrained-shell-dynamic-invariance.md", "ook als hernummeren, rotatie en eenhedenconversie dezelfde respons geven"],
  ["0.6.4", "Verifieer vóór het berekenen de oor", "oude vlakke puntkoppels"],
  ["0.6.4", "../advisories/SA-2026-125-shared-rigid-support-degree.md", "een gedeelde verhinderde vrijheidsgraad"],
  ["0.6.4", "../advisories/SA-2026-129-moving-load-force-jumps.md", "Voer eerst de getroffen voertuigsweeps opnieuw uit"],
])('known wrong result: #2613 — release %s at %s states %s', (version, anchor, expected) => {
  const release = readFileSync(new URL('../../../../../docs/releases/v' + version + '.nl.md', import.meta.url), 'utf8');
  const rows = release.split('\n').filter(line => line.includes(anchor));
  expect(rows).toHaveLength(1);
  expect(rows[0]).toContain(expected);
});

it.each([
  [mohrTranslations.nl['mohr.rotation'], "Hoek θ van de vlaknormaal, tegen de klok in vanaf de x-as"],
  [checkLabel({ id: 'dilution-floppy', name: '' }, 'nl'), "G/k < 10⁻⁶"],
  [riser.nl.checkLabels["T16 step 3: touchdown (moment at half its plateau) vs reference data [m]"], "helft van het momentplateau"],
  [riser.nl.checkLabels["T16 step 3: touchdown, last node on the seabed vs elastic catenary [m of line]"], "laatste knoop op de zeebodem"],
  [mainCopy.nl.runNote, "Bevestig de wijziging van de verre hoek"],
  [feher.nl.runNote, "Bevestig de wijziging van de verre hoek"],
  [arch.idea, "tegenoverliggende rand van de voeg"],
  [arch.method, "λmax × P in kN"],
  [arch.tableIntro, "genormaliseerde horizontale spatkracht h"],
  [arch.quantities.h, "Genormaliseerde horizontale spatkracht H/(w r)"],
  [STRINGS.nl.formExportNote, "als elastisch vakwerk met dezelfde verticale belasting en zonder initiële kabelspanning"],
  [STRINGS.nl.formEditorLabel, "als vakwerk met dezelfde verticale belasting en zonder initiële kabelspanning"],
  [newmark.nl.bound, "Bovengrens voor de verplaatsingsfout (mm)"],
  [navier.it.method, "0,1 m; E = 63 000 MPa, ν = 0,2"],
  [navier.nl.method, "0,1 m dik; E = 63 000 MPa, ν = 0,2"],
  [toolTranslations.nl["tools.warnReference"], "de discretisatie, de invoer en de aannamen"],
  [toolTranslations.nl["tools.warnDeflection"], "boven de waarschuwingsdrempel L/50 van deze tool voor kleine doorbuigingen"],
  [changelog, "in een voorgeschreven vrijheidsgraad van de masterknoop"],
  [changelog, "de tweede flens"],
])('known wrong result: #2613 — feature guidance %#: %s', (actual, expected) => {
  expect(actual).toContain(expected);
});

it.each([
  ["conceptual-side-advanced-tools", "Pas na controle van de stabiliteit"],
  ["page-cirsoc", "Alleen voltooide, toepasselijke toetsingen"],
  ["page-cirsoc", "Dezelfde invoer geeft met dezelfde solverversie dezelfde getallen"],
  ["research-tools-and-checking-our-tests", "−1,951 %"],
  ["research-tools-and-checking-our-tests", "−0,036 %"],
  ["research-tools-and-checking-our-tests", "1,83 kN"],
  ["page-terms", "De gepubliceerde solver en de Basic-modus"],
  ["safety-advisories", "een massieve rechthoek van 20 × 40"],
  ["safety-advisories", "bij elk profiel met Lb korter dan de staaf"],
  ["safety-advisories", "vergelijk daar de beweging met de voorgeschreven waarde"],
  ["safety-advisories", "In het gedocumenteerde voorbeeld in het Y–Z-vlak draaide dat"],
  ["stabileo-0-6-0", "component van de aslast in de lengterichting van de staaf"],
  ["stabileo-0-6-1", "werkelijk aangebrachte dwarswapening"],
  ["stabileo-0-5-0", "21 opgelost, is de torsietoets onvolledig"],
  ["stabileo-0-5-0", "Eenentwintig zijn opgelost"],
  ["stabileo-0-5-0", "een belasting op t = 0 op een massaloze vrijheidsgraad"],
  ["stabileo-0-5-0", "145.515"],
  ["stabileo-0-5-0", "8.192"],
  ["the-determinism-boundary", "ΣR + ΣF_applied = 0"],
  ["the-determinism-boundary", "geometrie, belastingen, oplegrichtingen en lokale assen"],
  ["when-results-change", "grootste dwarshelling"],
  ["torsion-bredt-saint-venant", "normaalspanningen door verhinderde welving"],
  ["verificacion-flexion-cirsoc-201", "het minimum de wapening bij toepassing van §9.6.1.2"],
  ["safety-advisories", "SA-2026-054 tot en met 063 zijn verholpen in 0.6.0, behalve SA-2026-056"],
])('known wrong result: #2613 — published %s states %s', (slug, expected) => {
  const page = slug.startsWith('page-') ? findStandingPage('/' + slug.slice(5)) : findPost(slug);
  expect(JSON.stringify(page?.i18n.nl)).toContain(expected);
});

it.each([
  ["course.kinematics.req.mechanism", "Controleer de opleggingen, scharnieren en verbindingen tussen de staven."],
  ["course.kinematics.gic.transRigid", "na aftrek van de opgelegde thermische verlenging"],
  ["course.kinematics.dm.introStates", "geen axiale belasting langs de staaf"],
  ["course.influence.states.why", "blijft aanwezig op de plaatsen waar ze is aangebracht"],
  ["course.influence.states.moving", "vast + min(0, treinminimum) tot vast + max(0, treinmaximum)"],
  ["course.influence.doc.use.worst.zones", "Voor beide extrema bedekt g"],
  ["course.influence.doc.use.worst.spans", "Voor beide extrema bedekt g"],
  ["course.dynamics.ui.points.help", "een geconcentreerde massa in ton"],
  ["course.plastic.trace.yield", "teken bij vloei, met |N| = Np"],
  ["course.plastic.user.type.overcomplete", "Mechanisme met extra scharnieren"],
  ["course.second-order.pd.convergenceNote", "Voor veldbelastingen blijven de eindkrachten van eerste orde"],
  ["course.second-order.doc.compare.why.phi", "Ook zonder veldbelasting blijft bij een eindig net een discretisatiefout"],
  ["course.second-order.doc.compare.rigid", "geometrische stijfheidsmatrix en de discretisatie"],
  ["course.second-order.doc.bk.det.caption", "nulpunten én sprongen bij polen"],
  ["steps.m.so-buckling-kg.opt.chord.help", "alleen de eigenvormen die door verplaatsbare knopen kunnen worden weergegeven"],
  ["seismic.system.mas_solid_unconfined", "niet-omsloten metselwerk"],
  ["stress.eccentricBiaxialNote", "lokale horizontale z-as"],
  ["loads.cirsoc102.meanRoofHeight", "dakhoogte"],
  ["loads.cirsoc102.qh", "dakhoogte"],
  ["loads.cirsoc102.unsupported.heightAboveTable", "dakhoogte"],
  ["loads.cirsoc101.dead.thicknessRequired", "volumegewicht in kN/m³"],
  ["steel.assume.webAndFlangeThicknessInferred", "opgegeven lijf- en flensdikten"],
  ["steel.assume.ultimateStrengthInferred", "opgegeven treksterkte Fu"],
  ["steel.assume.torsionalConstantZeroWhenAbsent", "Voor de kiptoets volgens F.2.4c is een geldige J vereist"],
  ["steel.rows.blockedBy.authority", "De app implementeert geen norm voor deze toetsing."],
  ["generator.problem.bayPositive", "De spantafstand"],
  ["generator.ui.bayVP", "Spantafstand"],
  ["steel.grades.label.nu", "Poissonverhouding"],
  ["material.custom.needNumbers", "Poissonverhouding"],
  ["material.custom.badNu", "Poissonverhouding"],
  ["steel.e4.notImplemented", "kan maatgevend zijn"],
  ["steel.f62.lambdaLabel", "b/(2·tf) voor I/H en b/tf voor U/C"],
  ["section.sheet.centroidUnavailable", "puntsymmetrie"],
  ["steel.tc.weldNoHoles", "Controleer de nettodoorsnede afzonderlijk"],
  ["steel.b41.c17", "volgens geval 17"],
  ["steps.frames.axial.selfStress", "N = (EA/L)δ"],
  ["steps.m.virtualWork.principleWhy", "opgelegde thermische kromming en rek"],
  ["steps.m.virtualWork.unitWhy", "Zonder axiale arbeid kan de uitkomst wel afhangen"],
  ["admin.users.title", "Gebruikers"],
  ["drawing.wall.vertical", "Verticaal: Ø{d} @{s} ρ {rho} ({by})"],
  ["footing.ui.name", "Naam"],
  ["scalarViewer.position", "Positie:"],
])('known wrong result: #2613 — %s states %s', (key, expected) => {
  expect(nl[key]).toContain(expected);
});

it.each([
  ["buckling-axial-from-elongation", "explanation", "Kg·u. De 3D-stijfheidsmatrix bevat ook de geometrische stijfheid van de schalen"],
  ["linear-small-displacement-warning", "explanation", "0,1 (dimensieloos)"],
  ["modal-massless-and-pivot", "title", "Ruimere singulariteitsdrempel"],
  ["rc-flanged-beams-designed-about-depth", "explanation", "getoetst op buiging over de doorsnedehoogte, om de horizontale doorsnedeas"],
  ["rc-flanged-beams-designed-about-depth", "title", "getoetst op buiging over de doorsnedehoogte, om de horizontale doorsnedeas"],
  ["shell-envelope-per-component", "explanation", "waar de von Mises-spanning uit de membraanspanningen in elke combinatie nul is"],
  ["snow-quadratic-intensity", "title", "Kwadratische sneeuwintensiteiten"],
])('known wrong result: #2613 — %s %s states %s', (id, field, expected) => {
  const notice = registry.changes.find(change => change.id === id);
  expect(field === 'title' ? notice?.title.nl : notice?.explanation.nl).toContain(expected);
});

it.each(Array.from({ length: 10 }, (_, index) => 54 + index))('known wrong result: #2613 — status of advisory %i in 0.6.0', number => {
  const id = 'SA-2026-' + String(number).padStart(3, '0');
  const blocks = findPost('safety-advisories')!.i18n.nl!.blocks;
  const rows = blocks.flatMap(block => block.k === 'table' ? block.rows : []);
  expect(rows.find(row => row[0] === id)?.at(-1)).toBe(number === 56 ? 'Onopgelost — onafhankelijke verificatie vereist' : 'Verholpen in 0.6.0');
});

it('known wrong result: #2613 — the Dutch channel report notice identifies the governing edge', () => {
  const notice = registry.changes.find(change => change.id === 'f62-channel-minimum-modulus');
  expect(notice?.explanation.nl).toContain('verst verwijderde flensrand');
  expect(notice?.title.nl).toContain('weerstandsmoment');
});

it('known wrong result: #2613 — a channel with missing yield stress cannot claim a computed Sy', () => {
  expect(nl['steel.f62.classificationUnavailable']).not.toContain('Sy');
  expect(nl['steel.f62.missing.slendernessLimits']).toMatch(/Fy.*14|14.*Fy/);
});

it.each(['nl', 'it'] as const)('known wrong result: #2613 — the 0.5.0 safety summary fits the %s search description', locale => {
  const excerpt = findPost('stabileo-0-5-0')!.i18n[locale]!.excerpt;
  expect(excerpt.length).toBeGreaterThanOrEqual(90);
  expect(excerpt.length).toBeLessThanOrEqual(300);
});

it.each(['solid', 'clayblock', 'concreteblock'])('known wrong result: #2613 — confined %s masonry is distinguished from unconfined masonry', material => {
  for (const [kind, description] of [['plain', 'omsloten metselwerk'], ['reinforced', 'omsloten gewapend metselwerk']]) {
    const label = nl['seismic.system.mas_' + material + '_confined_' + kind];
    expect(label).toContain('— ' + description);
    expect(label).not.toContain('niet-omsloten');
  }
});
