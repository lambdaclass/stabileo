import { solveAll, type Inputs } from './solve-all';
import { loadSprings } from './springs';
self.onmessage = async ({ data }: MessageEvent<Inputs>) => {
  try { self.postMessage({ result: solveAll(await loadSprings(), data) }); }
  catch (error) { self.postMessage({ error: error instanceof Error ? error.message : String(error) }); }
};
