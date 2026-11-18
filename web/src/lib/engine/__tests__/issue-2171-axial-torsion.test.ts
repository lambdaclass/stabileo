import { expect, it } from 'vitest';
import { checkTorsion2025 } from '../../codes/cirsoc201/torsion';
import type { ProvidedReinforcement } from '../../design-contract/reinforcement';
import { checkTorsion, prepareElementVerification, verifyElement } from '../codes/argentina/cirsoc201';
import { lineTransverseDemand } from '../design/beam-line-demand';
import type { MemberContext } from '../design/member-context';
import { extractGoverningDemands, verifyProvidedReinforcement } from '../station-design-forces';
import type { ElementStationResult } from '../station-design-forces';
import { declaredTestDemands } from './helpers/declared-demands';

const section = { b: 0.3, h: 0.6, cover: 0.025, stirrupDia: 8, fc: 25, fy: 420 };
const stirrups = { diameter: 8, legs: 4, spacing: 0.24 };
const bars = { count: 4, diameter: 16 };
const steel = { stirrups, top: bars, bottom: bars, longitudinal: bars };
const fixed = { shear: stirrups, torsion: { AlProv: 100 } };
const axes = { flexure: 'My', shear: 'Vz', secondaryFlexure: 'Mz', secondaryShear: 'Vy',
  bFlex: section.b, hFlex: section.h, biaxial: false, sagCategory: 'My+', hogCategory: 'My-',
  basis: 'stress-proxy', secondaryRatio: 0 } as const;

type Edition = '2005' | '2025';
type Member = 'beam' | 'column' | 'wall';

function station(compression: number, torsion: number, vz = 0, vy = 0) {
  return { t: 0.5, x: 2, n: -compression, my: 0, mz: 0, vy, vz, torsion };
}

function stationResult(forces: ReturnType<typeof station>): ElementStationResult {
  const stations = [0, 0.5, 1].map(t => ({ ...forces, t, x: 4 * t }));
  return { elementId: 1, length: 4, stationTs: [0, 0.5, 1],
    comboResults: [{ comboId: 1, comboName: 'C1', stations }] };
}

function provided(edition: Edition, forces: ReturnType<typeof station>, extracted: boolean,
  member: Member = 'beam', reinforcement: ProvidedReinforcement = steel,
) {
  const result = stationResult(forces);
  return verifyProvidedReinforcement(1, member, reinforcement, extracted ? extractGoverningDemands(result) : undefined,
    {}, section, extracted ? undefined : result, undefined, { axes, spacingRule: { edition, maxAggregateSizeMm: 0 } });
}

function demandAt(forces: ReturnType<typeof station>) {
  return declaredTestDemands([{ comboId: 1, comboName: 'C1', forces }])[0]!.section('My');
}

function handThreshold(edition: Edition, compression: number) {
  const area = section.b * section.h;
  const perimeter = 2 * (section.b + section.h);
  const root = Math.sqrt(section.fc);
  const coefficient = edition === '2005' ? 1 / 12 : 0.083;
  const axialCoefficient = edition === '2005' ? 1 / 3 : 0.33;
  return 0.75 * coefficient * root * 1000 * area ** 2 / perimeter
    * Math.sqrt(Math.max(0, 1 + compression / (axialCoefficient * area * root * 1000)));
}

const inset = 2 * section.cover + stirrups.diameter / 1000;
const Aoh = (section.b - inset) * (section.h - inset);
const ph = 2 * (section.b + section.h - 2 * inset);
const spacingRatio = +(stirrups.spacing / (ph / 8)).toFixed(3);
const directGeometry = { ...section, d: section.h - 0.041, dSecondary: section.b - 0.041,
  fyt: section.fy, stirrupDiaMm: stirrups.diameter, stirrup: stirrups };

for (const edition of ['2005', '2025'] as const) {
  it(`#2171 checks torsion at the signed axial threshold (${edition})`, () => {
    for (const compression of [-90, 0, 90, -310]) {
      const threshold = handThreshold(edition, compression);
      for (const torque of threshold > 0 ? [threshold * 0.999, threshold * 1.001] : [0, 0.001]) {
        const neglect = torque === 0 || torque < threshold;
        const forces = station(compression, torque);
        const demand = demandAt(forces);
        const direct = checkTorsion2025({ ...directGeometry, edition, demand });
        expect.soft(direct.phiTth).toBeCloseTo(threshold, 12);
        expect.soft(direct.neglect).toBe(neglect);
        expect.soft(checkTorsion(section, demand, edition).neglect).toBe(neglect);
        for (const member of ['beam', 'wall', 'column'] as const) {
          const input = { ...section, elementType: member, elementId: 1, edition, demand };
          for (const out of [verifyElement(input, fixed), prepareElementVerification(input)(fixed)]) {
            if (torque === 0) expect.soft(out.torsion).toBeUndefined();
            else expect.soft(out.torsion).toMatchObject({ neglect, status: neglect ? 'ok' : 'fail' });
          }
          for (const extracted of [false, true]) {
            const checks = provided(edition, forces, extracted, member).checks;
            const rows = checks.filter(c => /^Torsion (?:Support|Span|ties)/.test(c.category));
            if (neglect) expect.soft(rows).toEqual([]);
            else {
              expect.soft(rows.length).toBeGreaterThan(0);
              for (const row of rows) expect.soft(row).toMatchObject({ status: 'fail', ratio: spacingRatio });
            }
          }
        }
      }
    }
  });
}

for (const edition of ['2005', '2025'] as const) {
  it(`#2171 retains a failing torsion check that main performs (${edition})`, () => {
    const forces = station(-90, 5.58);
    const input = { ...section, elementType: 'beam' as const, elementId: 1, edition, demand: demandAt(forces) };
    for (const out of [verifyElement(input, fixed), prepareElementVerification(input)(fixed)]) {
      expect.soft(out.torsion).toMatchObject({ status: 'fail', neglect: false });
      expect.soft(out.overallStatus).toBe('fail');
    }
    for (const extracted of [false, true]) {
      const out = provided(edition, station(-90, 5.61), extracted);
      expect.soft(out.checks.find(row => row.category === 'Torsion Span (Vz)')).toMatchObject({ status: 'fail', ratio: spacingRatio });
      expect.soft(out.overallStatus).toBe('fail');
    }
  });
}

it('#2171 beam line sizes torsion with the axial force at each station', () => {
  for (const compression of [-90, 90]) for (const factor of [0.999, 1.001]) {
    const torque = handThreshold('2025', compression) * factor;
    const stations = stationResult(station(compression, torque));
    const ctx: MemberContext = {
      elementId: stations.elementId, elementType: 'beam', materialFamily: 'concrete', L: stations.length,
      section: { ...section, id: 1, name: 'H25' }, material: { ...section, maxAggregateSize: { value: 19, origin: 'project', refs: [] } },
      stations, axes, demands: undefined, criticalSections: undefined, slenderDeltaNs: 1, slenderDeltaS: 1,
      orientationSuspect: false, codeEdition: '2025', analysisRevision: 0, demandRevision: 0, solveGeneration: 0,
      blocking: [], modelData: { elements: new Map(), nodes: new Map(), sections: new Map(), materials: new Map(), supports: new Map() },
    };
    const curve = lineTransverseDemand([{ ctx, offset: 0, L: stations.length, forward: true }]);
    const expected = factor < 1 ? 0 : 2 * torque / (0.75 * 2 * 0.85 * Aoh * section.fy * 1000) * 1e4;
    expect.soft(curve.map(point => point.x)).toEqual([0, 2, 4]);
    for (const point of curve) expect.soft(point.torsion).toBeCloseTo(expected, 12);
  }
});

it('#2171 refuses active torsion when the axial force is nonfinite', () => {
  for (const compression of [NaN, Infinity]) {
    const demand = demandAt(station(compression, 5.58));
    expect.soft(checkTorsion2025({ ...directGeometry, demand })).toMatchObject({
      neglect: false, ratio: Infinity, refusal: expect.stringMatching(/axial/i),
    });
    expect.soft(checkTorsion(section, demand, '2025')).toMatchObject({
      neglect: false, ratio: Infinity, status: 'fail', refusal: expect.stringMatching(/axial/i),
    });
  }
});
