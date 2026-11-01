self.onmessage = async (event: MessageEvent<string>) => {
  try {
    const module = await import(/* @vite-ignore */ event.data);
    await module.default();
    self.postMessage({ layout: JSON.parse(module.recompute()) });
  } catch {
    self.postMessage({ error: true });
  }
};
