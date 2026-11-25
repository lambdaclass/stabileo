import init, { solve_experimental_beam_study_2d } from './engine/dedaliano_engine.js';

self.onmessage = async (event: MessageEvent<string>) => {
  try {
    await init();
    const result = JSON.parse(solve_experimental_beam_study_2d(event.data));
    self.postMessage({ result });
  } catch (error) {
    self.postMessage({ error: error instanceof Error ? error.message : String(error) });
  }
};
