import { validConfig, validFrame, type Config, type Frame } from './model';
self.onmessage = async (event: MessageEvent<{ config: Config; base: string }>) => {
  let solver: { step(): string; finished(): boolean; free(): void } | undefined;
  try {
    const { config, base } = event.data;
    if (!validConfig(config)) throw Error('Invalid configuration');
    const m = await import(/* @vite-ignore */ `${base}topopt.js`);
    await m.default({ module_or_path: `${base}topopt_bg.wasm` });
    solver = new m.Topopt(JSON.stringify(config));
    let count = 0;
    while (!solver!.finished()) {
      const frame: Frame = JSON.parse(solver!.step());
      if (!validFrame(frame, config, count++)) throw Error('Invalid solver output');
      self.postMessage({ type: 'step', frame });
    }
    self.postMessage({ type: 'done' });
  } catch (e) { self.postMessage({ type: 'error', message: String(e) }); }
  finally { solver?.free(); }
};
