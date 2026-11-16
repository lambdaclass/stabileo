/**
 * The CIRSOC 201 engine's numeric entry points, registered by WASM initialisation.
 *
 * Every concrete clause the app applies — β1, φ, the axial caps, the minimum steel, the
 * strain-compatibility state of any section, the interaction diagrams, the biaxial load
 * contour, the slab and beam sizing — is computed by the Rust engine
 * (`engine/src/postprocess/cirsoc201_*.rs`), where it is tested, fuzzed and, for the beam
 * check, certified. This module holds the registered functions and nothing else: no rule, and
 * no fallback. Asked before the engine is loaded, it throws — a concrete result the engine did
 * not compute is never shown.
 *
 * Units across this boundary are SI: Pa, N, N·m, m, m².
 */

/** A prepared section (`Cirsoc201SectionKernel` in `engine/src/rc_section_kernel.rs`). */
export interface SectionKernelInstance {
  info(): Float64Array;
  depths(nx: number, ny: number): Float64Array;
  points(nx: number, ny: number, depths: Float64Array): Float64Array;
  curve(nx: number, ny: number, n: number): Float64Array;
  atAxial(nx: number, ny: number, pu: number): Float64Array;
  ray(pu: number, mu: number): Float64Array;
  axialLimit(nx: number, ny: number, pu: number): Float64Array;
  biaxial(pu: number, mx: number, my: number): Float64Array;
  biaxialFast(pu: number, mx: number, my: number): Float64Array;
  momentCapacityAtAxial(pu: number, mx: number, my: number): Float64Array;
  characteristicPoints(nx: number, ny: number): Float64Array;
  free(): void;
}
export type SectionKernelConstructor = new (points: Float64Array, offsets: Uint32Array,
  circles: Float64Array, bars: Float64Array, params: Float64Array) => SectionKernelInstance;

export interface Cirsoc201Engine {
  Section: SectionKernelConstructor;
  basis(input: Float64Array): Float64Array;
  phi(edition: number, confinement: number, fy: number, es: number, strains: Float64Array): Float64Array;
  designBeam(input: Float64Array): Float64Array;
  slabProvisions(input: Float64Array): Float64Array;
}

let engine: Partial<Cirsoc201Engine> | null = null;

export function memoizeNumericInput<T>(design: (input: Float64Array) => T, width: number, copy: (answer: T) => T): (input: Float64Array) => T {
  type Entry = { words: Uint32Array; answer: T };
  const buckets = new Map<number, Entry[]>();
  const order = new Map<Entry, number>();
  return input => {
    if (input.length !== width) return design(input);
    const words = new Uint32Array(input.buffer, input.byteOffset, input.byteLength / Uint32Array.BYTES_PER_ELEMENT);
    let hash = 2166136261;
    for (let i = 0; i < words.length; i++) hash = Math.imul(hash ^ words[i]!, 16777619);
    const previous = buckets.get(hash)?.find(entry => {
      for (let i = 0; i < words.length; i++) if (entry.words[i] !== words[i]) return false;
      return true;
    });
    if (previous) return copy(previous.answer);
    const answer = design(input);
    if (order.size === 4096) {
      const [oldest, oldHash] = order.entries().next().value!;
      order.delete(oldest);
      const bucket = buckets.get(oldHash)!;
      bucket.splice(bucket.indexOf(oldest), 1);
      if (bucket.length === 0) buckets.delete(oldHash);
    }
    const entry = { words: words.slice(), answer: copy(answer) };
    const bucket = buckets.get(hash) ?? [];
    bucket.push(entry);
    buckets.set(hash, bucket);
    order.set(entry, hash);
    return copy(answer);
  };
}

export function memoizeNumericKernel(design: (input: Float64Array) => Float64Array, width: number): (input: Float64Array) => Float64Array {
  return memoizeNumericInput(design, width, answer => answer.slice());
}

export function registerCirsoc201Engine(value: Partial<Cirsoc201Engine> | null): void {
  engine = value && { ...value, ...(value.basis ? { basis: memoizeNumericKernel(value.basis, 9) } : {}), ...(value.designBeam ? { designBeam: memoizeNumericKernel(value.designBeam, 15) } : {}) };
}

export function cirsoc201EngineAvailable(): boolean {
  return !!(engine?.Section && engine.basis && engine.phi);
}

/**
 * Thrown when a concrete result is asked of an engine that is not loaded. Its `code` is the one
 * the app's engine-unavailable handling recognises (`ENGINE_UNAVAILABLE`), so the screen says
 * "engine not available" instead of showing a number.
 */
export class Cirsoc201EngineUnavailable extends Error {
  readonly code = 'ENGINE_UNAVAILABLE' as const;
  constructor(what: string) {
    super(`The engine is not available, so the CIRSOC 201 ${what} was not computed.`);
    this.name = 'EngineUnavailableError';
  }
}

/** The engine, or an error that says it is not loaded. Never a stand-in. */
export function cirsoc201Engine<K extends keyof Cirsoc201Engine>(key: K): Cirsoc201Engine[K] {
  const f = engine?.[key];
  if (!f) throw new Cirsoc201EngineUnavailable(String(key));
  return f as Cirsoc201Engine[K];
}

/** Values per state and per utilisation in the section kernel's outputs. */
export const STATE_LEN = 9;
export const UTIL_LEN = 9;
