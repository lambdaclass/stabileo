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
  | 'bimoment'         // kN·m² ↔ kip·ft² (the warping DOF's reaction)
  | 'distributedLoad'  // kN/m ↔ kip/ft
  | 'stress'           // MPa ↔ ksi
  | 'area'             // m² ↔ in²
  | 'inertia'          // m⁴ ↔ in⁴
  | 'density'          // kN/m³ ↔ pcf (lb/ft³)
  | 'displacement'     // m ↔ in
  | 'rotation'         // rad ↔ rad (same)
  | 'springK'          // kN/m ↔ kip/ft
  | 'springKr'         // kN·m/rad ↔ kip·ft/rad
  | 'temperature'      // °C ↔ °F
  | 'areaLoad'         // kN/m² ↔ psf
  | 'speed';           // m/s ↔ mph

// Conversion factors: multiply SI value by factor to get imperial value
const FACTORS: Record<Quantity, number> = {
  length: 3.28084,             // m → ft
  force: 0.224809,             // kN → kip
  moment: 0.737562,            // kN·m → kip·ft
  bimoment: 0.224809 * 3.28084 ** 2, // kN·m² → kip·ft²
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
  areaLoad: 20.8854,           // kN/m² → psf
  speed: 2.23694,              // m/s → mph
};

/** kN → tf (a tonne-force is 9.80665 kN). */
const TF = 1 / 9.80665;

// Conversion factors to the technical metric system: multiply the SI value.
const MKS_FACTORS: Record<Quantity, number> = {
  length: 1,
  force: TF,
  moment: TF,
  bimoment: TF,
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
  areaLoad: 1000 * TF,  // kN/m² → kgf/m²
  speed: 1,
};

// Technical metric labels
const MKS_LABELS: Record<Quantity, string> = {
  length: 'm',
  force: 'tf',
  moment: 'tf·m',
  bimoment: 'tf·m²',
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
  areaLoad: 'kgf/m²',
  speed: 'm/s',
};

// SI unit labels
const SI_LABELS: Record<Quantity, string> = {
  length: 'm',
  force: 'kN',
  moment: 'kN·m',
  bimoment: 'kN·m²',
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
  areaLoad: 'kN/m²',
  speed: 'm/s',
};

// Imperial unit labels
const IMPERIAL_LABELS: Record<Quantity, string> = {
  length: 'ft',
  force: 'kip',
  moment: 'kip·ft',
  bimoment: 'kip·ft²',
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
  areaLoad: 'psf',
  speed: 'mph',
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
 * What a reaction on a degree of freedom is: a force on a translation (ux…), a moment on a
 * rotation (rx…), and a bimoment on the 3D solver's seventh, `warping`, which reading it as
 * «not a rotation» labelled kN.
 */
export function dofQuantity(dof: string): 'force' | 'moment' | 'bimoment' {
  return dof === 'warping' ? 'bimoment' : dof.startsWith('r') ? 'moment' : 'force';
}

/**
 * A coordinate or a member length as a readout: fixed decimals, enough to show a millimetre in
 * the unit the length is shown in (3 in metres and in feet, 1 in centimetres), unless the reader
 * set decimals for lengths. The automatic precision of `formatValue` reads 150.25 m as «150.3»
 * and 1234.567 m as «1235», which is a node half a metre away from where it is.
 */
export function formatCoordinate(value: number, system: UnitSystem, decimals?: number): string {
  const mm = Math.max(0, Math.ceil(-Math.log10(toDisplay(0.001, 'length', system)) - 1e-9));
  return formatValue(value, 'length', system, decimals ?? mm);
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
