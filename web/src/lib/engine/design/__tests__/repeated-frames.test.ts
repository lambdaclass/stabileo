/**
 * Repeated frames: lines with the same spans and sections, read either way, and the copy that
 * maps member to member, turning a member's bars end for end where the two run opposite ways.
 */
import { describe, it, expect } from 'vitest';
import { beamLines, mapLines, mirrorReinforcement, repeatedFrames } from '../repeated-frames';

/** Two-span lines along X at y = 0 (drawn left to right) and y = 5 (drawn right to left), and a 3-span one. */
function model() {
  const nodes = new Map<number, { id: number; x: number; y: number; z: number }>();
  const elements = new Map<number, { id: number; nodeI: number; nodeJ: number; sectionId: number; materialId: number; type: string }>();
  let nid = 0;
  const node = (x: number, y: number, z: number) => { nodes.set(++nid, { id: nid, x, y, z }); return nid; };
  const el = (id: number, i: number, j: number, sec: number) => elements.set(id, { id, nodeI: i, nodeJ: j, sectionId: sec, materialId: 1, type: 'frame' });
  // y = 0: spans 6 (section 1) then 4 (section 2), left to right.
  const a = [node(0, 0, 3), node(6, 0, 3), node(10, 0, 3)];
  el(1, a[0]!, a[1]!, 1); el(2, a[1]!, a[2]!, 2);
  // y = 5: the same spans, drawn from x = 10 back to x = 0.
  const b = [node(10, 5, 3), node(6, 5, 3), node(0, 5, 3)];
  el(3, b[0]!, b[1]!, 2); el(4, b[1]!, b[2]!, 1);
  // y = 10: mirrored, 4 then 6: the same frame read the other way.
  const c = [node(0, 10, 3), node(4, 10, 3), node(10, 10, 3)];
  el(5, c[0]!, c[1]!, 2); el(6, c[1]!, c[2]!, 1);
  // y = 15: a different frame.
  const d = [node(0, 15, 3), node(5, 15, 3), node(10, 15, 3)];
  el(7, d[0]!, d[1]!, 1); el(8, d[1]!, d[2]!, 1);
  return { nodes, elements, sections: new Map([[1, { id: 1, name: 'V1', b: 0.2, h: 0.5 }], [2, { id: 2, name: 'V2', b: 0.2, h: 0.4 }]]), materials: new Map(), supports: new Map() } as never;
}

describe('repeated frames', () => {
  const lines = beamLines(model());
  const at = (id: number) => lines.find((l) => l.members.includes(id))!;

  it('orders each line along +X and says which members run against it', () => {
    expect(at(1).members).toEqual([1, 2]);
    expect(at(1).forward).toEqual([true, true]);
    expect(at(3).members).toEqual([4, 3]);
    expect(at(3).forward).toEqual([false, false]);
    expect(at(1).signature).toEqual(['6000:1', '4000:2']);
  });

  it('groups the lines that repeat, either way, and leaves the different one out', () => {
    const g = repeatedFrames(lines);
    expect(g).toHaveLength(1);
    expect(g[0]!.lines.map((l) => l.members[0]).sort()).toEqual([1, 4, 5]);
  });

  it('maps member to member and turns the bars where the senses differ', () => {
    // y = 0 → y = 5: member 1 onto 4 (drawn backwards), 2 onto 3 (drawn backwards).
    expect(mapLines(at(1), at(3))).toEqual([{ target: 4, source: 1, mirror: true }, { target: 3, source: 2, mirror: true }]);
    // y = 0 → y = 10: the line read the other way; 5 (4 m) takes 2, 6 (6 m) takes 1, both turned.
    expect(mapLines(at(1), at(5))).toEqual([{ target: 5, source: 2, mirror: true }, { target: 6, source: 1, mirror: true }]);
    expect(mapLines(at(1), at(7))).toBeNull();
  });

  it('turning a member end for end trades every start field with its end field', () => {
    const r = mirrorReinforcement({
      regions: {
        topStart: { count: 4, diameter: 16 }, topEnd: { count: 2, diameter: 12 },
        topStartLayers: [{ count: 4, diameter: 16 }], topEndLayers: [{ count: 2, diameter: 12 }],
        bottomGroups: [{ layers: [{ count: 3, diameter: 12 }], continueStart: false, continueEnd: true, anchorageStart: 'hook' }],
        continuity: { bottomIntoStart: true, bottomIntoEnd: false },
      },
    } as never);
    expect(r.regions).toEqual({
      topEnd: { count: 4, diameter: 16 }, topStart: { count: 2, diameter: 12 },
      topEndLayers: [{ count: 4, diameter: 16 }], topStartLayers: [{ count: 2, diameter: 12 }],
      bottomGroups: [{ layers: [{ count: 3, diameter: 12 }], continueEnd: false, continueStart: true, anchorageEnd: 'hook' }],
      continuity: { bottomIntoEnd: true, bottomIntoStart: false },
    });
  });
});
