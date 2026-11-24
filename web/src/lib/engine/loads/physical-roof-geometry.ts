type P2 = [number, number];
type Point = { x: number; y: number; z?: number };
const Z = (p: Point) => p.z ?? 0;
export const samePhysicalPoint = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y, Z(a) - Z(b)) <= 1e-8;

export function snowCoordinate(pt: P2, origin: P2, direction: P2, boundaries: number[] = []): number {
  const value = (pt[0] - origin[0]) * direction[0] + (pt[1] - origin[1]) * direction[1];
  const error = 16 * Number.EPSILON * ((Math.abs(pt[0]) + Math.abs(origin[0])) * Math.abs(direction[0]) + (Math.abs(pt[1]) + Math.abs(origin[1])) * Math.abs(direction[1]));
  return boundaries.find(b => Math.abs(value - b) <= error) ?? value;
}


type SnowMember = { a: Point; b: Point; dx: number; dy: number; lh: number };

export function collinearSnowMembers<M extends SnowMember>(members: M[], m: M, gradient: P2): M[] {
  return members.filter(r => [r.a, r.b].every(p => {
    const x = p.x - m.a.x, y = p.y - m.a.y;
    return Math.abs(m.dx * y - m.dy * x) <= 1e-8 * m.lh
      && Math.abs(Z(p) - Z(m.a) - gradient[0] * x - gradient[1] * y) <= 1e-8;
  }));
}

export function connectedSnowMembers<M extends { a: Point; b: Point }>(m: M, supported: M[], samePoint = samePhysicalPoint): M[] {
  const connected = new Set([m]);
  for (const r of connected) for (const q of supported) {
    if ([r.a, r.b].some(a => [q.a, q.b].some(b => samePoint(a, b)))) connected.add(q);
  }
  return [...connected];
}


export function physicalRoofRuns<M extends SnowMember & { id: number; dz: number }>(members: M[], samePoint = samePhysicalPoint) {
  const remaining = new Set(members);
  const runs: Array<{ direction: P2; length: number; a: Point; b: Point; members: Set<number> }> = [];
  for (const m of members) {
    if (!remaining.has(m) || m.lh === 0) continue;
    const gradient: P2 = [m.dz * m.dx / m.lh ** 2, m.dz * m.dy / m.lh ** 2];
    const group = connectedSnowMembers(m, collinearSnowMembers(members, m, gradient), samePoint);
    for (const member of group) remaining.delete(member);
    const direction: P2 = [m.dx / m.lh, m.dy / m.lh];
    const coordinate = (p: Point) => snowCoordinate([p.x, p.y], [m.a.x, m.a.y], direction);
    const points = group.flatMap(r => [r.a, r.b]);
    const a = points.reduce((a, b) => coordinate(a) <= coordinate(b) ? a : b);
    const b = points.reduce((a, b) => coordinate(a) >= coordinate(b) ? a : b);
    runs.push({ direction, length: coordinate(b) - coordinate(a), a, b, members: new Set(group.map(r => r.id)) });
  }
  return runs;
}
