/**
 * What a typology asks of the material and the section it is built with.
 *
 * The building panel's typology and its section and material lists were independent: a new model
 * offers IPN 300 in Acero A36 first, so a frame placed with the typology "concrete column,
 * dropped beam" came out in steel, and the concrete design had nothing to design. The typology
 * now proposes a fitting material and section when the current one does not fit, and the panel
 * says so when the model has none.
 *
 * Pure.
 */
import { materialFamilyOf } from '../../engine/steel/material-family';

export type TypologyFamily = 'concrete' | 'steel' | 'timber';

/** The material family a typology is built in; composite columns take a steel section. */
export function typologyFamily(kind: 'column' | 'beam', typology: string | undefined): TypologyFamily | null {
  if (!typology) return null;
  if (typology === 'steel' || typology === 'composite') return 'steel';
  if (typology === 'timber') return 'timber';
  if (kind === 'column') return typology === 'concrete' ? 'concrete' : null;
  // dropped, flat, inverted, foundation, tie, strap, edge: concrete beams.
  return 'concrete';
}

interface Mat { id: number; name: string; fy?: number; fc?: number; timber?: unknown; gradeId?: string }
interface Sec { id: number; name: string; shape?: string; b?: number; h?: number }

/** A material's family; one that states f'c is a concrete. */
export function familyOfMaterial(m: Mat): TypologyFamily | null {
  if (m.fc !== undefined && m.fc > 0) return 'concrete';
  const f = materialFamilyOf(m).family;
  return f === 'concrete' || f === 'steel' || f === 'timber' ? f : null;
}

const SOLID = new Set(['rect', 'T', 'invL', 'generic']);
const PROFILE = new Set(['I', 'H', 'U', 'L', 'RHS', 'CHS', 'C', 'Z', 'T']);

/** Whether a section can be built in the family: solid shapes for concrete and timber, profiles for steel. */
export function sectionFits(fam: TypologyFamily, s: Sec): boolean {
  const shape = s.shape ?? (s.b && s.h ? 'rect' : 'generic');
  if (fam === 'steel') return PROFILE.has(shape);
  if (fam === 'timber') return shape === 'rect';
  return SOLID.has(shape);
}

/**
 * The material and section to build `kind` in, for `fam`: the current ones when they fit, else the
 * first fitting material and the fitting section that suits the kind best (the squarest for a
 * column, the deepest for a beam). Null where the model has nothing that fits.
 */
export function fittingChoice(
  fam: TypologyFamily, kind: 'column' | 'beam', materials: readonly Mat[], sections: readonly Sec[],
  current: { materialId: number; sectionId: number },
): { materialId: number | null; sectionId: number | null } {
  const curM = materials.find((m) => m.id === current.materialId);
  const materialId = curM && familyOfMaterial(curM) === fam ? curM.id : materials.find((m) => familyOfMaterial(m) === fam)?.id ?? null;
  const curS = sections.find((s) => s.id === current.sectionId);
  if (curS && sectionFits(fam, curS)) return { materialId, sectionId: curS.id };
  const fits = sections.filter((s) => sectionFits(fam, s));
  const ratio = (s: Sec) => (s.b && s.h ? s.h / s.b : 1);
  const best = [...fits].sort((a, b) => (kind === 'column' ? Math.abs(ratio(a) - 1) - Math.abs(ratio(b) - 1) : ratio(b) - ratio(a)) || a.id - b.id)[0];
  return { materialId, sectionId: best?.id ?? null };
}
