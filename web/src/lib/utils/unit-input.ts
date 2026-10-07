/**
 * What `UnitInput.svelte` shows for a value kept in SI, and what a typed text commits: pure, so
 * the field's rules are tested without a DOM.
 */
import { toDisplay, fromDisplay, type Quantity, type UnitSystem } from './units';

/** The quantities that are lengths, whose field must keep a millimetre however large they are. */
const LENGTHS: ReadonlySet<Quantity> = new Set<Quantity>(['length', 'displacement', 'sectionDim']);

/**
 * The text of the field: six significant figures (enough for any input, without
 * 0.30000000000000004), and for a length at least the decimals of a millimetre in the unit it is
 * shown in (3 in metres and feet, 1 in centimetres), as `formatCoordinate` reads them. Six
 * significant figures alone showed a node at 12345.678 m as «12345.7» and one at 123456.4 m as
 * «123456», and typing that figure did nothing, since it was what the field already said.
 */
export function unitInputText(value: number, qty: Quantity, system: UnitSystem): string {
  if (!Number.isFinite(value)) return '';
  const v = toDisplay(value, qty, system);
  let digits = 6;
  if (LENGTHS.has(qty) && Math.abs(v) >= 1) {
    const mm = Math.max(0, Math.ceil(-Math.log10(Math.abs(toDisplay(0.001, qty, system))) - 1e-9));
    digits = Math.max(digits, Math.floor(Math.log10(Math.abs(v))) + 1 + mm);
  }
  return String(+v.toPrecision(Math.min(21, digits)));
}

/**
 * The SI value a typed text commits, or null for none. A field that still says what it was shown
 * (as text, or as the same number written another way: «1.50» for «1.5») keeps the exact value
 * behind it, since converting the shown digits back would round it; any other number commits.
 */
export function unitInputCommit(raw: string, value: number, qty: Quantity, system: UnitSystem): number | null {
  const shown = unitInputText(value, qty, system);
  const text = raw.trim();
  if (text === shown) return null;
  const n = parseFloat(text);
  if (!Number.isFinite(n)) return null;
  if (shown !== '' && n === Number(shown)) return null;
  return fromDisplay(n, qty, system);
}

/**
 * One SI value read as another quantity with the same figure on screen. The load toolbar keeps
 * one value for a point force, a moment and a distributed load; in kip, kip·ft and kip/ft the
 * same SI number is three different figures, so 2 kip typed and then Distributed read
 * 0.6096 kip/ft. The number the reader typed is what they meant: it stays, as the new quantity.
 */
export function keepTypedNumber(si: number, from: Quantity | null, to: Quantity | null, system: UnitSystem): number {
  if (!from || !to || from === to || !Number.isFinite(si)) return si;
  return fromDisplay(toDisplay(si, from, system), to, system);
}
