import { verifyElement as verifyConcurrent, type VerificationInput } from '../../codes/argentina/cirsoc201';
import { ConcurrentDemand } from '../../concurrent-demand';
import { verifyConcurrentElement } from '../../concurrent-verification';

export function verifyElement(input: VerificationInput) {
  const loads = [...new Set([input.Nu, ...(input.NuShear !== undefined ? [input.NuShear] : []), ...(input.axialLoads ?? [])])];
  const demands = ConcurrentDemand.fromStations({ elementId: input.elementId, length: input.Lu ?? 1, stationTs: [0],
    comboResults: loads.map((n, k) => ({ comboId: k, comboName: `manual ${k}`, stations: [{
      t: 0, x: 0, n: -n, mz: input.Mu, my: input.Muy ?? 0, vy: input.Vu,
      vz: input.VuSecondary ?? 0, torsion: input.Tu ?? 0,
    }] })) });
  const cases = demands.map(d => ({ ...input, demand: d.section('Mz') }));
  return cases.length === 1 ? verifyConcurrent(cases[0]!) : verifyConcurrentElement(cases);
}
