import type { CodeInputComponent } from './registry';
import { EUROCODE_INPUTS } from './eurocode';
import { ASCE7_INPUTS } from './asce7';
import { TURKEY_INPUTS } from './turkey';

export const CODE_INPUTS: Readonly<Record<string, CodeInputComponent>> = {
  ...EUROCODE_INPUTS,
  ...ASCE7_INPUTS,
  ...TURKEY_INPUTS,
};
