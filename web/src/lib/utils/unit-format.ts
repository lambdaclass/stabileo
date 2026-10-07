/**
 * Fixed-decimal readouts in any unit system, for the places that wrote a value
 * with a set number of decimals in kN or metres: the 2D canvas labels and the
 * Basic calculation report. The decimals are given for SI and grow in a system
 * whose unit is larger (a tonne-force is ten kilonewtons, so a label that read
 * to 0.1 kN reads to 0.01 tf), which keeps the same resolution in every system
 * and leaves the SI text exactly as it was.
 */
import { toDisplay, unitLabel, type Quantity, type UnitSystem } from './units';

/** How many more decimals a quantity needs in `us` to keep the SI resolution. */
export function extraDecimals(q: Quantity, us: UnitSystem): number {
  if (us === 'SI') return 0;
  const ratio = Math.abs(toDisplay(1, q, us) / toDisplay(1, q, 'SI'));
  if (!(ratio > 0) || !Number.isFinite(ratio)) return 0;
  return Math.max(0, Math.round(-Math.log10(ratio)));
}

/** «-0.0» reads «0.0». */
function noNegZero(s: string, d: number): string {
  return Number(s) === 0 ? (0).toFixed(d) : s;
}

/** A value in `us` with `siDecimals` decimals in SI (more in a larger unit), no unit. */
export function fixedNumber(v: number, q: Quantity, siDecimals: number, us: UnitSystem): string {
  if (!Number.isFinite(v)) return '—';
  const d = siDecimals + extraDecimals(q, us);
  return noNegZero(toDisplay(v, q, us).toFixed(d), d);
}

/** The same with its unit: «12.5 kN», «1.27 tf». */
export function fixedQuantity(v: number, q: Quantity, siDecimals: number, us: UnitSystem): string {
  return `${fixedNumber(v, q, siDecimals, us)} ${unitLabel(q, us)}`;
}

/**
 * A value as typed rather than computed: at most `siDecimals` decimals (more in a
 * larger unit) with the trailing zeros dropped, so a 10 kN load reads «10 kN»
 * and the same load in tonnes-force «1.02 tf».
 */
export function plainQuantity(v: number, q: Quantity, siDecimals: number, us: UnitSystem): string {
  if (!Number.isFinite(v)) return '—';
  const r = Number(toDisplay(v, q, us).toFixed(siDecimals + extraDecimals(q, us)));
  return `${r === 0 ? 0 : r} ${unitLabel(q, us)}`;
}

/**
 * Displacements at the size a structure moves: millimetres in SI (as the
 * results table gives them), centimetres in the technical metric system and
 * inches in imperial. `factor` takes metres to that unit, `extra` is the
 * decimals to add to a millimetre readout to keep its resolution.
 */
export function smallDisplacement(us: UnitSystem): { factor: number; unit: string; extra: number } {
  if (us === 'SI') return { factor: 1000, unit: 'mm', extra: 0 };
  const factor = toDisplay(1, 'displacement', us);
  return { factor, unit: unitLabel('displacement', us), extra: Math.max(0, Math.round(Math.log10(1000 / factor))) };
}

/** A displacement given in metres, with `mmDecimals` decimals in mm (more in cm or in). */
export function displacementText(v: number, mmDecimals: number, us: UnitSystem): string {
  if (!Number.isFinite(v)) return '—';
  const { factor, unit, extra } = smallDisplacement(us);
  const d = mmDecimals + extra;
  return `${noNegZero((v * factor).toFixed(d), d)} ${unit}`;
}

/**
 * A value in `us` to `digits` significant figures (whole from there up), trailing zeros dropped,
 * no unit: the section catalogue's A, I and Z. Whole inches⁴ read the weak-axis inertia of 116 of
 * the 777 catalogue profiles «0» (an IPE 80's 8.49 cm⁴ is 0.204 in⁴).
 */
export function significantNumber(v: number, q: Quantity, us: UnitSystem, digits = 3): string {
  if (!Number.isFinite(v)) return '—';
  const x = toDisplay(v, q, us);
  if (x === 0) return '0';
  const d = Math.max(0, digits - 1 - Math.floor(Math.log10(Math.abs(x))));
  const r = Number(x.toFixed(Math.min(20, d)));
  return r === 0 ? '0' : String(r);
}
