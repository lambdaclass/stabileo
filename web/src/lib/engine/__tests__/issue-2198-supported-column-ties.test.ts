import { solve, solvePDelta, solve3D, solvePDelta3D } from '../wasm-solver';
import { expect, it } from 'vitest';
import { computeShearCapacity, verifyProvidedReinforcement, computeColumnLayout } from '../station-design-forces';
import { cirsoc201Adapter } from '../design/adapters/cirsoc201-adapter';
import { solveFixture } from '../design/__tests__/helpers';
import frame from '../../templates/fixtures/rc-design-frame.json';
import record from '../../../../../docs/results-changes/2198-round16-column-ties.json';
import { prepareElementVerification, REBAR_DB, verifyElement } from '../codes/argentina/cirsoc201';
import { verifyConcurrentElement } from '../concurrent-verification';
import { declaredTestDemands } from './helpers/declared-demands';
import { grossAreaOf, type ColumnShape } from '../design/shaped-column';

const regression = process.env.RUN_KNOWN_WRONG === '2198' ? it : it.skip;
const section = { b: 0.6, h: 0.6, cover: 0.025, stirrupDia: 6, fc: 25, fy: 420 };
const longitudinal = { count: 8, diameter: 25 };
const ties = { diameter: 6, legs: 3, secondaryLegs: 3, spacing: 0.15 };

function stations(vu: number, compression = 0) {
  return { elementId: 1, length: 4, stationTs: [0, 1], comboResults: [{ comboId: 1, comboName: 'shear',
    stations: [0, 1].map(t => ({ t, x: t * 4, n: -compression, my: 0, mz: 0, vy: vu, vz: -vu, torsion: 0 })) }] };
}

regression('known wrong result: #2198 the recorded four-corner cages of columns 6 and 10 fail the crosstie check', () => {
  const { contexts } = solveFixture(frame);
  for (const id of [6, 10]) {
    const cage = record.changedMembers.find(m => m.id === id)!.after.accepted!;
    const result = cirsoc201Adapter.verify(contexts.get(id)!, cage);
    expect(result.overallStatus).toBe('fail');
    const perimeter = cirsoc201Adapter.verify(contexts.get(id)!, {
      ...cage, stirrups: { ...cage.stirrups!, legs: 2, secondaryLegs: 2 },
    });
    for (const axis of ['Vy', 'Vz']) {
      const capacity = (r: typeof result) => r.checks.find(c => c.category === `Ties (${axis})`)!.capacity;
      expect(capacity(result)).toBe(capacity(perimeter));
    }
  }
});

regression('known wrong result: #2198 only opposing aligned face bars anchor each directional crosstie', () => {
  for (const [bottom, top, left, right, primary, secondary] of [
    [0, 0, 0, 0, 2, 2], [1, 0, 1, 1, 2, 3], [2, 1, 1, 0, 2, 2],
    [3, 1, 2, 2, 3, 4], [2, 2, 0, 0, 4, 2],
  ]) {
    const column = { cornerDia: 25, faceDia: 16, nBottom: bottom!, nTop: top!, nLeft: left!, nRight: right! };
    const verify = (legs: number, secondaryLegs: number) => verifyProvidedReinforcement(1, 'column', {
      column, stirrups: { ...ties, legs, secondaryLegs },
    }, undefined, {}, { ...section, b: 0.4, h: 0.4 }, stations(1));
    const actual = verify(4, 4);
    const supported = verify(primary!, secondary!);
    expect(supported.overallStatus).not.toBe('fail');
    for (const axis of ['Vy', 'Vz']) {
      const capacity = (r: typeof actual) => r.checks.find(c => c.category === `Ties (${axis})`)!.capacity;
      expect(capacity(actual)).toBe(capacity(supported));
    }
    expect(actual.overallStatus).toBe('fail');
  }
});

regression('known wrong result: #2198 direct, prepared and concurrent checks use the fixed column bars to bound tie legs', () => {
  const input = { ...section, elementId: 1, elementType: 'column' as const,
    demand: declaredTestDemands([{ comboId: 1, comboName: 'both', forces: stations(1).comboResults[0]!.stations[0]! }])[0]!.section('My') };
  for (const count of [4, 8]) {
    const fixed = { column: { barCount: count, barDia: 25 }, shear: ties };
    for (const result of [verifyElement(input, fixed), prepareElementVerification(input)(fixed), verifyConcurrentElement([input], fixed)]) {
      for (const row of [result.shear, result.shearSecondary!]) expect(row.stirrupLegs).toBe(count === 4 ? 2 : 3);
    }
  }
});

for (const shape of [undefined, { kind: 'circle', D: 0.6 }, { kind: 'tee', bf: 0.8, bw: 0.6, hf: 0.6, h: 0.8 },
  { kind: 'L', b: 0.8, h: 0.8, tw: 0.6, tf: 0.6 }] as const satisfies readonly (ColumnShape | undefined)[]) {
  regression(`known wrong result: #2198 ${shape?.kind ?? 'rectangular'} minimum tie area at the unrounded shear threshold`, () => {
    const depth = shape ? 0.8 * (shape.kind === 'circle' ? shape.D : shape.h) : section.h - section.cover - ties.diameter / 1000 - 0.008;
    const area = computeColumnLayout(longitudinal.count, longitudinal.diameter, section.b, section.h, section.cover, ties.diameter).totalArea;
    const rhoW = shape ? 0 : area / 3 / (section.b * section.h * 1e4);
    for (const spacing of [ties.spacing, ties.spacing / 2]) {
      const cage = { ...ties, legs: 2, secondaryLegs: 2, spacing };
      const compression = shape ? 100 : 0;
      const Ag = shape ? grossAreaOf(shape) : section.b * section.h;
      const cap = computeShearCapacity(6, 2, spacing, section.b, depth, section.fc, section.fy, compression, { rhoW, h: Math.max(section.h, depth), Ag });
      expect(cap.avBelowMin).toBe(spacing === ties.spacing);
      for (const factor of [0.999, 1, 1.001]) {
        const vu = 0.5 * cap.phiVcUnrounded * factor;
        const result = verifyProvidedReinforcement(1, 'column', {
          longitudinal, ...(shape ? { shaped: longitudinal } : {}), stirrups: cage,
        }, undefined, {}, section, stations(vu, compression), undefined, { shape });
        for (const axis of ['Vy', 'Vz']) {
          const strength = result.checks.find(c => c.category === `Ties (${axis})`)!;
          expect(strength.ratio).toBeLessThan(1);
          expect(result.checks.some(c => c.category === `Ties (${axis}) Av,min` && c.status === 'fail')).toBe(cap.avBelowMin && factor > 1);
        }
        expect(result.checks.filter(c => c.limiting === 'tieSpacing' && c.status === 'fail')).toEqual([]);
        if (!shape) expect(result.overallStatus === 'fail').toBe(cap.avBelowMin && factor > 1);
      }
    }
  });
}

regression('known wrong result: #2198 shallow column sections still require minimum shear reinforcement', () => {
  const input = { ...section, b: 0.24, h: 0.95, elementId: 1, elementType: 'column' as const,
    demand: declaredTestDemands([{ comboId: 1, comboName: 'minor axis', forces: stations(1).comboResults[0]!.stations[0]! }])[0]!.section('My') };
  const fixed = { column: { barCount: 8, barDia: 25 }, shear: { spacing: 0.1, legs: 2, secondaryLegs: 2 } };
  for (const r of [verifyElement(input, fixed), prepareElementVerification(input)(fixed), verifyConcurrentElement([input], fixed)]) {
    expect(r.shearSecondary!.ratio).toBeLessThan(1);
    expect(r.shearSecondary!.status).toBe('fail');
  }
});

for (const spatial of [false, true]) for (const nonlinear of [false, true]) {
  regression(`known wrong result: #2198 solved column crosstie and minimum steel checks spatial=${spatial} nonlinear=${nonlinear}`, () => {
    const model = {
      nodes: new Map([[1, { id: 1, x: 0, y: 0, z: 0 }], [2, { id: 2, x: 0.04, y: 0, z: 0 }]]),
      elements: new Map([[1, { id: 1, type: 'frame' as const, nodeI: 1, nodeJ: 2, sectionId: 1, materialId: 1,
        releaseMyStart: false, releaseMyEnd: false, releaseMzStart: false, releaseMzEnd: false, releaseTStart: false, releaseTEnd: false }]]),
      sections: new Map([[1, { id: 1, name: 'RC', ...section, a: section.b * section.h, iy: section.b * section.h ** 3 / 12, iz: section.h * section.b ** 3 / 12, j: 0.001 }]]),
      materials: new Map([[1, { id: 1, name: 'H25', fc: section.fc, fy: section.fy, e: 25000, nu: 0.2 }]]),
    };
    const raw = spatial ? (() => {
      const solver = { ...model, supports: new Map([[1, { nodeId: 1, rx: true, ry: true, rz: true, rrx: true, rry: true, rrz: true }]]),
        loads: [{ type: 'nodal' as const, data: { nodeId: 2, fx: 0, fy: 70, fz: 70, mx: 0, my: 0, mz: 0 } }] };
      return nonlinear ? solvePDelta3D(solver).results : solve3D(solver);
    })() : (() => {
      const solver = { ...model,
        nodes: new Map([...model.nodes].map(([id, { x, z }]) => [id, { id, x, z }])),
        elements: new Map([[1, { id: 1, type: 'frame' as const, nodeI: 1, nodeJ: 2, sectionId: 1, materialId: 1, hingeStart: false, hingeEnd: false }]]),
        supports: new Map([[1, { id: 1, nodeId: 1, type: 'fixed' as const }]]),
        loads: [{ type: 'nodal' as const, data: { nodeId: 2, fx: 0, fz: 70, my: 0 } }] };
      return nonlinear ? solvePDelta(solver).results : solve(solver);
    })();
    const ef = raw.elementForces[0]!;
    const s = stations(0);
    for (const force of s.comboResults[0]!.stations) {
      force.vy = 'vyStart' in ef ? ef.vyStart : 0;
      force.vz = 'vzStart' in ef ? ef.vzStart : ef.vStart;
    }
    const r = verifyProvidedReinforcement(1, 'column', { longitudinal: { count: 4, diameter: 40 }, stirrups: ties }, undefined, {}, section, s);
    for (const axis of spatial ? ['Vy', 'Vz'] : ['Vz']) {
      expect(r.checks.find(c => c.category === `Ties (${axis})`)!.ratio).toBeLessThan(1);
      expect(r.checks.find(c => c.category === `Ties (${axis}) Av,min`)?.status).toBe('fail');
    }
    expect(r.overallStatus).toBe('fail');
  });
}

regression('known wrong result: #2198 a minimum-area deficit fails even when its displayed ratio rounds to one', () => {
  const width = section.b;
  const area = 2 * REBAR_DB.find(bar => bar.diameter === ties.diameter)!.area * 1e-4;
  const spacingAtMinimum = area * section.fy / (width * Math.max(0.35, 0.062 * Math.sqrt(section.fc)));
  for (const factor of [1 - 1e-8, 1 + 1e-8]) {
    const r = verifyProvidedReinforcement(1, 'column', {
      longitudinal, stirrups: { ...ties, legs: 2, secondaryLegs: 2, spacing: spacingAtMinimum * factor },
    }, undefined, {}, section, stations(120));
    expect(r.checks.filter(c => c.category.startsWith('Ties (') && c.unit === 'kN').every(c => c.ratio < 1)).toBe(true);
    expect(r.overallStatus === 'fail').toBe(factor > 1);
  }
});
