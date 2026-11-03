import type { SolverInput } from '../../lib/engine/types';
import type { SolverInput3D, SolverSupport3D } from '../../lib/engine/types-3d';
import { defineExample, type Certificate, type Readout, type Values, type View } from './define';
import { Sketch, boundsOf } from './draw';

export const STEEL = { e: 210000, nu: 0.3, density: 7850 };
export const SEGMENTS = 20;

type Model = { plane: SolverInput; space: SolverInput3D; height: number; tube: Tube; topMass: number };
type Tube = { a: number; i: number };

export function tube(diameter: number, thicknessMm: number): Tube {
  const d = diameter, di = diameter - 2 * thicknessMm / 1000;
  return { a: Math.PI / 4 * (d * d - di * di), i: Math.PI / 64 * (d ** 4 - di ** 4) };
}

export function build(v: Values): Model {
  const H = v.height, t = tube(v.diameter, v.thickness);
  const z = (k: number) => H * k / SEGMENTS;
  const plane: SolverInput = {
    nodes: new Map(Array.from({ length: SEGMENTS + 1 }, (_, k) => [k + 1, { id: k + 1, x: 0, z: z(k) }])),
    elements: new Map(Array.from({ length: SEGMENTS }, (_, k) => [k + 1, { id: k + 1, type: 'frame' as const, nodeI: k + 1, nodeJ: k + 2, materialId: 1, sectionId: 1, hingeStart: false, hingeEnd: false }])),
    materials: new Map([[1, { id: 1, e: STEEL.e, nu: STEEL.nu }]]),
    sections: new Map([[1, { id: 1, a: t.a, iz: t.i }]]),
    supports: new Map([[1, { id: 1, nodeId: 1, type: 'fixed' as const }]]),
    loads: [{ type: 'nodal', data: { nodeId: SEGMENTS + 1, fx: 0, fz: -v.topLoad, my: 0 } }],
  };
  const held = (nodeId: number): SolverSupport3D => nodeId === 1
    ? { nodeId, rx: true, ry: true, rz: true, rrx: true, rry: true, rrz: true }
    : { nodeId, rx: false, ry: true, rz: false, rrx: true, rry: false, rrz: true };
  const space: SolverInput3D = {
    nodes: new Map(Array.from({ length: SEGMENTS + 1 }, (_, k) => [k + 1, { id: k + 1, x: 0, y: 0, z: z(k) }])),
    elements: new Map(Array.from({ length: SEGMENTS }, (_, k) => [k + 1, { id: k + 1, type: 'frame' as const, nodeI: k + 1, nodeJ: k + 2, materialId: 1, sectionId: 1, releaseMyStart: false, releaseMyEnd: false, releaseMzStart: false, releaseMzEnd: false, releaseTStart: false, releaseTEnd: false }])),
    materials: new Map([[1, { id: 1, e: STEEL.e, nu: STEEL.nu }]]),
    sections: new Map([[1, { id: 1, a: t.a, iy: t.i, iz: t.i, j: 2 * t.i }]]),
    supports: new Map(Array.from({ length: SEGMENTS + 1 }, (_, k) => [k + 1, held(k + 1)])),
    loads: [],
    masses: v.topMass > 0 ? { nodal: [{ nodeId: SEGMENTS + 1, mass: v.topMass }] } : undefined,
  };
  return { plane, space, height: H, tube: t, topMass: v.topMass };
}

function frequencyEquation(beta: number, mu: number): number {
  return 1 + Math.cos(beta) * Math.cosh(beta) + mu * beta * (Math.cos(beta) * Math.sinh(beta) - Math.sin(beta) * Math.cosh(beta));
}

export function cantileverRoots(mu: number, count = 3): number[] {
  const roots: number[] = [];
  const f = (b: number) => frequencyEquation(b, mu) / Math.cosh(b);
  let a = 0.1, fa = f(a);
  for (let b = 0.1 + 1e-3; roots.length < count; b += 1e-3) {
    const fb = f(b);
    if (fa * fb <= 0) {
      let lo = a, hi = b;
      for (let k = 0; k < 200; k++) {
        const mid = (lo + hi) / 2;
        if (f(lo) * f(mid) <= 0) hi = mid; else lo = mid;
      }
      roots.push((lo + hi) / 2);
    }
    a = b; fa = fb;
  }
  return roots;
}

export function closedForm(v: Values): { frequencies: number[]; pcr: number } {
  const t = tube(v.diameter, v.thickness), H = v.height;
  const EI = STEEL.e * 1000 * t.i, m = STEEL.density / 1000 * t.a;
  const roots = cantileverRoots(v.topMass / (m * H));
  return {
    frequencies: roots.map(b => b * b * Math.sqrt(EI / (m * H ** 4)) / (2 * Math.PI)),
    pcr: Math.PI ** 2 * EI / (4 * H * H),
  };
}

type Shape = { nodeId: number; ux: number; uz: number }[];

function bucklingCertificate(raw: { certificate?: { status: string; lambdaLower?: number; lambdaUpper?: number | null; lambdaComputed?: number; reason?: string } }): Certificate {
  const c = raw.certificate;
  if (!c) return { status: 'unavailable', kind: 'buckling', code: 'noExport' };
  if (c.status !== 'certified') return { status: 'uncertified', kind: 'buckling', code: 'engine', reason: c.reason };
  const width = c.lambdaUpper == null ? null : (c.lambdaUpper - c.lambdaLower!) / c.lambdaComputed!;
  return { status: 'certified', kind: 'buckling', bound: width, measure: 'bracket' };
}

function flexural(shape: Shape): boolean {
  const ux = Math.max(...shape.map(d => Math.abs(d.ux))), uz = Math.max(...shape.map(d => Math.abs(d.uz)));
  return ux > uz;
}

export const tower = defineExample<Model>({
  id: 'tower',
  dimension: '2d',
  params: [
    { key: 'height', value: 60, min: 20, max: 150, step: 5, unit: 'm' },
    { key: 'diameter', value: 3, min: 1, max: 6, step: 0.1, unit: 'm' },
    { key: 'thickness', value: 20, min: 8, max: 60, step: 1, unit: 'mm' },
    { key: 'topMass', value: 0, min: 0, max: 300, step: 5, unit: 't' },
    { key: 'topLoad', value: 2000, min: 100, max: 20000, step: 100, unit: 'kN' },
  ],
  build,
  benchmark: { path: '/tools/column-buckling', title: 'euler' },
  analyses(model, v, engine) {
    const buckling = engine.solveBuckling(model.plane, 2) as { modes: { loadFactor: number; displacements: Shape }[]; certificate?: never };
    const modal = engine.solveModal3D(model.space, new Map([[1, STEEL.density]]), 8) as { modes: { frequency: number; displacements: Shape }[] };
    const modes = modal.modes.filter(m => flexural(m.displacements)).slice(0, 3);
    if (modes.length < 3 || buckling.modes.length < 2) return { status: 'refused', code: 'engine', reason: 'fewer modes than requested' };
    const lambda = buckling.modes[0].loadFactor;
    if (![lambda, ...modes.map(m => m.frequency)].every(Number.isFinite)) return { status: 'refused', code: 'nonFinite' };
    const exact = closedForm(v);
    const source = v.topMass > 0 ? `(βL)²√(EI/mL⁴), μ = M/mL = ${(v.topMass / (STEEL.density / 1000 * model.tube.a * model.height)).toPrecision(3)}` : '(βL)²√(EI/mL⁴)';
    const readouts: Readout[] = [
      ...modes.map((m, k) => ({ key: `f${k + 1}`, value: m.frequency, unit: 'Hz', reference: { value: exact.frequencies[k], source } })),
      { key: 'bucklingFactor', value: lambda, unit: '', reference: { value: exact.pcr / v.topLoad, source: 'π²EI/4H²P' } },
      { key: 'criticalLoad', value: lambda * v.topLoad, unit: 'kN', reference: { value: exact.pcr, source: 'π²EI/4H²' } },
    ];
    const H = model.height;
    const draw = (field: string, shape: Shape): View => {
      const s = new Sketch();
      s.line(-H * 0.15, 0, H * 0.15, 0);
      s.line(0, 0, 0, H);
      s.category = 1;
      const top = Math.max(...shape.map(d => Math.abs(d.ux)), 1e-12);
      const pts = shape.map(d => [d.ux / top * H * 0.15, H * (d.nodeId - 1) / SEGMENTS] as [number, number]).sort((a, b) => a[1] - b[1]);
      s.polyline(pts);
      return s.view(field, '', boundsOf([-H * 0.2, 0, H * 0.2, H], 0.04));
    };
    const views: Record<string, View> = {};
    modes.forEach((m, k) => { views[`mode${k + 1}`] = draw(`mode${k + 1}`, m.displacements); });
    views.buckling = draw('buckling', buckling.modes[0].displacements);
    return { status: 'ok', readouts, certificate: bucklingCertificate(buckling), views, charts: [], notes: ['modeShapes'] };
  },
});
