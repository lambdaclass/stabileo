export function deferred<T extends object>(read: () => T): () => T {
  let value: T;
  return () => value ??= read();
}
