/**
 * A one-way member is verified only in the sense it works (P9), and a member out of the analysis
 * is not verified at all.
 *
 * A slender brace carries compression in the result handed to the checker (as a superposed
 * combination can sum to): as a linear member it fails in buckling; as a tension-only member or a
 * cable it is checked in tension only and passes; inactive, it is not checked.
 */
import { describe, it, expect } from 'vitest';
import { runSteelVerification } from '../verification-service';
import type { AnalysisResults3D } from '../types-3d';

/** IPE 200, app catalogue values, SI; 5 m long its weak-axis critical load is about 112 kN. */
const IPE200 = { id: 1, name: 'IPE 200', a: 28.5e-4, iy: 1943e-8, iz: 142e-8, h: 0.200, b: 0.100, tw: 0.0056, tf: 0.0085, j: 6.98e-8, shape: 'I' };
const STEEL = { id: 1, name: 'F-24', fy: 235, fu: 360, e: 200_000 };

function model(behaviour?: string) {
  return {
    nodes: new Map([[1, { id: 1, x: 0, y: 0, z: 0 }], [2, { id: 2, x: 5, y: 0, z: 0 }]]),
    elements: new Map<number, any>([[1, { id: 1, nodeI: 1, nodeJ: 2, sectionId: 1, materialId: 1, type: 'frame', ...(behaviour ? { behaviour } : {}) }]]),
    sections: new Map([[1, IPE200]]),
    materials: new Map([[1, STEEL]]),
  } as never;
}
/** 300 kN of compression along the whole member, nothing else. */
const compressed = {
  displacements: [], reactions: [],
  elementForces: [{ elementId: 1, length: 5, nStart: -300, nEnd: -300, vyStart: 0, vyEnd: 0, vzStart: 0, vzEnd: 0, mxStart: 0, mxEnd: 0, myStart: 0, myEnd: 0, mzStart: 0, mzEnd: 0 }],
} as unknown as AnalysisResults3D;

describe('one-way members in the steel check', () => {
  it('a linear brace under this compression fails in buckling', () => {
    const [v] = runSteelVerification(compressed, model());
    expect(v!.overallStatus).toBe('fail');
    expect(v!.compression?.status).toBe('fail');
  });

  it.each(['tensionOnly', 'cable'])('a %s brace is checked in tension only', (b) => {
    const [v] = runSteelVerification(compressed, model(b));
    expect(v).toBeDefined();
    expect(v!.overallStatus).toBe('ok');
    expect(v!.Nu).toBe(0);
  });

  it('an inactive member is not verified', () => {
    expect(runSteelVerification(compressed, model('inactive'))).toEqual([]);
  });
});
