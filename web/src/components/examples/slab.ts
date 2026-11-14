import type { SolverInput3D, SolverSupport3D } from '../../lib/engine/types-3d';
import { defineExample, linearCertificate, type Certificate, type Readout, type Values } from './define';
import { boundsOf } from './draw';

export const CONCRETE = { e: 30000, nu: 0.2 };
export const PER_BAY = 8;
const SUPPORTS = ['columns', 'walls'] as const;

type Model = SolverInput3D & { size: number; n: number; spacing: number; centre: number };

export const SHEAR_CORRECTION = 5 / 6;

function oddSeries(width: number, power: number, terms: number): number {
  let sum = 0;
  for (let i = 0; i < terms; i++) for (let j = 0; j < terms; j++) {
    const m = 2 * i + 1, n = 2 * j + 1;
    sum += (-1) ** (i + j) / (m * n * ((m / width) ** 2 + (n / width) ** 2) ** power);
  }
  return sum;
}

export function navierCentre(width: number, thickness: number, q: number, terms = 100): number {
  const d = CONCRETE.e * 1000 * thickness ** 3 / (12 * (1 - CONCRETE.nu ** 2));
  return 16 * q * oddSeries(width, 2, terms) / (Math.PI ** 6 * d);
}

export function mindlinCentre(width: number, thickness: number, q: number, terms = 100): number {
  const shear = SHEAR_CORRECTION * CONCRETE.e * 1000 / (2 * (1 + CONCRETE.nu)) * thickness;
  return navierCentre(width, thickness, q, terms) + 16 * q * oddSeries(width, 1, terms) / (Math.PI ** 4 * shear);
}

export function build(v: Values): Model {
  const bays = v.bays, a = v.spacing, n = bays * PER_BAY, size = bays * a, h = size / n;
  const id = (i: number, j: number) => j * (n + 1) + i + 1;
  const nodes: SolverInput3D['nodes'] = new Map();
  for (let j = 0; j <= n; j++) for (let i = 0; i <= n; i++) nodes.set(id(i, j), { id: id(i, j), x: i * h, y: j * h, z: 0 });
  const quads: NonNullable<SolverInput3D['quads']> = new Map();
  const load = new Map<number, number>();
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const q = j * n + i + 1;
    const corners: [number, number, number, number] = [id(i, j), id(i + 1, j), id(i + 1, j + 1), id(i, j + 1)];
    quads.set(q, { id: q, nodes: corners, materialId: 1, thickness: v.thickness });
    for (const c of corners) load.set(c, (load.get(c) ?? 0) + v.load * h * h / 4);
  }
  const walls = SUPPORTS[v.supports] === 'walls';
  const supports: SolverInput3D['supports'] = new Map();
  for (let j = 0; j <= n; j++) for (let i = 0; i <= n; i++) {
    const held = walls ? i === 0 || j === 0 || i === n || j === n : i % PER_BAY === 0 && j % PER_BAY === 0;
    if (!held) continue;
    const s: SolverSupport3D = { nodeId: id(i, j), rx: i === 0 && j === 0, ry: j === 0 && (i === 0 || i === n), rz: true, rrx: walls && (i === 0 || i === n), rry: walls && (j === 0 || j === n), rrz: false };
    supports.set(s.nodeId, s);
  }
  return {
    nodes, quads, supports, size, n, spacing: a, centre: id(n / 2, n / 2),
    materials: new Map([[1, { id: 1, e: CONCRETE.e, nu: CONCRETE.nu }]]),
    sections: new Map(), elements: new Map(), plates: new Map(),
    loads: [...load].map(([nodeId, f]) => ({ type: 'nodal' as const, data: { nodeId, fx: 0, fy: 0, fz: -f, mx: 0, my: 0, mz: 0 } })),
  };
}

export const slab = defineExample<Model>({
  id: 'slab-on-columns',
  dimension: '3d',
  params: [
    { key: 'supports', value: 0, min: 0, max: 1, step: 1, unit: '', options: SUPPORTS },
    { key: 'bays', value: 2, min: 1, max: 3, step: 1, unit: '' },
    { key: 'spacing', value: 6, min: 4, max: 9, step: 0.5, unit: 'm' },
    { key: 'thickness', value: 0.22, min: 0.15, max: 0.35, step: 0.01, unit: 'm' },
    { key: 'load', value: 8, min: 1, max: 20, step: 0.5, unit: 'kN/m²' },
  ],
  build,
  benchmark: { path: '/research/benchmarks/navier-plate', title: 'navier' },
  editor: (model) => ({ app: 'pro', model }),
  analyses(model, v, engine) {
    let certificate: Certificate;
    let displacements: { nodeId: number; uz: number }[];
    if (engine.hasCertifyExport()) {
      const out = engine.certifyLinear3D(model);
      certificate = linearCertificate(out.certificate, out.endToEnd);
      displacements = out.results.displacements;
    } else {
      displacements = engine.solve3D(model).displacements;
      certificate = { status: 'unavailable', kind: 'linear', code: 'noExport' };
    }
    const byNode = new Map(displacements.map(d => [d.nodeId, -d.uz * 1000]));
    const nodes = [...model.nodes.values()];
    const values = nodes.map(n => byNode.get(n.id) ?? 0);
    if (values.some(x => !Number.isFinite(x))) return { status: 'refused', code: 'nonFinite' };
    const max = Math.max(...values);
    const index = new Map(nodes.map((n, k) => [n.id, k]));
    const cells = [...model.quads!.values()].flatMap(q => q.nodes.map(id => index.get(id)!));
    const xy = nodes.flatMap(n => [n.x, n.y]);
    const walls = SUPPORTS[v.supports] === 'walls';
    const span = walls ? model.size : model.spacing;
    const readouts: Readout[] = [
      { key: 'maxDeflection', value: max, unit: 'mm', reference: walls ? { value: mindlinCentre(model.size, v.thickness, v.load) * 1000, source: 'Reissner–Mindlin Navier series, κ = 5/6 (Reddy 2007; Wang, Reddy & Lee 2000)' } : undefined },
      { key: 'spanRatio', value: span / (max / 1000), unit: 'L/δ' },
      { key: 'totalLoad', value: model.loads.reduce((s, l) => s - (l.type === 'nodal' ? l.data.fz : 0), 0), unit: 'kN' },
    ];
    const top = values.indexOf(max);
    return {
      status: 'ok', readouts, certificate, charts: [], notes: [],
      views: { deflection: { xy, cells, cellSize: 4, values, perCell: false, range: { min: 0, max: Math.max(max, 1e-9) }, field: 'deflection', unit: 'mm', geometryOnly: false, bounds: boundsOf(xy, 0.05), peak: { value: max, at: [xy[2 * top], xy[2 * top + 1]] } } },
    };
  },
});
