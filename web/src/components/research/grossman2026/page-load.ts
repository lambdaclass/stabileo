export function initializePage<T>(load: Promise<T>, ready: (value: T) => void, failed: (error: unknown) => void): () => void {
  let disposed = false;
  void load.then(value => {
    if (!disposed) ready(value);
  }).catch(error => {
    if (!disposed) failed(error);
  });
  return () => { disposed = true; };
}
