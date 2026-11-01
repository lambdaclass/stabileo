import { decodeRun } from './protocol';
self.onmessage = async (event: MessageEvent<{ width: number; compression: number }>) => {
  try {
    const base = `${import.meta.env.BASE_URL}research-wasm/biggins-2026/`;
    const response = await fetch(`${base}build.json`, { cache: 'no-store' });
    if (!response.ok) throw new Error('Missing solver manifest');
    const { build_id } = await response.json();
    if (typeof build_id !== 'string' || !/^[a-f0-9]{64}$/.test(build_id)) throw new Error('Invalid solver manifest');
    const bundle = `${base}${build_id}/`;
    const wasm = await import(/* @vite-ignore */ `${bundle}arches.js`);
    await wasm.default({ module_or_path: `${bundle}arches_bg.wasm` });
    self.postMessage({ result: decodeRun(JSON.parse(wasm.simulation_run(event.data.width, event.data.compression))) });
  } catch {
    self.postMessage({ error: true });
  }
};
