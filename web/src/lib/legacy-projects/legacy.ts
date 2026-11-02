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
import { deserializeProject, loadFile } from '../store/file';
import { tabManager } from '../store/tabs.svelte';
import { solveNow } from '../actions/solve';
import { setLocale } from '../i18n';
import type { ResultChange } from '../provenance/registry';
import registry from '../provenance/result-changes.json';
import { resultValues, type Values } from './capture-results';
// @ts-expect-error plain JavaScript shared with the results snapshot gate (no declaration file)
import { compareValues, formatCaseReport, parseSnapshot, storeNumber } from '../../../scripts/results-snapshot/compare.mjs';
import { compareLegacy } from './vector-floor';

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
const EDITED_FIXTURE_DIR = new URL('fixtures/', CORPUS_DIR);

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

function gitBlob(bytes: Buffer): string {
  return createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
}

/** Today's fixture of an example as a git blob id, to tell an example edited since the release. */
export function currentFixtureBlob(id: string): string | null {
  const f = new URL(`${id}.json`, FIXTURE_DIR);
  if (!existsSync(f)) return null;
  return gitBlob(readFileSync(f));
}

/**
 * The example a version saved, for the current code to open as the reference: today's fixture
 * when it is the same, else the version's own fixture as recorded in
 * `legacy-projects/fixtures/<example>@<blob>.json` (written by `generate.mjs`, checked here
 * against the blob id). An example edited since with no recorded fixture fails: without it
 * nothing tells a fixture edit from a migration that reads the old file as another model.
 */
export function savedFixture(id: string, blob: string): { fixture?: () => Promise<unknown>; edited: boolean } {
  if (blob === currentFixtureBlob(id)) return { edited: false };
  const f = new URL(`${id}@${blob}.json`, EDITED_FIXTURE_DIR);
  if (!existsSync(f)) {
    throw new Error(`${id}: the fixture the version saved (blob ${blob}) is not today's, and legacy-projects/fixtures/${id}@${blob}.json does not record it. Regenerate the corpus (generate.mjs writes it) so the file is compared with the example it was saved from.`);
  }
  const bytes = readFileSync(f);
  if (gitBlob(bytes) !== blob) throw new Error(`legacy-projects/fixtures/${id}@${blob}.json is not that blob (${gitBlob(bytes)}): it was edited.`);
  const json = JSON.parse(bytes.toString('utf8')) as unknown;
  return { fixture: async () => json, edited: true };
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
  /** The model as opened, before the solve (`modelFingerprint`). */
  fingerprint: Values;
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
  const fingerprint = modelFingerprint();
  if (opts.solve !== false) await solveAndRecord(values);
  return { values, changes, fingerprint };
}

export interface OpenedTab extends Opened {
  /** The workspace the tab restored into. */
  analysisMode: string;
}

/**
 * Open a session file's text as the app does, and solve each tab in turn. `beforeOpen` edits the
 * parsed session first: the negative tests' deliberately broken migration.
 */
export async function openSession(text: string, opts: { beforeOpen?: (session: Record<string, unknown>) => void } = {}): Promise<{ loaded: unknown; tabs: OpenedTab[] }> {
  reset('2d');
  let body = text;
  if (opts.beforeOpen) {
    const parsed = JSON.parse(text) as Record<string, unknown>;
    opts.beforeOpen(parsed);
    body = JSON.stringify(parsed);
  }
  const loaded = await loadFile(new File([body], 'session.ded'));
  const tabs: OpenedTab[] = [];
  for (const id of tabManager.tabs.map((t) => t.id)) {
    if (tabManager.activeTabId !== id) tabManager.switchTab(id);
    const changes = await assessedChanges();
    const values = modelCounts();
    const fingerprint = modelFingerprint();
    const analysisMode = uiStore.analysisMode;
    await solveAndRecord(values);
    tabs.push({ values, changes, fingerprint, analysisMode });
  }
  return { loaded, tabs };
}

/** The registered result changes the app lists for the project just opened, once its lazily loaded assessment has settled. */
export async function assessedChanges(): Promise<ResultChange[]> {
  await recheckStore.retry();
  if (recheckStore.loadFailed || recheckStore.pending) throw new Error('the re-check assessment did not complete');
  const declared = new Map(registry.changes.map((c) => [c.id, (c as { quantities?: string[] }).quantities]));
  return (recheckStore.assessment?.changes ?? []).map((c) => ({ ...c, quantities: declared.get(c.id) }));
}

/**
 * An example as the current code opens it in `workspace` (and solves it, unless `solve: false`),
 * the reference for a legacy file of it: its results and its model fingerprint. `fixture` opens
 * the version's own fixture instead of today's (`savedFixture`).
 */
export async function captureExample(
  id: string, workspace: Workspace, opts: { solve?: boolean; fixture?: () => Promise<unknown> } = {},
): Promise<Values> {
  return (await openExample(id, workspace, opts)).values;
}

export async function openExample(
  id: string, workspace: Workspace, opts: { solve?: boolean; fixture?: () => Promise<unknown> } = {},
): Promise<{ values: Values; fingerprint: Values }> {
  reset(workspace);
  await modelStore.loadExample(id, opts.fixture);
  const values = modelCounts();
  const fingerprint = modelFingerprint();
  if (opts.solve !== false) await solveAndRecord(values);
  return { values, fingerprint };
}

const LOAD_REFERENCES = new Set(['id', 'nodeId', 'elementId', 'quadId', 'caseId', 'fromDef', 'carrier']);
const LOAD_TARGETS = ['nodeId', 'elementId', 'quadId', 'elementIds', 'quadIds', 'nodeIds'] as const;

/**
 * What the model on screen is, beyond its counts, as flat values: each node's coordinates; each
 * member's ends, material, section, releases, joints, offsets and orientation; each material's and section's stiffness properties; each shell's material and
 * thickness, nodes and offset; each support; each load case, and per case and kind of load, in
 * total the number of loads and the sum of each of their force, moment and position fields, and per
 * target (node, member or shell) every load as one record; each combination's factors; the
 * self-weight rule. A migration that drops a load, swaps a section or frees a support changes it
 * without a solve.
 */
export function modelFingerprint(): Values {
  const out: Values = {};
  for (const e of modelStore.elements.values()) {
    const k = `element[${e.id}]`;
    out[`${k}.type`] = e.type;
    out[`${k}.nodes`] = `${e.nodeI}-${e.nodeJ}`;
    out[`${k}.material`] = e.materialId;
    out[`${k}.section`] = e.sectionId;
    if (e.variableSection) out[`${k}.sectionJ`] = e.variableSection.sectionJ;
    for (const f of ['releaseI', 'releaseJ', 'jointI', 'jointJ', 'offset', 'behaviour'] as const) {
      if (e[f] !== undefined) out[`${k}.${f}`] = JSON.stringify(e[f]);
    }
    for (const f of ['localYx', 'localYy', 'localYz', 'rollAngle', 'cablePretension'] as const) {
      if (e[f] !== undefined) out[`${k}.${f}`] = e[f]!;
    }
  }
  for (const n of modelStore.nodes.values()) {
    out[`node[${n.id}].x`] = n.x;
    out[`node[${n.id}].y`] = n.y;
    out[`node[${n.id}].z`] = n.z ?? 0;
  }
  for (const m of modelStore.materials.values()) {
    for (const f of ['e', 'nu', 'rho'] as const) out[`material[${m.id}].${f}`] = m[f];
  }
  for (const sec of modelStore.sections.values()) {
    for (const f of ['a', 'iz', 'iy', 'j', 'rotation'] as const) if (sec[f] !== undefined) out[`section[${sec.id}].${f}`] = sec[f]!;
  }
  for (const [kind, shells] of [['quad', modelStore.quads], ['plate', modelStore.plates]] as const) {
    for (const q of shells.values()) {
      out[`${kind}[${q.id}].material`] = q.materialId;
      out[`${kind}[${q.id}].thickness`] = q.thickness;
      out[`${kind}[${q.id}].nodes`] = q.nodes.join('-');
      if (q.offset !== undefined) out[`${kind}[${q.id}].offset`] = JSON.stringify(q.offset);
    }
  }
  for (const sup of modelStore.supports.values()) {
    for (const [f, v] of Object.entries(sup)) {
      if (f === 'id' || f === 'nodeId' || v === undefined) continue;
      out[`support[${sup.nodeId}].${f}`] = typeof v === 'object' ? JSON.stringify(v) : v as Values[string];
    }
  }
  for (const c of modelStore.loadCases) out[`loadCase[${c.id}].type`] = c.type;
  const records = new Map<string, string[]>();
  for (const l of modelStore.loads) {
    const data = l.data as unknown as Record<string, unknown>;
    const k = `loads[${data.caseId ?? 1}].${l.type}`;
    out[`${k}.count`] = ((out[`${k}.count`] as number | undefined) ?? 0) + 1;
    const target = LOAD_TARGETS.filter((f) => data[f] !== undefined).map((f) => `${f}=${JSON.stringify(data[f])}`).join(',');
    const fields: Record<string, unknown> = {};
    for (const [f, v] of Object.entries(data).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
      if (LOAD_REFERENCES.has(f) || LOAD_TARGETS.includes(f as never) || v === undefined) continue;
      fields[f] = typeof v === 'number' ? storeNumber(v) : v;
      if (typeof v === 'number') out[`${k}.${f}`] = ((out[`${k}.${f}`] as number | undefined) ?? 0) + v;
    }
    const t = `${k}[${target}]`;
    records.set(t, [...(records.get(t) ?? []), JSON.stringify(fields)]);
  }
  for (const [t, list] of records) out[`${t}.loads`] = list.sort().join(' | ');
  for (const c of modelStore.combinations) {
    out[`combination[${c.id}].factors`] = c.factors.map((f) => `${f.caseId}:${f.factor}`).sort().join(' ');
  }
  out['selfWeight'] = JSON.stringify(modelStore.model.analysis?.selfWeight ?? null);
  return out;
}

/**
 * A legacy file as the current code opened it (and solved it, when `solved`), against the example
 * it was saved from opened by the current code: the same model (`modelFingerprint`) and, when
 * solved, the same results under the snapshot gate's tolerance. Both sides ran the current code,
 * so no registered result change can excuse a difference. The solved reference is the results
 * snapshot gate's committed snapshot (#716) when there is one for today's fixture, else solved here.
 */
export async function againstExample(
  name: string, version: string, entry: Pick<ManifestEntry, 'example' | 'workspace' | 'fixtureBlob'>,
  opened: Pick<Opened, 'values' | 'fingerprint'>, solved: boolean,
): Promise<{ failure: string | null; verdict: Verdict | null; reference: string }> {
  const { fixture, edited } = savedFixture(entry.example, entry.fixtureBlob);
  const snap = solved && !edited ? committedSnapshot(entry.example, entry.workspace) : null;
  const ref = await openExample(entry.example, entry.workspace, { solve: solved && !snap, fixture });
  const reference = snap ? snap.name : edited ? `${entry.example} as ${version} saved it (${entry.fixtureBlob.slice(0, 9)})` : `today's ${entry.example}`;
  const model = fingerprintDifference(`${name} against ${reference}: the model`, ref.fingerprint, opened.fingerprint);
  if (model) return { failure: model, verdict: null, reference };
  if (!solved) return { failure: null, verdict: null, reference };
  const verdict = judge(`${name} against ${reference}`, snap?.values ?? ref.values, opened.values, []);
  return { failure: verdict.kind === 'same' ? null : migrationMessage(verdict, version), verdict, reference };
}

/** What differs between two model fingerprints, for a person, or null when they are the same model. */
export function fingerprintDifference(name: string, reference: Values, current: Values): string | null {
  const diff = compareValues(reference, current) as Diff;
  if (!diff.differs && diff.added.length === 0) return null;
  const lines = [formatCaseReport(name, diff) as string];
  for (const p of diff.added) lines.push(`    ${p}: only in the migrated file, ${JSON.stringify(current[p])}`);
  lines.push('', 'The file, opened by the current code, is another model than the example it was saved from (the same code opened both). No registered result change explains it: the migration reads the old file wrongly. Fix the migration, not the corpus.');
  return lines.join('\n');
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
 * file must open as the same model whatever the solver does. `*` covers a result set's values,
 * not whether the solve refuses, raises an error or finds a combination unstable.
 */
export function declaresMove(change: Pick<ResultChange, 'quantities'>, path: string): boolean {
  const declared = change.quantities ?? [];
  if (path === 'solve.ok' || path === 'unstableCombinations') return declared.includes(path);
  const set = RESULT_SET.exec(path);
  if (!set) return false;
  const rest = set[1] ?? '';
  if (rest === 'errorCodes') return declared.includes('errorCodes');
  if (declared.includes('*')) return true;
  const collection = /^[A-Za-z0-9]+/.exec(rest)?.[0];
  const field = /\]\.([A-Za-z0-9]+)$/.exec(rest)?.[1];
  return !!collection && (declared.includes(collection) || (!!field && declared.includes(`${collection}.${field}`)));
}

export interface Verdict {
  kind: 'same' | 'explained' | 'unexplained';
  /** Set when one side solved and the other refused: then only that refusal and the model counts are judged. */
  solve: 'now refuses' | 'now solves' | null;
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

const OUTSIDE_RESULTS = /^(model\.|solve\.ok$)/;

function outsideResults(v: Values): Values {
  return Object.fromEntries(Object.entries(v).filter(([k]) => OUTSIDE_RESULTS.test(k)));
}

function report(name: string, diff: Diff, solve: Verdict['solve'], current: Values): string {
  const lines = [formatCaseReport(name, diff) as string];
  for (const p of diff.added) lines.push(`    ${p}: newly produced, ${JSON.stringify(current[p])}`);
  if (solve === 'now refuses') lines.push(`    the solve now refuses (${JSON.stringify(current['solve.refusal'] ?? '')}); no result value is compared`);
  if (solve === 'now solves') lines.push('    the solve refused then and solves now; no result value is compared');
  return lines.join('\n');
}

/**
 * Judge the current results of a legacy file against a reference (what the version showed, or
 * what the current example gives) under the snapshot gate's tolerance. A value that changed, is
 * no longer produced, or is produced now and not then is a difference, explained only by an
 * applicable change that declares it. When one side refused, that refusal (`solve.ok`) is the
 * difference, not every value the refused side lacks. Pass no changes when both sides were solved
 * by the current code.
 */
export function judge(name: string, reference: Values, current: Values, changes: readonly ResultChange[]): Verdict {
  const [refGated, refInfo] = split(reference);
  const [curGated, curInfo] = split(current);
  const notes = [...new Set([...Object.keys(refInfo), ...Object.keys(curInfo)])].filter((k) => refInfo[k] !== curInfo[k])
    .map((k) => `${k}: ${JSON.stringify(refInfo[k] ?? null)} → ${JSON.stringify(curInfo[k] ?? null)}`);
  const label = (c: ResultChange) => `${c.id} (results v${c.resultsVersion})`;
  const applicable = changes.map(label);
  const solve: Verdict['solve'] = refGated['solve.ok'] === curGated['solve.ok'] ? null
    : curGated['solve.ok'] === false ? 'now refuses' : refGated['solve.ok'] === false ? 'now solves' : null;
  const diff = compareLegacy(solve ? outsideResults(refGated) : refGated, solve ? outsideResults(curGated) : curGated);
  if (!diff.differs && diff.added.length === 0) return { kind: 'same', solve, report: '', explainedBy: [], applicable, notes };
  const used = new Set<ResultChange>();
  const explained = (path: string) => {
    const by = changes.filter((c) => declaresMove(c, path));
    for (const c of by) used.add(c);
    return by.length > 0;
  };
  const left: Diff = {
    ...diff,
    changed: diff.changed.filter((c) => !explained(c.path)),
    removed: diff.removed.filter((p) => !explained(p)),
    added: diff.added.filter((p) => !explained(p)),
  };
  const explainedBy = changes.filter((c) => used.has(c)).map(label);
  if (left.changed.length > 0 || left.removed.length > 0 || left.added.length > 0) {
    return { kind: 'unexplained', solve, report: report(name, left, solve, { ...current, ...curGated }), explainedBy, applicable, notes };
  }
  return { kind: 'explained', solve, report: report(name, diff, solve, { ...current, ...curGated }), explainedBy, applicable, notes };
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
