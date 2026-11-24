import { solverOutcome, type LoadSettings, type WeightSettings } from './protocol';

export type ArchRequest = { case: 'weight'; settings: WeightSettings } | { case: 'load'; settings: LoadSettings };

self.onmessage = async (event: MessageEvent<ArchRequest>) => {
  try {
    const base = `${import.meta.env.BASE_URL}research-wasm/heyman-1966/`;
    const response = await fetch(`${base}build.json`, { cache: 'no-store' });
    if (!response.ok) throw new Error('Missing solver manifest');
    const { build_id } = await response.json();
    if (typeof build_id !== 'string' || !/^[a-f0-9]{64}$/.test(build_id)) throw new Error('Invalid solver manifest');
    const bundle = `${base}${build_id}/`;
    const wasm = await import(/* @vite-ignore */ `${bundle}arch.js`);
    await wasm.default({ module_or_path: `${bundle}arch_bg.wasm` });
    const request = event.data;
    const out = JSON.parse(request.case === 'weight'
      ? wasm.self_weight_run(request.settings.alpha, request.settings.n, request.settings.centreline)
      : wasm.point_load_run(request.settings.n, request.settings.t, request.settings.position));
    self.postMessage(solverOutcome(out));
  } catch {
    self.postMessage({ error: 'solver' });
  }
};
