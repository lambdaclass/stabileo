import type { CodeInputComponent } from '../registry';
import Asce7WindInputs from './Asce7WindInputs.svelte';
import Asce7SnowInputs from './Asce7SnowInputs.svelte';
import Asce7SeismicInputs from './Asce7SeismicInputs.svelte';

export const ASCE7_INPUTS: Readonly<Record<string, CodeInputComponent>> = {
  'asce7-22-wind': Asce7WindInputs as CodeInputComponent,
  'asce7-22-snow': Asce7SnowInputs as CodeInputComponent,
  'asce7-22-seismic': Asce7SeismicInputs as CodeInputComponent,
};
