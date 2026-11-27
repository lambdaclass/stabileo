/**
 * What a code other than CIRSOC asks the load dialog for, by role: a component per adapter that
 * edits that code's entry of `LoadPlanInput.codeInputs`. A role whose bound adapter has none here
 * shows the CIRSOC fields it always had.
 */
import type { Component } from 'svelte';

export interface CodeInputProps<T = unknown> {
  value: T | undefined;
  onchange: (v: T) => void;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type CodeInputComponent = Component<CodeInputProps<any>>;

export const CODE_INPUTS: Readonly<Record<string, CodeInputComponent>> = {};
