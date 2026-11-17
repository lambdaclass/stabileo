import { expect, it } from 'vitest';
import { membersFromLine } from '../design/beam-line';
import { declaredTestDemands } from './helpers/declared-demands';
import { prepareElementVerification, REBAR_DB, verifyElement } from '../codes/argentina/cirsoc201';
import { verifyConcurrentElement } from '../concurrent-verification';
import { evaluateBeamSection } from '../codes/argentina/cirsoc201-beam-kernel';
import { seatedLongitudinalHalfExtents } from '../../codes/cirsoc201/transverse-cage';
import { layerCentroid, verifyProvidedReinforcement } from '../station-design-forces';

const square = { b: 0.6, h: 0.6, cover: 0.025, stirrupDia: 6, fc: 25, fy: 420 };
const barDia = 20;
const barArea = REBAR_DB.find(bar => bar.diameter === barDia)!.area * 1e-4;
const tieArea = 2 * REBAR_DB.find(bar => bar.diameter === square.stirrupDia)!.area * 1e-4;
const seat = seatedLongitudinalHalfExtents(square.b, square.h, square.cover, square.stirrupDia, barDia);
const depth = square.h / 2 + (seat.corner.halfUp + seat.face.halfUp) / 2;
const fixed = { column: { barCount: 12, barDia }, shear: { spacing: 0.275, legs: 2, secondaryLegs: 2 } };
const capacity = evaluateCapacity(fixed.shear.spacing);

function evaluateCapacity(spacing: number) {
  return () => evaluateBeamSection({
    edition: '2025', fc: square.fc * 1e6, fy: square.fy * 1e6,
    b: square.b, h: square.h, d: depth, As: 4 * barArea,
    Av: tieArea, s: spacing, Ag: square.b * square.h, NuCompression: 0,
  })!;
}

function forces(t: number, vu: number) {
  return { t, x: t * 4, n: 0, my: 0, mz: 0, vy: vu, vz: vu, torsion: 0 };
}

for (const axis of ['My', 'Mz'] as const) {
  it(`known wrong result: #2198 symmetric fixed column has the same actual concrete shear capacity in both directions ${axis}`, () => {
    const cap = capacity();
    expect(cap.shearValid).toBe(true);
    expect(cap.avBelowMin).toBe(true);
    const half = 0.75 * cap.Vc / 2000;
    for (const Vu of [1, half * (1 - 1e-6), half, half * (1 + 1e-6)]) {
      const inputs = declaredTestDemands([0, 1].map(t => ({
        comboId: 1, comboName: 'symmetric column', forces: forces(t, Vu),
      }))).map(d => ({ ...square, elementId: 1, elementType: 'column' as const, demand: d.section(axis) }));
      for (const result of [
        verifyElement(inputs[0]!, fixed),
        prepareElementVerification(inputs[0]!)(fixed),
        verifyConcurrentElement(inputs, fixed),
      ]) {
        expect(result.shearSecondary!.phiVc).toBe(result.shear.phiVc);
        for (const row of [result.shear, result.shearSecondary!]) {
          expect(row.d).toBeCloseTo(depth, 12);
          expect(row.phiVc).toBeCloseTo(0.75 * cap.Vc / 1000, 10);
          expect(row.phiVn).toBeCloseTo(cap.phiVn / 1000, 10);
          expect(row.status).toBe(Vu <= half ? 'ok' : 'fail');
          expect(row.steps.some(step => typeof step === 'string' && step.startsWith('Av/s,req'))).toBe(Vu > half);
        }
      }
    }
  });
}

it('known wrong result: #2198 the station verifier uses the same column bar centres and unrounded capacity', () => {
  const spacing = 0.1;
  const cap = evaluateCapacity(spacing)();
  const result = (vu: number) => verifyProvidedReinforcement(1, 'column', {
    longitudinal: { count: 12, diameter: barDia },
    stirrups: { ...fixed.shear, diameter: square.stirrupDia, spacing },
  }, undefined, {}, { ...square, stirrupDia: 8 }, {
    elementId: 1, length: 4, stationTs: [0, 1],
    comboResults: [{ comboId: 1, comboName: 'both', stations: [0, 1].map(t => forces(t, vu)) }],
  });
  expect(cap.avBelowMin).toBe(false);
  for (const factor of [1 - 2e-6, 1 + 2e-6]) {
    for (const axis of ['Vy', 'Vz']) {
      const row = result(cap.phiVn / 1000 * factor).checks.find(check => check.category === `Ties (${axis})`)!;
      expect(row.capacity).toBe(Number((cap.phiVn / 1000).toFixed(2)));
      expect(row.status).toBe(factor > 1 ? 'fail' : 'warn');
    }
  }
});

for (const gap of [false, true]) {
  it(`known wrong result: #2198 beam-line stirrup projection holds an unverified interval gap=${gap}`, () => {
    const member = { id: 1, L: 4, tStart: 0.25, tEnd: 0.25, faceStart: 0, faceEnd: 0 };
    const cage = { diameter: 8, legs: 2, secondaryLegs: 4, spacing: 0.1 };
    const project = (second?: { from: number; to: number; secondaryLegs: number }) => membersFromLine({
      version: 1, members: [1], lengths: [4], bars: [],
      stirrups: [
        { id: 'start', from: 0, to: 0.8, ...cage },
        ...(second ? [{ id: 'second', ...cage, ...second }] : []),
        { id: 'rest', from: 1, to: 4, ...cage },
      ],
    }, [member]).get(1)!;
    const verify = (provided: ReturnType<typeof project>) => verifyProvidedReinforcement(1, 'beam', provided, undefined, {}, square, {
      elementId: 1, length: 4, stationTs: [0, 1],
      comboResults: [{ comboId: 1, comboName: 'zero', stations: [0, 1].map(t => forces(t, 0)) }],
    });
    const invalid = project(gap ? undefined : { from: 0.8, to: 1, secondaryLegs: 2 });
    expect(verify(invalid).checks).toContainEqual(expect.objectContaining({ limiting: 'unsupportedCheck', status: 'fail' }));
    expect(verify(project({ from: 0.8, to: 1, secondaryLegs: 4 })).checks.some(row => row.limiting === 'unsupportedCheck')).toBe(false);
  });
}

it('uses the adjoining cage at a zero-length support region', () => {
  const cage = { diameter: 8, legs: 2, secondaryLegs: 4, spacing: 0.1 };
  const line = { version: 1 as const, members: [1], lengths: [4], bars: [], stirrups: [
    { ...cage, id: 'span', from: 0, to: 3 },
    { ...cage, id: 'end', from: 3, to: 4, secondaryLegs: 6 },
  ] };
  const member = { id: 1, L: 4, tStart: 0, tEnd: 0.25, faceStart: 0, faceEnd: 0 };
  const regions = membersFromLine(line, [member]).get(1)!.regions!;
  expect(regions.stirrupCoverageIncomplete).toBeUndefined();
  expect(regions.stirrupsStart).toEqual(cage);
  expect(regions.stirrupsEnd).toEqual({ ...cage, secondaryLegs: 6 });
});

it('known wrong result: #2198 an unsafe secondary beam check cannot pass by rounding resistance up', () => {
  const properties = { b: 0.4, h: 0.5, fc: 25, fy: 420, cover: 0.025, stirrupDia: 8 };
  const stirrups = { diameter: 8, legs: 2, secondaryLegs: 2, spacing: 0.1 };
  const bottom = { count: 4, diameter: 16 };
  const resistance = (section: typeof properties) => evaluateBeamSection({
    edition: '2025', b: section.h, h: section.b,
    d: section.b / 2 + seatedLongitudinalHalfExtents(section.b, section.h, section.cover, stirrups.diameter, bottom.diameter).corner.halfAcross,
    fc: section.fc * 1e6, fy: section.fy * 1e6, As: 0,
    Av: 2 * REBAR_DB.find(bar => bar.diameter === stirrups.diameter)!.area * 1e-4,
    s: stirrups.spacing, Ag: section.b * section.h, NuCompression: 0,
  })!;
  const candidates = Array.from({ length: 20 }, (_, i) => ({ ...properties, b: properties.b + i * 0.0007 }));
  const section = candidates.find(sec => {
    const raw = resistance(sec).phiVn / 1000;
    return Number(raw.toFixed(2)) > raw * (1 + 2e-6);
  })!;
  expect(section).toBeDefined();
  const cap = resistance(section);
  const capacity = cap.phiVn / 1000;
  expect(cap.shearValid).toBe(true);
  expect(Number(capacity.toFixed(2))).toBeGreaterThan(capacity * (1 + 2e-6));
  for (const factor of [1 - 2e-6, 1 + 2e-6]) {
    const result = verifyProvidedReinforcement(1, 'beam', { bottom, stirrups }, undefined, {}, section, {
      elementId: 1, length: 4, stationTs: [0, 1],
      comboResults: [{ comboId: 1, comboName: 'secondary', stations: [0, 1].map(t => ({
        ...forces(t, 0), my: 1, vy: capacity * factor,
      })) }],
    }, undefined, { axes: {
      flexure: 'My', shear: 'Vz', secondaryFlexure: 'Mz', secondaryShear: 'Vy',
      bFlex: section.b, hFlex: section.h, biaxial: false, secondaryRatio: 0,
      sagCategory: 'My+', hogCategory: 'My-', basis: 'dominant-moment',
    } });
    const rows = result.checks.filter(row => /^Shear (Support|Span) \(Vy\)$/.test(row.category));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.capacity).toBe(Number(capacity.toFixed(2)));
    expect(rows[0]!.status).toBe(factor > 1 ? 'fail' : 'warn');
  }
});

it('known wrong result: #2198 hogging shear uses the actual top rows at the support', () => {
  const section = { b: 0.4, h: 0.5, fc: 25, fy: 420, cover: 0.025, stirrupDia: 10 };
  const stirrups = { diameter: 8, legs: 4, secondaryLegs: 2, spacing: 0.175 };
  const bottom = { count: 4, diameter: 16 };
  const top = [{ row: 0, count: 3, diameter: 20 }, { row: 1, count: 3, diameter: 20 }];
  const spanLength = 4;
  const av = stirrups.legs * REBAR_DB.find(r => r.diameter === stirrups.diameter)!.area * 1e-4;
  for (const sign of [-1, 1] as const) {
    const layers = sign < 0 ? top : [{ ...bottom, row: 0 }];
    const d = section.h - layerCentroid(layers, section.cover, stirrups.diameter);
    const area = layers.reduce((sum, layer) => sum + layer.count * REBAR_DB.find(r => r.diameter === layer.diameter)!.area, 0);
    const cap = evaluateBeamSection({
      edition: '2025', b: section.b, h: section.h, d, As: area * 1e-4, Av: av, s: stirrups.spacing,
      fc: section.fc * 1e6, fy: section.fy * 1e6, Ag: section.b * section.h, NuCompression: 0,
    })!;
    for (const at of [0, 1]) {
      const result = verifyProvidedReinforcement(1, 'beam', {
        bottom, stirrups, regions: { topStartLayers: top, topEndLayers: top },
      }, undefined, {}, section, {
        elementId: 1, length: spanLength, stationTs: [0, 1], comboResults: [{
          comboId: 1, comboName: 'support shear', stations: [0, 1].map(t => ({
            ...forces(t, 0), my: sign * 20, vz: t === at ? cap.phiVn / 1000 + 0.03 : 0,
          })),
        }],
      }, undefined, { axes: {
        flexure: 'My', shear: 'Vz', secondaryFlexure: 'Mz', secondaryShear: 'Vy',
        bFlex: section.b, hFlex: section.h, biaxial: false, secondaryRatio: 0,
        sagCategory: 'My+', hogCategory: 'My-', basis: 'dominant-moment',
      } });
      const row = result.checks.find(check => check.category === 'Shear Support (Vz)')!;
      expect(row.capacity).toBe(Number((cap.phiVn / 1000).toFixed(2)));
      expect(row.status).toBe('fail');
      expect(row.stationX).toBe(at * spanLength);
    }
  }
});
