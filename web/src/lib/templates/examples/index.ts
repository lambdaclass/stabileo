/**
 * The PRO examples written as model code (`model/code/format.ts`).
 *
 * Built by `scripts/build-pro-examples.ts` from their dimensions, and kept as code rather than
 * fixture JSON because the fixture loader carries neither member behaviour, releases per axis,
 * offsets nor self-weight as a case load, and these use them. They load as they are.
 */
import { modelStore } from '../../store/model.svelte';
import { uiStore } from '../../store/ui.svelte';
import { codeToModel } from '../../model/code/format';
import { mergeCode } from '../../model/code/apply';

export const CODE_EXAMPLES = {
  'pro-plane-frame-seismic': () => import('./pro-plane-frame-seismic.stabileo.txt?raw'),
  'pro-rc-frame-area-loads': () => import('./pro-rc-frame-area-loads.stabileo.txt?raw'),
  'pro-steel-building-slabs': () => import('./pro-steel-building-slabs.stabileo.txt?raw'),
  'pro-simple-shed': () => import('./pro-simple-shed.stabileo.txt?raw'),
  'pro-concrete-wall-storehouse': () => import('./pro-concrete-wall-storehouse.stabileo.txt?raw'),
  'pro-crane-hangar': () => import('./pro-crane-hangar.stabileo.txt?raw'),
  'pro-guyed-tower': () => import('./pro-guyed-tower.stabileo.txt?raw'),
} as const;

export type CodeExampleId = keyof typeof CODE_EXAMPLES;

export async function codeExampleText(id: CodeExampleId): Promise<string> {
  return (await CODE_EXAMPLES[id]()).default;
}

/** Replace the open model with a model-code example, as one undo step. */
export async function loadCodeExample(id: CodeExampleId): Promise<void> {
  const parsed = codeToModel(await codeExampleText(id));
  if (!parsed.snapshot) {
    throw new Error(`${id}: ${parsed.errors.map((e) => `line ${e.line}: ${e.message}`).join('; ')}`);
  }
  modelStore.clear();
  const { snapshot } = mergeCode(modelStore.snapshot(), parsed.snapshot);
  modelStore.batch(() => modelStore.restore(snapshot));
  modelStore.refreshCanonicalSections();
  uiStore.useNative3DPresentation();
}
