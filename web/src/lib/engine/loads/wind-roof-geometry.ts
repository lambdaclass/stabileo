import { WindPressureRefusal } from './wind-pressure-field';
import { roofMembers, type WindModel, type RoofMember } from './wind-cases';
import { roofSurfaceModel, snowSegmentCuts, containsSnowPanel, SnowRoofPlaneRefusal } from './snow-roof-surfaces';

export function windRoofCarriers(model: WindModel, only?: ReadonlySet<number>) {
  const surfaces = roofSurfaceModel(model, only);
  const geometry = surfaces.geometry;
  const members = roofMembers(model, only).map((m): RoofMember => {
    const planes = (() => { try { return surfaces.memberPlanes(m.id); } catch (error) { if (error instanceof SnowRoofPlaneRefusal) throw new WindPressureRefusal('wind.pressure.roofUnresolved'); throw error; } })();
    const length = Math.hypot(m.lh, m.dz);
    const cuts = snowSegmentCuts([m.a.x, m.a.y], [m.b.x, m.b.y], planes.map(p => p.polygon));
    const facets: NonNullable<RoofMember['facets']> = [];
    for (let k = 1; k < cuts.length; k++) {
      const a = cuts[k - 1]!, b = cuts[k]!, mid = (a + b) / 2;
      const point: [number, number] = [m.a.x + mid * m.dx, m.a.y + mid * m.dy];
      const on = planes.filter(p => p.kind === 'section' || containsSnowPanel(point, p.polygon));
      if (!on.length) {
        facets.push({ a: a * length, b: b * length, gradient: [m.dz * m.dx / m.lh ** 2, m.dz * m.dy / m.lh ** 2], share: 1 });
      } else for (const p of on) facets.push({ a: a * length, b: b * length, gradient: p.gradient, share: 1 / on.length });
    }
    return { ...m, facets };
  });
  const points = members.flatMap(m => [m.a, m.b]);
  const meanHeight = points.length ? (Math.min(...points.map(p => p.z ?? 0)) + Math.max(...points.map(p => p.z ?? 0))) / 2 : 0;
  return { members, geometry, meanHeight };
}

export function windRoofGeometry(model: WindModel, only?: ReadonlySet<number>): { axis: 'x' | 'y'; ridge: number; slopeDeg: number } | null {
  const { geometry, members } = windRoofCarriers(model, only);
  return members.length && geometry ? { ...geometry, ridge: geometry.origin[geometry.axis] + geometry.ridge * geometry.direction[geometry.axis === 'x' ? 0 : 1] } : null;
}
