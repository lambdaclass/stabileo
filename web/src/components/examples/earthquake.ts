import type { SolverInput3D, SolverSupport3D } from '../../lib/engine/types-3d';
import { defineExample, peak, type Certificate, type Readout, type Values } from './define';
import { Sketch, boundsOf } from './draw';

export const G = 9.80665;
export const DT = 0.01;
export const DURATION = 8;
export const CYCLES = 4;
export const DENSITY = 2500;
export const COLUMN = { a: 0.1225, iy: 0.001251, iz: 0.001251, j: 0.00211 };
export const BEAM = { a: 0.1375, iy: 0.003466, iz: 0.000716, j: 0.00197 };

type Model = SolverInput3D & { storeys: number; bay: number; storeyHeight: number };

export function groundMotion(pga: number, period: number): number[] {
  const steps = Math.round(DURATION / DT);
  return Array.from({ length: steps + 1 }, (_, k) => {
    const t = k * DT;
    return t <= CYCLES * period ? pga * G * Math.sin(2 * Math.PI * t / period) : 0;
  });
}

export function build(v: Values): Model {
  const n = v.storeys, H = v.storeyHeight, L = v.bay;
  const nodes: SolverInput3D['nodes'] = new Map();
  const elements: SolverInput3D['elements'] = new Map();
  const id = (level: number, side: number) => level * 2 + side + 1;
  for (let level = 0; level <= n; level++) for (const side of [0, 1]) nodes.set(id(level, side), { id: id(level, side), x: side * L, y: 0, z: level * H });
  const member = (sectionId: number, i: number, j: number) => {
    const eid = elements.size + 1;
    elements.set(eid, { id: eid, type: 'frame', nodeI: i, nodeJ: j, materialId: 1, sectionId, releaseMyStart: false, releaseMyEnd: false, releaseMzStart: false, releaseMzEnd: false, releaseTStart: false, releaseTEnd: false });
  };
  for (let level = 1; level <= n; level++) {
    member(1, id(level - 1, 0), id(level, 0));
    member(1, id(level - 1, 1), id(level, 1));
    member(2, id(level, 0), id(level, 1));
  }
  const fixed = (nodeId: number): SolverSupport3D => ({ nodeId, rx: true, ry: true, rz: true, rrx: true, rry: true, rrz: true });
  const planar = (nodeId: number): SolverSupport3D => ({ nodeId, rx: false, ry: true, rz: false, rrx: true, rry: false, rrz: true });
  return {
    nodes, elements, storeys: n, bay: L, storeyHeight: H,
    materials: new Map([[1, { id: 1, e: 30000, nu: 0.2 }]]),
    sections: new Map([[1, { id: 1, ...COLUMN }], [2, { id: 2, ...BEAM }]]),
    supports: new Map([...nodes.values()].map(nd => [nd.id, nd.z === 0 ? fixed(nd.id) : planar(nd.id)])),
    loads: [],
    masses: { nodal: [...nodes.values()].filter(nd => nd.z > 0).map(nd => ({ nodeId: nd.id, mass: v.floorMass / 2 })) },
  };
}

export function request(model: Model, v: Values) {
  return {
    solver: model, densities: { 1: DENSITY }, timeStep: DT, nSteps: Math.round(DURATION / DT),
    method: 'newmark', beta: 0.25, gamma: 0.5, dampingXi: v.damping / 100,
    groundAccelX: groundMotion(v.pga, v.period),
  };
}

type History = { timeSteps: number[]; nodeHistories: { nodeId: number; ux: number[]; uz: number[] }[]; peakReactions: { nodeId: number; fx: number }[] };

function timeCertificate(raw: { certificate?: Record<string, any> } | null, reason: string): Certificate {
  const c = raw?.certificate;
  if (!c) return { status: 'unavailable', kind: 'timeHistory', reason };
  if (!c.stabilityCertified) return { status: 'uncertified', kind: 'timeHistory', reason: c.stabilityReason ?? c.residualReason ?? 'stability not certified' };
  return { status: 'certified', kind: 'timeHistory', bound: c.residual?.maxRelEquation ?? null, boundUnit: 'relative' };
}

export const earthquake = defineExample<Model>({
  id: 'earthquake-frame',
  dimension: '2d',
  params: [
    { key: 'storeys', value: 3, min: 1, max: 6, step: 1, unit: '' },
    { key: 'storeyHeight', value: 3.5, min: 2.8, max: 4.5, step: 0.1, unit: 'm' },
    { key: 'bay', value: 5, min: 4, max: 8, step: 0.5, unit: 'm' },
    { key: 'floorMass', value: 30, min: 5, max: 80, step: 1, unit: 't' },
    { key: 'pga', value: 0.2, min: 0.05, max: 0.5, step: 0.01, unit: 'g' },
    { key: 'period', value: 0.5, min: 0.2, max: 2, step: 0.05, unit: 's' },
    { key: 'damping', value: 5, min: 0, max: 10, step: 0.5, unit: '%' },
  ],
  build,
  benchmark: { path: '/research/benchmarks/newmark-1959', title: 'newmark' },
  editor: (model) => ({ mode: 'pro', model }),
  analyses(model, v, engine) {
    const config = request(model, v);
    const result = engine.solveTimeHistory3D(config) as History;
    let certificate: Certificate;
    if (engine.hasCertify('certify_time_history_3d')) {
      const json = JSON.stringify({ ...config, solver: engine.input3DToWireObject(model) });
      certificate = timeCertificate(engine.callCertify('certify_time_history_3d', [json]), '');
    } else certificate = timeCertificate(null, 'certify export not in this build');
    const modal = engine.solveModal3D(model, new Map([[1, DENSITY]]), 1) as { modes: { period: number }[] };
    const roofId = model.storeys * 2 + 1;
    const histories = new Map(result.nodeHistories.map(h => [h.nodeId, h]));
    const roof = histories.get(roofId)!.ux;
    const time = result.timeSteps;
    if (![...roof, ...time].every(Number.isFinite)) return { status: 'refused', reason: 'nonFinite' };
    const roofPoints = time.map((t, k) => [t, roof[k] * 1000] as [number, number]);
    const [peakTime, peakRoof] = peak(roofPoints);
    const step = time.indexOf(peakTime);
    let drift = 0;
    for (let level = 1; level <= model.storeys; level++) {
      const above = histories.get(level * 2 + 1)!.ux, below = level === 1 ? null : histories.get(level * 2 - 1)!.ux;
      for (let k = 0; k < time.length; k++) drift = Math.max(drift, Math.abs(above[k] - (below ? below[k] : 0)) / model.storeyHeight);
    }
    const baseShear = Math.abs(result.peakReactions.filter(r => r.nodeId <= 2).reduce((s, r) => s + r.fx, 0));
    const readouts: Readout[] = [
      { key: 'period', value: modal.modes[0].period, unit: 's' },
      { key: 'peakRoof', value: Math.abs(peakRoof), unit: 'mm' },
      { key: 'peakDrift', value: drift * 100, unit: '%' },
      { key: 'peakBaseShear', value: baseShear, unit: 'kN' },
    ];
    const s = new Sketch();
    const size = Math.max(model.bay, model.storeys * model.storeyHeight);
    s.line(-model.bay * 0.3, 0, model.bay * 1.3, 0);
    for (const e of model.elements.values()) {
      const a = model.nodes.get(e.nodeI)!, b = model.nodes.get(e.nodeJ)!;
      s.line(a.x, a.z, b.x, b.z);
    }
    s.category = 1;
    const maxU = Math.max(...[...histories.values()].map(h => Math.abs(h.ux[step])), 1e-12);
    const scale = size * 0.1 / maxU;
    for (const e of model.elements.values()) {
      const a = model.nodes.get(e.nodeI)!, b = model.nodes.get(e.nodeJ)!;
      const ua = histories.get(a.id), ub = histories.get(b.id);
      s.line(a.x + (ua?.ux[step] ?? 0) * scale, a.z + (ua?.uz[step] ?? 0) * scale, b.x + (ub?.ux[step] ?? 0) * scale, b.z + (ub?.uz[step] ?? 0) * scale);
    }
    const ground = config.groundAccelX.map((a, k) => [k * DT, a / G] as [number, number]);
    return {
      status: 'ok', readouts, certificate, notes: ['chord'],
      views: { deformed: s.view('deformed', 'mm', boundsOf(s.xy, 0.1)) },
      charts: [
        { key: 'roof', xUnit: 's', yUnit: 'mm', points: roofPoints, marker: peakTime },
        { key: 'ground', xUnit: 's', yUnit: 'g', points: ground },
      ],
    };
  },
});
