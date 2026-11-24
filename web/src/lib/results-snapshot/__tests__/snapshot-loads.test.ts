import { runGroup } from '../run-group';

import { expect, it } from 'vitest';
import { CORPUS } from '../corpus';
import { captureSnow } from '../snow-capture';
import { compareValues } from '../../../../scripts/results-snapshot/compare.mjs';

runGroup('loads');

it.each([
  'snow-roof-step', 'snow-roof-rotation', 'snow-two-pitch',
])('#2218 %s records only the step drift refusal', name => {
  const snapshot = captureSnow(CORPUS.find(c => c.name === name)!);
  expect(snapshot.values).toEqual({
    'snowResult.refusal': 'Snow generation cannot transfer the drift at a roof step to its carrier members reliably. Define the snow loads explicitly.',
  });
});

it('every snow load piece is retained and a changed load fails comparison', () => {
  const snapshot = captureSnow(CORPUS.find(c => c.name === 'snow-subdivided-override')!);
  const members = Object.entries(snapshot.values).filter(([key, value]) =>
    key.startsWith('generatedLoads.item0.distributed.') && key.endsWith('.elementId') && value === 10);
  expect(members).toHaveLength(3);
  for (const [key] of members) {
    const path = key.replace(/elementId$/, 'q');
    const load = snapshot.values[path];
    expect(typeof load).toBe('number');
    const changed = { ...snapshot.values, [path]: (load as number) + 1 };
    expect(compareValues(snapshot.values, changed).differs).toBe(true);
  }
});
