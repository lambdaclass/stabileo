import { decodeRun, type SnapRequest, type SnapReply } from './protocol';

let wasm: { simulation_run(settings: string): string } | null = null;

self.onmessage = async (event: MessageEvent<SnapRequest>) => {
  const { requestId, settings } = event.data;
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
    const result = decodeRun(JSON.parse(wasm!.simulation_run(JSON.stringify(settings))));
    self.postMessage({ requestId, result } satisfies SnapReply);
  } catch {
    self.postMessage({ requestId, error: true } satisfies SnapReply);
  }
};
