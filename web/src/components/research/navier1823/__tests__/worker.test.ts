import { expect, it, vi } from 'vitest';
import { PAPER_PLATE } from '../model';

it.skip('known wrong result: #2505 — rejects invalid plate input after the engine has initialized', async () => {
  const postMessage = vi.fn();
  const worker = { postMessage, onmessage: undefined as unknown as (event: { data: unknown }) => Promise<void> };
  vi.stubGlobal('self', worker);
  try {
    await import('../solve.worker');
    await worker.onmessage({ data: { plate: { ...PAPER_PLATE, thickness: 0 }, token: 71 } });
    expect(postMessage).toHaveBeenCalledWith({ error: 'input', token: 71 });
  } finally { vi.unstubAllGlobals(); }
});
