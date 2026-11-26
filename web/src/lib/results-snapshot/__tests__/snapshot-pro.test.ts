/** Results snapshot gate (#716), the `pro` cases of `corpus.ts`. See `run-group.ts`. */
import { readFileSync } from 'node:fs';
import { beforeAll, expect, it } from 'vitest';
import { compareValues, formatCaseReport, parseSnapshot, storeNumber } from '../../../../scripts/results-snapshot/compare.mjs';
import { quadSelfWeightLoads } from '../../engine/solver-shells';
import { modelStore } from '../../store/model.svelte';
import { resultsStore } from '../../store/results.svelte';
import { capture } from '../capture';
import { CORPUS } from '../corpus';
import { initSolver } from '../../engine/wasm-solver';
import { runGroup, snapshotFile } from '../run-group';

beforeAll(async () => { await initSolver(); });
// These shells retain their numerical results with the mandatory #810 warning.
runGroup('pro', {
  'pro-deep-beam-shell': ['warning:SH-MITC4-CONVERGENCE'],
  'pro-rc-qa-diagnostic-shells': ['warning:SH-MITC4-CONVERGENCE', 'warning:LIN-SECOND-ORDER-UNBOUNDED'],
  'pro-mat-foundation': ['warning:SH-MITC4-CONVERGENCE'],
});

const matFoundation = process.env.RUN_KNOWN_WRONG === '2586' ? it : it.skip;
matFoundation('known wrong result: #2586 pro-mat-foundation weights and moment samples follow equilibrium', async () => {
  const name = 'pro-mat-foundation';
  const fresh = await capture(CORPUS.find(c => c.name === name)!);
  expect(fresh.values['solve.ok']).toBe(true);

  const { quads, materials, nodes } = modelStore;
  expect(quads.size).toBeGreaterThan(0);
  for (const quad of quads.values()) {
    const [a, b, c, d] = quad.nodes.map(id => nodes.get(id)!);
    expect([b!.y, c!.x, d!.y, d!.x]).toEqual([a!.y, b!.x, c!.y, a!.x]);
    expect([b!.z, c!.z, d!.z]).toEqual([a!.z, a!.z, a!.z]);
    const area = Math.abs((b!.x - a!.x) * (d!.y - a!.y));
    const integralOfCornerShape = area * (1 / 2) * (1 / 2);
    const weight = materials.get(quad.materialId)!.rho! * quad.thickness * integralOfCornerShape;
    const forces = quadSelfWeightLoads(new Map([[quad.id, quad]]), nodes, materials);
    expect(forces).toHaveLength(4);
    for (const [i, force] of forces.entries()) {
      expect(force.type).toBe('nodal');
      if (force.type !== 'nodal') throw new Error('Expected a corner force');
      expect(force.data.nodeId).toBe(quad.nodes[i]);
      expect(force.data.fz).toBeCloseTo(-weight, 12);
    }
  }

  const combinations = [...resultsStore.perCombo3D.values()];
  expect(combinations.length).toBeGreaterThan(0);
  const expectedMoments: Record<string, number> = {};
  const members = resultsStore.envelope3D!.momentY.elements;
  expect(members).toHaveLength(modelStore.elements.size);
  for (const member of members) {
    const forces = combinations.map(c => c.elementForces.find(f => f.elementId === member.elementId)!);
    for (const f of forces) {
      expect(f.pointLoadsZ ?? []).toEqual([]);
      for (const load of f.distributedLoadsZ ?? []) {
        expect([load.a, load.b, load.qJ]).toEqual([0, f.length, load.qI]);
      }
      expect(f.qZI ?? 0).toBe(f.qZJ ?? 0);
      const q = f.qZI ?? 0;
      const stationaryT = -f.vzStart / (q * f.length);
      if (stationaryT > 0 && stationaryT < 1) {
        expect(Math.min(...member.tPositions.map(t => Math.abs(t - stationaryT)))).toBeCloseTo(0, 12);
      }
    }
    for (const [i, t] of member.tPositions.entries()) {
      const moments = forces.map(f => {
        const x = f.length * t;
        return f.myStart + f.vzStart * x + (f.qZI ?? 0) * x ** 2 / 2;
      });
      const positive = Math.max(0, ...moments);
      const negative = Math.min(0, ...moments);
      expect(member.posValues[i]).toBeCloseTo(positive, 9);
      expect(member.negValues[i]).toBeCloseTo(negative, 9);
      const path = `envelope.momentY[e${member.elementId}]`;
      expectedMoments[`${path}.posValues[${i}]`] = storeNumber(positive);
      expectedMoments[`${path}.negValues[${i}]`] = storeNumber(negative);
    }
  }

  const baseline = parseSnapshot(readFileSync(snapshotFile(name), 'utf8'));
  const recordedMoments = Object.fromEntries(Object.entries(baseline.values)
    .filter(([key]) => /^envelope\.momentY\[e\d+\]\.(pos|neg)Values\[/.test(key)));
  const diff = compareValues(recordedMoments, expectedMoments);
  expect(diff.differs, formatCaseReport(name, diff)).toBe(false);
});
