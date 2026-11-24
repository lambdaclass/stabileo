import { assembleDrawn, areaOf, type DrawnSection } from './drawn';
import { catalogueOutline } from './canonical';

type WeightSection = { a: number; drawn?: DrawnSection };

/**
 * Physical weight per metre (kN/m). A composite section's stored A is transformed for
 * stiffness; weight must instead integrate each material's real area after unions and holes.
 * The cache belongs to one calculation, so density/geometry edits are read on the next run.
 */
/**
 * Each material's real area of a drawn section, after unions and holes, m²: a part with no
 * material of its own is the reference's when the section has one, else the member's. The one
 * rule weight and quantities both read.
 */
export function drawnMaterialAreas(drawn: DrawnSection, memberMaterialId: number): Array<{ materialId: number; area: number }> {
  const assembled = assembleDrawn(drawn, catalogueOutline);
  if (assembled.issues.some((i) => i.severity === 'error') || assembled.regions.length === 0) {
    throw new Error('Section weight: invalid drawn geometry');
  }
  const reference = drawn.refMaterialId ?? memberMaterialId;
  return assembled.regions.map((r) => ({ materialId: r.materialId ?? reference, area: areaOf(r.region) }));
}

export class InvalidMaterialDensity extends Error {
  constructor(readonly materialId: number, readonly value: unknown) {
    super(`Section weight: missing or invalid density (rho) for material ${materialId}`);
  }
}

export function requireMaterialDensity(materialId: number, material: { rho?: number } | undefined): number {
  const rho = material?.rho;
  if (typeof rho !== 'number' || !Number.isFinite(rho) || rho < 0) {
    throw new InvalidMaterialDensity(materialId, rho);
  }
  return rho;
}

export function createSectionWeight(materials: ReadonlyMap<number, { rho?: number }>) {
  const areas = new Map<DrawnSection, Array<{ materialId: number | null; area: number }>>();
  return (section: WeightSection, memberMaterialId: number): number => {
    const density = (id: number) => requireMaterialDensity(id, materials.get(id));
    if (!section.drawn) return section.a * density(memberMaterialId);
    const drawn = section.drawn;
    let regions = areas.get(drawn);
    if (!regions) {
      const assembled = assembleDrawn(drawn, catalogueOutline);
      if (assembled.issues.some((i) => i.severity === 'error') || assembled.regions.length === 0) {
        throw new Error('Section weight: invalid drawn geometry');
      }
      regions = assembled.regions.map((r) => ({ materialId: r.materialId, area: areaOf(r.region) }));
      areas.set(drawn, regions);
    }
    const reference = drawn.refMaterialId ?? memberMaterialId;
    return regions.reduce((w, r) => w + r.area * density(r.materialId ?? reference), 0);
  };
}
