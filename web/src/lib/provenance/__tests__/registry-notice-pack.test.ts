import { expect, it, vi } from 'vitest';
import { resultChangeMetadataPlugin } from '../../../../scripts/result-change-metadata.mjs';
import { readRegistry } from '../../../../scripts/result-changes/registry.mjs';
import translated from '../result-changes/plane-moving-concentrated-axial-forces.json';
import type { Localised, ResultChange } from '../registry';

vi.mock('../../../../scripts/result-changes/registry.mjs', () => ({ readRegistry: vi.fn() }));

const entry: ResultChange = { ...translated, area: 'analysis', resultsVersion: 1 };

function packNotice(change: ResultChange) {
  vi.mocked(readRegistry).mockReturnValue({ schema: 1, currentResultsVersion: 1, changes: [change] });
  const { load } = resultChangeMetadataPlugin();
  if (typeof load !== 'function') throw new Error('Missing result-change metadata load hook');
  return load.call({ addWatchFile: vi.fn() } as ThisParameterType<typeof load>, '\0virtual:result-change-packed');
}

it('refuses to pack a notice without its Chinese title or explanation', () => {
  const title: Partial<Localised> = { ...entry.title };
  delete title.zh;
  const explanation = { ...entry.explanation, zh: ' ' };
  expect(() => packNotice({ ...entry, title: title as Localised, explanation })).toThrow(
    'change plane-moving-concentrated-axial-forces: missing title.zh\nchange plane-moving-concentrated-axial-forces: missing explanation.zh',
  );
});

it('packs a fully translated notice without a research translation', () => {
  const { hu: _title, ...title } = entry.title;
  const { hu: _explanation, ...explanation } = entry.explanation;
  expect(packNotice({ ...entry, title, explanation })).toMatch(/^export default "[A-Za-z0-9+/=]+";$/);
});
