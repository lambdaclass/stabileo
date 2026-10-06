/**
 * The unit system the 2D canvas labels are written in.
 *
 * Module-level, like `setDiagramUnitSystem`, so the pure drawing functions
 * (loads, supports, reactions, dimensions) can follow the reader's choice
 * without reading a Svelte store or growing a parameter at every call site.
 * The viewport sets it at the start of each frame; anything that draws
 * without setting it (the tests) gets SI, the units the model is stored in.
 */
import type { UnitSystem } from '../utils/units';

let system: UnitSystem = 'SI';

export function setCanvasUnitSystem(us: UnitSystem): void {
  system = us;
}

export function canvasUnitSystem(): UnitSystem {
  return system;
}
