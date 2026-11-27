import { expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { allDictFor } from '../locales/all';
import { unfinishedProClaims } from '../pro-copy';
import { f62Report } from '../../engine/steel/flange-local-buckling';
import { findPost } from '../../blog';
import { findStandingPage } from '../../blog/pages';
import { readRegistry } from '../../../../scripts/result-changes/registry.mjs';
import { translations as feher } from '../../../components/research/feher2026/strings';
import { articleStrings } from '../../../components/research/riksCrisfield/article';
import { riserHook } from '../../../components/research/gayNeto2014/card';
import { STRINGS } from '../../../components/research/i18n';
import { hubTranslations } from '../../../components/tools/hub-i18n';

const italian = allDictFor('it');
const notices = readRegistry().changes;

function releaseNotes(version: string) {
  return readFileSync(new URL(`../../../../../docs/releases/v${version}.it.md`, import.meta.url), 'utf8');
}

it.each([
  ["course.kinematics.dm.stiff.threeWhy", "trasferisce metà della correzione di rilascio all’altro estremo se bloccato"],
  ["course.influence.states.env", "N e M concomitanti di ogni combinazione"],
  ["course.plastic.mech.axialNote", "Np·|Δ|"],
  ["steps.m.so-pdelta-kg.help", "con la matrice consistente, la stessa suddivisione e la stessa rigidezza assiale finita"],
  ["course.statics.vw.why.relDisp", "il momento della coppia è nullo in ogni direzione"],
  ["course.plastic.kin.midLoad", "punto medio del tratto caricato"],
  ["course.plastic.kin.positionLead", "dal punto medio del tratto caricato"],
  ["steel.workflow.geometry.lbDetail", "Verifica il ritegno laterale effettivo"],
  ["steel.assume.netAreaEqualsGross", "serve Ae = An·U"],
  ["steel.assume.noPlasticMomentCap", "applica il limite Mp ≤ 1,5·My"],
  ["steel.rows.why.shapeScope", "La verifica a flessione di questa fase"],
  ["steel.rows.why.shapeScope", "verifiche di compressione §§E.5–E.6"],
  ["steel.e4.notImplemented", "Può governare per angolari"],
  ["steps.deformation.axialLead", "Il lavoro assiale meccanico vale ∫N(x)n(x)/(EA) dx, pari a N·n·L/EA su ciascun tratto con N, n ed EA costanti:"],
  ["steps.deformation.axialTruss", "contributi termici, delle molle e dei cedimenti"],
  ["steps.deformation.axialTrussAlways", "termici, delle molle e dei cedimenti"],
  ["steps.deformation.dir.z", "nella direzione della forza unitaria"],
] as const)('Italian guidance for %s (case %#)', (key, expected) => {
  expect(italian[key]).toContain(expected);
});

it.each([
  ["0.4.0", "021", "Rigenera i carichi di vento e verifica che siano presenti le direzioni lungo il colmo e trasversale"],
  ["0.4.0", "022", "Rigenera le combinazioni e verifica che includano i casi in cui il permanente è stabilizzante"],
  ["0.6.2", "", "una verifica con esito positivo"],
  ["0.6.2", "", "le verifiche precedenti avevano avuto esito positivo o i risultati erano certificati"],
] as const)('Italian release %s recovery instructions (case %#)', (version, advisory, expected) => {
  const notes = releaseNotes(version);
  const text = advisory ? notes.split('\n').find(line => line.startsWith(`| [SA-2026-${advisory}]`)) : notes;
  expect(text).toContain(expected);
});

it.each([
  ["conceptual-side-advanced-tools", "occorre verificare anche la stabilità cinematica"],
  ["how-stabileo-checks-its-results", "la sovrapposizione vale per la risposta lineare"],
  ["learn-structural-analysis-step-by-step", "ridondanze meno il numero di meccanismi"],
  ["learn-structural-analysis-step-by-step", "entrambi disattivati fino alla correzione"],
  ["page-cirsoc", "Un rapporto parziale non stabilisce"],
  ["page-reliability", "Solo i risultati supportati ricevono"],
  ["page-reliability", "La certificazione numerica riguarda solo"],
  ["page-privacy", "Condivisione dei dati d’uso:"],
  ["page-privacy", "La stessa scelta associa al tuo account"],
  ["safety-advisories", "solo se hai verificato indipendentemente che governa"],
  ["safety-advisories", "deve coincidere con il valore prescritto"],
  ["safety-advisories", "SA-2026-058 — Correzione della PR #1922 pubblicata nella 0.6.0."],
  ["safety-advisories", "SA-2026-061 — Correzione della PR #1952 pubblicata nella 0.6.0."],
  ["safety-advisories", "SA-2026-063 — Correzione della PR #2009 pubblicata nella 0.6.0."],
  ["stabileo-0-6-1", "Verificale indipendentemente o riesegui le verifiche con la 0.6.2"],
  ["same-model-same-numbers", "SA-2026-035 ricrea il taglio 2D dal modello 3D originale e per SA-2026-039 reimporta"],
  ["when-results-change", "Sotto il peso proprio la compressione è massima all’incastro e il fattore era troppo basso"],
  ["torsion-bredt-saint-venant", "Bredt approssima la tensione media"],
  ["the-determinism-boundary", "ΣR + ΣF_applicate = 0"],
  ["verificacion-flexion-cirsoc-201", "2,9762"],
] as const)('Italian publication %s (case %#)', (slug, expected) => {
  const body = slug.startsWith('page-')
    ? findStandingPage('/' + slug.slice(5))?.i18n.it
    : findPost(slug)?.i18n.it;
  expect(JSON.stringify(body)).toContain(expected);
});

it('uses decimal commas in the Italian determinism comparison tables', () => {
  const tables = findPost('the-determinism-boundary')!.i18n.it!.blocks.filter(block => block.k === 'table');
  expect(tables.flatMap(table => table.rows.flat())).toContain('80,8');
  for (const table of tables) expect(table.rows.flat().filter(cell => /^-?\d+\.\d+$/.test(cell))).toEqual([]);
});

it.each([
  ["buckling-axial-from-elongation", "explanation", "rigidezza geometrica dei gusci entra nell’assemblaggio globale"],
  ["concurrent-check-demands", "explanation", "la lunghezza non controventata dell’ala inferiore"],
  ["corotational-member-load-frame", "title", "Le azioni di estremità dei carichi permanenti sono espresse nel riferimento finale dell’asta"],
  ["ground-motion-coupled-mass", "explanation", "include il contributo di forza −M_fr·r_r·a_g(t) per accelerazione uniforme del suolo"],
  ["withheld-pdelta-equilibrium-forces", "title", "un residuo fisico entro la tolleranza"],
  ["withheld-pdelta-equilibrium-forces", "explanation", "Un residuo fisico entro la tolleranza conserva"],
  ["snow-ridge-mesh", "explanation", "Anche per un’asta non suddivisa la pressione generata viene ripartita al colmo fisico, conservando forza e momento"],
  ["snow-crossing-profile", "explanation", "anche su un’asta non suddivisa"],
] as const)('Italian result notice %s %s', (id, field, expected) => {
  expect(notices.find(change => change.id === id)?.[field].it).toContain(expected);
});

it.each([
  ["cusp", feher.it.cusp, "il solutore non trova un equilibrio vicino e la lamina potrebbe scattare"],
  ["limits", feher.it.limits, "senza escludere altri equilibri"],
  ["interactive", feher.it.interactive, "il calcolo riparte quando confermi la modifica"],
  ["interactive", feher.it.interactive, "la lamina potrebbe scattare"],
  ["why", JSON.stringify(feher.it.why.items), "EA resta finito e la deformazione assiale misurata"],
  ["riser", riserHook.it, "come varia il momento flettente vicino al distacco"],
  ["damageLimitation", STRINGS.it.damageLimitation, "Un danno negativo produce una rigidezza superiore a quella integra"],
  ["tools.peak.max", hubTranslations.it["tools.peak.max"], "max |x|"],
  ["methodText", articleStrings('it').methodText, "peso unitario per il termine di carico"],
  ["accuracy", articleStrings('it').accuracy, "peso unitario soddisfa |Δλ| ≤ Δs / ‖f_ref‖"],
] as const)('Italian research and tool guidance for %s', (key, actual, expected) => {
  expect(actual, key).toContain(expected);
});

it.each(['pt', 'tr', 'zh'] as const)('known wrong result: #2595 — %s names the missing yield strength for case 14', locale => {
  const message = allDictFor(locale)['steel.f62.missing.slendernessLimits'];
  expect(message).toMatch(/Fy/);
  expect(message).toContain('√(E/Fy)');
});

it('known wrong result: #2595 — Italian tool names distinguish AI from the preposition', () => {
  expect(unfinishedProClaims('Assistente AI per il calcolo in beta', 'it', { aboutPro: true })).toEqual([]);
  const sentence = 'In beta gli strumenti ai quali accedere';
  expect(unfinishedProClaims(sentence, 'it', { aboutPro: true })).toEqual([sentence]);
});

it.skip.each(['en', 'es', 'pt', 'de', 'fr', 'tr', 'hu', 'it', 'zh'] as const)(
  'known wrong result: #2595 — %s explains the missing-Fy channel report without claiming a modulus',
  locale => {
    const report = f62Report({ shape: 'C', b: 0.1, tf: 0.01, iMinor: 1e-6 });
    expect(report.syM3).toBeNull();
    const dict = allDictFor(locale);
    expect(dict[report.reasonKey]).not.toContain('Sy');
    for (const key of [report.reasonKey, ...report.missingKeys]) {
      expect(dict[key]).toContain('Fy');
      expect(dict[key]).toContain('14');
    }
  },
);
