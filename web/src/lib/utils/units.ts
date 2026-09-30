// Unit system conversion utilities
// Internal model always uses SI (m, kN, kN/m, kN·m, MPa, m², m⁴)
// Technical metric (MKS) display uses: m, tf, tf/m, tf·m, kgf/cm², cm², cm⁴, cm of displacement
// Imperial display uses: ft, kip, kip/ft, kip·ft, ksi, in², in⁴

export type UnitSystem = 'SI' | 'MKS' | 'Imperial';

/** Every display system, in the order a selector offers them. */
export const UNIT_SYSTEMS: readonly UnitSystem[] = ['SI', 'MKS', 'Imperial'];

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
  | 'temperature';     // °C ↔ °F

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
};

/**
 * Convert an SI value to display value in the given unit system.
 */
export function toDisplay(value: number, qty: Quantity, system: UnitSystem): number {
  if (system === 'SI') return value;
  if (system === 'MKS') return value * MKS_FACTORS[qty];
  if (qty === 'temperature') return value * 9 / 5 + 32; // °C → °F
  return value * FACTORS[qty];
}

/**
 * Convert a display value (in the given unit system) back to SI.
 */
export function fromDisplay(value: number, qty: Quantity, system: UnitSystem): number {
  if (system === 'SI') return value;
  if (system === 'MKS') return value / MKS_FACTORS[qty];
  if (qty === 'temperature') return (value - 32) * 5 / 9; // °F → °C
  return value / FACTORS[qty];
}

/**
 * Get the unit label string for a quantity in a given system.
 */
export function unitLabel(qty: Quantity, system: UnitSystem): string {
  return system === 'SI' ? SI_LABELS[qty] : system === 'MKS' ? MKS_LABELS[qty] : IMPERIAL_LABELS[qty];
}

/**
 * Format a value with appropriate precision for display.
 */
export function formatValue(value: number, qty: Quantity, system: UnitSystem, decimals?: number): string {
  const displayVal = toDisplay(value, qty, system);
  const abs = Math.abs(displayVal);
  // A fixed number of decimals when the reader asked for one for this quantity.
  if (decimals !== undefined && decimals >= 0) return abs < 1e-12 ? '0' : displayVal.toFixed(decimals);
  if (abs < 1e-10) return '0';
  if (abs >= 1000) return displayVal.toFixed(0);
  if (abs >= 100) return displayVal.toFixed(1);
  if (abs >= 1) return displayVal.toFixed(2);
  if (abs >= 0.01) return displayVal.toFixed(4);
  return displayVal.toExponential(3);
}
