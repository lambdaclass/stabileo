import { designSpectrum, type SpectrumInputs, type DesignSpectrum, type SpectrumBlocked } from '../codes/cirsoc103/spectrum';
import { engineFailureMessage } from '../engine/engine-unavailable';
import { engineStatus } from './engine-status.svelte';

/** A live preview keeps rendering when the engine or its spectrum export cannot answer. */
export function previewCodeSpectrum(inputs: SpectrumInputs): DesignSpectrum | SpectrumBlocked {
  // Track initialization so a preview opened before the engine loads is recomputed.
  void engineStatus.ready;
  try {
    return designSpectrum(inputs);
  } catch (err) {
    const blocked = engineFailureMessage(err);
    if (!blocked) throw err;
    return { blocked, refs: [] };
  }
}
