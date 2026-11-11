import type { CodeInputComponent } from '../registry';
import Ts498WindInput from './Ts498WindInput.svelte';
import Ts498SnowInput from './Ts498SnowInput.svelte';
import TbdySeismicInput from './TbdySeismicInput.svelte';
import { TR_SEISMIC, TR_SNOW, TR_WIND } from '../../../../lib/codes/turkey/inputs';

export const TURKEY_INPUTS: Readonly<Record<string, CodeInputComponent>> = {
  [TR_WIND]: Ts498WindInput as CodeInputComponent,
  [TR_SNOW]: Ts498SnowInput as CodeInputComponent,
  [TR_SEISMIC]: TbdySeismicInput as CodeInputComponent,
};
