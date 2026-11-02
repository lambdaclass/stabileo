import { expect, it } from 'vitest';
import { embeddedEditorUrl, fullEditorUrl, stripCompact } from '../open-in-stabileo';
import type { StripResult } from '../springs';

it('rejects prestress in both editor paths before encoding', async () => {
  const strip = { prestress_force: [0.1] } as StripResult;
  const label = { family: 'square', eta: 0, keep: 1, seed: 0, strain: 0.01 };
  expect(() => stripCompact(strip, 'prestressed')).toThrow('prestress');
  await expect(embeddedEditorUrl(strip, label)).rejects.toThrow('prestress');
  await expect(fullEditorUrl(strip, label)).rejects.toThrow('prestress');
});
