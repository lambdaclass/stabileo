/** Numeric WASM boundary. Code coefficients are supplied by cirsoc201-basis. */
export interface RcSectionGeometry {
  evaluate(nx: number, ny: number, depths: Float64Array): Float64Array;
  free(): void;
}
export type RcSectionGeometryConstructor = new (points: Float64Array, offsets: Uint32Array,
  bars: Float64Array, constants: Float64Array, deduct: boolean) => RcSectionGeometry;
let constructor: RcSectionGeometryConstructor | null = null;
export function registerRcSectionKernel(value: RcSectionGeometryConstructor | null): void { constructor = value; }
export function getRcSectionKernel(): RcSectionGeometryConstructor | null { return constructor; }
