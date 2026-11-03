/**
 * The provenance of the results on screen, gathered from the live stores
 * (`provenance/result-provenance.ts` holds the record, its hashes and its printing).
 *
 * Computed when asked (a report, an export, the reproduce dialog), not at every publish: hashing a
 * large model's results costs tens of milliseconds and live calc publishes on every edit. That is
 * sound because results never outlive the model they came from: any model mutation clears them
 * (`store/index.ts`), so the model read here is the one that was solved. Reinforcement edits do
 * not clear analysis results, and are part of the model hash: they are inputs of the design
 * checks, which re-run on them.
 */
import { modelStore } from './model.svelte';
import { resultsStore } from './results.svelte';
import { uiStore } from './ui.svelte';
import { certificateStore } from './certificate.svelte';
import { recheckStore } from './recheck.svelte';
import { buildIdentity } from '../provenance/build-identity';
import { RESULTS_VERSION } from '../provenance/registry';
import { RESULTS_SCHEMA_VERSION } from '../provenance/solve-stamp';
import { exactHash } from '../provenance/exact-hash';
import {
  buildResultProvenance, modelHash, resultsHash, type ScopeRef, type AnalysisSettings, type CertificateRecord, type ProvenanceLabels, type ResultProvenance,
} from '../provenance/result-provenance';
import { t } from '../i18n';
import { certifiableInputOf, type CertifiableInput } from '../engine/solver-service';
import { runCertify, hasCertify } from '../engine/certify-jobs';

/**
 * The engine input of the base linear solve on screen (null: none, or not a plain linear solve).
 * Set by the static-publish hook in `store/index.ts`, from the raw result before it is drawn.
 */
let baseInput: CertifiableInput | null = null;
let baseSolveMethod: ResultProvenance['baseSolveMethod'];
/** The engine's hashes of `baseInput`, once computed (`ensureEngineHashes`). */
let engineHashCache: { input: CertifiableInput; hashes: { input: string; results: string } | null } | null = null;
let engineHashPending: { input: CertifiableInput; promise: Promise<{ input: string; results: string } | null> } | null = null;
let engineHashRuns = 0;

export function noteBaseSolve(results: object | null): void {
  baseInput = results ? certifiableInputOf(results) : null;
  baseSolveMethod = baseInput ? 'direct' : undefined;
}

/**
 * The base result on screen was put together from the case solves (live-calc's combination path):
 * it has no engine input of its own, so the provenance names the engine input of a direct single
 * solve of the same model (`modelStore.singleSolveInput3D`). Called right after that publish.
 */
export function noteBaseSolveInput(input: CertifiableInput | null, method: ResultProvenance['baseSolveMethod']): void {
  baseInput = input;
  baseSolveMethod = method;
}

/** The solver input of the base solve, as JSON, for the CLI reproduce (`examples/reproduce.rs`). */
export function baseSolverInputJson(): { dim: '2d' | '3d'; json: string } | null {
  return baseInput ? { dim: baseInput.dim, json: JSON.stringify(baseInput.wire()) } : null;
}

/** Which engine input a wire is (the engine's `is_3d`): not a workspace check. */
const SPACE_INPUT = { '2d': false, '3d': true } as const;

/**
 * The engine's own hashes of the base solve: one more engine solve, so it runs in a worker of the
 * pool (on this thread only where there is no pool), once per base solve, and is cached. Exports
 * await it before they read the record; building a record never solves (`currentResultProvenance`
 * reads the cache, and says "none" when it is empty).
 */
export async function ensureEngineHashes(): Promise<{ input: string; results: string } | null> {
  const input = baseInput;
  if (!input || !hasCertify('engine_reproduce_hashes')) return null;
  if (engineHashCache?.input === input) return engineHashCache.hashes;
  if (engineHashPending?.input === input) return engineHashPending.promise;
  engineHashRuns++;
  const promise = (async () => {
    try {
      const h = await runCertify('engine_reproduce_hashes', [JSON.stringify(input.wire()), SPACE_INPUT[input.dim]]) as { inputSha256: string; resultsSha256: string };
      return { input: h.inputSha256, results: h.resultsSha256 };
    } catch {
      return null;
    }
  })();
  engineHashPending = { input, promise };
  const hashes = await promise;
  if (engineHashPending?.input === input) engineHashPending = null;
  if (baseInput === input) engineHashCache = { input, hashes };
  return hashes;
}

/** Test seam: how many engine hash runs have started. */
export function engineHashRunCount(): number { return engineHashRuns; }

/** The cached engine hashes of the base solve on screen, or null (never computed here). */
function cachedEngineHashes(): { input: string; results: string } | null {
  return baseInput && engineHashCache?.input === baseInput ? engineHashCache.hashes : null;
}

export function currentAnalysisSettings(): AnalysisSettings {
  const is3D = uiStore.is3DWorkspace;
  return {
    analysisMode: uiStore.analysisMode,
    includeSelfWeight: uiStore.includeSelfWeight,
    selfWeightCaseId: uiStore.selfWeightCaseId,
    axisConvention3D: uiStore.axisConvention3D,
    ...(is3D ? {} : { drawPlane2D: String(uiStore.drawPlane2D) }),
  };
}

/** Which result is on screen, as something a re-run can select again. */
export function currentScopeRef(): ScopeRef {
  const is3D = uiStore.is3DWorkspace;
  const view = resultsStore.activeView;
  let ref: ScopeRef;
  if (view === 'envelope') ref = { kind: 'envelope', name: is3D ? resultsStore.viewedEnvelopeName : null };
  else if (view === 'combo' && resultsStore.activeComboId !== null) ref = { kind: 'combo', id: resultsStore.activeComboId };
  else if (resultsStore.activeCaseId !== null && resultsStore.activeCaseId !== undefined) ref = { kind: 'case', id: resultsStore.activeCaseId };
  else ref = { kind: 'single' };
  // What is drawn is not the result that scope names (a P-Delta or a collapse on screen): a
  // re-solve cannot give it back, and the record says so rather than naming the base solve.
  const shown = is3D ? resultsStore.results3D : resultsStore.results;
  if (shown && resultForScope(ref) !== shown) return { kind: 'other', label: String(resultsStore.diagramType) };
  return ref;
}

/**
 * The result a scope names in the results on hand, or null when there is none. The same lookup
 * the views make (`results.svelte.ts` activeView / activeComboId / activeCaseId).
 */
export function resultForScope(ref: ScopeRef | undefined): object | null {
  if (!ref) return null;
  const is3D = uiStore.is3DWorkspace;
  switch (ref.kind) {
    case 'single': return (is3D ? resultsStore.singleResults3D : resultsStore.singleResults) ?? null;
    case 'case': return (is3D ? resultsStore.perCase3D : resultsStore.perCase).get(ref.id) ?? null;
    case 'combo': return (is3D ? resultsStore.perCombo3D : resultsStore.perCombo).get(ref.id) ?? null;
    case 'envelope': {
      if (!is3D) return ref.name === null ? resultsStore.envelope?.maxAbsResults ?? null : null;
      if (ref.name === null) return resultsStore.envelope3D?.maxAbsResults3D ?? null;
      // A named envelope is a view built over the solve; it is not there after a re-solve unless
      // the same one is being shown.
      return resultsStore.viewedEnvelopeName === ref.name ? resultsStore.fullEnvelope3D?.maxAbsResults3D ?? null : null;
    }
    case 'other': return null;
  }
}

/** A scope by name, for the printed record. */
export function scopeLabel(ref: ScopeRef): string {
  switch (ref.kind) {
    case 'single': return 'single';
    case 'case': return `case ${ref.id} (${modelStore.getLoadCaseName(ref.id) ?? ''})`;
    case 'combo': {
      const c = modelStore.model.combinations.find((x) => x.id === ref.id);
      return `combination ${ref.id}${c ? ` (${c.name})` : ''}`;
    }
    case 'envelope': return ref.name === null ? 'envelope' : `envelope "${ref.name}"`;
    case 'other': return `other (${ref.label})`;
  }
}

/** Which result is on screen, by name. */
export function currentScope(): string {
  return scopeLabel(currentScopeRef());
}

/** The certificate of the result a scope names (not of what is on screen), when it is done. */
function certificates(ref: ScopeRef): CertificateRecord[] {
  if (ref.kind === 'other' || (ref.kind === 'envelope' && ref.name !== null)) return [];
  const st = certificateStore.forScope(uiStore.is3DWorkspace, ref.kind === 'envelope' ? { kind: 'envelope' } : ref);
  if (st.status !== 'done') return [];
  const { certificate } = st;
  return [{
    scope: scopeKey(ref),
    status: certificate.status,
    hash: exactHash({
      certificate,
      forceBounds: st.forceBounds, shellBounds: st.shellBounds, stationBounds: st.stationBounds,
      deflectionBounds: st.deflectionBounds, reactionBounds: st.reactionBounds,
    }),
    ...(certificate.status === 'certified' ? { absBound: certificate.absBound } : {}),
  }];
}

/** A scope as a certificate's key in the record: `single`, `case:2`, `combo:3`, `envelope`. */
function scopeKey(ref: ScopeRef): string {
  return ref.kind === 'case' || ref.kind === 'combo' ? `${ref.kind}:${ref.id}` : ref.kind;
}

/**
 * What an export's data was taken from: the model (its version and content hash), the results on
 * screen, the base solve the engine hashes are of, the scope and the solve stamp. An async export
 * captures it when it starts and checks it before it writes the record (`provenanceForExport`), so
 * a report can never carry one state's numbers under another state's provenance.
 */
export interface ProvenanceToken {
  version: number;
  results: object | null;
  base: CertifiableInput | null;
  scope: string;
  modelHash: string;
  stampId: string | null;
}

export function captureProvenanceToken(): ProvenanceToken {
  const is3D = uiStore.is3DWorkspace;
  return {
    version: modelStore.modelVersion,
    results: (is3D ? resultsStore.results3D : resultsStore.results) ?? null,
    base: baseInput,
    scope: JSON.stringify(currentScopeRef()),
    modelHash: modelHash(modelStore.snapshot()),
    stampId: recheckStore.stamp?.id ?? null,
  };
}

function tokenStillCurrent(t: ProvenanceToken): boolean {
  const now = captureProvenanceToken();
  return now.version === t.version && now.results === t.results && now.base === t.base
    && now.scope === t.scope && now.stampId === t.stampId && now.modelHash === t.modelHash;
}

/**
 * Throws `ExportChangedError` when the project moved since `token`, for an export that yields while
 * it writes. `quick` skips the model hash, for the pauses in between; the last check is the full one.
 */
export function assertExportCurrent(token: ProvenanceToken, quick = false): void {
  if (quick) {
    const is3D = uiStore.is3DWorkspace;
    const results = (is3D ? resultsStore.results3D : resultsStore.results) ?? null;
    if (modelStore.modelVersion === token.version && results === token.results && baseInput === token.base
      && (recheckStore.stamp?.id ?? null) === token.stampId && JSON.stringify(currentScopeRef()) === token.scope) return;
    throw new ExportChangedError();
  }
  if (!tokenStillCurrent(token)) throw new ExportChangedError();
}

/** The export was started on one state and the project moved under it: nothing is written. */
export class ExportChangedError extends Error {
  constructor() { super(t('provenance.exportChanged')); this.name = 'ExportChangedError'; }
}

/**
 * The record for an export that captured `token` when it started: the engine hashes are awaited
 * (off the main thread), then the state is checked against the token. Unchanged: the record, built
 * in the same tick as the check. Changed (an edit, another project, another solve or view while
 * the export was being prepared): `ExportChangedError`, so the export is abandoned, never mixed.
 */
export async function provenanceForExport(token: ProvenanceToken, printed?: ScopeRef | null): Promise<ResultProvenance> {
  await ensureEngineHashes();
  if (!tokenStillCurrent(token)) throw new ExportChangedError();
  return printed ? provenanceForScope(printed) : currentResultProvenance();
}

/** The scope a report's result set prints (`pro/export-results` keys); null for what is on screen. */
export function scopeOfResultSet(key: string | undefined): ScopeRef | null {
  if (!key || key === 'screen') return null;
  const [kind, id] = key.split(':');
  if (kind === 'envelope') return { kind: 'envelope', name: null };
  const n = Number(id);
  if ((kind === 'case' || kind === 'combo') && Number.isInteger(n)) return { kind, id: n };
  return null;
}

/** The provenance of what is on screen now (results null: none). */
export function currentResultProvenance(now?: Date): ResultProvenance {
  const is3D = uiStore.is3DWorkspace;
  const ref = currentScopeRef();
  return resultProvenanceFor(ref, (is3D ? resultsStore.results3D : resultsStore.results) ?? null, now);
}

/**
 * The provenance of the result a scope names in the results on hand (`results` null: that scope
 * is not there; the record then carries no results hash for it). What `reproduceFrom` uses to
 * recompute exactly the result a report claims.
 */
export function provenanceForScope(ref: ScopeRef, now?: Date): ResultProvenance {
  return resultProvenanceFor(ref, resultForScope(ref), now);
}

/**
 * Capture an independent analysis's inputs before it starts. Finish with its own result, even
 * if the model or viewport changed while it ran. No static result, certificate or solve stamp
 * belongs to this record. Exports can mark it stale without relabelling it as the current model.
 */
export function captureAnalysisProvenance(label: string, inputs: unknown): (results: unknown) => ResultProvenance {
  // Hash now: snapshot entries can still share mutable values with the model.
  const captured = buildResultProvenance({
    build: buildIdentity(),
    snapshot: modelStore.snapshot(),
    settings: currentAnalysisSettings(),
    analysisInputHash: exactHash(inputs),
    resultsVersion: RESULTS_VERSION,
    resultsSchemaVersion: RESULTS_SCHEMA_VERSION,
    scope: `other (${label})`,
    scopeRef: { kind: 'other', label },
    results: null, baseResults: null, stale: false, stamp: null,
  });
  return (results) => ({ ...captured, resultsHash: resultsHash(results), generatedAt: new Date().toISOString() });
}

/** Keep a saved independent result's identity, marking it stale after project/settings edits. */
export function analysisProvenanceForExport(record: ResultProvenance): ResultProvenance {
  return {
    ...record,
    stale: record.stale || record.modelHash !== modelHash(modelStore.snapshot())
      || record.settingsHash !== exactHash(currentAnalysisSettings()),
  };
}

function resultProvenanceFor(ref: ScopeRef, results: object | null, now?: Date): ResultProvenance {
  const is3D = uiStore.is3DWorkspace;
  const base = is3D ? resultsStore.singleResults3D : resultsStore.singleResults;
  return buildResultProvenance({
    build: buildIdentity(),
    resultsVersion: RESULTS_VERSION,
    resultsSchemaVersion: RESULTS_SCHEMA_VERSION,
    snapshot: modelStore.snapshot(),
    settings: currentAnalysisSettings(),
    scope: scopeLabel(ref),
    scopeRef: ref,
    results,
    baseResults: base ?? null,
    baseSolveMethod,
    certificates: certificates(ref),
    stale: recheckStore.stale,
    stamp: recheckStore.stamp,
    // The engine's hashes are of the base solve, whichever scope the record names; read from the
    // cache, never computed here (exports `await ensureEngineHashes()` first).
    engine: base ? cachedEngineHashes() : null,
    now,
  });
}

/** The labels a report prints the record with, in the reader's language. */
export function provenanceLabels(): ProvenanceLabels {
  return {
    title: t('provenance.title'),
    app: t('provenance.app'),
    engine: t('provenance.engine'),
    wasm: t('provenance.wasm'),
    resultsVersion: t('provenance.resultsVersion'),
    model: t('provenance.model'),
    settings: t('provenance.settings'),
    results: t('provenance.results'),
    engineSolve: t('provenance.engineSolve'),
    scope: t('provenance.scope'),
    certificates: t('provenance.certificates'),
    none: t('provenance.none'),
    stale: t('provenance.stale'),
    status: t('provenance.status'),
    current: t('provenance.current'),
    reproduce: t('provenance.reproduceNote'),
  };
}
