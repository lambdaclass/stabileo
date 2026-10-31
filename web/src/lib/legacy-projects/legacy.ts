/**
 * Old project files keep opening, migrating and giving the same results (#718).
 *
 * The corpus (`web/legacy-projects/<tag>/`, written by `scripts/legacy-projects/generate.mjs`)
 * holds every bundled example as each released version saved it, and the results that version
 * showed. This module opens one of those files with the CURRENT code, the way the app opens a
 * `.ded` (`deserializeProject`, which migrates it and runs the re-check assessment), solves it
 * through `solveNow` (Calcular's entry point), and judges the difference:
 *
 *   same         within the results snapshot gate's tolerance (`compare.mjs`, #716);
 *   explained    every value that moved is one that an applicable registry entry declares it
 *                moves (`quantities` in `result-changes.json`). Applicable: introduced after the
 *                version that solved it, and concerning this model, the app's own assessment on
 *                open (`recheckStore.assessment`, `provenance/applicability.ts`), the same list
 *                the engineer is shown;
 *   unexplained  a value moved that no applicable entry declares: the test fails.
 */
import { existsSync, readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { modelStore } from '../store/model.svelte';
import { historyStore } from '../store/history.svelte';
import { uiStore } from '../store/ui.svelte';
import { resultsStore } from '../store/results.svelte';
import { verificationStore } from '../store/verification.svelte';
import { detailingStore } from '../store/detailing.svelte';
import { designRunStore } from '../store/design-run.svelte';
import { recheckStore } from '../store/recheck.svelte';
import '../store';
import { deserializeProject } from '../store/file';
import { solveNow } from '../actions/solve';
import { setLocale } from '../i18n';
import type { ResultChange } from '../provenance/registry';
import { resultValues, type Values } from './capture-results';
// @ts-expect-error plain JavaScript shared with the results snapshot gate (no declaration file)
import { compareValues, formatCaseReport, parseSnapshot } from '../../../scripts/results-snapshot/compare.mjs';

export type Workspace = '2d' | '3d' | 'pro';

export interface ManifestEntry {
  example: string;
  file: string;
  fileFormatVersion: string;
  workspace: Workspace;
  analysisMode: string | null;
  model: { nodes: number; elements: number; shells: number };
  /** The results that version showed, or null: saved but not solved (`notSolved` says why). */
  results: string | null;
  notSolved?: string;
  solvedWithResultsVersion: number | null;
  /** The example's fixture as of the tag (git blob id): the same as today's, or edited since. */
  fixtureBlob: string;
}

export interface Manifest {
  version: string;
  tag: string;
  commit: string;
  /** The tag's `currentResultsVersion` (0: the release predates the registry). */
  resultsVersion: number;
  solveEntry: string;
  resultsFormat: number;
  /** The session file, or `file: null` when the version could not write one (`unavailable` says why). */
  session: { file: string | null; envelopeVersion?: string; tabs?: Array<{ id: string; workspace: Workspace }>; unavailable?: string };
  examples: ManifestEntry[];
}

export const CORPUS_DIR = new URL('../../../legacy-projects/', import.meta.url);
const SNAPSHOT_DIR = new URL('../../../results-snapshots/', import.meta.url);
const FIXTURE_DIR = new URL('../templates/fixtures/', import.meta.url);

/** The released versions in the corpus, oldest first. */
export function corpusVersions(): string[] {
  return ['v0.2.0', 'v0.3.0', 'v0.4.0'].filter((t) => existsSync(new URL(`${t}/manifest.json`, CORPUS_DIR)));
}

export function readManifest(tag: string): Manifest {
  return JSON.parse(readFileSync(new URL(`${tag}/manifest.json`, CORPUS_DIR), 'utf8')) as Manifest;
}

/** A corpus file's text, exactly as the version wrote it (stored gzipped when large). */
export function readCorpusText(path: string): string {
  const bytes = readFileSync(new URL(path, CORPUS_DIR));
  return (path.endsWith('.gz') ? gunzipSync(bytes) : bytes).toString('utf8');
}

export function readResults(path: string): Values {
  return parseSnapshot(readCorpusText(path)).values as Values;
}

/** Today's fixture of an example as a git blob id, to tell an example edited since the release. */
export function currentFixtureBlob(id: string): string | null {
  const f = new URL(`${id}.json`, FIXTURE_DIR);
  if (!existsSync(f)) return null;
  const bytes = readFileSync(f);
  return createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
}

/** Every store an open writes to, back to a fresh session's state (the snapshot gate's reset). */
export function reset(workspace: Workspace): void {
  setLocale('en');
  modelStore.clear();
  historyStore.clear();
  modelStore.setResultScopes(null);
  resultsStore.clear();
  verificationStore.clear();
  detailingStore.clear();
  designRunStore.resetMarks();
  recheckStore.reset();
  uiStore.analysisMode = workspace;
  uiStore.axisConvention3D = 'rightHand';
  uiStore.includeSelfWeight = workspace === 'pro';
}

/** Solve what is on screen through Calcular's entry point and record the results. */
export async function solveAndRecord(values: Values): Promise<void> {
  const outcome = await solveNow();
  values['solve.ok'] = outcome.ok;
  if (!outcome.ok) values['solve.refusal'] = outcome.error ?? '';
  else resultValues(resultsStore as never, uiStore.is3DWorkspace, values);
}

export function modelCounts(): Values {
  return {
    'model.nodes': modelStore.nodes.size,
    'model.elements': modelStore.elements.size,
    'model.shells': modelStore.quads.size + modelStore.plates.size,
  };
}

export interface Opened {
  values: Values;
  /** The registered result changes the app lists for this file on open. */
  changes: ResultChange[];
}

/**
 * Open a `.ded`'s text as the app does, and solve it. `beforeOpen` edits the parsed file first:
 * the negative tests' deliberately broken migration.
 */
export async function openAndSolve(text: string, opts: { solve?: boolean; beforeOpen?: (file: Record<string, unknown>) => void } = {}): Promise<Opened> {
  reset('2d');
  let body = text;
  if (opts.beforeOpen) {
    const parsed = JSON.parse(text) as Record<string, unknown>;
    opts.beforeOpen(parsed);
    body = JSON.stringify(parsed);
  }
  if (!deserializeProject(body)) throw new Error('the current code refused to open it');
  const changes = await assessedChanges();
  const values = modelCounts();
  if (opts.solve !== false) await solveAndRecord(values);
  return { values, changes };
}

/** The registered result changes the app lists for the project just opened, once its lazily loaded assessment has settled. */
export async function assessedChanges(): Promise<ResultChange[]> {
  await recheckStore.retry();
  if (recheckStore.loadFailed || recheckStore.pending) throw new Error('the re-check assessment did not complete');
  return [...(recheckStore.assessment?.changes ?? [])];
}

/** An example as the current code opens and solves it in `workspace`, the reference for a legacy file of it. */
export async function captureExample(id: string, workspace: Workspace): Promise<Values> {
  reset(workspace);
  await modelStore.loadExample(id);
  const values = modelCounts();
  await solveAndRecord(values);
  return values;
}

/**
 * The results snapshot gate's committed snapshot of this example in this workspace (#716), when
 * there is one: `<2d|3d|pro>-<example>.json`, limited to the solve's values (a snapshot of a
 * case with design or advanced analyses also holds those, which a legacy file is not run for).
 */
export function committedSnapshot(id: string, workspace: Workspace): { name: string; values: Values } | null {
  const name = `${workspace}-${id}`;
  const f = new URL(`${name}.json`, SNAPSHOT_DIR);
  if (!existsSync(f)) return null;
  const all = parseSnapshot(readFileSync(f, 'utf8')).values as Values;
  const values: Values = {};
  for (const [k, v] of Object.entries(all)) if (/^(model\.|solve\.|base[.[]|base$|case\[|combo\[|unstableCombinations$)/.test(k)) values[k] = v;
  return { name, values };
}

/**
 * Values compared for information only, never failing the test: a refusal's wording and the
 * warning codes a solve raises (a new warning is not a different result). Its error codes are
 * gated, as `<set>.errorCodes`.
 */
const REPORT_ONLY = /(^solve\.refusal$|\.diagnosticCodes$)/;

function split(v: Values): [Values, Values] {
  const gated: Values = {};
  const info: Values = {};
  for (const [k, x] of Object.entries(v)) {
    (REPORT_ONLY.test(k) ? info : gated)[k] = x;
    if (k.endsWith('.diagnosticCodes') && typeof x === 'string') {
      gated[k.replace(/diagnosticCodes$/, 'errorCodes')] = x.split(/[\s|]+/).filter((c) => c.startsWith('error:')).sort().join(' ');
    }
  }
  return [gated, info];
}

const RESULT_SET = /^(?:base|case\[[^\]]*\]|combo\[[^\]]*\])(?:\.(.*))?$/;

/**
 * Whether a registered change declares that it moves this value. A model count never: the same
 * file must open as the same model whatever the solver does.
 */
export function declaresMove(change: Pick<ResultChange, 'quantities'>, path: string): boolean {
  const declared = change.quantities ?? [];
  if (path === 'solve.ok') return declared.includes('solve.ok');
  const set = RESULT_SET.exec(path);
  if (!set && path !== 'unstableCombinations') return false;
  if (declared.includes('*')) return true;
  const rest = set?.[1] ?? '';
  const collection = /^[A-Za-z0-9]+/.exec(rest)?.[0];
  const field = /\]\.([A-Za-z0-9]+)$/.exec(rest)?.[1];
  return !!collection && (declared.includes(collection) || (!!field && declared.includes(`${collection}.${field}`)));
}

export interface Verdict {
  kind: 'same' | 'explained' | 'unexplained';
  /** What moved, for a person (the snapshot gate's report). Empty when the same. */
  report: string;
  /** The registry entries that declare a value that moved, by id and the version that introduced each. */
  explainedBy: string[];
  /** Every registry entry that applies to the model, whether or not it declares what moved. */
  applicable: string[];
  /** Report-only values that differ (refusal wording, warning codes). */
  notes: string[];
}

interface Diff {
  changed: Array<{ path: string }>;
  removed: string[];
  added: string[];
  differs: boolean;
}

/**
 * Judge the current results of a legacy file against a reference (what the version showed, or
 * what the current example gives) under the snapshot gate's tolerance. A value recorded now and
 * not then is not a difference (a quantity added since); a value that changed, or is no longer
 * produced, is. Pass no changes when both sides were solved by the current code.
 */
export function judge(name: string, reference: Values, current: Values, changes: readonly ResultChange[]): Verdict {
  const [refGated, refInfo] = split(reference);
  const [curGated, curInfo] = split(current);
  const notes = [...new Set([...Object.keys(refInfo), ...Object.keys(curInfo)])].filter((k) => refInfo[k] !== curInfo[k])
    .map((k) => `${k}: ${JSON.stringify(refInfo[k] ?? null)} → ${JSON.stringify(curInfo[k] ?? null)}`);
  const label = (c: ResultChange) => `${c.id} (results v${c.resultsVersion})`;
  const applicable = changes.map(label);
  const diff = compareValues(refGated, curGated) as Diff;
  if (!diff.differs) return { kind: 'same', report: '', explainedBy: [], applicable, notes };
  const used = new Set<ResultChange>();
  const explained = (path: string) => {
    const by = changes.filter((c) => declaresMove(c, path));
    for (const c of by) used.add(c);
    return by.length > 0;
  };
  const left: Diff = { ...diff, changed: diff.changed.filter((c) => !explained(c.path)), removed: diff.removed.filter((p) => !explained(p)) };
  const explainedBy = changes.filter((c) => used.has(c)).map(label);
  if (left.changed.length > 0 || left.removed.length > 0) {
    return { kind: 'unexplained', report: formatCaseReport(name, left) as string, explainedBy, applicable, notes };
  }
  return { kind: 'explained', report: formatCaseReport(name, diff) as string, explainedBy, applicable, notes };
}

/** The failure message of an unexplained difference: what moved, and what to do. */
export function unexplainedMessage(v: Verdict, version: string): string {
  return [
    v.report,
    '',
    v.applicable.length === 0
      ? `No registered result change explains it: result-changes.json lists none introduced after ${version} that applies to this model.`
      : `No registered result change explains these values: of the entries introduced after ${version} that apply to this model (${v.applicable.join(', ')}), none declares in its "quantities" that it moves them.`,
    'If the change is deliberate, register it, or declare the quantities an existing entry moves (docs/verification/PROVENANCE.md). If not, it is a regression, or a migration that reads the old file wrongly: fix the code, not the corpus.',
  ].join('\n');
}

/**
 * The failure message of a legacy file that differs from today's example: both were solved by
 * the current code, so no registered change can explain it.
 */
export function migrationMessage(v: Verdict, version: string): string {
  return [
    v.report,
    '',
    `The ${version} file, opened and solved by the current code, differs from the same example opened by the current code. Both solves ran the same code, so no registered result change explains it: the migration reads the old file as another model. Fix the migration, not the corpus.`,
  ].join('\n');
}
