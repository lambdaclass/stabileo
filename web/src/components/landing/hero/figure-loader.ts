export const FIGURE_LOAD_TIMEOUT_MS = 2000;

export function createFigureLoader<T>(load: () => Promise<T>): () => Promise<T | undefined> {
  let result: Promise<T | undefined> | undefined;

  async function loadOnce(): Promise<T | undefined> {
    let clearDeadline: (() => void) | undefined;
    const deadline = new Promise<undefined>((resolve) => {
      const timer = setTimeout(resolve, FIGURE_LOAD_TIMEOUT_MS);
      clearDeadline = () => clearTimeout(timer);
    });
    try {
      return await Promise.race([deadline, load()]);
    } catch {
      return undefined;
    } finally {
      clearDeadline?.();
    }
  }

  return () => result ??= loadOnce();
}
