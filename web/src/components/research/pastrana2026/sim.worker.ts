import type { Form } from './form';
type Module = { default: (opts: { module_or_path: string }) => Promise<unknown>; form_find: (q: number, load: number) => string };
self.onmessage = async ({ data }: MessageEvent<{ base: string; q: number; load: number }>) => {
  try {
    const module: Module = await import(/* @vite-ignore */ `${data.base}form.js`);
    await module.default({ module_or_path: `${data.base}form_bg.wasm` });
    const form: Form = JSON.parse(module.form_find(data.q, data.load));
    self.postMessage({ form });
  } catch {
    self.postMessage({ error: true });
  }
};
