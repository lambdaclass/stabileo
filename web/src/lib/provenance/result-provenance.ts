/**
 * The provenance of a result: enough to say which build produced it from which model and
 * settings, and to check a re-run bit for bit (roadmap: "Trust and verification backlog", item 9).
 *
 * Pure. `store/result-provenance.ts` gathers the inputs from the live stores; reports print the
 * record (`provenanceBlockHtml`, `provenanceTextLines`) and embed it as JSON, and the reproduce
 * path (`compareProvenance`) checks a fresh record against a printed one.
 *
 * ── What is hashed, and what is left out ───────────────────────────
 *
 * Every hash is SHA-256 of the exact canonical JSON (`exact-hash.ts`): every bit of every number.
 *
 * modelHash     the model as the solver and the design checks read it. Left out: what names,
 *               draws or remembers the project but cannot move a number — its name, title
 *               block, notes, saved camera views, grid, presentation, export record,
 *               hand-edit marks, solve stamp, revision counters and the detailing drawings
 *               (derived from the model and the results, and re-stamped on every load).
 * settingsHash  the session settings that change the solve: workspace, self-weight and its case,
 *               axis convention, drawing plane.
 * resultsHash   the results on screen, without wall-clock timings.
 */
import { exactHash } from './exact-hash';
import type { BuildIdentity } from './build-identity';
import type { SolveStamp } from './solve-stamp';

export const PROVENANCE_SCHEMA = 'stabileo.provenance.v1';

/** Snapshot keys that cannot change a result (see the header). */
export const MODEL_HASH_OMIT = [
  'name', 'projectInfo', 'notes', 'views', 'grid', 'presentation3D', 'provenance',
  'exports', 'manualEdits', 'solvedWith', 'revisions', 'detailing', 'analysisMode',
] as const;

/** Result keys that describe the run, not the answer. */
export const RESULTS_HASH_OMIT = ['timings', 'solveTimings', 'runMeta', 'meta'] as const;

/** A result a re-run can select again: the base solve, one case, one combination, or an envelope. */
export type ScopeRef =
  | { kind: 'single' }
  | { kind: 'case'; id: number }
  | { kind: 'combo'; id: number }
  /** `name`: a named envelope; null: the active combinations' envelope. */
  | { kind: 'envelope'; name: string | null }
  /** Something a solve does not reproduce by itself (an advanced analysis's result on screen). */
  | { kind: 'other'; label: string };

export function sameScope(a: ScopeRef | undefined, b: ScopeRef | undefined): boolean {
  return !!a && !!b && JSON.stringify(a) === JSON.stringify(b);
}

export interface AnalysisSettings {
  analysisMode: string;
  includeSelfWeight: boolean;
  selfWeightCaseId: number | null;
  axisConvention3D: string;
  drawPlane2D?: string;
}

export interface CertificateRecord {
  scope: string;
  status: string;
  /** SHA-256 of the certificate as the app holds it (bounds included). */
  hash: string;
  absBound?: number;
}

/** What a report printed, recorded so a check prints the same tables and expects exactly these. */
export interface PrintedManifest {
  /** The report's choices of what to print (`engine/report/printed-values.ts` `reportChoices`). */
  choices: Record<string, unknown>;
  locale: string | null;
  tables: Array<{ section: string; table: string; rows: number }>;
}

export interface ResultProvenance {
  schema: typeof PROVENANCE_SCHEMA;
  appVersion: string;
  commit: string;
  engineVersion: string;
  engineCommit: string;
  wasmHash: string;
  resultsVersion: number;
  resultsSchemaVersion: number;
  modelHash: string;
  settings: AnalysisSettings;
  settingsHash: string;
  /** Which result: the base solve, a case, a combination or the envelope, by name. */
  scope: string;
  /**
   * The same, as something a re-run can select again (`store/result-provenance.ts`
   * `resultForScope`). Absent in records written before it existed: such a record can only be
   * reproduced for its base solve, and a reproduce that cannot recompute the shown result says
   * the comparison is incomplete.
   */
  scopeRef?: ScopeRef;
  /** null: no results (a report written for a model that did not solve). */
  resultsHash: string | null;
  /** The base solve's hash (equal to `resultsHash` when the base solve is what is shown). */
  baseResultsHash: string | null;
  /** How the base result was computed: floating-point summation is part of the recipe. */
  baseSolveMethod?: 'direct' | 'case-superposition';
  /** Inputs of an independent analysis (for example, a moving-load sweep). */
  analysisInputHash?: string;
  /**
   * The engine's hashes of the base linear solve: its canonical input and its raw result, as
   * `cargo run --example reproduce` recomputes them from the exported solver input. null when the
   * results are not a plain linear solve.
   */
  engineInputSha256: string | null;
  engineResultsSha256: string | null;
  certificates: CertificateRecord[];
  /** The project's results predate registered changes and have not been re-run. */
  stale: boolean;
  /** The stamp of the solve that produced the results. */
  solvedWith: Pick<SolveStamp, 'resultsVersion' | 'commit' | 'engineVersion' | 'solvedAt'> | null;
  generatedAt: string;
  /** Absent in records written before it existed, and in every export but the report. */
  report?: PrintedManifest;
  /** `exactHash(report)`; checked with the printed tables, not with the solve. */
  reportHash?: string;
}

export function withPrintedManifest(p: ResultProvenance, report: PrintedManifest): ResultProvenance {
  return { ...p, report, reportHash: exactHash(report) };
}

export function printedManifestIntact(p: Pick<ResultProvenance, 'report' | 'reportHash'>): boolean {
  return !!p.report && p.reportHash === exactHash(p.report);
}

export function modelHash(snapshot: unknown): string {
  return exactHash(stripModel(snapshot));
}

function stripModel(snapshot: unknown): unknown {
  if (!snapshot || typeof snapshot !== 'object') return snapshot;
  const out: Record<string, unknown> = { ...(snapshot as Record<string, unknown>) };
  for (const k of MODEL_HASH_OMIT) delete out[k];
  const design = out.designData as { loadBasis?: { at?: unknown } } | undefined;
  if (design?.loadBasis && 'at' in design.loadBasis) {
    const { at: _at, ...loadBasis } = design.loadBasis;
    out.designData = { ...design, loadBasis };
  }
  return out;
}

export function resultsHash(results: unknown): string | null {
  return results ? exactHash(results, [...RESULTS_HASH_OMIT]) : null;
}

export interface ProvenanceInputs {
  build: BuildIdentity;
  resultsVersion: number;
  resultsSchemaVersion: number;
  snapshot: unknown;
  settings: AnalysisSettings;
  scope: string;
  scopeRef?: ScopeRef;
  results: unknown;
  baseResults?: unknown;
  baseSolveMethod?: ResultProvenance['baseSolveMethod'];
  analysisInputHash?: string;
  certificates?: CertificateRecord[];
  stale: boolean;
  stamp: SolveStamp | null;
  engine?: { input: string; results: string } | null;
  now?: Date;
}

export function buildResultProvenance(i: ProvenanceInputs): ResultProvenance {
  const shown = resultsHash(i.results);
  const single = i.scopeRef ? i.scopeRef.kind === 'single' : i.scope === 'single';
  const base = i.baseResults === undefined ? (single ? shown : null)
    : i.baseResults === i.results ? shown : resultsHash(i.baseResults);
  return {
    schema: PROVENANCE_SCHEMA,
    appVersion: i.build.appVersion,
    commit: i.build.commit,
    engineVersion: i.build.engineVersion,
    engineCommit: i.build.engineCommit,
    wasmHash: i.build.wasmHash,
    resultsVersion: i.resultsVersion,
    resultsSchemaVersion: i.resultsSchemaVersion,
    modelHash: modelHash(i.snapshot),
    settings: i.settings,
    settingsHash: exactHash(i.settings),
    scope: i.scope,
    ...(i.scopeRef ? { scopeRef: i.scopeRef } : {}),
    resultsHash: shown,
    baseResultsHash: base,
    ...(i.baseSolveMethod ? { baseSolveMethod: i.baseSolveMethod } : {}),
    ...(i.analysisInputHash ? { analysisInputHash: i.analysisInputHash } : {}),
    engineInputSha256: i.engine?.input ?? null,
    engineResultsSha256: i.engine?.results ?? null,
    certificates: i.certificates ?? [],
    stale: i.stale,
    solvedWith: i.stamp
      ? { resultsVersion: i.stamp.resultsVersion, commit: i.stamp.commit, engineVersion: i.stamp.engineVersion, solvedAt: i.stamp.solvedAt }
      : null,
    generatedAt: (i.now ?? new Date()).toISOString(),
  };
}

// ─── Reproduce ───────────────────────────────────────────────────

export type FieldVerdict = 'match' | 'differs' | 'absent';

/**
 * reproduced   every compared hash matches, and every hash the report claims was recomputed;
 * differs      at least one recomputed hash is different;
 * incomplete   nothing differs, but something the report claims could not be recomputed (its
 *              result is not selectable here, or a hash is missing): never reported as success.
 */
export type ReproduceStatus = 'reproduced' | 'differs' | 'incomplete';

export interface ReproduceVerdict {
  status: ReproduceStatus;
  /** `status === 'reproduced'`. */
  reproduced: boolean;
  model: FieldVerdict;
  settings: FieldVerdict;
  /** The base solve's results. */
  results: FieldVerdict;
  /** The result the report showed (a case, a combination, an envelope), recomputed for that scope. */
  shownResults: FieldVerdict;
  /**
   * Every hash the report claims, with its verdict: the four above, the engine's, each
   * certificate's (`certificate:<scope>`), and any other `…Hash` / `…Sha256` field a record
   * carries, so a field added later is never silently left out.
   */
  hashes: Array<{ field: string; verdict: FieldVerdict }>;
  /** The builds differ (a differing result may then be a registered change, not a defect). */
  sameBuild: boolean;
  buildDifferences: string[];
}

/** Hash fields that name the BUILD, not the answer: a different build is reported, not failed. */
const BUILD_HASH_FIELDS = new Set(['wasmHash']);
/** Hash fields compared by their own rule (above, scope-aware; `reportHash` with the printed tables, `actions/reproduce.ts`), not by the generic pass. */
const SCOPED_HASH_FIELDS = new Set(['modelHash', 'settingsHash', 'resultsHash', 'baseResultsHash', 'reportHash']);
const isHashField = (k: string) => /(Hash|Sha256)$/.test(k);

const verdict = (a: string | null | undefined, b: string | null | undefined): FieldVerdict =>
  !a || !b ? 'absent' : a === b ? 'match' : 'differs';

/** The base solve's hash of a record, whatever scope it showed. */
export function baseHashOf(p: ResultProvenance): string | null {
  if (p.baseResultsHash) return p.baseResultsHash;
  return p.scope === 'single' || p.scopeRef?.kind === 'single' ? p.resultsHash : null;
}

/**
 * Compare a printed provenance (`claimed`) with a re-run's (`fresh`).
 *
 * `fresh.resultsHash` must be the hash of the SAME scope the report claims, recomputed for it
 * (`reproduceFrom` does that); when `fresh` describes another scope, the shown result was not
 * recomputed and the verdict is at best incomplete.
 */
export function compareProvenance(claimed: ResultProvenance, fresh: ResultProvenance): ReproduceVerdict {
  const model = verdict(claimed.modelHash, fresh.modelHash);
  const settings = verdict(claimed.settingsHash, fresh.settingsHash);
  const results = verdict(baseHashOf(claimed), baseHashOf(fresh));
  const claimedSingle = claimed.scopeRef ? claimed.scopeRef.kind === 'single' : claimed.scope === 'single';
  // Compared on its own even when the report showed the base solve: its `resultsHash` is a claim
  // of its own, and a changed or missing one must not ride on the base solve's verdict.
  const shownResults: FieldVerdict = claimedSingle
    ? verdict(claimed.resultsHash, baseHashOf(fresh))
    : sameScope(claimed.scopeRef, fresh.scopeRef) ? verdict(claimed.resultsHash, fresh.resultsHash) : 'absent';
  const hashes: ReproduceVerdict['hashes'] = [
    { field: 'modelHash', verdict: model },
    { field: 'settingsHash', verdict: settings },
    { field: 'baseResultsHash', verdict: results },
    { field: 'resultsHash', verdict: shownResults },
  ];
  // Every other hash the report claims: a claimed value must be recomputed and equal.
  const c = claimed as unknown as Record<string, unknown>;
  const f = fresh as unknown as Record<string, unknown>;
  for (const k of Object.keys(c).sort()) {
    if (!isHashField(k) || SCOPED_HASH_FIELDS.has(k) || BUILD_HASH_FIELDS.has(k)) continue;
    const v = c[k];
    if (typeof v !== 'string' || !v) continue; // the report claims nothing here
    hashes.push({ field: k, verdict: verdict(v, typeof f[k] === 'string' ? (f[k] as string) : null) });
  }
  // Certificates: each one the report claims must have been recomputed (not pending) and match.
  for (const cert of claimed.certificates ?? []) {
    const mine = (fresh.certificates ?? []).find((x) => x.scope === cert.scope);
    hashes.push({ field: `certificate:${cert.scope}`, verdict: verdict(cert.hash, mine?.hash) });
  }
  const all = hashes.map((h) => h.verdict);
  const status: ReproduceStatus = all.includes('differs') ? 'differs' : all.includes('absent') ? 'incomplete' : 'reproduced';
  const buildDifferences = (['appVersion', 'commit', 'engineVersion', 'engineCommit', 'wasmHash', 'resultsVersion'] as const)
    .filter((k) => String(claimed[k]) !== String(fresh[k]));
  return {
    status, reproduced: status === 'reproduced',
    model, settings, results, shownResults, hashes,
    sameBuild: buildDifferences.length === 0,
    buildDifferences,
  };
}

/** Read a provenance record from JSON text or from a report's HTML (its embedded record). */
export function parseProvenance(text: string): ResultProvenance | null {
  let json = text.trim();
  const m = /<script[^>]*id=["']stabileo-provenance["'][^>]*>([\s\S]*?)<\/script>/i.exec(text);
  if (m) json = m[1].trim();
  try {
    const v = JSON.parse(json) as Partial<ResultProvenance>;
    if (v?.schema !== PROVENANCE_SCHEMA || typeof v.modelHash !== 'string' || typeof v.settingsHash !== 'string') return null;
    return v as ResultProvenance;
  } catch {
    return null;
  }
}

// ─── Printing ────────────────────────────────────────────────────

export interface ProvenanceLabels {
  title: string;
  app: string;
  engine: string;
  wasm: string;
  resultsVersion: string;
  model: string;
  settings: string;
  results: string;
  engineSolve: string;
  scope: string;
  certificates: string;
  none: string;
  stale: string;
  /** The status row's name, and its text when the results are current. */
  status: string;
  current: string;
  reproduce: string;
}

/** Self-contained, so any report can print the block whatever its own stylesheet. */
export const PROVENANCE_CSS = `.provenance{margin-top:16px;break-inside:avoid;font-size:9pt}
.provenance h2{font-size:11pt;margin:0 0 6px}
.provenance-table{border-collapse:collapse;width:100%}
.provenance-table th{text-align:left;font-weight:600;padding:2px 8px 2px 0;vertical-align:top;white-space:nowrap}
.provenance-table td{padding:2px 0;word-break:break-all}
.provenance-table code{font-size:8pt}
.provenance-stale{border:2px solid #c0392b;color:#c0392b;padding:6px 8px;margin:6px 0}
.provenance-note{color:#666;font-size:8pt;margin-top:6px}`;

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** One line per field, for plain-text exports (CSV comments, workbook rows). */
export function provenanceTextLines(p: ResultProvenance, l: ProvenanceLabels): Array<[string, string]> {
  const s = p.settings;
  return [
    // First, so no export can carry the record without its re-check status (CSV, workbook, HTML).
    [l.status, p.stale ? l.stale : l.current],
    [l.app, `${p.appVersion} · ${p.commit}`],
    [l.engine, `${p.engineVersion} · ${p.engineCommit}`],
    [l.wasm, p.wasmHash],
    [l.resultsVersion, `${p.resultsVersion} (schema ${p.resultsSchemaVersion})`],
    [l.model, p.modelHash],
    [l.settings, `${p.settingsHash} — ${s.analysisMode}, self-weight ${s.includeSelfWeight ? 'on' : 'off'}${s.selfWeightCaseId !== null ? ` (case ${s.selfWeightCaseId})` : ''}, ${s.axisConvention3D}${s.drawPlane2D ? `, plane ${s.drawPlane2D}` : ''}${p.analysisInputHash ? ` · input ${p.analysisInputHash}` : ''}`],
    [l.scope, p.scope],
    [l.results, p.resultsHash ?? l.none],
    [l.engineSolve, p.engineInputSha256 ? `input ${p.engineInputSha256} · results ${p.engineResultsSha256}` : l.none],
    [l.certificates, p.certificates.length ? p.certificates.map((c) => `${c.scope} ${c.status} ${c.hash}`).join('; ') : l.none],
  ];
}

/**
 * The provenance block a report prints, with the record embedded as JSON so the reproduce path
 * can read it back from the saved HTML.
 */
export function provenanceBlockHtml(p: ResultProvenance, l: ProvenanceLabels): string {
  const rows = provenanceTextLines(p, l)
    .map(([k, v]) => `<tr><th>${esc(k)}</th><td><code>${esc(v)}</code></td></tr>`)
    .join('');
  const stale = p.stale ? `<p class="provenance-stale"><strong>${esc(l.stale)}</strong></p>` : '';
  // `<` escaped inside the JSON so no value can close the script element.
  const json = JSON.stringify(p).replace(/</g, '\\u003c');
  return `<section class="provenance" data-testid="report-provenance">
<style>${PROVENANCE_CSS}</style>
<h2>${esc(l.title)}</h2>${stale}
<table class="provenance-table">${rows}</table>
<p class="provenance-note">${esc(l.reproduce)}</p>
<script type="application/json" id="stabileo-provenance">${json}</script>
</section>`;
}
