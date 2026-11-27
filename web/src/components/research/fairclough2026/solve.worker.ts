self.onmessage = async (event: MessageEvent<{ url: string; unitWeight: number }>) => {
  try {
    const module = await import(/* @vite-ignore */ event.data.url);
    await module.default();
    self.postMessage({ layout: JSON.parse(module.recompute(event.data.unitWeight)), unitWeight: event.data.unitWeight });
  } catch {
    self.postMessage({ error: true });
  }
};
