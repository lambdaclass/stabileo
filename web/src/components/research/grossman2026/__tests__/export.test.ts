import { expect, it } from 'vitest';
import { embeddedEditorUrl, fullEditorUrl, stripCompact, stripLabel } from '../open-in-stabileo';
import type { StripResult } from '../springs';

it('rejects prestress in both editor paths before encoding', async () => {
  const strip = { prestress_force: [0.1] } as StripResult;
  const label = { family: 'square', eta: 0, keep: 1, seed: 0, strain: 0.01 };
  expect(() => stripCompact(strip, 'prestressed')).toThrow('prestress');
  await expect(embeddedEditorUrl(strip, label)).rejects.toThrow('prestress');
  await expect(fullEditorUrl(strip, label)).rejects.toThrow('prestress');
});

it('keeps small strains and exact seeds in the saved label', () => {
  const text = stripLabel({ family: 'foam', eta: 0.25, keep: 0.875, seed: 12345678, strain: 0.0001 });
  expect(text).toContain('0.0001');
  expect(text).toContain('12,345,678');
  expect(text).toContain('0.875');
});
