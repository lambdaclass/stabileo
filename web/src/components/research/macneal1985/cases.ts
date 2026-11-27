import data from '../../../../../engine/tests/benchmarks/macneal_harder.json';
import type { SolverInput } from '../../../lib/engine/types';
import type { SolverInput3D } from '../../../lib/engine/types-3d';
import { knownIssueRefusal, knownIssueResultDisposition, refusedKnownIssues } from '../../../lib/engine/known-issues';

export type Case = typeof data.cases[number];
export const cases = data.cases;
export const nativeOnly = data.nativeOnly;
export const tolerance = data.accuracyTolerance;
export type Verdict = 'pass' | 'marginal' | 'marginalFail' | 'documented' | 'withheld' | 'mismatch' | 'error';
export type Result = { id: string; value: number | null; error: number | null; pass: boolean; marginal?: boolean; refused?: boolean; knownIssue?: string; issue?: number; failure?: string; displacement?: Record<string, number>[] };

export const category = (c: Case): 'shell' | 'frame' => (c.element === 'frame' ? 'frame' : 'shell');
export const unitOf = (c: Case) => (c.measurement.component.startsWith('r') ? 'rad' : 'm');

export function inputFor(c: Case): SolverInput | SolverInput3D {
  const input: Record<string, unknown> = { ...c.input };
  for (const key of ['nodes', 'materials', 'sections', 'elements', 'supports', 'quads', 'connectors']) {
    input[key] = new Map(Object.entries((c.input as Record<string, unknown>)[key] ?? {}).map(([id, value]) => [Number(id), value]));
  }
  return input as unknown as SolverInput | SolverInput3D;
}

const relativeError = (value: number, reference: number) => Math.abs(value / reference - 1);

export function compare(c: Case, displacements: Record<string, number>[]): Result {
  const selected = c.measurement.nodes.map(id => displacements.find(d => d.nodeId === id)?.[c.measurement.component]);
  if (selected.some(v => typeof v !== 'number' || !Number.isFinite(v))) throw new Error(`Missing or non-finite displacement: ${c.id}`);
  const value = (selected as number[]).reduce((a, b) => a + b, 0) / selected.length;
  const error = relativeError(value, c.reference);
  const h = c.referenceRounding;
  const ends = [relativeError(value, c.reference - h), relativeError(value, c.reference + h)];
  const best = Math.abs(value - c.reference) <= h ? 0 : Math.min(...ends);
  const marginal = h > 0 && (best < tolerance) !== (Math.max(...ends) < tolerance);
  return { id: c.id, value, error, pass: error < tolerance, marginal, displacement: displacements };
}

export function verdict(c: Case, r: Result): Verdict {
  if (r.refused) return 'withheld';
  if (r.failure) return 'error';
  if (r.marginal) return r.pass ? 'marginal' : 'marginalFail';
  if (r.pass) return 'pass';
  const { pinnedValue, relativeTolerance } = (c.nativeBounds ?? {}) as { pinnedValue?: number; relativeTolerance?: number };
  const locked = r.value !== null && pinnedValue !== undefined && relativeTolerance !== undefined && Math.abs(r.value / pinnedValue - 1) <= relativeTolerance;
  return !c.expectedPass && 'knownIssue' in c && c.knownIssue && locked ? 'documented' : 'mismatch';
}

export function counts(rows: Result[]) {
  const of = (k: 'shell' | 'frame') => {
    const ids = new Set(cases.filter(c => category(c) === k).map(c => c.id));
    return { passed: rows.filter(r => ids.has(r.id) && r.pass).length, withheld: rows.filter(r => ids.has(r.id) && r.refused).length, total: ids.size };
  };
  return { shell: of('shell'), frame: of('frame') };
}

export function refusalFor(c: Case, e: unknown): Result {
  const failure = knownIssueRefusal(e) ?? String(e);
  const expected = c.expectedRefusal;
  const refused = !!expected && refusedKnownIssues(e).some(d => d.phase === expected.id && d.value === expected.issue);
  return { id: c.id, value: null, error: null, pass: false, failure,
    ...(refused ? { refused: true, knownIssue: expected!.id, issue: expected!.issue } : {}) };
}

export async function runCases(onResult?: (r: Result) => void): Promise<Result[]> {
  const engine = await import('../../../lib/engine/wasm-solver');
  await engine.initSolver();
  const rows: Result[] = [];
  for (const c of cases) {
    let row: Result;
    try {
      const input = inputFor(c);
      const result = c.dimension === 2 ? engine.solve(input as SolverInput) : engine.solve3D(input as SolverInput3D);
      if (knownIssueResultDisposition(result).refused) throw new Error(JSON.stringify({ structuredDiagnostics: result.structuredDiagnostics }));
      if (c.expectedRefusal) throw new Error(`Expected containment refusal: ${c.id}`);
      row = compare(c, result.displacements as unknown as Record<string, number>[]);
    } catch (e) {
      row = refusalFor(c, e);
    }
    rows.push(row);
    onResult?.(row);
  }
  return rows;
}

/** Distorted shapes of Fig. 4: interior stations shift by ∓d at the root edge and ±d at the free edge. */
export const distortable = (c: Case) => c.element === 'MITC4' && !/-regular-/.test(c.id);
export const PAPER_SKEW = 45;
const WIDTH = 0.2;

export function skewOffset(degrees: number): number {
  return Number((WIDTH / 2 * Math.tan(degrees * Math.PI / 180)).toFixed(12));
}

export function skewedCase(c: Case, degrees: number): Case {
  if (!distortable(c)) throw new Error(`Not a distorted MacNeal–Harder mesh: ${c.id}`);
  const d = skewOffset(degrees);
  const length = Math.max(...Object.values(c.input.nodes).map(n => n.x));
  const trapezoidal = c.id.includes('trapezoidal');
  const nodes = Object.fromEntries(Object.entries(c.input.nodes).map(([id, n]) => {
    const station = Math.round(n.x);
    const interior = station > 0 && station < length;
    const sign = trapezoidal && station % 2 === 0 ? -1 : 1;
    const top = 'y' in n && n.y > 0;
    return [id, { ...n, x: interior ? station + sign * (top ? d : -d) : station }];
  }));
  return { ...c, input: { ...c.input, nodes } } as Case;
}

export async function runVariant(c: Case): Promise<Result> {
  try {
    const engine = await import('../../../lib/engine/wasm-solver');
    await engine.initSolver();
    const result = engine.solve3D(inputFor(c) as SolverInput3D);
    if (knownIssueResultDisposition(result).refused) throw new Error(JSON.stringify({ structuredDiagnostics: result.structuredDiagnostics }));
    return compare(c, result.displacements as unknown as Record<string, number>[]);
  } catch (e) {
    const failure = knownIssueRefusal(e) ?? String(e);
    const refused = refusedKnownIssues(e).some(d => d.phase === 'SH-MITC4-DISTORTION' && d.value === 798);
    return { id: c.id, value: null, error: null, pass: false, failure, ...(refused ? { refused: true, knownIssue: 'SH-MITC4-DISTORTION', issue: 798 } : {}) };
  }
}

export function viewerData(c: Case, result?: Result) {
  const nodes = Object.values(c.input.nodes).sort((a, b) => a.id - b.id);
  const index = new Map(nodes.map((n, i) => [n.id, i]));
  const xy = nodes.flatMap(n => [n.x, c.dimension === 2 ? n.z : ('y' in n ? n.y : 0)]);
  const cells = c.dimension === 2
    ? Object.values(c.input.elements).flatMap(e => [index.get(e.nodeI)!, index.get(e.nodeJ)!])
    : Object.values(c.input.quads ?? {}).flatMap(e => e.nodes.map(n => index.get(n)!));
  const displacement = result?.displacement ? nodes.flatMap(n => {
    const d = result.displacement!.find(d => d.nodeId === n.id)!;
    return [d.ux, c.dimension === 2 || c.measurement.component === 'uz' ? d.uz : d.uy];
  }) : null;
  const values = result?.displacement ? nodes.map(n => {
    const d = result.displacement!.find(d => d.nodeId === n.id)!;
    return Math.hypot(d.ux ?? 0, d.uy ?? 0, d.uz ?? 0);
  }) : null;
  const displayMode: 'field' | 'geometry' = values ? 'field' : 'geometry';
  return { xy, cells, displacement, values, displayMode, range: { min: 0, max: Math.max(...(values ?? [1]), 1e-12) } };
}
