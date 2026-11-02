import * as engine from '../../lib/engine/wasm-solver';
import { findExample } from './catalog';
import type { Values } from './define';

self.onmessage = async ({ data }: MessageEvent<{ id: string; values: Values; token: number }>) => {
  try {
    await engine.initSolver();
    const example = findExample(data.id);
    if (!example) throw new Error(`unknown example ${data.id}`);
    const outcome = example.analyses(example.build(data.values), data.values, engine);
    self.postMessage({ token: data.token, outcome });
  } catch (error) {
    self.postMessage({ token: data.token, outcome: { status: 'refused', reason: error instanceof Error ? error.message : String(error) } });
  }
};
