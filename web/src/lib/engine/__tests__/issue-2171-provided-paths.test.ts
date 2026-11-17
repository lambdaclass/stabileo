import { afterEach, expect, it } from 'vitest';
import { verifyProvidedReinforcement, computeDirectionalShearCapacity, layerCentroid, rebarGroupArea } from '../station-design-forces';
import { stirrupLegs } from '../../design-contract/directional-stirrups';
import { LENGTH_EPS, transverseSpacingForDemand } from '../../codes/cirsoc201/transverse-spacing';
import { lineFromMembers, membersFromLine } from '../design/beam-line';
import type { ProvidedReinforcement, StirrupDef } from '../../design-contract/reinforcement';
import { solve, solvePDelta, solve3D, solvePDelta3D } from '../wasm-solver';
import { computeStationDemands, setCompactStationTransfer } from '../verification-service';
import { generateColumnStack } from '../detailing/generate-column';
import { linePieces } from '../detailing/line-bars';
import { generateBeamBars, type BeamGenerationInput } from '../detailing/generate-beam';
import type { ColumnShape } from '../design/shaped-column';
import type { DesignAxes } from '../design/design-axes';

const section = { b: 0.2, h: 0.6, fc: 25, fy: 420, cover: 0.025, stirrupDia: 8 };
const bars = { count: 4, diameter: 16 };
const expectedPrimaryCapacity = (cage: StirrupDef, sec: Pick<typeof section, 'b' | 'h' | 'fc' | 'fy' | 'cover'> = section, edition: '2005' | '2025' = '2025') =>
  computeDirectionalShearCapacity('primary', cage.diameter, stirrupLegs(cage, 'primary'), cage.spacing,
    sec.b, sec.h - sec.cover - cage.diameter / 1000 - bars.diameter / 2000, sec.fc, sec.fy, 0,
    { h: sec.h, Ag: sec.b * sec.h, edition });

for (const example of [
  { edition: '2025', h: 0.3, diameter: 6, legs: 6, spacing: 0.1, phiVn: 162.47 },
  { edition: '2005', h: 0.6, diameter: 6, legs: 2, spacing: 0.05, phiVn: 270.17 },
  { edition: '2025', h: 0.6, diameter: 6, legs: 2, spacing: 0.05, phiVn: 271.57 },
  { edition: '2025', h: 0.6, diameter: 12, legs: 2, spacing: 0.05, phiVn: 345.49 },
] as const) {
  it(`known wrong result: #2171 primary capacity expectation agrees with hand arithmetic ${example.edition} ${example.h} ${example.diameter}`, () => {
    expect(expectedPrimaryCapacity(example, { ...section, h: example.h }, example.edition).phiVn).toBe(example.phiVn);
  });
}

for (const example of [
  { h: 0.3, diameter: 8, legs: 2, spacing: 0.1, phiVn: 115.10 },
  { h: 0.3, diameter: 8, legs: 2, spacing: 0.15, phiVn: 87.74 },
  { h: 0.6, diameter: 8, legs: 2, spacing: 0.05, phiVn: 347.98 },
]) {
  it(`primary capacity expectation retains nominal cage hand arithmetic ${example.h} ${example.spacing}`, () => {
    expect(expectedPrimaryCapacity(example, { ...section, h: example.h }).phiVn).toBe(example.phiVn);
  });
}
const axesFor = (axis: 'My' | 'Mz'): DesignAxes => ({ flexure: axis, shear: axis === 'My' ? 'Vz' : 'Vy',
  secondaryFlexure: axis === 'My' ? 'Mz' : 'My', secondaryShear: axis === 'My' ? 'Vy' : 'Vz',
  bFlex: section.b, hFlex: section.h, biaxial: false, sagCategory: `${axis}+`, hogCategory: `${axis}-`, basis: 'stress-proxy', secondaryRatio: 0 });
const provided = (kind: 'beam' | 'column' | 'wall', cage: StirrupDef): ProvidedReinforcement => kind === 'column'
  ? { longitudinal: bars, stirrups: cage }
  : { regions: { bottomSpan: bars, topStart: bars, topEnd: bars, stirrupsSpan: cage, stirrupsSupport: cage } };
function verify(kind: 'beam' | 'column' | 'wall', cage: StirrupDef, edition: '2005' | '2025', axis: 'My' | 'Mz', direction: 'primary' | 'secondary', shear: number, sec = section, reinforcement = provided(kind, cage), shape?: ColumnShape, torque = 0) {
  const axes = axesFor(axis);
  const loadAxis = direction === 'primary' ? axes.shear : axes.secondaryShear;
  return verifyProvidedReinforcement(1, kind, reinforcement, undefined, {}, sec,
    { elementId: 1, length: 4, stationTs: [0, 0.5, 1], comboResults: [{ comboId: 1, comboName: 'C1', stations: [0, 0.5, 1].map(t => ({
      t, x: t * 4, n: 0, my: 0, mz: 0, vy: loadAxis === 'Vy' ? shear : 0, vz: loadAxis === 'Vz' ? shear : 0, torsion: torque,
    })) }] }, undefined, { axes, shape, spacingRule: { edition, maxAggregateSizeMm: 0 } });
}
for (const edition of ['2005', '2025'] as const) for (const axis of ['My', 'Mz'] as const) {
  for (const kind of ['beam', 'wall'] as const) for (const primary of [2, 6]) for (const secondary of [5, 6]) for (const factor of [0.999, 1.001]) {
    it(`known wrong result: #2171 provided ${kind} zero-torque secondary strength ${edition} ${axis} ${primary}/${secondary} ${factor}`, () => {
      const cage = { diameter: 8, legs: primary, secondaryLegs: secondary, spacing: 0.05 };
      const cap = computeDirectionalShearCapacity('secondary', cage.diameter, stirrupLegs(cage, 'secondary'), cage.spacing,
        section.h, section.b - section.cover - 0.008 - 0.008, section.fc, section.fy, 0, { h: section.b, Ag: section.b * section.h, edition });
      const result = verify(kind, cage, edition, axis, 'secondary', cap.phiVn * factor);
      const rows = result.checks.filter(c => c.category.startsWith('Shear ') && c.demandCategory === axesFor(axis).secondaryShear);
      expect(rows).toHaveLength(2);
      for (const row of rows) {
        expect(row.capacity).toBe(cap.phiVn);
        expect(row.ratio).toBe(factor);
        expect(row.status === 'fail').toBe(factor > 1);
      }
      expect(result.checkedAxes).toContain(axesFor(axis).secondaryShear);
      expect(result.checks.some(c => c.category.startsWith('Torsion'))).toBe(false);
    });
  }
  for (const kind of ['column', 'beam', 'wall'] as const) for (const direction of ['primary', 'secondary'] as const) for (const legs of [2, 4, 5, 6]) {
    it(`known wrong result: #2171 provided ${kind} low-demand distribution ${edition} ${axis} ${direction} ${legs}`, () => {
      const sec = direction === 'primary' ? { ...section, b: section.h, h: section.b } : section;
      const cage = { diameter: 8, legs: direction === 'primary' ? legs : 6, secondaryLegs: direction === 'secondary' ? legs : 6, spacing: 0.05 };
      const result = verify(kind, cage, edition, axis, direction, 1, sec);
      const shearAxis = direction === 'primary' ? axesFor(axis).shear : axesFor(axis).secondaryShear;
      const strength = result.checks.filter(c => c.demandCategory === shearAxis && c.limiting === 'shear');
      expect(strength.length).toBeGreaterThan(0);
      for (const row of strength) expect(row.ratio).toBeLessThan(1);
      const distribution = result.checks.filter(c => c.category.includes(`(${shearAxis})`) && c.category.endsWith('s,max across'));
      expect(distribution.length > 0).toBe(edition === '2025' && legs < 5);
      if (edition === '2005') expect(result.checks.some(c => c.limiting === 'unsupportedCheck')).toBe(true);
      for (const row of distribution) expect(row.status).toBe('fail');
    });
  }
  for (const offset of [-2 * LENGTH_EPS, 0, 2 * LENGTH_EPS]) for (const direction of ['primary', 'secondary'] as const) {
    it(`known wrong result: #2171 provided column two-leg geometry boundary ${edition} ${axis} ${direction} ${offset}`, () => {
      const depth = section.b - section.cover - 0.008 - 0.008;
      const width = depth + 2 * section.cover + 0.008 + offset;
      const sec = direction === 'primary' ? { ...section, b: width, h: section.b } : { ...section, h: width };
      const result = verify('column', { diameter: 8, legs: 2, secondaryLegs: 2, spacing: 0.05 }, edition, axis, direction, 1, sec);
      const shearAxis = direction === 'primary' ? axesFor(axis).shear : axesFor(axis).secondaryShear;
      expect(result.checks.some(c => c.category === `Ties (${shearAxis}) s,max across`)).toBe(edition === '2025' && offset > 0);
      if (edition === '2005') expect(result.checks.some(c => c.limiting === 'unsupportedCheck')).toBe(true);
    });
  }
}

for (const swap of [false, true]) for (const spacing of [0.1, 0.15]) {
  it(`known wrong result: #2171 line end cages keep their own spacing and diameter ${swap} ${spacing}`, () => {
    const start = { diameter: 6, legs: 6, secondaryLegs: 6, spacing: 0.1 };
    const end = { diameter: 8, legs: 2, secondaryLegs: 6, spacing };
    const ends = swap ? [end, start] : [start, end];
    const members = [{ id: 1, L: 4, tStart: 0.25, tEnd: 0.25, faceStart: 0, faceEnd: 0 }];
    const line = { version: 1 as const, members: [1], lengths: [4], bars: [], stirrups: [
      { id: 'start', from: 0, to: 1, ...ends[0]! }, { id: 'span', from: 1, to: 3, ...start }, { id: 'end', from: 3, to: 4, ...ends[1]! },
    ] };
    const projected = membersFromLine(line, members).get(1)!;
    const r = { regions: { ...projected.regions, bottomSpan: bars, topStart: bars, topEnd: bars } };
    const sec = { ...section, h: 0.3 };
    const result = verify('beam', start, '2025', 'My', 'primary', 1, sec, r);
    const limit = transverseSpacingForDemand('2025', { Vu: 1, bw: sec.b, d: sec.h - sec.cover - end.diameter / 1000 - 0.008, fc: sec.fc, cover: sec.cover, stirrupDiaMm: end.diameter });
    const rows = result.checks.filter(c => c.category.includes('Support') && c.category.endsWith('s,max'));
    expect(rows.some(c => c.provided === spacing * 100 && c.status === 'fail')).toBe(spacing > limit.alongMax);
    const strengths = result.checks.filter(c => c.category.startsWith('Shear Support') && c.limiting === 'shear');
    expect(strengths).toHaveLength(2);
    for (const cage of ends) {
      const cap = expectedPrimaryCapacity(cage, sec);
      expect(strengths.some(c => c.capacity === cap.phiVn)).toBe(true);
    }
  });
}

for (const edition of ['2005', '2025'] as const) for (const shape of [
  { kind: 'circle', D: 0.4 }, { kind: 'tee', bf: 0.6, bw: 0.2, h: 0.6, hf: 0.2 }, { kind: 'L', b: 0.6, h: 0.6, tw: 0.2, tf: 0.2 },
] as const) for (const axis of ['My', 'Mz'] as const) for (const secondaryLegs of [2, 6]) for (const factor of [0.999, 1.001]) {
  it(`known wrong result: #2171 shaped column secondary strength ${edition} ${shape.kind} ${axis} ${secondaryLegs} ${factor}`, () => {
    const cage = { diameter: 8, legs: 6, secondaryLegs, spacing: 0.05 };
    const alongDepth = axesFor(axis).secondaryShear === 'Vz';
    const bw = shape.kind === 'circle' ? shape.D : shape.kind === 'tee' ? (alongDepth ? shape.bw : shape.hf) : (alongDepth ? shape.tw : shape.tf);
    const d = 0.8 * (shape.kind === 'circle' ? shape.D : alongDepth ? shape.h : shape.kind === 'tee' ? shape.bf : shape.b);
    const Ag = shape.kind === 'circle' ? Math.PI * shape.D ** 2 / 4 : shape.kind === 'tee' ? shape.bw * shape.h + (shape.bf - shape.bw) * shape.hf : shape.tw * shape.h + (shape.b - shape.tw) * shape.tf;
    const cap = computeDirectionalShearCapacity('secondary', cage.diameter, stirrupLegs(cage, 'secondary'), cage.spacing, bw, d, section.fc, section.fy, 0, { Ag, rhoW: 0, edition });
    const result = verify('column', cage, edition, axis, 'secondary', cap.phiVn * factor, section,
      { shaped: { count: 8, diameter: 16 }, stirrups: cage }, shape);
    const row = result.checks.find(c => c.category === `Ties (${axesFor(axis).secondaryShear})`)!;
    expect(row).toBeDefined();
    expect(row.capacity).toBe(cap.phiVn);
    expect(row.ratio).toBe(factor);
    expect(row.status === 'fail').toBe(factor > 1);
  });
}

afterEach(() => setCompactStationTransfer(true));
for (const edition of ['2005', '2025'] as const) for (const nonlinear of [false, true]) for (const compact of [false, true]) {
  (process.env.RUN_KNOWN_WRONG === '2198' ? it : it.skip)(`known wrong result: #2171 spatial solved provided cages ${edition} ${nonlinear} ${compact}`, () => {
    const model = {
      nodes: new Map([[1, { id: 1, x: 0, y: 0, z: 0 }], [2, { id: 2, x: 0.04, y: 0, z: 0 }]]),
      elements: new Map([[1, { id: 1, type: 'frame' as const, nodeI: 1, nodeJ: 2, sectionId: 1, materialId: 1 }]]),
      sections: new Map([[1, { id: 1, name: 'RC', ...section, a: section.b * section.h, iy: section.b * section.h ** 3 / 12, iz: section.h * section.b ** 3 / 12, j: 0.001 }]]),
      materials: new Map([[1, { id: 1, name: 'H25', fc: section.fc, fy: section.fy, e: 25000, nu: 0.2 }]]),
      supports: new Map([[1, { id: 1, nodeId: 1, type: 'fixed' as const }]]),
    };
    const solver = { ...model, elements: new Map([[1, { ...model.elements.get(1)!, releaseMyStart: false, releaseMyEnd: false, releaseMzStart: false, releaseMzEnd: false, releaseTStart: false, releaseTEnd: false }]]), supports: new Map([[1, { nodeId: 1, rx: true, ry: true, rz: true, rrx: true, rry: true, rrz: true }]]),
      loads: [{ type: 'nodal' as const, data: { nodeId: 2, fx: 0, fy: 1, fz: 0, mx: 0, my: 0, mz: 0 } }] };
    const raw = nonlinear ? solvePDelta3D(solver).results : solve3D(solver);
    setCompactStationTransfer(compact);
    const complete = computeStationDemands(new Map([[1, raw]]), [{ id: 1, name: 'C1', factors: [] }], model);
    for (const kind of ['beam', 'column', 'wall'] as const) for (const secondaryLegs of [2, 5]) for (const diameter of [6, 8, 12]) {
      const cage = { diameter, legs: 6, secondaryLegs, spacing: 0.05 };
      const result = verifyProvidedReinforcement(1, kind, provided(kind, cage), undefined, {}, section, complete.stations.get(1), undefined,
        { axes: axesFor('My'), spacingRule: { edition, maxAggregateSizeMm: 0 } });
      const rows = result.checks.filter(c => c.demandCategory === 'Vy' && c.limiting === 'shear');
      expect(rows.length).toBeGreaterThan(0);
      const depth = section.b - layerCentroid([{ ...bars, row: 0 }], section.cover, diameter);
      const expected = computeDirectionalShearCapacity('secondary', diameter, stirrupLegs(cage, 'secondary'), cage.spacing, section.h, depth, section.fc, section.fy, 0,
        { edition, Ag: section.b * section.h, h: kind === 'column' ? section.h : section.b, rhoW: kind === 'column' ? rebarGroupArea(bars) / 3 / (section.b * section.h * 1e4) : 0 });
      for (const row of rows) {
        expect(row.ratio).toBeLessThan(1);
        expect(row.capacity).toBe(expected.phiVn);
      }
      expect(result.checks.some(c => c.category.includes('(Vy)') && c.category.endsWith('s,max across'))).toBe(edition === '2025' && secondaryLegs < 5);
    }
  });
  it(`planar solved provided primary cage retains its answer ${edition} ${nonlinear} ${compact}`, () => {
    const input = {
      nodes: new Map([[1, { id: 1, x: 0, z: 0 }], [2, { id: 2, x: 0.04, z: 0 }]]),
      elements: new Map([[1, { id: 1, type: 'frame' as const, nodeI: 1, nodeJ: 2, sectionId: 1, materialId: 1, hingeStart: false, hingeEnd: false }]]),
      sections: new Map([[1, { id: 1, name: 'RC', ...section, a: section.b * section.h, iz: section.b * section.h ** 3 / 12 }]]),
      materials: new Map([[1, { id: 1, name: 'H25', fc: section.fc, fy: section.fy, e: 25000, nu: 0.2 }]]),
      supports: new Map([[1, { id: 1, nodeId: 1, type: 'fixed' as const }]]),
      loads: [{ type: 'nodal' as const, data: { nodeId: 2, fx: 0, fz: 1, my: 0 } }],
    };
    const raw = nonlinear ? solvePDelta(input).results : solve(input);
    const f = raw.elementForces[0]!;
    const stations = { elementId: 1, length: f.length, stationTs: [0, 1], comboResults: [{ comboId: 1, comboName: 'C1', stations: [0, 1].map(t => ({
      t, x: t * f.length, n: t ? f.nEnd : f.nStart, my: t ? f.mEnd : f.mStart, mz: 0, vy: 0, vz: t ? f.vEnd : f.vStart, torsion: 0,
    })) }] };
    for (const diameter of [6, 8, 12]) {
    const cage = { diameter, legs: 2, spacing: 0.05 };
    const result = verifyProvidedReinforcement(1, 'beam', provided('beam', cage), undefined, {}, section, stations, undefined,
      { axes: axesFor('My'), spacingRule: { edition, maxAggregateSizeMm: 0 } });
    const rows = result.checks.filter(c => c.demandCategory === 'Vz' && c.limiting === 'shear');
    expect(rows.length).toBeGreaterThan(0);
    const expected = expectedPrimaryCapacity(cage, section, edition);
    for (const row of rows) {
      expect(row.ratio).toBeLessThan(1);
      expect(row.capacity).toBe(expected.phiVn);
    }
    expect(result.checks.some(c => c.demandCategory === 'Vy')).toBe(false);
    }
  });
}

for (const secondaryLegs of [undefined, 2, 3, 6]) for (const source of ['regions', 'line'] as const) {
  it(`known wrong result: #2171 beam detailing refuses ungenerated horizontal crossties ${source} ${secondaryLegs}`, () => {
    const cage = { diameter: 8, legs: 2, secondaryLegs, spacing: 0.05 };
    const input: BeamGenerationInput = {
      elementId: 7, L: 6, b: 0.3, h: 0.6, d: 0.55, cover: 0.025, stirrupDia: 8,
      fc: 25, fy: 420, maxAggregateSizeMm: 20, edition: '2025',
      stations: [0, 3, 6].map(x => ({ x, mPos: 0, mNeg: 0, v: 1 })),
      supportI: 'continuous', supportJ: 'continuous', vn: 400, bottom: { count: 6, diameterMm: 20 },
      topStart: { count: 4, diameterMm: 16 }, topEnd: { count: 4, diameterMm: 16 }, lateralSystem: false, ld: d => 0.04 * d,
      origin: { x: 0, y: 0, z: 0 }, axis: { x: 1, y: 0, z: 0 }, up: { x: 0, y: 0, z: 1 },
      bentUp: { seismicDesign: 'notRequired', optOut: false, assumption: 'Zona sísmica 0' },
      ...(source === 'regions' ? { designedStirrups: { support: cage, span: cage, regionI: 1.5, regionJ: 1.5 } }
        : { lineStirrups: [{ from: 0, to: 6, ...cage }] }),
    };
    const generated = generateBeamBars(input);
    const refusals = generated.unsupported.filter((s: unknown) => typeof s === 'object' && s !== null && 'key' in s && s.key === 'detailing.generation.beamSecondaryLegs');
  if ((secondaryLegs ?? 2) > 2) {
    expect(refusals.length).toBeGreaterThan(0);
    for (const refusal of refusals) expect(refusal).toEqual({ key: 'detailing.generation.beamSecondaryLegs', params: { legs: secondaryLegs } });
  } else expect(refusals).toEqual([]);
    expect(generated.stirrupZones.length).toBeGreaterThan(0);
  });
}

it('known wrong result: #2171 line detailing transfer and round trip retain both end cages', () => {
  const members = [{ id: 1, L: 4, tStart: 0.25, tEnd: 0.25, faceStart: 0, faceEnd: 0 }];
  const start = { diameter: 6, legs: 6, secondaryLegs: 3, spacing: 0.1 };
  const end = { diameter: 8, legs: 2, secondaryLegs: 6, spacing: 0.15 };
  const line = { version: 1 as const, members: [1], lengths: [4], bars: [], stirrups: [
    { id: 'start', from: 0, to: 1, ...start }, { id: 'end', from: 1, to: 4, ...end },
  ] };
  const r = membersFromLine(line, members).get(1)!;
  const restored = lineFromMembers([{ ...members[0]!, reinforcement: r }]);
  expect(restored.stirrups[0]).toMatchObject(start);
  expect(restored.stirrups.at(-1)).toMatchObject(end);
  const pieces = linePieces(line, [true]).get(1)!;
  expect(pieces.stirrups[0]).toMatchObject(start);
  expect(pieces.stirrups.at(-1)).toMatchObject(end);
});

for (const secondaryLegs of [undefined, 2, 3, 6]) it(`known wrong result: #2171 column detailing refuses an unverified secondary cage ${secondaryLegs}`, () => {
  const generated = generateColumnStack({ stackId: 'C-B2', lifts: [{ elementId: 100, baseZ: 0, topZ: 3, b: 0.4, h: 0.4,
    centre: { x: 0, y: 0 }, bars: { count: 8, diameterMm: 20 }, tieDia: 8, cover: 0.025, secondaryLegs }],
    fc: 25, fy: 420, maxAggregateSizeMm: 20, edition: '2025', lapSplice: d => 0.05 * d,
    beamDepthAtTop: new Map([[0, 0.6]]), roofTermination: false });
  const refusals = generated.unsupported.filter((s: unknown) => typeof s === 'object' && s !== null && 'key' in s && s.key === 'detailing.generation.columnSecondaryLegs');
  if ((secondaryLegs ?? 2) > 2) {
    expect(refusals.length).toBeGreaterThan(0);
    for (const refusal of refusals) expect(refusal).toEqual({ key: 'detailing.generation.columnSecondaryLegs', params: { legs: secondaryLegs, element: 100 } });
  } else expect(refusals).toEqual([]);
  expect(generated.bars.length).toBeGreaterThan(0);
});

for (const swap of [false, true]) it(`known wrong result: #2171 each support torsion check retains the declared longitudinal geometry ${swap}`, () => {
  const start = { diameter: 6, legs: 2, secondaryLegs: 6, spacing: 0.1 };
  const end = { diameter: 8, legs: 6, secondaryLegs: 6, spacing: 0.15 };
  const cages = swap ? [end, start] : [start, end];
  const sec = { ...section, b: 0.3, h: 0.6 };
  const reinforcement = { regions: { ...provided('beam', start).regions, stirrupsStart: cages[0], stirrupsEnd: cages[1] } };
  const actual = verify('beam', start, '2025', 'My', 'primary', 220.235, sec, reinforcement, undefined, 30);
  for (const [index, side] of ['Start', 'End'].entries()) {
    const cage = cages[index]!;
    const isolated = verify('beam', cage, '2025', 'My', 'primary', 220.235, sec, provided('beam', cage), undefined, 30);
    const row = actual.checks.find(c => c.category === `Torsion Support ${side} (Vz)`);
    const expected = isolated.checks.find(c => c.category === 'Torsion Support (Vz)');
    expect(row).toBeDefined();
    expect(expected).toBeDefined();
    expect(row!.ratio).toBe(expected!.ratio);
    expect(row!.status).toBe(expected!.status);
  }
});
