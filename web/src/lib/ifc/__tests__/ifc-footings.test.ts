/**
 * Footings read from a file, placed under what they carry: a pad 2,40 × 1,60 turned 30°, its centre
 * 0,50 m off its column along its own long side; a strip under a wall; a pad with nothing to carry.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { modelStore, historyStore } from '../../store';
import { placeFootings } from '../ifc-footings';

describe('footings from a file', () => {
  beforeEach(() => { modelStore.clear(); historyStore.clear(); });

  it('go under the column in their plan, with their rectangle, rotation and eccentricity', () => {
    const a = modelStore.addNode(0, 0, -2.5), b = modelStore.addNode(0, 0, 0);
    modelStore.addElement(a, b, 'frame');
    const w = [modelStore.addNode(5, 0, -2.5), modelStore.addNode(9, 0, -2.5), modelStore.addNode(9, 0, 0), modelStore.addNode(5, 0, 0)];
    modelStore.addQuad(w as [number, number, number, number], 1, 0.25);
    const t = Math.PI / 6;
    const r = placeFootings([
      { id: 1, kind: 'pad', name: 'P1', centre: { x: 0.5 * Math.cos(t), y: 0.5 * Math.sin(t) }, length: 2.4, width: 1.6, angle: 30, zBottom: -3.2, zTop: -2.5 },
      { id: 2, kind: 'strip', name: 'M1', centre: { x: 7, y: 0 }, length: 4, width: 0.8, angle: 0, zBottom: -3.05, zTop: -2.5 },
      { id: 3, kind: 'pad', name: 'P9', centre: { x: 30, y: 30 }, length: 2, width: 2, angle: 0, zBottom: -3.2, zTop: -2.5 },
    ]);
    expect(r).toMatchObject({ placed: 2, skipped: ['P9'] });
    const [p1, m1] = [...modelStore.model.footings.values()];
    expect(p1).toMatchObject({ name: 'P1', nodeId: a, kind: 'isolated', B: 2.4, L: 1.6, rotationDeg: 30, foundingElevation: -3.2 });
    expect(p1!.thickness).toBeCloseTo(0.7, 9);
    expect(p1!.eccentricityB).toBeCloseTo(0.5, 9); expect(p1!.eccentricityL).toBeCloseTo(0, 9);
    expect(m1).toMatchObject({ name: 'M1', kind: 'strip', B: 4, L: 0.8 });
    // Both feet of the wall stand on the strip: one is its node, the other a node it carries too.
    expect([m1!.nodeId, ...(m1!.supportedNodeIds ?? [])].sort()).toEqual([w[0], w[1]].sort());
  });

  it('declare an eccentric pad balanced by the foundation beam its foot leaves, with the beam\'s section', () => {
    const sec = modelStore.addSection({ name: '40×50', a: 0.2, iy: 0.004, iz: 0.003, b: 0.4, h: 0.5, shape: 'rect' } as never);
    const c1 = [modelStore.addNode(0, 0, -2.5), modelStore.addNode(0, 0, 0)], c2 = [modelStore.addNode(5, 0, -2.5), modelStore.addNode(5, 0, 0)];
    modelStore.addElement(c1[0]!, c1[1]!, 'frame'); modelStore.addElement(c2[0]!, c2[1]!, 'frame');
    const mid = modelStore.addNode(2.5, 0, -2.5);
    const s1 = modelStore.addElement(c1[0]!, mid, 'frame'), s2 = modelStore.addElement(mid, c2[0]!, 'frame');
    for (const e of [s1, s2]) modelStore.updateElement(e, { sectionId: sec } as never);
    modelStore.addGroup('VF1', 'physicalMember', { elements: [s1, s2] }, { data: { kind: 'beam', provenance: 'declared', typology: 'foundation' } });
    const r = placeFootings([
      { id: 1, kind: 'pad', name: 'P1', centre: { x: 0.6, y: 0 }, length: 1.6, width: 2.4, angle: 0, zBottom: -3.2, zTop: -2.5 },
      { id: 2, kind: 'pad', name: 'P2', centre: { x: 5, y: 0 }, length: 2.4, width: 2.4, angle: 0, zBottom: -3.2, zTop: -2.5 },
    ]);
    // Each pad the beam leaves is tied by it to the other: the offset of one, the moments of both.
    expect(r).toMatchObject({ placed: 2, straps: 2 });
    const [p1, p2] = [...modelStore.model.footings.values()];
    expect(p1!.straps).toEqual([{ toFootingId: p2!.id, b: 0.4, h: 0.5 }]);
    expect(p2!.straps).toEqual([{ toFootingId: p1!.id, b: 0.4, h: 0.5 }]);
  });

  it('tie a pad to the strip a foundation beam reaches, at the wall node nearest the beam\'s end', () => {
    const sec = modelStore.addSection({ name: '40×60', a: 0.24, iy: 0.0072, iz: 0.0032, b: 0.4, h: 0.6, shape: 'rect' } as never);
    const c = [modelStore.addNode(0, 0, -2.5), modelStore.addNode(0, 0, 0)];
    modelStore.addElement(c[0]!, c[1]!, 'frame');
    // A wall along y at x = 4, from y = −2 to 2, its feet at y = −2, 0,1 and 2.
    const feet = [modelStore.addNode(4, -2, -2.5), modelStore.addNode(4, 0.1, -2.5), modelStore.addNode(4, 2, -2.5)];
    const heads = [modelStore.addNode(4, -2, 0), modelStore.addNode(4, 0.1, 0), modelStore.addNode(4, 2, 0)];
    modelStore.addQuad([feet[0]!, feet[1]!, heads[1]!, heads[0]!], 1, 0.25); modelStore.addQuad([feet[1]!, feet[2]!, heads[2]!, heads[1]!], 1, 0.25);
    // The beam stops at the wall's outer face, x = 4,2, off any node of it.
    const end = modelStore.addNode(4.2, 0, -2.5);
    const s1 = modelStore.addElement(c[0]!, end, 'frame');
    modelStore.updateElement(s1, { sectionId: sec } as never);
    modelStore.addGroup('VF1', 'physicalMember', { elements: [s1] }, { data: { kind: 'beam', provenance: 'declared', typology: 'foundation' } });
    placeFootings([
      { id: 1, kind: 'pad', name: 'P1', centre: { x: 0, y: 0 }, length: 2, width: 2, angle: 0, zBottom: -3.2, zTop: -2.5 },
      { id: 2, kind: 'strip', name: 'M1', centre: { x: 4.1, y: 0 }, length: 4.4, width: 0.8, angle: 90, zBottom: -3.05, zTop: -2.5 },
    ]);
    const [p1, m1] = [...modelStore.model.footings.values()];
    const at = p1!.straps![0]!;
    expect(at.toFootingId).toBe(m1!.id);
    expect(at.nodeId ?? m1!.nodeId).toBe(feet[1]);
  });
});
