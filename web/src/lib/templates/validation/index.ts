/**
 * The validation models: seven structures modelled one to one, kept as model code.
 *
 * Each one reproduces a published sample structure node for node and member for member: the
 * same geometry and numbering, supports, releases, offsets and member orientations, the same
 * material, the sections by their declared properties (A, Iy, Iz, J and shear areas), and the
 * same cases, loads and combinations. What a file changes is written at its top: Z up instead
 * of Y up, SI units by exact factors, and anything computed by the source program and applied
 * here as plain loads (a generated seismic load, an area load already spread to the members).
 *
 * They are model code (`model/code/format.ts`) rather than fixture JSON because the fixture
 * loader carries neither member behaviour, groups nor self-weight with a factor, and these
 * need all three. They load as they are: no regulation combinations are generated for them,
 * since reproducing the source's own is the point.
 */
import { modelStore } from '../../store/model.svelte';
import { uiStore } from '../../store/ui.svelte';
import { codeToModel } from '../../model/code/format';
import { mergeCode } from '../../model/code/apply';

export const VALIDATION_MODELS = {
  'validation-02': () => import('./validation-02.stabileo.txt?raw'),
  'validation-06': () => import('./validation-06.stabileo.txt?raw'),
  'validation-07': () => import('./validation-07.stabileo.txt?raw'),
} as const;

export type ValidationModelId = keyof typeof VALIDATION_MODELS;

/** The model code of one validation model. */
export async function validationModelCode(id: ValidationModelId): Promise<string> {
  return (await VALIDATION_MODELS[id]()).default;
}

/** Replace the open model with a validation model, as one undo step. */
export async function loadValidationModel(id: ValidationModelId): Promise<void> {
  const parsed = codeToModel(await validationModelCode(id));
  if (!parsed.snapshot) {
    throw new Error(`${id}: ${parsed.errors.map((e) => `line ${e.line}: ${e.message}`).join('; ')}`);
  }
  modelStore.clear();
  const { snapshot } = mergeCode(modelStore.snapshot(), parsed.snapshot);
  modelStore.batch(() => modelStore.restore(snapshot));
  modelStore.refreshCanonicalSections();
  uiStore.useNative3DPresentation();
}
