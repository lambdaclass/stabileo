import { expect, it, vi } from 'vitest';
import * as steelChecks from '../codes/argentina/cirsoc301';
import { ConcurrentDemand } from '../concurrent-demand';
import { checkSteelMember, steelDemandOf, steelMemberLengths, runSteelVerification } from '../verification-service';
import { extractGoverningDemands, type ElementStationResult } from '../station-design-forces';
import { profileByName, profileToSectionFull } from '../../data/steel-profiles';
import { momentGradient } from '../steel/moment-gradient';
import { checkSteelInteraction as manualInteraction, verifySteelElement as manualElement } from './helpers/manual-interactions';
import type { AnalysisResults3D } from '../types-3d';

const section = { ...profileToSectionFull(profileByName('IPE 300')!), fabrication: 'rolled' as const };
const steel = { fy: 250, fu: 400, e: 200000 };
const regression = process.env.RUN_KNOWN_WRONG ? it : it.skip;
const ef = { elementId: 1, length: 10, nStart: -100, nEnd: -100, myStart: 80, myEnd: 40,
  mzStart: 0, mzEnd: 0, vyStart: 0, vyEnd: 0, vzStart: 0, vzEnd: 0, mxStart: 0, mxEnd: 0,
} as AnalysisResults3D['elementForces'][number];
const ts = [0, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.8, 0.875, 1];

for (const screen of [false, true]) for (const sign of [1, -1]) for (const t of [0, 0.499999, 0.5, 0.500001, 0.8, 1]) {
  regression(`#[ignore = "known wrong result: #2080"] tuple Cb uses metres screen=${screen} sign=${sign} t=${t}`, () => {
    const stations: ElementStationResult = { elementId: 1, length: 10, stationTs: ts, comboResults: [{ comboId: 1, comboName: 'C',
      stations: ts.map(t => ({ t, x: 10 * t, n: -100, my: sign * (t < 0.5 ? 80 - 80 * t : 40), mz: 0, vy: 0, vz: 0, torsion: 0 })) }] };
    const d = steelDemandOf(ef, extractGoverningDemands(stations), stations);
    const at = d.concurrent![0]!.interpolate(d.concurrent!.at(-1)!, t);
    const point = ConcurrentDemand.fromTuples([{ comboId: 1, comboName: 'C', forces: { ...at.forces, my: sign * (t < 0.5 ? 80 - 80 * t : 40) } }])[0]!;
    const selected = { ...d, concurrent: [point], tuples: [{ N: 100, MStrong: point.my, MWeak: 0, VStrong: 0, VWeak: 0, comboId: 1, comboName: 'C', t }] };
    const lengths = steelMemberLengths({ bracing: { top: [5], bottom: [5] }, steelLoadHeight: 'web' }, { L: 10, Lb: 10 });
    const physical = checkSteelMember(1, selected, section, steel, lengths, undefined, { screen })!;
    const tuple = checkSteelMember(1, { ...selected, concurrent: undefined }, section, steel, lengths, undefined, { screen })!;
    const unity = checkSteelMember(1, { ...selected, diagrams: undefined }, section, steel, lengths, undefined, { screen })!;
    const cb = t >= 0.5 ? 1 : momentGradient({ stations: d.diagrams!.get(1)!, tStart: 0, tEnd: 0.5, shape: 'I' }).cb;
    expect(physical.flexureZ.phiMn).toBeCloseTo(Math.min(physical.flexureZ.Mp * 0.9, unity.flexureZ.phiMn * cb), 8);
    expect(tuple.flexureZ.phiMn).toBe(physical.flexureZ.phiMn);
    expect(tuple.interaction!.ratio).toBe(physical.interaction!.ratio);
    expect(tuple.engineRecheck).toEqual(physical.engineRecheck);
    const unknown = checkSteelMember(1, { ...selected, concurrent: undefined, diagramLength: undefined }, section, steel, lengths, undefined, { screen })!;
    expect(unknown.flexureZ.phiMn).toBe(unity.flexureZ.phiMn);
  });
}

for (const screen of [false, true]) for (const weakGoverns of [false, true]) for (const reverse of [false, true]) {
  regression(`#[ignore = "known wrong result: #2080"] shear demand and combination stay together screen=${screen} weak=${weakGoverns} reverse=${reverse}`, () => {
    const strong = 0.796728424, weak = 1.138370238;
    const stations: ElementStationResult = { elementId: 1, length: 10, stationTs: [0, 1], comboResults: [
      { comboId: 2, comboName: 'weak', stations: [0, 1].map(t => ({ t, x: t * 10, n: -100, my: 0, mz: 0, vy: weakGoverns ? weak : strong, vz: 0, torsion: 0 })) },
      { comboId: 3, comboName: 'strong', stations: [0, 1].map(t => ({ t, x: t * 10, n: -100, my: 0, mz: 0, vy: 0, vz: weakGoverns ? strong : weak, torsion: 0 })) },
    ] };
    if (reverse) stations.comboResults.reverse();
    const d = steelDemandOf(ef, extractGoverningDemands(stations), stations);
    const lengths = { L: 10, Lb: 10, loadPosition: 'web' as const };
    for (const input of [d, { ...d, concurrent: undefined }]) {
      const v = checkSteelMember(1, input, section, steel, lengths, undefined, { screen })!;
      expect(v.shear.Vu).toBe(weakGoverns ? strong : weak);
      expect(v.shear.ratio).toBe(v.shear.Vu / v.shear.phiVn);
      expect(v.shearWeak!.Vu).toBe(weakGoverns ? weak : strong);
      expect(v.shearWeak!.ratio).toBe(v.shearWeak!.Vu / v.shearWeak!.phiVn);
      expect(v.governingCombos!.shear!.comboId).toBe(3);
      expect(v.governingCombos!.shearWeak!.comboId).toBe(2);
      expect(v.Vu).toBe(v.shear.Vu);
    }
    const model = { nodes: new Map([[1, { id: 1, x: 0, y: 0 }], [2, { id: 2, x: 10, y: 0 }]]),
      elements: new Map([[1, { id: 1, nodeI: 1, nodeJ: 2, type: 'frame', sectionId: 1, materialId: 1 }]]),
      sections: new Map([[1, { ...section, id: 1 }]]), materials: new Map([[1, { ...steel, id: 1 }]]), supports: new Map() };
    const raw = { elementForces: [ef], displacements: [], reactions: [] } as AnalysisResults3D;
    const v = runSteelVerification(raw, model as never, new Map([[1, extractGoverningDemands(stations)]]), new Map([[1, stations]]))[0]!;
    expect(v.Vu).toBe(v.shear.Vu);
  });
}

regression('#[ignore = "known wrong result: #2080"] legacy interaction helper maps strong moments to my', () => {
  const params = { Fy: steel.fy, Fu: steel.fu, E: steel.e, A: section.a, Iz: section.iy, Iy: section.iz,
    h: section.h, b: section.b, tw: section.tw, tf: section.tf, L: 10, Lb: 10, shape: 'I', builtUp: false, loadPosition: 'web' as const };
  for (const [strong, weak] of [[40, 0], [0, 40], [40, 5], [-40, 5]]) {
    const expected = manualElement({ elementId: 1, params, Nu: 100, Muz: strong!, Muy: weak!, Vu: 0 });
    const capture = vi.spyOn(steelChecks, 'checkSteelInteraction');
    try {
      const actual = manualInteraction(params, 100, strong!, weak!);
      const demand = capture.mock.calls[0]![1];
      expect(demand.source.my).toBe(strong);
      expect(demand.source.mz).toBe(weak);
      expect(demand.axis).toBe('My');
      expect(actual.ratio).toBe(expected.interaction!.ratio);
    } finally { capture.mockRestore(); }
  }
});
