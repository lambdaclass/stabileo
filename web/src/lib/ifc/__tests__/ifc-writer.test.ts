/**
 * The IFC export, read back: a small building written by `writeIfc` is parsed by the app's own
 * importer (members where they were, slabs and walls with their thickness and mid-surface, the
 * storeys) and opened by web-ifc, an independent IFC engine, which must find a body for every
 * column, slab, footing, bar, plate and bolt.
 */
import { describe, expect, it } from 'vitest';
import * as WebIFC from 'web-ifc';
import { guid, real, str, writeIfc, type IfcExportInput, type V3 } from '../ifc-writer';
import { parseIfc } from '../ifc-parser';

const WASM_PATH = './';
const cols: V3[] = [[0, 0, 0], [5, 0, 0], [5, 4, 0], [0, 4, 0]];

function building(): IfcExportInput {
  return {
    project: { name: 'Edificio Ñandú', time: '2026-10-11T00:00:00', app: 'test' },
    storeys: [{ name: 'PB', z: 0 }, { name: 'N1', z: 3 }],
    members: [
      ...cols.map((p, k) => ({ id: `c${k}`, kind: 'column' as const, name: `C${k + 1}`, a: p, b: [p[0], p[1], 3] as V3, profile: { kind: 'rect' as const, b: 0.3, h: 0.4 }, material: 'H-30', props: { Utilization: 0.81, Status: 'ok' } })),
      ...cols.map((p, k) => { const q = cols[(k + 1) % 4]!; return { id: `b${k}`, kind: 'beam' as const, name: `V${k + 1}`, a: [p[0], p[1], 3] as V3, b: [q[0], q[1], 3] as V3, profile: { kind: 'rect' as const, b: 0.2, h: 0.5 }, material: 'H-30' }; }),
      { id: 'd1', kind: 'member', name: 'D1', a: [0, 0, 0], b: [5, 0, 3], profile: { kind: 'I', b: 0.1, h: 0.2, tw: 0.0056, tf: 0.0085 }, profileName: 'IPE 200', material: 'F-24' },
    ],
    slabs: [{ id: 's1', name: 'L101', outline: [[0, 0, 3], [5, 0, 3], [5, 4, 3], [0, 4, 3]], thickness: 0.15, material: 'H-30' }],
    walls: [{ id: 'w1', name: 'T1', a: [0, 4, 0], b: [5, 4, 0], height: 3, thickness: 0.2, material: 'H-30' }],
    footings: [{ id: 'f1', name: 'Z1', centre: [0, 0, -1.5], B: 1.6, L: 1.6, thickness: 0.5, rotDeg: 0, material: 'H-25' }],
    bars: [
      { id: 'r1', mark: 'B1', diameter: 0.016, points: [[0.05, 0.05, 2.9], [4.95, 0.05, 2.9], [4.95, 0.05, 2.9], [4.95, 0.05, 2.6]], role: 'main', assembly: 'A1', length: 5.2 },
      { id: 'r2', mark: 'E1', diameter: 0.008, points: [[1, 0, 2.55], [1, 0.2, 2.55], [1, 0.2, 2.95], [1, 0, 2.95], [1, 0, 2.55]], role: 'ligature', assembly: 'A1', length: 1.2 },
    ],
    parts: [
      { id: 'p1', kind: 'plate', joint: 'U1', center: [0, 0, 0.01], u: [1, 0, 0], v: [0, 1, 0], size: [0.35, 0.3, 0.02] },
      { id: 'p2', kind: 'anchor', joint: 'U1', center: [0.12, 0.1, -0.15], u: [1, 0, 0], v: [0, 1, 0], size: [0.02, 0.02, 0.3] },
    ],
  };
}

describe('STEP primitives', () => {
  it('reals always carry a point; strings escape quotes and non-ASCII', () => {
    expect(real(3)).toBe('3.');
    expect(real(0.15)).toBe('0.15');
    expect(real(-2)).toBe('-2.');
    expect(real(1e-12)).toBe('0.');
    expect(str("O'Brien")).toBe("'O''Brien'");
    expect(str('Ñandú')).toBe("'\\X2\\00D1\\X0\\and\\X2\\00FA\\X0\\'");
  });

  it('a GlobalId is 22 characters of the IFC alphabet, the same for the same seed', () => {
    const g = guid('m:c1');
    expect(g).toMatch(/^[0-3][0-9A-Za-z_$]{21}$/);
    expect(guid('m:c1')).toBe(g);
    expect(guid('m:c2')).not.toBe(g);
  });
});

describe('the exported building, read back', () => {
  const text = writeIfc(building());
  const data = () => new TextEncoder().encode(text).buffer as ArrayBuffer;

  it('is the same file twice', () => {
    expect(writeIfc(building())).toBe(text);
    expect(text.startsWith('ISO-10303-21;')).toBe(true);
    expect(text).toContain("FILE_SCHEMA(('IFC4'));");
  });

  it('the importer finds the members where they were, the slab and the wall with their thickness', async () => {
    const r = await parseIfc(data(), { wasmPath: WASM_PATH });
    const columns = r.members.filter((m) => m.type === 'column'), beams = r.members.filter((m) => m.type === 'beam');
    expect(columns).toHaveLength(4);
    expect(beams).toHaveLength(4);
    const c2 = columns.find((m) => m.name === 'C2')!;
    expect([c2.start.x, c2.start.y, c2.start.z, c2.end.z].map((v) => +v.toFixed(6))).toEqual([5, 0, 0, 3]);
    expect(c2.profileDims).toEqual({ shape: 'rect', b: 0.3, h: 0.4 });
    expect(c2.materialName).toBe('H-30');
    expect(r.members.find((m) => m.name === 'D1')!.type).toBe('brace');
    const slab = r.surfaces.find((s) => s.type === 'slab')!;
    expect(slab.thickness).toBeCloseTo(0.15, 9);
    expect(slab.outline.every((p) => Math.abs(p.z - 3) < 1e-9)).toBe(true);
    const wall = r.surfaces.find((s) => s.type === 'wall')!;
    expect(wall.thickness).toBeCloseTo(0.2, 9);
    expect(Math.max(...wall.outline.map((p) => p.z))).toBeCloseTo(3, 9);
    expect(r.storeys.map((s) => s.name)).toEqual(['PB', 'N1']);
    expect(r.warnings.filter((w) => /error/i.test(w))).toEqual([]);
  });

  it('an independent IFC engine builds a body for every element, bars and fasteners included', async () => {
    const api = new WebIFC.IfcAPI();
    api.SetWasmPath(WASM_PATH);
    await api.Init();
    const id = api.OpenModel(new Uint8Array(data()));
    const meshed = new Map<number, number>();
    api.StreamAllMeshes(id, (mesh) => {
      let verts = 0;
      for (let k = 0; k < mesh.geometries.size(); k++) verts += api.GetGeometry(id, mesh.geometries.get(k).geometryExpressID).GetVertexDataSize();
      meshed.set(mesh.expressID, verts);
    });
    for (const [type, n] of [[WebIFC.IFCCOLUMN, 4], [WebIFC.IFCBEAM, 4], [WebIFC.IFCMEMBER, 1], [WebIFC.IFCSLAB, 1], [WebIFC.IFCWALL, 1], [WebIFC.IFCFOOTING, 1], [WebIFC.IFCREINFORCINGBAR, 2], [WebIFC.IFCPLATE, 1], [WebIFC.IFCMECHANICALFASTENER, 1]] as const) {
      const ids = api.GetLineIDsWithType(id, type);
      expect(ids.size(), String(type)).toBe(n);
      for (let k = 0; k < ids.size(); k++) expect(meshed.get(ids.get(k)) ?? 0, `${type} #${ids.get(k)}`).toBeGreaterThan(0);
    }
    // The design state travels as a property set.
    const psets = api.GetLineIDsWithType(id, WebIFC.IFCPROPERTYSET);
    expect(psets.size()).toBe(4);
    api.CloseModel(id);
  });
});
