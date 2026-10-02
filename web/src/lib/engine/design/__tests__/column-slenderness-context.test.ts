/**
 * A slender concrete column reaches the verifier with its magnifier δns (§6.6.4). The design
 * contexts were built without it, and every column was checked with δns = 1.
 */
import { describe, it, expect } from 'vitest';
import { buildAllMemberContexts } from '../member-context';
import { checkSlender } from '../../codes/argentina/cirsoc201';
import type { ElementStationResult } from '../../station-design-forces';

function model(heightM: number) {
  return {
    nodes: new Map([[1, { id: 1, x: 0, y: 0, z: 0 }], [2, { id: 2, x: 0, y: 0, z: heightM }]]),
    elements: new Map([[1, { id: 1, nodeI: 1, nodeJ: 2, sectionId: 1, materialId: 1, type: 'frame' }]]),
    sections: new Map([[1, { id: 1, name: 'C30', b: 0.3, h: 0.3, a: 0.09, iy: 0.3 ** 4 / 12, iz: 0.3 ** 4 / 12 }]]),
    materials: new Map([[1, { id: 1, name: 'H-25', e: 23500, nu: 0.2, rho: 25, fy: 25 }]]),
    supports: new Map([[1, { nodeId: 1, type: 'pinned3d' }], [2, { nodeId: 2, type: 'pinned3d' }]]),
  };
}

// 800 kN, single curvature 40 → 40 kN·m about my.
const stations = (L: number): Map<number, ElementStationResult> => new Map([[1, {
  elementId: 1, length: L, stationTs: [0, 0.5, 1],
  comboResults: [{ comboId: 1, comboName: 'U1', stations: [0, 0.5, 1].map((t) => ({ t, x: t * L, n: -800, vy: 0, vz: 0, my: 40, mz: 0, torsion: 0 })) as never }],
}]]);

describe('column slenderness in the design contexts', () => {
  it('carries δns > 1 for a slender column, the value checkSlender gives', () => {
    const ctx = buildAllMemberContexts(model(6) as never, { stations: stations(6) }).get(1)!;
    expect(ctx.elementType).toBe('column');
    const hand = checkSlender({ fc: 25, fy: 420, cover: ctx.material.cover, b: 0.3, h: 0.3, stirrupDia: ctx.material.stirrupDia }, 800, 40, 6, { M1: 40, M2: 40, psiA: 20, psiB: 20 });
    expect(hand.isSlender).toBe(true);
    expect(ctx.slenderDeltaNs).toBeGreaterThan(1.05);
  });

  it('leaves a short column at 1', () => {
    const ctx = buildAllMemberContexts(model(1.5) as never, { stations: stations(1.5) }).get(1)!;
    expect(ctx.slenderDeltaNs).toBe(1);
  });

  it('keeps a value the caller states', () => {
    const ctx = buildAllMemberContexts(model(6) as never, { stations: stations(6), slenderDeltaNs: new Map([[1, 1.3]]) }).get(1)!;
    expect(ctx.slenderDeltaNs).toBe(1.3);
  });
});
