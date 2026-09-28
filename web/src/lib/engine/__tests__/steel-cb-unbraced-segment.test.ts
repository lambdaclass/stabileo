/**
 * `Cb` must be read over the UNBRACED SEGMENT, not over the element — CIRSOC 301 F.1.1.
 *
 * ── What this guards ───────────────────────────────────────────────
 *
 * PR #214 made `Lb` the CHAIN length for a member split into collinear elements at nodes where
 * nothing else arrives (`engine/steel/unbraced-length.ts`), but left `Cb` computed from the
 * element-local moment diagram. F.1.1 is written about «el segmento no arriostrado»: Mmáx, MA,
 * MB and MC are the max and the quarter points OF THAT SEGMENT. On a chained member the two reads
 * differ, and the element-local read is the unconservative one wherever the gradient is steep —
 * an end element of a beam with a midspan point load reads Cb = 1,667 (its half of the triangle
 * falls linearly to zero) where the segment read is 1,316.
 *
 * The segment diagram is stitched from the sibling elements' station diagrams, which the
 * verification already computes for every element: each element's envelope is placed along the
 * chain at its geometric offset, reversed elements are read back-to-front AND negated (their
 * local y points the other way, so the same physical moment carries the opposite sign). A
 * declared `Lb` shorter than the chain bounds the read to a window of that length centred on the
 * element that declared it — the app does not know where the braces are, and that is the read the
 * data supports.
 */

import { describe, it, expect } from 'vitest';
import { runSteelVerification, steelSegmentDiagram } from '../verification-service';
import { memberLengths } from '../steel/unbraced-length';
import { momentGradient } from '../steel/moment-gradient';
import type { AnalysisResults3D } from '../types-3d';
import type { ElementStationResult } from '../station-design-forces';
import type { StationForces } from '../station-forces';

/** IPE 200, app catalogue values (data/steel-profiles.ts), SI. `iy` is the STRONG axis. */
const IPE200 = {
  id: 1, name: 'IPE 200',
  a: 28.5e-4, iy: 1943e-8, iz: 142e-8,
  h: 0.200, b: 0.100, tw: 0.0056, tf: 0.0085, j: 6.98e-8,
  shape: 'I',
};
const STEEL = { id: 1, name: 'F-24', fy: 235, fu: 360, e: 200_000 };

/**
 * A 6 m beam split into two 3 m elements at node 2, where nothing else arrives — so the chain
 * is ONE 6 m unbraced length. `el2Reversed` draws element 2 nodeJ→nodeI, as a user sketching
 * right-to-left would; the segment read must not depend on how the element was drawn.
 */
function chainModel(opts: { el2Reversed?: boolean; el1DeclaredLb?: number } = {}) {
  return {
    nodes: new Map([
      [1, { id: 1, x: 0, y: 0, z: 0 }],
      [2, { id: 2, x: 3, y: 0, z: 0 }],
      [3, { id: 3, x: 6, y: 0, z: 0 }],
    ]),
    elements: new Map<number, any>([
      [1, {
        id: 1, nodeI: 1, nodeJ: 2, sectionId: 1, materialId: 1, type: 'frame',
        ...(opts.el1DeclaredLb !== undefined ? { unbracedLength: opts.el1DeclaredLb } : {}),
      }],
      [2, opts.el2Reversed
        ? { id: 2, nodeI: 3, nodeJ: 2, sectionId: 1, materialId: 1, type: 'frame' }
        : { id: 2, nodeI: 2, nodeJ: 3, sectionId: 1, materialId: 1, type: 'frame' }],
    ]),
    sections: new Map([[1, IPE200]]),
    materials: new Map([[1, STEEL]]),
    supports: new Map([[1, { id: 1, nodeId: 1 }], [2, { id: 2, nodeId: 3 }]]),
  } as any;
}

/** A point load at midspan of the 6 m chain: the moment diagram is a triangle 0 → 100 → 0. */
const EL1_TRIANGLE = [0, 25, 50, 75, 100];       // local t = 0 … 1, kN·m (sagging positive)
const EL2_TRIANGLE = [100, 75, 50, 25, 0];

const TS = [0, 0.25, 0.5, 0.75, 1];

function stationResult(elementId: number, myValues: number[]): ElementStationResult {
  const stations: StationForces[] = TS.map((t, i) => ({
    t, x: t * 3, n: 0, vy: 0, vz: 0, my: myValues[i]!, mz: 0, torsion: 0,
  }));
  return {
    elementId, length: 3, stationTs: [...TS],
    comboResults: [{ comboId: 1, comboName: '1.4D', stations }],
  };
}

/** Station diagrams as the solver produces them. A reversed element's sagging reads NEGATIVE my. */
function stationDiagrams(el2Reversed = false): Map<number, ElementStationResult> {
  return new Map([
    [1, stationResult(1, EL1_TRIANGLE)],
    [2, el2Reversed
      // local t = 0 sits at global x = 6, t = 1 at x = 3; the local y axis points the other way.
      ? stationResult(2, EL2_TRIANGLE.map((m) => -m).reverse())
      : stationResult(2, EL2_TRIANGLE)],
  ]);
}

function resultsFor(el2Reversed = false): AnalysisResults3D {
  const ef = (elementId: number, myStart: number, myEnd: number) => ({
    elementId, length: 3,
    nStart: 0, nEnd: 0, vyStart: 0, vyEnd: 0, vzStart: 0, vzEnd: 0,
    mxStart: 0, mxEnd: 0, myStart, myEnd, mzStart: 0, mzEnd: 0,
  });
  return {
    displacements: [], reactions: [],
    elementForces: el2Reversed
      ? [ef(1, 0, 100), ef(2, -0, -100)]
      : [ef(1, 0, 100), ef(2, 100, 0)],
  } as unknown as AnalysisResults3D;
}

/** The Cb the verification printed in its flexure steps, parsed back. */
function cbOf(v: { flexureZ: { steps: string[] } }): number {
  const step = v.flexureZ.steps.find((s) => s.includes('Cb ='));
  expect(step, 'the flexure memo must state Cb').toBeTruthy();
  return parseFloat(step!.match(/Cb = ([\d.]+)/)![1]);
}

/** F.1.1 evaluated on the triangle's segment values: Mmáx = 100, MA = 50, MB = 100, MC = 50. */
const CB_SEGMENT = (12.5 * 100) / (2.5 * 100 + 3 * 50 + 4 * 100 + 3 * 50);   // 1,3158
/** The element-local read of either half of the triangle (linear to zero): 1,6667. */
const CB_ELEMENT_LOCAL = (12.5 * 100) / (2.5 * 100 + 3 * 25 + 4 * 50 + 3 * 75);

describe('Cb over the unbraced segment, not the element', () => {
  it('reads the quarter points of the whole chain for both elements of a chained member', () => {
    const model = chainModel();
    const lengths = memberLengths(model);
    // The premise of PR #214: both elements are checked with Lb = 6, the chain length.
    expect(lengths.get(1)?.Lb).toBeCloseTo(6, 9);
    expect(lengths.get(2)?.Lb).toBeCloseTo(6, 9);

    const verifs = runSteelVerification(resultsFor(), model, undefined, stationDiagrams(), lengths);
    expect(verifs.length).toBe(2);
    for (const v of verifs) {
      // The segment read. Element-local would give 1,667 — a 27 % higher LTB capacity.
      expect(cbOf(v), `element ${v.elementId}`).toBeCloseTo(CB_SEGMENT, 3);
      expect(cbOf(v)).toBeLessThan(CB_ELEMENT_LOCAL - 0.1);
    }
  });

  it('gives the same segment Cb when a chain element is drawn nodeJ→nodeI', () => {
    const model = chainModel({ el2Reversed: true });
    const lengths = memberLengths(model);
    expect(lengths.get(2)?.chain).toEqual([1, 2]);

    const verifs = runSteelVerification(
      resultsFor(true), model, undefined, stationDiagrams(true), lengths,
    );
    expect(verifs.length).toBe(2);
    for (const v of verifs) {
      expect(cbOf(v), `element ${v.elementId}`).toBeCloseTo(CB_SEGMENT, 3);
    }
  });

  it('bounds the read to a declared Lb shorter than the chain', () => {
    // Element 1 declares Lb = 3 m: its unbraced segment is no longer the whole chain, and the
    // read is bounded to a 3 m window. Centred on element 1 that window IS element 1's extent,
    // so the element-local triangle half — 1,667 — is here the CORRECT segment value.
    const model = chainModel({ el1DeclaredLb: 3 });
    const lengths = memberLengths(model);
    expect(lengths.get(1)?.Lb).toBeCloseTo(3, 9);
    expect(lengths.get(2)?.Lb).toBeCloseTo(6, 9);   // element 2 keeps the chain length

    const verifs = runSteelVerification(resultsFor(), model, undefined, stationDiagrams(), lengths);
    const v1 = verifs.find((v) => v.elementId === 1)!;
    const v2 = verifs.find((v) => v.elementId === 2)!;
    expect(cbOf(v1)).toBeCloseTo(CB_ELEMENT_LOCAL, 3);
    expect(cbOf(v2)).toBeCloseTo(CB_SEGMENT, 3);
  });
});

describe('steelSegmentDiagram — the stitched segment diagram', () => {
  it('places each element’s envelope along the chain, in segment-normalised t', () => {
    const model = chainModel();
    const seg = steelSegmentDiagram(1, memberLengths(model).get(1), stationDiagrams(), model)!;
    expect(seg.tStart).toBe(0);
    expect(seg.tEnd).toBe(1);
    // Element 1's midstation (local t = 0,5 → x = 1,5) lands at segment t = 0,25; the peak at
    // the shared node lands at 0,5 from BOTH elements, with the same signed value.
    const at = (t: number) => seg.stations.find((s) => Math.abs(s.t - t) < 1e-9)?.m;
    expect(at(0)).toBeCloseTo(0, 9);
    expect(at(0.25)).toBeCloseTo(50, 9);
    expect(at(0.5)).toBeCloseTo(100, 9);
    expect(at(0.75)).toBeCloseTo(50, 9);
    expect(at(1)).toBeCloseTo(0, 9);
    // And F.1.1 on the stitched diagram is the segment value.
    expect(momentGradient({ stations: seg.stations, shape: 'I' }).cb).toBeCloseTo(CB_SEGMENT, 3);
  });

  it('reads a reversed element back-to-front and negated, so the diagram is continuous', () => {
    const model = chainModel({ el2Reversed: true });
    const seg = steelSegmentDiagram(2, memberLengths(model).get(2), stationDiagrams(true), model)!;
    const at = (t: number) => seg.stations.find((s) => Math.abs(s.t - t) < 1e-9)?.m;
    // Same physical triangle as the all-forward chain — no sign flip, no mirror.
    expect(at(0.5)).toBeCloseTo(100, 9);
    expect(at(0.75)).toBeCloseTo(50, 9);
    expect(at(1)).toBeCloseTo(0, 9);
    expect(momentGradient({ stations: seg.stations, shape: 'I' }).cb).toBeCloseTo(CB_SEGMENT, 3);
  });

  it('centres a shorter declared Lb on the element that declared it', () => {
    const model = chainModel({ el1DeclaredLb: 3 });
    const lengths = memberLengths(model);
    const seg1 = steelSegmentDiagram(1, lengths.get(1), stationDiagrams(), model)!;
    expect(seg1.tStart).toBeCloseTo(0, 9);
    expect(seg1.tEnd).toBeCloseTo(0.5, 9);
    expect(momentGradient({ stations: seg1.stations, tStart: seg1.tStart, tEnd: seg1.tEnd, shape: 'I' }).cb)
      .toBeCloseTo(CB_ELEMENT_LOCAL, 3);

    // The same declaration seen from element 2 — which did NOT declare — keeps the whole chain.
    const seg2 = steelSegmentDiagram(2, lengths.get(2), stationDiagrams(), model)!;
    expect(seg2.tStart).toBe(0);
    expect(seg2.tEnd).toBe(1);
  });

  it('is absent when there is no chain or no diagrams — the element-local read then applies', () => {
    const model = chainModel();
    const single = new Map([[1, { L: 3, Lb: 3, chain: [1] }]]);
    expect(steelSegmentDiagram(1, single.get(1), stationDiagrams(), model)).toBeUndefined();
    expect(steelSegmentDiagram(1, memberLengths(model).get(1), undefined, model)).toBeUndefined();
    expect(steelSegmentDiagram(1, undefined, stationDiagrams(), model)).toBeUndefined();
  });
});
