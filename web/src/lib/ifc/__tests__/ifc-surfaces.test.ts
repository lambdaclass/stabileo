/**
 * Slabs, walls and storeys read from an IFC file with the real parser (web-ifc WASM in Node).
 *
 * A storey at +3000 mm holds a 6 × 5 m slab 200 mm thick whose top is at the storey, written as
 * a rectangle profile placed off-centre and extruded upwards from 200 mm below. A wall
 * 6 m × 200 mm, 3 m high, stands at the ground storey, its footprint a rectangle centred on its
 * axis, one clipped by a boolean as BIM tools write them. A column has a rectangle profile with
 * no name.
 */
import { describe, it, expect } from 'vitest';
import { parseIfc } from '../ifc-parser';

const WASM_PATH = './';

import { BUILDING_IFC as FILE } from './building-ifc';

describe('IFC slabs, walls and storeys', () => {
  it('reads each as the model takes it', async () => {
    const r = await parseIfc(new TextEncoder().encode(FILE).buffer as ArrayBuffer, { wasmPath: WASM_PATH });
    expect(r.storeys).toEqual([{ name: 'PB', elevation: 0 }, { name: 'P1', elevation: 3 }]);

    const slab = r.surfaces.find((s) => s.type === 'slab')!;
    expect(slab).toMatchObject({ name: 'L1', ifcClass: 'IfcSlab', storey: 'P1' });
    expect(slab.thickness).toBeCloseTo(0.2, 9);
    // Mid-depth of a slab whose top is the storey's: +2.9 m, over 0..6 × 0..5.
    for (const p of slab.outline) expect(p.z).toBeCloseTo(2.9, 9);
    expect(Math.min(...slab.outline.map((p) => p.x))).toBeCloseTo(0, 9);
    expect(Math.max(...slab.outline.map((p) => p.x))).toBeCloseTo(6, 9);
    expect(Math.max(...slab.outline.map((p) => p.y))).toBeCloseTo(5, 9);

    const wall = r.surfaces.find((s) => s.type === 'wall')!;
    expect(wall).toMatchObject({ name: 'M1', ifcClass: 'IfcWall', storey: 'PB' });
    expect(wall.thickness).toBeCloseTo(0.2, 9);
    // Its centre line, y = 0, from x = 0 to 6, swept from 0 to 3 m.
    for (const p of wall.outline) expect(p.y).toBeCloseTo(0, 9);
    expect(wall.outline.map((p) => [Math.round(p.x * 1e6) / 1e6, Math.round(p.z * 1e6) / 1e6])).toEqual([[0, 0], [6, 0], [6, 3], [0, 3]]);

    const col = r.members.find((m) => m.type === 'column')!;
    expect(col).toMatchObject({ name: 'C1', ifcClass: 'IfcColumn', storey: 'PB', profileName: '300×500' });
    expect(col.profileDims).toEqual({ shape: 'rect', b: expect.closeTo(0.3, 9), h: expect.closeTo(0.5, 9) });
  });
});

describe('the IFC file as a building', () => {
  it('slab, wall and column come in as physical elements on the storeys, shells meeting the bars', async () => {
    const { buildIfcFragment, classesIn, storeyLevels, connectShells } = await import('../ifc-physical');
    const { modelStore, historyStore } = await import('../../store');
    const { insertFragment } = await import('../../model/edit/transformed-copy');
    const { IDENTITY } = await import('../../model/edit/affine');
    const { physicalGroups } = await import('../../store/physical');
    modelStore.clear(); historyStore.clear();
    const r = await parseIfc(new TextEncoder().encode(FILE).buffer as ArrayBuffer, { wasmPath: WASM_PATH });
    const rows = classesIn(r.members, r.surfaces);
    expect(rows.map((x) => [x.ifcClass, x.choice]).sort()).toEqual([['IfcColumn', 'column'], ['IfcSlab', 'slab'], ['IfcWall', 'wall']]);
    const levels = storeyLevels(r.storeys);
    const b = buildIfcFragment(r.members, r.surfaces, { choices: {}, meshSize: 1, declare: true, levels });
    expect(b.elements).toBe(3);
    modelStore.batch(() => {
      modelStore.setGrid({ axes: [], levels });
      const rep = insertFragment(b.fragment, [{ A: IDENTITY, t: [0, 0, 0] }]);
      connectShells(rep.quads, rep.plates);
    });
    const kinds = physicalGroups().map((g) => [g.name, g.physical.kind, modelStore.grid!.levels.find((l) => l.id === g.physical.levelFrom)?.name]).sort();
    expect(kinds).toEqual([['C1', 'column', 'PB'], ['L1', 'slab', 'P1'], ['M1', 'wall', 'PB']]);
    expect(modelStore.quads.size).toBeGreaterThan(20);
    expect([...modelStore.quads.values()].every((q) => q.thickness === 0.2)).toBe(true);

    // Leaving the walls out leaves them out.
    const noWalls = buildIfcFragment(r.members, r.surfaces, { choices: { IfcWall: 'ignore' }, meshSize: 1, declare: true, levels });
    expect(noWalls.elements).toBe(2);
  });
});
