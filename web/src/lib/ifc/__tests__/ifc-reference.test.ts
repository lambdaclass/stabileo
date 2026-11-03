import { describe, it, expect } from 'vitest';
import { readIfcReference } from '../ifc-reference';
import { BUILDING_IFC } from './building-ifc';

describe('an architecture IFC read as a reference', () => {
  it('lays each product in the model frame, Z up, in metres, merged by type', async () => {
    const r = await readIfcReference(new TextEncoder().encode(BUILDING_IFC).buffer as ArrayBuffer, { wasmPath: './' });
    expect(r.meshes.map((m) => m.type).sort()).toEqual(['IfcColumn', 'IfcSlab', 'IfcWall']);
    const col = r.meshes.find((m) => m.type === 'IfcColumn')!;
    const zs = [...col.positions].filter((_, i) => i % 3 === 2);
    expect(Math.min(...zs)).toBeCloseTo(0, 3);
    expect(Math.max(...zs)).toBeCloseTo(3, 3);
    const ys = [...col.positions].filter((_, i) => i % 3 === 1);
    expect((Math.min(...ys) + Math.max(...ys)) / 2).toBeCloseTo(5, 3);
    expect(r.bounds!.max[2]).toBeCloseTo(3, 3);
    expect(r.triangles).toBeGreaterThan(0);
    for (const m of r.meshes) expect(Math.max(...m.indices)).toBeLessThan(m.positions.length / 3);
  });

  it('counts what it draws and what has no shape, by type', async () => {
    const r = await readIfcReference(new TextEncoder().encode(BUILDING_IFC).buffer as ArrayBuffer, { wasmPath: './' });
    expect(r.counts.drawn).toBe(3);
    expect(r.counts.byType.IfcColumn).toEqual({ drawn: 1, symbols: 0, none: 0 });
    expect(r.counts.drawn + r.counts.symbols + r.counts.none).toBe(Object.values(r.counts.byType).reduce((n, t) => n + t.drawn + t.symbols + t.none, 0));
    for (const s of r.symbols) expect([s.x, s.y, s.z].every(Number.isFinite)).toBe(true);
  });
});
