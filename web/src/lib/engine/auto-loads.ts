/**
 * The tables the CAD example GENERATOR reads. Not a production path any more.
 *
 * ── What was removed, and why it had to be ─────────────────────
 *
 * This file used to be the load generator. It held a CIRSOC 101-2005 occupancy table, a
 * 2005 combination set, and — the part that mattered — an INPRES-CIRSOC 103 seismic
 * model from the same era: Ca and Cv by zone and SOIL rather than by spectral type, T3
 * fixed at 3 s where the 2018 table gives 3, 5, 8 and 13, and a reduction factor built
 * up from a ductility μ through a ramp instead of read off Tabla 5.1. No clause
 * reference anywhere in it.
 *
 * `lib/codes/cirsoc101` replaced the loads and the combinations, and
 * `lib/codes/cirsoc103` replaced the seismic half. After that the seismic model had
 * ZERO callers, and a superseded implementation of a seismic code sitting unused in
 * `engine/` is not harmless: it is the first thing anyone searching this tree for
 * "seismic" finds, and it is in the obvious place while the correct one is not. So it
 * is gone rather than deprecated.
 *
 * ── What is left, and why ──────────────────────────────────────
 *
 * Two tables, read by `scripts/build-cad-dxf-examples.ts` when it regenerates the CAD
 * example fixtures. They are still the 2005 values. That is a known gap and it is
 * confined to generated FIXTURES — no production surface reads this file. Moving the
 * generator onto the 2025 tables would change those fixtures and the tests that assert
 * on them, which is its own piece of work.
 */

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
