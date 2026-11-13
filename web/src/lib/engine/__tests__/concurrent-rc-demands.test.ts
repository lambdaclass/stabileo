import { verifyElement as verifyConcurrent } from '../codes/argentina/cirsoc201';
import { describe, expect, it } from 'vitest';
import { autoVerifyFromResults, type AutoVerifyModelData } from '../auto-verify';
import { extractGoverningDemands, computeColumnLayout, computeColumnCapacity, type ElementStationResult, type StationForces } from '../station-design-forces';
import { normalizeCirsoc201 } from '../design-check-results';
import { verifyElement, REBAR_DB } from '../codes/argentina/cirsoc201';
import { runUnifiedVerification, runCirsocDesign, steelDemandOf } from '../verification-service';
import { maskDemands } from '../design/behaviour-demands';
import type { AnalysisResults3D } from '../types-3d';

const knownWrong = it.skipIf(process.env.RUN_KNOWN_WRONG_1316 !== '1');
const force = (n: number, my: number, mz = 0, t = 0): StationForces => ({ n, my, mz, vy: 5, vz: 10, torsion: 0, t, x: 0.4 * t });
const stations = (pairs: StationForces[][]): ElementStationResult => ({
  elementId: 1, length: 0.4, stationTs: [0, 1],
  comboResults: pairs.map((s, i) => ({ comboId: i + 1, comboName: ['gravity', 'wind', 'interior'][i]!, stations: s })),
});
const model = (beam = false): AutoVerifyModelData => ({
  elements: new Map([[1, { id: 1, nodeI: 1, nodeJ: 2, sectionId: 1, materialId: 1, type: 'frame' }]]),
  nodes: new Map([[1, { id: 1, x: 0, y: 0, z: 0 }], [2, { id: 2, x: beam ? 0.4 : 0, y: 0, z: beam ? 0 : 0.4 }]]),
  sections: new Map([[1, { id: 1, name: '400 square', b: 0.4, h: 0.4 }]]),
  materials: new Map([[1, { id: 1, name: 'H30', fc: 30, fy: 30, e: 25000000 }]]),
  supports: new Map([[1, { id: 1, nodeId: 1, type: 'fixed' }], [2, { id: 2, nodeId: 2, type: 'fixed' }]]),
});
const results = (s: StationForces): AnalysisResults3D => ({ elementForces: [{
  elementId: 1, length: 0.4, nStart: s.n, nEnd: s.n,
  myStart: s.my, myEnd: s.my, mzStart: s.mz, mzEnd: s.mz,
  vyStart: s.vy, vyEnd: s.vy, vzStart: s.vz, vzEnd: s.vz, mxStart: s.torsion, mxEnd: s.torsion,
  hingeStart: false, hingeEnd: false, qYI: 0, qYJ: 0, qZI: 0, qZJ: 0,
  distributedLoadsY: [], distributedLoadsZ: [], pointLoadsY: [], pointLoadsZ: [],
}] } as unknown as AnalysisResults3D);
const run = (esr: ElementStationResult, edition: '2005' | '2025' = '2025', beam = false) => autoVerifyFromResults(
  results(esr.comboResults[0]!.stations[0]!), model(beam), null, { edition }, new Map([[1, extractGoverningDemands(esr)]]),
).concrete[0]!;

function handMomentAtAxial(n: number, count: number, diameter: number, edition: '2005' | '2025') {
  const layout = computeColumnLayout(count, diameter, 0.4, 0.4, 0.025, 8);
  const state = (c: number) => {
    const a = Math.min(0.4, (0.85 - 0.05 * (30 - 28) / 7) * c);
    let pn = 0.85 * 30000 * 0.4 * a;
    let mn = pn * (0.2 - a / 2);
    let epsilonT = 0;
    for (const bar of layout.bars) {
      const depth = 0.4 - bar.y;
      const strain = 0.003 * (c - depth) / c;
      epsilonT = Math.max(epsilonT, -strain);
      const stress = Math.max(-420000, Math.min(420000, 200000000 * strain));
      const f = (stress - (depth <= a ? 0.85 * 30000 : 0)) * REBAR_DB.find(r => r.diameter === bar.diameter)!.area * 1e-4;
      pn += f;
      mn += f * (0.2 - depth);
    }
    const end = edition === '2005' ? 0.005 : 420 / 200000 + 0.003;
    const phi = Math.max(0.65, Math.min(0.9, 0.65 + 0.25 * (epsilonT - 420 / 200000) / (end - 420 / 200000)));
    return { pn: phi * pn, mn: phi * mn };
  };
  let lo = 0.000001, hi = 4;
  for (let i = 0; i < 100; i++) {
    const mid = (lo + hi) / 2;
    if (state(mid).pn < n) lo = mid; else hi = mid;
  }
  return state((lo + hi) / 2).mn;
}

describe('concurrent design demands #1316', () => {
  knownWrong('known wrong result: #1316 — issue e2 equivalent keeps wind N with wind M and its name; hand equilibrium', () => {
    const esr = stations([[force(-257.36, 86.53234137)], [force(-210.8416155, 88.8908859)]]);
    const v = run(esr);
    const c = v.column!;
    const capacity = handMomentAtAxial(210.8416155, c.barCount, c.barDia, '2025');
    const expected = 1 / Number((capacity / 88.8908859).toFixed(3));
    expect(c.ratio).toBeCloseTo(expected, 10);
    expect(c.Nu).toBe(210.8416155);
    expect(c.Mu).toBe(88.8908859);
    const row = normalizeCirsoc201([v], new Map([[1, '400 square']]))[0]!.checks.find(c => c.name === 'Axial + Moment')!;
    expect(row.comboName).toBe('wind');
    expect(row.demand).toBe(210.8416155);
  });

  for (const edition of ['2005', '2025'] as const) {
    for (const n of [100, 0, -100, 1200, 2200]) {
      knownWrong(`known wrong result: #1316 — ${edition}, signed N=${n}, every station and combination including non-extrema`, () => {
        const esr = stations([[force(-300, 20), force(-300, 20, 0, 1)], [force(-n, 65), force(-n, 65, 0, 1)], [force(-200, 55, 0, 0.5)]]);
        const v = run(esr, edition);
        const c = v.column!;
        const layout = computeColumnLayout(c.barCount, c.barDia, v.b, v.h, v.cover, 8);
        const expected = esr.comboResults.flatMap(cr => cr.stations.map(s => ({ s, cr, cap: computeColumnCapacity(
          layout.totalArea, v.b, v.h, v.fc, v.fy, v.cover, 8, -s.n, s.my, layout.bars, 'z', edition,
        ) }))).sort((a, b) => 1 / b.cap.ratio - 1 / a.cap.ratio)[0]!;
        expect(c.ratio).toBe(1 / expected.cap.ratio);
        expect(c.Nu).toBe(-expected.s.n);
        expect(c.Mu).toBe(Math.abs(expected.s.my));
        expect((v.governingCombos as any)?.column).toMatchObject({ comboName: expected.cr.comboName, stationT: expected.s.t });
        const control = run(stations([[force(-300, 20)]]), edition);
        const single = verifyElement({ elementId: 1, elementType: 'column', Mu: 20, Vu: 10, Nu: 300, NuShear: 300,
          b: 0.4, h: 0.4, fc: 30, fy: 420, cover: 0.025, stirrupDia: 8, edition });
        expect(control.column!.ratio).toBe(single.column!.ratio);
      });
    }
  }

  for (const beam of [false, true]) {
    knownWrong(`known wrong result: #1316 — ${beam ? 'beam axial-flexure and V–T' : 'column N–My–Mz'} sweeps complete tuples`, () => {
      const a = { ...force(-200, 30, 55), torsion: 12, vz: 8 };
      const b = { ...force(-100, 65, 5), torsion: 2, vz: 90 };
      const esr = stations([[a], [b]]);
      const v = run(esr, '2025', beam);
      expect((v as any).concurrentChecks).toHaveLength(2);
      expect((v as any).concurrentChecks.map((x: any) => [x.demand.comboName, x.demand.forces.n, x.demand.forces.my, x.demand.forces.mz, x.demand.forces.torsion]))
        .toEqual([['gravity', -200, 30, 55, 12], ['wind', -100, 65, 5, 2]]);
      expect(normalizeCirsoc201([v], new Map())[0]!.checks.every(c => !c.comboName?.startsWith('N '))).toBe(true);
    });
  }

  knownWrong('known wrong result: #1316 — demand extraction retains intermediate stations, steel reads the same tuples, masking preserves concurrency', () => {
    const esr = stations([[force(-300, 50)], [force(-100, 70)], [force(10, 60, 0, 0.5)]]);
    const d = extractGoverningDemands(esr);
    expect((d as any).concurrent).toHaveLength(3);
    const steel = steelDemandOf(results(esr.comboResults[0]!.stations[0]!).elementForces[0]!, d);
    expect(steel.tuples).toHaveLength(3);
    const masked = maskDemands(d, 'compressionOnly');
    expect((masked as any).concurrent.map((x: any) => x.forces.n)).toEqual([-300, -100, 0]);
  });

  knownWrong('known wrong result: #1316 — all RC orchestration entry points keep the same concurrent governing pair', () => {
    const esr = stations([[force(-300, 20)], [force(-100, 65)]]);
    const r = results(esr.comboResults[0]!.stations[0]!);
    const d = new Map([[1, extractGoverningDemands(esr)]]);
    const unified = runUnifiedVerification(r, model(), null, d)[0]!;
    const design = runCirsocDesign(r, model(), d, new Map(), null);
    expect((unified.governingCombos as any)?.column?.comboName).toBe('wind');
    expect(design.concrete[0]!.column).toEqual(unified.column);
    expect(design.normalized[0]!.checks.find(c => c.name === 'Axial + Moment')!.comboName).toBe('wind');
  });

  knownWrong('known wrong result: #1316 — an envelope with provenance and no concurrent data is refused, a real single result is answered', () => {
    const r = results(force(-300, 50));
    expect(() => autoVerifyFromResults(r, model(), new Map([[1, {} as never]]))).toThrow(/concurrent/i);
    expect(autoVerifyFromResults(r, model(), null).concrete[0]!.column!.ratio).toBeGreaterThan(0);
  });
});

knownWrong('known wrong result: #1316 — explicit wall verification projects only the concurrent N–M packet, with hand equilibrium', () => {
  const esr = stations([[force(-257.36, 86.53234137)], [force(-210.8416155, 88.8908859)]]);
  const d = extractGoverningDemands(esr) as any;
  const v = verifyConcurrent({ elementId: 1, elementType: 'wall', b: 0.4, h: 0.4, fc: 30, fy: 420, cover: 0.025, stirrupDia: 8,
    Mu: 88.8908859, Nu: 257.36, Vu: 10, demand: d.concurrent?.[1]?.section('My') } as any);
  const c = v.column!;
  const capacity = handMomentAtAxial(210.8416155, c.barCount, c.barDia, '2025');
  expect(c.ratio).toBeCloseTo(1 / Number((capacity / 88.8908859).toFixed(3)), 10);
  expect(c.Nu).toBe(210.8416155);
  expect(v.elementType).toBe('wall');
});
