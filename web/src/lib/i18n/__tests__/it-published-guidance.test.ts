import { expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { allDictFor } from '../locales/all';
import { unfinishedProClaims } from '../pro-copy';
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

it.skip.each([
  ["0.4.0", releaseNotes("0.4.0").split('\n').find(line => line.startsWith('| [SA-2026-021]')), "Rigenera i carichi di vento e verifica che siano presenti le direzioni lungo il colmo e trasversale"],
  ["0.4.0", releaseNotes("0.4.0").split('\n').find(line => line.startsWith('| [SA-2026-022]')), "Rigenera le combinazioni e verifica che includano i casi in cui il permanente è stabilizzante"],
  ["0.6.2", releaseNotes("0.6.2"), "una verifica con esito positivo"],
  ["0.6.2", releaseNotes("0.6.2"), "le verifiche precedenti avevano avuto esito positivo o i risultati erano certificati"],
  ["cusp", JSON.stringify(feher.it.cusp), "il solutore non trova un equilibrio vicino e la lamina potrebbe scattare"],
  ["limits", JSON.stringify(feher.it.limits), "senza escludere altri equilibri"],
  ["interactive", JSON.stringify(feher.it.interactive), "il calcolo riparte quando confermi la modifica"],
  ["interactive", JSON.stringify(feher.it.interactive), "la lamina potrebbe scattare"],
  ["why", JSON.stringify(feher.it.why), "EA resta finito e la deformazione assiale misurata"],
  ["riser", riserHook.it, "come varia il momento flettente vicino al distacco"],
  ["damageLimitation", STRINGS.it.damageLimitation, "Un danno negativo produce una rigidezza superiore a quella integra"],
  ["tools.peak.max", hubTranslations.it["tools.peak.max"], "max |x|"],
  ["methodText", articleStrings('it').methodText, "peso unitario per il termine di carico"],
  ["accuracy", articleStrings('it').accuracy, "peso unitario soddisfa |Δλ| ≤ Δs / ‖f_ref‖"],
  ["conceptual-side-advanced-tools", JSON.stringify(findPost("conceptual-side-advanced-tools")?.i18n.it), "occorre verificare anche la stabilità cinematica"],
  ["how-stabileo-checks-its-results", JSON.stringify(findPost("how-stabileo-checks-its-results")?.i18n.it), "la sovrapposizione vale per la risposta lineare"],
  ["learn-structural-analysis-step-by-step", JSON.stringify(findPost("learn-structural-analysis-step-by-step")?.i18n.it), "ridondanze meno il numero di meccanismi"],
  ["learn-structural-analysis-step-by-step", JSON.stringify(findPost("learn-structural-analysis-step-by-step")?.i18n.it), "entrambi disattivati fino alla correzione"],
  ["page-cirsoc", JSON.stringify(findStandingPage("/cirsoc")?.i18n.it), "Un rapporto parziale non stabilisce"],
  ["page-reliability", JSON.stringify(findStandingPage("/reliability")?.i18n.it), "Solo i risultati supportati ricevono"],
  ["page-reliability", JSON.stringify(findStandingPage("/reliability")?.i18n.it), "La certificazione numerica riguarda solo"],
  ["page-privacy", JSON.stringify(findStandingPage("/privacy")?.i18n.it), "Condivisione dei dati d’uso:"],
  ["page-privacy", JSON.stringify(findStandingPage("/privacy")?.i18n.it), "La stessa scelta associa al tuo account"],
  ["safety-advisories", JSON.stringify(findPost("safety-advisories")?.i18n.it), "solo se hai verificato indipendentemente che governa"],
  ["safety-advisories", JSON.stringify(findPost("safety-advisories")?.i18n.it), "deve coincidere con il valore prescritto"],
  ["safety-advisories", JSON.stringify(findPost("safety-advisories")?.i18n.it), "SA-2026-058 — Correzione della PR #1922 pubblicata nella 0.6.0."],
  ["safety-advisories", JSON.stringify(findPost("safety-advisories")?.i18n.it), "SA-2026-061 — Correzione della PR #1952 pubblicata nella 0.6.0."],
  ["safety-advisories", JSON.stringify(findPost("safety-advisories")?.i18n.it), "SA-2026-063 — Correzione della PR #2009 pubblicata nella 0.6.0."],
  ["stabileo-0-6-1", JSON.stringify(findPost("stabileo-0-6-1")?.i18n.it), "Verificale indipendentemente o riesegui le verifiche con la 0.6.2"],
  ["same-model-same-numbers", JSON.stringify(findPost("same-model-same-numbers")?.i18n.it), "SA-2026-035 ricrea il taglio 2D dal modello 3D originale e per SA-2026-039 reimporta"],
  ["when-results-change", JSON.stringify(findPost("when-results-change")?.i18n.it), "Sotto il peso proprio la compressione è massima all’incastro e il fattore era troppo basso"],
  ["torsion-bredt-saint-venant", JSON.stringify(findPost("torsion-bredt-saint-venant")?.i18n.it), "anche per le sezioni chiuse."],
  ["torsion-bredt-saint-venant", JSON.stringify(findPost("torsion-bredt-saint-venant")?.i18n.it), "Bredt approssima la tensione media"],
  ["the-determinism-boundary", JSON.stringify(findPost("the-determinism-boundary")?.i18n.it), "ΣR + ΣF_applicate = 0"],
  ["the-determinism-boundary", JSON.stringify(findPost("the-determinism-boundary")?.i18n.it), "80,8"],
  ["verificacion-flexion-cirsoc-201", JSON.stringify(findPost("verificacion-flexion-cirsoc-201")?.i18n.it), "2,9762"],
  ["course.kinematics.dm.stiff.threeWhy", italian["course.kinematics.dm.stiff.threeWhy"], "trasferisce metà della correzione di rilascio all’altro estremo se bloccato"],
  ["course.influence.states.env", italian["course.influence.states.env"], "N e M concomitanti di ogni combinazione"],
  ["course.plastic.mech.axialNote", italian["course.plastic.mech.axialNote"], "Np·|Δ|"],
  ["steps.m.so-pdelta-kg.help", italian["steps.m.so-pdelta-kg.help"], "con la matrice consistente, la stessa suddivisione e la stessa rigidezza assiale finita"],
  ["course.statics.vw.why.relDisp", italian["course.statics.vw.why.relDisp"], "il momento della coppia è nullo in ogni direzione"],
  ["course.plastic.kin.midLoad", italian["course.plastic.kin.midLoad"], "punto medio del tratto caricato"],
  ["course.plastic.kin.positionLead", italian["course.plastic.kin.positionLead"], "dal punto medio del tratto caricato"],
  ["steel.workflow.geometry.lbDetail", italian["steel.workflow.geometry.lbDetail"], "Verifica il ritegno laterale effettivo"],
  ["steel.assume.netAreaEqualsGross", italian["steel.assume.netAreaEqualsGross"], "serve Ae = An·U"],
  ["steel.assume.noPlasticMomentCap", italian["steel.assume.noPlasticMomentCap"], "applica il limite Mp ≤ 1,5·My"],
  ["steel.rows.why.shapeScope", italian["steel.rows.why.shapeScope"], "La verifica a flessione di questa fase"],
  ["steel.rows.why.shapeScope", italian["steel.rows.why.shapeScope"], "verifiche di compressione §§E.5–E.6"],
  ["steel.e4.notImplemented", italian["steel.e4.notImplemented"], "Può governare per angolari"],
  ["steps.deformation.axialLead", italian["steps.deformation.axialLead"], "Il lavoro assiale meccanico vale ∫N(x)n(x)/(EA) dx, pari a N·n·L/EA su ciascun tratto con N, n ed EA costanti:"],
  ["steps.deformation.axialTruss", italian["steps.deformation.axialTruss"], "contributi termici, delle molle e dei cedimenti"],
  ["steps.deformation.axialTrussAlways", italian["steps.deformation.axialTrussAlways"], "termici, delle molle e dei cedimenti"],
  ["steps.deformation.dir.z", italian["steps.deformation.dir.z"], "nella direzione della forza unitaria"],
  ["buckling-axial-from-elongation", JSON.stringify(notices.find(change => change.id === "buckling-axial-from-elongation")?.explanation.it), "rigidezza geometrica dei gusci entra nell’assemblaggio globale"],
  ["concurrent-check-demands", JSON.stringify(notices.find(change => change.id === "concurrent-check-demands")?.explanation.it), "la lunghezza non controventata dell’ala inferiore"],
  ["corotational-member-load-frame", JSON.stringify(notices.find(change => change.id === "corotational-member-load-frame")?.title.it), "Le azioni di estremità dei carichi permanenti sono espresse nel riferimento finale dell’asta"],
  ["ground-motion-coupled-mass", JSON.stringify(notices.find(change => change.id === "ground-motion-coupled-mass")?.explanation.it), "include il contributo di forza −M_fr·r_r·a_g(t) per accelerazione uniforme del suolo"],
  ["withheld-pdelta-equilibrium-forces", JSON.stringify(notices.find(change => change.id === "withheld-pdelta-equilibrium-forces")?.title.it), "un residuo fisico entro la tolleranza"],
  ["withheld-pdelta-equilibrium-forces", JSON.stringify(notices.find(change => change.id === "withheld-pdelta-equilibrium-forces")?.explanation.it), "Un residuo fisico entro la tolleranza conserva"],
  ["snow-ridge-mesh", JSON.stringify(notices.find(change => change.id === "snow-ridge-mesh")?.explanation.it), "Anche per un’asta non suddivisa la pressione generata viene ripartita al colmo fisico, conservando forza e momento"],
  ["snow-crossing-profile", JSON.stringify(notices.find(change => change.id === "snow-crossing-profile")?.explanation.it), "anche su un’asta non suddivisa"],
] as const)('known wrong result: #2595 — %s includes %s', (_surface, actual, expected) => {
  expect(actual).toContain(expected);
});

it.skip.each(['pt', 'tr', 'zh'] as const)('known wrong result: #2595 — %s names the missing yield strength for case 14', locale => {
  const message = allDictFor(locale)['steel.f62.missing.slendernessLimits'];
  expect(message).toMatch(/Fy/);
  expect(message).toContain('√(E/Fy)');
});

it.skip('known wrong result: #2595 — Italian tool names distinguish AI from the preposition', () => {
  expect(unfinishedProClaims('Assistente AI per il calcolo in beta', 'it', { aboutPro: true })).toEqual([]);
  const sentence = 'In beta gli strumenti ai quali accedere';
  expect(unfinishedProClaims(sentence, 'it', { aboutPro: true })).toEqual([sentence]);
});
