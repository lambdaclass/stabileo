import { assembleDrawn, areaOf, type DrawnSection } from './drawn';
import { catalogueOutline } from './canonical';

type WeightSection = { a: number; drawn?: DrawnSection };

/**
 * Physical weight per metre (kN/m). A composite section's stored A is transformed for
 * stiffness; weight must instead integrate each material's real area after unions and holes.
 * The cache belongs to one calculation, so density/geometry edits are read on the next run.
 */
export function createSectionWeight(materials: ReadonlyMap<number, { rho: number }>) {
  const areas = new Map<DrawnSection, Array<{ materialId: number | null; area: number }>>();
  return (section: WeightSection, memberMaterialId: number): number => {
    const density = (id: number) => {
      const rho = materials.get(id)?.rho;
      if (rho == null || !Number.isFinite(rho) || rho < 0) {
        throw new Error(`Section weight: missing or invalid density for material ${id}`);
      }
      return rho;
    };
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
