// Auto Load Generator — CIRSOC 101 (Loads) & CIRSOC 103 (Seismic)
// Generates load cases, loads, and combinations from project parameters.
// Does NOT touch the solver — produces data compatible with modelStore.

import { t } from '../i18n';

// ─── CIRSOC 101: Occupancy Live Loads ─────────────────────────

export type OccupancyKey =
  | 'vivienda' | 'vivienda_escaleras' | 'vivienda_balcon'
  | 'oficinas' | 'oficinas_archivo' | 'oficinas_corredores_pb' | 'oficinas_corredores'
  | 'comercio_pb' | 'comercio_pisos' | 'comercio_mayorista'
  | 'aulas' | 'escuela_corredores'
  | 'hospital_hab' | 'hospital_quirofano' | 'hospital_corredores'
  | 'reunion_fijo' | 'reunion_movil' | 'templos'
  | 'fabrica_liviana' | 'fabrica_pesada'
  | 'deposito_liviano' | 'deposito_pesado'
  | 'garage_autos'
  | 'cubierta_inaccesible' | 'azotea_privada' | 'azotea_publica';

export interface OccupancyEntry {
  key: OccupancyKey;
  label: string;
  labelEn: string;
  q: number; // kN/m²
  category: string;
}

export const OCCUPANCY_TABLE: OccupancyEntry[] = [
  // Residencial
  { key: 'vivienda', label: 'Vivienda — general', labelEn: 'Residential — general', q: 2.0, category: 'residential' },
  { key: 'vivienda_escaleras', label: 'Vivienda — escaleras', labelEn: 'Residential — stairs', q: 2.0, category: 'residential' },
  { key: 'vivienda_balcon', label: 'Vivienda — balcón', labelEn: 'Residential — balcony', q: 5.0, category: 'residential' },
  // Oficinas
  { key: 'oficinas', label: 'Oficinas', labelEn: 'Offices', q: 2.5, category: 'office' },
  { key: 'oficinas_archivo', label: 'Oficinas — archivo', labelEn: 'Offices — filing rooms', q: 7.0, category: 'office' },
  { key: 'oficinas_corredores_pb', label: 'Oficinas — corredores PB', labelEn: 'Offices — ground floor corridors', q: 5.0, category: 'office' },
  { key: 'oficinas_corredores', label: 'Oficinas — corredores pisos', labelEn: 'Offices — upper floor corridors', q: 4.0, category: 'office' },
  // Comercial
  { key: 'comercio_pb', label: 'Comercio minorista — PB', labelEn: 'Retail — ground floor', q: 5.0, category: 'commercial' },
  { key: 'comercio_pisos', label: 'Comercio minorista — pisos', labelEn: 'Retail — upper floors', q: 4.0, category: 'commercial' },
  { key: 'comercio_mayorista', label: 'Comercio mayorista', labelEn: 'Wholesale', q: 6.0, category: 'commercial' },
  // Educación
  { key: 'aulas', label: 'Aulas', labelEn: 'Classrooms', q: 3.0, category: 'education' },
  { key: 'escuela_corredores', label: 'Escuela — corredores', labelEn: 'School — corridors', q: 5.0, category: 'education' },
  // Salud
  { key: 'hospital_hab', label: 'Hospital — habitaciones', labelEn: 'Hospital — rooms', q: 2.0, category: 'health' },
  { key: 'hospital_quirofano', label: 'Hospital — quirófanos', labelEn: 'Hospital — surgery rooms', q: 3.0, category: 'health' },
  { key: 'hospital_corredores', label: 'Hospital — corredores', labelEn: 'Hospital — corridors', q: 4.0, category: 'health' },
  // Reunión
  { key: 'reunion_fijo', label: 'Reunión — asientos fijos', labelEn: 'Assembly — fixed seats', q: 3.0, category: 'assembly' },
  { key: 'reunion_movil', label: 'Reunión — asientos móviles', labelEn: 'Assembly — movable seats', q: 5.0, category: 'assembly' },
  { key: 'templos', label: 'Templos', labelEn: 'Places of worship', q: 5.0, category: 'assembly' },
  // Industrial
  { key: 'fabrica_liviana', label: 'Fábrica liviana', labelEn: 'Light factory', q: 6.0, category: 'industrial' },
  { key: 'fabrica_pesada', label: 'Fábrica pesada', labelEn: 'Heavy factory', q: 12.0, category: 'industrial' },
  { key: 'deposito_liviano', label: 'Depósito liviano', labelEn: 'Light storage', q: 6.0, category: 'industrial' },
  { key: 'deposito_pesado', label: 'Depósito pesado', labelEn: 'Heavy storage', q: 12.0, category: 'industrial' },
  // Estacionamiento
  { key: 'garage_autos', label: 'Estacionamiento autos', labelEn: 'Car parking', q: 2.5, category: 'parking' },
  // Cubiertas
  { key: 'cubierta_inaccesible', label: 'Cubierta inaccesible', labelEn: 'Inaccessible roof', q: 1.0, category: 'roof' },
  { key: 'azotea_privada', label: 'Azotea privada', labelEn: 'Private terrace', q: 3.0, category: 'roof' },
  { key: 'azotea_publica', label: 'Azotea pública', labelEn: 'Public terrace', q: 5.0, category: 'roof' },
];

// ─── CIRSOC 101: Dead Load Components ─────────────────────────

export interface DeadLoadComponent {
  key: string;
  label: string;
  labelEn: string;
  q: number; // kN/m²
  editable: boolean;
}

export const DEAD_LOAD_DEFAULTS: DeadLoadComponent[] = [
  { key: 'contrapiso', label: 'Contrapiso (5cm)', labelEn: 'Screed (5cm)', q: 1.0, editable: true },
  { key: 'piso', label: 'Carpeta + piso cerámico', labelEn: 'Floor finish + tiles', q: 0.8, editable: true },
  { key: 'cielorraso', label: 'Cielorraso suspendido', labelEn: 'Suspended ceiling', q: 0.3, editable: true },
  { key: 'instalaciones', label: 'Instalaciones', labelEn: 'MEP installations', q: 0.3, editable: true },
  { key: 'tabiques', label: 'Tabiques livianos', labelEn: 'Light partitions', q: 1.0, editable: true },
];

// ─── CIRSOC 101: Standard Load Combinations ───────────────────

export interface AutoCombination {
  name: string;
  factors: Array<{ caseType: string; factor: number }>;
}

/** CIRSOC 101 Table 2.4.2 — Standard LRFD combinations */
export function getCirsoc101Combinations(hasWind: boolean, hasSeismic: boolean, hasSnow: boolean): AutoCombination[] {
  const combos: AutoCombination[] = [
    { name: '1.4D', factors: [{ caseType: 'D', factor: 1.4 }] },
    { name: '1.2D + 1.6L', factors: [{ caseType: 'D', factor: 1.2 }, { caseType: 'L', factor: 1.6 }] },
  ];

  if (hasSnow) {
    combos.push({
      name: '1.2D + 1.6L + 0.5S',
      factors: [{ caseType: 'D', factor: 1.2 }, { caseType: 'L', factor: 1.6 }, { caseType: 'S', factor: 0.5 }],
    });
    combos.push({
      name: '1.2D + 1.6S + L',
      factors: [{ caseType: 'D', factor: 1.2 }, { caseType: 'S', factor: 1.6 }, { caseType: 'L', factor: 1.0 }],
    });
  }

  if (hasWind) {
    combos.push({
      name: '1.2D + W + L',
      factors: [{ caseType: 'D', factor: 1.2 }, { caseType: 'W', factor: 1.0 }, { caseType: 'L', factor: 1.0 }],
    });
    combos.push({
      name: '0.9D + W',
      factors: [{ caseType: 'D', factor: 0.9 }, { caseType: 'W', factor: 1.0 }],
    });
  }

  if (hasSeismic) {
    combos.push({
      name: '1.2D + E + L',
      factors: [{ caseType: 'D', factor: 1.2 }, { caseType: 'E', factor: 1.0 }, { caseType: 'L', factor: 1.0 }],
    });
    combos.push({
      name: '0.9D + E',
      factors: [{ caseType: 'D', factor: 0.9 }, { caseType: 'E', factor: 1.0 }],
    });
    if (hasSnow) {
      combos.push({
        name: '1.2D + E + L + 0.2S',
        factors: [{ caseType: 'D', factor: 1.2 }, { caseType: 'E', factor: 1.0 }, { caseType: 'L', factor: 1.0 }, { caseType: 'S', factor: 0.2 }],
      });
    }
  }

  return combos;
}

// ─── CIRSOC 103: Seismic Zone Data ────────────────────────────

export type SeismicZone = 0 | 1 | 2 | 3 | 4;
export type SoilType = 'SA' | 'SB' | 'SC' | 'SD' | 'SE';
export type ImportanceGroup = 'Ao' | 'A' | 'B' | 'C';

/** CIRSOC 103 Table — Spectral parameters by zone and soil */
const SPECTRAL_PARAMS: Record<number, Record<string, { Ca: number; Cv: number; T1: number; T2: number }>> = {
  4: {
    SA: { Ca: 0.32, Cv: 0.32, T1: 0.10, T2: 0.40 },
    SB: { Ca: 0.35, Cv: 0.35, T1: 0.10, T2: 0.40 },
    SC: { Ca: 0.35, Cv: 0.45, T1: 0.10, T2: 0.51 },
    SD: { Ca: 0.38, Cv: 0.56, T1: 0.12, T2: 0.59 },
    SE: { Ca: 0.44, Cv: 0.84, T1: 0.16, T2: 0.76 },
  },
  3: {
    SA: { Ca: 0.23, Cv: 0.23, T1: 0.10, T2: 0.40 },
    SB: { Ca: 0.25, Cv: 0.25, T1: 0.10, T2: 0.40 },
    SC: { Ca: 0.28, Cv: 0.36, T1: 0.10, T2: 0.51 },
    SD: { Ca: 0.32, Cv: 0.47, T1: 0.12, T2: 0.59 },
    SE: { Ca: 0.36, Cv: 0.69, T1: 0.16, T2: 0.76 },
  },
  2: {
    SA: { Ca: 0.16, Cv: 0.16, T1: 0.10, T2: 0.40 },
    SB: { Ca: 0.18, Cv: 0.18, T1: 0.10, T2: 0.40 },
    SC: { Ca: 0.22, Cv: 0.28, T1: 0.10, T2: 0.51 },
    SD: { Ca: 0.27, Cv: 0.40, T1: 0.12, T2: 0.59 },
    SE: { Ca: 0.30, Cv: 0.57, T1: 0.16, T2: 0.76 },
  },
  1: {
    SA: { Ca: 0.09, Cv: 0.09, T1: 0.10, T2: 0.40 },
    SB: { Ca: 0.10, Cv: 0.10, T1: 0.10, T2: 0.40 },
    SC: { Ca: 0.14, Cv: 0.18, T1: 0.10, T2: 0.51 },
    SD: { Ca: 0.19, Cv: 0.28, T1: 0.12, T2: 0.59 },
    SE: { Ca: 0.21, Cv: 0.40, T1: 0.16, T2: 0.76 },
  },
};

/** Importance factors γr by group (CIRSOC 103 §3) */
export const IMPORTANCE_FACTORS: Record<ImportanceGroup, number> = {
  Ao: 1.5,
  A: 1.3,
  B: 1.0,
  C: 0.8,
};

export type DuctilityKey =
  | 'HA_portico_completa' | 'HA_portico_limitada'
  | 'HA_tabique_completa' | 'HA_tabique_limitada'
  | 'HA_dual_completa' | 'HA_dual_limitada'
  | 'acero_portico_especial' | 'acero_portico_intermedio' | 'acero_portico_convencional'
  | 'acero_arriostrado_excentrico'
  | 'acero_arriostrado_concentrico_especial' | 'acero_arriostrado_concentrico_convencional';

export interface DuctilityEntry {
  key: DuctilityKey;
  label: string;
  labelEn: string;
  mu: number;
  material: 'HA' | 'acero';
}

export const DUCTILITY_TABLE: DuctilityEntry[] = [
  { key: 'HA_portico_completa', label: 'Pórtico HA — ductilidad completa', labelEn: 'RC frame — full ductility', mu: 5.0, material: 'HA' },
  { key: 'HA_portico_limitada', label: 'Pórtico HA — ductilidad limitada', labelEn: 'RC frame — limited ductility', mu: 3.0, material: 'HA' },
  { key: 'HA_tabique_completa', label: 'Tabiques HA — ductilidad completa', labelEn: 'RC shear walls — full ductility', mu: 4.0, material: 'HA' },
  { key: 'HA_tabique_limitada', label: 'Tabiques HA — ductilidad limitada', labelEn: 'RC shear walls — limited ductility', mu: 2.5, material: 'HA' },
  { key: 'HA_dual_completa', label: 'Dual HA — ductilidad completa', labelEn: 'RC dual system — full ductility', mu: 5.0, material: 'HA' },
  { key: 'HA_dual_limitada', label: 'Dual HA — ductilidad limitada', labelEn: 'RC dual system — limited ductility', mu: 3.0, material: 'HA' },
  { key: 'acero_portico_especial', label: 'Pórtico acero — especial', labelEn: 'Steel moment frame — special', mu: 6.0, material: 'acero' },
  { key: 'acero_portico_intermedio', label: 'Pórtico acero — intermedio', labelEn: 'Steel moment frame — intermediate', mu: 3.5, material: 'acero' },
  { key: 'acero_portico_convencional', label: 'Pórtico acero — convencional', labelEn: 'Steel moment frame — ordinary', mu: 2.5, material: 'acero' },
  { key: 'acero_arriostrado_excentrico', label: 'Arriostrado excéntrico', labelEn: 'Eccentrically braced', mu: 6.0, material: 'acero' },
  { key: 'acero_arriostrado_concentrico_especial', label: 'Arriostrado concéntrico — especial', labelEn: 'Concentrically braced — special', mu: 4.5, material: 'acero' },
  { key: 'acero_arriostrado_concentrico_convencional', label: 'Arriostrado concéntrico — convencional', labelEn: 'Concentrically braced — ordinary', mu: 3.5, material: 'acero' },
];

/** Period coefficient Cr and exponent x by structure type (CIRSOC 103 §7.2) */
export type StructureSystem = 'portico_HA' | 'portico_acero' | 'muros' | 'otro';

const PERIOD_COEFFICIENTS: Record<StructureSystem, { Cr: number; x: number }> = {
  portico_acero: { Cr: 0.0724, x: 0.80 },
  portico_HA: { Cr: 0.0466, x: 0.90 },
  muros: { Cr: 0.0488, x: 0.75 },
  otro: { Cr: 0.0488, x: 0.75 },
};

// ─── CIRSOC 103: Computation Functions ────────────────────────

/** Compute elastic spectral acceleration Sa(T) in g */
export function computeSa(T: number, zone: SeismicZone, soil: SoilType): number {
  if (zone === 0) return 0;
  const p = SPECTRAL_PARAMS[zone]?.[soil];
  if (!p) return 0;
  const T3 = 3.0;

  if (T <= p.T1) return p.Ca * (1 + 1.5 * T / p.T1);
  if (T <= p.T2) return 2.5 * p.Ca;
  if (T <= T3) return p.Cv / T;
  return p.Cv * T3 / (T * T);
}

/** Compute approximate fundamental period (CIRSOC 103 §7.2) */
export function approximatePeriod(H: number, system: StructureSystem): number {
  const { Cr, x } = PERIOD_COEFFICIENTS[system];
  return Cr * Math.pow(H, x);
}

/** Compute reduction factor R(T) from ductility μ */
export function reductionFactor(T: number, mu: number, T1: number): number {
  if (T <= T1) return 1 + (mu - 1) * T / T1;
  return mu;
}

export interface SeismicConfig {
  zone: SeismicZone;
  soil: SoilType;
  importanceGroup: ImportanceGroup;
  ductilityKey: DuctilityKey;
  structureSystem: StructureSystem;
}

export interface FloorLevel {
  elevation: number;   // m (Y coordinate)
  weight: number;      // kN (seismic weight at this level)
  nodeIds: number[];   // nodes at this level
}

export interface SeismicStaticResult {
  T: number;              // fundamental period (s)
  Sa: number;             // spectral acceleration (g)
  gammaR: number;         // importance factor
  mu: number;             // ductility
  R: number;              // reduction factor
  W: number;              // total seismic weight (kN)
  V0: number;             // base shear (kN)
  floors: Array<{
    elevation: number;
    weight: number;
    Fk: number;           // lateral force at this level (kN)
    nodeIds: number[];
  }>;
}

/** CIRSOC 103 — Static equivalent method
 *  Computes base shear and distributes lateral forces by floor. */
export function computeSeismicStatic(
  config: SeismicConfig,
  floors: FloorLevel[],
  buildingHeight: number,
): SeismicStaticResult {
  const mu = DUCTILITY_TABLE.find(d => d.key === config.ductilityKey)?.mu ?? 3.0;
  const gammaR = IMPORTANCE_FACTORS[config.importanceGroup];
  const T = approximatePeriod(buildingHeight, config.structureSystem);

  // Spectral acceleration (elastic)
  const SaElastic = computeSa(T, config.zone, config.soil);

  // Reduction factor
  const p = SPECTRAL_PARAMS[config.zone]?.[config.soil];
  const T1 = p?.T1 ?? 0.1;
  const R = reductionFactor(T, mu, T1);

  // Design spectral acceleration
  const Sa = gammaR * SaElastic / R;

  // Total seismic weight
  const W = floors.reduce((sum, f) => sum + f.weight, 0);

  // Base shear: V0 = Sa × W (Sa is in g, so V0 = Sa × W directly since W is in kN and g cancels)
  const V0 = Sa * W;

  // Distribution exponent k (CIRSOC 103 §7.3)
  let k: number;
  if (T <= 0.5) k = 1.0;
  else if (T >= 2.5) k = 2.0;
  else k = 1.0 + (T - 0.5) / 2.0;

  // Σ(Wi × hi^k)
  const sumWhk = floors.reduce((sum, f) => sum + f.weight * Math.pow(f.elevation, k), 0);

  // Floor forces
  const floorResults = floors.map(f => {
    const Cvx = sumWhk > 0 ? (f.weight * Math.pow(f.elevation, k)) / sumWhk : 0;
    return {
      elevation: f.elevation,
      weight: f.weight,
      Fk: V0 * Cvx,
      nodeIds: f.nodeIds,
    };
  });

  return { T, Sa, gammaR, mu, R, W, V0, floors: floorResults };
}

/** Detect floor levels from model nodes.
 *  Groups nodes by Y coordinate (with tolerance), returns sorted levels. */
export function detectFloorLevels(
  nodes: Map<number, { id: number; x: number; y: number; z?: number }>,
  tolerance: number = 0.05,
): Array<{ elevation: number; nodeIds: number[] }> {
  const levels = new Map<number, number[]>();

  for (const [id, node] of nodes) {
    const y = node.y;
    let matched = false;
    for (const [elev, ids] of levels) {
      if (Math.abs(y - elev) < tolerance) {
        ids.push(id);
        matched = true;
        break;
      }
    }
    if (!matched) {
      levels.set(y, [id]);
    }
  }

  return Array.from(levels.entries())
    .map(([elevation, nodeIds]) => ({ elevation, nodeIds }))
    .sort((a, b) => a.elevation - b.elevation);
}
