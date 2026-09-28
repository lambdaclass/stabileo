/** Positive-area overlap of coplanar triangles. Shared edges and vertices are not overlap. */
export type Point2 = readonly [number, number];
export type Triangle2 = readonly [Point2, Point2, Point2];

export function trianglesOverlap(a: Triangle2, b: Triangle2): boolean {
  const area2 = (t: Triangle2) => (t[1][0] - t[0][0]) * (t[2][1] - t[0][1])
    - (t[1][1] - t[0][1]) * (t[2][0] - t[0][0]);
  if (Math.abs(area2(a)) < 1e-12 || Math.abs(area2(b)) < 1e-12) return false;
  // Separating-axis test: the edge normals of both convex triangles suffice.
  for (const triangle of [a, b]) {
    for (let i = 0; i < 3; i++) {
      const p = triangle[i]!, q = triangle[(i + 1) % 3]!;
      const nx = q[1] - p[1], ny = p[0] - q[0];
      const project = (v: Point2) => (v[0] - p[0]) * nx + (v[1] - p[1]) * ny;
      const pa = a.map(project), pb = b.map(project);
      const overlap = Math.min(Math.max(...pa), Math.max(...pb)) - Math.max(Math.min(...pa), Math.min(...pb));
      if (overlap <= 1e-9 * Math.hypot(nx, ny)) return false;
    }
  }
  return true;
}
