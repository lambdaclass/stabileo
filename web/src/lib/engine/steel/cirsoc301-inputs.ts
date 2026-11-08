/** The engine's `cirsoc301_inputs` entry point (`engine/src/postprocess/cirsoc301_inputs.rs`), registered by WASM initialisation. */
import { EngineCheckError, EngineUnavailableError } from '../engine-unavailable';

type JsonFn = (json: string) => string;

let kernel: JsonFn | null = null;

export function registerCirsoc301InputsKernel(fn: JsonFn | null): void { kernel = fn; }

export function cirsoc301InputsAvailable(): boolean { return kernel !== null; }

export function cirsoc301InputsRequest<T>(op: string, what: string, payload: object): T {
  if (!kernel) throw new EngineUnavailableError(what);
  let raw: string;
  try { raw = kernel(JSON.stringify({ ...payload, op })); }
  catch (e) { throw new EngineCheckError(what, e instanceof Error ? e.message : String(e)); }
  return JSON.parse(raw) as T;
}
