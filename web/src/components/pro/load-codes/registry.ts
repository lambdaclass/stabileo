/**
 * What a code other than CIRSOC asks the load dialog for, by role: a component per adapter that
 * edits that code's entry of `LoadPlanInput.codeInputs`. A role whose bound adapter has none here
 * shows the CIRSOC fields it always had.
 */
import type { Component } from 'svelte';
import { EUROCODE_INPUTS } from './eurocode';
import { ASCE7_INPUTS } from './asce7';
import { TURKEY_INPUTS } from './turkey';

export interface CodeInputProps<T = unknown> {
  value: T | undefined;
  onchange: (v: T) => void;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type CodeInputComponent = Component<CodeInputProps<any>>;

export const CODE_INPUTS: Readonly<Record<string, CodeInputComponent>> = { ...EUROCODE_INPUTS, ...ASCE7_INPUTS, ...TURKEY_INPUTS };
