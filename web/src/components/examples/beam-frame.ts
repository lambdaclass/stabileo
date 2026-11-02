import type { SolverInput, SupportType, AnalysisResults } from '../../lib/engine/types';
import { defineExample, linearCertificate, peak, type Chart, type Readout, type Values, type View, type Certificate } from './define';
import { Sketch, boundsOf } from './draw';

export const SECTION = { e: 200000, a: 0.00538, iz: 0.00008356 };
export const EI = SECTION.e * 1000 * SECTION.iz;
const SUPPORTS = ['pinnedRoller', 'fixedPinned', 'fixedFixed'] as const;

type Model = SolverInput & { portal: boolean; length: number; height: number };

function supportTypes(index: number, portal: boolean): [SupportType, SupportType] {
  const kind = SUPPORTS[index];
  if (kind === 'fixedFixed') return ['fixed', 'fixed'];
  if (kind === 'fixedPinned') return ['fixed', portal ? 'pinned' : 'rollerX'];
  return ['pinned', 'rollerX'];
}

export function build(v: Values): Model {
  const portal = v.system === 1;
  const L = v.span, H = v.height;
  const [left, right] = supportTypes(v.supports, portal);
  const nodes: SolverInput['nodes'] = new Map();
  const elements: SolverInput['elements'] = new Map();
  const frame = (id: number, i: number, j: number) => elements.set(id, { id, type: 'frame', nodeI: i, nodeJ: j, materialId: 1, sectionId: 1, hingeStart: false, hingeEnd: false });
  const loads: SolverInput['loads'] = [];
  let supports: SolverInput['supports'];
  if (portal) {
    [[0, 0], [0, H], [L, H], [L, 0]].forEach(([x, z], k) => nodes.set(k + 1, { id: k + 1, x, z }));
    frame(1, 1, 2); frame(2, 2, 3); frame(3, 3, 4);
    supports = new Map([[1, { id: 1, nodeId: 1, type: left }], [2, { id: 2, nodeId: 4, type: right }]]);
    if (v.load > 0) loads.push({ type: 'distributed', data: { elementId: 2, qI: -v.load, qJ: -v.load } });
    if (v.point > 0) loads.push({ type: 'nodal', data: { nodeId: 2, fx: v.point, fz: 0, my: 0 } });
  } else {
    const a = v.position * L;
    const xs = a > 0 && a < L ? [0, a, L] : [0, L];
    xs.forEach((x, k) => nodes.set(k + 1, { id: k + 1, x, z: 0 }));
    for (let k = 1; k < xs.length; k++) frame(k, k, k + 1);
    supports = new Map([[1, { id: 1, nodeId: 1, type: left }], [2, { id: 2, nodeId: xs.length, type: right }]]);
    if (v.load > 0) for (const id of elements.keys()) loads.push({ type: 'distributed', data: { elementId: id, qI: -v.load, qJ: -v.load } });
    if (v.point > 0) {
      const nodeId = a <= 0 ? 1 : a >= L ? xs.length : 2;
      loads.push({ type: 'nodal', data: { nodeId, fx: 0, fz: -v.point, my: 0 } });
    }
  }
  return {
    nodes, elements, supports, loads, portal, length: L, height: H,
    materials: new Map([[1, { id: 1, e: SECTION.e, nu: 0.3 }]]),
    sections: new Map([[1, { id: 1, a: SECTION.a, iz: SECTION.iz }]]),
  };
}

export function references(v: Values): Partial<Record<'moment' | 'deflection', { value: number; source: string }>> {
  if (v.system === 1) return {};
  const L = v.span, w = v.load, P = v.point, a = v.position * L, b = L - a;
  const kind = SUPPORTS[v.supports];
  if (P === 0 && w > 0) {
    if (kind === 'pinnedRoller') return { moment: { value: w * L * L / 8, source: 'wL²/8' }, deflection: { value: 5 * w * L ** 4 / (384 * EI), source: '5wL⁴/384EI' } };
    if (kind === 'fixedFixed') return { moment: { value: w * L * L / 12, source: 'wL²/12' }, deflection: { value: w * L ** 4 / (384 * EI), source: 'wL⁴/384EI' } };
    return { moment: { value: w * L * L / 8, source: 'wL²/8' } };
  }
  if (w === 0 && P > 0 && kind === 'pinnedRoller') return { moment: { value: P * a * b / L, source: 'Pab/L' } };
  return {};
}

type Diagram = { elementId: number; points: { t: number; x: number; y: number; value: number }[] };

function solveCertified(model: Model, engine: import('./define').EngineApi): { results: AnalysisResults; certificate: Certificate } {
  if (!engine.hasCertifyExport()) return { results: engine.solve(model), certificate: { status: 'unavailable', kind: 'linear', code: 'noExport' } };
  const out = engine.certifyLinear2D(model);
  return { results: out.results, certificate: linearCertificate(out.certificate, out.endToEnd) };
}

export const beamFrame = defineExample<Model>({
  id: 'beam-frame',
  dimension: '2d',
  params: [
    { key: 'system', value: 0, min: 0, max: 1, step: 1, unit: '', options: ['beam', 'portal'] },
    { key: 'supports', value: 0, min: 0, max: 2, step: 1, unit: '', options: SUPPORTS },
    { key: 'span', value: 6, min: 2, max: 12, step: 0.5, unit: 'm' },
    { key: 'height', value: 4, min: 2, max: 8, step: 0.5, unit: 'm' },
    { key: 'load', value: 10, min: 0, max: 50, step: 1, unit: 'kN/m' },
    { key: 'point', value: 0, min: 0, max: 100, step: 1, unit: 'kN' },
    { key: 'position', value: 0.5, min: 0, max: 1, step: 0.05, unit: '× L' },
  ],
  build,
  benchmark: { path: '/tools/simply-supported-beam', title: 'tools' },
  editor: (model) => ({ app: 'basic', model }),
  analyses(model, v, engine) {
    if (model.loads.length === 0) return { status: 'refused', code: 'noLoad' };
    const { results, certificate } = solveCertified(model, engine);
    const diagrams = engine.computeDiagrams2D(model, results) as { moment: Diagram[]; shear: Diagram[] };
    const L = model.length, H = model.portal ? model.height : 0;
    const size = Math.max(L, H);
    const disp = new Map(results.displacements.map(d => [d.nodeId, d]));
    const deformed: { base: [number, number]; at: [number, number] }[][] = [];
    for (const ef of results.elementForces) {
      const el = model.elements.get(ef.elementId)!;
      const ni = model.nodes.get(el.nodeI)!, nj = model.nodes.get(el.nodeJ)!;
      const di = disp.get(ni.id)!, dj = disp.get(nj.id)!;
      const pts = engine.computeDeformedShape({
        nodeIx: ni.x, nodeIy: ni.z, nodeJx: nj.x, nodeJy: nj.z, uIx: di.ux, uIy: di.uz, rIz: di.ry, uJx: dj.ux, uJy: dj.uz, rJz: dj.ry,
        scale: 1, length: ef.length, hingeStart: false, hingeEnd: false, ei: EI, loadQi: ef.qI, loadQj: ef.qJ,
        loadPoints: ef.pointLoads.map(p => [p.a, p.p]), distLoads: ef.distributedLoads.map(d => [d.qI, d.qJ, d.a, d.b]),
      }) as { x: number; y: number }[];
      deformed.push(pts.map((p, k) => {
        const t = k / (pts.length - 1);
        const base: [number, number] = [ni.x + t * (nj.x - ni.x), ni.z + t * (nj.z - ni.z)];
        return { base, at: [p.x - base[0], p.y - base[1]] };
      }));
    }
    const samples = deformed.flat();
    const drift = model.portal ? disp.get(2)!.ux : 0;
    const deflectionPeak = samples.reduce((m, s) => Math.max(m, model.portal ? Math.hypot(...s.at) : Math.abs(s.at[1])), 0);
    const station = (key: 'moment' | 'shear') => diagrams[key].flatMap(d => d.points.map(p => ({ elementId: d.elementId, ...p })));
    const momentPeak = station('moment').reduce((a, b) => Math.abs(b.value) > Math.abs(a.value) ? b : a);
    const shearPeak = station('shear').reduce((a, b) => Math.abs(b.value) > Math.abs(a.value) ? b : a);
    const refs = references(v);
    const readouts: Readout[] = [
      { key: 'maxMoment', value: Math.abs(momentPeak.value), unit: 'kN·m', reference: refs.moment },
      { key: 'maxShear', value: Math.abs(shearPeak.value), unit: 'kN' },
      { key: model.portal ? 'maxDisplacement' : 'maxDeflection', value: deflectionPeak * 1000, unit: 'mm', reference: refs.deflection && { value: refs.deflection.value * 1000, source: refs.deflection.source } },
    ];
    if (model.portal) readouts.push({ key: 'drift', value: Math.abs(drift) * 1000, unit: 'mm' });
    const h = size * 0.03;
    const views: Record<string, View> = {};
    for (const key of ['moment', 'shear', 'deflection'] as const) {
      const s = new Sketch();
      for (const el of model.elements.values()) {
        const ni = model.nodes.get(el.nodeI)!, nj = model.nodes.get(el.nodeJ)!;
        s.line(ni.x, ni.z, nj.x, nj.z);
      }
      for (const sup of model.supports.values()) {
        const n = model.nodes.get(sup.nodeId)!;
        s.support(n.x, n.z, sup.type === 'fixed' ? 'fixed' : sup.type === 'pinned' ? 'pinned' : 'roller', h);
      }
      for (const load of model.loads) {
        if (load.type === 'nodal') {
          const n = model.nodes.get(load.data.nodeId)!;
          if (load.data.fx) s.arrow(n.x - h * 5, n.z, h * 4, 0);
          else s.arrow(n.x, n.z + h * 5, 0, -h * 4);
        } else if (load.type === 'distributed') {
          const el = model.elements.get(load.data.elementId)!;
          const ni = model.nodes.get(el.nodeI)!, nj = model.nodes.get(el.nodeJ)!;
          for (let k = 0; k <= 4; k++) { const x = ni.x + (nj.x - ni.x) * k / 4; s.arrow(x, ni.z + h * 3.5, 0, -h * 3); }
        }
      }
      s.category = 1;
      if (key === 'deflection') {
        const scale = size * 0.08 / Math.max(...samples.map(p => Math.hypot(...p.at)), 1e-12);
        for (const member of deformed) s.polyline(member.map(p => [p.base[0] + p.at[0] * scale, p.base[1] + p.at[1] * scale]));
      } else {
        const scale = size * 0.15 / Math.max(...station(key).map(p => Math.abs(p.value)), 1e-12);
        for (const d of diagrams[key]) {
          const el = model.elements.get(d.elementId)!;
          const ni = model.nodes.get(el.nodeI)!, nj = model.nodes.get(el.nodeJ)!;
          const len = Math.hypot(nj.x - ni.x, nj.z - ni.z);
          const nx = -(nj.z - ni.z) / len, nz = (nj.x - ni.x) / len;
          const pts = d.points.map(p => [ni.x + p.t * (nj.x - ni.x) + nx * p.value * scale, ni.z + p.t * (nj.z - ni.z) + nz * p.value * scale] as [number, number]);
          s.polyline([[ni.x, ni.z], ...pts, [nj.x, nj.z]]);
        }
      }
      views[key] = s.view(key, key === 'moment' ? 'kN·m' : key === 'shear' ? 'kN' : 'mm', boundsOf(s.xy, 0.08));
    }
    const charts: Chart[] = [];
    if (!model.portal) {
      const along = (key: 'moment' | 'shear') => diagrams[key].flatMap(d => {
        const el = model.elements.get(d.elementId)!;
        const x0 = model.nodes.get(el.nodeI)!.x, x1 = model.nodes.get(el.nodeJ)!.x;
        return d.points.map(p => [x0 + p.t * (x1 - x0), key === 'moment' ? -p.value : p.value] as [number, number]);
      });
      const deflection = samples.map(p => [p.base[0], p.at[1] * 1000] as [number, number]);
      for (const [key, points, unit] of [['moment', along('moment'), 'kN·m'], ['shear', along('shear'), 'kN'], ['deflection', deflection, 'mm']] as const) {
        charts.push({ key, xUnit: 'm', yUnit: unit, points: [...points], marker: peak([...points])[0] });
      }
    }
    return { status: 'ok', readouts, certificate, views, charts, notes: [] };
  },
});
