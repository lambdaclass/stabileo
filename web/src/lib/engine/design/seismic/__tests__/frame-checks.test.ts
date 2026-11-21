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
import { seismicJointCheckRows, seismicMemberCheckRows } from '../../check-rows-families';
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
    expect(j.shear!.T).toBeCloseTo(494.6, 0);
    const mpr = Math.max(b.beam!.mprNeg[0], b.beam!.mprPos[0]);
    expect(j.shear!.vj).toBeCloseTo(494.6 - mpr / 3, 0);
    expect(j.shear!.confinement).toBe('other');
    expect(j.shear!.phiVn).toBeCloseTo(1062.5, 6);
    expect(j.strongColumn!.required).toBeCloseTo(1.2 * j.strongColumn!.sumBeams, 9);
    // A one-storey portal: its joints are at the roof, where the strong-column rule is not asked.
    expect(j.strongColumn!.roof).toBe(true);
    expect(j.strongColumn!.ok).toBe(true);
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

it('#2216 missing primary reinforcement cannot pass a seismic member check', () => {
  const primaryBeam = { ...beam, L: 8, b: 0.4, h: 0.8, vg: [0, 0] as [number, number] };
  const primaryColumn = column(1, 1, 2);
  const missing = [
    { ...primaryBeam, r: undefined },
    { ...primaryBeam, r: {} },
    { ...primaryColumn, r: undefined, section: undefined },
    { ...primaryColumn, section: undefined },
    { ...primaryColumn, r: { stirrups: primaryColumn.r!.stirrups! } },
    { ...primaryColumn, axial: undefined, vu: undefined },
    { ...primaryBeam, vg: undefined },
  ];
  for (const member of missing) {
    const report = seismicFrameChecks({ nodes, members: [member], settings: defaultSeismicDesign() });
    expect(report.members).toHaveLength(1);
    expect.soft(report.members[0]).toMatchObject({ ok: false, issues: [expect.stringMatching(/^seisDes[.]issue[.]/)] });
    expect.soft(report.members[0]?.shear).toBeUndefined();
    expect.soft(seismicMemberCheckRows(report.members[0]!)).toContainEqual(expect.objectContaining({
      status: 'notVerified', formula: report.members[0]?.issues[0],
    }));
  }
  const secondary = seismicFrameChecks({ nodes, settings: defaultSeismicDesign(),
    members: [{ ...primaryBeam, role: 'secondary', r: undefined }],
  }).members[0]!;
  expect(seismicMemberCheckRows(secondary)).toHaveLength(0);
});

it('#2217 layered bars and grouped bars require the same hoop spacing', () => {
  const largest = { count: 4, diameter: 25 };
  const smallest = { count: 4, diameter: 10 };
  const common = { stirrupsSupport: { diameter: 8, legs: 2, spacing: 0.1 }, regionT: 0.25 };
  const grouped = { ...common, topStart: largest, topEnd: smallest, bottomSpan: largest };
  const layered = { ...common, topStartLayers: [{ ...largest, row: 0 }], topEndLayers: [{ ...smallest, row: 0 }], bottomSpanLayers: [{ ...largest, row: 0 }] };
  const assess = (regions: NonNullable<FrameMember['r']>['regions']) => seismicFrameChecks({
    nodes: new Map([[2, { x: 0, y: 0, z: 3 }], [4, { x: 8, y: 0, z: 3 }]]),
    members: [{ ...beam, L: 8, b: 0.4, h: 0.8, r: { regions }, faceHalf: [0, 0], vg: [0, 0] }],
    settings: defaultSeismicDesign(),
  }).members[0]?.beam?.hoops;
  const sixSmallestRestrainedBarDiameters = 6 * smallest.diameter / 1000;
  expect(assess(grouped)).toMatchObject({ spacing: sixSmallestRestrainedBarDiameters, spacingOk: false });
  expect(assess(layered)).toMatchObject({ spacing: sixSmallestRestrainedBarDiameters, spacingOk: false });
});


it('#2217 every regional layer or group participates in the smallest-bar limit', () => {
  const large = { count: 4, diameter: 25, row: 0 };
  const small = { count: 2, diameter: 10, row: 1 };
  const mirror = { count: 8, diameter: 8 };
  const layers = { topStartLayers: [large], topEndLayers: [large], bottomSpanLayers: [large] };
  expect(beamSteel({ top: mirror, bottom: mirror, regions: layers }).minDia).toBe(25);
  for (const face of ['topStartLayers', 'topEndLayers', 'bottomSpanLayers'] as const) {
    const withSmall = { ...layers, [face]: [large, small] };
    expect(beamSteel({ top: mirror, bottom: mirror, regions: withSmall }).minDia).toBe(10);
  }
  expect(beamSteel({ regions: { ...layers, topEndGroups: [{ layers: [large, small] }] } }).minDia).toBe(10);
});


it('#2351 hoop zone starts at either support face without faceHalf', () => {
  const L = 5, h = 0.5, face = 0.2, required = 2 * h;
  const bars = { count: 2, diameter: 16 };
  const hoops = { diameter: 8, legs: 2, spacing: 0.075 };
  const end = { tFace: face / L, tCritShear: (face + h) / L, halfDepth: face, source: 'column' as const };
  const criticalSections = { L, d: h, start: end, end, tSpanStart: end.tCritShear, tSpanEnd: 1 - end.tCritShear };
  const check = (left: number, right: number, known = true) => seismicFrameChecks({
    nodes, settings: defaultSeismicDesign(), members: [{
      ...beam, b: 0.3, h, L, vg: [0, 0], faceHalf: undefined, criticalSections: known ? criticalSections : undefined,
      r: { top: bars, bottom: bars, regions: { regionT: required / L, stirrupsSupport: hoops } },
      drawnStirrups: [{ ...hoops, from: 0, to: left }, { ...hoops, from: L - right, to: L }],
    }],
  }).members[0]!;
  const full = required + face;
  for (const [left, right] of [[required, full], [full, required], [full - 0.001, full], [full, full - 0.001]] as const) {
    expect.soft(check(left, right)).toMatchObject({ ok: false, issues: ['seisDes.issue.hoopZone'], beam: { hoops: { lengthOk: false } } });
  }
  expect.soft(check(full, full)).toMatchObject({ ok: true, beam: { hoops: { lengthOk: true } } });
  expect.soft(check(full + 0.001, full + 0.001)).toMatchObject({ ok: true, beam: { hoops: { lengthOk: true } } });
  const unknown = check(full, full, false);
  expect.soft(unknown).toMatchObject({ ok: false, issues: [expect.stringMatching(/^seisDes[.]issue[.]/)] });
  expect.soft(unknown.shear).toBeUndefined();
});


it('#2216 does not compute a joint from an incomplete subset of its primary members', () => {
  const settings = defaultSeismicDesign();
  const c1 = column(1, 1, 2);
  for (const members of [[c1, { ...beam, r: undefined }], [{ ...c1, section: undefined }, beam]]) {
    const report = seismicFrameChecks({ nodes, members, settings });
    const joint = report.joints.find(j => j.nodeId === 2 && j.direction === 'X')!;
    expect(joint).toMatchObject({ ok: false, refusal: 'seisDes.issue.incompleteJoint' });
    expect(joint.shear).toBeUndefined();
    expect(seismicJointCheckRows(joint)).toContainEqual(expect.objectContaining({
      status: 'notVerified', formula: 'seisDes.issue.incompleteJoint',
    }));
  }
  const checked = seismicFrameChecks({ nodes, members: [c1, beam], settings });
  expect(checked.joints.find(j => j.nodeId === 2)).toMatchObject({ shear: { vj: expect.any(Number) } });
  expect(checked.members.every(m => m.shear && !m.refusal)).toBe(true);
});

const round2 = process.env.RUN_KNOWN_WRONG === '2216' ? it : it.skip;
round2('known wrong result: #2216 incomplete joints keep each applicable summary row', () => {
  const frameNodes = new Map([...nodes, [5, { x: 0, y: 0, z: 6 }], [6, { x: 6, y: 0, z: 6 }]]);
  const upperBeam = { ...beam, id: 6, nodeI: 5, nodeJ: 6 };
  const run = (lower: FrameMember, upper: FrameMember) => seismicFrameChecks({
    nodes: frameNodes, settings: defaultSeismicDesign(),
    members: [column(1, 1, 2), column(2, 3, 4), column(4, 2, 5), column(5, 4, 6), lower, upper],
  }).joints;
  const complete = run(beam, upperBeam).find(j => j.nodeId === 2)!;
  expect(complete.strongColumn).toMatchObject({ roof: false, ok: true });
  const summaryKeys = (joint: typeof complete) => seismicJointCheckRows(joint).map(r => [r.titleKey, r.clause]);
  const incomplete = run({ ...beam, r: undefined }, { ...upperBeam, r: undefined });
  const lower = incomplete.find(j => j.nodeId === 2)!;
  const roof = incomplete.find(j => j.nodeId === 5)!;
  expect.soft(summaryKeys(lower)).toEqual(summaryKeys(complete));
  expect.soft(summaryKeys(roof)).toEqual([['check.seismic.jointShear', '18.1']]);
  for (const joint of [lower, roof]) {
    for (const row of seismicJointCheckRows(joint)) {
      expect.soft(row).toMatchObject({ status: 'notVerified', ratio: null, formula: 'seisDes.issue.incompleteJoint' });
    }
  }
});
