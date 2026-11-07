import type { SolverInput, AnalysisResults } from '../../lib/engine/types';
import { defineExample, linearCertificate, type Certificate, type EngineApi, type Readout, type Values } from './define';
import { Sketch, boundsOf } from './draw';

export const CONCRETE_E = 30000;
export const WALL = 0.3;
export const OUTRIGGER_I = 2;
export const OUTRIGGER_A = 1;

type Model = SolverInput & { storeys: number; storeyHeight: number; height: number; arm: number; level: number; coreI: number };

export function coreInertia(width: number): number {
  return (width ** 4 - (width - 2 * WALL) ** 4) / 12;
}

export function levelOf(v: Values): number {
  return Math.max(1, Math.min(v.storeys, Math.round(v.position * v.storeys)));
}

export function build(v: Values, level = levelOf(v)): Model {
  const n = v.storeys, h = v.storeyHeight, s = v.arm;
  const nodes: SolverInput['nodes'] = new Map();
  const elements: SolverInput['elements'] = new Map();
  for (let k = 0; k <= n; k++) nodes.set(k + 1, { id: k + 1, x: 0, z: k * h });
  const add = (type: 'frame' | 'truss', i: number, j: number, sectionId: number) => {
    const id = elements.size + 1;
    elements.set(id, { id, type, nodeI: i, nodeJ: j, materialId: 1, sectionId, hingeStart: false, hingeEnd: false });
  };
  for (let k = 0; k < n; k++) add('frame', k + 1, k + 2, 1);
  const loads: SolverInput['loads'] = [...elements.keys()].map(elementId => ({ type: 'distributed' as const, data: { elementId, qI: -v.wind, qJ: -v.wind } }));
  const supports: SolverInput['supports'] = new Map([[1, { id: 1, nodeId: 1, type: 'fixed' as const }]]);
  if (level > 0) {
    const core = level + 1, z = level * h;
    for (const [side, x] of [[0, -s], [1, s]] as const) {
      const tip = n + 2 + side * 2, base = tip + 1;
      nodes.set(tip, { id: tip, x, z });
      nodes.set(base, { id: base, x, z: 0 });
      add('frame', core, tip, 2);
      add('truss', base, tip, 3);
      supports.set(supports.size + 1, { id: supports.size + 1, nodeId: base, type: 'pinned' });
    }
  }
  const coreI = coreInertia(v.coreWidth);
  return {
    nodes, elements, supports, loads, storeys: n, storeyHeight: h, height: n * h, arm: s, level, coreI,
    materials: new Map([[1, { id: 1, e: CONCRETE_E, nu: 0.2 }]]),
    sections: new Map([
      [1, { id: 1, a: v.coreWidth ** 2 - (v.coreWidth - 2 * WALL) ** 2, iz: coreI }],
      [2, { id: 2, a: OUTRIGGER_A, iz: OUTRIGGER_I }],
      [3, { id: 3, a: v.columnArea, iz: v.columnArea ** 2 / 12 }],
    ]),
  };
}

export function closedForm(v: Values, level: number, outriggerI = OUTRIGGER_I): { drift: number; bare: number; columnForce: number } {
  const E = CONCRETE_E * 1000, EI = E * coreInertia(v.coreWidth), w = v.wind;
  const H = v.storeys * v.storeyHeight, x = level * v.storeyHeight, s = v.arm;
  const bare = w * H ** 4 / (8 * EI);
  if (level === 0) return { drift: bare, bare, columnForce: 0 };
  const thetaW = w / (6 * EI) * (3 * H * H * x - 3 * H * x * x + x ** 3);
  const k = 2 * s * s / (x / (E * v.columnArea) + s ** 3 / (3 * E * outriggerI));
  const M = k * thetaW / (1 + k * x / EI);
  return { drift: bare - M * x * (H - x / 2) / EI, bare, columnForce: M / (2 * s) };
}

function topDrift(model: Model, results: AnalysisResults): number {
  return results.displacements.find(d => d.nodeId === model.storeys + 1)!.ux;
}

export function sweep(v: Values, engine: EngineApi): [number, number][] {
  return Array.from({ length: v.storeys }, (_, k) => {
    const model = build(v, k + 1);
    return [(k + 1) * v.storeyHeight, topDrift(model, engine.solve(model)) * 1000] as [number, number];
  });
}

export const outrigger = defineExample<Model>({
  id: 'outrigger',
  dimension: '2d',
  params: [
    { key: 'storeys', value: 40, min: 15, max: 60, step: 1, unit: '' },
    { key: 'storeyHeight', value: 3.5, min: 3, max: 4.5, step: 0.1, unit: 'm' },
    { key: 'position', value: 0.5, min: 0.05, max: 1, step: 0.05, unit: '× H' },
    { key: 'coreWidth', value: 9, min: 6, max: 14, step: 0.5, unit: 'm' },
    { key: 'arm', value: 12, min: 8, max: 20, step: 0.5, unit: 'm' },
    { key: 'columnArea', value: 1, min: 0.25, max: 3, step: 0.05, unit: 'm²' },
    { key: 'wind', value: 30, min: 5, max: 80, step: 1, unit: 'kN/m' },
  ],
  build: (v) => build(v),
  benchmark: { path: '/tools/cantilever-beam', title: 'cantilever' },
  editor: (model) => ({ app: 'basic', model }),
  analyses(model, v, engine) {
    let results: AnalysisResults;
    let certificate: Certificate;
    if (engine.hasCertifyExport()) {
      const out = engine.certifyLinear2D(model);
      results = out.results;
      certificate = linearCertificate(out.certificate, out.endToEnd);
    } else {
      results = engine.solve(model);
      certificate = { status: 'unavailable', kind: 'linear', code: 'noExport' };
    }
    const bareModel = build(v, 0);
    const bare = topDrift(bareModel, engine.solve(bareModel)) * 1000;
    const drift = topDrift(model, results) * 1000;
    const columns = results.elementForces.filter(ef => model.elements.get(ef.elementId)!.type === 'truss');
    const columnForce = Math.max(...columns.map(ef => Math.abs(ef.nStart)));
    const points = sweep(v, engine);
    if (![drift, bare, columnForce, ...points.flat()].every(Number.isFinite)) return { status: 'refused', code: 'nonFinite' };
    const best = points.reduce((a, b) => b[1] < a[1] ? b : a);
    const exact = closedForm(v, model.level);
    const readouts: Readout[] = [
      { key: 'topDrift', value: drift, unit: 'mm', reference: { value: exact.drift * 1000, source: 'Smith & Coull' } },
      { key: 'bareDrift', value: bare, unit: 'mm', reference: { value: exact.bare * 1000, source: 'wH⁴/8EI' } },
      { key: 'driftReduction', value: (1 - drift / bare) * 100, unit: '%' },
      { key: 'columnForce', value: columnForce, unit: 'kN', reference: { value: exact.columnForce, source: 'Smith & Coull' } },
      { key: 'outriggerLevel', value: model.level / model.storeys, unit: `× H (${model.level}/${model.storeys})` },
      { key: 'bestLevel', value: best[0] / model.height, unit: '× H' },
    ];
    const disp = new Map(results.displacements.map(d => [d.nodeId, d]));
    const scale = model.height * 0.08 / Math.max(Math.abs(drift / 1000), 1e-12);
    const s = new Sketch();
    s.line(-model.arm * 1.4, 0, model.arm * 1.4, 0);
    for (const el of model.elements.values()) {
      const a = model.nodes.get(el.nodeI)!, b = model.nodes.get(el.nodeJ)!;
      s.line(a.x, a.z, b.x, b.z);
    }
    s.category = 1;
    for (const el of model.elements.values()) {
      const a = model.nodes.get(el.nodeI)!, b = model.nodes.get(el.nodeJ)!;
      const da = disp.get(a.id)!, db = disp.get(b.id)!;
      s.line(a.x + da.ux * scale, a.z + da.uz * scale, b.x + db.ux * scale, b.z + db.uz * scale);
    }
    return {
      status: 'ok', readouts, certificate, notes: ['chord'],
      views: { outrigger: { ...s.view('outrigger', 'mm', boundsOf(s.xy, 0.06)), legend: { shape: 'deformed', scale } } },
      charts: [{ key: 'driftSweep', xUnit: 'm', yUnit: 'mm', points, marker: model.level * model.storeyHeight, xLabel: 'z (m)' }],
    };
  },
});
