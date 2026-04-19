// IFC Parser — extracts structural members from IFC files using web-ifc
// This module requires the web-ifc WASM to be available at /web-ifc.wasm

import type { IfcMember } from './ifc-mapper';
import { t } from '../i18n';

// ─── IFC Y-up → App Z-up coordinate remapping ───────────────────
// IFC (buildingSMART) uses Y-up convention; this app uses Z-up
// (structural engineering convention where Z is vertical).
// The right-hand-preserving transform is:
//   app_x =  ifc_x
//   app_y = -ifc_z
//   app_z =  ifc_y

/** Remap an IFC Y-up position to the app's Z-up convention. */
export function ifcToZup(
  ifc_x: number, ifc_y: number, ifc_z: number,
): { x: number; y: number; z: number } {
  return { x: ifc_x, y: -ifc_z, z: ifc_y };
}

/** Remap an IFC Y-up direction vector to the app's Z-up convention. */
export function ifcDirToZup(
  ifc_dx: number, ifc_dy: number, ifc_dz: number,
): { dx: number; dy: number; dz: number } {
  return { dx: ifc_dx, dy: -ifc_dz, dz: ifc_dy };
}

// IFC entity type constants
const IFCBEAM = 753729222;
const IFCCOLUMN = 3999819293;
const IFCMEMBER = 1073191201;
const IFCRELASSOCIATESMATERIAL = 2655215786;

export interface IfcParseResult {
  members: IfcMember[];
  warnings: string[];
}

/**
 * Parse an IFC file and extract structural members (beams, columns, braces).
 * Returns start/end points in world coordinates.
 */
export async function parseIfc(data: ArrayBuffer): Promise<IfcParseResult> {
  // Dynamic import to avoid bundling 3.5MB WASM in main chunk
  const WebIFC = await import('web-ifc');
  const api = new WebIFC.IfcAPI();
  api.SetWasmPath('/');
  await api.Init();

  const modelID = api.OpenModel(new Uint8Array(data));
  const warnings: string[] = [];
  const members: IfcMember[] = [];
  let nextId = 1;

  // Helper: extract placement origin, composing the IfcLocalPlacement hierarchy.
  // IFC objects can have nested local coordinate systems via IfcLocalPlacement.
  // Each placement has a PlacementRelTo (parent) that must be composed
  // to obtain world coordinates. The result is remapped from IFC Y-up to app Z-up.
  function getPlacementOrigin(placementId: number): { x: number; y: number; z: number } | null {
    try {
      // Accumulate translations up the placement hierarchy (IFC Y-up space)
      let totalX = 0, totalY = 0, totalZ = 0;
      let currentId: number | null = placementId;
      const visited = new Set<number>(); // guard against circular references

      while (currentId !== null) {
        if (visited.has(currentId)) break;
        visited.add(currentId);

        const placement = api.GetLine(modelID, currentId);
        if (!placement) break;

        // Extract this level's translation
        const relPlacement = placement.RelativePlacement;
        if (relPlacement) {
          const relObj = api.GetLine(modelID, relPlacement.value);
          if (relObj?.Location) {
            const locObj = api.GetLine(modelID, relObj.Location.value);
            if (locObj?.Coordinates) {
              totalX += locObj.Coordinates[0]?.value ?? 0;
              totalY += locObj.Coordinates[1]?.value ?? 0;
              totalZ += locObj.Coordinates[2]?.value ?? 0;
            }
          }
        }

        // Walk up to parent placement (IfcLocalPlacement.PlacementRelTo)
        currentId = placement.PlacementRelTo?.value ?? null;
      }

      // Remap from IFC Y-up to app Z-up
      return ifcToZup(totalX, totalY, totalZ);
    } catch {
      return null;
    }
  }

  // Helper: get member endpoints from representation (extrusion direction + length)
  function getMemberEndpoints(
    entity: any,
  ): { start: { x: number; y: number; z: number }; end: { x: number; y: number; z: number } } | null {
    try {
      // Get placement origin
      const origin = entity.ObjectPlacement
        ? getPlacementOrigin(entity.ObjectPlacement.value)
        : null;

      const start = origin ?? { x: 0, y: 0, z: 0 };

      // Try to get length from representation (ExtrudedAreaSolid)
      if (entity.Representation) {
        const repr = api.GetLine(modelID, entity.Representation.value);
        if (repr && repr.Representations) {
          for (const reprRef of repr.Representations) {
            const reprItem = api.GetLine(modelID, reprRef.value);
            if (reprItem && reprItem.Items) {
              for (const itemRef of reprItem.Items) {
                const item = api.GetLine(modelID, itemRef.value);
                if (item && item.Depth) {
                  // ExtrudedAreaSolid — Depth is the length
                  const length = item.Depth.value;
                  // ExtrudedDirection — read in IFC Y-up space, then remap
                  let ifc_dx = 0, ifc_dy = 0, ifc_dz = 1; // default: IFC Z direction
                  if (item.ExtrudedDirection) {
                    const dirObj = api.GetLine(modelID, item.ExtrudedDirection.value);
                    if (dirObj && dirObj.DirectionRatios) {
                      ifc_dx = dirObj.DirectionRatios[0]?.value ?? 0;
                      ifc_dy = dirObj.DirectionRatios[1]?.value ?? 0;
                      ifc_dz = dirObj.DirectionRatios[2]?.value ?? 1;
                    }
                  }
                  // Remap extrusion direction from IFC Y-up to app Z-up
                  const dir = ifcDirToZup(ifc_dx, ifc_dy, ifc_dz);
                  const mag = Math.sqrt(dir.dx * dir.dx + dir.dy * dir.dy + dir.dz * dir.dz) || 1;
                  return {
                    start,
                    end: {
                      x: start.x + (dir.dx / mag) * length,
                      y: start.y + (dir.dy / mag) * length,
                      z: start.z + (dir.dz / mag) * length,
                    },
                  };
                }
              }
            }
          }
        }
      }

      // Fallback: try to use bounding box or just return null
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

  // Process structural element types
  const entityTypes = [
    { type: IFCBEAM, memberType: 'beam' as const },
    { type: IFCCOLUMN, memberType: 'column' as const },
    { type: IFCMEMBER, memberType: 'brace' as const },
  ];

  for (const { type, memberType } of entityTypes) {
    try {
      const ids = api.GetLineIDsWithType(modelID, type);
      for (let i = 0; i < ids.size(); i++) {
        const id = ids.get(i);
        try {
          const entity = api.GetLine(modelID, id);
          if (!entity) continue;

          const name = entity.Name?.value ?? `${memberType}_${nextId}`;
          const endpoints = getMemberEndpoints(entity);
          const profileName = getProfileName(entity);

          if (endpoints) {
            members.push({
              id: nextId++,
              type: memberType,
              name,
              start: endpoints.start,
              end: endpoints.end,
              profileName,
            });
          } else {
            warnings.push(`No se pudieron extraer puntos para "${name}"`);
          }
        } catch (e: any) {
          warnings.push(`Error procesando entidad ${id}: ${e.message}`);
        }
      }
    } catch {
      // Entity type not found in model — skip
    }
  }

  // Extract materials via IfcRelAssociatesMaterial
  try {
    const relIds = api.GetLineIDsWithType(modelID, IFCRELASSOCIATESMATERIAL);
    for (let i = 0; i < relIds.size(); i++) {
      const relId = relIds.get(i);
      try {
        const rel = api.GetLine(modelID, relId);
        if (!rel || !rel.RelatingMaterial || !rel.RelatedObjects) continue;

        // Get material name
        let materialName: string | undefined;
        const matRef = rel.RelatingMaterial.value;
        try {
          const mat = api.GetLine(modelID, matRef);
          if (mat?.Name) materialName = mat.Name.value;
        } catch {
          // May be a material layer set etc — try to get name from type
        }

        if (!materialName) continue;

        // Assign material to related objects
        const relatedIds = new Set<number>();
        for (const objRef of rel.RelatedObjects) {
          relatedIds.add(objRef.value);
        }

        for (const member of members) {
          // Match by IFC entity ID (member.id is sequential, we'd need to store express ID)
          // For now, apply material name if found
          if (!member.materialName) {
            member.materialName = materialName;
          }
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
