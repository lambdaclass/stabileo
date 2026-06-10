/**
 * Mesh ↔ frame node-sharing geometry (PR [8] QA-B).
 *
 * Pins the primitives behind the mesh generator's "weld to existing node" and
 * "split surrounding beams" behaviours, and documents the answer to the
 * connectivity question: shells couple to beams ONLY through shared nodes, so a
 * mesh node sitting on a beam must split that beam (or reuse its node) to
 * transfer load — otherwise the beam carries load only at the original corners.
 */
import { describe, it, expect } from 'vitest';
import { findCoincidentNode, beamThrough, type NodeLike, type ElemLike } from '../mesh-weld';

const nodes: NodeLike[] = [
  { id: 1, x: 0, y: 0, z: 0 },
  { id: 2, x: 6, y: 0, z: 0 },     // beam 1: node 1 -> node 2 along +X
  { id: 3, x: 3, y: 4, z: 0 },
];
const elements: ElemLike[] = [{ id: 10, nodeI: 1, nodeJ: 2 }];
const byId = (id: number) => nodes.find(n => n.id === id);

describe('findCoincidentNode', () => {
  it('reuses an existing node within tolerance', () => {
    expect(findCoincidentNode(nodes, 6, 0, 0)).toBe(2);
    expect(findCoincidentNode(nodes, 6 + 5e-5, -3e-5, 0)).toBe(2); // within 1e-4
  });
  it('returns null when nothing coincides', () => {
    expect(findCoincidentNode(nodes, 1.5, 0, 0)).toBeNull(); // on the beam but no node there
    expect(findCoincidentNode(nodes, 3, 2, 0)).toBeNull();
  });
});

describe('beamThrough', () => {
  it('finds the beam a mid-edge mesh node lies on, with the right t', () => {
    const hit = beamThrough(byId, elements, 1.5, 0, 0);
    expect(hit).not.toBeNull();
    expect(hit!.id).toBe(10);
    expect(hit!.t).toBeCloseTo(0.25, 6); // 1.5 / 6
  });
  it('ignores the endpoints (already shared, not a split site)', () => {
    expect(beamThrough(byId, elements, 0, 0, 0)).toBeNull();
    expect(beamThrough(byId, elements, 6, 0, 0)).toBeNull();
  });
  it('ignores points off the beam line', () => {
    expect(beamThrough(byId, elements, 3, 1, 0)).toBeNull(); // 1 m off the X axis
  });
  it('handles a 3D-skew beam (projection + distance check)', () => {
    const n3d: NodeLike[] = [{ id: 1, x: 0, y: 0, z: 0 }, { id: 2, x: 4, y: 0, z: 3 }];
    const e: ElemLike[] = [{ id: 5, nodeI: 1, nodeJ: 2 }];
    const mid = beamThrough((id) => n3d.find(n => n.id === id), e, 2, 0, 1.5);
    expect(mid?.t).toBeCloseTo(0.5, 6);
    expect(beamThrough((id) => n3d.find(n => n.id === id), e, 2, 0, 0)).toBeNull(); // off the skew line
  });
});
