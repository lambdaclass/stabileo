/**
 * The CIRSOC 201 beam-section checker, as the engine computes it.
 *
 * Flexure and shear strength of a rectangular or flanged section with the bars and stirrups it has, in
 * Rust (`engine/src/postprocess/cirsoc201_check.rs`, `beam_batch`), where the clause is
 * tested, fuzzed and mutation-tested with the rest of the engine. This module is the numeric
 * boundary and nothing else: it packs SI inputs, unpacks SI outputs, and holds no rule.
 *
 * Registered by WASM initialisation and dependency-free, like the other kernels, so the
 * synchronous verifier can call it without importing the solver. Unregistered, every query
 * answers `null`: the verifier reports the member as not verifiable, never with a capacity
 * this module made up.
 */
import { memoizeNumericInput } from './cirsoc201-engine';
import type { RegulationEdition } from '../../../codes/regulation';

export type Cirsoc201BeamKernel = (data: Float64Array) => Float64Array;

let kernel: Cirsoc201BeamKernel | null = null;
let single: ((data: Float64Array) => BeamSectionAnswer) | null = null;
export function registerCirsoc201BeamKernel(value: Cirsoc201BeamKernel | null): void {
  kernel = value;
  single = value && memoizeNumericInput(data => unpackSections(value(data), 1)[0]!, IN, answer => ({ ...answer }));
}
export function cirsoc201BeamKernelAvailable(): boolean { return kernel !== null; }

/** One section, SI units (Pa, m, m², N). Absent optional quantities are 0. */
export interface BeamSectionQuery {
  edition: RegulationEdition;
  fc: number; fy: number; es?: number;
  b: number; h: number; d: number;
  As: number; AsComp?: number; dPrime?: number;
  Av?: number; s?: number; fyt?: number; Ag?: number;
  /**
   * Axial force, N, POSITIVE IN COMPRESSION. It acts on the shear (Tabla 22.5.5.1) and on the
   * flexure, at the gross centroid about which the moment is then taken (22.4 with 22.2).
   */
  NuCompression?: number;
  /** A compression flange: effective width and thickness, m. Absent: a rectangle. */
  bf?: number; hf?: number;
}

export interface BeamSectionAnswer {
  flexureValid: boolean;
  shearValid: boolean;
  /** N·m, m, m, –, –, Pa, Pa, – */
  phiMn: number; a: number; c: number; epsilonT: number; phi: number;
  fsTension: number; fsComp: number;
  /** Least εt the ductility clause allows (9.3.3.1; 2005: 10.3.5). */
  epsilonTMin: number;
  /** N, N, m², flags, N */
  Vc: number; Vs: number; AvMin: number; avBelowMin: boolean; vsCapped: boolean; phiVn: number;
}

const IN = 17;
const OUT = 16;

/** Evaluate many sections in one engine call. `null` when the engine is not available. */
export function evaluateBeamSections(queries: readonly BeamSectionQuery[]): BeamSectionAnswer[] | null {
  if (!kernel) return null;
  const data = new Float64Array(queries.length * IN);
  queries.forEach((q, i) => packSection(q, data, i * IN));
  if (queries.length === 1) return [single!(data)];
  return unpackSections(kernel(data), queries.length);
}

function packSection(q: BeamSectionQuery, data: Float64Array, offset: number): void {
  data[offset++] = q.edition === '2005' ? 2005 : 2025;
  data[offset++] = q.fc; data[offset++] = q.fy; data[offset++] = q.es ?? 0;
  data[offset++] = q.b; data[offset++] = q.h; data[offset++] = q.d;
  data[offset++] = q.As; data[offset++] = q.AsComp ?? 0; data[offset++] = q.dPrime ?? 0;
  data[offset++] = q.Av ?? 0; data[offset++] = q.s ?? 0; data[offset++] = q.fyt ?? 0;
  data[offset++] = q.Ag ?? 0; data[offset++] = q.NuCompression ?? 0;
  data[offset++] = q.bf ?? 0; data[offset] = q.hf ?? 0;
}

function unpackSections(out: Float64Array, count: number): BeamSectionAnswer[] {
  if (out.length !== count * OUT) throw new Error('cirsoc201_beam_batch: unexpected output length');
  return Array.from({ length: count }, (_, i) => {
    const r = out.subarray(i * OUT, (i + 1) * OUT);
    return {
      phiMn: r[0], a: r[1], c: r[2], epsilonT: r[3], phi: r[4], fsTension: r[5], fsComp: r[6], epsilonTMin: r[7],
      Vc: r[8], Vs: r[9], AvMin: r[10], avBelowMin: r[11] === 1, vsCapped: r[12] === 1, phiVn: r[13],
      flexureValid: r[14] === 1, shearValid: r[15] === 1,
    };
  });
}

export function evaluateBeamSection(q: BeamSectionQuery): BeamSectionAnswer | null {
  if (!single) return null;
  const data = new Float64Array(IN);
  packSection(q, data, 0);
  return single(data);
}
