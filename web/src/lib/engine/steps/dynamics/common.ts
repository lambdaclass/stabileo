/** What the three structural dynamics documents share: words, matrices, figures and names. */
import type { Block, Txt } from '../doc';
import { tx } from '../doc';
import { letterName } from '../format';
import type { PlaneModel } from '../plane-model';
import type { Sketch } from '../sketch';
import { sketchOf } from '../sketch';
import type { DofRef, MdofSystem } from '../../dynamics/course/mdof-system';
import type { Mat } from '../../dynamics/course/dense';

export const K = 'course.dynamics.';
export const p = (key: string, params?: Record<string, string | number>, detail = false): Block => ({ kind: 'p', text: tx(K + key, params), ...(detail ? { detail } : {}) });
export const note = (tone: 'info' | 'warn' | 'ok', key: string, params?: Record<string, string | number>): Block => ({ kind: 'note', tone, text: tx(K + key, params) });
export const dt = (key: string, params?: Record<string, string | number>): Txt => tx(K + key, params);

/** Largest matrix written out in full; a bigger one is described by its size. */
export const MAX_SHOWN = 8;

export function matrixBlock(name: string, a: Mat, labels: string[], caption?: Txt, colLabels = labels): Block {
  if (a.length > MAX_SHOWN || (a[0]?.length ?? 0) > MAX_SHOWN) {
    return { kind: 'note', tone: 'info', text: dt('common.tooBig', { name: name.replace(/\\[a-z]+|[{}_\\]/g, ''), r: a.length, c: a[0]?.length ?? 0, max: MAX_SHOWN }) };
  }
  return { kind: 'matrix', name, rows: a, rowLabels: labels, colLabels, ...(caption ? { caption } : {}) };
}

/** Names of the nodes: the plane model's letters, then the nodes added along the members in order. */
export function nodeNames(pm: PlaneModel, sys?: Pick<MdofSystem, 'coords'>): Map<number, string> {
  const names = new Map<number, string>([...pm.nodes.values()].map((n) => [n.id, n.name]));
  let k = names.size;
  for (const id of [...(sys?.coords.keys() ?? [])].sort((a, b) => a - b)) if (!names.has(id)) names.set(id, letterName(k++));
  return names;
}

export const dofTexN = (d: DofRef, names: Map<number, string>): string => {
  const n = names.get(d.nodeId) ?? String(d.nodeId);
  return d.dir === 'ux' ? `u_{${n}}` : d.dir === 'uz' ? `v_{${n}}` : `\\theta_{${n}}`;
};
export const dofTextN = (d: DofRef, names: Map<number, string>): string => {
  const n = names.get(d.nodeId) ?? String(d.nodeId);
  return `${d.dir === 'ux' ? 'u' : d.dir === 'uz' ? 'v' : 'θ'}${n}`;
};

/** The bar model drawn: the structure with the nodes added along members, named, and the masses written at their nodes. */
export function systemSketch(pm: PlaneModel, sys: MdofSystem, names: Map<number, string>, extra: Partial<Sketch> = {}): Sketch {
  const base = sketchOf(pm, { labels: false });
  const nodes = [...sys.coords].map(([id, c]) => ({ id, x: c.x, z: c.z, label: names.get(id) }));
  const members: Sketch['members'] = [];
  let mid = 1;
  for (const chain of sys.chains.values()) for (let k = 0; k + 1 < chain.length; k++) members.push({ id: mid++, i: chain[k], j: chain[k + 1] });
  const labels: NonNullable<Sketch['labels']> = sys.points.map((q) => {
    const c = sys.coords.get(q.nodeId)!;
    return { x: c.x, z: c.z, text: `m = ${+q.mx.toPrecision(4)} t`, color: 'accent', anchor: 'ne' };
  });
  return { ...base, nodes, members, hinges: [], labels, ...extra };
}

/** A mode or a displaced shape drawn over the faint structure: the nodes joined by straight lines. */
export function shapeSketch(pm: PlaneModel, sys: MdofSystem, names: Map<number, string>, full: number[], scale: number): Sketch {
  const base = systemSketch(pm, sys, names);
  const at = new Map<number, { x: number; z: number }>();
  sys.fullDofs.forEach((d, i) => {
    if (d.dir === 'ry') return;
    const cur = at.get(d.nodeId) ?? { x: 0, z: 0 };
    if (d.dir === 'ux') cur.x = full[i]; else cur.z = full[i];
    at.set(d.nodeId, cur);
  });
  const moved = (id: number) => {
    const c = sys.coords.get(id)!;
    const u = at.get(id) ?? { x: 0, z: 0 };
    return { x: c.x + scale * u.x, z: c.z + scale * u.z };
  };
  const deformed = [...sys.chains.values()].map((chain) => ({ points: chain.map(moved) }));
  return { ...base, members: base.members.map((m) => ({ ...m, style: 'faint' as const })), labels: [], deformed };
}

/** Scale for drawing a shape: its largest translation as a tenth of the structure's size. */
export function shapeScale(sys: MdofSystem, full: number[]): number {
  const xs = [...sys.coords.values()];
  const size = Math.max(Math.max(...xs.map((c) => c.x)) - Math.min(...xs.map((c) => c.x)), Math.max(...xs.map((c) => c.z)) - Math.min(...xs.map((c) => c.z)), 1);
  const big = Math.max(...full.filter((_, i) => sys.fullDofs[i].dir !== 'ry').map(Math.abs), 1e-12);
  return (0.12 * size) / big;
}

/** The full vector of the bar model from the kept degrees of freedom (the condensed ones follow through T). */
export function expand(sys: MdofSystem, v: number[]): number[] {
  const c = sys.condensation;
  if (!c) return v;
  const full = new Array<number>(sys.fullDofs.length).fill(0);
  c.masters.forEach((i, k) => { full[i] = v[k]; });
  c.slaves.forEach((i, k) => { full[i] = c.Ts[k].reduce((s, tv, j) => s + tv * v[j], 0); });
  return full;
}

/** Frequencies against the engine: a check when both use the same model, otherwise a table of the difference. */
export function engineFrequencies(rows: { label: string; method: number; matrix: number; unit: string }[], same: boolean, caption: Txt): Block {
  if (same) return { kind: 'compare', rows, caption };
  return {
    kind: 'table',
    head: [dt('mdof.mode'), { tex: 'f\\ [\\text{Hz}]' }, dt('mass.col.engine'), { tex: '\\Delta\\ [\\%]' }],
    rows: rows.map((r, i) => [i + 1, r.method, r.matrix, (100 * (r.method - r.matrix)) / r.matrix]),
    caption,
  };
}
