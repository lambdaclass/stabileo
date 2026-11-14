type Port = Pick<Worker, 'postMessage' | 'terminate'> & {
  onmessage: ((event: MessageEvent) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
};

/**
 * Request and answer over a worker, matched by token. A worker that reports an error is dropped
 * with every request it held answered by `failed`, so the next request starts a fresh one instead
 * of waiting on a worker that will never answer.
 */
export function workerChannel<Q, A>(create: () => Port, failed: (reason: string) => A) {
  let worker: Port | null = null;
  let sequence = 0;
  const pending = new Map<number, (answer: A) => void>();

  function drop(reason: string) {
    worker?.terminate();
    worker = null;
    for (const resolve of pending.values()) resolve(failed(reason));
    pending.clear();
  }

  function open(): Port {
    const port = create();
    port.onmessage = ({ data }: MessageEvent<{ token: number; outcome: A }>) => {
      pending.get(data.token)?.(data.outcome);
      pending.delete(data.token);
    };
    port.onerror = (event) => { if (worker === port) drop(event.message || 'worker error'); };
    return port;
  }

  return {
    post(message: Q): Promise<A> {
      worker ??= open();
      const port = worker;
      const token = ++sequence;
      return new Promise(resolve => {
        pending.set(token, resolve);
        port.postMessage({ ...message, token });
      });
    },
    close() {
      worker?.terminate();
      worker = null;
      pending.clear();
    },
  };
}
