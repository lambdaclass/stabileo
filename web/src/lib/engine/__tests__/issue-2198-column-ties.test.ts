import { concreteCheckRows } from '../design/check-rows';
import { expect, it } from 'vitest';
import { computeDirectionalShearCapacity, verifyProvidedReinforcement } from '../station-design-forces';
import { stirrupLegs } from '../../design-contract/directional-stirrups';
import { syntheticBeamContext } from '../design/__tests__/helpers';
import { cirsoc201Adapter2005, cirsoc201Adapter2025 } from '../design/adapters/cirsoc201-adapter';
import { evaluateBeamSection } from '../codes/argentina/cirsoc201-beam-kernel';
import { columnTieSpacing } from '../../codes/cirsoc201/transverse-spacing';

const regression = it;
const sec = { b: 0.3, h: 0.3, cover: 0.025, stirrupDia: 8, fc: 25, fy: 420 };
const bars = { count: 8, diameter: 16 };

for (const edition of ['2005', '2025'] as const) for (const axis of ['My', 'Mz'] as const)
  for (const direction of ['primary', 'secondary'] as const) for (const diameter of [6, 8, 12])
    for (const entry of ['direct', 'adapter'] as const) {
      regression(`known wrong result: #2198 column actual cage capacity ${edition} ${axis} ${direction} ${diameter} ${entry}`, () => {
        const ctx = syntheticBeamContext({ elementType: 'column', codeEdition: edition });
        ctx.section = { ...ctx.section, ...sec };
        ctx.material = { ...ctx.material, ...sec, maxAggregateSize: { value: 0, origin: 'project', refs: [] } };
        ctx.axes = { ...ctx.axes, bFlex: sec.b, hFlex: sec.h, flexure: axis, shear: axis === 'My' ? 'Vz' : 'Vy',
          secondaryFlexure: axis === 'My' ? 'Mz' : 'My', secondaryShear: axis === 'My' ? 'Vy' : 'Vz' };
        const loadAxis = direction === 'primary' ? ctx.axes.shear : ctx.axes.secondaryShear;
        const cage = { diameter, legs: 2, secondaryLegs: 2, spacing: 0.1 };
        const d = sec.h - sec.cover - diameter / 1000 - bars.diameter / 2000;
        const cap = computeDirectionalShearCapacity(direction, diameter, stirrupLegs(cage, direction), cage.spacing,
          sec.b, d, sec.fc, sec.fy, 0, { edition, Ag: sec.b * sec.h, h: sec.h, rhoW: bars.count * Math.PI * (bars.diameter / 10) ** 2 / 4 / 3 / (sec.b * sec.h * 1e4) });
        for (const factor of [0.999, 1.001]) {
          ctx.stations = { elementId: 1, length: 4, stationTs: [0, 1], comboResults: [{ comboId: 1, comboName: 'C1',
            stations: [0, 1].map(t => ({ t, x: 4 * t, n: 0, my: 0, mz: 0, vy: loadAxis === 'Vy' ? cap.phiVn * factor : 0, vz: loadAxis === 'Vz' ? cap.phiVn * factor : 0, torsion: 0 })) }] };
          const rebar = { longitudinal: bars, stirrups: cage };
          const result = entry === 'adapter' ? (edition === '2005' ? cirsoc201Adapter2005 : cirsoc201Adapter2025).verify(ctx, rebar)
            : verifyProvidedReinforcement(1, 'column', rebar, undefined, {}, sec, ctx.stations, undefined, { axes: ctx.axes, spacingRule: { edition, maxAggregateSizeMm: 0 } });
          const row = result.checks.find(c => c.category === `Ties (${loadAxis})`)!;
          expect(row.capacity).toBe(cap.phiVn);
          expect(row.status === 'fail').toBe(factor > 1);
        }
      });
    }

for (const direction of ['primary', 'secondary'] as const) for (const factor of [0.999, 1, 1.001]) {
  regression(`known wrong result: #2198 ordinary column ties below shear requirement ${direction} ${factor}`, () => {
    const diameter = 8;
    const d = sec.h - sec.cover - diameter / 1000 - bars.diameter / 2000;
    const raw = evaluateBeamSection({ edition: '2025', fc: sec.fc * 1e6, fy: sec.fy * 1e6, b: sec.b, h: sec.h, d,
      As: 0, Av: 2 * 0.503 * 1e-4, s: 0.2, fyt: sec.fy * 1e6, Ag: sec.b * sec.h, NuCompression: 0 })!;
    const threshold = 0.5 * 0.75 * raw.Vc / 1000;
    const cage = { diameter, legs: 2, secondaryLegs: 2, spacing: 0.2 };
    const shear = direction === 'primary' ? 'vz' : 'vy';
    const stations = { elementId: 1, length: 4, stationTs: [0, 1], comboResults: [{ comboId: 1, comboName: 'C1',
      stations: [0, 1].map(t => ({ t, x: 4 * t, n: 0, my: 0, mz: 0, vy: 0, vz: 0, torsion: 0, [shear]: threshold * factor })) }] };
    const r = verifyProvidedReinforcement(1, 'column', { longitudinal: bars, stirrups: cage }, undefined, {}, sec, stations, undefined, { spacingRule: { edition: '2025', maxAggregateSizeMm: 0 } });
    const failures = r.checks.filter(c => c.limiting === 'tieSpacing' && c.status === 'fail');
    expect(failures.length > 0).toBe(factor > 1);
    expect(r.checks.some(c => c.category.endsWith('s,max across'))).toBe(false);
    if (factor <= 1) expect(r.overallStatus).not.toBe('fail');
    else {
      expect(failures.every(c => c.description.includes('10.7.6.5.2'))).toBe(true);
      expect(concreteCheckRows(r).filter(c => c.title.endsWith('s,max')).every(c => c.clause === '10.7.6.5.2')).toBe(true);
    }
  });
}

for (const factor of [0.999, 1, 1.001]) {
  regression(`known wrong result: #2198 ordinary column tie spacing boundary ${factor}`, () => {
    const cage = { diameter: 8, legs: 2, secondaryLegs: 2, spacing: columnTieSpacing('2025', bars.diameter, 8, sec.b).spacing * factor };
    const stations = { elementId: 1, length: 4, stationTs: [0, 1], comboResults: [{ comboId: 1, comboName: 'C1',
      stations: [0, 1].map(t => ({ t, x: 4 * t, n: 0, my: 0, mz: 0, vy: 1, vz: 1, torsion: 0 })) }] };
    const r = verifyProvidedReinforcement(1, 'column', { longitudinal: bars, stirrups: cage }, undefined, {}, sec, stations);
    const failures = r.checks.filter(c => c.limiting === 'tieSpacing' && c.status === 'fail');
    expect(failures.length > 0).toBe(factor > 1);
    if (factor > 1) expect(failures.map(c => c.category)).toEqual(['Tie spacing']);
  });
}

for (const factor of [0.999, 1, 1.001]) {
  regression(`known wrong result: #2198 required column shear spacing boundary ${factor}`, () => {
    const d = sec.h - sec.cover - 0.008 - bars.diameter / 2000;
    const cage = { diameter: 8, legs: 2, secondaryLegs: 2, spacing: d / 2 * factor };
    const cap = computeDirectionalShearCapacity('primary', 8, stirrupLegs(cage, 'primary'), cage.spacing, sec.b, d, sec.fc, sec.fy);
    const stations = { elementId: 1, length: 4, stationTs: [0, 1], comboResults: [{ comboId: 1, comboName: 'C1',
      stations: [0, 1].map(t => ({ t, x: 4 * t, n: 0, my: 0, mz: 0, vy: 0, vz: cap.phiVc * 0.6, torsion: 0 })) }] };
    const r = verifyProvidedReinforcement(1, 'column', { longitudinal: bars, stirrups: cage }, undefined, {}, sec, stations);
    const failures = r.checks.filter(c => c.limiting === 'tieSpacing' && c.status === 'fail');
    expect(failures.length > 0).toBe(factor > 1);
    for (const row of failures) expect(row.description).toContain('10.7.6.5.2');
  });
}

for (const shape of [{ kind: 'circle', D: 0.4 }, { kind: 'tee', bf: 0.4, bw: 0.3, h: 0.4, hf: 0.3 }, { kind: 'L', b: 0.4, h: 0.4, tw: 0.3, tf: 0.3 }] as const)
  for (const direction of ['primary', 'secondary'] as const) {
    regression(`known wrong result: #2198 shaped column ordinary ties ${shape.kind} ${direction}`, () => {
      const cage = { diameter: 8, legs: 2, secondaryLegs: 2, spacing: 0.2 };
      const stations = { elementId: 1, length: 4, stationTs: [0, 1], comboResults: [{ comboId: 1, comboName: 'C1',
        stations: [0, 1].map(t => ({ t, x: 4 * t, n: 0, my: 0, mz: 0, vy: direction === 'secondary' ? 1 : 0, vz: direction === 'primary' ? 1 : 0, torsion: 0 })) }] };
      const r = verifyProvidedReinforcement(1, 'column', { shaped: bars, stirrups: cage }, undefined, {}, sec, stations, undefined, { shape });
      expect(r.checks.filter(c => c.limiting === 'tieSpacing' && c.status === 'fail')).toEqual([]);
      expect(r.checkedAxes).toContain(direction === 'primary' ? 'Vz' : 'Vy');
    });
  }

for (const diameter of [6, 8, 12]) {
  it(`provided column cage controls both bar geometry and shear depth ${diameter}`, () => {
    const rebar = { longitudinal: bars, stirrups: { diameter, legs: 2, secondaryLegs: 2, spacing: 0.1 } };
    const stations = { elementId: 1, length: 4, stationTs: [0, 1], comboResults: [{ comboId: 1, comboName: 'C1',
      stations: [0, 1].map(t => ({ t, x: 4 * t, n: -100, my: 10, mz: 5, vy: 1, vz: 1, torsion: 0 })) }] };
    const results = [6, 8, 12].map(stirrupDia => verifyProvidedReinforcement(1, 'column', rebar, undefined, {}, { ...sec, stirrupDia }, stations));
    expect(results[0]).toEqual(results[1]);
    expect(results[2]).toEqual(results[1]);
  });
}
