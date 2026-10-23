import { describe, expect, it } from 'vitest';
import { buildColumnLongOptions } from '../candidate-enumerate-column';
import { syntheticBeamContext } from './helpers';
import { generateColumnStack, columnBarPositions } from '../../detailing/generate-column';
import { minSurfaceClearance } from '../../detailing/collision';
import { inwardContactCrank, repeatedCageLapClearance } from '../../detailing/column-lap-geometry';
import { minClearSpacingColumn } from '../../../codes/cirsoc201/spacing';

function physicalClearance(count: number, diameterMm: number) {
  const bars = generateColumnStack({
    stackId: 'lap-seed', edition: '2025', fc: 30, fy: 420, maxAggregateSizeMm: 19,
    roofTermination: false, lapSplice: () => 0.8, beamDepthAtTop: new Map(),
    lifts: [0, 1].map(i => ({ elementId: i + 1, baseZ: 3.4 * i, topZ: 3.4 * (i + 1),
      centre: { x: 0, y: 0 }, b: 0.5, h: 0.5, cover: 0.025, tieDia: 8,
      bars: { count, diameterMm } })),
  }).bars.filter(b => b.ownerElementIds.includes(1));
  let clear = Infinity;
  for (let i = 0; i < bars.length; i++) for (let j = i + 1; j < bars.length; j++) {
    clear = Math.min(clear, minSurfaceClearance(bars[i], bars[j]).clearance);
  }
  return clear;
}

describe('column seeds leave room for their lap cranks', () => {
  it('detects congestion on the generated paths and prefers an arrangement that clears it', () => {
    const context = syntheticBeamContext({ elementType: 'column', section: { id: 1, name: '500', b: 0.5, h: 0.5 } });
    const options = buildColumnLongOptions(context);
    const crowded = options.find(o => o.totalCount === 28 && o.dia === 16)!;
    const roomy = options.find(o => o.totalCount === 12 && o.dia === 25)!;
    expect(crowded).toBeDefined();
    expect(roomy).toBeDefined();
    expect(options.indexOf(roomy)).toBeLessThan(options.indexOf(crowded));
    // Preference is not refusal: the congested option remains available to the verifier.
    expect(crowded.lapTight).toBe(true);
    expect(roomy.lapTight).toBe(false);
    for (const [count, dia, fits] of [[28, 16, false], [12, 25, true]] as const) {
      const measured = physicalClearance(count, dia);
      const required = minClearSpacingColumn('2025', { barDiameterMm: dia, maxAggregateSizeMm: 19 }).minClear;
      expect(measured >= required - 1e-9).toBe(fits);
      const estimate = repeatedCageLapClearance(columnBarPositions(0.5, 0.5, 0.025, 8, dia, count), dia);
      // Inclined crank segments can approach slightly closer than their endpoints.
      expect(estimate >= required - 1e-9).toBe(fits);
      expect(Math.abs(estimate - measured)).toBeLessThan(0.0001);
    }
  });

  it('preserves contact with a different upper bar diameter and leaves separated bars alone', () => {
    const lower = { x: 0.18, y: 0.18 }, upper = { x: 0.177, y: 0.177 };
    const crank = inwardContactCrank(lower, upper, 16, 20)!;
    expect(Math.hypot(lower.x + crank.dx - upper.x, lower.y + crank.dy - upper.y)).toBeCloseTo(0.018, 10);
    expect(inwardContactCrank(lower, { x: 0.1, y: 0.1 }, 16, 20)).toBeNull();
    expect(inwardContactCrank({ x: 0, y: 0 }, { x: 0, y: 0 }, 16, 16)).toBeNull();
  });
});
