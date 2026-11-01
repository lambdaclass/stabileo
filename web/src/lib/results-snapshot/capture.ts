/**
 * One corpus case through the app's own path, as a flat snapshot (#716).
 *
 * The case is opened the way the app opens it (`modelStore.loadExample`, or a `.ded` through
 * `deserializeProject`), in its workspace, and solved by `solveNow` — the entry point Calcular,
 * Enter and the ribbon's Solve land on — so the snapshot is of what the engineer is shown: the
 * engine's output after the TypeScript finishing path (`solve-finish.ts`, `solver-service.ts`,
 * the combination and self-weight rules, the publish into the results store). Then, as the app
 * runs them:
 *
 *   - design on (PRO): the RC code check (`designRunStore.runCodeCheck`, what «Re-run analysis
 *     and design» runs), the CIRSOC 301 steel check (`runSteelCheck`), the footing run
 *     (`detailingStore.generateFloors({ families: ['footing'] })`), and every member's verdict as
 *     the design table reads it (`verificationStore.memberVerdict`, `getDisplayRatio`);
 *   - advanced (PRO): P-Δ, modal, spectral and buckling with the inputs and the post-processing
 *     of the Advanced tab (`ProAdvancedTab.svelte`).
 *
 * A refusal is recorded with its reason (in English): a solve that stops refusing, or refuses
 * for another reason, is a result change too.
 */
import { readFileSync } from 'node:fs';
import { modelStore } from '../store/model.svelte';
import { historyStore } from '../store/history.svelte';
import { uiStore } from '../store/ui.svelte';
import { resultsStore } from '../store/results.svelte';
import { verificationStore } from '../store/verification.svelte';
import { detailingStore } from '../store/detailing.svelte';
import { designRunStore } from '../store/design-run.svelte';
import { recheckStore } from '../store/recheck.svelte';
import { regulationsStore } from '../store/regulations.svelte';
import '../store';
import '../engine/design/adapters/cirsoc201-adapter';
import '../engine/design/adapters/unsupported-adapter';
import { deserializeProject } from '../store/file';
import { solveNow } from '../actions/solve';
import { runSteelCheck } from '../store/steel-check';
import { centerlineInput, dynamicInput } from '../store/dynamic-input';
import { solvePDelta3D, solveModal3D, solveBuckling3D, solveSpectral3D } from '../engine/wasm-solver';
import { amplification } from '../engine/pdelta-amplification';
import { spectralModesFrom, HORIZONTAL_DIRECTIONS } from '../engine/dynamics/requests';
import { previewCodeSpectrum } from '../store/spectrum-preview';
import { isBlocked, spectrumPoints, RISK_FACTOR } from '../codes/cirsoc103/spectrum';
import { findBehaviour, R_ELASTIC } from '../codes/cirsoc103/behaviour';
import { setLocale } from '../i18n';
import { errorText } from '../utils/error-text';
// @ts-expect-error plain JavaScript shared with the CI gate (no declaration file)
import { flatten, FORMAT } from '../../../scripts/results-snapshot/compare.mjs';
import type { SnapshotCase } from './corpus';

export interface Snapshot {
  case: string;
  covers: string;
  format: number;
  values: Record<string, number | string | boolean | null>;
}

type Values = Snapshot['values'];

/** Every store a case writes to, back to a fresh session's state. */
function reset(c: SnapshotCase): void {
  modelStore.clear();
  historyStore.clear();
  modelStore.setResultScopes(null);
  resultsStore.clear();
  verificationStore.clear();
  detailingStore.clear();
  designRunStore.resetMarks();
  recheckStore.reset();
  uiStore.analysisMode = c.workspace;
  uiStore.axisConvention3D = 'rightHand';
  // The app's defaults: PRO opens with self-weight on (and the example states its rule),
  // Basic with it off.
  uiStore.includeSelfWeight = c.workspace === 'pro';
  uiStore.designInPro = !!c.design;
}

async function open(c: SnapshotCase): Promise<void> {
  if ('example' in c.source) {
    await modelStore.loadExample(c.source.example);
  } else {
    const text = readFileSync(new URL(`../../../${c.source.ded}`, import.meta.url), 'utf8');
    if (!deserializeProject(text)) throw new Error(`${c.source.ded} does not open`);
    uiStore.analysisMode = c.workspace;
  }
  if (modelStore.nodes.size === 0) throw new Error(`${c.name}: the project opened empty`);
}

/** A solve's result, as numbers: displacements, reactions, member forces, shells, its diagnostics' codes. */
function analysis(prefix: string, r: unknown, out: Values): void {
  if (!r || typeof r !== 'object') { out[prefix] = null; return; }
  const { solverDiagnostics, structuredDiagnostics, diagnostics, ...rest } = r as Record<string, unknown>;
  const own: Values = {};
  flatten(rest, prefix, own);
  // A case with no loads gives zeros everywhere: one line says so. If it ever gives anything
  // else, `allZero` turning false is the change the gate reports.
  // A shell node's index is not one of the case's results.
  const numbers = Object.entries(own).filter(([k, v]) => typeof v === 'number' && !/\.nodeIndex$/.test(k)).map(([, v]) => v);
  if (numbers.length > 0 && numbers.every((v) => v === 0)) {
    out[`${prefix}.allZero`] = true;
    for (const [k, v] of Object.entries(own)) if (typeof v !== 'number') out[k] = v;
  } else {
    out[`${prefix}.allZero`] = false;
    Object.assign(out, own);
  }
  // The warnings and errors, by code: their messages carry formatted numbers, and the
  // informational ones name the factorisation the solver picked, which is not a result.
  const codes = (list: unknown) => (Array.isArray(list)
    ? list.filter((d: { severity?: string }) => d.severity === 'warning' || d.severity === 'error')
      .map((d: { code?: string; severity?: string; metric?: string }) => `${d.severity}:${d.code ?? d.metric ?? ''}`).sort().join(' ')
    : '');
  out[`${prefix}.diagnosticCodes`] = [codes(solverDiagnostics), codes(structuredDiagnostics), codes(diagnostics)].filter(Boolean).join(' | ');
}

function captureResults(out: Values): void {
  if (uiStore.is3DWorkspace) {
    analysis('base', resultsStore.singleResults3D ?? resultsStore.results3D, out);
    for (const [id, r] of resultsStore.perCase3D) analysis(`case[${id}]`, r, out);
    for (const [id, r] of resultsStore.perCombo3D) analysis(`combo[${id}]`, r, out);
    if (resultsStore.unstableCombinations3D.length) out['unstableCombinations'] = resultsStore.unstableCombinations3D.join(',');
  } else {
    analysis('base', resultsStore.singleResults ?? resultsStore.results, out);
    for (const [id, r] of resultsStore.perCase) analysis(`case[${id}]`, r, out);
    for (const [id, r] of resultsStore.perCombo) analysis(`combo[${id}]`, r, out);
  }
}

function captureDesign(out: Values): void {
  const code = designRunStore.runCodeCheck();
  out['design.codeCheck.ok'] = code.ok;
  if (!code.ok) out['design.codeCheck.refusal'] = `${code.reasonKey ?? ''} ${JSON.stringify(code.params ?? {})}`;
  const steel = runSteelCheck();
  out['design.steelCheck'] = 'refused' in steel ? `refused:${steel.refused}` : `checked:${steel.checked}`;
  // Every member's verdict as the design table, the counts and the viewport read it.
  for (const id of [...modelStore.elements.keys()].sort((a, b) => a - b)) {
    const v = verificationStore.memberVerdict(id);
    const p = `design.member[e${id}]`;
    out[`${p}.status`] = v.status;
    out[`${p}.local`] = v.local;
    out[`${p}.holds`] = v.holds.map((h) => `${h.kind}:${h.key}${h.params ? JSON.stringify(h.params) : ''}`).join(' ');
    out[`${p}.assumptions`] = v.assumptions.map((a) => a.key).join(' ');
    flatten(verificationStore.getDisplayRatio(id), `${p}.ratio`, out);
  }
  // The code check's required steel and utilisation per member, and the steel limit states.
  for (const d of verificationStore.design) flatten(d, `design.rc[e${(d as { elementId: number }).elementId}]`, out);
  for (const s of verificationStore.steel) flatten(s, `design.steel[e${(s as { elementId: number }).elementId}]`, out);
  if (modelStore.model.footings.size > 0) {
    const run = detailingStore.generateFloors({ verifierId: 'cirsoc201.provided.v2.2025', families: ['footing'] });
    out['design.footings.ran'] = run !== null;
    if (run === null) out['design.footings.refusal'] = detailingStore.lastError ?? '';
    for (const o of detailingStore.lastFootingRun?.outcomes ?? []) {
      // The footing's physical bars carry ids and revisions; its verdict, checks and mat are the result.
      const { assembly: _assembly, records: _records, ...result } = o as unknown as Record<string, unknown>;
      flatten(result, `design.footing[#${o.footingId}]`, out);
    }
  }
}

/** The Advanced tab's runs, with its inputs and its reading of each result. */
function captureAdvanced(c: SnapshotCase, out: Values): void {
  const guard = (name: string, run: () => void) => {
    try { run(); } catch (e) { out[`${name}.refusal`] = errorText(e, 'Error'); }
  };
  let modal: { modes?: unknown[] } | null = null;
  for (const a of c.advanced ?? []) {
    if (a === 'pdelta') guard('pdelta', () => {
      const res = solvePDelta3D(centerlineInput({ caseDisplacements: true }));
      if (typeof res === 'string') { out['pdelta.refusal'] = res; return; }
      const amp = res.results ? amplification(res as never) : { b2: Infinity, stable: false };
      flatten({ converged: !!res.converged, iterations: res.iterations ?? 0, b2: amp.b2, stable: amp.stable }, 'pdelta', out);
      analysis('pdelta.results', res.results, out);
    });
    if (a === 'modal') guard('modal', () => {
      const { input, densities } = dynamicInput();
      const res = solveModal3D(input, densities, 6);
      if (typeof res === 'string') { out['modal.refusal'] = res; return; }
      modal = res as never;
      flatten((res as { totalMass?: number }).totalMass, 'modal.totalMass', out);
      // Frequencies and mass ratios; the shapes and participation factors have an arbitrary sign.
      ((res as { modes?: Array<Record<string, number>> }).modes ?? []).forEach((m, i) => {
        flatten({ frequency: m.frequency, period: m.period, massRatioX: m.massRatioX, massRatioY: m.massRatioY, massRatioZ: m.massRatioZ }, `modal.mode[${i + 1}]`, out);
      });
    });
    if (a === 'spectral') guard('spectral', () => {
      if (!modal) { out['spectral.refusal'] = 'no modal result'; return; }
      const settings = regulationsStore.binding('seismic')?.settings as
        { zone?: number; site?: string; destinationGroup?: string; systemKey?: string; elastic?: boolean } | undefined;
      const settingsR = settings?.elastic ? R_ELASTIC : settings?.systemKey ? findBehaviour(settings.systemKey)?.r : undefined;
      const zone = settings?.zone && settings.zone > 0 ? settings.zone : 3;
      const site = settings?.site ?? 'SD';
      const group = settings?.destinationGroup ?? 'B';
      const cs = previewCodeSpectrum({ zone, site } as never);
      if (isBlocked(cs)) { out['spectral.refusal'] = JSON.stringify(cs.blocked); return; }
      const { input, densities } = dynamicInput();
      const spectrum = { name: 'code', points: spectrumPoints(cs as never), inG: true };
      const modes = spectralModesFrom(modal as never);
      for (const direction of HORIZONTAL_DIRECTIONS) {
        const res = solveSpectral3D({ solver: input, modes, densities, spectrum, direction, rule: 'CQC', importanceFactor: RISK_FACTOR[group as keyof typeof RISK_FACTOR], reductionFactor: settingsR ?? 1, xi: 0.05 } as never);
        if (typeof res === 'string') { out[`spectral.${direction}.refusal`] = res; continue; }
        analysis(`spectral.${direction}`, res, out);
      }
    });
    if (a === 'buckling') guard('buckling', () => {
      const res = solveBuckling3D(centerlineInput(), 4);
      if (typeof res === 'string') { out['buckling.refusal'] = res; return; }
      const factors = (res as { factors?: number[]; eigenvalues?: number[]; modes?: Array<{ loadFactor?: number; factor?: number; eigenvalue?: number }> });
      flatten(factors.factors ?? factors.eigenvalues ?? factors.modes?.map((m) => m.loadFactor ?? m.factor ?? m.eigenvalue) ?? [], 'buckling.factors', out);
    });
  }
}

/**
 * Run one case and return its snapshot. `afterOpen` edits the opened project before the solve:
 * the negative test's deliberate result change (`__tests__/negative.test.ts`).
 */
export async function capture(c: SnapshotCase, opts: { afterOpen?: () => void } = {}): Promise<Snapshot> {
  setLocale('en');
  reset(c);
  await open(c);
  opts.afterOpen?.();
  const values: Values = {};
  values['model.nodes'] = modelStore.nodes.size;
  values['model.elements'] = modelStore.elements.size;
  values['model.shells'] = modelStore.quads.size + modelStore.plates.size;
  const outcome = await solveNow();
  values['solve.ok'] = outcome.ok;
  if (!outcome.ok) values['solve.refusal'] = outcome.error;
  else {
    captureResults(values);
    if (c.design) captureDesign(values);
    if (c.advanced) captureAdvanced(c, values);
  }
  return { case: c.name, covers: c.covers, format: FORMAT, values };
}
