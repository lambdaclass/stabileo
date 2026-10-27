import { CLEARANCE_CHORD_TOLERANCE, samplePath, type BarPath, type Point3 } from '../../codes/cirsoc201/bar-geometry';

/** Reserve the first beam stirrup against the actual column steel, including offset cages.
 * `axis` is a unit vector from the beam end into the span. The returned distance is added
 * to the existing support face; it does not change the face used to verify anchorage.
 */
export function columnStirrupClearanceInset(input: {
  bars: readonly Pick<BarPath, 'role' | 'diameterMm' | 'segments'>[];
  origin: Point3; axis: Point3; beamHeight: number;
  supportFace: number; clear: number; stirrupDiaMm: number;
}): number {
  let inset = 0;
  const projection = (p: Point3) => (p.x - input.origin.x) * input.axis.x
    + (p.y - input.origin.y) * input.axis.y + (p.z - input.origin.z) * input.axis.z;
  for (const bar of input.bars) {
    if (bar.role !== 'longitudinal') continue;
    const radius = bar.diameterMm / 2000;
    for (const segment of bar.segments) {
      // Expand curved bounds by their sampling error, rather than spending the clearance.
      const error = segment.kind === 'arc' ? CLEARANCE_CHORD_TOLERANCE : 0;
      const lo = input.origin.z - input.beamHeight / 2 - radius - error;
      const hi = input.origin.z + input.beamHeight / 2 + radius + error;
      const points = samplePath({ segments: [segment] }, CLEARANCE_CHORD_TOLERANCE);
      for (let i = 1; i < points.length; i++) {
        const a = points[i - 1], b = points[i];
        const dz = b.z - a.z;
        let from = 0, to = 1;
        if (Math.abs(dz) < 1e-12) {
          if (a.z < lo || a.z > hi) continue;
        } else {
          const t0 = (lo - a.z) / dz, t1 = (hi - a.z) / dz;
          from = Math.max(0, Math.min(t0, t1)); to = Math.min(1, Math.max(t0, t1));
          if (from > to) continue;
        }
        const pa = projection(a), dp = projection(b) - pa;
        const reach = Math.max(pa + from * dp, pa + to * dp) + radius + error;
        // The closing tail stands half a tie diameter off its plane; its surface adds
        // the other half. Keep the full column clear distance outside that surface.
        inset = Math.max(inset, reach + input.clear + input.stirrupDiaMm / 1000 - input.supportFace);
      }
    }
  }
  return inset;
}
