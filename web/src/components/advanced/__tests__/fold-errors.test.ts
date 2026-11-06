import { expect, it, vi } from 'vitest';
import { render } from 'svelte/server';

vi.mock('../../../lib/engine/influence/analysis', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../lib/engine/influence/analysis')>()),
  readLine: () => { throw new Error('the loaded line could not be read'); },
}));

it('the loading fold says why the line could not be read instead of going blank', async () => {
  const { default: Fold } = await import('../InfluenceLoading.svelte');
  const unit = { nodes: new Map(), materials: new Map(), sections: new Map(), elements: new Map(), supports: new Map(), loads: [] };
  const body = render(Fold, { props: { il: { quantity: 'M', targetElementId: 1, targetPosition: 0.5, points: [] }, unit, loadedIds: [] } as never }).body;
  expect(body).toContain('data-testid="il-load-error"');
  expect(body).toContain('the loaded line could not be read');
  expect(body).not.toContain('data-testid="il-max"');
});
