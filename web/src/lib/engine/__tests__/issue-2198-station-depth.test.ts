import { expect, it } from 'vitest';
import { seatedLongitudinalHalfExtents } from '../../codes/cirsoc201/transverse-cage';
import { checkTorsion2025 } from '../../codes/cirsoc201/torsion';
import { cirsoc201Adapter } from '../design/adapters/cirsoc201-adapter';
import { syntheticBeamContext } from '../design/__tests__/helpers';
import { computeShearCapacity, layerCentroid, verifyProvidedReinforcement } from '../station-design-forces';
import { computeStationDemands } from '../verification-service';
import { extractBeamStations, solve, solve3D, solvePDelta, solvePDelta3D } from '../wasm-solver';
import type { ProvidedReinforcement } from '../../design-contract/reinforcement';
import type { StationForces } from '../station-design-forces';
import { declaredTestDemands } from './helpers/declared-demands';

const section = { b: 0.4, h: 0.6, fc: 25, fy: 420, cover: 0.025, stirrupDia: 6 };
const length = 8;
const outer = [{ count: 4, diameter: 16, row: 0 }];
const inner = [{ count: 2, diameter: 16, row: 0 }, { count: 2, diameter: 16, row: 1 }];
const cage = { diameter: 6, legs: 4, secondaryLegs: 3, spacing: 0.165 };
const unequalEnds = { stirrups: cage, regions: { bottomSpanLayers: outer, topStartLayers: outer, topEndLayers: inner } };
const dStart = section.h - layerCentroid(outer, section.cover, cage.diameter);
const dEnd = section.h - layerCentroid(inner, section.cover, cage.diameter);
const dSide = section.b / 2 + seatedLongitudinalHalfExtents(section.b, section.h, section.cover, cage.diameter, 16).corner.halfAcross;

function context(axis: 'My' | 'Mz', edition: '2005' | '2025') {
  const ctx = syntheticBeamContext({ codeEdition: edition, modelData: undefined });
  ctx.section = { ...ctx.section, ...section };
  ctx.material = { ...ctx.material, ...section, maxAggregateSize: { value: 19, origin: 'project', refs: [] } };
  ctx.axes = { ...ctx.axes, bFlex: section.b, hFlex: section.h, ...(axis === 'Mz' ? {
    flexure: 'Mz', shear: 'Vy', secondaryFlexure: 'My', secondaryShear: 'Vz', sagCategory: 'Mz+', hogCategory: 'Mz-',
  } : {}) };
  return ctx;
}

function station(axis: 'My' | 'Mz', t: number, moment: number, primary: number, secondary: number, torsion: number): StationForces {
  return { t, x: t * length, n: 0, my: axis === 'My' ? moment : 0, mz: axis === 'Mz' ? moment : 0,
    vy: axis === 'My' ? secondary : primary, vz: axis === 'Mz' ? secondary : primary, torsion };
}

function verify(ctx: ReturnType<typeof context>, rebar: ProvidedReinforcement, entry: 'direct' | 'adapter', ...stations: StationForces[]) {
  ctx.stations = { elementId: 1, length, stationTs: stations.map(s => s.t), comboResults: [{ comboId: 1, comboName: 'C1', stations }] };
  return entry === 'adapter' ? cirsoc201Adapter.verify(ctx, rebar)
    : verifyProvidedReinforcement(1, 'beam', rebar, undefined, {}, section, ctx.stations, undefined,
      { axes: ctx.axes, spacingRule: { edition: ctx.codeEdition ?? '2025', maxAggregateSizeMm: 19 } });
}

function strength(depth: number, direction: 'primary' | 'secondary', edition: '2005' | '2025', spacing = cage.spacing) {
  const primary = direction === 'primary';
  const [width, height, legs] = primary ? [section.b, section.h, cage.legs] : [section.h, section.b, cage.secondaryLegs];
  const as = (primary ? 4 : 2) * 2.011;
  return computeShearCapacity(cage.diameter, legs, spacing, width, depth, section.fc, section.fy, 0,
    { Ag: section.b * section.h, rhoW: as / (width * depth * 1e4), h: height, edition });
}

function torsionAt(axis: 'My' | 'Mz', f: StationForces, depth: number, spacing = cage.spacing) {
  return checkTorsion2025({ ...section, d: depth, dSecondary: dSide, stirrupDiaMm: cage.diameter, fyt: section.fy,
    stirrup: { ...cage, spacing },
    demand: declaredTestDemands([{ comboId: 1, comboName: 'C1', forces: f }])[0]!.section(axis),
  });
}

for (const axis of ['My', 'Mz'] as const) for (const entry of ['direct', 'adapter'] as const) {
  for (const edition of ['2005', '2025'] as const) {
    for (const t of [0.5, 0.5001, 0.7]) {
      it(`known wrong result: #2198 span hogging depth follows its end ${axis} ${entry} ${edition} t=${t}`, () => {
        const ctx = context(axis, edition);
        const depth = t <= 0.5 ? dStart : dEnd;
        const cap = strength(depth, 'primary', edition);
        for (const factor of [0.999, 1.001]) {
          const f = station(axis, t, -60, cap.phiVnUnrounded * factor, 0, 10);
          const result = verify(ctx, unequalEnds, entry, f);
          const shear = result.checks.find(c => c.category === `Shear Span (${ctx.axes.shear})`)!;
          expect(shear.stationX).toBe(f.x);
          expect.soft(shear.capacity).toBe(cap.phiVn);
          expect(shear.status === 'fail').toBe(factor > 1);
          const expected = torsionAt(axis, f, depth);
          const interaction = result.checks.find(c => c.category === `Torsion Span (${ctx.axes.shear})`)!;
          expect(interaction.ratio).toBe(+expected.ratio.toFixed(3));
          const longitudinal = result.checks.find(c => c.category === `Torsion Al Span (${ctx.axes.shear})`)!;
          const asFlex = 60 / (0.9 * section.fy * 1000 * 0.9 * depth);
          expect(longitudinal.required).toBe(+((asFlex + Math.max(expected.Al, expected.AlMin) / 2) * 1e4).toFixed(2));
        }
      });
    }

    for (const spacing of [0.165, edition === '2005' ? 0.185 : 0.175]) {
      it(`known wrong result: #2198 seated side depth in shear ${axis} ${entry} ${edition} spacing=${spacing}`, () => {
        const ctx = context(axis, edition);
        const rebar = { bottom: outer[0], top: outer[0], stirrups: { ...cage, spacing } };
        const cap = strength(dSide, 'secondary', edition, spacing);
        expect(cap.avBelowMin).toBe(spacing > 0.165);
        for (const factor of [0.999, 1.001]) {
          const forces = [0, 0.5, 1].map(t => station(axis, t, 20, 0, cap.phiVnUnrounded * factor, 0));
          const result = verify(ctx, rebar, entry, ...forces);
          const rows = result.checks.filter(c => c.limiting === 'shear' && c.demandCategory === ctx.axes.secondaryShear);
          expect(rows.map(row => row.capacity)).toEqual([cap.phiVn, cap.phiVn]);
          expect(rows.every(row => row.status === 'fail')).toBe(factor > 1);
        }
      });
    }
  }

  for (const spacing of [0.165, 0.175]) {
    it(`known wrong result: #2198 seated side depth in combined torsion ${axis} ${entry} spacing=${spacing}`, () => {
      const ctx = context(axis, '2025');
      const rebar = { bottom: outer[0], top: outer[0], stirrups: { ...cage, spacing } };
      const torque = 10;
      const trial = torsionAt(axis, station(axis, 0.7, 20, 0, 0, torque), dStart, spacing);
      const shearLimit = 0.75 * (0.17 * Math.sqrt(section.fc) * section.h * dSide * 1000
        + (trial.transverseSecondaryProvided - 2 * trial.AtOverS) * section.fy * 1000 * dSide);
      for (const factor of [0.999, 1.001]) {
        const f = station(axis, 0.7, 20, 0, shearLimit * (spacing === 0.165 ? factor : factor + 0.06), torque);
        const expected = torsionAt(axis, f, dStart, spacing);
        if (spacing === 0.165) expect(expected.ratio > 1).toBe(factor > 1);
        const result = verify(ctx, rebar, entry, f);
        const row = result.checks.find(c => c.category === `Torsion Span (${ctx.axes.shear})`)!;
        expect(row.ratio).toBe(+expected.ratio.toFixed(3));
        expect(row.status === 'fail').toBe(expected.ratio > 1);
      }
    });
  }
}

for (const nonlinear of [false, true]) for (const spatial of [false, true]) {
  it(`known wrong result: #2198 solved span geometry nonlinear=${nonlinear} spatial=${spatial}`, () => {
    const frame = { id: 1, type: 'frame' as const, nodeI: 1, nodeJ: 2, sectionId: 1, materialId: 1 };
    const model = {
      nodes: new Map([[1, { id: 1, x: 0, y: 0, z: 0 }], [2, { id: 2, x: length, y: 0, z: 0 }]]),
      elements: new Map([[1, frame]]),
      sections: new Map([[1, { id: 1, name: 'RC', ...section, a: section.b * section.h, iy: section.b * section.h ** 3 / 12,
        iz: section.b * section.h ** 3 / 12, j: 0.001 }]]),
      materials: new Map([[1, { id: 1, name: 'H25', fc: section.fc, fy: section.fy, e: 25000, nu: 0.2 }]]),
      supports: new Map([[1, { id: 1, nodeId: 1, type: 'fixed' as const }]]),
    };
    const load = { nodeId: 2, fx: 0, fz: 10, my: 100 };
    const planar = { ...model, nodes: new Map([[1, { id: 1, x: 0, z: 0 }], [2, { id: 2, x: length, z: 0 }]]),
      elements: new Map([[1, { ...frame, hingeStart: false, hingeEnd: false }]]),
      loads: [{ type: 'nodal' as const, data: load }] };
    const space = { ...model, elements: new Map([[1, { ...frame, releaseMyStart: false, releaseMyEnd: false,
      releaseMzStart: false, releaseMzEnd: false, releaseTStart: false, releaseTEnd: false }]]),
      supports: new Map([[1, { nodeId: 1, rx: true, ry: true, rz: true, rrx: true, rry: true, rrz: true }]]),
      loads: [{ type: 'nodal' as const, data: { ...load, fy: 60, mx: 10, mz: 0 } }] };
    const ctx = context('My', '2025');
    if (spatial) {
      const raw = nonlinear ? solvePDelta3D(space).results : solve3D(space);
      ctx.stations = computeStationDemands(new Map([[1, raw]]), [{ id: 1, name: 'C1', factors: [] }], model).stations.get(1)!;
    } else {
      const raw = nonlinear ? solvePDelta(planar).results : solve(planar);
      const planarStations = extractBeamStations({ members: [{ elementId: 1, sectionId: 1, materialId: 1, length }],
        combinations: [{ comboId: 1, comboName: 'C1', results: raw }], numStations: 11 }).stations;
      const stations = planarStations.map(({ t, stationX: x, comboForces: [{ n, m, v }] }) => ({
        t, x, n, my: m, vz: v, mz: 0, vy: 0, torsion: 0,
      }));
      ctx.stations = { elementId: 1, length, stationTs: stations.map(f => f.t), comboResults: [{ comboId: 1, comboName: 'C1', stations }] };
    }
    const span = ctx.stations.comboResults[0]!.stations.filter(f => f.t > 0.25 && f.t < 0.75);
    expect(span.some(f => f.t > 0.5)).toBe(true);
    expect(span.every(f => f.my < 0)).toBe(true);
    const result = cirsoc201Adapter.verify(ctx, unequalEnds);
    const shear = result.checks.find(c => c.category === 'Shear Span (Vz)')!;
    expect(shear.capacity).toBe(strength(dEnd, 'primary', '2025').phiVn);
    expect(shear.stationX).toBeGreaterThan(length / 2);
    const lateral = result.checks.find(c => c.category === 'Shear Span (Vy)');
    if (spatial) {
      expect(lateral!.capacity).toBe(strength(dSide, 'secondary', '2025').phiVn);
      const expected = Math.max(...span.map(f => torsionAt('My', f, f.t <= 0.5 ? dStart : dEnd).ratio));
      expect(result.checks.find(c => c.category === 'Torsion Span (Vz)')!.ratio).toBe(+expected.toFixed(3));
    } else {
      expect(lateral).toBeUndefined();
      expect(result.checks.some(c => c.limiting === 'torsion')).toBe(false);
    }
  });
}
