/**
 * The general path by hand.
 *
 *   Combined, 6 × 2 × 0,6 m, columns 0,40 m at x = ±2 m, 600 kN service and 840 kN factored each:
 *   the service field is uniform, (1200 + 25·0,6·12)/12 = 115 kPa; the factored net field is
 *   1680/12 = 140 kPa, 280 kN/m along B. Midway between the columns M = 280·3²/2 − 840·2 = −420 kN·m
 *   (the top in tension); at the outer face, 0,8 m of cantilever, M = 280·0,8²/2 = 89,6 kN·m.
 *   A footing turned 90° carries the same loads along L.
 */
import { describe, it, expect } from 'vitest';
import { designGeneralFooting, footingFrame, layOut } from '../general-footing';
import { newFooting, type Footing } from '../../../model/footing';
import type { NodeReactions } from '../../detailing/run-footing-design';

const reaction = (fz: number, service: number, mx = 0, my = 0): NodeReactions => ({
  factored: [{ combinationId: 1, combinationName: '1,2D+1,6L', fz, mx, my }],
  cases: [{ caseId: 1, caseType: 'D', fz: service, mx, my }],
});
const OPTS = { cover: 0.05, foundingElevation: -1.5, soilProfileId: 1 };
const column = (elementId: number) => ({ elementId, b: 0.4, h: 0.4 });

function combined(rotationDeg = 0): Footing {
  const th = (rotationDeg * Math.PI) / 180;
  return {
    ...newFooting(1, 1, 'Z1', OPTS), kind: 'combined', B: 6, L: 2, thickness: 0.6, cover: 0.05, rotationDeg,
    eccentricityB: 2, eccentricityL: 0, supportedNodeIds: [2], foundingElevation: -1.5, soilProfileId: 1,
    ...(th ? {} : {}),
  };
}
const nodesFor = (rotationDeg: number) => {
  const th = (rotationDeg * Math.PI) / 180;
  return new Map([[1, { x: 10 - 2 * Math.cos(th), y: 5 - 2 * Math.sin(th) }], [2, { x: 10 + 2 * Math.cos(th), y: 5 + 2 * Math.sin(th) }]]);
};
const run = (f: Footing, nodes: Map<number, { x: number; y: number }>) => designGeneralFooting({
  footing: f, nodes, reactions: new Map([[1, reaction(840, 600)], [2, reaction(840, 600)]]),
  columnAt: (n) => column(n), fc: 25, fy: 420, allowable: 150, barDiameterMm: { x: 16, y: 16 }, edition: '2025',
});

describe('the general footing path', () => {
  it('places the centroid and the nodes in the footing axes', () => {
    const fr = footingFrame(combined(30), nodesFor(30).get(1)!);
    expect(fr.cx).toBeCloseTo(10, 9); expect(fr.cy).toBeCloseTo(5, 9);
    const p = fr.toLocal(nodesFor(30).get(2)!);
    expect(p.x).toBeCloseTo(2, 9); expect(p.y).toBeCloseTo(0, 9);
  });

  it('designs a combined footing: uniform bearing, top steel between the columns', () => {
    const d = run(combined(), nodesFor(0));
    if ('refused' in d) throw new Error(d.refused);
    if (!('rigid' in d.result)) throw new Error('rigid');
    const r = d.result.rigid;
    expect(r.bearing.qMax).toBeCloseTo(115, 3);
    expect(r.x.mNeg).toBeCloseTo(-420, 0);
    expect(r.x.mPos).toBeCloseTo(89.6, 0);
    expect(d.mats.topX).not.toBeNull();
    expect(d.bars.length).toBeGreaterThan(0);
    expect(d.posts.map((p) => +p.x.toFixed(6))).toEqual([-2, 2]);
  });

  it('gives a footing turned in plan the same design', () => {
    const a = run(combined(), nodesFor(0)), b = run(combined(37), nodesFor(37));
    if ('refused' in a || 'refused' in b || !('rigid' in a.result) || !('rigid' in b.result)) throw new Error('refused');
    expect(b.result.rigid.x.mNeg).toBeCloseTo(a.result.rigid.x.mNeg, 6);
    expect(b.utilization).toBeCloseTo(a.utilization, 6);
    // The bars follow the footing: the first bottom bar along B runs at 37°.
    const bar = b.bars.find((x) => x.id.includes('BX'))!;
    const seg = bar.segments.find((s) => s.kind === 'straight' && Math.abs(s.end.z - s.start.z) < 1e-9)!;
    expect(Math.atan2(seg.end.y - seg.start.y, seg.end.x - seg.start.x) * 180 / Math.PI).toBeCloseTo(37, 6);
  });

  it('turns a reaction moment with the footing', () => {
    const fr = footingFrame({ ...combined(90) }, { x: 0, y: 0 });
    // my shifts the resultant along global X, which is along −L for a footing turned 90°.
    const m = fr.moments(0, 100);
    expect(m.My).toBeCloseTo(0, 9); expect(m.Mx).toBeCloseTo(-100, 9);
  });

  it('refuses a pile cap with no piles, and lays bars out at 2,5 cm steps', () => {
    const f: Footing = { ...newFooting(2, 1, 'P1', OPTS), kind: 'pileCap' };
    const d = designGeneralFooting({ footing: f, nodes: new Map([[1, { x: 0, y: 0 }]]), reactions: new Map([[1, reaction(800, 560)]]), columnAt: () => column(9), fc: 25, fy: 420, allowable: null, barDiameterMm: { x: 16, y: 16 }, edition: '2025' });
    expect(d).toEqual({ refused: 'noPiles' });
    const l = layOut(10e-4, 1, 0.5, 16);
    expect(l.spacing).toBeCloseTo(0.2, 9);
    expect(l.area).toBeGreaterThanOrEqual(10e-4);
  });

  it('designs a four-pile cap on its piles', () => {
    const f: Footing = { ...newFooting(3, 1, 'P2', OPTS), kind: 'pileCap', B: 2.3, L: 2.3, thickness: 0.9, cover: 0.075, piles: { count: 4, diameter: 0.4, length: 12, spacing: 1.5 } };
    const d = designGeneralFooting({ footing: f, nodes: new Map([[1, { x: 0, y: 0 }]]), reactions: new Map([[1, reaction(2240, 1600)]]), columnAt: () => ({ elementId: 9, b: 0.5, h: 0.5 }), fc: 25, fy: 420, allowable: null, pileCapacity: 600, barDiameterMm: { x: 16, y: 16 }, edition: '2025' });
    if ('refused' in d || !('cap' in d.result)) throw new Error('refused');
    expect(d.result.cap.x.mu).toBeCloseTo(560, 6);
    expect(d.mats.topX).toBeNull();
  });
});

describe('bars fixed by hand', () => {
  it('checks the bars given instead of laying its own', () => {
    const f = { ...combined(), mats: { bottomX: { diameterMm: 10, spacing: 0.3 }, bottomY: { diameterMm: 10, spacing: 0.3 } } };
    const d = run(f, nodesFor(0));
    if ('refused' in d) throw new Error(d.refused);
    expect(d.mats.bottomX.spacing).toBe(0.3);
    // No top mat given, and the footing needs one between its columns: it fails on flexure.
    expect(d.mats.topX).toBeNull();
    expect(d.flexure).toBeGreaterThan(1e6);
    expect(d.utilization).toBe(d.flexure);
  });
});

/**
 * A strip under a 0,20 m wall, 6 × 1,2 × 0,4 m, six wall nodes 1 m apart with 100 kN service and
 * 140 kN factored each. Across the wall the cantilever is (1,2 − 0,2)/2 = 0,5 m; the factored net
 * pressure is 840/7,2 = 116,7 kPa, so Mu = 116,7·6·0,5²/2 = 87,5 kN·m over the length. Service:
 * (600 + 25·0,4·7,2)/7,2 = 93,3 kPa. A wall does not punch.
 */
describe('a strip footing under a wall', () => {
  it('bends across the wall as a cantilever from its face', () => {
    const ids = [1, 2, 3, 4, 5, 6];
    const f: Footing = { ...newFooting(9, 1, 'C1', OPTS), kind: 'strip', B: 6, L: 1.2, thickness: 0.4, cover: 0.05, eccentricityB: 2.5, supportedNodeIds: ids.slice(1), wallGroupId: 3 };
    const d = designGeneralFooting({
      footing: f, nodes: new Map(ids.map((id, k) => [id, { x: -2.5 + k, y: 0 }])),
      reactions: new Map(ids.map((id) => [id, reaction(140, 100)])), columnAt: () => undefined, wallThickness: 0.2,
      fc: 25, fy: 420, allowable: 150, barDiameterMm: { x: 12, y: 12 }, edition: '2025',
    });
    if ('refused' in d || !('rigid' in d.result)) throw new Error('refused');
    const r = d.result.rigid;
    expect(r.bearing.qMax).toBeCloseTo(93.33, 1);
    expect(r.y.mPos).toBeCloseTo(87.5, 0);
    expect(r.punching).toHaveLength(0);
  });
});
