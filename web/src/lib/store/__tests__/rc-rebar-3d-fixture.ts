import { historyStore, modelStore, uiStore, resultsStore } from '..';
import { ensurePhysicalModel } from '../plates-from-shells';
import { preparePlatesForAnalysis } from '../physical-plates';
import { meshBeforeAnalysis } from '../mesh-policy.svelte';
import { syncDefinedLoadsForAnalysis } from '../defined-loads';
import { publishCombinations3D } from '../active-results';
import { recognizePhysicalElements } from '../physical';
import { galleryExample } from '../../data/__tests__/gallery-examples';
import { bar3dLength, type Frame, type Rebar3d, type V3 } from '../../rc-sheets/rebar-3d';
import { scheduleElements, type PieceOptions, type PieceRows } from '../../rc-sheets/schedule/pieces';
import { developedLength } from '../../rc-sheets/shape';
import { setFoundationSystem } from '../rc-sheets-footings';

export async function solvedExample(id: string): Promise<void> {
  modelStore.clear(); historyStore.clear(); resultsStore.clear(); uiStore.analysisMode = 'pro';
  await galleryExample(id).load();
  ensurePhysicalModel();
  meshBeforeAnalysis.value = true;
  preparePlatesForAnalysis();
  syncDefinedLoadsForAnalysis(); recognizePhysicalElements();
  resultsStore.setResults3D(modelStore.solve3D(false, false, true) as never);
  publishCombinations3D(modelStore.solveCombinations3D(false, false, true) as never);
  setFoundationSystem('auto');
}

const keyOf = (element: string, kind: string, dia: number) => `${element} · ${kind} · Ø${dia}`;

export function pieceLengths(rows: PieceRows, bars: readonly Rebar3d[], o: PieceOptions): { schedule: Map<string, number[]>; view: Map<string, number[]> } {
  const schedule = new Map<string, number[]>(), view = new Map<string, number[]>();
  const push = (m: Map<string, number[]>, k: string, v: number, n = 1) => { const l = m.get(k) ?? []; for (let i = 0; i < n; i++) l.push(v); m.set(k, l); };
  for (const e of scheduleElements(rows, o)) for (const p of e.pieces) push(schedule, keyOf(e.key, p.kind, p.shape.dia), developedLength(p.shape) * 1000, p.count);
  for (const b of bars) push(view, keyOf(b.element, b.kind, b.dia), bar3dLength(b) * 1000);
  for (const m of [schedule, view]) for (const l of m.values()) l.sort((p, q) => p - q);
  return { schedule, view };
}

export function mismatches(a: Map<string, number[]>, b: Map<string, number[]>, tol = 1): string[] {
  const out: string[] = [];
  for (const k of new Set([...a.keys(), ...b.keys()])) {
    const x = a.get(k) ?? [], y = b.get(k) ?? [];
    if (x.length !== y.length) { out.push(`${k}: ${x.length} in the schedule, ${y.length} in 3D`); continue; }
    const worst = x.reduce((m, v, i) => Math.max(m, Math.abs(v - y[i]!)), 0);
    if (worst > tol) out.push(`${k}: lengths differ by ${worst.toFixed(1)} mm`);
  }
  return out;
}

const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

export const local = (f: Frame, p: V3): V3 => { const d: V3 = [p[0] - f.o[0], p[1] - f.o[1], p[2] - f.o[2]]; return [dot(d, f.x), dot(d, f.y), dot(d, f.z)]; };

export const gaps = (xs: readonly number[]): number[] => { const s = [...xs].sort((p, q) => p - q); return s.slice(1).map((v, i) => v - s[i]!); };

const unitOf = (a: V3): V3 => { const l = Math.hypot(...a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

export function bentPoints(b: Pick<Rebar3d, 'segments' | 'mandrel' | 'dia'>): V3[] {
  const r = (b.mandrel + b.dia / 1000) / 2;
  return b.segments.flatMap((pts) => pts.flatMap((p, i) => {
    if (i === 0 || i === pts.length - 1) return [p];
    const u = unitOf([p[0] - pts[i - 1]![0], p[1] - pts[i - 1]![1], p[2] - pts[i - 1]![2]]), w = unitOf([pts[i + 1]![0] - p[0], pts[i + 1]![1] - p[1], pts[i + 1]![2] - p[2]]);
    const th = Math.acos(Math.max(-1, Math.min(1, dot(u, w))));
    if (th < 1e-9) return [p];
    const T = r * Math.tan(th / 2), bis = unitOf([w[0] - u[0], w[1] - u[1], w[2] - u[2]]), m = r / Math.cos(th / 2) - r;
    return [[p[0] - u[0] * T, p[1] - u[1] * T, p[2] - u[2] * T], [p[0] + w[0] * T, p[1] + w[1] * T, p[2] + w[2] * T], [p[0] + bis[0] * m, p[1] + bis[1] * m, p[2] + bis[2] * m]] as V3[];
  }));
}
