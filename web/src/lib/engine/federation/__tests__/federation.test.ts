/**
 * Linked models and versions by hand: objects keyed by GlobalId (or by class, name and position
 * when there is none), a new version sorted into added, modified and removed, applied by the
 * rules, drawn per storey; and fingerprints that ignore key order and see one changed field.
 */
import { describe, expect, it } from 'vitest';
import { applyUpdate, diffLinked, entitiesFromParse, fnv, linkUnderlays, type LinkedModel } from '../linked';
import { compareFingerprints, fingerprintOf, stable } from '../versions';
import type { IfcMember, IfcSurface } from '../../../ifc/ifc-mapper';

const col = (g: string, x: number, h = 3): IfcMember => ({ id: 1, type: 'column', name: `C-${g}`, start: { x, y: 0, z: 0 }, end: { x, y: 0, z: h }, ifcClass: 'IfcColumn', storey: 'PB', globalId: g });
const wall: IfcSurface = { id: 9, type: 'wall', name: 'M1', outline: [{ x: 0, y: 2, z: 0 }, { x: 4, y: 2, z: 0 }, { x: 4, y: 2, z: 3 }, { x: 0, y: 2, z: 3 }], thickness: 0.2, ifcClass: 'IfcWall', storey: 'PB', globalId: 'W1' };

describe('linked models', () => {
  it('keys objects by GlobalId, or by class, name and position without one', () => {
    const e = entitiesFromParse([col('A', 0), { ...col('B', 4), globalId: undefined }], [wall]);
    expect(e.map((x) => x.guid)).toEqual(['A', `~${fnv('IfcColumn|C-B|4,0,0')}`, 'W1']);
    expect(fnv('a')).toBe('e40c292c');
  });

  it('sorts a new version into added, modified and removed, and applies the rules', () => {
    const v1 = entitiesFromParse([col('A', 0), col('B', 4)], [wall]);
    const v2 = entitiesFromParse([col('A', 0), col('B', 4, 3.2), col('C', 8)], []);
    const d = diffLinked(v1, v2);
    expect(d.added.map((x) => x.guid)).toEqual(['C']);
    expect(d.modified.map((x) => x.after.guid)).toEqual(['B']);
    expect(d.removed.map((x) => x.guid)).toEqual(['W1']);
    expect(d.unchanged).toBe(1);
    expect(applyUpdate(v1, d, { added: 'take', modified: 'take', removed: 'remove' }).map((x) => x.guid)).toEqual(['A', 'B', 'C']);
    const kept = applyUpdate(v1, d, { added: 'skip', modified: 'skip', removed: 'keep' });
    expect(kept.map((x) => x.guid)).toEqual(['A', 'B', 'W1']);
    expect(kept.find((x) => x.guid === 'B')!.pts[5]).toBe(3);
  });

  it('draws a link per storey: a column as a cross, a wall by its outline', () => {
    const link: LinkedModel = { id: 'l', name: 'Arq', discipline: 'architecture', fileName: 'a.ifc', version: '1', date: '', entities: entitiesFromParse([col('A', 0)], [wall]), visible: true, storeys: { PB: 0 } };
    const u = linkUnderlays(link);
    expect(u).toHaveLength(1);
    expect(u[0]!.z).toBe(0);
    // Cross: two segments; wall outline on plan: the 0→4 run there and back (the vertical edges are points).
    expect(u[0]!.segments.length).toBe(8 + 8);
  });
});

describe('versions', () => {
  it('fingerprints ignore key order and see one changed field', () => {
    expect(stable({ b: 1, a: [1, 2] })).toBe(stable({ a: [1, 2], b: 1 }));
    const m = (x: number) => ({ nodes: new Map([[1, { x, y: 0 }], [2, { x: 5, y: 0 }]]), elements: new Map([[1, { nodeI: 1, nodeJ: 2 }]]), quads: new Map(), sections: new Map(), materials: new Map(), supports: new Map(), loads: [{ type: 'nodal3d', data: { id: 1, fz: -10 } }] });
    const a = fingerprintOf(m(0) as never), b = fingerprintOf({ ...m(0.5), elements: new Map([[1, { nodeI: 1, nodeJ: 2 }], [2, { nodeI: 2, nodeJ: 1 }]]), loads: [] } as never);
    const d = compareFingerprints(a, b);
    expect(d.nodes).toEqual({ added: [], modified: ['1'], removed: [] });
    expect(d.elements.added).toEqual(['2']);
    expect(d.loads.removed).toEqual(['nodal3d:1']);
  });
});
