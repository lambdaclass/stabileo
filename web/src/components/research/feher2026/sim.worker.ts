import { decodeRun, type ShapeSettings } from './protocol';
self.onmessage = async (event: MessageEvent<ShapeSettings>) => {
  try {
    const base = `${import.meta.env.BASE_URL}research-wasm/feher-sipos-varkonyi-2026/`;
    const response = await fetch(`${base}build.json`, { cache: 'no-store' });
    if (!response.ok) throw new Error('Missing solver manifest');
    const { build_id } = await response.json();
    if (typeof build_id !== 'string' || !/^[a-f0-9]{64}$/.test(build_id)) throw new Error('Invalid solver manifest');
    const bundle = `${base}${build_id}/`;
    const wasm = await import(/* @vite-ignore */ `${bundle}shape.js`);
    await wasm.default({ module_or_path: `${bundle}shape_bg.wasm` });
    const { theta, delta, q, half, elements } = event.data;
    const out = JSON.parse(wasm.simulation_run(theta, delta, q, half, elements));
    if (typeof out.error === 'string' && out.error.startsWith('start:')) {
      self.postMessage({ error: 'start' });
      return;
    }
    if (out.error) throw new Error(out.error);
    self.postMessage({ result: decodeRun(out) });
  } catch {
    self.postMessage({ error: 'solver' });
  }
};
