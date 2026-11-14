import { expect, it } from 'vitest';
import entry from '../result-changes/steel-cb-combination.json';
import { fieldCovered } from '../../../../scripts/results-snapshot/applicability.mjs';

it.skipIf(!process.env.RUN_KNOWN_WRONG)('known wrong result: #2080 — steel Cb notice covers member and steel result fields', () => {
  expect(entry).toMatchObject({ quantities: ['member', 'steel'] });
  for (const path of ['design.member[e12].ratio', 'design.steel[e12].engine.unityRatio', 'design.steel[e12].interaction.ratio']) {
    expect(fieldCovered(entry, path, ['steelCirsoc301']), path).toBe(true);
    expect(fieldCovered(entry, path, ['concreteMembers']), path).toBe(false);
  }
  expect(fieldCovered(entry, 'design.rc[e12].ratio', ['steelCirsoc301'])).toBe(false);
  expect(fieldCovered(entry, 'node[n1].dx', ['steelCirsoc301'])).toBe(false);
});
