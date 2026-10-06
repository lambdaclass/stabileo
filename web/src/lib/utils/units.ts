// Unit system conversion utilities
// Internal model always uses SI (m, kN, kN/m, kN·m, MPa, m², m⁴); files keep SI whatever is shown.
// SI (mm) display is SI with lengths in mm: coordinates, displacements and section properties
//   (mm, mm², mm⁴, mm³); forces, loads per metre and per square metre, stresses stay as in SI.
// Technical metric (MKS) display uses: m, tf, tf/m, tf·m, kgf/cm², cm², cm⁴, cm of displacement
// Imperial display uses: ft, kip, kip/ft, kip·ft, ksi, in², in⁴

export type UnitSystem = 'SI' | 'SImm' | 'MKS' | 'Imperial';

/** Every display system, in the order a selector offers them. */
export const UNIT_SYSTEMS: readonly UnitSystem[] = ['SI', 'SImm', 'MKS', 'Imperial'];

/** Whether a stored value names a display system (a preference read back from the browser). */
export const isUnitSystem = (v: unknown): v is UnitSystem => (UNIT_SYSTEMS as readonly unknown[]).includes(v);

export type Quantity =
  | 'length'           // m ↔ ft
  | 'force'            // kN ↔ kip
  | 'moment'           // kN·m ↔ kip·ft
  | 'distributedLoad'  // kN/m ↔ kip/ft
  | 'stress'           // MPa ↔ ksi
  | 'area'             // m² ↔ in²
  | 'inertia'          // m⁴ ↔ in⁴
  | 'density'          // kN/m³ ↔ pcf (lb/ft³)
  | 'displacement'     // m ↔ in
  | 'rotation'         // rad ↔ rad (same)
  | 'springK'          // kN/m ↔ kip/ft
  | 'springKr'         // kN·m/rad ↔ kip·ft/rad
  | 'temperature'      // °C ↔ °F (a temperature)
  | 'temperatureDiff'  // °C ↔ °F (a difference or a gradient: no offset)
  | 'areaLoad'         // kN/m² ↔ psf
  | 'speed'            // m/s ↔ mph
  // A cross-section's properties: shown in cm in SI, as section tables give them.
  | 'sectionArea'      // m² → cm² ↔ in²
  | 'sectionInertia'   // m⁴ → cm⁴ ↔ in⁴
  | 'sectionModulus'   // m³ → cm³ ↔ in³
  | 'sectionDim';      // m → cm ↔ in (a dimension of a cross-section)

// Conversion factors: multiply SI value by factor to get imperial value
const FACTORS: Record<Quantity, number> = {
  length: 3.28084,             // m → ft
  force: 0.224809,             // kN → kip
  moment: 0.737562,            // kN·m → kip·ft
  distributedLoad: 0.0685218,  // kN/m → kip/ft
  stress: 0.145038,            // MPa → ksi
  area: 1550.003,              // m² → in²
  inertia: 2402509.61,         // m⁴ → in⁴
  density: 6.36587,            // kN/m³ → pcf
  displacement: 39.3701,       // m → in
  rotation: 1,                 // rad → rad
  springK: 0.0685218,          // kN/m → kip/ft
  springKr: 0.737562,          // kN·m/rad → kip·ft/rad
  temperature: 1,              // special handling (affine)
  temperatureDiff: 1.8,        // Δ°C → Δ°F
  areaLoad: 20.8854,           // kN/m² → psf
  speed: 2.23694,              // m/s → mph
  sectionArea: 1550.003,       // m² → in²
  sectionInertia: 2402509.61,  // m⁴ → in⁴
  sectionModulus: 61023.74,    // m³ → in³
  sectionDim: 39.3701,         // m → in
};

/** SI shows section properties in cm; everything else as stored. */
const SI_FACTORS: Partial<Record<Quantity, number>> = { sectionArea: 1e4, sectionInertia: 1e8, sectionModulus: 1e6, sectionDim: 100 };
/** SI (mm): lengths in mm. */
const SIMM_FACTORS: Partial<Record<Quantity, number>> = {
  length: 1000, displacement: 1000, area: 1e6, inertia: 1e12,
  sectionArea: 1e6, sectionInertia: 1e12, sectionModulus: 1e9, sectionDim: 1000,
};

/** kN → tf (a tonne-force is 9.80665 kN). */
const TF = 1 / 9.80665;

// Conversion factors to the technical metric system: multiply the SI value.
const MKS_FACTORS: Record<Quantity, number> = {
  length: 1,
  force: TF,
  moment: TF,
  distributedLoad: TF,
  stress: 1e6 / 98066.5,  // MPa → kgf/cm²: 1 kgf/cm² = 9.80665 N / 1 cm² = 98 066,5 Pa
  area: 1e4,
  inertia: 1e8,
  density: TF,
  displacement: 100,
  rotation: 1,
  springK: TF,
  springKr: TF,
  temperature: 1,
  temperatureDiff: 1,
  areaLoad: 1000 * TF,  // kN/m² → kgf/m²
  speed: 1,
  sectionArea: 1e4,
  sectionInertia: 1e8,
  sectionModulus: 1e6,
  sectionDim: 100,
};

// Technical metric labels
const MKS_LABELS: Record<Quantity, string> = {
  length: 'm',
  force: 'tf',
  moment: 'tf·m',
  distributedLoad: 'tf/m',
  stress: 'kgf/cm²',
  area: 'cm²',
  inertia: 'cm⁴',
  density: 'tf/m³',
  displacement: 'cm',
  rotation: 'rad',
  springK: 'tf/m',
  springKr: 'tf·m/rad',
  temperature: '°C',
  temperatureDiff: '°C',
  areaLoad: 'kgf/m²',
  speed: 'm/s',
  sectionArea: 'cm²',
  sectionInertia: 'cm⁴',
  sectionModulus: 'cm³',
  sectionDim: 'cm',
};

// SI unit labels
const SI_LABELS: Record<Quantity, string> = {
  length: 'm',
  force: 'kN',
  moment: 'kN·m',
  distributedLoad: 'kN/m',
  stress: 'MPa',
  area: 'm²',
  inertia: 'm⁴',
  density: 'kN/m³',
  displacement: 'm',
  rotation: 'rad',
  springK: 'kN/m',
  springKr: 'kN·m/rad',
  temperature: '°C',
  temperatureDiff: '°C',
  areaLoad: 'kN/m²',
  speed: 'm/s',
  sectionArea: 'cm²',
  sectionInertia: 'cm⁴',
  sectionModulus: 'cm³',
  sectionDim: 'cm',
};

// SI (mm) labels: SI's, with lengths in mm
const SIMM_LABELS: Record<Quantity, string> = {
  ...SI_LABELS,
  length: 'mm',
  displacement: 'mm',
  area: 'mm²',
  inertia: 'mm⁴',
  sectionArea: 'mm²',
  sectionInertia: 'mm⁴',
  sectionModulus: 'mm³',
  sectionDim: 'mm',
};

// Imperial unit labels
const IMPERIAL_LABELS: Record<Quantity, string> = {
  length: 'ft',
  force: 'kip',
  moment: 'kip·ft',
  distributedLoad: 'kip/ft',
  stress: 'ksi',
  area: 'in²',
  inertia: 'in⁴',
  density: 'pcf',
  displacement: 'in',
  rotation: 'rad',
  springK: 'kip/ft',
  springKr: 'kip·ft/rad',
  temperature: '°F',
  temperatureDiff: '°F',
  areaLoad: 'psf',
  speed: 'mph',
  sectionArea: 'in²',
  sectionInertia: 'in⁴',
  sectionModulus: 'in³',
  sectionDim: 'in',
};

/**
 * Convert an SI value to display value in the given unit system.
 */
export function toDisplay(value: number, qty: Quantity, system: UnitSystem): number {
  if (system === 'SI') return value * (SI_FACTORS[qty] ?? 1);
  if (system === 'SImm') return value * (SIMM_FACTORS[qty] ?? SI_FACTORS[qty] ?? 1);
  if (system === 'MKS') return value * MKS_FACTORS[qty];
  if (qty === 'temperature') return value * 9 / 5 + 32; // °C → °F
  return value * FACTORS[qty];
}

/**
 * Convert a display value (in the given unit system) back to SI.
 */
export function fromDisplay(value: number, qty: Quantity, system: UnitSystem): number {
  if (system === 'SI') return value / (SI_FACTORS[qty] ?? 1);
  if (system === 'SImm') return value / (SIMM_FACTORS[qty] ?? SI_FACTORS[qty] ?? 1);
  if (system === 'MKS') return value / MKS_FACTORS[qty];
  if (qty === 'temperature') return (value - 32) * 5 / 9; // °F → °C
  return value / FACTORS[qty];
}

/**
 * Get the unit label string for a quantity in a given system.
 */
export function unitLabel(qty: Quantity, system: UnitSystem): string {
  return system === 'SI' ? SI_LABELS[qty] : system === 'SImm' ? SIMM_LABELS[qty] : system === 'MKS' ? MKS_LABELS[qty] : IMPERIAL_LABELS[qty];
}

/**
 * Format a value with appropriate precision for display.
 *
 * A value that rounds to zero is "0", never "-0.00" nor "0.000" beside a "0" elsewhere; a value
 * that is not a number is "—". Without fixed decimals the precision follows the size of the
 * ROUNDED value, so 99.996 reads "100.0" like 100 does, not "100.00".
 */
export function formatValue(value: number, qty: Quantity, system: UnitSystem, decimals?: number): string {
  if (!Number.isFinite(value)) return '—';
  const v = toDisplay(value, qty, system);
  const fixed = (d: number) => { const s = v.toFixed(d); return Number(s) === 0 ? '0' : s; };
  // A fixed number of decimals when the reader asked for one for this quantity.
  if (decimals !== undefined && decimals >= 0) return fixed(decimals);
  const abs = Math.abs(v);
  if (abs < 1e-10) return '0';
  if (abs >= 999.5) return fixed(0);
  if (abs >= 99.95) return fixed(1);
  if (abs >= 0.995) return fixed(2);
  if (abs >= 0.0099995) return fixed(4);
  return v.toExponential(3);
}

/**
 * The decimals a reader set per quantity (`store/display-units.svelte.ts` keeps them and calls
 * `setDisplayDecimals`), for the formatters that run outside the store: the diagram labels.
 */
let displayDecimals: Partial<Record<Quantity, number>> = {};
export function setDisplayDecimals(d: Partial<Record<Quantity, number>>): void { displayDecimals = { ...d }; }

/**
 * A diagram value with its unit, the one formatter of the 2D and 3D labels: the reader's decimals
 * for the quantity when set, otherwise 0 decimals from 100, 1 from 10, 2 below; never "-0.00".
 * Moments are shown sagging-positive (the internal sign is hogging-positive), so `moment` negates.
 */
export function formatDiagramValue(value: number, qty: 'force' | 'moment', system: UnitSystem): string {
  if (!Number.isFinite(value)) return '—';
  const v = toDisplay(qty === 'moment' ? -value : value, qty, system);
  const abs = Math.abs(v);
  const d = displayDecimals[qty] ?? (abs >= 99.5 ? 0 : abs >= 9.95 ? 1 : 2);
  const s = v.toFixed(d);
  return `${Number(s) === 0 ? (0).toFixed(d) : s} ${unitLabel(qty, system)}`;
}

/**
 * A number for a table cell: at most `maxDecimals` decimals, trailing zeros dropped, a point for
 * the decimals and no grouping, as every other table of the app writes them; "—" when it is not
 * a number; never "-0". It replaces `toLocaleString(undefined, …)`, which followed the BROWSER's
 * locale, not the app's: in a Spanish browser 1234 kN read "1.234", which looks like 1,234 kN.
 */
export function plainNumber(v: number, maxDecimals = 2): string {
  if (!Number.isFinite(v)) return '—';
  const r = Number(v.toFixed(maxDecimals));
  return Object.is(r, -0) || r === 0 ? '0' : String(r);
}
