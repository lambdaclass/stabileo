/**
 * An architecture IFC read as a reference to model over: its products as triangle meshes, merged
 * by IFC type, in the app's frame (Z up, metres), and those with no 3D shape as a point each.
 * Nothing of it becomes a member or a load.
 */

export interface ReferenceMesh {
  /** The IFC type, as the file names it ("IfcWall"). */
  type: string;
  /** x, y, z per vertex, metres, Z up. */
  positions: Float32Array;
  indices: Uint32Array;
  /** The colour the file gives the type's first product, 0–1. */
  color: [number, number, number];
}

export interface ReferenceSymbol { type: string; x: number; y: number; z: number }

export interface ReferenceCounts {
  /** Products drawn with their shape. */
  drawn: number;
  /** Products without a 3D shape, drawn as a point where they are placed. */
  symbols: number;
  /** Products without a shape or a placement: not drawn. */
  none: number;
  byType: Record<string, { drawn: number; symbols: number; none: number }>;
}

export interface IfcReference {
  meshes: ReferenceMesh[];
  symbols: ReferenceSymbol[];
  counts: ReferenceCounts;
  triangles: number;
  bounds: { min: [number, number, number]; max: [number, number, number] } | null;
}

/** What a reference is not: holes cut in others, spaces' volumes, helpers. */
const NOT_DRAWN = new Set(['IfcOpeningElement', 'IfcOpeningStandardCase', 'IfcVirtualElement', 'IfcAnnotation', 'IfcGrid']);

/** More triangles than this is not a reference anyone models over: the rest is left out, and counted. */
export const MAX_REFERENCE_TRIANGLES = 2_000_000;

export async function readIfcReference(data: ArrayBuffer, opts?: { wasmPath?: string }): Promise<IfcReference> {
  const WebIFC = await import('web-ifc');
  const api = new WebIFC.IfcAPI();
  api.SetWasmPath(opts?.wasmPath ?? '/');
  await api.Init();
  const id = api.OpenModel(new Uint8Array(data));
  if (!(id >= 0)) throw new Error('IFC');
  try {
    const typeName = (expressID: number) => api.GetNameFromTypeCode(api.GetLineType(id, expressID)) as string;
    const counts: ReferenceCounts = { drawn: 0, symbols: 0, none: 0, byType: {} };
    const tally = (type: string, k: 'drawn' | 'symbols' | 'none') => {
      counts[k]++;
      const t = (counts.byType[type] ??= { drawn: 0, symbols: 0, none: 0 });
      t[k]++;
    };
    const parts = new Map<string, { pos: number[]; idx: number[]; color: [number, number, number] }>();
    const shaped = new Set<number>();
    let triangles = 0;
    const min: [number, number, number] = [Infinity, Infinity, Infinity];
    const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];

    api.StreamAllMeshes(id, (mesh) => {
      const type = typeName(mesh.expressID);
      if (NOT_DRAWN.has(type)) return;
      let part = parts.get(type);
      let added = false;
      for (let i = 0; i < mesh.geometries.size(); i++) {
        const pg = mesh.geometries.get(i);
        const g = api.GetGeometry(id, pg.geometryExpressID);
        const v = api.GetVertexArray(g.GetVertexData(), g.GetVertexDataSize());
        const ix = api.GetIndexArray(g.GetIndexData(), g.GetIndexDataSize());
        if (triangles + ix.length / 3 > MAX_REFERENCE_TRIANGLES) { g.delete(); continue; }
        if (!part) {
          part = { pos: [], idx: [], color: [pg.color.x, pg.color.y, pg.color.z] };
          parts.set(type, part);
        }
        const m = pg.flatTransformation;
        const base = part.pos.length / 3;
        for (let k = 0; k < v.length; k += 6) {
          const x = v[k]!, y = v[k + 1]!, z = v[k + 2]!;
          // web-ifc hands meshes Y up; the app is Z up, as the file is.
          const X = m[0]! * x + m[4]! * y + m[8]! * z + m[12]!;
          const Y = m[1]! * x + m[5]! * y + m[9]! * z + m[13]!;
          const Z = m[2]! * x + m[6]! * y + m[10]! * z + m[14]!;
          const p: [number, number, number] = [X, -Z, Y];
          part.pos.push(p[0], p[1], p[2]);
          for (let j = 0; j < 3; j++) { if (p[j]! < min[j]!) min[j] = p[j]!; if (p[j]! > max[j]!) max[j] = p[j]!; }
        }
        for (let k = 0; k < ix.length; k++) part.idx.push(base + ix[k]!);
        triangles += ix.length / 3;
        added = true;
        g.delete();
      }
      if (added) { shaped.add(mesh.expressID); tally(type, 'drawn'); }
    });

    const symbols: ReferenceSymbol[] = [];
    const scale = lengthScale(api, id, WebIFC.IFCSIUNIT);
    const all = api.GetAllLines(id);
    for (let i = 0; i < all.size(); i++) {
      const eid = all.get(i);
      const code = api.GetLineType(id, eid);
      if (!api.IsIfcElement(code) || shaped.has(eid)) continue;
      const type = api.GetNameFromTypeCode(code) as string;
      if (NOT_DRAWN.has(type)) continue;
      const at = placementOrigin(api, id, eid, scale);
      if (at) { symbols.push({ type, ...at }); tally(type, 'symbols'); } else tally(type, 'none');
    }

    const meshes = [...parts].map(([type, p]) => ({ type, positions: new Float32Array(p.pos), indices: new Uint32Array(p.idx), color: p.color }));
    return { meshes, symbols, counts, triangles, bounds: Number.isFinite(min[0]) ? { min, max } : null };
  } finally {
    api.CloseModel(id);
  }
}

/** Where a product is placed, through its chain of local placements, in metres (Z up). */
function placementOrigin(api: any, model: number, expressID: number, scale: number): { x: number; y: number; z: number } | null {
  const line: any = api.GetLine(model, expressID);
  let ref = line?.ObjectPlacement?.value as number | undefined;
  if (ref === undefined) return null;
  // Compose up the chain: each level's location and axes, outermost last.
  const chain: any[] = [];
  for (let guard = 0; ref !== undefined && guard < 64; guard++) {
    const lp: any = api.GetLine(model, ref);
    if (!lp?.RelativePlacement) break;
    chain.push(api.GetLine(model, lp.RelativePlacement.value));
    ref = lp.PlacementRelTo?.value;
  }
  let p: [number, number, number] = [0, 0, 0];
  for (const a of chain) {
    const loc = vec(api, model, a?.Location?.value) ?? [0, 0, 0];
    const z = norm(vec(api, model, a?.Axis?.value) ?? [0, 0, 1]);
    let x = vec(api, model, a?.RefDirection?.value) ?? [1, 0, 0];
    const d = x[0] * z[0] + x[1] * z[1] + x[2] * z[2];
    x = norm([x[0] - d * z[0], x[1] - d * z[1], x[2] - d * z[2]]);
    const y: [number, number, number] = [z[1] * x[2] - z[2] * x[1], z[2] * x[0] - z[0] * x[2], z[0] * x[1] - z[1] * x[0]];
    p = [
      loc[0] + x[0] * p[0] + y[0] * p[1] + z[0] * p[2],
      loc[1] + x[1] * p[0] + y[1] * p[1] + z[1] * p[2],
      loc[2] + x[2] * p[0] + y[2] * p[1] + z[2] * p[2],
    ];
  }
  return { x: p[0] * scale, y: p[1] * scale, z: p[2] * scale };
}

const norm = (v: [number, number, number]): [number, number, number] => {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
};

function vec(api: any, model: number, ref: number | undefined): [number, number, number] | null {
  if (ref === undefined) return null;
  const l = api.GetLine(model, ref);
  const raw = l?.Coordinates ?? l?.DirectionRatios;
  if (!raw) return null;
  const n = (x: any) => { const v = typeof x === 'number' ? x : x?.value; const f = typeof v === 'string' ? parseFloat(v) : v; return Number.isFinite(f) ? f : 0; };
  return [n(raw[0]), n(raw[1]), n(raw[2] ?? 0)];
}

const SI_PREFIX: Record<string, number> = { KILO: 1e3, HECTO: 1e2, DECA: 10, DECI: 0.1, CENTI: 0.01, MILLI: 1e-3, MICRO: 1e-6 };

function lengthScale(api: any, model: number, siUnit: number): number {
  try {
    const ids = api.GetLineIDsWithType(model, siUnit);
    for (let i = 0; i < ids.size(); i++) {
      const l = api.GetLine(model, ids.get(i));
      if (l?.UnitType?.value === 'LENGTHUNIT' && l?.Name?.value === 'METRE') return SI_PREFIX[l?.Prefix?.value] ?? 1;
    }
  } catch { /* metres */ }
  return 1;
}
