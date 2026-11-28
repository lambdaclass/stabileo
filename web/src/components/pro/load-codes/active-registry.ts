import { FAMILY_STACKS, loadFamilyOfRegulations } from '../../../lib/codes/families/stacks';
import { codeInputStatus } from './nav-status';
import { regulationsStore } from '../../../lib/store/regulations.svelte';
import { loadCodeFor } from '../../../lib/codes/families';
import type { CodeInputComponent } from './registry';
import { EUROCODE_INPUTS } from './eurocode';
import { ASCE7_INPUTS } from './asce7';
import { TURKEY_INPUTS } from './turkey';

export const CODE_INPUTS: Readonly<Record<string, CodeInputComponent>> = {
  ...EUROCODE_INPUTS,
  ...ASCE7_INPUTS,
  ...TURKEY_INPUTS,
};

export { default as LoadFamilyChooser } from './LoadFamilyChooser.svelte';

export const basisTitle = () => loadCodeFor(regulationsStore.binding('basis')?.adapterId)?.title;

export const familyEditor = { familyOf: loadFamilyOfRegulations, bindings: FAMILY_STACKS, status: codeInputStatus };
