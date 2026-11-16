import type { SolverInput } from '../../../lib/engine/types';
import type { View } from '../../examples/define';
import type { BatchId } from '../batch';
import type { BatchResult } from '../batch-solve';
import { chartFigure, type Figure } from './figure';
import { curvesView, deformedView, structureView, type MemberCurve } from './structure';

type Translate = (key: string) => string;

function alongX(model: SolverInput, series: { name: string; points: [number, number][] }[]): [number, number][] {
  return series
    .flatMap(s => {
      const el = model.elements.get(Number(s.name))!;
      const x0 = model.nodes.get(el.nodeI)!.x;
      return s.points.map(([d, v]) => [x0 + d, v] as [number, number]);
    })
    .sort((a, b) => a[0] - b[0]);
}

function verticalDeflection(r: BatchResult): [number, number][] {
  return r.shapes
    .flatMap(shape => {
      const el = r.model.elements.get(shape.elementId)!;
      const a = r.model.nodes.get(el.nodeI)!, b = r.model.nodes.get(el.nodeJ)!;
      return shape.points.map(([, z], j) => {
        const t = j / Math.max(1, shape.points.length - 1);
        return [a.x + (b.x - a.x) * t, z - (a.z + (b.z - a.z) * t)] as [number, number];
      });
    })
    .sort((a, b) => a[0] - b[0]);
}

function onMembers(key: string, title: string, unit: string, view: View): Figure {
  return { key, title, unit, sketch: view, peak: view.peak && { value: Math.abs(view.peak.value), unit, label: 'max' } };
}

function axialView(r: BatchResult): View {
  const base = structureView(r.model, 'axial');
  const forces = new Map(r.linear.elementForces.map(ef => [ef.elementId, ef.nStart]));
  const xy: number[] = [], cells: number[] = [], values: number[] = [];
  let peak = { value: 0, at: [0, 0] as [number, number] };
  for (const el of r.model.elements.values()) {
    const a = r.model.nodes.get(el.nodeI)!, b = r.model.nodes.get(el.nodeJ)!;
    const n = xy.length / 2;
    xy.push(a.x, a.z, b.x, b.z);
    cells.push(n, n + 1);
    const force = forces.get(el.id) ?? 0;
    values.push(force);
    if (Math.abs(force) > Math.abs(peak.value)) peak = { value: force, at: [(a.x + b.x) / 2, (a.z + b.z) / 2] };
  }
  const largest = Math.max(1e-9, ...values.map(Math.abs));
  return { ...base, xy, cells, values, perCell: true, geometryOnly: false, range: { min: -largest, max: largest }, unit: 'kN', lineWidth: 4, peak };
}

export function batchFigures(id: BatchId, r: BatchResult, t: Translate, influenceUnit: string): Figure[] {
  const structure: Figure = { key: 'structure', title: t(id === 'influence-line' ? 'tools.fig.governing' : 'tools.fig.structure'), unit: '', sketch: structureView(r.model) };
  if (id === 'beam-natural-frequency') {
    return [structure, ...r.modes.map((mode, j): Figure => {
      const points = mode.displacements.map(d => [r.model.nodes.get(d.nodeId)!.x, d.uz] as [number, number]).sort((a, b) => a[0] - b[0]);
      const largest = Math.max(1e-20, ...points.map(p => Math.abs(p[1])));
      const title = t('tools.fig.mode').replace('{n}', String(j + 1));
      return { key: `mode${j + 1}`, title, unit: '', peak: { value: mode.frequency, unit: 'Hz', label: 'f' }, chart: { series: [{ name: title, color: 'var(--lp-accent)', points: points.map(([x, v]) => [x, v / largest]) }], xLabel: 'x (m)', yLabel: title } };
    })];
  }
  if (id === 'portal-frame' || id === 'truss-2d') {
    const curves = (key: 'moment' | 'shear'): MemberCurve[] => r.charts[key].map(s => ({ elementId: Number(s.name), points: s.points }));
    const deformed = onMembers('deflection', t('tools.fig.deformed'), 'm', deformedView(r.model, r.shapes, 'deflection', 'm'));
    const axial = onMembers('axial', t('tools.fig.axial'), 'kN', axialView(r));
    if (id === 'truss-2d') return [structure, axial, deformed];
    return [
      structure,
      deformed,
      onMembers('moment', t('tools.fig.moment'), 'kN·m', curvesView(r.model, curves('moment'), 'moment', 'kN·m')),
      onMembers('shear', t('tools.fig.shear'), 'kN', curvesView(r.model, curves('shear'), 'shear', 'kN')),
      axial,
    ];
  }
  const figures: Figure[] = [structure];
  if (id === 'influence-line') figures.push(chartFigure('influence', t('tools.fig.influence'), influenceUnit, r.influence));
  figures.push(
    chartFigure('deflection', t('tools.fig.deflection'), 'm', verticalDeflection(r)),
    chartFigure('shear', t('tools.fig.shear'), 'kN', alongX(r.model, r.charts.shear)),
    chartFigure('moment', t('tools.fig.moment'), 'kN·m', alongX(r.model, r.charts.moment)),
  );
  return figures;
}
