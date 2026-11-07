import { decodeRiser } from './protocol';
self.onmessage = async (event: MessageEvent<{ pull: number; lift: number; friction: number }>) => {
  try {
    const base = `${import.meta.env.BASE_URL}research-wasm/gay-neto-2014/`;
    const response = await fetch(`${base}build.json`, { cache: 'no-store' });
    if (!response.ok) throw new Error('Missing solver manifest');
    const { build_id } = await response.json();
    if (typeof build_id !== 'string' || !/^[a-f0-9]{64}$/.test(build_id)) throw new Error('Invalid solver manifest');
    const bundle = `${base}${build_id}/`;
    const wasm = await import(/* @vite-ignore */ `${bundle}riser.js`);
    await wasm.default({ module_or_path: `${bundle}riser_bg.wasm` });
    const { pull, lift, friction } = event.data;
    self.postMessage({ result: decodeRiser(JSON.parse(wasm.simulation_run(pull, lift, friction))) });
  } catch {
    self.postMessage({ error: true });
  }
};
