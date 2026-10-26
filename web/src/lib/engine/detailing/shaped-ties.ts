/**
 * The bars and ties of a column that is not a rectangle, placed in plan.
 *
 * The longitudinal bars sit where `shapedBarPositions` puts them, turned from the section's axes
 * (x along the column's local y, y along its local z) into plan. The ties are closed hoops on the
 * outline inset by cover and half the tie, one per station, lapped 150 mm where they close
 * (§25.7.2.4, a circular hoop closes with a lap); a spiral is one continuous helix per lift at its
 * pitch, with a turn and a half more at each end (§25.7.3.4).
 */
import type { BarPath } from '../../codes/cirsoc201/bar-geometry';
import { straightSegment } from '../../codes/cirsoc201/bar-geometry';
import { shapedBarPositions, outlineOf, type ColumnShape } from '../design/shaped-column';
import { outlineRings } from '../codes/argentina/cirsoc201-section';
import { isCounterClockwise, type Pt } from '../codes/argentina/section-polygon';

export interface PlanFrame { ey: readonly number[]; ez: readonly number[] }

const toPlan = (p: Pt, f: PlanFrame) => ({ x: p.x * f.ey[0]! + p.y * f.ez[0]!, y: p.x * f.ey[1]! + p.y * f.ez[1]! });

export function shapedPlanBars(shape: ColumnShape, count: number, diaMm: number, cover: number, tieDiaMm: number, f: PlanFrame): Array<{ x: number; y: number }> {
  return shapedBarPositions(shape, count, diaMm, cover, tieDiaMm).map((p) => toPlan(p, f));
}

/** The tie's centreline around the section, in section coordinates. */
export function tieRing(shape: ColumnShape, cover: number, tieDiaMm: number): Pt[] {
  const e = cover + tieDiaMm / 2000;
  if (shape.kind === 'circle') {
    const R = shape.D / 2 - e;
    return Array.from({ length: 32 }, (_, i) => ({ x: R * Math.cos((2 * Math.PI * i) / 32), y: R * Math.sin((2 * Math.PI * i) / 32) }));
  }
  const outer = outlineRings(outlineOf(shape)).outer;
  const ccw = isCounterClockwise(outer), n = outer.length;
  const nrm = (a: Pt, b: Pt) => { const dx = b.x - a.x, dy = b.y - a.y, l = Math.hypot(dx, dy) || 1; return ccw ? { x: -dy / l, y: dx / l } : { x: dy / l, y: -dx / l }; };
  return outer.map((p, i) => { const n1 = nrm(outer[(i - 1 + n) % n]!, p), n2 = nrm(p, outer[(i + 1) % n]!); return { x: p.x + e * (n1.x + n2.x), y: p.y + e * (n1.y + n2.y) }; });
}

const LAP = 0.15;

function path(id: string, diaMm: number, pts: Array<{ x: number; y: number; z: number }>, owner: number): BarPath {
  const segments = pts.slice(1).map((p, i) => straightSegment(pts[i]!, p));
  return {
    id, diameterMm: diaMm, role: 'transverse', segments,
    startTreatment: { kind: 'straight' }, endTreatment: { kind: 'straight' },
    cuttingLength: segments.reduce((s, g) => s + g.length, 0),
    ownerElementIds: [owner],
  } as BarPath;
}

/** Closed hoops at each station z, lapped where they close. */
export function shapedHoops(input: {
  shape: ColumnShape; cover: number; tieDiaMm: number; frame: PlanFrame;
  centre: { x: number; y: number }; zs: readonly number[]; elementId: number; idPrefix: string;
}): BarPath[] {
  const ring = tieRing(input.shape, input.cover, input.tieDiaMm).map((p) => toPlan(p, input.frame));
  return input.zs.map((z, k) => {
    const pts = [...ring, ring[0]!].map((p) => ({ x: input.centre.x + p.x, y: input.centre.y + p.y, z }));
    // The lap: run on along the first side by 150 mm.
    const a = pts[0]!, b = pts[1]!, l = Math.hypot(b.x - a.x, b.y - a.y) || 1, t = Math.min(LAP, l) / l;
    pts.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z });
    return path(`${input.idPrefix}-hoop${k}`, input.tieDiaMm, pts, input.elementId);
  });
}

/** A spiral over a lift: a helix at its pitch, a turn and a half more at each end. */
export function shapedSpiral(input: {
  D: number; cover: number; diaMm: number; pitch: number; frame: PlanFrame;
  centre: { x: number; y: number }; from: number; to: number; elementId: number; id: string;
}): BarPath {
  const R = input.D / 2 - input.cover - input.diaMm / 2000;
  const extra = 1.5 * input.pitch;
  const z0 = input.from - extra, z1 = input.to + extra;
  const turns = (z1 - z0) / input.pitch, steps = Math.max(8, Math.ceil(turns * 24));
  const pts = Array.from({ length: steps + 1 }, (_, i) => {
    const a = (2 * Math.PI * turns * i) / steps;
    const p = toPlan({ x: R * Math.cos(a), y: R * Math.sin(a) }, input.frame);
    return { x: input.centre.x + p.x, y: input.centre.y + p.y, z: z0 + ((z1 - z0) * i) / steps };
  });
  return path(input.id, input.diaMm, pts, input.elementId);
}
