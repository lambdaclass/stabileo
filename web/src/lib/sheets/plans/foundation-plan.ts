/**
 * The foundation plan with its setting out: every footing drawn in plan with the column it
 * carries, named, and tied to the nearest axis in each direction by a dimension to its centre,
 * plus the footing table (size, depth, founding level and the mats). The detail of each footing
 * (plan, sections and bars) is the detailing drawing already in the set.
 */
import type { DrawingInput } from '../compose';
import type { P, Primitive } from '../primitives';
import { boxOf, drawAxes, rectAt, type PlanAxis } from './plan-common';
import { columnOutline, type PlanColumn } from './formwork-plan';
import { drawTable } from './table';
import type { Tr } from './details';

export interface Mat { diameter: number; spacing: number }
export interface PlanFooting {
  name: string; at: { x: number; y: number }; B: number; L: number; thickness: number; rotDeg: number;
  /** Offset of the footing's centre from the column, m. */
  ecc: { x: number; y: number };
  founding: number;
  column?: PlanColumn;
  mats?: { bottomX?: Mat; bottomY?: Mat; topX?: Mat; topY?: Mat };
  kind: string;
}

const k = 1000, cm = (v: number) => String(Math.round(v * 100));
const mat = (m?: Mat) => (m ? `Ø${m.diameter} c/${cm(m.spacing)}` : '—');

export function foundationPlan(fs: readonly PlanFooting[], axes: readonly PlanAxis[], scale: number, tr: Tr, fmt: (v: number) => string): DrawingInput[] {
  if (fs.length === 0) return [];
  const out: Primitive[] = [], s = scale;
  const pts: P[] = [];
  for (const f of fs) {
    const c = { x: (f.at.x + f.ecc.x) * k, y: (f.at.y + f.ecc.y) * k };
    const o = rectAt(c, f.B * k, f.L * k, f.rotDeg);
    pts.push(...o);
    out.push({ kind: 'polyline', layer: 'FW-OUTLINE', closed: true, points: o });
    if (f.column) out.push(columnOutline(f.column));
    out.push({ kind: 'text', layer: 'FW-TAG', at: { x: c.x, y: c.y - (f.L * k) / 2 - 4 * s }, text: `${f.name} ${cm(f.B)}×${cm(f.L)}×${cm(f.thickness)}`, height: 2.5, align: 'center' });
    // Setting out: from the nearest axis each way to the footing's centre.
    for (const dir of ['x', 'y'] as const) {
      const cands = axes.filter((a) => a.axis === dir);
      if (cands.length === 0) continue;
      const v = dir === 'x' ? c.x : c.y;
      const near = cands.reduce((m, a) => (Math.abs(a.at * k - v) < Math.abs(m.at * k - v) ? a : m));
      const d = v - near.at * k;
      if (Math.abs(d) < 1) continue;
      const a = dir === 'x' ? { x: near.at * k, y: c.y } : { x: c.x, y: near.at * k };
      out.push({ kind: 'dimension', layer: 'RC-DIM', a, b: { x: c.x, y: c.y }, offset: dir === 'x' ? 4 : -4 });
    }
  }
  const box = boxOf(pts);
  out.push(...drawAxes(axes, box, s));
  const all = boxOf([...pts, { x: box.x0 - 20 * s, y: box.y0 - 20 * s }, { x: box.x1 + 20 * s, y: box.y1 + 20 * s }]);
  const plan: DrawingInput = { key: 'foundation-plan', title: tr('plan.found.title'), primitives: out, width: all.x1 - all.x0, height: all.y1 - all.y0, origin: { x: all.x0, y: all.y0 }, scale: s };
  const t = drawTable({
    columns: [
      { label: tr('plan.found.name'), width: 18 }, { label: tr('plan.found.size'), width: 34, align: 'center' },
      { label: tr('plan.found.level'), width: 22, align: 'right' }, { label: tr('plan.found.bottomX'), width: 26, align: 'center' },
      { label: tr('plan.found.bottomY'), width: 26, align: 'center' }, { label: tr('plan.found.topX'), width: 26, align: 'center' },
      { label: tr('plan.found.topY'), width: 26, align: 'center' },
    ],
    rows: fs.map((f) => [f.name, `${cm(f.B)}×${cm(f.L)}×${cm(f.thickness)}`, fmt(f.founding), mat(f.mats?.bottomX), mat(f.mats?.bottomY), mat(f.mats?.topX), mat(f.mats?.topY)]),
  });
  return [plan, { key: 'foundation-table', title: tr('plan.found.table'), primitives: t.primitives, width: t.width, height: t.height, origin: { x: 0, y: 0 }, paper: true }];
}
