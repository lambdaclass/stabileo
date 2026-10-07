/**
 * The words on the 3D load tags (`viewport3d/scene-sync.ts`), pure so they are tested without a
 * scene: each value in the project's units with the reader's decimals, as `fmtQ` writes every
 * other value in the app.
 */
import { formatValue, unitLabel, type Quantity, type UnitSystem } from './units';

type Decimals = Partial<Record<Quantity, number>>;

/** «12.5 kN», «1.27 tf»: a value with its unit. */
export function quantityText(v: number, q: Quantity, sys: UnitSystem, decimals: Decimals = {}): string {
  return `${formatValue(v, q, sys, decimals[q])} ${unitLabel(q, sys)}`;
}

/**
 * A slab's temperature load: its uniform change ΔT and its gradient ΔTg. Both are changes, not
 * temperatures, so they convert without the 32 °F offset: a 20 °C rise is 36 °F, which the
 * affine `temperature` read as 68 °F.
 */
export function slabTemperatureTag(dtUniform: number | undefined, dtGradient: number | undefined, sys: UnitSystem, decimals: Decimals = {}): string {
  const temp = (v: number) => quantityText(v, 'temperatureDelta', sys, decimals);
  return [dtUniform ? `ΔT ${temp(dtUniform)}` : '', dtGradient ? `ΔTg ${temp(dtGradient)}` : ''].filter(Boolean).join(' · ');
}

/** How a free-body label writes a force and a moment. */
export interface ForceMomentFormat { force: (v: number) => string; moment: (v: number) => string }

/**
 * Forces and moments with their units, in `sys`, with the reader's decimals or two: what the
 * despiece inspector writes (`DespieceInspector.svelte`), so the drawing and the table agree.
 */
export function forceMomentFormat(sys: UnitSystem, decimals: Decimals = {}): ForceMomentFormat {
  return {
    force: (v) => quantityText(v, 'force', sys, { force: decimals.force ?? 2 }),
    moment: (v) => quantityText(v, 'moment', sys, { moment: decimals.moment ?? 2 }),
  };
}
