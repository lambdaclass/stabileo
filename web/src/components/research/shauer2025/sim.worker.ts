import { displayedFields } from './worker-frames';
import { researchAssetBase } from '../shell/assets';
/// <reference lib="webworker" />
/**
 * Runs the phase-field simulation off the main thread. The WASM bundle is a static file built
 * by research/fracture/shauer-2025/wasm/build.sh, fetched at run time so the web build does not
 * depend on it; without it the page reports that the bundle is not built.
 */
import type { WorkerIn, WorkerOut } from './protocol';

const BASE = `${researchAssetBase}shauer-2025/`;
type Glue = {
  default: (opts: { module_or_path: string }) => Promise<unknown>;
  Simulation: {
    new (config: string): {
      nodes(): Float64Array;
      elements(): Uint32Array;
      advance(): string | undefined;
      damage(): Float64Array;
      displacement(): Float64Array;
      elementStress(): Float64Array;
      free(): void;
    };
    referenceConfig(): string;
  };
};
let glue: Glue | null = null;

const post = (m: WorkerOut, transfer: Transferable[] = []) => (self as unknown as Worker).postMessage(m, transfer);

async function load(): Promise<Glue> {
  if (glue) return glue;
  const g = (await import(/* @vite-ignore */ `${BASE}phasefield.js`)) as Glue;
  await g.default({ module_or_path: `${BASE}phasefield_bg.wasm` });
  glue = g;
  return g;
}

self.onmessage = async (e: MessageEvent<WorkerIn>) => {
  const msg = e.data;
  let g: Glue;
  try {
    g = await load();
  } catch (err) {
    post({ type: 'unavailable', message: String(err) });
    return;
  }
  if (msg.type === 'reference-config') {
    post({ type: 'reference-config', config: g.Simulation.referenceConfig() });
    return;
  }
  const { runId } = msg;
  let sim;
  try {
    sim = new g.Simulation(msg.config);
  } catch (err) {
    post({ type: 'error', runId, message: err instanceof Error ? err.message : String(err) });
    return;
  }
  post({ type: 'mesh', runId, nodes: sim.nodes(), elements: sim.elements() });
  const t0 = performance.now();
  try {
    for (;;) {
      const s = sim.advance();
      if (s === undefined) break;
      const { damage, displacement, syy } = displayedFields(sim);
      post({ type: 'step', runId, step: JSON.parse(s), damage, displacement, syy }, [damage.buffer, displacement.buffer, syy.buffer]);
    }
    post({ type: 'done', runId, seconds: (performance.now() - t0) / 1000 });
  } catch (err) {
    post({ type: 'error', runId, message: err instanceof Error ? err.message : String(err) });
  } finally {
    sim.free();
  }
};
