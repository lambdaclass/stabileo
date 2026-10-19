/**
 * A one-bay portal checked by hand through the whole pass: columns 50 × 50 (8Ø20, ties Ø10 four
 * legs, end zones 0,50 m at 10 cm), 3 m high; beam 30 × 60, 6 m between column axes, 3Ø20 top at
 * both ends and 3Ø16 bottom, hoops Ø8 two legs at 10 cm; f'c 25, fy 420, λo 1,25, slab not counted.
 *
 *   Beam: ln = 6 − 0,25 − 0,25 = 5,5 m; Ve = (Mpr⁻ + Mpr⁺)/5,5 + 30 kN.
 *         Hoops at 10 cm against min(d/4 = 0,140; 6·16 mm = 0,096; 0,15) = 0,096 m: too wide.
 *   Joint (top of each column, one beam): T = 1,25·420·9,42/10 = 494,6 kN; Vcol = Mpr/3;
 *         confinement «other» (one face): φVn = 0,85·1,0·5·0,25 = 1062,5 kN.
 *   Column: lu = 3 − 0,6 = 2,4 m, lo = 0,50 m; hx = 0,42/2 = 0,21 m, so = min(0,125; 0,12; 0,147) = 0,12 m;
 *         Ash at 10 cm = 3,13 cm² against 4Ø10 = 3,14 cm².
 */
import { describe, it, expect } from 'vitest';
import { beamSteel, seismicFrameChecks, type FrameMember } from '../frame-checks';
import { probableMoment } from '../capacity';
import { defaultSeismicDesign } from '../../../../model/seismic-design';

const nodes = new Map([[1, { x: 0, y: 0, z: 0 }], [2, { x: 0, y: 0, z: 3 }], [3, { x: 6, y: 0, z: 0 }], [4, { x: 6, y: 0, z: 3 }]]);
const c = 0.19, a20 = Math.PI * 0.02 ** 2 / 4;
const bars = [[-c, -c], [0, -c], [c, -c], [-c, 0], [c, 0], [-c, c], [0, c], [c, c]].map(([x, y]) => ({ x: x!, y: y!, area: a20 }));
const column = (id: number, nodeI: number, nodeJ: number): FrameMember => ({
  id, kind: 'column', role: 'primary', nodeI, nodeJ, L: 3, b: 0.5, h: 0.5, cover: 0.04, fc: 25, fy: 420, stirrupDia: 10,
  r: { column: { cornerDia: 20, faceDia: 20, nBottom: 1, nTop: 1, nLeft: 1, nRight: 1 }, stirrups: { diameter: 10, legs: 4, spacing: 0.15 }, tieZones: { endLength: 0.5, endSpacing: 0.1 } },
  section: { outline: { kind: 'rect', b: 0.5, h: 0.5 }, bars }, axial: { min: 300, max: 600 }, vu: 60,
});
const beam: FrameMember = {
  id: 3, kind: 'beam', role: 'primary', nodeI: 2, nodeJ: 4, L: 6, b: 0.3, h: 0.6, cover: 0.025, fc: 25, fy: 420, stirrupDia: 8,
  r: { regions: { topStart: { count: 3, diameter: 20 }, topEnd: { count: 3, diameter: 20 }, bottomSpan: { count: 3, diameter: 16 }, stirrupsSupport: { diameter: 8, legs: 2, spacing: 0.1 }, regionT: 0.25 } },
  faceHalf: [0.25, 0.25], vg: [30, 30],
};

describe('a seismic portal by hand', () => {
  const settings = { ...defaultSeismicDesign(), overstrength: 1.25, slabFlange: false };
  const r = seismicFrameChecks({ nodes, members: [column(1, 1, 2), column(2, 3, 4), beam], settings });
  const b = r.members.find((m) => m.id === 3)!;
  const col = r.members.find((m) => m.id === 1)!;

  it('builds the beam capacity shear and finds its hoops too wide', () => {
    const d = 0.6 - 0.025 - (8 + 8) / 1000, dp = 0.025 + 0.016;
    const st = beamSteel(beam.r);
    expect(st.top[0]).toBeCloseTo(9.42, 1);
    expect(st.bottom).toBeCloseTo(6.03, 1);
    const neg = probableMoment(0.3, d, dp, 25, 420, 1.25, st.top[0], st.bottom);
    expect(b.beam!.mprNeg[0]).toBeCloseTo(neg, 6);
    expect(b.beam!.ve).toBeCloseTo((b.beam!.mprNeg[0] + b.beam!.mprPos[1]) / 5.5 + 30, 9);
    expect(b.beam!.hoops.spacing).toBeCloseTo(0.096, 9);
    expect(b.issues).toContain('seisDes.issue.hoopSpacing');
  });

  it('checks each column-top joint with the beam yielding at λo·fy', () => {
    const j = r.joints.find((x) => x.nodeId === 2 && x.direction === 'X')!;
    expect(j.shear.T).toBeCloseTo(494.6, 0);
    const mpr = Math.max(b.beam!.mprNeg[0], b.beam!.mprPos[0]);
    expect(j.shear.vj).toBeCloseTo(494.6 - mpr / 3, 0);
    expect(j.shear.confinement).toBe('other');
    expect(j.shear.phiVn).toBeCloseTo(1062.5, 6);
    expect(j.strongColumn.required).toBeCloseTo(1.2 * j.strongColumn.sumBeams, 9);
    // A one-storey portal: its joints are at the roof, where the strong-column rule is not asked.
    expect(j.strongColumn.roof).toBe(true);
    expect(j.strongColumn.ok).toBe(true);
  });

  it('confines the column over lo at so with Ash', () => {
    expect(col.confinement!.lo).toBeCloseTo(0.5, 9);
    expect(col.confinement!.so).toBeCloseTo(0.12, 9);
    expect(col.confinement!.ashRequired.acrossB).toBeCloseTo(3.129, 2);
    expect(col.confinement!.ashOk).toBe(true);
    expect(col.issues).not.toContain('seisDes.issue.confinedSpacing');
  });

  it('leaves a secondary member unchecked', () => {
    const r2 = seismicFrameChecks({ nodes, members: [column(1, 1, 2), column(2, 3, 4), { ...beam, role: 'secondary' }], settings });
    expect(r2.members.find((m) => m.id === 3)!.beam).toBeUndefined();
    expect(r2.joints).toHaveLength(0);
  });
});
