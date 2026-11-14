import { expect, it } from 'vitest';
import { checkSteelMember, runSteelVerification, steelDemandOf, steelSegmentDiagram } from '../verification-service';
import { extractGoverningDemands, type ElementStationResult } from '../station-design-forces';
import { profileByName, profileToSectionFull } from '../../data/steel-profiles';
import { momentGradient } from '../steel/moment-gradient';
import type { AnalysisResults3D } from '../types-3d';

const section = { ...profileToSectionFull(profileByName('IPE 300')!), fabrication: 'rolled' as const };
const steel = { fy: 250, fu: 400, e: 200000 };
const ts = [0, 0.25, 0.5, 0.75, 1];
const diagram = ts.map(t => ({ t, m: -80 * t }));
const stations: ElementStationResult = { elementId: 1, length: 8, stationTs: ts, comboResults: [{ comboId: 1, comboName: 'C',
  stations: ts.map(t => ({ t, x: t * 8, n: -100, my: -80 * t, mz: 0, vy: 0, vz: 0, torsion: 0 })) }] };
const ef = { elementId: 1, length: 8, nStart: -100, nEnd: -100, myStart: 0, myEnd: -80,
  mzStart: 0, mzEnd: 0, vyStart: 0, vyEnd: 0, vzStart: 0, vzEnd: 0, mxStart: 0, mxEnd: 0 } as AnalysisResults3D['elementForces'][number];
const demand = () => steelDemandOf(ef, extractGoverningDemands(stations), stations);

for (const screen of [false, true]) {
  for (const bottom of [4, 7.999, 8, 8.001]) {
    const test = bottom === 8 ? it : it.fails;
    test(`#2080 selected bottom span ${bottom} determines flexure and interaction Cb screen=${screen}`, () => {
      const actual = checkSteelMember(1, demand(), section, steel, { L: 8, Lb: 2, LbNeg: bottom, loadPosition: 'web' }, undefined, { screen })!;
      const own = checkSteelMember(1, demand(), section, steel, { L: 8, Lb: bottom, loadPosition: 'web' }, undefined, { screen })!;
      const span = bottom / 8;
      const cb = bottom > 8 ? 1 : momentGradient({ stations: diagram, tStart: (1 - span) / 2, tEnd: (1 + span) / 2, shape: 'I' }).cb;
      const fixed = { ...demand(), diagrams: undefined };
      const unity = checkSteelMember(1, fixed, section, steel, { L: 8, Lb: bottom, loadPosition: 'web' }, undefined, { screen })!;
      expect(actual.flexureZ.phiMn).toBeCloseTo(unity.flexureZ.phiMn * cb, 8);
      expect(actual.flexureZ.phiMn).toBe(own.flexureZ.phiMn);
      expect(actual.interaction!.ratio).toBe(own.interaction!.ratio);
    });
  }
}

it('#2080 both moment signs in one combination use their own span regardless of station order', () => {
  const s = { ...stations, comboResults: [{ ...stations.comboResults[0]!, stations: stations.comboResults[0]!.stations.map((s, i) => ({ ...s, my: i === 0 ? 1 : s.my })) }] };
  const d = steelDemandOf(ef, extractGoverningDemands(s), s);
  const full = checkSteelMember(1, d, section, steel, { L: 8, Lb: 4, LbNeg: 8, loadPosition: 'web' })!;
  const negative = checkSteelMember(1, { ...d, concurrent: d.concurrent!.slice(1) }, section, steel, { L: 8, Lb: 8, loadPosition: 'web' })!;
  expect(full.flexureZ.phiMn).toBe(negative.flexureZ.phiMn);
  expect(full.interaction!.ratio).toBe(negative.interaction!.ratio);
});

it.fails('#2080 a chained selected flange reads its own window', () => {
  const model = { nodes: new Map([[1, { x: 0, y: 0 }], [2, { x: 4, y: 0 }], [3, { x: 8, y: 0 }]]),
    elements: new Map([[1, { nodeI: 1, nodeJ: 2 }], [2, { nodeI: 2, nodeJ: 3 }]]) };
  const diagrams = new Map([1, 2].map(id => [id, { ...stations, elementId: id, length: 4,
    comboResults: [{ comboId: 1, comboName: 'C', stations: ts.map(t => ({ ...stations.comboResults[0]!.stations[0]!, t, x: t * 4, my: -40 * (id - 1 + t) })) }] }]));
  const segment = steelSegmentDiagram(1, { Lb: 2, chain: [1, 2] }, diagrams, model)!;
  const actual = checkSteelMember(1, demand(), section, steel, { L: 8, Lb: 2, LbNeg: 8, loadPosition: 'web' }, segment)!;
  const controlSegment = steelSegmentDiagram(1, { Lb: 8, chain: [1, 2] }, diagrams, model)!;
  const expected = checkSteelMember(1, demand(), section, steel, { L: 8, Lb: 8, loadPosition: 'web' }, controlSegment)!;
  expect(actual.flexureZ.phiMn).toBe(expected.flexureZ.phiMn);
  expect(actual.interaction!.ratio).toBe(expected.interaction!.ratio);
});

it('an unavailable combination diagram retains unity and a uniform moment retains its capacity', () => {
  const d = demand();
  const noDiagram = { ...d, diagrams: undefined };
  const missing = { stations: diagram, byCombo: new Map(), tStart: 0, tEnd: 1 };
  const lengths = { L: 8, Lb: 4, LbNeg: 8, loadPosition: 'web' as const };
  expect(checkSteelMember(1, d, section, steel, lengths, missing)!.flexureZ.phiMn)
    .toBe(checkSteelMember(1, noDiagram, section, steel, lengths)!.flexureZ.phiMn);
  const uniform = { ...d, diagrams: new Map([[1, ts.map(t => ({ t, m: -80 }))]]) };
  expect(checkSteelMember(1, uniform, section, steel, lengths)!.flexureZ.phiMn)
    .toBe(checkSteelMember(1, noDiagram, section, steel, lengths)!.flexureZ.phiMn);
});

for (const reverse of [false, true]) {
  it.fails(`#2080 one combination caches Cb by selected flange span reverse=${reverse}`, () => {
    const s = { ...stations, comboResults: [{ ...stations.comboResults[0]!, stations: stations.comboResults[0]!.stations.map((s, i) => ({ ...s, my: i === 0 ? 1 : s.my })) }] };
    const d = steelDemandOf(ef, extractGoverningDemands(s), s);
    if (reverse) d.concurrent = [...d.concurrent!].reverse();
    const actual = checkSteelMember(1, d, section, steel, { L: 8, Lb: 8, LbNeg: 4, loadPosition: 'web' })!;
    const cb = momentGradient({ stations: d.diagrams!.get(1)!, tStart: 0.25, tEnd: 0.75, shape: 'I' }).cb;
    const unity = checkSteelMember(1, { ...d, diagrams: undefined }, section, steel, { L: 8, Lb: 8, LbNeg: 4, loadPosition: 'web' })!;
    expect(actual.flexureZ.phiMn).toBeCloseTo(unity.flexureZ.phiMn * cb, 8);
  });
}

it.fails('#2080 the model verification entry point uses the bottom flange window', () => {
  const model = { nodes: new Map([[1, { id: 1, x: 0, y: 0, z: 0 }], [2, { id: 2, x: 8, y: 0, z: 0 }]]),
    elements: new Map([[1, { id: 1, nodeI: 1, nodeJ: 2, type: 'frame', sectionId: 1, materialId: 1, bracing: { bottom: [0.5] } }]]),
    sections: new Map([[1, { ...section, id: 1 }]]), materials: new Map([[1, { ...steel, id: 1 }]]), supports: new Map() };
  const raw = { elementForces: [ef], displacements: [], reactions: [] } as unknown as AnalysisResults3D;
  const sd = new Map([[1, extractGoverningDemands(stations)]]);
  const actual = runSteelVerification(raw, model as never, sd, new Map([[1, stations]]))[0]!;
  const own = checkSteelMember(1, demand(), section, steel, { L: 8, Lb: 4 },
    { stations: diagram, byCombo: new Map([[1, diagram]]), tStart: 0.25, tEnd: 0.75 })!;
  expect(actual.flexureZ.phiMn).toBe(own.flexureZ.phiMn);
});
