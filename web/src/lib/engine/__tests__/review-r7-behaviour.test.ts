import { expect, it } from 'vitest';
import { NO_RELEASE } from '../../store/model.svelte';
import { ConcurrentDemand } from '../concurrent-demand';
import { extractGoverningDemands } from '../station-design-forces';
import { designDemands, maskAxialDemand, maskDemands } from '../design/behaviour-demands';
import { memberContexts, runOtherCode } from '../design/other-codes/run';
import { AISC360, EC3 } from '../design/other-codes/steel-codes';
import type { MemberContext, OtherCode, OtherCodeId } from '../design/other-codes/types';
import { profileByName, profileToSectionFull } from '../../data/steel-profiles';

const section = profileToSectionFull(profileByName('IPE 300')!);
function demands(n: number) {
  return extractGoverningDemands({ elementId: 1, length: 4, stationTs: [0, 1], comboResults: [{
    comboId: 1, comboName: 'C', stations: [0, 1].map(t => ({ t, x: 4 * t, n, my: 20, mz: 5, vy: 2, vz: 3, torsion: 0 })),
  }] });
}
function context(d: ReturnType<typeof demands>): MemberContext {
  return { elementId: 1, element: { id: 1, type: 'frame', nodeI: 1, nodeJ: 2, sectionId: 1, materialId: 1, releaseI: NO_RELEASE, releaseJ: NO_RELEASE },
    section: { ...section, id: 1, name: 'IPE 300' }, material: { id: 1, name: 'S', fy: 250, fu: 400, e: 200000, nu: 0.3, rho: 78.5 },
    kind: 'beam', L: 4, Lb: 4, demands: d.demands, tuples: [...d.concurrent!] };
}

it.each([undefined, 'both'])('#2080 unrestricted %s preserves concurrent tension through both masks', behaviour => {
  const raw = demands(100);
  expect(maskDemands(raw, behaviour)).toBe(raw);
  expect(designDemands(new Map([[1, raw]]), () => behaviour).get(1)!.concurrent!.map(d => d.n)).toEqual([100, 100]);
  const axial = { Nc: 0, Nt: 100, concurrent: raw.concurrent };
  expect(maskAxialDemand(axial, behaviour)).toBe(axial);
  expect(axial.concurrent!.map(d => d.n)).toEqual([100, 100]);
});

for (const behaviour of ['tensionOnly', 'cable', 'compressionOnly']) {
  const excludedSign = behaviour === 'compressionOnly' ? 1 : -1;
  for (const n of [-100, 0, 100]) {
    const excluded = n * excludedSign > 0;
    it(`#2080 ${behaviour} masks governing and concurrent axial at n=${n}`, () => {
      const raw = demands(n);
      const masked = maskDemands(raw, behaviour);
      const expected = excluded ? 0 : n;
      expect(masked.demands.every(d => d.forces.n === expected)).toBe(true);
      expect(masked.concurrent!.map(d => d.n)).toEqual([expected, expected]);
      expect(designDemands(new Map([[1, raw]]), () => behaviour).get(1)).toEqual(masked);
      expect(raw.demands.every(d => d.forces.n === n)).toBe(true);
      const axial = maskAxialDemand({ Nc: Math.max(0, -n), Nt: Math.max(0, n), concurrent: raw.concurrent,
        tuples: [{ N: -n }] }, behaviour);
      expect(axial.concurrent!.map(d => d.n)).toEqual([expected, expected]);
      expect(axial.tuples[0]!.N).toBe(0 - expected);
    });
  }
  for (const id of ['aci318', 'ec2', 'aisc360', 'ec3', 'aisiS100'] as OtherCodeId[]) {
    it(`#2080 ${id} dispatch cannot restore excluded ${behaviour} axial through deduplication`, () => {
      const d = maskDemands(demands(100 * excludedSign), behaviour);
      const code: OtherCode = { id, family: 'steel', labelKey: '', coverageKey: '', member: () => ({ data: {} }),
        forces: (_, demand) => ({ n: demand.n, my: demand.my }),
        run: ({ forces }) => (forces as Array<{ elementId: number; n: number; my: number }>).map(f => ({ elementId: f.elementId, ratio: (Math.abs(f.n) + Math.abs(f.my)) / 100 })),
        read: r => ({ ratio: r.ratio as number, pass: (r.ratio as number) <= 1, governing: 'interaction', unevaluated: [] }) };
      expect(runOtherCode(code, [context(d)]).rows[0]).toMatchObject({ status: 'checked', reading: { ratio: 0.2, pass: true } });
    });
  }
  for (const code of [AISC360, EC3]) {
    it(`#2080 ${code.id} ${behaviour} checks the same utilization as zero excluded axial`, () => {
      const actual = runOtherCode(code, [context(maskDemands(demands(100 * excludedSign), behaviour))]).rows[0]!;
      const expected = runOtherCode(code, [context(demands(0))]).rows[0]!;
      expect(actual.status).toBe('checked');
      expect(expected.status).toBe('checked');
      if (actual.status !== 'checked' || expected.status !== 'checked') throw new Error('check required');
      expect(actual.reading.ratio).toBe(expected.reading.ratio);
      expect(actual.reading.ratio).toBeGreaterThan(0);
    });
  }
}

it('inactive members are excluded and an empty map stays empty', () => {
  expect(designDemands(new Map([[1, demands(100)]]), () => 'inactive').size).toBe(0);
  expect(designDemands(new Map(), () => undefined).size).toBe(0);
  expect(ConcurrentDemand.fromTuples([])).toEqual([]);
});

for (const behaviour of ['tensionOnly', 'cable', 'compressionOnly']) {
  it(`#2080 memberContexts ${behaviour} applies the behaviour before a code sees governing forces`, () => {
    const n = behaviour === 'compressionOnly' ? 100 : -100;
    const ef = { elementId: 1, length: 4, nStart: n, nEnd: n, myStart: 20, myEnd: 20,
      mzStart: 5, mzEnd: 5, vyStart: 2, vyEnd: 2, vzStart: 3, vzEnd: 3, mxStart: 0, mxEnd: 0, qYI: 0, qYJ: 0, qZI: 0, qZJ: 0, distributedLoadsY: [], distributedLoadsZ: [], pointLoadsY: [], pointLoadsZ: [],
      releaseMyStart: false, releaseMyEnd: false, releaseMzStart: false, releaseMzEnd: false, releaseTStart: false, releaseTEnd: false };
    const model = { nodes: new Map([[1, { id: 1, x: 0, y: 0, z: 0 }], [2, { id: 2, x: 4, y: 0, z: 0 }]]),
      elements: new Map([[1, { id: 1, nodeI: 1, nodeJ: 2, type: 'frame', sectionId: 1, materialId: 1, behaviour }]]),
      sections: new Map([[1, { ...section, id: 1 }]]), materials: new Map([[1, { id: 1, fy: 250, fu: 400, e: 200000 }]]), supports: new Map() };
    const contexts = memberContexts(model as never, new Map([[1, { elementForces: [ef], displacements: [], reactions: [] }]]) as never,
      [{ id: 1, name: 'C', factors: [] }]);
    expect(contexts).toHaveLength(1);
    expect(contexts[0]!.demands.every(d => d.forces.n === 0)).toBe(true);
    expect(contexts[0]!.tuples!.every(d => d.forces.n === 0)).toBe(true);
  });
}
