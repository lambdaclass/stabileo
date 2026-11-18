export const FIGURE_LOAD_TIMEOUT_MS = 2000;

export function createFigureLoader<T>(load: () => Promise<T>): () => Promise<T | undefined> {
  let loaded: Promise<T> | undefined;
  let pending: Promise<T | undefined> | undefined;

  function startLoad(): Promise<T | undefined> {
    const imported = Promise.resolve().then(load);
    return new Promise((resolve) => {
      const timer = setTimeout(() => resolve(undefined), FIGURE_LOAD_TIMEOUT_MS);
      const finish = (figure: T | undefined) => {
        clearTimeout(timer);
        pending = undefined;
        resolve(figure);
      };

      void imported.then((figure) => {
        loaded = imported;
        finish(figure);
      }, () => finish(undefined));
    });
  }

  return () => loaded ?? (pending ??= startLoad());
}
