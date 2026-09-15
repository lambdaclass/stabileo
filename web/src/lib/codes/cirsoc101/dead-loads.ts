/**
 * CIRSOC 101-2025 — permanent (dead) loads.
 *
 * Tabla 3.1   unit weights of materials and constructive elements
 * §3.1.3      fixed service equipment is part of the dead load
 * §3.1.4      the allowance for interior partitions
 *
 * ── What this replaces ─────────────────────────────────────────
 *
 * Five numbers typed into a dialog. `ProAutoLoadsDialog` opened with a screed at
 * 1,0 kN/m², a finish at 0,8, a ceiling at 0,3, services at 0,3 and partitions at 1,0 —
 * plausible values, presented inside a panel whose whole promise is that its numbers
 * come from a regulation, and coming from nowhere. A reader had no way to tell those
 * five apart from the live load beside them, which is read off Tabla 4.1 cell by cell.
 *
 * So the build-up is assembled from the table instead: a ceramic tile IS 0,28 kN/m² in
 * Tabla 3.1, and a screed is a THICKNESS of a material whose unit weight is 18 kN/m³.
 * Typing a number remains available and is recorded as what it is — an assumption —
 * rather than being indistinguishable from a transcription.
 *
 * ── Two kinds of row, because the table has two columns ────────
 *
 * Tabla 3.1 prints kN/m² for an element built up to a stated thickness ("baldosa
 * cerámica, 12 mm") and kN/m³ for a material poured or laid to whatever thickness the
 * project has ("contrapiso de cemento, arena y cascote"). A row of the second kind
 * cannot answer "how much does it weigh" without a thickness, and this module refuses
 * to guess one.
 *
 * ── The footnote that is easy to lose ──────────────────────────
 *
 * Tabla 3.1 marks several roof coverings (*) : "para cubiertas montadas sobre
 * enlistonado solamente, a los valores de esta Tabla se les debe restar 0,1 kN/m²",
 * because the printed value includes boarding that battens do not have. It is a
 * deduction of up to a third of the covering's weight, and it is carried here as a flag
 * on the entries that print it rather than as something the reader has to remember.
 *
 * Pure: no store, no runes.
 */

import { clause, type ClauseRef } from '../regulation';
import { msg, round, type EngineMessage } from '../message';

const T31 = clause('cirsoc-101', '2025', 'Tabla 3.1',
  'pesos unitarios de los materiales y elementos constructivos');

export type DeadGroup = 'ceiling' | 'roof' | 'concrete' | 'floor' | 'partition' | 'glazing';

export interface DeadEntry {
  key: string;
  /** i18n key of the Tabla 3.1 row label. The text lives in the locales; this is pure. */
  labelKey: string;
  group: DeadGroup;
  /** Weight per m² of surface, kN/m². Null for a row printed per m³. */
  areaKNm2: number | null;
  /** Unit weight, kN/m³. Null for a row printed per m². A thickness is then required. */
  volumeKNm3: number | null;
  /** Tabla 3.1 (*): subtract 0,1 kN/m² when laid on battens rather than boarding. */
  battenDeduction?: boolean;
  refs: ClauseRef[];
}

const d = (
  key: string, group: DeadGroup,
  areaKNm2: number | null, volumeKNm3: number | null,
  extra: Partial<DeadEntry> = {},
): DeadEntry => ({
  key, labelKey: `loads.dead.${key}`, group, areaKNm2, volumeKNm3, refs: [T31], ...extra,
});

/**
 * Tabla 3.1, in the order it is printed.
 *
 * The six groups the table has — ceilings, roof coverings, concretes, floors and
 * screeds, partitions, glazing. It carries no masonry wall: CIRSOC 101-2025 does not
 * print one, and a wall weight typed from memory is exactly the kind of number this
 * module exists to stop.
 */
export const DEAD_TABLE_2025: readonly DeadEntry[] = Object.freeze([

  // Cielorrasos
  d('cielo_superliviano', 'ceiling', 0.05, null),
  d('cielo_acustico', 'ceiling', 0.05, null),
  d('cielo_listones_acero', 'ceiling', 0.05, null),
  d('cielo_pvc', 'ceiling', 0.05, null),
  d('cielo_termoacustico', 'ceiling', 0.1, null),
  d('cielo_yeso_aluminio', 'ceiling', 0.2, null),
  d('cielo_mezcla_desplegado', 'ceiling', 0.5, null),
  d('cielo_yeso_desplegado', 'ceiling', 0.18, null),

  // Cubiertas
  d('cub_fibra_organica', 'roof', 0.03, null),
  d('cub_alum_06', 'roof', 0.025, null),
  d('cub_alum_08', 'roof', 0.03, null),
  d('cub_alum_10', 'roof', 0.04, null),
  d('cub_acero_04', 'roof', 0.04, null),
  d('cub_acero_07', 'roof', 0.07, null),
  d('cub_acero_10', 'roof', 0.1, null),
  d('cub_cobre', 'roof', 0.25, null),
  d('cub_zinc', 'roof', 0.25, null, { battenDeduction: true }),
  d('cub_plastico', 'roof', 0.15, null),
  d('cub_asfaltica_7', 'roof', 0.1, null),
  d('cub_panel_alum_eps', 'roof', 0.13, null),
  d('cub_teja_asfaltica', 'roof', 0.2, null),
  d('cub_teja_espanola', 'roof', 0.9, null, { battenDeduction: true }),
  d('cub_teja_francesa', 'roof', 0.65, null, { battenDeduction: true }),
  d('cub_teja_flamenca', 'roof', 0.7, null, { battenDeduction: true }),
  d('cub_teja_normanda', 'roof', 0.8, null, { battenDeduction: true }),
  d('cub_teja_romana', 'roof', 0.5, null),
  d('cub_pizarra_nat', 'roof', 0.9, null),
  d('cub_pizarra_art', 'roof', 0.45, null, { battenDeduction: true }),
  d('cub_teja_vidrio', 'roof', 0.45, null),

  // Hormigones
  d('horm_simple', 'concrete', null, 23.5),
  d('horm_armado', 'concrete', null, 25.0),
  d('horm_basaltico', 'concrete', null, 25.0),
  d('horm_cascote', 'concrete', null, 18.0),
  d('horm_hierro', 'concrete', null, 36.0),
  d('horm_cal_cascote', 'concrete', null, 16.0),

  // Pisos y contrapisos
  d('piso_baldosa_ceramica', 'floor', 0.28, null),
  d('piso_gres', 'floor', 0.38, null),
  d('piso_vinilico', 'floor', 0.07, null),
  d('piso_granitico', 'floor', 0.9, null),
  d('piso_goma', 'floor', 0.05, null),
  d('piso_mosaico_calcareo', 'floor', 0.42, null),
  d('piso_granito_recon', 'floor', 0.6, null),
  d('piso_parquet_dura', 'floor', 0.15, null),
  d('piso_parquet_semidura', 'floor', 0.12, null),
  d('piso_madera_dura', 'floor', 0.25, null),
  d('piso_madera_semidura', 'floor', 0.2, null),
  d('piso_elevado', 'floor', 0.4, null),
  d('piso_porcelanato', 'floor', 0.2, null),
  d('contrapiso_cal', 'floor', null, 16.0),
  d('contrapiso_cemento', 'floor', null, 18.0),
  d('contrapiso_piedra', 'floor', null, 17.0),
  d('piso_baldosa_mortero', 'floor', null, 22.0),

  // Tabiques
  d('tab_yeso_simple', 'partition', 0.35, null),
  d('tab_yeso_doble', 'partition', 0.55, null),
  d('tab_yeso_ceramico_70', 'partition', 0.55, null),
  d('tab_yeso_ceramico_100', 'partition', 0.65, null),

  // Vidrios
  d('vid_sencillo', 'glazing', 0.05, null),
  d('vid_doble', 'glazing', 0.068, null),
  d('vid_triple', 'glazing', 0.09, null),
  d('vid_grueso', 'glazing', 0.105, null),
  d('vid_translucido', 'glazing', 0.072, null),
  d('vid_armado', 'glazing', 0.15, null),]);

export function findDeadEntry(key: string): DeadEntry | undefined {
  return DEAD_TABLE_2025.find((e) => e.key === key);
}

/** Tabla 3.1 (*) — the deduction for a covering laid on battens, kN/m². */
export const BATTEN_DEDUCTION_KNM2 = 0.1;

export interface DeadComponentResult {
  /** Area load, kN/m². */
  qKNm2: number;
  /** What the number is: read off the table, or computed from a thickness. */
  basis: 'table' | 'thickness';
  refs: ClauseRef[];
  /** Set when the entry cannot answer without something it was not given. */
  error?: EngineMessage;
  /** Facts the reader has to see with the number — the batten deduction, above all. */
  notes: EngineMessage[];
}

/**
 * The area load one catalogue entry contributes.
 *
 * `thicknessM` is REQUIRED for a row printed per m³ and ignored for one printed per m².
 * A missing thickness is an error rather than a default, because every default here is
 * a guess about someone else's building.
 */
export function deadComponentLoad(
  entry: DeadEntry,
  opts: { thicknessM?: number; onBattens?: boolean } = {},
): DeadComponentResult {
  const notes: EngineMessage[] = [];

  if (entry.areaKNm2 !== null) {
    let q = entry.areaKNm2;
    if (entry.battenDeduction && opts.onBattens) {
      q = Math.max(0, q - BATTEN_DEDUCTION_KNM2);
      notes.push(msg('loads.cirsoc101.dead.battenDeductionApplied', {
        printed: entry.areaKNm2, deduction: BATTEN_DEDUCTION_KNM2, result: round(q, 3),
      }));
    } else if (entry.battenDeduction) {
      notes.push(msg('loads.cirsoc101.dead.battenDeductionAvailable', {
        deduction: BATTEN_DEDUCTION_KNM2,
      }));
    }
    return { qKNm2: q, basis: 'table', refs: entry.refs, notes };
  }

  const t = opts.thicknessM;
  if (t === undefined || !(t > 0)) {
    return {
      qKNm2: 0, basis: 'thickness', refs: entry.refs, notes,
      error: msg('loads.cirsoc101.dead.thicknessRequired'),
    };
  }
  return { qKNm2: entry.volumeKNm3! * t, basis: 'thickness', refs: entry.refs, notes };
}

// ─── §3.1.4 partitions ───────────────────────────────────────────

/**
 * §3.1.4 — the live load above which no partition allowance is owed, kN/m².
 *
 * The article requires the weight of interior partitions to be provided for "ya sea que
 * éstos se muestren o no en los planos", and releases the designer from it only when the
 * specified live load exceeds 4 kN/m². It gives no NUMBER for the allowance, which is
 * why this module states the rule and refuses to invent the value.
 */
export const PARTITION_EXEMPTION_LKNM2 = 4;

export const PARTITION_REF = clause('cirsoc-101', '2025', '3.1.4',
  'carga debida a elementos divisorios');

export interface PartitionCheck {
  /** True when §3.1.4 requires an allowance and the build-up carries none. */
  missing: boolean;
  /** True when the live load releases the designer from the article. */
  exempt: boolean;
  message: EngineMessage;
  refs: ClauseRef[];
}

/**
 * Does this build-up satisfy §3.1.4?
 *
 * A dead load with no partition line, on a floor whose live load is 2 kN/m², is a floor
 * missing a load the regulation requires — and it is invisible, because what is missing
 * shows up as nothing at all. Answering is arithmetic; it costs one comparison.
 */
export function checkPartitionAllowance(
  liveLoKNm2: number, partitionAllowanceKNm2: number,
): PartitionCheck {
  const exempt = liveLoKNm2 > PARTITION_EXEMPTION_LKNM2;
  if (exempt) {
    return {
      missing: false, exempt: true,
      message: msg('loads.cirsoc101.dead.partitionExempt', {
        lo: round(liveLoKNm2, 2), limit: PARTITION_EXEMPTION_LKNM2,
      }),
      refs: [PARTITION_REF],
    };
  }
  if (partitionAllowanceKNm2 > 0) {
    return {
      missing: false, exempt: false,
      message: msg('loads.cirsoc101.dead.partitionIncluded', {
        q: round(partitionAllowanceKNm2, 2),
      }),
      refs: [PARTITION_REF],
    };
  }
  return {
    missing: true, exempt: false,
    message: msg('loads.cirsoc101.dead.partitionMissing', {
      lo: round(liveLoKNm2, 2), limit: PARTITION_EXEMPTION_LKNM2,
    }),
    refs: [PARTITION_REF],
  };
}
