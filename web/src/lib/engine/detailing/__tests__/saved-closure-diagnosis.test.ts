import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { buildClosedStirrup, StirrupClosureCache, type StirrupSetInput } from '../../../codes/cirsoc201/transverse-cage';
import type { BarPath } from '../../../codes/cirsoc201/bar-geometry';
import { minSurfaceClearance } from '../collision';

class FixedClosure extends StirrupClosureCache {
  constructor(private readonly choice: number) { super(); }
  override select(): number { return this.choice; }
}

// Read-only diagnosis of a saved audit: compare all four fabricated closures at an
// actual failing section. Final acceptance still requires the full production path.
it.runIf(!!process.env.STABILEO_CLOSURE_AUDIT)('measures closure alternatives on retained geometry', () => {
  const saved = JSON.parse(readFileSync(process.env.STABILEO_CLOSURE_AUDIT!, 'utf8'));
  const bars: BarPath[] = saved.assemblies.flatMap((a: { bars: BarPath[] }) => a.bars);
  const rows = [225, 328].map(id => {
    const tie = bars.find(b => b.id.startsWith(`e${id}:minimum:1:stirrup:`))!;
    expect(tie).toBeDefined();
    const points = tie.segments.flatMap(s => [s.start, s.end]);
    const low = Math.min(...points.map(p => p.z)), high = Math.max(...points.map(p => p.z));
    const y0 = (Math.min(...points.map(p => p.y)) + Math.max(...points.map(p => p.y))) / 2;
    const z0 = (low + high) / 2, x0 = tie.segments[2].start.x;
    const member = saved.members.find((m: { id: number }) => m.id === id);
    const material = member.material;
    const own = bars.filter(b => b.role === 'longitudinal' && b.ownerElementIds.includes(id));
    const refs = own.flatMap(b => b.segments.filter(s => s.kind === 'straight'
      && Math.abs(s.end.y - s.start.y) < 1e-9 && Math.abs(s.end.z - s.start.z) < 1e-9
      && Math.min(s.start.x, s.end.x) <= x0 && Math.max(s.start.x, s.end.x) >= x0)
      .map(s => ({ id: b.id, across: s.start.y - y0, up: s.start.z - z0, diameterMm: b.diameterMm })));
    const input: StirrupSetInput = { elementId: id, zoneId: 'diagnostic', station: 0,
      b: member.section.b, h: high - low + 2 * material.cover + tie.diameterMm / 1000,
      cover: material.cover, stirrupDiaMm: tie.diameterMm, legs: 2, maxAggregateSizeMm: 19,
      origin: { x: x0, y: y0, z: z0 }, axis: { x: 1, y: 0, z: 0 },
      across: { x: 0, y: 1, z: 0 }, up: { x: 0, y: 0, z: 1 }, hookOrientation: 'a', longitudinalBars: refs };
    const measure = (t: BarPath) => Math.min(...own.map(b => minSurfaceClearance(t, b).clearance)) * 1000;
    return { id, barsAtSection: refs.length, currentMm: measure(tie),
      alternativesMm: [0, 1, 2, 3].map(choice => measure(buildClosedStirrup({ ...input,
        closureCache: new FixedClosure(choice) }).path)),
      selectedMm: measure(buildClosedStirrup(input).path) };
  });
  console.log(JSON.stringify(rows));
});
