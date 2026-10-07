import { initSolver } from '../src/lib/engine/wasm-solver';
import { computeStationDemands, setCompactStationTransfer } from '../src/lib/engine/verification-service';
import type { AnalysisResults3D, ElementForces3D } from '../src/lib/engine/types-3d';
import type { AutoVerifyModelData } from '../src/lib/engine/auto-verify';

export async function benchmark() {
  await initSolver();
  const output = [];
  try {
    for (const members of [24, 128, 512]) {
      const model = { nodes: new Map(), elements: new Map() } as AutoVerifyModelData;
      for (let i = 1; i <= members; i++) {
        model.nodes.set(i, { id: i, x: i * 6, y: 0, z: 0 });
        model.nodes.set(i + 1, { id: i + 1, x: (i + 1) * 6, y: 0, z: 0 });
        model.elements.set(i, { id: i, nodeI: i, nodeJ: i + 1, sectionId: 1, materialId: 1, type: 'frame' });
      }
      const results = new Map<number, AnalysisResults3D>();
      for (let combo = 1; combo <= 12; combo++) {
        const elementForces: ElementForces3D[] = Array.from({ length: members }, (_, i) => ({
          elementId: i + 1, length: 6, nStart: -300 * combo, nEnd: -300 * combo,
          vyStart: 10 * combo, vyEnd: -10 * combo, vzStart: 20 * combo, vzEnd: -20 * combo,
          mxStart: combo, mxEnd: combo, myStart: 0, myEnd: 0, mzStart: 0, mzEnd: 0,
          qYI: -10 * combo / 3, qYJ: -10 * combo / 3, qZI: -20 * combo / 3, qZJ: -20 * combo / 3,
          releaseMyStart: false, releaseMyEnd: false, releaseMzStart: false, releaseMzEnd: false,
          releaseTStart: false, releaseTEnd: false,
          distributedLoadsY: [], distributedLoadsZ: [], pointLoadsY: [], pointLoadsZ: [],
        }));
        results.set(combo, { elementForces, displacements: [], reactions: [] });
      }
      const times: number[][] = [[], []];
      let reference = '';
      for (let round = 0; round < 6; round++) {
        for (const compact of round % 2 ? [true, false] : [false, true]) {
          setCompactStationTransfer(compact);
          const start = performance.now();
          const result = computeStationDemands(results, [], model);
          const ms = performance.now() - start;
          const serialized = JSON.stringify({ stations: [...result.stations], demands: [...result.demands] });
          if (!reference) reference = serialized;
          if (serialized !== reference) throw new Error('Station transfer output differs');
          if (round) times[Number(compact)].push(ms);
          await new Promise(resolve => setTimeout(resolve, 0));
        }
      }
      const medians = times.map(t => [...t].sort((a, b) => a - b)[2]);
      output.push({ members, combinations: 12, stations: 11, referenceMs: medians[0], compactMs: medians[1],
        speedup: medians[0] / medians[1], times, equivalent: true });
    }
    return output;
  } finally { setCompactStationTransfer(true); }
}
