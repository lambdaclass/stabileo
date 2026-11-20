import { decodeRun, type Settings } from './protocol';

let wasm: { simulation_run(settings: string): string } | null = null;

self.onmessage = async (event: MessageEvent<Settings>) => {
  try {
    if (!wasm) {
      const base = `${import.meta.env.BASE_URL}research-wasm/vella-2024/`;
      const response = await fetch(`${base}build.json`, { cache: 'no-store' });
      if (!response.ok) throw new Error('Missing solver manifest');
      const { build_id } = await response.json();
      if (typeof build_id !== 'string' || !/^[a-f0-9]{64}$/.test(build_id)) throw new Error('Invalid solver manifest');
      const bundle = `${base}${build_id}/`;
      const module = await import(/* @vite-ignore */ `${bundle}snap.js`);
      await module.default({ module_or_path: `${bundle}snap_bg.wasm` });
      wasm = module;
    }
    self.postMessage({ result: decodeRun(JSON.parse(wasm!.simulation_run(JSON.stringify(event.data)))) });
  } catch {
    self.postMessage({ error: true });
  }
};
