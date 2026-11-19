/**
 * A lap carries what one of its bars carries.
 *
 * Inside a lap the force passes from one bar to the other: the section there has one bar's worth of
 * steel per pair. Before, a bar cut with a lap read both halves at the lap: 8Ø10 where 4Ø10 carry
 * the moment, twice the flexural steel (unconservative) and a row that "did not fit".
 */
import { describe, it, expect } from 'vitest';
import { areaAt, barsCarrying, lineLaps, lineMembersOf, lineFromMembers, membersFromLine, type LineMember } from '../beam-line';
import type { BeamLineReinforcement } from '../../../design-contract/beam-line';
import { seismicFrameChecks } from '../seismic/frame-checks';
import { defaultSeismicDesign } from '../../../model/seismic-design';
import { extractGoverningDemands, verifyProvidedReinforcement } from '../../station-design-forces';

const line: BeamLineReinforcement = {
  version: 1, members: [1], lengths: [5],
  bars: [
    { id: 'a', face: 'bottom', row: 0, count: 4, diameter: 10, from: 0, to: 3, role: 'main' },
    { id: 'b', face: 'bottom', row: 0, count: 4, diameter: 10, from: 2, to: 5, role: 'main' },
    { id: 't', face: 'top', row: 0, count: 2, diameter: 10, from: 0, to: 5, role: 'mounting' },
  ],
  stirrups: [{ id: 'z', from: 0, to: 5, diameter: 6, legs: 2, spacing: 0.2 }],
};

describe('a lap drawn in a beam line', () => {
  it('is found where one bar ends inside the other, with its length', () => {
    expect(lineLaps(line)).toEqual([{ face: 'bottom', row: 0, a: 'a', b: 'b', from: 2, to: 3, length: 1, diameterMm: 10, count: 4 }]);
  });

  it('carries one bar per pair inside it, and both bars only outside it', () => {
    expect(barsCarrying(line, 'bottom', 2.5).map((b) => b.id)).toEqual(['b']);
    expect(barsCarrying(line, 'bottom', 1).map((b) => b.id)).toEqual(['a']);
    // 4Ø10 = 4 · π · 1² / 4 = 3,1416 cm², not twice that.
    expect(areaAt(line, 'bottom', 2.5)).toBeCloseTo(4 * Math.PI / 4, 6);
  });

  it('projects 4Ø10 at the span, not 8Ø10', () => {
    const m: LineMember = { id: 1, L: 5, tStart: 0.25, tEnd: 0.25, faceStart: 0.2, faceEnd: 0.2 };
    const r = membersFromLine(line, [m]).get(1)!;
    expect(r.regions!.bottomSpan).toEqual({ count: 4, diameter: 10 });
  });
});

const longSpan: LineMember = { id: 1, L: 6, tStart: 0.25, tEnd: 0.25, faceStart: 0, faceEnd: 0 };
const beamConcrete = { b: 0.3, h: 0.5, fc: 30, fy: 420, cover: 0.025, stirrupDia: 8 };
const beamAxes = {
  flexure: 'My', shear: 'Vz', secondaryFlexure: 'Mz', secondaryShear: 'Vy',
  bFlex: beamConcrete.b, hFlex: beamConcrete.h, biaxial: false,
  sagCategory: 'My+', hogCategory: 'My-', basis: 'stress-proxy', secondaryRatio: 0,
} as const;
const drawnMainBars: BeamLineReinforcement['bars'] = [
  { id: 'main', face: 'bottom', row: 0, count: 3, diameter: 16, from: 0, to: 6, role: 'main' },
  { id: 'top', face: 'top', row: 0, count: 3, diameter: 16, from: 0, to: 6, role: 'mounting' },
];

function checkDrawnBeam(drawing: BeamLineReinforcement, forces: Array<{ x: number; my: number; vz: number }>) {
  const reinforcement = membersFromLine(drawing, [longSpan]).get(longSpan.id)!;
  const stations = forces.map(force => ({ ...force, t: force.x / longSpan.L, n: 0, mz: 0, vy: 0, torsion: 0 }));
  return verifyProvidedReinforcement(longSpan.id, 'beam', reinforcement, undefined, {}, beamConcrete, {
    elementId: longSpan.id, length: longSpan.L, stationTs: stations.map(s => s.t),
    comboResults: [{ comboId: 1, comboName: 'C1', stations }],
  }, undefined, { axes: beamAxes, spacingRule: { edition: '2025', maxAggregateSizeMm: 20 } });
}

const issue2241 = process.env.RUN_KNOWN_WRONG === '2241' ? it : it.skip;
issue2241('known wrong result: #2241 bars ending inside a span do not strengthen a cut outside their extent', () => {
  const x = 2;
  const force = 90;
  const leftReaction = force * (longSpan.L - x) / longSpan.L;
  const moment = leftReaction * x;
  const drawing: BeamLineReinforcement = {
    version: 1, members: [1], lengths: [longSpan.L],
    bars: [...drawnMainBars, { id: 'extra', face: 'bottom', row: 0, count: 2, diameter: 20, from: 2.5, to: 3.5, role: 'extra' }],
    stirrups: [{ id: 'cage', from: 0, to: 6, diameter: 8, legs: 2, spacing: 0.1 }],
  };
  const mainArea = 3 * Math.PI * (16 / 1000) ** 2 / 4;
  const d = beamConcrete.h - beamConcrete.cover - (8 + 16 / 2) / 1000;
  const block = mainArea * beamConcrete.fy / (0.85 * beamConcrete.fc * beamConcrete.b);
  const flexuralCapacity = 0.9 * mainArea * beamConcrete.fy * 1000 * (d - block / 2);
  expect(areaAt(drawing, 'bottom', x)).toBeCloseTo(mainArea * 1e4, 12);
  expect(moment).toBeGreaterThan(flexuralCapacity);
  const stations = [{ x: 0, my: 0, vz: leftReaction }, { x, my: moment, vz: leftReaction },
    { x, my: moment, vz: leftReaction - force }, { x: longSpan.L, my: 0, vz: leftReaction - force }];
  const flexureAtCut = (model: BeamLineReinforcement) => checkDrawnBeam(model, stations).checks
    .find(row => row.demandCategory === 'My+' && row.stationX === x);
  expect(flexureAtCut({ ...drawing, bars: drawnMainBars })).toMatchObject({ status: 'fail' });
  expect(flexureAtCut(drawing), 'Only 3Ø16 cross the 120 kN·m cut').toMatchObject({ status: 'fail' });
});

const issue2245 = process.env.RUN_KNOWN_WRONG === '2245' ? it : it.skip;
issue2245('known wrong result: #2245 shear verification retains the weak stirrup interval between samples', () => {
  const drawing: BeamLineReinforcement = {
    version: 1, members: [1], lengths: [longSpan.L], bars: drawnMainBars,
    stirrups: [[0, 1.6, 0.1], [1.6, 2.4, 0.4], [2.4, 6, 0.1]].map(([from, to, spacing], i) =>
      ({ id: String(i), from: from!, to: to!, spacing: spacing!, diameter: 8, legs: 2 })),
  };
  const x = 2;
  const q = 145;
  const weakCage = drawing.stirrups[1]!;
  const d = beamConcrete.h - beamConcrete.cover - (weakCage.diameter + 16 / 2) / 1000;
  const av = weakCage.legs * Math.PI * (weakCage.diameter / 1000) ** 2 / 4;
  const vc = 0.17 * Math.sqrt(beamConcrete.fc) * beamConcrete.b * d * 1000;
  const vs = av * beamConcrete.fy * 1000 * d / weakCage.spacing;
  expect(q).toBeGreaterThan(0.75 * (vc + vs));
  const moment = (s: number) => 20 - 5 * s + 150 * Math.max(s - 1.9, 0) - 150 * Math.max(s - 2.1, 0);
  const result = checkDrawnBeam(drawing, [0, 1.9, x, 2.1, 6].map(s => ({ x: s, my: moment(s), vz: s === x ? q : -5 })));
  expect(result.checks.find(row => row.demandCategory === 'Vz' && row.stationX === x)).toMatchObject({ status: 'fail' });
});

it('#2296 provided shear refuses a cut in a drawn stirrup gap', () => {
  const L = 4;
  const stirrups = { id: 'cage', from: 0.4, to: L, diameter: 8, legs: 2, spacing: 0.075 };
  const geometry = { ...beamConcrete, h: 0.6, fc: 25 };
  const drawing: BeamLineReinforcement = {
    version: 1, members: [1], lengths: [L], bars: drawnMainBars.map(bar => ({ ...bar, to: L })), stirrups: [stirrups],
  };
  const layout = membersFromLine(drawing, [{ ...longSpan, L }]).get(1)!;
  for (const extracted of [false, true]) {
    const check = (x: number) => {
      const stations = [{ x, t: x / L, my: -20, vz: 40, n: 0, mz: 0, vy: 0, torsion: 0 }];
      const result = { elementId: 1, length: L, stationTs: [x / L], comboResults: [{ comboId: 1, comboName: 'C1', stations }] };
      return verifyProvidedReinforcement(1, 'beam', layout, extracted ? extractGoverningDemands(result) : undefined, {}, geometry,
        extracted ? undefined : result, undefined, { axes: { ...beamAxes, hFlex: geometry.h } })
        .checks.find(row => row.demandCategory === 'Vz');
    };
    expect(check(0.2)).toMatchObject({ capacity: 0, status: 'fail', missingReinforcement: true });
    expect(check(stirrups.from)).toMatchObject({ status: 'ok' });
  }
});

it('#2302 seismic verification blocks a reopened beam line with a short dense cage', () => {
  const L = 5;
  const height = 0.5;
  const seismicLength = 2 * height;
  const dense = { diameter: 8, legs: 2, spacing: 0.075 };
  const span = { ...dense, spacing: 0.2 };
  const criticalDistance = 0.659;
  const critical = { tCritShear: criticalDistance / L, tFace: 0.2 / L, source: 'column' };
  const bars = { count: 2, diameter: 16 };
  const source = {
    L, criticalSections: { start: critical, end: critical },
    reinforcement: { regions: { regionT: seismicLength / L, stirrupsSupport: dense, stirrupsSpan: span, topStart: bars, topEnd: bars, bottomSpan: bars } },
  };
  const members = lineMembersOf({ members: [1], forward: [true] }, () => source, reinforcement => reinforcement);
  const drawing = lineFromMembers(members);
  expect(drawing.stirrups.find(zone => zone.from === 0 && zone.spacing === dense.spacing)?.to).toBeLessThan(seismicLength);
  const frame = {
    ...source, ...beamConcrete, b: 0.2, h: height, id: 1, kind: 'beam' as const, role: 'primary' as const,
    nodeI: 1, nodeJ: 2, faceHalf: [0.2, 0.2] as [number, number], r: source.reinforcement,
  };
  const check = (tCritShear: number) => seismicFrameChecks({
    nodes: new Map(), settings: defaultSeismicDesign(),
    members: [{ ...frame, ...{ criticalSections: { start: { ...critical, tCritShear }, end: { ...critical, tCritShear } } } }],
  }).members[0]!;
  expect(check(critical.tCritShear)).toMatchObject({
    ok: false, issues: ['seisDes.issue.hoopZone'], beam: { hoops: { lengthOk: false, spacingOk: true } },
  });
  expect(check(seismicLength / L).beam?.hoops).toMatchObject({ lengthOk: false, spacingOk: true });
  expect(check((seismicLength + frame.faceHalf[0]) / L).beam?.hoops).toMatchObject({ lengthOk: true, spacingOk: true });
  const drawn = (endLength: number) => seismicFrameChecks({
    nodes: new Map(), settings: defaultSeismicDesign(),
    members: [{
      ...frame,
      drawnStirrups: [{ ...dense, from: 0, to: seismicLength + frame.faceHalf[0] }, { ...dense, from: L - endLength, to: L }],
    }],
  }).members[0]!;
  expect(drawn(criticalDistance)).toMatchObject({ ok: false, issues: ['seisDes.issue.hoopZone'] });
  expect(drawn(seismicLength)).toMatchObject({ ok: false, issues: ['seisDes.issue.hoopZone'] });
  expect(drawn(seismicLength + frame.faceHalf[1])).toMatchObject({ ok: true, issues: [] });
});


it('#2296 a drawn interior gap refuses either shear axis or active torsion', () => {
  const L = 4;
  const cage = { diameter: 8, legs: 4, spacing: 0.06 };
  for (const extracted of [false, true]) for (const axis of ['vz', 'vy', 'torsion'] as const) {
    const check = (end: number, force: number) => {
      const barLayout = membersFromLine({
        version: 1, members: [1], lengths: [L], bars: drawnMainBars.map(bar => ({ ...bar, to: L })),
        stirrups: [{ ...cage, id: 'left', from: 0, to: end }, { ...cage, id: 'right', from: 1.8, to: L }],
      }, [{ ...longSpan, L }]).get(1)!;
      const stations = [0, 1, 2, 3, L].map(x => ({
        x, t: x / L, my: 0, mz: 0, n: 0, vz: 0, vy: 0, torsion: 0, [axis]: force,
      }));
      const result = { elementId: 1, length: L, stationTs: stations.map(s => s.t), comboResults: [{ comboId: 1, comboName: 'C1', stations }] };
      return verifyProvidedReinforcement(1, 'beam', barLayout, extracted ? extractGoverningDemands(result) : undefined, {},
        beamConcrete, extracted ? undefined : result, undefined, { axes: beamAxes }).checks;
    };
    const demand = axis === 'torsion' ? 6 : 10;
    expect.soft(check(1.4, demand)).toContainEqual(expect.objectContaining({
      description: 'diag.rcShearGap', ratio: Infinity, status: 'fail', missingReinforcement: true,
      demandCategory: axis === 'torsion' ? null : axis === 'vz' ? 'Vz' : 'Vy',
      stationX: expect.any(Number),
    }));
    expect(check(1.8, demand).some(c => c.description === 'diag.rcShearGap')).toBe(false);
    expect(check(1.4, axis === 'torsion' ? 0.5 : 0).some(c => c.description === 'diag.rcShearGap')).toBe(false);
  }
});

it('#2302 hoops inside either support do not count toward the dense zone', () => {
  const L = 5;
  const h = 0.5;
  const required = 2 * h;
  const dense = { diameter: 8, legs: 2, spacing: 0.075 };
  const faceHalf: [number, number] = [0.2, 0.25];
  const bars = { count: 2, diameter: 16 };
  const frame = {
    ...beamConcrete, b: 0.2, h, L, id: 1, kind: 'beam' as const, role: 'primary' as const,
    nodeI: 1, nodeJ: 2, faceHalf,
    r: { top: bars, bottom: bars, regions: { regionT: required / L, stirrupsSupport: dense } },
  };
  const check = (from: number, to: number) => seismicFrameChecks({
    nodes: new Map(), settings: defaultSeismicDesign(),
    members: [{ ...frame, drawnStirrups: [{ ...dense, from: 0, to: from }, { ...dense, from: L - to, to: L }] }],
  }).members[0]!;
  const fullStart = required + faceHalf[0], fullEnd = required + faceHalf[1];
  expect.soft(check(required, fullEnd).issues).toContain('seisDes.issue.hoopZone');
  expect.soft(check(fullStart, required).issues).toContain('seisDes.issue.hoopZone');
  expect(check(fullStart, fullEnd).beam?.hoops).toMatchObject({ lengthOk: true, spacingOk: true });
});


it('#2310 drawn perimeter verification uses the corner seats occupied at the cut', () => {
  const L = 6;
  const geometry = { ...beamConcrete, h: 0.37 };
  const stirrups = [{ id: 'cage', from: 0, to: L, diameter: 8, legs: 4, spacing: 0.06 }];
  for (const extracted of [false, true]) {
    const check = (terminus: number) => {
      const [bottom, top] = drawnMainBars;
      const drawing: BeamLineReinforcement = {
        version: 1, members: [1], lengths: [L], stirrups,
        bars: [
          bottom!,
          { ...top!, id: 'top-left', to: terminus },
          { ...top!, id: 'top-right', from: L - terminus },
          { ...top!, id: 'top-inner', row: 1, count: 4 },
          { ...top!, id: 'mid-inner', row: 2, from: 2, to: 4 },
        ],
      };
      const layout = membersFromLine(drawing, [longSpan]).get(1)!;
      const stations = [{ t: 0.5, x: 3, my: 0, mz: 0, n: 0, vy: 0, vz: 0, torsion: 6 }];
      const result = { elementId: 1, length: L, stationTs: [0.5], comboResults: [{ comboId: 1, comboName: 'C1', stations }] };
      return verifyProvidedReinforcement(1, 'beam', layout, extracted ? extractGoverningDemands(result) : undefined, {},
        geometry, extracted ? undefined : result, undefined, { axes: { ...beamAxes, hFlex: geometry.h } })
        .checks.find(row => row.category === 'Torsion Al Span (Vz)');
    };
    expect(check(3 - 1e-5)).toMatchObject({ status: 'fail', ratio: Infinity, description: 'diag.rcTorsionPerimeter' });
    expect(check(3)).toMatchObject({ status: 'ok' });
  }
});
