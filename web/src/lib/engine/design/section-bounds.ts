/**
 * Bounds of CIRSOC 201-2025 that no reinforcement can lift: the evidence SECTION_INADEQUATE
 * needs (`InsufficiencyProof`).
 *
 * A search that comes back empty shows that none of the arrangements it ENUMERATES passes: a
 * finite list of diameters, rows, layouts and seats. That is not a proof that the section cannot
 * be reinforced, and it is reported as SEARCH_EXHAUSTED. A proof compares the demand with an
 * UPPER bound of what any admissible reinforcement gives, every assumption taken in the
 * section's favour, so that demand > bound holds for every arrangement, enumerated or not:
 *
 *   - shear, §22.5.1.2: «Vu ≤ φ (Vc + 0,66 √f´c bw d)», with Vc at its ceiling of §22.5.5.1.1
 *     («Vc no debe tomarse mayor que 0,42 √f´c bw d»), √f'c as is (the §22.5.3.1 limit only
 *     lowers it), and d the deepest one the smallest admissible bar inside the smallest stirrup
 *     gives;
 *   - axial compression, Tabla 22.4.2.1 with Po of (22.4.2.2) at the most steel §10.6.1.1 admits
 *     («no debe ser … mayor que 0,08 Ag»), and the spiral's φ = 0,75 and 0,85·Po whatever the
 *     member's transverse steel;
 *   - fit, §25.2.1 (§25.2.3 in a column): two of the smallest admissible bars (a stirrup holds a
 *     bar in each corner) with their minimum clear spacing do not fit inside the smallest
 *     admissible stirrup.
 *
 * Flexure has no bound here: compression steel and more rows raise φMn past any simple ceiling,
 * so an empty search on bending is an exhausted search, not a proof. The same holds for
 * anchorage and for threading the column's bars (headed bars, bundles, another column cage).
 *
 * Pure.
 */
import { minClearSpacingColumn, minClearSpacingInLayer } from '../../codes/cirsoc201/spacing';
import { squashLoadFy } from '../codes/argentina/cirsoc201-basis';
import { STANDARD_LONG_DIAS, STANDARD_STIRRUP_DIAS } from './objective';
import type { MemberContext } from './member-context';
import type { InsufficiencyProof } from './outcome';

const PHI_SHEAR = 0.75;
const PHI_SPIRAL = 0.75;
const RHO_MAX = 0.08;

const r3 = (v: number) => Math.round(v * 1000) / 1000;

/** The largest demand of a category, with the combination it comes from. */
function peak(ctx: MemberContext, ...categories: string[]): { value: number; combo?: string } {
  let best: { value: number; combo?: string } = { value: 0 };
  for (const d of ctx.demands?.demands ?? []) {
    if (!categories.includes(d.category)) continue;
    if (d.absValue > best.value) best = { value: d.absValue, ...(d.comboName ? { combo: d.comboName } : {}) };
  }
  return best;
}

/**
 * The first bound of the code the section exceeds for every admissible reinforcement, or null
 * when none of the bounds implemented here is exceeded (the section may still not be
 * reinforceable, but that has not been shown).
 */
export function demonstratedInsufficiency(ctx: MemberContext): InsufficiencyProof | null {
  if (ctx.elementType === 'wall' || ctx.shape) return null;
  const { fc, fy, cover } = ctx.material;
  if (!(fc > 0) || !(fy > 0)) return null;
  const longs = ctx.material.longDiametersMm?.length ? ctx.material.longDiametersMm : STANDARD_LONG_DIAS;
  const stirrups = ctx.material.stirrupDiametersMm?.length ? ctx.material.stirrupDiametersMm : STANDARD_STIRRUP_DIAS;
  const dbMin = Math.min(...longs);
  const dstMin = Math.min(...stirrups);
  const sq = Math.sqrt(fc);

  // ── §25.2.1: the minimum row does not fit ──
  const narrow = ctx.elementType === 'column' ? Math.min(ctx.axes.bFlex, ctx.axes.hFlex) : ctx.axes.bFlex;
  const inside = narrow - 2 * cover - 2 * dstMin / 1000;
  // An aggregate size not stated drops the 4/3·dagg term: a smaller requirement, still a proof.
  const spacing = { barDiameterMm: dbMin, maxAggregateSizeMm: ctx.material.maxAggregateSize?.value ?? 0 };
  const clear = (ctx.elementType === 'column' ? minClearSpacingColumn : minClearSpacingInLayer)(ctx.codeEdition, spacing).minClear;
  const rowNeed = 2 * dbMin / 1000 + clear;
  if (rowNeed > inside + 1e-9) {
    const fitClause = ctx.codeEdition === '2005' ? '7.6.1' : ctx.elementType === 'column' ? '25.2.3' : '25.2.1';
    return {
      bound: 'minimumBarRowDoesNotFit', clause: fitClause, demand: r3(rowNeed * 100), capacity: r3(inside * 100), unit: 'cm',
      basis: { barDiameterMm: dbMin, stirrupDiameterMm: dstMin, minClearM: r3(clear), widthM: r3(narrow) },
    };
  }

  // ── §22.5.1.2: the section's shear limit, on each axis ──
  for (const [axis, bw, depth] of [
    [ctx.axes.shear, ctx.axes.bFlex, ctx.axes.hFlex],
    [ctx.axes.secondaryShear, ctx.axes.hFlex, ctx.axes.bFlex],
  ] as const) {
    const vu = peak(ctx, axis);
    const d = depth - cover - dstMin / 1000 - dbMin / 2000;
    if (!(vu.value > 0) || !(d > 0)) continue;
    const cap = PHI_SHEAR * (0.42 + 0.66) * sq * 1000 * bw * d; // kN
    if (vu.value > cap * (1 + 1e-9)) {
      return {
        bound: 'shearSectionLimit', clause: '22.5.1.2', demand: r3(vu.value), capacity: r3(cap), unit: 'kN', axis,
        ...(vu.combo ? { combination: vu.combo } : {}),
        basis: { bw: r3(bw), dMax: r3(d), vcCeiling: '0,42·√f′c·bw·d (22.5.5.1.1)', phi: PHI_SHEAR },
      };
    }
  }

  // ── Tabla 22.4.2.1: the most axial load the section takes, with the most steel ──
  if (ctx.elementType === 'column') {
    const pu = peak(ctx, 'N_compression');
    const ag = ctx.axes.bFlex * ctx.axes.hFlex;
    const ast = RHO_MAX * ag;
    const po = (0.85 * fc * (ag - ast) + squashLoadFy(fy, ctx.codeEdition === '2005' ? '2005' : '2025') * ast) * 1000; // kN
    const cap = PHI_SPIRAL * 0.85 * po;
    if (pu.value > cap * (1 + 1e-9)) {
      return {
        bound: 'axialCapacityAtMaxSteel', clause: '22.4.2.1', demand: r3(pu.value), capacity: r3(cap), unit: 'kN',
        ...(pu.combo ? { combination: pu.combo } : {}),
        basis: { rho: RHO_MAX, phi: PHI_SPIRAL, poFactor: 0.85, ag: r3(ag) },
      };
    }
  }
  return null;
}
