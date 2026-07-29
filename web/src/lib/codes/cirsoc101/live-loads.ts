/**
 * CIRSOC 101-2025 — imposed (live) loads.
 *
 * Table 4.1  minimum uniform and concentrated imposed loads by occupancy
 * §4.7.2      live-load reduction, Eq. (4.1), with K_LL from Table 4.2
 * §4.7.3–4.7.6 the limits on that reduction
 * §4.8        minimum roof imposed loads
 *
 * Every entry below is transcribed cell by cell from the normative column of the
 * official text (Edición Julio 2025, pp. 78–95) and carries the table it came from.
 * Where Table 4.1 refers the reader to an article instead of giving a number, the entry
 * records that rather than inventing a value.
 *
 * This replaces the single free-typed `occupancyQ` the app used to accept. Manual loads
 * remain fully supported — this is an additional, code-grounded path, not a replacement
 * for engineering judgement.
 *
 * Pure: no store, no runes.
 */

import { clause, type ClauseRef } from '../regulation';
import { msg, round, type EngineMessage } from '../message';

const T41 = clause('cirsoc-101', '2025', 'Tabla 4.1',
  'sobrecargas mínimas uniformemente distribuidas y concentradas');

export type OccupancyCategory =
  | 'residential' | 'office' | 'commercial' | 'education' | 'health' | 'assembly'
  | 'industrial' | 'storage' | 'parking' | 'roof' | 'circulation' | 'other';

/**
 * What kind of occupancy this is, where the distinction changes a factor.
 *
 * This replaces a regex over the Spanish label. `/garaje/i` matched both `garaje_autos`
 * and `garaje_camiones`, so a truck garage was being handed the §4.7.5 twenty-percent
 * reduction that the clause grants only to *passenger vehicle* garages — and it stopped
 * working entirely the moment the label was translated.
 */
export type AssemblyKind =
  /** §4.7.5: passenger vehicle garages, the only garages the 20 % reduction covers. */
  | 'passengerGarage'
  /** Trucks and buses. Excluded from the reduction; Table 4.1 cross-references §4.10. */
  | 'truckGarage'
  /** Places of public assembly. Blocks both the reduction and Exception 1. */
  | 'publicAssembly';

export interface OccupancyEntry {
  key: string;
  /**
   * i18n key of the Table 4.1 row label.
   *
   * The table's text lives in the locale files, not here: this module is pure and must not
   * reach the i18n store, and the label appears in the UI, the report and the XLSX sheet
   * with three different width budgets.
   */
  labelKey: string;
  category: OccupancyCategory;
  /** Uniform imposed load Lo, kN/m². Null when Table 4.1 refers to an article instead. */
  uniformKNm2: number | null;
  /** Concentrated imposed load, kN. Null when the table gives none. */
  concentratedKN: number | null;
  /**
   * True for garages and places of public assembly. Blocks the §2.3.2 Exception 1
   * reduced L factor and, separately, blocks the §4.7.5 live-load reduction.
   */
  garageOrPublicAssembly?: boolean;
  /** Which kind, where the clause treats them differently. Set iff the flag above is. */
  assemblyKind?: AssemblyKind;
  /** Table 4.1 sends the reader elsewhere; recorded verbatim so the UI can say so. */
  seeArticle?: string;
  refs: ClauseRef[];
}

const e = (
  key: string, category: OccupancyCategory,
  uniformKNm2: number | null, concentratedKN: number | null = null,
  extra: Partial<OccupancyEntry> = {},
): OccupancyEntry => ({
  key, labelKey: `loads.occupancy.${key}`, category, uniformKNm2, concentratedKN,
  refs: [T41], ...extra,
});

/**
 * Table 4.1, in the order it is printed.
 *
 * This is a faithful subset, not the complete table: entries whose value exists only as
 * a cross-reference to another article, and highly specialised occupancies (hangars,
 * morgues, bowling alleys, crane runways), are either recorded with `seeArticle` or
 * omitted. Omission means the user types the value manually — it never means the app
 * substituted a number of its own.
 */
export const OCCUPANCY_TABLE_2025: readonly OccupancyEntry[] = Object.freeze([
  // Archivos
  e('archivos', 'office', 7.0),

  // Áreas de reunión — every one is a place of public assembly
  e('reunion_asientos_fijos', 'assembly', 3.0, null, { garageOrPublicAssembly: true, assemblyKind: 'publicAssembly' }),
  e('reunion_vestibulos', 'assembly', 5.0, null, { garageOrPublicAssembly: true, assemblyKind: 'publicAssembly' }),
  e('reunion_asientos_moviles', 'assembly', 5.0, null, { garageOrPublicAssembly: true, assemblyKind: 'publicAssembly' }),
  e('reunion_plataformas', 'assembly', 5.0, null, { garageOrPublicAssembly: true, assemblyKind: 'publicAssembly' }),
  e('reunion_escenarios', 'assembly', 7.0, null, { garageOrPublicAssembly: true, assemblyKind: 'publicAssembly' }),
  e('reunion_proyeccion', 'assembly', 5.0, null, { garageOrPublicAssembly: true, assemblyKind: 'publicAssembly' }),
  e('reunion_otras', 'assembly', 5.0, null, { garageOrPublicAssembly: true, assemblyKind: 'publicAssembly' }),

  // Azoteas y terrazas
  e('azotea_publica', 'roof', 5.0, null, { garageOrPublicAssembly: true, assemblyKind: 'publicAssembly' }),
  e('azotea_privada', 'roof', 3.0),
  e('azotea_inaccesible', 'roof', 1.0),

  // Balcones
  e('balcon_vivienda', 'residential', 5.0),
  e('balcon_casa_pequena', 'residential', 3.0),
  e('balcon_otros', 'residential', null, null,
    { seeArticle: '4.11' }),

  // Baños
  e('bano_vivienda', 'residential', 2.0),
  e('bano_otros', 'other', 3.0),

  // Bibliotecas
  e('biblioteca_lectura', 'education', 3.0, 4.5),
  e('biblioteca_deposito', 'education', 7.0, 4.5),
  e('biblioteca_pasillos_sup', 'circulation', 4.0, 4.5),
  e('biblioteca_pasillos_pb', 'circulation', 5.0, 4.5),

  // Cielorrasos con posibilidad de almacenamiento
  e('cielorraso_liviano', 'storage', 1.0),
  e('cielorraso_ocasional', 'storage', 0.5),
  e('cielorraso_mantenimiento', 'other', null, 1.0),

  // Cocinas
  e('cocina_vivienda', 'residential', 2.0),
  e('cocina_otros', 'other', 4.0),

  // Comercios
  e('comercio_minorista_pb', 'commercial', 5.0, 4.5),
  e('comercio_minorista_sup', 'commercial', 4.0, 4.5),
  e('comercio_mayorista', 'commercial', 6.0, 4.5),

  // Cuartos de máquinas
  e('cuarto_maquinas', 'industrial', 7.5),

  // Cubiertas de techo
  e('cubierta_usual', 'roof', 1.0),
  e('cubierta_jardin', 'roof', 5.0),
  e('cubierta_toldos', 'roof', 0.25, null,
    { seeArticle: 'no reducible' }),
  e('cubierta_cerramiento', 'roof', 0.25, 1.0,
    { seeArticle: 'no reducible' }),
  e('cubierta_otras', 'roof', 1.0),

  // Depósitos
  e('deposito_liviano', 'storage', 6.0),
  e('deposito_pesado', 'storage', 12.0, null,
    { seeArticle: '4.13' }),

  // Escaleras
  e('escalera_privada', 'circulation', 2.0),
  e('escalera_otros', 'circulation', 5.0),

  e('escotillas', 'other', null, 1.0),

  // Escuelas
  e('escuela_aulas', 'education', 3.0, 4.5),
  e('escuela_pasillos_sup', 'circulation', 4.0, 4.5),
  e('escuela_pasillos_pb', 'circulation', 5.0, 4.5),

  // Entrepiso liviano
  e('entrepiso_liviano', 'other', null, 1.0),

  // Garajes
  e('garaje_autos', 'parking', 2.5, null, { garageOrPublicAssembly: true, assemblyKind: 'passengerGarage' }),
  e('garaje_camiones', 'parking', null, null,
    { garageOrPublicAssembly: true, assemblyKind: 'truckGarage', seeArticle: '4.10.3' }),

  // Hospitales
  e('hospital_habitaciones', 'health', 2.0, 4.5),
  e('hospital_quirofanos', 'health', 3.0, 4.5),
  e('hospital_corredores', 'circulation', 4.0, 4.5),

  // Oficinas
  e('oficina', 'office', 2.5, 9.0),
  e('oficina_corredores_sup', 'circulation', 4.0, 9.0),
  e('oficina_corredores_pb', 'circulation', 5.0, 9.0),

  // Viviendas
  e('vivienda', 'residential', 2.0),
  e('vivienda_dormitorio', 'residential', 2.0),

  // Fábricas y talleres
  e('fabrica_liviana', 'industrial', 6.0, null, { seeArticle: '4.12.1' }),
  e('fabrica_pesada', 'industrial', 12.0, null, { seeArticle: '4.12.1' }),
]);

export function findOccupancy(key: string): OccupancyEntry | undefined {
  return OCCUPANCY_TABLE_2025.find((o) => o.key === key);
}

// ─── §4.7 live-load reduction ────────────────────────────────────

/** Table 4.2 — live-load element factor K_LL. */
export type ElementKind =
  | 'interiorColumn' | 'exteriorColumnNoCantilever' | 'edgeColumnWithCantilever'
  | 'cornerColumnWithCantilever' | 'edgeBeamNoCantilever' | 'interiorBeam' | 'other';

const T42 = clause('cirsoc-101', '2025', 'Tabla 4.2', 'factor de sobrecarga K_LL');

export const K_LL: Readonly<Record<ElementKind, number>> = Object.freeze({
  interiorColumn: 4,
  exteriorColumnNoCantilever: 4,
  edgeColumnWithCantilever: 3,
  cornerColumnWithCantilever: 2,
  edgeBeamNoCantilever: 2,
  interiorBeam: 2,
  // "Todos los demás elementos": edge beams with cantilever slabs, cantilever beams,
  // one-way slabs, two-way slabs, and members without continuous shear transfer.
  other: 1,
});

/** §4.7.2 — the reduction does not apply below this threshold. */
export const REDUCTION_THRESHOLD_M2 = 37;

export interface ReductionInputs {
  /** Unreduced Lo from Table 4.1, kN/m². */
  loKNm2: number;
  /** Tributary area A_t, m². */
  tributaryAreaM2: number;
  elementKind: ElementKind;
  /** How many floors the member supports. Drives the 0,5 Lo / 0,4 Lo floor. */
  floorsSupported: number;
  /** True for garages holding passenger vehicles (§4.7.4). */
  passengerGarage?: boolean;
  /** True for places of public assembly (§4.7.5). */
  publicAssembly?: boolean;
  /**
   * One-way slab: the tributary width used for A_t is capped at 1.5 × span (§4.7.6).
   * Supply the span so the cap can be enforced rather than assumed satisfied.
   */
  oneWaySlabSpanM?: number;
  /** Tributary width actually used, m. Required when `oneWaySlabSpanM` is given. */
  tributaryWidthM?: number;
}

export interface ReductionResult {
  /** Reduced design live load L, kN/m². */
  lKNm2: number;
  /** L / Lo. 1.0 when no reduction applied. */
  ratio: number;
  /** True when any reduction was applied. */
  reduced: boolean;
  /**
   * Why the result is what it is — shown in the derivation report.
   *
   * Structured: the same explanation appears in the Loads preview, the PDF basis block and
   * a DXF general note, and each of those translates it itself.
   */
  reason: EngineMessage;
  refs: ClauseRef[];
}

/**
 * §4.7.2 Eq. (4.1) — L = Lo (0,25 + 4,57/√(K_LL·A_t)), with the limits of §4.7.3–4.7.6.
 *
 * The order of checks matters and follows the regulation: the article-level
 * prohibitions (§4.7.3 heavy loads, §4.7.5 public assembly) are applied before the
 * general expression, and §4.7.4 replaces it for passenger garages.
 */
export function reduceLiveLoad(inputs: ReductionInputs): ReductionResult {
  const { loKNm2: lo, tributaryAreaM2: at, elementKind, floorsSupported } = inputs;
  const kll = K_LL[elementKind];
  const kllAt = kll * at;
  const eqRef = clause('cirsoc-101', '2025', '4.7.2', 'reducción en sobrecargas uniformes');

  const none = (reason: EngineMessage, refs: ClauseRef[]): ReductionResult =>
    ({ lKNm2: lo, ratio: 1, reduced: false, reason, refs });

  // §4.7.5 — public assembly areas are not reduced.
  if (inputs.publicAssembly) {
    return none(msg('loads.cirsoc101.reduction.publicAssembly'),
      [clause('cirsoc-101', '2025', '4.7.5', 'lugares destinados a reuniones públicas')]);
  }

  // §4.7.6 — one-way slabs: A_t must not exceed 1.5 × span × span.
  if (inputs.oneWaySlabSpanM !== undefined && inputs.tributaryWidthM !== undefined) {
    const cap = 1.5 * inputs.oneWaySlabSpanM;
    if (inputs.tributaryWidthM > cap) {
      return none(
        msg('loads.cirsoc101.reduction.oneWaySlabWidthExceeded', {
          width: round(inputs.tributaryWidthM, 2), cap: round(cap, 2),
        }),
        [clause('cirsoc-101', '2025', '4.7.6', 'limitaciones para losas en una sola dirección')]);
    }
  }

  // §4.7.4 — passenger garages are not reduced, except members supporting 2+ floors,
  // which may be reduced by 20 %.
  if (inputs.passengerGarage) {
    const ref = clause('cirsoc-101', '2025', '4.7.4', 'garajes para vehículos de pasajeros');
    if (floorsSupported >= 2) {
      return { lKNm2: 0.8 * lo, ratio: 0.8, reduced: true,
        reason: msg('loads.cirsoc101.reduction.passengerGarageMultiFloor'),
        refs: [ref] };
    }
    return none(msg('loads.cirsoc101.reduction.passengerGarage'), [ref]);
  }

  // §4.7.3 — loads exceeding 5 kN/m² are not reduced, except members supporting 2+
  // floors, which may be reduced by 20 %.
  if (lo > 5.0) {
    const ref = clause('cirsoc-101', '2025', '4.7.3', 'sobrecargas pesadas');
    if (floorsSupported >= 2) {
      return { lKNm2: 0.8 * lo, ratio: 0.8, reduced: true,
        reason: msg('loads.cirsoc101.reduction.heavyMultiFloor', { lo }),
        refs: [ref] };
    }
    return none(msg('loads.cirsoc101.reduction.heavy', { lo }), [ref]);
  }

  // §4.7.2 — the general expression applies only from K_LL·A_t ≥ 37 m².
  if (!(kllAt >= REDUCTION_THRESHOLD_M2)) {
    return none(
      msg('loads.cirsoc101.reduction.belowThreshold', {
        kll, at: round(at, 1), kllAt: round(kllAt, 1), threshold: REDUCTION_THRESHOLD_M2,
      }),
      [eqRef, T42]);
  }

  const raw = lo * (0.25 + 4.57 / Math.sqrt(kllAt));
  const floor = floorsSupported >= 2 ? 0.4 * lo : 0.5 * lo;
  const l = Math.max(raw, Math.min(lo, floor));
  const clamped = raw < floor;

  return {
    lKNm2: Math.min(l, lo),
    ratio: Math.min(l, lo) / lo,
    reduced: Math.min(l, lo) < lo,
    // Two keys rather than one with a conditional tail: a translator must be able to
    // reorder the clamp clause, which a concatenated suffix forbids.
    reason: msg(clamped ? 'loads.cirsoc101.reduction.appliedClamped' : 'loads.cirsoc101.reduction.applied', {
      kll, at: round(at, 1), kllAt: round(kllAt, 1), lo,
      raw: round(raw, 3), floorFactor: floorsSupported >= 2 ? 0.4 : 0.5,
      floorValue: round(floor, 3),
    }),
    refs: [eqRef, T42],
  };
}

// ─── §4.8 minimum roof imposed loads ─────────────────────────────

/**
 * §4.8.1 — roofs inaccessible except for maintenance carry a minimum ordinary imposed
 * load of 1,0 kN/m² (Table 4.1, "cubiertas de techo … usuales").
 */
export const ROOF_MIN_KNM2 = 1.0;

export const ROOF_MIN_REF = clause('cirsoc-101', '2025', '4.8.1',
  'cubiertas inaccesibles salvo con fines de mantenimiento');
