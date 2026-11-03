/**
 * The influence-line tool's own inputs: the loads its line is loaded with (dead g, live q, a
 * concentrated P), where q goes, and the envelope along the members drawn from them.
 */
import type { IlLoads, LivePlacement } from '../engine/influence/areas';
import type { AlongEnvelope } from '../engine/influence/envelope-along';

let loads = $state<IlLoads>({ g: 10, q: 5, P: 0 });
let placement = $state<LivePlacement>('zones');
let envelope = $state.raw<AlongEnvelope | null>(null);
let envelopeOn = '';

export const influenceTool = {
  get loads(): IlLoads { return loads; },
  setLoads(next: Partial<IlLoads>): void {
    loads = { ...loads, ...next };
    envelope = null;
  },
  get placement() { return placement; },
  set placement(v: LivePlacement) { placement = v; envelope = null; },
  /** Drawn over the line while set; cleared when its inputs or the line change. */
  get envelope() { return envelope; },
  set envelope(v: AlongEnvelope | null) { envelope = v; envelopeOn = ''; },
  setEnvelopeFor(v: AlongEnvelope, loaded: readonly number[]): void { envelope = v; envelopeOn = loaded.join(','); },
  keepEnvelopeFor(loaded: readonly number[]): void { if (envelope && envelopeOn !== loaded.join(',')) { envelope = null; envelopeOn = ''; } },
};
