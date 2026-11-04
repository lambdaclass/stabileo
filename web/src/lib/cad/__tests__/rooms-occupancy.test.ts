import { describe, it, expect } from 'vitest';
import { roomOccupancyCandidates } from '../rooms';
import { findOccupancy } from '../../codes/cirsoc101/live-loads';

describe('room labels as occupancy suggestions', () => {
  it('suggests only rows the CIRSOC 101 table has, for every kind of room it knows', () => {
    const labels = ['DORMITORIO 1', 'Pasillo', 'ESTAR-COMEDOR', 'BAÑO', 'COCINA', 'BALCÓN', 'TERRAZA', 'ESCALERA', 'COCHERA', 'OFICINA 3', 'LOCAL 2', 'DEPÓSITO'];
    for (const l of labels) {
      const rows = roomOccupancyCandidates(l);
      expect(rows.length, l).toBeGreaterThan(0);
      for (const r of rows) expect(findOccupancy(r), `${l} → ${r}`).toBeDefined();
    }
    expect(roomOccupancyCandidates('SALA DE MÁQUINAS')).toEqual([]);
  });
});
