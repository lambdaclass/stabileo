import type { RoofLiveInputs, RoofLiveResult } from '../cirsoc101/roof-live';
import { msg } from '../message';
import { TS498 } from './refs';

/** TS 498 gives a roof reached only for maintenance no uniform imposed load: its snow load governs. */
export const ts498RoofLive = (_i: RoofLiveInputs): RoofLiveResult => ({
  lr: 0, r1: 1, r2: 1, refs: [TS498('Madde 7', 'kar yükü')], reason: msg('loads.tr.roofLive'),
});
