// IFC Parser — extracts structural members from IFC files using web-ifc
// This module requires the web-ifc WASM to be available at /web-ifc.wasm

import type { IfcMember, IfcStorey, IfcSurface } from './ifc-mapper';
import { t, tp } from '../i18n';
import { IDENTITY, apply, axis2Placement3D, compose, extrusionAxis, rotate, type Frame, type V3 } from './ifc-geometry';

/*
 * ── What this read wrong, and reads now ─────────────────────────────
 *
 *   · The entity type ids were hand-typed, and two were wrong: IFCBEAM and IFCCOLUMN matched
 *     nothing, so a file of beams and columns imported "0 beams, 0 columns". They come from
 *     web-ifc itself now, with the IFC4 `*StandardCase` subtypes, which a query by the parent
 *     type does not return.
 *   · IFC was taken as Y-up and remapped; it is Z-up, like this app, so a column came in lying
 *     down. And only placement LOCATIONS were summed up the hierarchy, so every rotated placement
 *     put its member on the wrong line. Placements are composed as full frames (`ifc-geometry`).
 *   · The first material found was given to every member. Each member now carries the material
 *     its own IfcRelAssociatesMaterial names.
 *   · The project's length unit was never read, so a file authored in millimetres — the
 *     default of several BIM tools — imported 1000x too large. Coordinates and extrusion
 *     depths are scaled by the IfcUnitAssignment now (`lengthUnitScale`).
 */

export interface IfcParseResult {
  members: IfcMember[];
  /** Slabs and walls, as mid-surfaces. */
  surfaces: IfcSurface[];
  /** The storeys, low to high. */
  storeys: IfcStorey[];
  warnings: string[];
}

/** SI prefixes as a factor of the unprefixed unit, for IfcSIUnit.Prefix. */
const SI_PREFIX: Record<string, number> = {
  EXA: 1e18, PETA: 1e15, TERA: 1e12, GIGA: 1e9, MEGA: 1e6, KILO: 1e3, HECTO: 1e2, DECA: 1e1,
  DECI: 1e-1, CENTI: 1e-2, MILLI: 1e-3, MICRO: 1e-6, NANO: 1e-9, PICO: 1e-12, FEMTO: 1e-15, ATTO: 1e-18,
};

/**
 * Parse an IFC file and extract structural members (beams, columns, braces).
 * Returns start/end points in world coordinates, in metres.
 */
export async function parseIfc(data: ArrayBuffer, opts?: { wasmPath?: string }): Promise<IfcParseResult> {
  // Dynamic import to avoid bundling 3.5MB WASM in main chunk
  const WebIFC = await import('web-ifc');
  const api = new WebIFC.IfcAPI();
  // '/' is where the app serves web-ifc.wasm from; tests point at the package instead.
  api.SetWasmPath(opts?.wasmPath ?? '/');
  await api.Init();

  const modelID = api.OpenModel(new Uint8Array(data));
  const warnings: string[] = [];
  const members: IfcMember[] = [];
  let nextId = 1;

  /**
   * Metres per file length unit, from the project's IfcUnitAssignment.
   *
   * BIM tools that author in millimetres say so here — an IfcSIUnit of LENGTHUNIT with
   * Prefix MILLI — and coordinates and extrusion depths follow. Read raw, such a file
   * imported 1000x too large. A conversion-based unit (inches, feet) names its factor
   * through an IfcMeasureWithUnit against an SI unit. Anything unrecognized is taken as
   * metres, the IFC default.
   */
  const lengthUnitScale = (): number => {
    const unitScale = (unit: any, depth: number): number | undefined => {
      if (!unit || depth > 2) return undefined;
      if (unit.type === WebIFC.IFCSIUNIT) {
        if (unit.Name?.value !== 'METRE') return undefined;
        return SI_PREFIX[unit.Prefix?.value] ?? 1;
      }
      if (unit.type === WebIFC.IFCCONVERSIONBASEDUNIT) {
        const mwu = unit.ConversionFactor ? api.GetLine(modelID, unit.ConversionFactor.value) : undefined;
        const raw = mwu?.ValueComponent;
        const value = typeof raw === 'number' ? raw : raw?.value;
        const base = mwu?.UnitComponent ? api.GetLine(modelID, mwu.UnitComponent.value) : undefined;
        const baseScale = unitScale(base, depth + 1);
        if (typeof value === 'number' && baseScale !== undefined) return value * baseScale;
      }
      return undefined;
    };
    try {
      const ids = api.GetLineIDsWithType(modelID, WebIFC.IFCUNITASSIGNMENT);
      for (let i = 0; i < ids.size(); i++) {
        const assignment = api.GetLine(modelID, ids.get(i));
        for (const unitRef of assignment?.Units ?? []) {
          const unit = api.GetLine(modelID, unitRef.value);
          if (unit?.UnitType?.value !== 'LENGTHUNIT') continue;
          const s = unitScale(unit, 0);
          if (s !== undefined && s > 0) return s;
        }
      }
    } catch {
      // No unit assignment — metres.
    }
    return 1;
  };
  const lengthScale = lengthUnitScale();

  const v3 = (ref: any, fallback?: V3): V3 | undefined => {
    if (!ref) return fallback;
    const o = api.GetLine(modelID, ref.value);
    // Coordinates are length-like and follow the file unit; DirectionRatios are
    // unitless (and normalized downstream) and stay raw.
    if (o?.Coordinates) {
      const c = o.Coordinates;
      return [(c[0]?.value ?? 0) * lengthScale, (c[1]?.value ?? 0) * lengthScale, (c[2]?.value ?? 0) * lengthScale];
    }
    const c = o?.DirectionRatios;
    if (!c) return fallback;
    return [c[0]?.value ?? 0, c[1]?.value ?? 0, c[2]?.value ?? 0];
  };
  /** An IfcAxis2Placement3D line as a frame. */
  const frameOf = (ref: any): Frame => {
    if (!ref) return IDENTITY;
    const p = api.GetLine(modelID, ref.value);
    if (!p) return IDENTITY;
    return axis2Placement3D(v3(p.Location, [0, 0, 0])!, v3(p.Axis), v3(p.RefDirection));
  };
  /** An IfcLocalPlacement in world coordinates: its RelativePlacement under each PlacementRelTo. */
  function worldPlacement(placementId: number): Frame {
    const chain: Frame[] = [];
    let current: number | null = placementId;
    const visited = new Set<number>();
    while (current !== null && !visited.has(current)) {
      visited.add(current);
      const pl = api.GetLine(modelID, current);
      if (!pl) break;
      chain.push(frameOf(pl.RelativePlacement));
      current = pl.PlacementRelTo?.value ?? null;
    }
    return chain.reverse().reduce((acc, f) => compose(acc, f), IDENTITY);
  }

  /**
   * The extruded solids of an object's body: each IfcExtrudedAreaSolid among its items, through
   * the boolean clippings that walls and slabs are often written as (the first operand is the
   * solid that was cut).
   */
  function extrusions(entity: any): any[] {
    const out: any[] = [];
    const visit = (item: any, depth: number) => {
      if (!item || depth > 6) return;
      if (item.Depth && item.SweptArea) { out.push(item); return; }
      if (item.FirstOperand) visit(api.GetLine(modelID, item.FirstOperand.value), depth + 1);
    };
    try {
      const repr = entity.Representation ? api.GetLine(modelID, entity.Representation.value) : null;
      for (const reprRef of repr?.Representations ?? []) {
        const reprItem = api.GetLine(modelID, reprRef.value);
        for (const itemRef of reprItem?.Items ?? []) visit(api.GetLine(modelID, itemRef.value), 0);
      }
    } catch { /* an unreadable body has no extrusion */ }
    return out;
  }

  const num = (v: any): number => (typeof v === 'number' ? v : typeof v?.value === 'number' ? v.value : NaN);
  /** An IfcAxis2Placement2D as (origin, x axis), in file units scaled to m. */
  const place2D = (ref: any): { o: [number, number]; x: [number, number] } => {
    const p = ref ? api.GetLine(modelID, ref.value) : null;
    const o = p?.Location ? v3(p.Location, [0, 0, 0])! : [0, 0, 0];
    const d = p?.RefDirection ? v3(p.RefDirection, [1, 0, 0])! : [1, 0, 0];
    const l = Math.hypot(d[0], d[1]) || 1;
    return { o: [o[0], o[1]], x: [d[0] / l, d[1] / l] };
  };
  /**
   * A profile's outline in the solid's own XY plane, m: a rectangle, a circle (as 24 sides) or a
   * closed polyline. Null for a profile this does not read.
   */
  function profileOutline(ref: any): Array<[number, number]> | null {
    const pr = ref ? api.GetLine(modelID, ref.value) : null;
    if (!pr) return null;
    const { o, x } = place2D(pr.Position);
    const to = ([u, v]: [number, number]): [number, number] => [o[0] + u * x[0] - v * x[1], o[1] + u * x[1] + v * x[0]];
    if (pr.XDim && pr.YDim) {
      const a = num(pr.XDim) * lengthScale / 2, b = num(pr.YDim) * lengthScale / 2;
      return ([[-a, -b], [a, -b], [a, b], [-a, b]] as Array<[number, number]>).map(to);
    }
    if (pr.Radius) {
      const r = num(pr.Radius) * lengthScale;
      return Array.from({ length: 24 }, (_, k) => to([r * Math.cos((k * Math.PI) / 12), r * Math.sin((k * Math.PI) / 12)]));
    }
    const curve = pr.OuterCurve ? api.GetLine(modelID, pr.OuterCurve.value) : null;
    let pts: Array<[number, number]> = [];
    if (curve?.Points && Array.isArray(curve.Points)) {
      pts = curve.Points.map((r: any) => { const q = v3(r, [0, 0, 0])!; return [q[0], q[1]] as [number, number]; });
    } else if (curve?.Points?.value) {
      const list = api.GetLine(modelID, curve.Points.value);
      pts = (list?.CoordList ?? []).map((c: any[]) => [num(c[0]) * lengthScale, num(c[1]) * lengthScale] as [number, number]);
    }
    if (pts.length > 1) {
      const [f, l] = [pts[0]!, pts[pts.length - 1]!];
      if (Math.hypot(f[0] - l[0], f[1] - l[1]) < 1e-9) pts.pop();
    }
    return pts.length >= 3 ? pts.map(to) : null;
  }

  // A member's axis: the extruded solid's own Position under the object's placement, pushed
  // Depth along its ExtrudedDirection.
  function getMemberEndpoints(
    entity: any,
  ): { start: { x: number; y: number; z: number }; end: { x: number; y: number; z: number } } | null {
    try {
      const world = entity.ObjectPlacement ? worldPlacement(entity.ObjectPlacement.value) : IDENTITY;
      // The first extruded solid, also when the body is a clipping of it.
      const item = extrusions(entity)[0];
      if (item) {
        const solid = compose(world, frameOf(item.Position));
        const dir = v3(item.ExtrudedDirection, [0, 0, 1])!;
        const { start, end } = extrusionAxis(solid, dir, num(item.Depth) * lengthScale);
        return { start: { x: start[0], y: start[1], z: start[2] }, end: { x: end[0], y: end[1], z: end[2] } };
      }
      return null;
    } catch {
      return null;
    }
  }

  /** A rectangle's or a circle's own dimensions, m. */
  function getProfileDims(entity: any): IfcMember['profileDims'] {
    for (const item of extrusions(entity)) {
      const pr = api.GetLine(modelID, item.SweptArea.value);
      if (pr?.XDim && pr?.YDim && !pr.WallThickness) return { shape: 'rect', b: num(pr.XDim) * lengthScale, h: num(pr.YDim) * lengthScale };
      if (pr?.Radius && !pr.WallThickness) return { shape: 'circle', d: 2 * num(pr.Radius) * lengthScale };
    }
    return undefined;
  }

  // Helper: get profile name from entity
  function getProfileName(entity: any): string | undefined {
    try {
      if (!entity.Representation) return undefined;
      const repr = api.GetLine(modelID, entity.Representation.value);
      if (!repr || !repr.Representations) return undefined;

      for (const reprRef of repr.Representations) {
        const reprItem = api.GetLine(modelID, reprRef.value);
        if (reprItem && reprItem.Items) {
          for (const itemRef of reprItem.Items) {
            const item = api.GetLine(modelID, itemRef.value);
            if (item && item.SweptArea) {
              const profile = api.GetLine(modelID, item.SweptArea.value);
              if (profile && profile.ProfileName) {
                return profile.ProfileName.value;
              }
            }
          }
        }
      }
      return undefined;
    } catch {
      return undefined;
    }
  }

  // Process structural element types, each with its IFC4 StandardCase subtype.
  const entityTypes = [
    { type: WebIFC.IFCBEAM, memberType: 'beam' as const },
    { type: WebIFC.IFCBEAMSTANDARDCASE, memberType: 'beam' as const },
    { type: WebIFC.IFCCOLUMN, memberType: 'column' as const },
    { type: WebIFC.IFCCOLUMNSTANDARDCASE, memberType: 'column' as const },
    { type: WebIFC.IFCMEMBER, memberType: 'brace' as const },
    { type: WebIFC.IFCMEMBERSTANDARDCASE, memberType: 'brace' as const },
  ];

  const ifcClassName = (type: number): string => {
    const raw = (api as any).GetNameFromTypeCode?.(type) as string | undefined;
    const known: Record<string, string> = {
      IFCBEAM: 'IfcBeam', IFCBEAMSTANDARDCASE: 'IfcBeamStandardCase', IFCCOLUMN: 'IfcColumn', IFCCOLUMNSTANDARDCASE: 'IfcColumnStandardCase',
      IFCMEMBER: 'IfcMember', IFCMEMBERSTANDARDCASE: 'IfcMemberStandardCase', IFCSLAB: 'IfcSlab', IFCSLABSTANDARDCASE: 'IfcSlabStandardCase',
      IFCSLABELEMENTEDCASE: 'IfcSlabElementedCase', IFCWALL: 'IfcWall', IFCWALLSTANDARDCASE: 'IfcWallStandardCase', IFCWALLELEMENTEDCASE: 'IfcWallElementedCase',
    };
    const byCode = Object.entries(known).find(([k]) => (WebIFC as any)[k] === type)?.[1];
    return byCode ?? raw ?? String(type);
  };
  const memberByExpressId = new Map<number, IfcMember>();
  for (const { type, memberType } of entityTypes) {
    try {
      const ids = api.GetLineIDsWithType(modelID, type);
      for (let i = 0; i < ids.size(); i++) {
        const id = ids.get(i);
        if (memberByExpressId.has(id)) continue;
        try {
          const entity = api.GetLine(modelID, id);
          if (!entity) continue;

          const name = entity.Name?.value ?? `${memberType}_${nextId}`;
          const endpoints = getMemberEndpoints(entity);
          const profileDims = getProfileDims(entity);
          // A profile with no name but a rectangle or a circle is named by its size, in mm.
          const mm = (v: number) => String(Math.round(v * 1000));
          const profileName = getProfileName(entity)
            ?? (profileDims ? (profileDims.shape === 'rect' ? `${mm(profileDims.b)}×${mm(profileDims.h)}` : `Ø${mm(profileDims.d)}`) : undefined);

          if (endpoints) {
            const m: IfcMember = {
              id: nextId++, type: memberType, name, start: endpoints.start, end: endpoints.end, profileName,
              ...(profileDims ? { profileDims } : {}), ifcClass: ifcClassName(type),
              ...(entity.GlobalId?.value ? { globalId: String(entity.GlobalId.value) } : {}),
            };
            members.push(m);
            memberByExpressId.set(id, m);
          } else {
            warnings.push(tp('ifc.noPoints', { n: name }));
          }
        } catch (e: any) {
          warnings.push(tp('ifc.entityError', { id, m: e.message }));
        }
      }
    } catch {
      // Entity type not found in model — skip
    }
  }

  // ── Slabs and walls, as mid-surfaces ──
  const surfaces: IfcSurface[] = [];
  const surfaceByExpressId = new Map<number, IfcSurface>();
  const surfaceTypes = [
    { type: WebIFC.IFCSLAB, kind: 'slab' as const }, { type: (WebIFC as any).IFCSLABSTANDARDCASE, kind: 'slab' as const },
    { type: (WebIFC as any).IFCSLABELEMENTEDCASE, kind: 'slab' as const },
    { type: WebIFC.IFCWALL, kind: 'wall' as const }, { type: (WebIFC as any).IFCWALLSTANDARDCASE, kind: 'wall' as const },
    { type: (WebIFC as any).IFCWALLELEMENTEDCASE, kind: 'wall' as const },
  ].filter((x) => typeof x.type === 'number');
  const P = (q: V3) => ({ x: q[0], y: q[1], z: q[2] });
  /** A slab: its profile at mid-depth, as thick as the extrusion is across it. */
  function slabSurface(entity: any): { outline: V3[]; thickness: number } | null {
    const world = entity.ObjectPlacement ? worldPlacement(entity.ObjectPlacement.value) : IDENTITY;
    for (const item of extrusions(entity)) {
      const pts = profileOutline(item.SweptArea);
      if (!pts) continue;
      const solid = compose(world, frameOf(item.Position));
      const local = v3(item.ExtrudedDirection, [0, 0, 1])!;
      const ll = Math.hypot(...local) || 1;
      const depth = num(item.Depth) * lengthScale;
      const along = rotate(solid, [local[0] / ll, local[1] / ll, local[2] / ll]);
      const thickness = depth * Math.abs(local[2] / ll);
      if (!(thickness > 1e-6)) continue;
      return { outline: pts.map(([u, v]) => { const q = apply(solid, [u, v, 0]); return [q[0] + along[0] * depth / 2, q[1] + along[1] * depth / 2, q[2] + along[2] * depth / 2] as V3; }), thickness };
    }
    return null;
  }
  /** A wall: the centre line of its footprint, along its longest side, swept up its height. */
  function wallSurface(entity: any): { outline: V3[]; thickness: number } | null {
    const world = entity.ObjectPlacement ? worldPlacement(entity.ObjectPlacement.value) : IDENTITY;
    for (const item of extrusions(entity)) {
      const pts = profileOutline(item.SweptArea);
      if (!pts) continue;
      let best = 0, e: [number, number] = [1, 0];
      pts.forEach((p, k) => {
        const q = pts[(k + 1) % pts.length]!, l = Math.hypot(q[0] - p[0], q[1] - p[1]);
        if (l > best) { best = l; e = [(q[0] - p[0]) / l, (q[1] - p[1]) / l]; }
      });
      const n: [number, number] = [-e[1], e[0]];
      const ss = pts.map((p) => p[0] * e[0] + p[1] * e[1]), tt = pts.map((p) => p[0] * n[0] + p[1] * n[1]);
      const [s0, s1, t0, t1] = [Math.min(...ss), Math.max(...ss), Math.min(...tt), Math.max(...tt)];
      const thickness = t1 - t0, length = s1 - s0;
      if (!(thickness > 1e-6) || thickness > length) continue;
      const tm = (t0 + t1) / 2;
      const at = (sv: number): [number, number] => [sv * e[0] + tm * n[0], sv * e[1] + tm * n[1]];
      const solid = compose(world, frameOf(item.Position));
      const local = v3(item.ExtrudedDirection, [0, 0, 1])!;
      const ll = Math.hypot(...local) || 1;
      const depth = num(item.Depth) * lengthScale;
      const up = rotate(solid, [local[0] / ll * depth, local[1] / ll * depth, local[2] / ll * depth]);
      const a = apply(solid, [...at(s0), 0]), b = apply(solid, [...at(s1), 0]);
      return { outline: [a, b, [b[0] + up[0], b[1] + up[1], b[2] + up[2]], [a[0] + up[0], a[1] + up[1], a[2] + up[2]]], thickness };
    }
    return null;
  }
  for (const { type, kind } of surfaceTypes) {
    try {
      const ids = api.GetLineIDsWithType(modelID, type);
      for (let i = 0; i < ids.size(); i++) {
        const id = ids.get(i);
        if (surfaceByExpressId.has(id)) continue;
        const entity = api.GetLine(modelID, id);
        if (!entity) continue;
        const name = entity.Name?.value ?? `${kind}_${nextId}`;
        const g = kind === 'slab' ? slabSurface(entity) : wallSurface(entity);
        if (!g) { warnings.push(tp('ifc.noSurface', { n: name })); continue; }
        const sf: IfcSurface = { id: nextId++, type: kind, name, outline: g.outline.map(P), thickness: g.thickness, ifcClass: ifcClassName(type), ...(entity.GlobalId?.value ? { globalId: String(entity.GlobalId.value) } : {}) };
        surfaces.push(sf);
        surfaceByExpressId.set(id, sf);
      }
    } catch {
      // Entity type not found in model — skip
    }
  }

  // ── Storeys, and what each contains ──
  const storeys: IfcStorey[] = [];
  try {
    const ids = api.GetLineIDsWithType(modelID, WebIFC.IFCBUILDINGSTOREY);
    const storeyName = new Map<number, string>();
    for (let i = 0; i < ids.size(); i++) {
      const st = api.GetLine(modelID, ids.get(i));
      if (!st) continue;
      const name = st.Name?.value ?? st.LongName?.value ?? `N${i}`;
      // Where it is drawn, which is what its elements are placed under; its Elevation otherwise.
      const placedZ = st.ObjectPlacement ? worldPlacement(st.ObjectPlacement.value).t[2] : NaN;
      const elevation = Number.isFinite(placedZ) && (placedZ !== 0 || !st.Elevation) ? placedZ : num(st.Elevation) * lengthScale;
      storeys.push({ name, elevation: Number.isFinite(elevation) ? elevation : 0 });
      storeyName.set(ids.get(i), name);
    }
    storeys.sort((a, b) => a.elevation - b.elevation);
    const rels = api.GetLineIDsWithType(modelID, WebIFC.IFCRELCONTAINEDINSPATIALSTRUCTURE);
    for (let i = 0; i < rels.size(); i++) {
      const rel = api.GetLine(modelID, rels.get(i));
      const name = rel?.RelatingStructure ? storeyName.get(rel.RelatingStructure.value) : undefined;
      if (!name) continue;
      for (const ref of rel.RelatedElements ?? []) {
        const m = memberByExpressId.get(ref.value) ?? surfaceByExpressId.get(ref.value);
        if (m) m.storey = name;
      }
    }
  } catch {
    // No storeys: the elements stand on their own.
  }

  /** The name of a material definition, through the usages and sets IFC wraps it in. */
  function materialName(ref: number, depth = 0): string | undefined {
    const m = api.GetLine(modelID, ref);
    if (!m) return undefined;
    // Usage → set → first entry → IfcMaterial; the innermost name is the material's own.
    const next = m.ForProfileSet ?? m.ForLayerSet ?? m.Material
      ?? m.MaterialProfiles?.[0] ?? m.MaterialLayers?.[0] ?? m.Materials?.[0] ?? m.MaterialConstituents?.[0];
    if (next?.value && depth < 4) {
      const inner = materialName(next.value, depth + 1);
      if (inner) return inner;
    }
    return m.Name?.value;
  }

  // Materials via IfcRelAssociatesMaterial — each to the members it names.
  try {
    const relIds = api.GetLineIDsWithType(modelID, WebIFC.IFCRELASSOCIATESMATERIAL);
    for (let i = 0; i < relIds.size(); i++) {
      try {
        const rel = api.GetLine(modelID, relIds.get(i));
        if (!rel?.RelatingMaterial || !rel.RelatedObjects) continue;
        const name = materialName(rel.RelatingMaterial.value);
        if (!name) continue;
        for (const objRef of rel.RelatedObjects) {
          const member = memberByExpressId.get(objRef.value) ?? surfaceByExpressId.get(objRef.value);
          if (member) member.materialName = name;
        }
      } catch {
        // Skip problematic relations
      }
    }
  } catch {
    // No material relations found
  }

  api.CloseModel(modelID);

  if (members.length === 0 && surfaces.length === 0) {
    warnings.push(t('ifc.noMembers'));
  }

  return { members, surfaces, storeys, warnings };
}
