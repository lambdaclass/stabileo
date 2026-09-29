// IFC Parser — extracts structural members from IFC files using web-ifc
// This module requires the web-ifc WASM to be available at /web-ifc.wasm

import type { IfcMember } from './ifc-mapper';
import { t, tp } from '../i18n';
import { IDENTITY, axis2Placement3D, compose, extrusionAxis, type Frame, type V3 } from './ifc-geometry';

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

  // A member's axis: the extruded solid's own Position under the object's placement, pushed
  // Depth along its ExtrudedDirection.
  function getMemberEndpoints(
    entity: any,
  ): { start: { x: number; y: number; z: number }; end: { x: number; y: number; z: number } } | null {
    try {
      const world = entity.ObjectPlacement ? worldPlacement(entity.ObjectPlacement.value) : IDENTITY;
      if (!entity.Representation) return null;
      const repr = api.GetLine(modelID, entity.Representation.value);
      for (const reprRef of repr?.Representations ?? []) {
        const reprItem = api.GetLine(modelID, reprRef.value);
        for (const itemRef of reprItem?.Items ?? []) {
          const item = api.GetLine(modelID, itemRef.value);
          if (!item?.Depth) continue;
          const solid = compose(world, frameOf(item.Position));
          const dir = v3(item.ExtrudedDirection, [0, 0, 1])!;
          const { start, end } = extrusionAxis(solid, dir, item.Depth.value * lengthScale);
          return { start: { x: start[0], y: start[1], z: start[2] }, end: { x: end[0], y: end[1], z: end[2] } };
        }
      }
      return null;
    } catch {
      return null;
    }
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
          const profileName = getProfileName(entity);

          if (endpoints) {
            const m: IfcMember = { id: nextId++, type: memberType, name, start: endpoints.start, end: endpoints.end, profileName };
            members.push(m);
            memberByExpressId.set(id, m);
          } else {
            warnings.push(tp('ifc.noPoints', { n: name }));
          }
        } catch (e: any) {
          warnings.push(tp('ifc.entityError', { id, msg: e.message }));
        }
      }
    } catch {
      // Entity type not found in model — skip
    }
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
          const member = memberByExpressId.get(objRef.value);
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

  if (members.length === 0) {
    warnings.push(t('ifc.noMembers'));
  }

  return { members, warnings };
}
