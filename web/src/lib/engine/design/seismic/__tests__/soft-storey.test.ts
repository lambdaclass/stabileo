import { describe, it, expect } from 'vitest';
import { amplify, storeyStiffness } from '../soft-storey';
import { seismicRoles } from '../classify';

describe('soft storeys', () => {
  // Four storeys, 100 kN at each floor; the ground storey drifts 30 mm against 10 mm above.
  const storeys = [3, 6, 9, 12].map((level, k) => ({ level, driftX: k === 0 ? 0.03 : 0.01, driftY: 0.01 }));
  const loads = [3, 6, 9, 12].map((z) => ({ z, fx: 100, fy: 100 }));

  it('reads each storey stiffness as its shear over its drift and flags the soft one', () => {
    const s = storeyStiffness(storeys, loads);
    // Ground: 400 kN / 0,03 m; first floor: 300 kN / 0,01 m.
    expect(s[0]!.kX).toBeCloseTo(13333.3, 0);
    expect(s[1]!.kX).toBeCloseTo(30000, 6);
    expect(s[0]!.soft).toBe(true);
    expect(s[1]!.soft).toBe(false);
    expect(s[0]!.ratio).toBeCloseTo(13333.33 / 30000, 3);
  });

  it('amplifies moments and shears only in the seismic combinations', () => {
    const st = { t: 0, x: 0, n: -500, vy: 10, vz: 20, my: 30, mz: 40, torsion: 0 };
    const stations = { elementId: 1, length: 3, stationTs: [0], comboResults: [{ comboId: 1, comboName: 'D', stations: [st] }, { comboId: 2, comboName: 'E', stations: [st] }] };
    const demands = { elementId: 1, length: 3, demands: [{ category: 'Mz+' as const, value: 40, absValue: 40, comboId: 2, comboName: 'E', stationT: 0, stationX: 0, forces: st }] };
    expect(amplify(stations, demands, new Set([2]), { moment: 1.5, shear: 2 })).toBe(true);
    expect(stations.comboResults[0]!.stations[0]!.my).toBe(30);
    expect(stations.comboResults[1]!.stations[0]!.my).toBe(45);
    expect(stations.comboResults[1]!.stations[0]!.vz).toBe(40);
    expect(stations.comboResults[1]!.stations[0]!.n).toBe(-500);
    expect(demands.demands[0]!.value).toBe(60);
  });
});

describe('primary and secondary members', () => {
  // Columns at x = 0 and x = 8; a beam line of two members between them; a beam carried by it at x = 4.
  const nodes = new Map([[1, { x: 0, y: 0, z: 0 }], [2, { x: 0, y: 0, z: 3 }], [3, { x: 8, y: 0, z: 0 }], [4, { x: 8, y: 0, z: 3 }], [5, { x: 4, y: 0, z: 3 }], [6, { x: 4, y: 5, z: 3 }], [7, { x: 4, y: 5, z: 0 }]]);
  const elements = new Map([[1, { id: 1, nodeI: 1, nodeJ: 2 }], [2, { id: 2, nodeI: 3, nodeJ: 4 }], [3, { id: 3, nodeI: 2, nodeJ: 5 }], [4, { id: 4, nodeI: 5, nodeJ: 4 }], [5, { id: 5, nodeI: 5, nodeJ: 6 }], [6, { id: 6, nodeI: 7, nodeJ: 6 }]]);
  const kind = (id: number) => (id === 1 || id === 2 || id === 6 ? 'column' : 'beam') as 'column' | 'beam';
  it('follows a beam line to the columns at both ends, and finds a beam carried by a beam', () => {
    const r = seismicRoles({ nodes, elements, kind });
    expect(r.get(3)).toBe('primary');
    expect(r.get(4)).toBe('primary');
    // Beam 5 runs from the girder at node 5 to the column at node 6: one end on a beam.
    expect(r.get(5)).toBe('secondary');
    expect(r.get(1)).toBe('primary');
    expect(seismicRoles({ nodes, elements, kind, overrides: { 5: 'primary' } }).get(5)).toBe('primary');
  });
});
