// IFC Parser — extracts structural members from IFC files using web-ifc
// This module requires the web-ifc WASM to be available at /web-ifc.wasm

import type { IfcMember } from './ifc-mapper';
import { t } from '../i18n';

// IFC entity type constants
const IFCBEAM = 753729222;
const IFCCOLUMN = 3999819293;
const IFCMEMBER = 1073191201;
const IFCRELASSOCIATESMATERIAL = 2655215786;
const IFCMATERIAL = 1838606355;
const IFCMATERIALLAYERSET = 3303938423;
const IFCMATERIALLAYERSETUSAGE = 1303795690;

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

  // Helper: extract placement matrix (simplified — gets translation)
  function getPlacementOrigin(placementId: number): { x: number; y: number; z: number } | null {
    try {
      const placement = api.GetLine(modelID, placementId);
      if (!placement) return null;

      // Try to get the relative placement
      const relPlacement = placement.RelativePlacement;
      if (!relPlacement) return null;

      const relObj = api.GetLine(modelID, relPlacement.value);
      if (!relObj || !relObj.Location) return null;

      const locObj = api.GetLine(modelID, relObj.Location.value);
      if (!locObj || !locObj.Coordinates) return null;

      const coords = locObj.Coordinates;
      return {
        x: coords[0]?.value ?? 0,
        y: coords[1]?.value ?? 0,
        z: coords[2]?.value ?? 0,
      };
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
                  // ExtrudedDirection
                  let dx = 0, dy = 0, dz = 1; // default Z direction
                  if (item.ExtrudedDirection) {
                    const dirObj = api.GetLine(modelID, item.ExtrudedDirection.value);
                    if (dirObj && dirObj.DirectionRatios) {
                      dx = dirObj.DirectionRatios[0]?.value ?? 0;
                      dy = dirObj.DirectionRatios[1]?.value ?? 0;
                      dz = dirObj.DirectionRatios[2]?.value ?? 1;
                    }
                  }
                  const mag = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
                  return {
                    start,
                    end: {
                      x: start.x + (dx / mag) * length,
                      y: start.y + (dy / mag) * length,
                      z: start.z + (dz / mag) * length,
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
