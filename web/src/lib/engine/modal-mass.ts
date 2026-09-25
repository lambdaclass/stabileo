/**
 * Cumulative modal mass participation, per mode, for the modal table.
 *
 * The table's "Cum." columns used to add up |Γ|, the participation factor,
 * and show the sum as a percentage against the usual 90 % mass target. Γ is
 * not a mass fraction: its size depends on how the shape is normalized, and
 * with the unit-maximum shapes the engine publishes a cantilever's first mode
 * has Γ ≈ 1.6 — "157 %", marked as enough — while it carries about 61 % of
 * the mass. The engine reports the mass ratio of every mode; this adds those.
 */
export type MassAxis = 'X' | 'Y' | 'Z';

export function cumulativeMassRatios(
  modes: ReadonlyArray<Partial<Record<`massRatio${MassAxis}`, number>>>,
  axis: MassAxis,
): number[] {
  let sum = 0;
  return modes.map((m) => (sum += m[`massRatio${axis}`] ?? 0));
}
