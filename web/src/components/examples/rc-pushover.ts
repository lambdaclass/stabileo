import type { SolverInput } from '../../lib/engine/types';
import { withSection, type Bar } from '../../lib/engine/codes/argentina/cirsoc201-section';
import { ES_MPA } from '../../lib/engine/codes/argentina/cirsoc201-basis';
import { defineExample, type Readout, type Values } from './define';
import { barsFit } from './rc-column';
import { Sketch, boundsOf } from './draw';

export const SEGMENTS = 20;
export const INCREMENTS = 80;
export const LAYERS = 40;
export const TIE_MM = 10;
export const COVER = 0.04;
export const EPS_C0 = 0.002;
const STEELS = [420, 500] as const;

export type Model = { solver: SolverInput; v: Values; capacity: number; lateral: number };

export function concreteModulus(fc: number): number {
  return 2 * fc / EPS_C0;
}

export function layers(v: Values): { area: number; depth: number; cover: number } {
  const cover = COVER + TIE_MM / 1000 + v.barDia / 2000;
  return { area: v.perFace * Math.PI * (v.barDia / 1000) ** 2 / 4, depth: v.h - cover, cover };
}

export function nominalMoment(v: Values): number {
  const { area, cover } = layers(v);
  const y = v.h / 2 - cover;
  const bars: Bar[] = [{ x: 0, y, area }, { x: 0, y: -y, area }];
  return withSection({ kind: 'rect', b: v.b, h: v.h }, bars, { fc: v.fc, fy: STEELS[v.steel], edition: '2025' }, (s) => {
    const state = s.atAxial(Math.PI / 2, 0);
    if (!state) throw new Error('no pure-bending state');
    return Math.abs(state.Mnx);
  });
}

export function crackedStiffness(v: Values): { stiffness: number; inertia: number; depth: number } {
  const { area, depth: d, cover: dc } = layers(v);
  const n = ES_MPA / concreteModulus(v.fc);
  const a = v.b / 2, b = 2 * n * area, c = -n * area * (dc + d);
  const x = (-b + Math.sqrt(b * b - 4 * a * c)) / (2 * a);
  const inertia = v.b * x ** 3 / 3 + n * area * ((x - dc) ** 2 + (d - x) ** 2);
  return { stiffness: 3 * concreteModulus(v.fc) * 1000 * inertia / v.height ** 3, inertia, depth: x };
}

export const EPS_CU = 0.004;
export const HARDENING = 0.01;

function concreteStress(fc: number, strain: number): number {
  const e = -strain;
  if (e <= 0 || e >= EPS_CU) return 0;
  if (e <= EPS_C0) return -fc * (2 * e / EPS_C0 - (e / EPS_C0) ** 2);
  return -fc * (1 - (e - EPS_C0) / (EPS_CU - EPS_C0));
}

function steelStress(fy: number, strain: number): number {
  const ey = fy / ES_MPA;
  return Math.abs(strain) <= ey ? ES_MPA * strain : Math.sign(strain) * (fy + HARDENING * ES_MPA * (Math.abs(strain) - ey));
}

export function sectionPeak(v: Values, strips = 400, steps = 200, iterations = 60): number {
  const { area, cover } = layers(v);
  const fy = STEELS[v.steel];
  const dy = v.h / strips;
  const resultant = (top: number, c: number) => {
    const strain = (y: number) => -top * (1 - (v.h / 2 - y) / c);
    let n = 0, m = 0;
    for (let k = 0; k < strips; k++) {
      const y = -v.h / 2 + dy * (k + 0.5);
      const f = concreteStress(v.fc, strain(y)) * v.b * dy;
      n += f; m -= f * y;
    }
    for (const y of [v.h / 2 - cover, -(v.h / 2 - cover)]) {
      const f = steelStress(fy, strain(y)) * area;
      n += f; m -= f * y;
    }
    return { n, m };
  };
  let best = 0;
  for (let i = 1; i <= steps; i++) {
    const top = EPS_CU * i / steps;
    let lo = 1e-6 * v.h, hi = 50 * v.h;
    for (let k = 0; k < iterations; k++) {
      const c = Math.sqrt(lo * hi);
      if (resultant(top, c).n < 0) hi = c; else lo = c;
    }
    best = Math.max(best, resultant(top, Math.sqrt(lo * hi)).m);
  }
  return best * 1000;
}

export function build(v: Values): Model {
  const nodes: SolverInput['nodes'] = new Map();
  const elements: SolverInput['elements'] = new Map();
  for (let k = 0; k <= SEGMENTS; k++) nodes.set(k + 1, { id: k + 1, x: 0, z: v.height * k / SEGMENTS });
  for (let k = 1; k <= SEGMENTS; k++) elements.set(k, { id: k, type: 'frame', nodeI: k, nodeJ: k + 1, materialId: 1, sectionId: 1, hingeStart: false, hingeEnd: false });
  const capacity = nominalMoment(v) / v.height;
  const lateral = v.target * capacity;
  return {
    v, capacity, lateral,
    solver: {
      nodes, elements,
      materials: new Map([[1, { id: 1, e: concreteModulus(v.fc), nu: 0.2 }]]),
      sections: new Map([[1, { id: 1, a: v.b * v.h, iz: v.b * v.h ** 3 / 12 }]]),
      supports: new Map([[1, { id: 1, nodeId: 1, type: 'fixed' as const }]]),
      loads: [{ type: 'nodal', data: { nodeId: SEGMENTS + 1, fx: lateral, fz: 0, my: 0 } }],
    },
  };
}

export function fiberSection(v: Values) {
  const { area, cover } = layers(v);
  const dy = v.h / LAYERS;
  const concrete = Array.from({ length: LAYERS }, (_, k) => ({ y: -v.h / 2 + dy * (k + 0.5), z: 0, area: v.b * dy, materialIdx: 0 }));
  const steel = [v.h / 2 - cover, -(v.h / 2 - cover)].map(y => ({ y, z: 0, area, materialIdx: 1 }));
  return {
    fibers: [...concrete, ...steel],
    materials: [
      { type: 'concrete_hognestad', fc: v.fc, epsC0: EPS_C0, epsCu: EPS_CU, ft: 0 },
      { type: 'steel_bilinear', e: ES_MPA, fy: STEELS[v.steel], hardeningRatio: HARDENING },
    ],
  };
}

type Displacement = { nodeId: number; ux: number; uz: number; ry: number };
type Run = {
  status: 'complete' | 'stopped';
  lastConvergedLoadFactor: number;
  stopReason: string | null;
  history: { loadFactor: number; displacements: Displacement[] }[];
  results: { displacements: Displacement[]; reactions: { nodeId: number; rx: number }[]; equilibrium: { relativeResidual: number } };
  fiberStatus: { elementId: number; yielded: boolean }[];
};

export const rcPushover = defineExample<Model>({
  id: 'rc-pushover',
  dimension: '2d',
  params: [
    { key: 'height', value: 3, min: 1.5, max: 6, step: 0.25, unit: 'm' },
    { key: 'b', value: 0.4, min: 0.25, max: 0.6, step: 0.05, unit: 'm' },
    { key: 'h', value: 0.5, min: 0.3, max: 0.8, step: 0.05, unit: 'm' },
    { key: 'perFace', value: 3, min: 2, max: 6, step: 1, unit: '' },
    { key: 'barDia', value: 20, min: 12, max: 32, step: 2, unit: 'mm' },
    { key: 'fc', value: 30, min: 20, max: 50, step: 5, unit: 'MPa' },
    { key: 'steel', value: 0, min: 0, max: 1, step: 1, unit: '', options: ['adn420', 'adn500'] },
    { key: 'target', value: 1.3, min: 0.5, max: 1.6, step: 0.05, unit: '× Mn/L' },
  ],
  build,
  benchmark: { path: '/research/benchmarks/plastic-collapse', title: 'plastic' },
  editor: (model) => ({ app: 'basic', model: model.solver }),
  analyses(model, v, engine) {
    if (!barsFit({ ...v, cover: COVER })) return { status: 'refused', code: 'barsDoNotFit' };
    const run = engine.solveFiberNonlinear2D({
      solver: model.solver, fiberSections: { 1: fiberSection(v) },
      nIntegrationPoints: 5, maxIter: 40, tolerance: 1e-8, nIncrements: INCREMENTS, modifiedNr: false,
    }) as Run;
    const tip = (d: Displacement[]) => d.find(x => x.nodeId === SEGMENTS + 1)!.ux;
    const curve: [number, number][] = [[0, 0], ...run.history.map(h => [tip(h.displacements) * 1000, h.loadFactor * model.lateral] as [number, number])];
    if (!curve.flat().every(Number.isFinite)) return { status: 'refused', code: 'nonFinite' };
    if (run.history.length === 0) return { status: 'refused', code: 'engine', reason: run.stopReason ?? 'no converged load step' };
    const carried = run.lastConvergedLoadFactor * model.lateral;
    const first = run.history[0];
    const cracked = crackedStiffness(v);
    const section = sectionPeak(v) / v.height;
    const readouts: Readout[] = [
      { key: 'peakShear', value: carried, unit: 'kN', reference: { value: section, source: 'max M(φ) / L' } },
      { key: 'nominalShear', value: model.capacity, unit: 'kN' },
      { key: 'crackedStiffness', value: first.loadFactor * model.lateral / tip(first.displacements) / 1000, unit: 'kN/mm', reference: { value: cracked.stiffness / 1000, source: '3EcIcr/L³' } },
      { key: 'topDisplacement', value: tip(run.results.displacements) * 1000, unit: 'mm' },
      { key: 'baseShear', value: -run.results.reactions.find(r => r.nodeId === 1)!.rx, unit: 'kN' },
      { key: 'yieldedElements', value: run.fiberStatus.filter(s => s.yielded).length, unit: `/ ${SEGMENTS}` },
      { key: 'residual', value: run.results.equilibrium.relativeResidual, unit: '' },
    ];
    const s = new Sketch();
    const H = v.height;
    s.line(-H * 0.3, 0, H * 0.3, 0);
    s.line(0, 0, 0, H);
    s.category = 1;
    const disp = run.results.displacements;
    const peakUx = Math.max(Math.abs(tip(disp)), 1e-12);
    s.polyline(disp.slice().sort((a, b) => a.nodeId - b.nodeId).map(d => [d.ux / peakUx * H * 0.2, H * (d.nodeId - 1) / SEGMENTS] as [number, number]));
    return {
      status: 'ok', readouts, notes: ['magnified'],
      certificate: { status: 'unavailable', kind: 'fiber', code: 'noCertifier' },
      stopped: run.status === 'stopped' ? { loadFactor: run.lastConvergedLoadFactor, reason: run.stopReason ?? '' } : undefined,
      views: { pushover: s.view('pushover', 'mm', boundsOf([-H * 0.3, 0, H * 0.3, H], 0.05)) },
      charts: [{
        key: 'pushoverCurve', xUnit: 'mm', yUnit: 'kN', xLabel: 'δ (mm)', points: curve,
        overlays: [
          { key: 'capacityLine', points: [[0, section], [curve[curve.length - 1][0], section]], dashed: true },
          { key: 'crackedLine', points: [[0, 0], [section / cracked.stiffness * 1000, section]], dashed: true },
        ],
      }],
    };
  },
});
