// Preset materials for quick selection
// Properties in SI units: E (MPa), ν, ρ (kN/m³), fy (MPa)

import { t } from '../i18n';
import {
  HOT_ROLLED, COLD_FORMED, ALUMINIUM, STAINLESS,
  BASIC_REGIONS, MATERIAL_DESIGN_CODES, gradesForCode,
  type StructuralGrade, type GradeFamily, type GradeRegion, type ThicknessBand,
} from './structural-grades';
import { CONCRETE, TIMBER } from './non-metal-grades';

export interface MaterialPreset {
  name: string;
  category: 'acero' | 'conformado' | 'inox' | 'hormigon' | 'madera' | 'aluminio';
  e: number;    // MPa
  nu: number;
  rho: number;  // kN/m³
  fy?: number;  // MPa
  /** A concrete's f'c, MPa: the same value as `fy`, stated as what it is. */
  fc?: number;
  /**
   * The product standard the values come from, for the metal grades.
   *
   * Shown next to the name because "A572 Gr.50" and "S355" are only meaningful
   * alongside the standard that defines them, and because two standards can
   * use the same designation for different steels.
   */
  standard?: string;
  /** Ultimate tensile strength, MPa — present for the graded metals. */
  fu?: number;
  /** Link back to the grade database, so a selection can be traced. */
  gradeId?: string;
  /** Origin of the product standard — absent for concrete, timber and rebar. */
  region?: GradeRegion;
  /**
   * Whether the values were read from the governing standard or carried from
   * general knowledge of the material. Surfaced in the picker, because a user
   * choosing a grade for a calculation deserves to know which they are getting.
   */
  verification?: 'standard' | 'typical';
  /**
   * The grade's thickness bands, where they are tabulated.
   *
   * `fy` above is the value for the FIRST band, which is what
   * `structural-grades.ts` warns about in its own header: hot-rolled yield
   * falls with thickness, and a caller that quotes the headline number for a
   * 60 mm plate is unconservative by about 6 %. Carrying the bands lets the
   * picker say so instead of presenting one number as if only one existed.
   *
   * This is disclosure, not selection: nothing here picks a band, because the
   * member's governing thickness is not known at this point. Choosing by
   * thickness is a larger change with its own decisions.
   */
  thicknessBands?: ThicknessBand[];
  /**
   * Which standard tabulates those bands — never the one in `standard`.
   *
   * Carried alongside them because the picker shows `standard` beside the
   * grade name, so a band shown without its own source reads as coming from
   * the product standard. It does not: see `bandStandard` in
   * `structural-grades.ts`.
   */
  bandStandard?: string;
}

/**
 * The thickness caveat as one short line, for a picker with no member in hand.
 *
 * Returns the headline value's upper bound and where the strength ends up
 * beyond it — "(>40mm: 335)" — rather than only the bound. Naming just the
 * bound would put the number that matters behind a hover, and `title` is
 * mouse-only: absent on touch, and a child span's title never reaches the
 * button's accessible name. The safety-relevant fact belongs on screen; the
 * full table and its source can stay in the tooltip.
 *
 * Quoting the LAST band's value states the far end without asserting a
 * direction, which matters because one grade here runs the other way: 6082-T6
 * gets stronger with thickness, so it renders "(>5mm: 260)" and reads as the
 * rise it is. A wording like "falls to" would have been wrong for it.
 *
 * Exact for two bands, which every banded grade currently has — a test pins
 * that, so a three-band grade fails loudly here instead of silently skipping
 * an intermediate step.
 */
export function bandSummary(
  p: Pick<MaterialPreset, 'thicknessBands' | 'bandStandard'>,
): { tail: string; full: string } | null {
  const bands = p.thicknessBands;
  if (!bands || bands.length === 0) return null;
  const first = bands[0];
  const last = bands[bands.length - 1];
  const table = bands.map((b) => `${b.overMm}–${b.upToMm} mm: fy ${b.fy} MPa`).join(' · ');
  return {
    tail: `(>${first.upToMm}mm: ${last.fy})`,
    full: p.bandStandard ? `${p.bandStandard} · ${table}` : table,
  };
}

/**
 * Adapt a catalogued grade to the preset shape the pickers already consume.
 *
 * The grade database is the source of truth; this is a projection of it, so
 * adding a grade there makes it appear in every picker without touching them.
 */
function fromGrade(g: StructuralGrade, category: MaterialPreset['category']): MaterialPreset {
  return {
    name: g.designation,
    category,
    e: g.e,
    nu: g.nu,
    rho: g.rho,
    fy: g.fy,
    fu: g.fu,
    standard: g.productStandard,
    gradeId: g.id,
    region: g.region,
    verification: g.verification,
    thicknessBands: g.byThickness,
    bandStandard: g.bandStandard,
  };
}

/** Returns material presets with translated names (call inside reactive context) */
export function getMaterialPresets(): MaterialPreset[] {
  return [
    // ─── Aceros estructurales, de la base multinorma ───
    //
    // Listed from the grade database rather than repeated here, so IRAM, ASTM,
    // EN and NBR grades all reach the picker and none of them can drift out of
    // step with the values the checks use.
    ...HOT_ROLLED.map((g) => fromGrade(g, 'acero')),
    ...COLD_FORMED.map((g) => fromGrade(g, 'conformado')),
    ...STAINLESS.map((g) => fromGrade(g, 'inox')),

    // Reinforcing steel: a bar grade, not a section grade, so it has no place
    // in the rolled-profile database but is still needed to model concrete.
    { name: t('material.steelADN420'),    category: 'acero', e: 200000, nu: 0.3, rho: 78.5, fy: 420 },

    // ─── Hormigones, multinorma ───
    //
    // Projected from the grade database like the metals. The design code is
    // part of each entry's identity rather than a filter over it, because for
    // concrete the MODULUS depends on the code: the same 25 MPa concrete is
    // 23 500 MPa under CIRSOC/ACI and 31 500 under Eurocode.
    ...CONCRETE.map((c): MaterialPreset => ({
      name: c.designation,
      category: 'hormigon',
      e: c.e, nu: c.nu, rho: c.rho,
      // `fy` is the generic strength field the panels read; for concrete the
      // meaningful strength is fck, so that is what goes in it.
      fy: c.fck,
      fc: c.fck,
      standard: c.code,
      gradeId: c.id,
      region: c.region as GradeRegion,
      verification: 'standard',
    })),

    // ─── Maderas, clases EN 338 ───
    ...TIMBER.map((w): MaterialPreset => ({
      name: w.designation,
      category: 'madera',
      e: w.e, nu: w.nu, rho: w.rho,
      fy: w.fmk,
      standard: w.code,
      gradeId: w.id,
      region: w.region as GradeRegion,
      verification: 'standard',
    })),

    // ─── Aluminio ───
    ...ALUMINIUM.map((g) => fromGrade(g, 'aluminio')),
  ];
}

export const MATERIAL_CATEGORIES = [
  { id: 'acero', label: 'matCat.steel' },
  { id: 'conformado', label: 'matCat.coldFormed' },
  { id: 'inox', label: 'matCat.stainless' },
  { id: 'aluminio', label: 'matCat.aluminum' },
  { id: 'hormigon', label: 'matCat.concrete' },
  { id: 'madera', label: 'matCat.wood' },
] as const;

/**
 * The grade family behind a picker category, or null for the non-metals.
 *
 * Concrete and timber have no entry in the grade database and no design code
 * attached here, so they return null and the code filter simply does not apply
 * to them.
 */
export function categoryFamily(category: string): GradeFamily | null {
  switch (category) {
    case 'acero': return 'hot-rolled';
    case 'conformado': return 'cold-formed';
    case 'inox': return 'stainless';
    case 'aluminio': return 'aluminium';
    default: return null;
  }
}

export interface PresetFilter {
  /** Design code to narrow the grades to. Omitted means no code filter. */
  codeId?: string;
  /** PRO shows every region; Basic shows European, American, Brazilian and Argentine. */
  pro?: boolean;
}

export function searchPresets(
  query: string,
  category?: string,
  filter: PresetFilter = {},
): MaterialPreset[] {
  let source = getMaterialPresets();
  if (category) source = source.filter(p => p.category === category);

  // Region gating, then the code association. A preset with no region — the
  // reinforcing bar; concrete and timber carry their code's region — is never
  // filtered out by a control that has no opinion about it.
  if (!filter.pro) {
    source = source.filter(p => !p.region || BASIC_REGIONS.includes(p.region));
  }
  const family = category ? categoryFamily(category) : null;
  // Concrete and timber filter by the code NAME carried on the preset: they
  // have no grade family in the metal sense, but the control means the same
  // thing to a user, so it behaves the same way.
  if (filter.codeId && !family) {
    source = source.filter(p => !p.standard || p.standard === filter.codeId);
  }
  if (filter.codeId && family) {
    const code = MATERIAL_DESIGN_CODES.find(c => c.id === filter.codeId);
    if (code) {
      const allowed = new Set(gradesForCode(code, family).map(g => g.id));
      source = source.filter(p => !p.gradeId || allowed.has(p.gradeId));
    }
  }

  if (!query.trim()) return source;
  const q = query.trim().toLowerCase();
  // Searching the standard as well as the name is what makes "EN 10025" or
  // "NBR" a usable query — which is how someone working to one code finds the
  // grades that code is written around.
  return source.filter(p =>
    p.name.toLowerCase().includes(q) || (p.standard?.toLowerCase().includes(q) ?? false),
  );
}
