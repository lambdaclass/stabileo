// Unit system conversion utilities
// Internal model always uses SI (m, kN, kN/m, kN·m, MPa, m², m⁴)
// Imperial display uses: ft, kip, kip/ft, kip·ft, ksi, in², in⁴

export type UnitSystem = 'SI' | 'Imperial';

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
  if (qty === 'temperature') return value * 9 / 5 + 32; // °C → °F
  return value * FACTORS[qty];
}

/**
 * Convert a display value (in the given unit system) back to SI.
 */
export function fromDisplay(value: number, qty: Quantity, system: UnitSystem): number {
  if (system === 'SI') return value;
  if (qty === 'temperature') return (value - 32) * 5 / 9; // °F → °C
  return value / FACTORS[qty];
}

/**
 * Get the unit label string for a quantity in a given system.
 */
export function unitLabel(qty: Quantity, system: UnitSystem): string {
  return system === 'SI' ? SI_LABELS[qty] : IMPERIAL_LABELS[qty];
}

/**
 * Format a value with appropriate precision for display.
 */
export function formatValue(value: number, qty: Quantity, system: UnitSystem): string {
  const displayVal = toDisplay(value, qty, system);
  const abs = Math.abs(displayVal);
  if (abs < 1e-10) return '0';
  if (abs >= 1000) return displayVal.toFixed(0);
  if (abs >= 100) return displayVal.toFixed(1);
  if (abs >= 1) return displayVal.toFixed(2);
  if (abs >= 0.01) return displayVal.toFixed(4);
  return displayVal.toExponential(3);
}
