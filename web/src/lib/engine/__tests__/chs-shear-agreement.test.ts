/**
 * The drawn shear diagram and the engine's design number must agree on a tube.
 *
 * They did not. `computeQandB`'s TypeScript closed form was corrected to pair a
 * two-sided first moment with the two-sided width a horizontal cut through a
 * circular tube actually severs; `engine/src/postprocess/section_stress.rs` kept
 * the one-sided pairing and so reported half. Nothing compared them, because
 * `crossCheckShearPeak` measures the drawn peak against the FEM mesh solve and
 * never against this path.
 *
 * A thin tube peaks at 2V/A — the standard shear-shape factor beside the solid
 * rectangle's 3/2 and the solid circle's 4/3. Pinning the AGREEMENT rather than
 * only the value is what keeps the two implementations from drifting again: a
 * fix applied to one language and not the other is exactly what happened here.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { computeSectionProperties } from '../../data/section-shapes';
import {
  resolveSectionGeometryLegacy, shearStress, computeShearFlowPaths, analyzeSectionStress,
} from '../section-stress';
import { initSolver } from '../wasm-solver';

beforeAll(async () => { await initSolver(); }, 120_000);

const peak = (paths: Array<{ points: Array<{ tau: number }> }>) =>
  Math.max(...paths.flatMap((p) => p.points.map((q) => Math.abs(q.tau))));

/** CHS 300 x 8, a catalogue-shaped tube: geometry-backed and analysable. */
function tube() {
  const built = computeSectionProperties('hollow-circular', { d: 0.3, t: 0.008 } as never);
  return { id: 1, name: 'CHS 300x8', ...(built as object) } as never;
}

describe('a circular tube peaks at twice the mean shear, in every path', () => {
  const V = 100;

  it('the engine agrees with the drawn diagram, not half of it', () => {
    const sec = tube();
    const rs = resolveSectionGeometryLegacy(sec);
    const mean = V / rs.a / 1000;

    const ef = {
      elementId: 1, length: 4,
      nStart: 0, nEnd: 0, vStart: V, vEnd: V, mStart: 0, mEnd: 0,
      qI: 0, qJ: 0, pointLoads: [], distributedLoads: [],
    } as never;

    const res = analyzeSectionStress(ef, sec, 275, 0, 0) as { distribution?: Array<{ tau: number }> };
    const enginePeak = Math.max(...(res.distribution ?? []).map((p) => Math.abs(p.tau)));
    const drawnPeak = peak(computeShearFlowPaths(V, rs));

    // Same physical quantity, so they have to land on the same number. The bug
    // put a factor of two between them.
    expect(enginePeak / drawnPeak).toBeCloseTo(1, 1);
    expect(enginePeak / mean).toBeGreaterThan(1.95);
  });

  it('lands on the thin-tube factor of 2, not the 1 the one-sided pairing gave', () => {
    const sec = tube();
    const rs = resolveSectionGeometryLegacy(sec);
    const mean = V / rs.a / 1000;
    // t/R here is ~5.5%, so a real wall sits a few per cent above the thin-wall
    // ideal. The band is one-sided about 2 for that reason, and it excludes 1.
    for (const [label, value] of [
      ['TS design', shearStress(V, 0, rs)],
      ['TS drawn', peak(computeShearFlowPaths(V, rs))],
    ] as const) {
      const ratio = value / mean;
      expect(ratio, `${label} = ${ratio.toFixed(4)}x`).toBeGreaterThan(1.95);
      expect(ratio, `${label} = ${ratio.toFixed(4)}x`).toBeLessThan(2.25);
    }
  });
});
