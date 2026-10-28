// IFC Parser — extracts structural members from IFC files using web-ifc
// This module requires the web-ifc WASM to be available at /web-ifc.wasm

import type { IfcFootingRead, IfcMember, IfcStairRead, IfcStorey, IfcSurface } from './ifc-mapper';
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
  /** Pad and strip footings; footing beams come among the members. */
  footings: IfcFootingRead[];
  /** Stairs, by their flights. */
  stairs: IfcStairRead[];
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
  // The desktop app parses in a worker, which runs this same function (./ifc-worker.ts says why).
  if (import.meta.env.VITE_DESKTOP === '1' && typeof document !== 'undefined') {
    return (await import('./parse-in-worker')).parseIfcInWorker(data);
  }
  // Dynamic import to avoid bundling 3.5MB WASM in main chunk
  const WebIFC = await import('web-ifc');
  const api = new WebIFC.IfcAPI();
  // '/' is where the app serves web-ifc.wasm from; tests point at the package instead.
  api.SetWasmPath(opts?.wasmPath ?? '/');
  await api.Init();

  const modelID = api.OpenModel(new Uint8Array(data));
  if (!(modelID >= 0)) {
    // A schema the reader does not open (IFC2X2, say) gives no model; said so, with the file's own name for it.
    const head = new TextDecoder().decode(new Uint8Array(data, 0, Math.min(data.byteLength, 4096)));
    const schema = /FILE_SCHEMA\s*\(\s*\(\s*'([^']+)'/i.exec(head)?.[1] ?? '?';
    throw new Error(tp('ifc.unsupportedSchema', { schema }));
  }
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

  /**
   * A list entry's number. web-ifc gives a list's members as typed values ({ value }) in some files
   * and as plain numbers in others (an IFC2X3 export's DirectionRatios came as [0, 0, 1]): read as
   * typed values only, every direction was (0, 0, 0), every member zero length and every slab zero
   * thick, and such a file imported nothing.
   */
  const entry = (x: any): number => {
    const v = typeof x === 'number' ? x : x?.value;
    const n = typeof v === 'string' ? parseFloat(v) : v;
    return typeof n === 'number' && Number.isFinite(n) ? n : 0;
  };
  const v3 = (ref: any, fallback?: V3): V3 | undefined => {
    if (!ref) return fallback;
    const o = api.GetLine(modelID, ref.value);
    // Coordinates are length-like and follow the file unit; DirectionRatios are
    // unitless (and normalized downstream) and stay raw.
    if (o?.Coordinates) {
      const c = o.Coordinates;
      return [entry(c[0]) * lengthScale, entry(c[1]) * lengthScale, entry(c[2]) * lengthScale];
    }
    const c = o?.DirectionRatios;
    if (!c) return fallback;
    return [entry(c[0]), entry(c[1]), entry(c[2])];
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
        // The profile's own placement moves the section within the solid's plane: the axis runs
        // through the profile's centre, not through the solid's origin (a file that puts the
        // origin at a beam's top edge offsets its profile by half the depth).
        const pr = item.SweptArea ? api.GetLine(modelID, item.SweptArea.value) : null;
        const c = pr?.Position ? place2D(pr.Position).o : [0, 0];
        const solid = compose(compose(world, frameOf(item.Position)), { r: IDENTITY.r, t: [c[0]!, c[1]!, 0] });
        const dir = v3(item.ExtrudedDirection, [0, 0, 1])!;
        const { start, end } = extrusionAxis(solid, dir, num(item.Depth) * lengthScale);
        return { start: { x: start[0], y: start[1], z: start[2] }, end: { x: end[0], y: end[1], z: end[2] } };
      }
      return null;
    } catch {
      return null;
    }
  }

  /**
   * A rectangle's or a circle's own dimensions, m, and where the profile's x axis points in the
   * world. A horizontal member whose profile has its x axis vertical has its depth along x: b and
   * h are read the other way round. A column's profile x axis gives its rotation in plan.
   */
  function getProfileDims(entity: any): { dims: IfcMember['profileDims']; rollDeg?: number } {
    const world = entity.ObjectPlacement ? worldPlacement(entity.ObjectPlacement.value) : IDENTITY;
    for (const item of extrusions(entity)) {
      const pr = api.GetLine(modelID, item.SweptArea.value);
      const solid = compose(world, frameOf(item.Position));
      const px = pr?.Position ? place2D(pr.Position).x : [1, 0];
      const xw = rotate(solid, [px[0]!, px[1]!, 0]);
      const along = rotate(solid, v3(item.ExtrudedDirection, [0, 0, 1])!);
      const vertical = Math.abs(along[2]) / (Math.hypot(...along) || 1) > 0.99;
      if (pr?.XDim && pr?.YDim && !pr.WallThickness) {
        const X = num(pr.XDim) * lengthScale, Y = num(pr.YDim) * lengthScale;
        if (vertical) return { dims: { shape: 'rect', b: X, h: Y }, rollDeg: (Math.atan2(xw[1], xw[0]) * 180) / Math.PI };
        return { dims: Math.abs(xw[2]) > 0.9 ? { shape: 'rect', b: Y, h: X } : { shape: 'rect', b: X, h: Y } };
      }
      if (pr?.Radius && !pr.WallThickness) return { dims: { shape: 'circle', d: 2 * num(pr.Radius) * lengthScale } };
    }
    return { dims: undefined };
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
          const { dims: profileDims, rollDeg } = getProfileDims(entity);
          // A profile with no name but a rectangle or a circle is named by its size, in mm.
          const mm = (v: number) => String(Math.round(v * 1000));
          const profileName = getProfileName(entity)
            ?? (profileDims ? (profileDims.shape === 'rect' ? `${mm(profileDims.b)}×${mm(profileDims.h)}` : `Ø${mm(profileDims.d)}`) : undefined);

          if (endpoints) {
            const m: IfcMember = {
              id: nextId++, type: memberType, name, start: endpoints.start, end: endpoints.end, profileName,
              ...(profileDims ? { profileDims } : {}), ...(rollDeg !== undefined && Math.abs(rollDeg) > 1e-6 ? { rollDeg } : {}), ifcClass: ifcClassName(type),
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

  // ── Footings: pads and strips as plan rectangles; footing beams as members ──
  const footings: IfcFootingRead[] = [];
  const footingByExpressId = new Map<number, IfcFootingRead>();
  /** The corners of an extruded solid in the world, both ends. */
  function solidCorners(entity: any): V3[] {
    const world = entity.ObjectPlacement ? worldPlacement(entity.ObjectPlacement.value) : IDENTITY;
    const out: V3[] = [];
    for (const item of extrusions(entity)) {
      const pts = profileOutline(item.SweptArea);
      if (!pts) continue;
      const solid = compose(world, frameOf(item.Position));
      const local = v3(item.ExtrudedDirection, [0, 0, 1])!;
      const ll = Math.hypot(...local) || 1, depth = num(item.Depth) * lengthScale;
      const up = rotate(solid, [local[0] / ll * depth, local[1] / ll * depth, local[2] / ll * depth]);
      for (const [u, v] of pts) { const q = apply(solid, [u, v, 0]); out.push(q, [q[0] + up[0], q[1] + up[1], q[2] + up[2]]); }
    }
    return out;
  }
  /** The smallest rectangle holding plan points: centre, sides and the angle of the longer. */
  function planRectangle(pts: V3[]): { centre: { x: number; y: number }; length: number; width: number; angle: number } | null {
    if (pts.length < 3) return null;
    let best: { a: number; L: number; W: number; c: [number, number] } | null = null;
    for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) {
      const dx = pts[j]![0] - pts[i]![0], dy = pts[j]![1] - pts[i]![1];
      if (Math.hypot(dx, dy) < 1e-6) continue;
      const a = Math.atan2(dy, dx), u = [Math.cos(a), Math.sin(a)], v = [-u[1]!, u[0]!];
      const su = pts.map((p) => p[0] * u[0]! + p[1] * u[1]!), sv = pts.map((p) => p[0] * v[0]! + p[1] * v[1]!);
      const L = Math.max(...su) - Math.min(...su), W = Math.max(...sv) - Math.min(...sv);
      if (!best || L * W < best.L * best.W - 1e-9) {
        const cu = (Math.max(...su) + Math.min(...su)) / 2, cv = (Math.max(...sv) + Math.min(...sv)) / 2;
        best = { a, L, W, c: [cu * u[0]! + cv * v[0], cu * u[1]! + cv * v[1]] };
      }
    }
    if (!best) return null;
    const swap = best.W > best.L;
    const deg = ((best.a * 180) / Math.PI + (swap ? 90 : 0) + 360) % 180;
    return { centre: { x: best.c[0], y: best.c[1] }, length: swap ? best.W : best.L, width: swap ? best.L : best.W, angle: deg > 90 ? deg - 180 : deg };
  }
  try {
    const ids = api.GetLineIDsWithType(modelID, WebIFC.IFCFOOTING);
    for (let i = 0; i < ids.size(); i++) {
      const id = ids.get(i);
      const entity = api.GetLine(modelID, id);
      if (!entity) continue;
      const name = entity.Name?.value ?? `footing_${nextId}`;
      const type = String(entity.PredefinedType?.value ?? '');
      if (type === 'FOOTING_BEAM') {
        // A footing beam is a beam of the foundation: its axis and its section, as any beam's.
        const endpoints = getMemberEndpoints(entity);
        const { dims } = getProfileDims(entity);
        if (!endpoints) { warnings.push(tp('ifc.noPoints', { n: name })); continue; }
        const mm = (v: number) => String(Math.round(v * 1000));
        const m: IfcMember = {
          id: nextId++, type: 'beam', name, start: endpoints.start, end: endpoints.end,
          ...(dims ? { profileDims: dims, profileName: dims.shape === 'rect' ? `${mm(dims.b)}×${mm(dims.h)}` : `Ø${mm(dims.d)}` } : {}),
          ifcClass: 'IfcFooting', typology: 'foundation',
          ...(entity.GlobalId?.value ? { globalId: String(entity.GlobalId.value) } : {}),
        };
        members.push(m); memberByExpressId.set(id, m);
        continue;
      }
      const corners = solidCorners(entity);
      const rect = planRectangle(corners);
      if (!rect) { warnings.push(tp('ifc.noSurface', { n: name })); continue; }
      const zs = corners.map((p) => p[2]);
      const f: IfcFootingRead = {
        id: nextId++, kind: type === 'STRIP_FOOTING' ? 'strip' : 'pad', name, ...rect,
        zBottom: Math.min(...zs), zTop: Math.max(...zs),
        ...(entity.GlobalId?.value ? { globalId: String(entity.GlobalId.value) } : {}),
      };
      footings.push(f); footingByExpressId.set(id, f);
    }
  } catch {
    // No footings in the file.
  }

  // ── Stairs: each flight, the inclined slab of its body ──
  const stairs: IfcStairRead[] = [];
  const stairByExpressId = new Map<number, IfcStairRead>();
  /** The planar faces of a faceted body, in the world. */
  function brepFaces(entity: any): V3[][][] {
    const world = entity.ObjectPlacement ? worldPlacement(entity.ObjectPlacement.value) : IDENTITY;
    const solids: V3[][][] = [];
    try {
      const repr = entity.Representation ? api.GetLine(modelID, entity.Representation.value) : null;
      for (const reprRef of repr?.Representations ?? []) {
        const ri = api.GetLine(modelID, reprRef.value);
        for (const itemRef of ri?.Items ?? []) {
          const item = api.GetLine(modelID, itemRef.value);
          const shell = item?.Outer ? api.GetLine(modelID, item.Outer.value) : null;
          if (!shell?.CfsFaces) continue;
          const faces: V3[][] = [];
          for (const fr of shell.CfsFaces) {
            const face = api.GetLine(modelID, fr.value);
            const bound = face?.Bounds?.[0] ? api.GetLine(modelID, face.Bounds[0].value) : null;
            const loop = bound?.Bound ? api.GetLine(modelID, bound.Bound.value) : null;
            if (!loop?.Polygon) continue;
            faces.push(loop.Polygon.map((r: any) => apply(world, v3(r, [0, 0, 0])!)));
          }
          if (faces.length) solids.push(faces);
        }
      }
    } catch { /* an unreadable body has no flight */ }
    return solids;
  }
  /** The flight of a solid: its inclined underside and upper face, the mid-surface between them. */
  function flightOf(faces: V3[][]): IfcStairRead['flights'][number] | null {
    // Its faces' outlines merged per plane: a quad written as two triangles is one face.
    const planes: Array<{ n: V3; d: number; pts: V3[] }> = [];
    for (const f of faces) {
      if (f.length < 3) continue;
      const [a, b, c] = f as [V3, V3, V3];
      const u: V3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], w: V3 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
      let n: V3 = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
      const l = Math.hypot(...n); if (l < 1e-9) continue;
      n = [n[0] / l, n[1] / l, n[2] / l];
      const d = n[0] * a[0] + n[1] * a[1] + n[2] * a[2];
      const same = planes.find((p) => Math.abs(p.n[0] * n[0] + p.n[1] * n[1] + p.n[2] * n[2]) > 0.999 && Math.abs(Math.sign(p.n[0] * n[0] + p.n[1] * n[1] + p.n[2] * n[2]) * p.d - d) < 1e-3);
      if (same) same.pts.push(...f); else planes.push({ n, d, pts: [...f] });
    }
    // Inclined between 10° and 60°, the largest of each sense.
    const tilted = planes.filter((p) => Math.abs(p.n[2]) < Math.cos((10 * Math.PI) / 180) && Math.abs(p.n[2]) > Math.cos((60 * Math.PI) / 180));
    const area = (p: { pts: V3[] }) => { const zs = p.pts.map((q) => q[2]); return (Math.max(...zs) - Math.min(...zs)) * Math.max(...p.pts.map((q) => Math.hypot(q[0] - p.pts[0]![0], q[1] - p.pts[0]![1]))); };
    const under = tilted.filter((p) => p.n[2] < 0).sort((a, b) => area(b) - area(a))[0];
    const over = tilted.filter((p) => p.n[2] > 0).sort((a, b) => area(b) - area(a))[0];
    if (!under || !over) return null;
    const waist = Math.abs(over.d - (over.n[0] * under.pts[0]![0] + over.n[1] * under.pts[0]![1] + over.n[2] * under.pts[0]![2]));
    if (!(waist > 0.03 && waist < 0.6)) return null;
    // The underside's corners raised half the waist: the mid-surface. Low and high edges by height.
    const uniq: V3[] = [];
    for (const q of under.pts) if (!uniq.some((r) => Math.hypot(r[0] - q[0], r[1] - q[1], r[2] - q[2]) < 1e-4)) uniq.push(q);
    if (uniq.length < 4) return null;
    const mid = uniq.map((q) => ({ x: q[0] + over.n[0] * waist / 2, y: q[1] + over.n[1] * waist / 2, z: q[2] + over.n[2] * waist / 2 }));
    const byZ = [...mid].sort((p, q) => p.z - q.z);
    const lowPair = byZ.slice(0, 2), highPair = byZ.slice(-2);
    // Left to right going up: the run direction crossed with up.
    const run = { x: (highPair[0]!.x + highPair[1]!.x - lowPair[0]!.x - lowPair[1]!.x) / 2, y: (highPair[0]!.y + highPair[1]!.y - lowPair[0]!.y - lowPair[1]!.y) / 2 };
    const left = (p: { x: number; y: number }, o: { x: number; y: number }) => run.x * (p.y - o.y) - run.y * (p.x - o.x);
    const o = lowPair[0]!;
    const lr = <T extends { x: number; y: number }>(pair: T[]): [T, T] => (left(pair[0]!, o) >= left(pair[1]!, o) ? [pair[0]!, pair[1]!] : [pair[1]!, pair[0]!]);
    return { low: lr(lowPair), high: lr(highPair), waist };
  }
  /** A landing of a stair: a solid with flat top and underside a slab's depth apart, its plan a rectangle. */
  function landingOf(faces: V3[][]): NonNullable<IfcStairRead['landings']>[number] | null {
    const pts = faces.flat();
    if (pts.length < 4) return null;
    const zs = pts.map((q) => q[2]), lo = Math.min(...zs), hi = Math.max(...zs), t = hi - lo;
    if (!(t > 0.03 && t < 0.6) || pts.some((q) => Math.abs(q[2] - lo) > 1e-3 && Math.abs(q[2] - hi) > 1e-3)) return null;
    const r = planRectangle(pts);
    if (!r || r.length * r.width < 0.3) return null;
    // Its plan must fill the rectangle: an L or a tread's outline is not a landing.
    const bottom = faces.filter((f) => f.every((q) => Math.abs(q[2] - lo) < 1e-3));
    const shoelace = (f: V3[]) => Math.abs(f.reduce((a, q, i) => { const n = f[(i + 1) % f.length]!; return a + q[0] * n[1] - n[0] * q[1]; }, 0)) / 2;
    if (Math.abs(bottom.reduce((a, f) => a + shoelace(f), 0) - r.length * r.width) > 0.05 * r.length * r.width) return null;
    const a = (r.angle * Math.PI) / 180, u = { x: Math.cos(a), y: Math.sin(a) }, v = { x: -u.y, y: u.x }, z = (lo + hi) / 2;
    const at = (su: number, sv: number) => ({ x: r.centre.x + (su * r.length / 2) * u.x + (sv * r.width / 2) * v.x, y: r.centre.y + (su * r.length / 2) * u.y + (sv * r.width / 2) * v.y, z });
    return { corners: [at(-1, -1), at(1, -1), at(1, 1), at(-1, 1)], thickness: t };
  }
  try {
    for (const T of [WebIFC.IFCSTAIR, (WebIFC as any).IFCSTAIRFLIGHT].filter((x) => typeof x === 'number')) {
      const ids = api.GetLineIDsWithType(modelID, T);
      for (let i = 0; i < ids.size(); i++) {
        const entity = api.GetLine(modelID, ids.get(i));
        if (!entity) continue;
        const solids = brepFaces(entity);
        const flights = solids.map(flightOf).filter((f): f is NonNullable<typeof f> => !!f);
        if (!flights.length) continue;
        const landings = solids.filter((f) => !flightOf(f)).map(landingOf).filter((f): f is NonNullable<typeof f> => !!f);
        const st: IfcStairRead = { id: nextId++, name: entity.Name?.value ?? `stair_${nextId}`, flights, ...(landings.length ? { landings } : {}), ...(entity.GlobalId?.value ? { globalId: String(entity.GlobalId.value) } : {}) };
        stairs.push(st); stairByExpressId.set(ids.get(i), st);
      }
    }
    // The riser height its property sets state, when they do.
    if (stairByExpressId.size) {
      const rels = api.GetLineIDsWithType(modelID, WebIFC.IFCRELDEFINESBYPROPERTIES);
      for (let i = 0; i < rels.size(); i++) {
        const rel = api.GetLine(modelID, rels.get(i));
        const targets = (rel?.RelatedObjects ?? []).map((o: any) => stairByExpressId.get(o.value)).filter(Boolean) as IfcStairRead[];
        if (!targets.length || !rel.RelatingPropertyDefinition) continue;
        const set = api.GetLine(modelID, rel.RelatingPropertyDefinition.value);
        for (const pr of set?.HasProperties ?? []) {
          const prop = api.GetLine(modelID, pr.value);
          if (String(prop?.Name?.value ?? '').toLowerCase() !== 'riserheight') continue;
          const v = num(prop.NominalValue) * lengthScale;
          if (v > 0.05 && v < 0.3) for (const t of targets) t.riserHeight = v;
        }
      }
    }
  } catch { /* no stairs */ }

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
        const sf: IfcSurface = { id: nextId++, type: kind, name, outline: g.outline.map(P), thickness: g.thickness, ifcClass: ifcClassName(type), ...(entity.GlobalId?.value ? { globalId: String(entity.GlobalId.value) } : {}), ...(entity.ObjectType?.value ? { objectType: String(entity.ObjectType.value) } : {}) };
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
        const m = memberByExpressId.get(ref.value) ?? surfaceByExpressId.get(ref.value) ?? footingByExpressId.get(ref.value);
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
          const member = memberByExpressId.get(objRef.value) ?? surfaceByExpressId.get(objRef.value) ?? footingByExpressId.get(objRef.value);
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

  return { members, surfaces, storeys, footings, stairs, warnings };
}
