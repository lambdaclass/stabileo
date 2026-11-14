import type { CodeInputComponent } from '../registry';
import EcWindInput from './EcWindInput.svelte';
import EcSnowInput from './EcSnowInput.svelte';
import EcSeismicInput from './EcSeismicInput.svelte';
import UkWindInput from './UkWindInput.svelte';
import UkSnowInput from './UkSnowInput.svelte';

export const EUROCODE_INPUTS: Readonly<Record<string, CodeInputComponent>> = {
  'en1991-1-4': EcWindInput as CodeInputComponent,
  'en1991-1-3': EcSnowInput as CodeInputComponent,
  'en1998-1': EcSeismicInput as CodeInputComponent,
  'en1991-1-4-uk': UkWindInput as CodeInputComponent,
  'en1991-1-3-uk': UkSnowInput as CodeInputComponent,
};
