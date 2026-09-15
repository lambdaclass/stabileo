/**
 * INPRES-CIRSOC 103 Parte I (2018) Tabla 5.1 — behaviour factors R, Cd and Ωo.
 *
 * R divides the whole design spectrum (§6.2.2), so it is the single number that most
 * changes the answer: a reinforced-concrete frame with full ductility at R = 7 and a
 * cantilever-column structure at R = 2,5 differ by a factor of nearly three in base
 * shear for the same building. Which is exactly why it must be read off a table with the
 * structural system named, rather than typed into a box.
 *
 * ── The row that is not a number ───────────────────────────────
 *
 * Row 1, isolated and coupled walls, prints `R = (3 + A/5)·z` bounded by `5z ≤ R ≤ 7`,
 * where A is a degree of coupling from Eq. [5.2] and z comes from [5.3]. That is a
 * calculation on the wall layout, not a lookup, so the entry carries no R and says so.
 * Substituting 5 or 7 for it would be inventing the reader's coupling ratio.
 *
 * ── §5.1.1 and §5.1.2 ──────────────────────────────────────────
 *
 * Where a direction mixes systems, §5.1.1 allows the minimum R of the systems present or
 * a shear-weighted average; `combineR` implements the minimum, which is the option that
 * needs nothing the model cannot supply. §5.1.2 lets an owner elect elastic behaviour,
 * which is R = 1,5 whatever the system.
 *
 * Pure: no store, no runes.
 */

import { clause, type ClauseRef } from '../regulation';

const REF_T51 = clause('inpres-cirsoc-103-i', '2018', 'Tabla 5.1', 'factores de comportamiento');

export const REF_ELASTIC = clause('inpres-cirsoc-103-i', '2018', '5.1.2',
  'construcciones cuyo destino requiere comportamiento elástico');

export const REF_MIXED = clause('inpres-cirsoc-103-i', '2018', '5.1.1',
  'factor de reducción para estructuras compuestas por elementos distintos');

/** §5.1.2 — the reduction factor for a structure designed to stay elastic. */
export const R_ELASTIC = 1.5;

export type BehaviourMaterial = 'concrete' | 'masonry' | 'steel' | 'timber' | 'other';

export interface BehaviourEntry {
  /** Tabla 5.1's own row number, so a reader can find it on the page. */
  row: number;
  key: string;
  labelKey: string;
  material: BehaviourMaterial;
  /** Global reduction factor. Null for row 1, which prints a formula. */
  r: number | null;
  /** Deformation amplification factor. */
  cd: number | null;
  /** Overstrength factor Ωo. */
  omega0: number | null;
  /** True when the row gives an expression rather than a value. */
  formula?: boolean;
  refs: ClauseRef[];
}

const b = (
  row: number, key: string, material: BehaviourMaterial,
  r: number | null, cd: number | null, omega0: number | null,
  extra: Partial<BehaviourEntry> = {},
): BehaviourEntry => ({
  row, key, labelKey: `seismic.system.${key}`, material, r, cd, omega0,
  refs: [REF_T51], ...extra,
});

/** Tabla 5.1, complete, in the order it is printed. */
export const BEHAVIOUR_TABLE_2018: readonly BehaviourEntry[] = Object.freeze([
  // Estructuras de hormigón armado
  b(1, 'rc_walls', 'concrete', null, null, 2.5, { formula: true }),
  b(2, 'rc_frame_full_ductility', 'concrete', 7, 5.5, 3),
  b(3, 'rc_dual_frame_wall', 'concrete', 6, 5, 2.5),
  b(4, 'rc_concentric_braces', 'concrete', 4, 4, 2.5),
  b(5, 'rc_eccentric_braces', 'concrete', 6, 4, 2.5),
  b(6, 'rc_cantilever_columns', 'concrete', 2.5, 2.5, 1.5),
  b(7, 'rc_limited_ductility', 'concrete', 3.5, 3.5, 2.5),

  // Mampostería — ladrillos cerámicos macizos
  b(8, 'mas_solid_confined_plain', 'masonry', 3, 2.3, 2.5),
  b(9, 'mas_solid_confined_reinforced', 'masonry', 3.5, 2.5, 2.5),
  b(10, 'mas_solid_distributed_reinforcement', 'masonry', 4, 3, 2.5),
  b(11, 'mas_solid_unconfined', 'masonry', 1.5, 2, 2),

  // Mampostería — bloques huecos portantes cerámicos
  b(12, 'mas_clayblock_confined_plain', 'masonry', 2, 2.3, 2.5),
  b(13, 'mas_clayblock_confined_reinforced', 'masonry', 2.5, 2.5, 2.5),
  b(14, 'mas_clayblock_distributed_reinforcement', 'masonry', 3, 3, 2.5),

  // Mampostería — bloques huecos portantes de hormigón
  b(15, 'mas_concreteblock_confined_plain', 'masonry', 2.5, 2.3, 2.5),
  b(16, 'mas_concreteblock_confined_reinforced', 'masonry', 3, 2.5, 2.5),
  b(17, 'mas_concreteblock_distributed_reinforcement', 'masonry', 3.5, 3, 2.5),

  // Acero — pórticos no arriostrados
  b(18, 'steel_moment_special', 'steel', 7, 5.5, 3),
  b(19, 'steel_moment_intermediate', 'steel', 4.5, 4, 3),
  b(20, 'steel_moment_ordinary', 'steel', 3, 3, 3),
  b(21, 'steel_truss_girder_frame', 'steel', 6, 5.5, 3),

  // Acero — pórticos arriostrados
  b(22, 'steel_braced_concentric_special', 'steel', 5, 5.5, 2),
  b(23, 'steel_braced_concentric_ordinary', 'steel', 3, 3, 2),
  b(24, 'steel_braced_eccentric', 'steel', 7, 4, 2),

  // Acero — sistemas duales sobre pórticos especiales (≥ 25 % del corte basal)
  b(25, 'steel_dual_special_concentric', 'steel', 6, 5.5, 2.5),
  b(26, 'steel_dual_special_ordinary_concentric', 'steel', 4, 4, 2.5),
  b(27, 'steel_dual_special_eccentric', 'steel', 7, 4, 2.5),

  // Acero — sistemas duales sobre pórticos intermedios (≥ 25 % del corte basal)
  b(28, 'steel_dual_intermediate_concentric', 'steel', 5, 5, 2.5),
  b(29, 'steel_dual_intermediate_ordinary_concentric', 'steel', 3.5, 3, 2.5),
  b(30, 'steel_cantilever_columns', 'steel', 2.5, 2.5, 1.5),

  // Madera
  b(31, 'timber_panels', 'timber', 4, 3, 3),
  b(32, 'timber_frames', 'timber', 3, 3, 2.5),
  b(33, 'timber_struts', 'timber', 3, 3, 2.5),
  b(34, 'timber_cantilever_columns', 'timber', 2.5, 2.5, 2.5),

  // Uniones viga-columna no resistentes a momento
  b(35, 'pinned_eccentric_braces', 'other', 5, 4, 2.5),
  b(36, 'pinned_concentric_braces', 'other', 4, 5, 2.5),
]);

export function findBehaviour(key: string): BehaviourEntry | undefined {
  return BEHAVIOUR_TABLE_2018.find((e) => e.key === key);
}

/**
 * §5.1.1 a) — the minimum R of the systems acting in the direction analysed.
 *
 * The option the regulation lists first, and the only one of the three that needs
 * nothing beyond which systems are present: b) weights by each element's direct shear,
 * which the model can only supply after a solve, and c) sends frame-and-wall structures
 * to Parte II.
 */
export function combineR(values: readonly number[]): number | null {
  const finite = values.filter((v) => Number.isFinite(v) && v > 0);
  return finite.length === 0 ? null : Math.min(...finite);
}
