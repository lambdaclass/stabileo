import { expect, it } from 'vitest';
import { buildAllMemberContexts, type ContextModelData } from '../member-context';
import { designMember } from '../candidate-search';
import { cirsoc201Adapter, cirsoc201Adapter2005 } from '../adapters/cirsoc201-adapter';
import type { ElementStationResult } from '../../station-design-forces';

const model = {
  nodes: new Map([[1, { id: 1, x: 0, y: 0, z: 0 }], [2, { id: 2, x: 0.4, y: 0, z: 0 }]]),
  elements: new Map([[1, { id: 1, nodeI: 1, nodeJ: 2, sectionId: 1, materialId: 1, type: 'frame' }]]),
  sections: new Map([[1, { id: 1, name: 'RC', b: 0.3, h: 0.6 }]]),
  materials: new Map([[1, { id: 1, name: 'H25', fc: 25, fy: 25 }]]),
  supports: new Map([[1, { nodeId: 1, type: 'fixed' }]]),
} as ContextModelData;
const force = { t: 0, x: 0, n: 0, my: 0, mz: 20, vy: 0, vz: 0, torsion: 0 };
const demands = new Map([[1, { elementId: 1, length: 0.4, demands: [{ category: 'Mz+' as const, value: 20, absValue: 20, stationT: 0, stationX: 0, comboId: 1, comboName: 'C1', forces: force }] }]]);
for (const adapter of [cirsoc201Adapter, cirsoc201Adapter2005]) for (const groups of [[false], [true, false], [false, true]]) {
  for (const manualContext of [false, true]) it(`#2080 ${adapter.version} design refuses incomplete station groups ${groups} manualContext=${manualContext}`, () => {
    const stations: ElementStationResult = { elementId: 1, length: 0.4, stationTs: [0], comboResults: groups.map((populated, i) => ({
      comboId: i + 1, comboName: `C${i + 1}`, stations: populated ? [force] : [],
    })) };
    const ctx = buildAllMemberContexts(model, { demands, stations: new Map([[1, stations]]) }).get(1)!;
    if (manualContext) ctx.blocking = [];
    const out = designMember(adapter, ctx);
    expect(out.outcome).toBe('DEMAND_UNAVAILABLE');
    expect(out.limiting).toContain('missingDemand');
    expect(out.searchStats.verifierCalls).toBe(0);
    expect(out.accepted).toBeUndefined();
    expect(out.certificate).toBeUndefined();
  });
}
for (const groups of [[true], [true, true]]) it(`complete groups ${groups} including zero forces remain valid input`, () => {
  const ctx = buildAllMemberContexts(model, { demands, stations: new Map([[1, { elementId: 1, length: 0.4, stationTs: [0], comboResults: groups.map((_, i) => ({ comboId: i + 1, comboName: `C${i + 1}`, stations: [i === 0 ? force : { ...force, mz: 0 }] })) }]]) }).get(1)!;
  expect(cirsoc201Adapter.validateInputs(ctx).ok).toBe(true);
});
